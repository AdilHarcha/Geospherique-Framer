import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs'
import { join, extname, dirname } from 'path'
import { createHash } from 'crypto'
import { load } from 'cheerio'
import { URL } from 'url'

const BASE_URL = 'https://iiadil.framer.website'
const OUT_DIR = 'public'
const STATE_FILE = 'sync/.state.json'
const FORCE = process.argv.includes('--force')
const EXTERNAL_HOSTS = ['framerusercontent.com', 'fonts.gstatic.com', 'fonts.googleapis.com']

let state = { pages: {}, assets: {} }
try { if (existsSync(STATE_FILE)) state = JSON.parse(readFileSync(STATE_FILE, 'utf8')) } catch {}

function md5(content) { return createHash('md5').update(content).digest('hex') }
function ensureDir(fp) { const d = dirname(fp); if (!existsSync(d)) mkdirSync(d, { recursive: true }) }

function routeToFile(pathname) {
  if (pathname === '/' || pathname === '') return join(OUT_DIR, 'index.html')
  const clean = pathname.replace(/^\/|\/$/, '')
  if (!extname(clean)) return join(OUT_DIR, clean, 'index.html')
  return join(OUT_DIR, clean)
}

function assetToLocalPath(absUrl) {
  try {
    const p = new URL(absUrl)
    if (p.hostname === new URL(BASE_URL).hostname) return join(OUT_DIR, p.pathname.replace(/^\//, '') || 'index.html')
    if (EXTERNAL_HOSTS.some(h => p.hostname.endsWith(h))) return join(OUT_DIR, '_cdn', p.hostname, p.pathname.replace(/^\//, ''))
  } catch {}
  return null
}

function localRef(absUrl) {
  try {
    const p = new URL(absUrl)
    if (p.hostname === new URL(BASE_URL).hostname) return p.pathname || '/'
    if (EXTERNAL_HOSTS.some(h => p.hostname.endsWith(h))) return '/_cdn/' + p.hostname + p.pathname
  } catch {}
  return absUrl
}

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Accept': '*/*',
  'Accept-Language': 'fr,en;q=0.9',
}

async function fetchText(url) {
  const res = await fetch(url, { headers: HEADERS })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

async function fetchBuf(url) {
  const res = await fetch(url, { headers: HEADERS })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

let changed = false
const assetQueue = new Set()
const assetDone = new Set()

function extractJsUrls(content) {
  const urls = []
  const re = /https:\/\/(?:[\w.-]+\.)?framerusercontent\.com\/[^\s"'`\\)>]+/g
  for (const m of content.matchAll(re)) {
    try { urls.push(new URL(m[0]).href) } catch {}
  }
  return urls
}

async function syncAsset(rawUrl, baseUrl) {
  let absUrl
  try { absUrl = new URL(rawUrl, baseUrl).href } catch { return rawUrl }

  const localPath = assetToLocalPath(absUrl)
  if (!localPath) return rawUrl
  if (assetDone.has(absUrl)) return localRef(absUrl)
  assetDone.add(absUrl)

  try {
    const buf = await fetchBuf(absUrl)
    const h = md5(buf)
    if (!FORCE && state.assets[absUrl] === h && existsSync(localPath)) return localRef(absUrl)

    ensureDir(localPath)
    writeFileSync(localPath, buf)
    state.assets[absUrl] = h
    changed = true
    console.log(`  ↓ ${new URL(absUrl).pathname}`)

    const ext = new URL(absUrl).pathname.split('.').pop()
    if (['js', 'mjs', 'cjs'].includes(ext)) {
      const text = buf.toString('utf8')
      for (const url of extractJsUrls(text)) {
        if (!assetDone.has(url)) assetQueue.add(url)
      }
    }
  } catch (e) {
    console.warn(`  ⚠ ${absUrl} — ${e.message}`)
  }
  return localRef(absUrl)
}

async function drainAssetQueue() {
  while (assetQueue.size > 0) {
    const batch = [...assetQueue]
    assetQueue.clear()
    await Promise.allSettled(batch.map(url => syncAsset(url, url)))
  }
}

const FRAMER_COMMENT_RE = /<!--\s*(?:Made in Framer[^-]*?|Published [^-]*?)-->/g

function sanitizeHtml($) {

  // Supprimer le script tracker events.framer.com
  $('script[src*="events.framer.com"]').remove()

  // Supprimer le script de la barre d'édition Framer (inline, contient __framer_force_showing_editorbar_since)
  $('script:not([src])').each((_, el) => {
    if ($(el).html().includes('__framer_force_showing_editorbar_since')) $(el).remove()
  })

  // Supprimer la meta generator Framer
  $('meta[name="generator"]').remove()

  // Supprimer le badge Framer
  $('#__framer-badge-container').remove()

  // Supprimer les attributs metadata Framer non fonctionnels sur tous les éléments
  const FRAMER_META_ATTRS = ['data-framer-generated-page', 'data-framer-ssr-released-at', 'data-framer-page-optimized-at']
  $('[data-framer-generated-page], [data-framer-ssr-released-at], [data-framer-page-optimized-at]').each((_, el) => {
    FRAMER_META_ATTRS.forEach(attr => $(el).removeAttr(attr))
  })

  // Remplacer title par défaut Framer
  const $title = $('title')
  if ($title.text().trim() === 'My Framer Site') $title.text('Geospherique')

  // Remplacer les metas description/og/twitter avec valeurs par défaut Framer
  const defaultDesc = 'Made with Framer'
  const defaultTitle = 'My Framer Site'
  const brandDesc = 'Geospherique — Une vision à votre portée'
  const brandTitle = 'Geospherique'

  $('meta[name="description"]').each((_, el) => {
    if ($(el).attr('content') === defaultDesc) $(el).attr('content', brandDesc)
  })
  $('meta[property="og:title"]').each((_, el) => {
    if ($(el).attr('content') === defaultTitle) $(el).attr('content', brandTitle)
  })
  $('meta[property="og:description"]').each((_, el) => {
    if ($(el).attr('content') === defaultDesc) $(el).attr('content', brandDesc)
  })
  $('meta[name="twitter:title"]').each((_, el) => {
    if ($(el).attr('content') === defaultTitle) $(el).attr('content', brandTitle)
  })
  $('meta[name="twitter:description"]').each((_, el) => {
    if ($(el).attr('content') === defaultDesc) $(el).attr('content', brandDesc)
  })
}

async function scrapePage(pathname, visited, queue) {
  const pageUrl = BASE_URL + pathname
  try {
    let html = await fetchText(pageUrl)
    html = html.replace(FRAMER_COMMENT_RE, '')
    const $ = load(html)
    sanitizeHtml($)
    const jobs = []

    $('script[src]').each((_, el) => {
      const src = $(el).attr('src')
      if (src) jobs.push(syncAsset(src, pageUrl).then(r => $(el).attr('src', r)))
    })
    $('link[href]').each((_, el) => {
      const href = $(el).attr('href')
      if (href) jobs.push(syncAsset(href, pageUrl).then(r => $(el).attr('href', r)))
    })
    $('img[src]').each((_, el) => {
      const src = $(el).attr('src')
      if (src) jobs.push(syncAsset(src, pageUrl).then(r => $(el).attr('src', r)))
    })
    $('a[href]').each((_, el) => {
      try {
        const abs = new URL($(el).attr('href') || '', pageUrl)
        if (abs.hostname === new URL(BASE_URL).hostname) {
          $(el).attr('href', abs.pathname + abs.search + abs.hash)
          if (!visited.has(abs.pathname)) queue.push(abs.pathname)
        }
      } catch {}
    })

    await Promise.allSettled(jobs)
    await drainAssetQueue()

    const rewritten = $.html()
    const h = md5(rewritten)
    const filePath = routeToFile(pathname)

    if (!FORCE && state.pages[pathname] === h && existsSync(filePath)) {
      console.log(`  = ${pathname}`)
      return
    }

    ensureDir(filePath)
    writeFileSync(filePath, rewritten, 'utf8')
    state.pages[pathname] = h
    changed = true
    console.log(`  ✓ page: ${pathname}`)
  } catch (e) {
    console.warn(`  ✗ ${pathname} — ${e.message}`)
  }
}

async function main() {
  console.log(`\n🔄  Framer Sync — ${BASE_URL}\n`)
  const queue = ['/']
  const visited = new Set()

  try {
    const sitemap = await fetchText(BASE_URL + '/sitemap.xml')
    for (const m of sitemap.matchAll(/<loc>(.*?)<\/loc>/g)) {
      try { const p = new URL(m[1]).pathname; if (!visited.has(p)) queue.push(p) } catch {}
    }
    console.log(`  📋 sitemap: ${queue.length} routes\n`)
  } catch { console.log('  📋 pas de sitemap\n') }

  while (queue.length) {
    const p = queue.shift()
    if (visited.has(p)) continue
    visited.add(p)
    await scrapePage(p, visited, queue)
  }

  ensureDir(STATE_FILE)
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))

  const pages = Object.keys(state.pages).length
  const assets = Object.keys(state.assets).length
  if (changed) {
    console.log(`\n✅  ${pages} pages, ${assets} assets`)
    process.exit(1)
  } else {
    console.log(`\n✅  Aucun changement`)
    process.exit(0)
  }
}

main().catch(e => { console.error('Fatal:', e); process.exit(2) })
