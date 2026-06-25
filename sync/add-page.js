/**
 * add-page.js — Enregistre une URL dans le manifest avec un rôle.
 *
 * Usage:
 *   node sync/add-page.js <url> --role=<role> [options]
 *
 * Rôles disponibles:
 *   home       → public/index.html
 *   404        → public/404.html
 *   page       → public/<slug>/index.html
 *   folder     → public/<slug>/index.html  (page contenant des collections)
 *   template   → api/templates/<name>.html (nécessite --template-name=<name>)
 *
 * Options:
 *   --local-path=<path>      Chemin local personnalisé (override auto)
 *   --template-name=<name>   Nom du template (pour role=template)
 *
 * Exemples:
 *   node sync/add-page.js https://iiadil.framer.website/ --role=home
 *   node sync/add-page.js https://iiadil.framer.website/formations --role=folder
 *   node sync/add-page.js https://iiadil.framer.website/formations/une-vie --role=template --template-name=formation
 *   node sync/add-page.js https://iiadil.framer.website/about --role=page
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { URL } from 'url'

const MANIFEST_PATH = 'sync/manifest.json'
const VALID_ROLES = ['home', '404', 'page', 'folder', 'template']

function parseArgs() {
  const args = process.argv.slice(2)
  const url = args.find(a => a.startsWith('http'))
  const flags = {}
  args.filter(a => a.startsWith('--')).forEach(a => {
    const [k, v] = a.slice(2).split('=')
    flags[k] = v || true
  })
  return { url, flags }
}

function autoLocalPath(url, role, templateName) {
  const u = new URL(url)
  const pathname = decodeURIComponent(u.pathname).replace(/\/$/, '') || '/'

  switch (role) {
    case 'home':     return 'public/index.html'
    case '404':      return 'public/404.html'
    case 'template': return `api/templates/${templateName || 'formation'}.html`
    case 'page':
    case 'folder': {
      const slug = pathname === '/' ? 'index' : pathname.replace(/^\//, '').replace(/\//g, '-')
      return `public/${slug}/index.html`
    }
    default:         return null
  }
}

function loadManifest() {
  if (!existsSync(MANIFEST_PATH)) return { pages: {} }
  try { return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) } catch { return { pages: {} } }
}

function saveManifest(m) {
  writeFileSync(MANIFEST_PATH, JSON.stringify(m, null, 2), 'utf8')
}

const { url, flags } = parseArgs()

if (!url) {
  console.error('Usage: node sync/add-page.js <url> --role=<role> [--template-name=<name>]')
  console.error('Rôles: ' + VALID_ROLES.join(', '))
  process.exit(1)
}

const role = flags.role
if (!role || !VALID_ROLES.includes(role)) {
  console.error(`Rôle invalide: "${role}". Valeurs acceptées: ${VALID_ROLES.join(', ')}`)
  process.exit(1)
}

if (role === 'template' && !flags['template-name']) {
  console.error('--template-name requis pour role=template (ex: --template-name=formation)')
  process.exit(1)
}

const localPath = flags['local-path'] || autoLocalPath(url, role, flags['template-name'])
if (!localPath) {
  console.error('Impossible de déterminer le chemin local. Utilisez --local-path=<path>')
  process.exit(1)
}

const manifest = loadManifest()

const existing = manifest.pages[url]
const entry = {
  role,
  localPath,
  ...(role === 'template' ? { templateName: flags['template-name'] } : {}),
  hash: existing?.hash || null,
  lastSync: existing?.lastSync || null,
  addedAt: existing?.addedAt || new Date().toISOString(),
}

manifest.pages[url] = entry
saveManifest(manifest)

const icon = existing ? '✏' : '+'
console.log(`${icon} ${url}`)
console.log(`  rôle       : ${role}`)
console.log(`  localPath  : ${localPath}`)
if (role === 'template') console.log(`  template   : ${flags['template-name']}`)
console.log(`\nManifest mis à jour. Lancez "npm run sync:pages" pour scraper.`)
