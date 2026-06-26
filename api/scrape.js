import { load } from 'cheerio'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://boszjuorhmpgzultsanu.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJvc3pqdW9yaG1wZ3p1bHRzYW51Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1ODczODQsImV4cCI6MjA4NDE2MzM4NH0.D3gP76reh7U_g0RqJm_RV3u0232HDv9HikqnYAeBJhc'

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim().replace(/\s+/g, '-')
    .slice(0, 80)
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  return m ? m[1].trim().replace(/\s*[|–—-]\s*.*/,'') : ''
}

function cleanFramerHtml(html) {
  // Remove X-Frame-Options and CSP (allow iframe embedding)
  html = html.replace(/<meta[^>]+http-equiv=["']?[Xx]-[Ff]rame-[Oo]ptions["']?[^>]*>/gi, '')
  html = html.replace(/<meta[^>]+[Cc]ontent-[Ss]ecurity-[Pp]olicy[^>]*>/gi, '')

  // Remove Framer badge / powered-by element
  html = html.replace(/<[^>]+(id|class)=["'][^"']*(framer-badge|FramerBadge|__framer-badge)[^"']*["'][^>]*>[\s\S]*?<\/\w+>/gi, '')

  // Sanitize title
  html = html.replace(
    /<title>[^<]*(?:My Framer Site|Framer)[^<]*<\/title>/i,
    '<title>Géosphérique</title>'
  )

  return html
}

async function parseBody(req) {
  return new Promise(resolve => {
    let data = ''
    req.on('data', chunk => { data += chunk })
    req.on('end', () => { try { resolve(JSON.parse(data)) } catch { resolve({}) } })
  })
}

async function dbInsert(row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/cms_pages`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.message || json.error || `DB error ${res.status}`)
  return Array.isArray(json) ? json[0] : json
}

async function dbUpdate(id, row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/cms_pages?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.message || json.error || `DB error ${res.status}`)
  return Array.isArray(json) ? json[0] : json
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const body = await parseBody(req)
  const url = body.url || req.query.url
  const existingId = body.id // for re-scrape (update)

  if (!url) return res.status(400).json({ error: 'URL manquante' })

  try {
    const fetchRes = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
    })
    if (!fetchRes.ok) {
      return res.status(400).json({ error: `Impossible de charger la page : HTTP ${fetchRes.status}` })
    }

    const rawHtml = await fetchRes.text()
    if (!rawHtml.includes('<html') && !rawHtml.includes('<!DOCTYPE')) {
      return res.status(400).json({ error: 'La réponse ne semble pas être une page HTML' })
    }

    const html = cleanFramerHtml(rawHtml)
    const title = extractTitle(html)
    const name = body.name || title || new URL(url).pathname.split('/').filter(Boolean).pop() || 'Page'

    if (existingId) {
      const page = await dbUpdate(existingId, {
        source_url: url,
        html,
        scraped_at: new Date().toISOString(),
      })
      return res.status(200).json({ page: { ...page, html: undefined } })
    }

    const slug = slugify(name) || `page-${Date.now()}`
    const page = await dbInsert({
      name,
      source_url: url,
      slug,
      html,
      scraped_at: new Date().toISOString(),
    })
    return res.status(200).json({ page: { ...page, html: undefined } })
  } catch (err) {
    console.error('scrape error:', err)
    return res.status(500).json({ error: err.message })
  }
}
