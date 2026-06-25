/**
 * sync-pages.js — Scrape ou met à jour les pages du manifest.
 *
 * Usage:
 *   node sync/sync-pages.js              # met à jour les pages modifiées
 *   node sync/sync-pages.js --force      # re-scrape toutes les pages
 *   node sync/sync-pages.js --url=<url>  # re-scrape une URL spécifique
 *   node sync/sync-pages.js --check      # vérifie quelles pages ont changé (sans écrire)
 *
 * Pour chaque URL du manifest:
 *   1. Télécharge le HTML depuis la source
 *   2. Applique les sanitizations (badge, data-geo-*, JS local, etc.)
 *   3. Compare le hash avec la version stockée
 *   4. Si changé → sauvegarde et met à jour le manifest
 *   5. Pour role=template → met aussi à jour api/templates/meta.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { createHash } from 'crypto'
import { load } from 'cheerio'
import { URL } from 'url'
import { injectCmsSection } from './cms.js'

const MANIFEST_PATH = 'sync/manifest.json'
const STATE_PATH     = 'sync/.state.json'
const META_PATH      = 'api/templates/meta.json'
const OUT_CDN        = 'public/_cdn'

const FORCE    = process.argv.includes('--force')
const CHECK    = process.argv.includes('--check')
const URL_FLAG = process.argv.find(a => a.startsWith('--url='))?.split('=').slice(1).join('=')

const EXTERNAL_HOSTS = ['framerusercontent.com', 'fonts.gstatic.com', 'fonts.googleapis.com']
const FRAMER_COMMENT_RE = /<!--\s*(?:Made in Framer[^-]*?|Published [^-]*?)-->/g

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Accept': 'text/html,*/*',
  'Accept-Language': 'fr,en;q=0.9',
}

// ─── Shared state for CDN asset dedup ───────────────────────────────────────
let assetState = {}
try { if (existsSync(STATE_PATH)) assetState = JSON.parse(readFileSync(STATE_PATH, 'utf8')).assets || {} } catch {}
const assetDone = new Set(Object.keys(assetState))

function md5(content) { return createHash('md5').update(content).digest('hex') }
function ensureDir(fp) { const d = dirname(fp); if (!existsSync(d)) mkdirSync(d, { recursive: true }) }

// ─── Sanitization (same logic as scraper.js) ─────────────────────────────

function sanitizeJs(text) {
  text = text.replace(/(['"`])\.\/framer-/g, '$1./FRAMER_KEEP_')
  text = text.replace(/([`"'])framer-/g, '$1geo-')
  text = text.replace(/--framer-/g, '--geo-')
  text = text.replace(/\.framer-/g, '.geo-')
  text = text.replace(/__framer__/g, '__geo__')
  text = text.replace(/__framer_/g, '__geo_')
  text = text.replace(/framerAppearId/g, 'geoAppearId')
  text = text.replace(/(['"`])\.\/FRAMER_KEEP_/g, '$1./framer-')
  return text
}

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
    const c = $(el).html() || ''
    if (c.includes('__geo_force_showing_editorbar') || c.includes('__framer_force_showing_editorbar')) {
      $(el).remove()
    }
  })

  $('meta[name="generator"]').remove()
  $('meta[name="framer-search-index"], meta[name="framer-search-index-fallback"], meta[name="framer-html-plugin"]').remove()
  $('#__framer-badge-container, #__geo-badge-container').remove()

  const META_ATTRS = ['data-geo-generated-page','data-geo-ssr-released-at','data-geo-page-optimized-at',
                      'data-framer-generated-page','data-framer-ssr-released-at','data-framer-page-optimized-at']
  $('[data-geo-generated-page],[data-geo-ssr-released-at],[data-geo-page-optimized-at]').each((_, el) => {
    META_ATTRS.forEach(a => $(el).removeAttr(a))
  })

  const $t = $('title')
  if ($t.text().trim() === 'My Framer Site') $t.text('Geospherique')

  $('[class]').each((_, el) => {
    const orig = $(el).attr('class') || ''
    const renamed = orig.split(/\s+/).map(c => c.startsWith('framer-') ? 'geo-' + c.slice(7) : c).join(' ')
    if (renamed !== orig) $(el).attr('class', renamed)
  })
}

// ─── CDN asset download ───────────────────────────────────────────────────

