// Proxy that fetches a Framer page, cleans it, and returns the HTML.
// The Positions client stores the HTML in Supabase directly.

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  if (!m) return ''
  return m[1].trim()
    .replace(/\s*[|–—-]\s*(?:Framer|My Framer Site)[^]*/i, '')
    .replace(/(?:Framer|My Framer Site)\s*[|–—-]\s*/i, '')
    .trim()
}

function cleanFramerHtml(html) {
  // Allow iframe embedding
  html = html.replace(/<meta[^>]+http-equiv=["']?[Xx]-[Ff]rame-[Oo]ptions["']?[^>]*>/gi, '')
  html = html.replace(/<meta[^>]+[Cc]ontent-[Ss]ecurity-[Pp]olicy[^>]*>/gi, '')

  // Remove Framer badge (various selectors Framer uses)
  html = html.replace(/<[^>]+(id|class)=["'][^"']*(framer-badge|FramerBadge|__framer-badge|framer-badge-container)[^"']*["'][^>]*>[\s\S]*?<\/(?:div|a|span)>/gi, '')

  // Sanitize title
  html = html.replace(
    /<title>(?:My Framer Site|Framer)<\/title>/i,
    '<title>Géosphérique</title>'
  )

  return html
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { url } = req.query
  if (!url) return res.status(400).json({ error: 'URL manquante' })

  let decodedUrl
  try {
    decodedUrl = decodeURIComponent(url)
    new URL(decodedUrl) // validate
  } catch {
    return res.status(400).json({ error: 'URL invalide' })
  }

  try {
    const fetchRes = await fetch(decodedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
      },
      redirect: 'follow',
    })

    if (!fetchRes.ok) {
      return res.status(400).json({ error: `HTTP ${fetchRes.status} — impossible de charger la page` })
    }

    const rawHtml = await fetchRes.text()

    if (!rawHtml.includes('<html') && !rawHtml.includes('<!DOCTYPE')) {
      return res.status(400).json({ error: 'La réponse ne contient pas de HTML valide' })
    }

    const html = cleanFramerHtml(rawHtml)
    const title = extractTitle(html)

    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache')
    res.status(200).json({ html, title })
  } catch (err) {
    console.error('scrape proxy error:', err.message)
    res.status(500).json({ error: err.message })
  }
}
