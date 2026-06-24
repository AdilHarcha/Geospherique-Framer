import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://boszjuorhmpgzultsanu.supabase.co'
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJvc3pqdW9yaG1wZ3p1bHRzYW51Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1ODczODQsImV4cCI6MjA4NDE2MzM4NH0.D3gP76reh7U_g0RqJm_RV3u0232HDv9HikqnYAeBJhc'

// Canonical base URL (no trailing slash)
const SITE_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : 'https://geospherique.vercel.app'

const TYPE_PATH = {
  formation: '/geospherique-listes/partager-un-savoir',
  atelier:   '/partager-un-savoir/geospherique-partages',
  outil:     '/partager-un-savoir/geospherique-tools',
  traversée: '/les-traversées-de-geospherique',
}

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim().replace(/\s+/g, '-')
}

function escapeAttr(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

async function fetchPost(slug) {
  const url = `${SUPABASE_URL}/rest/v1/partner_posts?slug=eq.${encodeURIComponent(slug)}&status=eq.published&select=id,title,h1,meta_description,main_image,thematique,post_type,slug,published_at&limit=1`
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  })
  if (!res.ok) return null
  const rows = await res.json()
  return rows[0] || null
}

function loadTemplate(postType) {
  const name = postType === 'traversée' ? 'traversee' : 'formation'
  const templatePath = join(__dirname, 'templates', `${name}.html`)
  return readFileSync(templatePath, 'utf8')
}

// Template placeholder values (from scraped sample posts)
const TEMPLATE_DEFAULTS = {
  formation: {
    title:    'Une vie',
    slug:     'une-vie',
    thematique_text: "Art d'une vie",
    thematique_slug: 'art-d-une-vie',
    thematique_long_slug: 'geospherique-d-une-vie',
    thematique_name: "Geospherique d'une vie",
    canonical: 'https://iiadil.framer.website/geospherique-listes/partager-un-savoir/une-vie',
  },
  traversee: {
    title:    'ba',
    slug:     'wx3byC5qe',
    thematique_text: "Art d'une vie",
    thematique_slug: 'art-d-une-vie',
    thematique_long_slug: 'geospherique-d-une-vie',
    thematique_name: "Geospherique d'une vie",
    canonical: 'https://iiadil.framer.website/les-travers%C3%A9es-de-geospherique/ba',
  },
}

function injectPost(html, post, postType) {
  const isTraversee = postType === 'traversée'
  const defaults = isTraversee ? TEMPLATE_DEFAULTS.traversee : TEMPLATE_DEFAULTS.formation

  const title       = post.h1 || post.title || ''
  const slug        = post.slug || ''
  const desc        = post.meta_description || ''
  const thematique  = post.thematique || defaults.thematique_text
  const themSlug    = slugify(thematique)
  const themLong    = 'geospherique-' + themSlug
  const basePath    = TYPE_PATH[postType] || TYPE_PATH.formation
  const canonicalUrl = SITE_URL + basePath + '/' + encodeURIComponent(slug)

  // 1. Meta tags in <head>
  html = html
    .replace('<title>My Framer Site</title>', `<title>${escapeAttr(title)} — Géosphérique</title>`)
    .replace(/(<meta name="description" content=")Made with Framer(")/g, `$1${escapeAttr(desc)}$2`)
    .replace(/(<meta property="og:title" content=")My Framer Site(")/g, `$1${escapeAttr(title)}$2`)
    .replace(/(<meta property="og:description" content=")Made with Framer(")/g, `$1${escapeAttr(desc)}$2`)
    .replace(/(<meta name="twitter:title" content=")My Framer Site(")/g, `$1${escapeAttr(title)}$2`)
    .replace(/(<meta name="twitter:description" content=")Made with Framer(")/g, `$1${escapeAttr(desc)}$2`)

  // 2. Canonical URL
  html = html.replace(
    new RegExp(`(<link rel="canonical" href=")[^"]*(")`),
    `$1${escapeAttr(canonicalUrl)}$2`
  )
  html = html.replace(
    new RegExp(`(<meta property="og:url" content=")[^"]*(")`),
    `$1${escapeAttr(canonicalUrl)}$2`
  )

  // 3. Post title in Framer handoverData (exactly once)
  //    Pattern: "string","<TITLE>",{"type":6,"value":9},"<SLUG>",null
  html = html.replace(
    `"string","${defaults.title}",`,
    `"string","${title.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}",`
  )

  // 4. Post slug in handoverData (the one right after the title string)
  //    Pattern: {"type":6,"value":9},"<SLUG>",null
  html = html.replace(
    `{"type":6,"value":9},"${defaults.slug}",null`,
    `{"type":6,"value":9},"${slug}",null`
  )

  // 5. Post slug in path condition in handoverData
  //    Pattern: \\"value\\":\\"<SLUG>\\"
  html = html.replace(
    `\\"value\\":\\"${defaults.slug}\\"`,
    `\\"value\\":\\"${slug}\\"`
  )

  // 6. Thematique display name in handoverData
  html = html.replace(
    new RegExp(`"${defaults.thematique_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'g'),
    `"${thematique.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  )

  // 7. Thematique long slug in handoverData + SSR HTML (IDs, hrefs)
  html = html.replace(new RegExp(defaults.thematique_long_slug, 'g'), themLong)

  // 8. Thematique short slug in anchor hrefs in SSR HTML
  //    Only replace in the context: art-d-une-vie">Art d'une vie
  //    to avoid collateral damage in unrelated hrefs
  html = html.replace(
    new RegExp(`${defaults.thematique_slug}">Art d'une vie`, 'g'),
    `${themSlug}">${escapeAttr(thematique)}`
  )

  // 9. Any remaining thematique anchor text not caught above
  html = html.replace(new RegExp(`>Art d'une vie</a>`, 'g'), `>${escapeAttr(thematique)}</a>`)

  return html
}

export default async function handler(req, res) {
  const { type, slug } = req.query
  if (!slug) {
    res.redirect(307, '/404')
    return
  }

  try {
    const post = await fetchPost(slug)
    if (!post) {
      res.redirect(307, '/404')
      return
    }

    const postType = post.post_type || type || 'formation'
    const template = loadTemplate(postType)
    const html = injectPost(template, post, postType)

    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600')
    res.status(200).send(html)
  } catch (err) {
    console.error('post handler error:', err)
    res.redirect(307, '/404')
  }
}
