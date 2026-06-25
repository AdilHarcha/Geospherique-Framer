/**
 * scrape-templates.js
 *
 * Télécharge un item de chaque collection CMS Framer, applique les mêmes
 * sanitizations que scraper.js (badge, data-framer-* → data-geo-*, JS local),
 * extrait les métadonnées d'injection (slug, pathVariables key), et sauvegarde
 * dans api/templates/.
 *
 * Usage :
 *   node sync/scrape-templates.js           # scrape depuis la source Framer
 *   node sync/scrape-templates.js --local   # re-sanitize les templates existants sans réseau
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { load } from 'cheerio'
import { URL } from 'url'

const BASE_URL  = 'https://iiadil.framer.website'
const OUT_DIR   = 'api/templates'
const LOCAL_CDN = 'public/_cdn'
const LOCAL_MODE = process.argv.includes('--local')

// Un item représentatif par type de page CMS
const TEMPLATES = [
  {
    name: 'formation',
    sourceUrl: '/geospherique-listes/partager-un-savoir/une-vie',
    postType: 'formation',
  },
  {
    name: 'traversee',
    sourceUrl: '/les-travers%C3%A9es-de-geospherique/wx3byC5qe',
    postType: 'traversée',
  },
]

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Accept': 'text/html,*/*',
  'Accept-Language': 'fr,en;q=0.9',
}

const FRAMER_COMMENT_RE = /<!--\s*(?:Made in Framer[^-]*?|Published [^-]*?)-->/g

function sanitizeHtmlStr(html) {
  return html
    .replace(/data-framer-/g, 'data-geo-')
    .replace(/--framer-/g, '--geo-')
    .replace(/\.framer-/g, '.geo-')
    .replace(/__framer__/g, '__geo__')
    .replace(/__framer_/g, '__geo_')
    .replace(/framerAppearId/g, 'geoAppearId')
    .replace(/type="framer\/appear"/g, 'type="geo/appear"')
    .replace(/type="framer\/handover"/g, 'type="geo/handover"')
}

function sanitizeHtml($) {
  $('script[src*="events.framer.com"]').remove()
  $('script[src*="events.geo.com"]').remove()

  $('script:not([src])').each((_, el) => {
    const content = $(el).html() || ''
    if (content.includes('__geo_force_showing_editorbar') ||
        content.includes('__framer_force_showing_editorbar')) {
      $(el).remove()
    }
  })

  $('meta[name="generator"]').remove()
  $('meta[name="framer-search-index"]').remove()
  $('meta[name="framer-search-index-fallback"]').remove()
  $('meta[name="framer-html-plugin"]').remove()

  // Badge Framer (après sanitizeHtmlStr, l'id devient __geo-badge-container)
  $('#__framer-badge-container, #__geo-badge-container').remove()

  const GEO_META_ATTRS = [
    'data-geo-generated-page',
    'data-geo-ssr-released-at',
    'data-geo-page-optimized-at',
    'data-framer-generated-page',
    'data-framer-ssr-released-at',
    'data-framer-page-optimized-at',
  ]
  $('[data-geo-generated-page], [data-geo-ssr-released-at], [data-geo-page-optimized-at]').each((_, el) => {
    GEO_META_ATTRS.forEach(a => $(el).removeAttr(a))
  })

  // Remplacer le title Framer par défaut
  const $title = $('title')
  if ($title.text().trim() === 'My Framer Site') $title.text('Geospherique')

  // Renommer les classes CSS framer-HASH → geo-HASH
  $('[class]').each((_, el) => {
    const orig = $(el).attr('class') || ''
    const renamed = orig.split(/\s+/)
      .map(c => c.startsWith('framer-') ? 'geo-' + c.slice(7) : c)
      .join(' ')
    if (renamed !== orig) $(el).attr('class', renamed)
  })
}

function rewriteAssetsToLocal($, baseUrl) {
  function localise(rawUrl) {
    try {
      const u = new URL(rawUrl, baseUrl)
      const isFramer = u.hostname.endsWith('framerusercontent.com') ||
                       u.hostname.endsWith('fonts.gstatic.com') ||
                       u.hostname.endsWith('fonts.googleapis.com')
      if (isFramer) return '/_cdn/' + u.hostname + u.pathname
    } catch {}
    return rawUrl
  }

  $('script[src]').each((_, el) => { const s=$(el).attr('src'); if(s) $(el).attr('src', localise(s)) })
  $('link[href]').each((_, el) => { const h=$(el).attr('href'); if(h) $(el).attr('href', localise(h)) })
  $('img[src]').each((_, el) => { const s=$(el).attr('src'); if(s) $(el).attr('src', localise(s)) })
}