async function syncAsset(rawUrl, baseUrl) {
  let absUrl
  try { absUrl = new URL(rawUrl, baseUrl).href } catch { return rawUrl }

  const u = new URL(absUrl)
  const isExternal = EXTERNAL_HOSTS.some(h => u.hostname.endsWith(h))
  if (!isExternal) return rawUrl

  const localPath = join(OUT_CDN, u.hostname, u.pathname.replace(/^\//, ''))
  const localRef  = '/_cdn/' + u.hostname + u.pathname

  if (!FORCE && assetDone.has(absUrl) && existsSync(localPath)) return localRef

  try {
    const res = await fetch(absUrl, { headers: HEADERS })
    if (!res.ok) return rawUrl

    const buf = Buffer.from(await res.arrayBuffer())
    const ext = u.pathname.split('.').pop()
    const isScript = ['js','mjs','cjs'].includes(ext)

    ensureDir(localPath)
    if (isScript) {
      writeFileSync(localPath, sanitizeJs(buf.toString('utf8')), 'utf8')
    } else {
      writeFileSync(localPath, buf)
    }
    assetState[absUrl] = md5(buf)
    assetDone.add(absUrl)
    console.log(`    ↓ ${u.pathname}`)
  } catch (e) {
    console.warn(`    ⚠ asset ${absUrl} — ${e.message}`)
    return rawUrl
  }
  return localRef
}

// ─── Single URL scrape ────────────────────────────────────────────────────

async function scrapePage(sourceUrl, entry) {
  console.log(`  ↓  ${sourceUrl}`)

  const res = await fetch(sourceUrl, { headers: HEADERS })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  let html = await res.text()
  html = html.replace(FRAMER_COMMENT_RE, '')
  html = sanitizeHtmlStr(html)

  const $ = load(html)
  sanitizeHtml($)

  // Rewrite assets to local CDN
  const jobs = []
  $('script[src]').each((_, el) => {
    const src = $(el).attr('src')
    if (src) jobs.push(syncAsset(src, sourceUrl).then(r => $(el).attr('src', r)))
  })
  $('link[href]').each((_, el) => {
    const href = $(el).attr('href')
    if (href) jobs.push(syncAsset(href, sourceUrl).then(r => $(el).attr('href', r)))
  })
  $('img[src]').each((_, el) => {
    const src = $(el).attr('src')
    if (src) jobs.push(syncAsset(src, sourceUrl).then(r => $(el).attr('src', r)))
  })
  await Promise.allSettled(jobs)

  // CMS injection for list/folder pages
  const pathname = new URL(sourceUrl).pathname
  let finalHtml = $.html()
  if (entry.role === 'folder' || entry.role === 'page' || entry.role === 'home') {
    finalHtml = await injectCmsSection(finalHtml, pathname)
  }

  return finalHtml
}

// ─── Template metadata extraction ────────────────────────────────────────

function extractTemplateMeta(html, templateName, postType) {
  const pvMatch = html.match(/pathVariables&quot;:\{&quot;([^&]+)&quot;:&quot;([^&]+)&quot;\}/)
  let pathVariablesKey = pvMatch ? pvMatch[1] : null
  let defaultSlug      = pvMatch ? pvMatch[2] : null

  if (!defaultSlug) {
    const m = html.match(/"string","([^"]+)",\{"type":6,"value":9\}/)
    if (m) defaultSlug = m[1]
  }

  const titleMatch = html.match(/"string","([^"]+)",\{"type":6,"value":9\}/)
  const defaultTitle = titleMatch ? titleMatch[1] : ''

  return { postType, defaultSlug, defaultTitle, pathVariablesKey }
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  if (!existsSync(MANIFEST_PATH)) {
    console.log('Manifest vide. Ajoutez des pages avec: node sync/add-page.js <url> --role=<role>')
    process.exit(0)
  }

  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
  const pages = manifest.pages || {}

  let targets = Object.entries(pages)
  if (URL_FLAG) {
    targets = targets.filter(([url]) => url === URL_FLAG)
    if (!targets.length) { console.error(`URL non trouvée dans le manifest: ${URL_FLAG}`); process.exit(1) }
  }

  if (!targets.length) {
    console.log('Aucune page dans le manifest. Ajoutez-en avec: node sync/add-page.js <url> --role=<role>')
    process.exit(0)
  }

  console.log(`\n🔄  Sync pages${CHECK ? ' (check seulement)' : ''}${URL_FLAG ? ' — ' + URL_FLAG : ''}\n`)

  let updated = 0
  let unchanged = 0
  let failed = 0
  const metaUpdates = {}

  for (const [sourceUrl, entry] of targets) {
    try {
      const html = await scrapePage(sourceUrl, entry)
      const hash = md5(html)

      if (!FORCE && !CHECK && entry.hash === hash) {
        console.log(`  = ${sourceUrl}`)
        unchanged++
        continue
      }

      if (CHECK) {
        if (entry.hash !== hash) {
          console.log(`  ≠ ${sourceUrl} (modifié)`)
          updated++
        } else {
          console.log(`  = ${sourceUrl}`)
          unchanged++
        }
        continue
      }

      // Write file
      ensureDir(entry.localPath)
      writeFileSync(entry.localPath, html, 'utf8')

      // Update manifest entry
      manifest.pages[sourceUrl] = {
        ...entry,
        hash,
        lastSync: new Date().toISOString(),
      }

      // Update template meta if needed
      if (entry.role === 'template' && entry.templateName) {
        const postType = entry.postType || entry.templateName
        metaUpdates[entry.templateName] = extractTemplateMeta(html, postType, postType)
      }

      console.log(`  ✓ ${sourceUrl} → ${entry.localPath}`)
      updated++
    } catch (e) {
      console.warn(`  ✗ ${sourceUrl} — ${e.message}`)
      failed++
    }
  }

  if (!CHECK) {
    // Save manifest
    writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8')

    // Update template meta.json
    if (Object.keys(metaUpdates).length > 0) {
      let existingMeta = {}
      try { existingMeta = JSON.parse(readFileSync(META_PATH, 'utf8')) } catch {}
      for (const [name, meta] of Object.entries(metaUpdates)) {
        existingMeta[name] = meta
      }
      writeFileSync(META_PATH, JSON.stringify(existingMeta, null, 2), 'utf8')
      console.log(`\n  ✓ meta.json mis à jour: ${Object.keys(metaUpdates).join(', ')}`)
    }

    // Save asset state
    try {
      const state = existsSync(STATE_PATH) ? JSON.parse(readFileSync(STATE_PATH, 'utf8')) : {}
      state.assets = assetState
      writeFileSync(STATE_PATH, JSON.stringify(state, null, 2))
    } catch {}
  }

  console.log(`\n✅  ${updated} mis à jour, ${unchanged} inchangés${failed ? ', ' + failed + ' erreurs' : ''}`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(e => { console.error('Fatal:', e); process.exit(2) })
