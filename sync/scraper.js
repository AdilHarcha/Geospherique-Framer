$utf8NoBOM = New-Object System.Text.UTF8Encoding $false
$scraper = @'
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
try {
  if (existsSync(STATE_FILE)) state = JSON.parse(readFileSync(STATE_FILE, 'utf8'))
} catch {}

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
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
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

async function syncAsset(rawUrl, pageUrl) {
  let absUrl
  try { absUrl = new URL(rawUrl, pageUrl).href } catch { return rawUrl }
  const localPath = assetToLocalPath(absUrl)
  if (!localPath) return rawUrl
  try {
    const buf = await fetchBuf(absUrl)
    const h = md5(buf)
    if (!FORCE && state.assets[absUrl] === h) return localRef(absUrl)
    ensureDir(localPath)
    writeFileSync(localPath, buf)
    state.assets[absUrl] = h
    changed = true
    console.log(`  ↓ asset: ${new URL(absUrl).pathname}`)
  } catch (e) {
    console.warn(`  ⚠ asset failed: ${absUrl} — ${e.message}`)
  }
  return localRef(absUrl)
}

async function scrapePage(pathname, visited, queue) {
  const pageUrl = BASE_URL + pathname
  try {
    const html = await fetchText(pageUrl)
    const $ = load(html)
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

    // Réécriture des liens <a> internes + découverte des routes
    $('a[href]').each((_, el) => {
      try {
        const abs = new URL($(el).attr('href') || '', pageUrl)
        if (abs.hostname === new URL(BASE_URL).hostname) {
          // Réécrire en chemin relatif
          $(el).attr('href', abs.pathname + abs.search + abs.hash)
          if (!visited.has(abs.pathname)) queue.push(abs.pathname)
        }
      } catch {}
    })

    await Promise.allSettled(jobs)

    const rewritten = $.html()
    const h = md5(rewritten)
    const filePath = routeToFile(pathname)

    if (!FORCE && state.pages[pathname] === h && existsSync(filePath)) {
      console.log(`  = inchangé: ${pathname}`)
      return
    }

    ensureDir(filePath)
    writeFileSync(filePath, rewritten, 'utf8')
    state.pages[pathname] = h
    changed = true
    console.log(`  ✓ page: ${pathname}`)

  } catch (e) {
    console.warn(`  ✗ page failed: ${pathname} — ${e.message}`)
  }
}

async function main() {
  console.log(`\n🔄  Framer Sync — ${BASE_URL}\n`)
  const queue = ['/']
  const visited = new Set()

  try {
    const sitemap = await fetchText(BASE_URL + '/sitemap.xml')
    for (const m of sitemap.matchAll(/<loc>(.*?)<\/loc>/g)) {
      try {
        const p = new URL(m[1]).pathname
        if (!visited.has(p)) queue.push(p)
      } catch {}
    }
    console.log(`  📋 sitemap: ${queue.length} routes trouvées\n`)
  } catch {
    console.log('  📋 pas de sitemap.xml — crawl depuis la homepage\n')
  }

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
    console.log(`\n✅  Sync terminé — ${pages} pages, ${assets} assets`)
    process.exit(1)
  } else {
    console.log(`\n✅  Aucun changement (${pages} pages, ${assets} assets)`)
    process.exit(0)
  }
}

main().catch(e => { console.error('Fatal:', e); process.exit(2) })
'@
[System.IO.File]::WriteAllText((Resolve-Path "sync\scraper.js"), $scraper, $utf8NoBOM)
git add sync/scraper.js
git commit -m "fix: réécriture liens <a> internes"
git push origin main