function extractMeta($, html) {
  // pathVariables key: chercher dans data-geo-hydrate-v2 (après renommage)
  // Exemple: pathVariables&quot;:{&quot;AcrJ3wURO&quot;:&quot;une-vie&quot;}
  // Pattern: pathVariables&quot;:{&quot;KEY&quot;:&quot;SLUG&quot;}
  const pathVarMatch = html.match(/pathVariables&quot;:\{&quot;([^&]+)&quot;:&quot;([^&]+)&quot;\}/)
  const pathVariablesKey = pathVarMatch ? pathVarMatch[1] : null
  let   defaultSlug      = pathVarMatch ? pathVarMatch[2] : null

  // Fallback : slug depuis handoverData "string","<slug>",{"type":6,"value":9}
  if (!defaultSlug) {
    const slashMatch = html.match(/"string","([^"]+)",\{"type":6,"value":9\}/)
    if (slashMatch) defaultSlug = slashMatch[1]
  }

  // Title depuis handoverData : "string","<TITLE>",{"type":6,"value":9}
  const titleMatch = html.match(/"string","([^"]+)",\{"type":6,"value":9\}/)
  const title = titleMatch ? titleMatch[1] : ''

  return { pathVariablesKey, defaultSlug, defaultTitle: title }
}

async function processTemplate(tpl) {
  let rawHtml

  if (LOCAL_MODE) {
    const p = join(OUT_DIR, `${tpl.name}.html`)
    if (!existsSync(p)) { console.warn(`  ⚠ ${tpl.name}.html introuvable, skipped`); return }
    rawHtml = readFileSync(p, 'utf8')
    console.log(`  ♻  ${tpl.name} — re-sanitize local`)
  } else {
    const url = BASE_URL + tpl.sourceUrl
    console.log(`  ↓  ${tpl.name} ← ${url}`)
    const res = await fetch(url, { headers: HEADERS })
    if (!res.ok) { console.warn(`  ✗ HTTP ${res.status}`); return }
    rawHtml = await res.text()
  }

  // Supprimer commentaires Framer
  rawHtml = rawHtml.replace(FRAMER_COMMENT_RE, '')

  // Sanitization chaîne
  rawHtml = sanitizeHtmlStr(rawHtml)

  // Sanitization DOM
  const $ = load(rawHtml)
  sanitizeHtml($)

  // Réécriture des assets vers /_cdn/ local
  rewriteAssetsToLocal($, BASE_URL + tpl.sourceUrl)

  const finalHtml = $.html()

  // Extraire les métadonnées
  const meta = extractMeta($, finalHtml)

  // Sauvegarder le template
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(join(OUT_DIR, `${tpl.name}.html`), finalHtml, 'utf8')
  console.log(`  ✓ ${tpl.name}.html — slug="${meta.defaultSlug}", pathKey="${meta.pathVariablesKey}"`)

  return { name: tpl.name, postType: tpl.postType, ...meta }
}

async function main() {
  console.log(`\n🔄  Template Sync — ${LOCAL_MODE ? 'mode local' : BASE_URL}\n`)

  const results = []
  for (const tpl of TEMPLATES) {
    const m = await processTemplate(tpl)
    if (m) results.push(m)
  }

  if (results.length === 0) return

  // Lire le meta.json existant pour ne pas écraser les entrées non mises à jour
  const metaPath = join(OUT_DIR, 'meta.json')
  let existing = {}
  try { existing = JSON.parse(readFileSync(metaPath, 'utf8')) } catch {}

  for (const r of results) {
    existing[r.name] = {
      postType:        r.postType,
      defaultSlug:     r.defaultSlug,
      defaultTitle:    r.defaultTitle,
      pathVariablesKey: r.pathVariablesKey,
    }
  }

  writeFileSync(metaPath, JSON.stringify(existing, null, 2), 'utf8')
  console.log(`\n✅  meta.json mis à jour`)
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
