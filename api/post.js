// Vercel Serverless Function — Individual post pages served directly from Supabase
// Routes: /geospherique-listes/partager-un-savoir/:slug  (formation)
//         /partager-un-savoir/geospherique-partages/:slug (atelier)
//         /partager-un-savoir/geospherique-tools/:slug    (outil)
//         /les-travers%C3%A9es-de-geospherique/:slug      (traversée)

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://boszjuorhmpgzultsanu.supabase.co'
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJvc3pqdW9yaG1wZ3p1bHRzYW51Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1ODczODQsImV4cCI6MjA4NDE2MzM4NH0.D3gP76reh7U_g0RqJm_RV3u0232HDv9HikqnYAeBJhc'

const TYPE_LABELS = {
  formation: 'Formation',
  atelier:   'Atelier',
  outil:     'Outil',
  traversée: 'Traversée',
  'traversée': 'Traversée',
}

const TYPE_BACK = {
  formation: { href: '/partager-un-savoir/geospherique-formations', label: 'Les Formations' },
  atelier:   { href: '/partager-un-savoir/geospherique-partages',   label: 'Les Ateliers' },
  outil:     { href: '/partager-un-savoir/geospherique-tools',      label: 'Les Outils' },
  traversée: { href: '/les-travers%C3%A9es-de-geospherique',        label: 'Les Traversées' },
  'traversée': { href: '/les-travers%C3%A9es-de-geospherique', label: 'Les Traversées' },
}

function escape(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Minimal Markdown → HTML (paragraphs, headings, bold, italic, links, images)
function markdownToHtml(md) {
  if (!md) return ''
  const lines = md.split('\n')
  const out = []
  let inParagraph = false

  function closeParagraph() {
    if (inParagraph) { out.push('</p>'); inParagraph = false }
  }

  function inline(text) {
    return text
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => `<img src="${escape(src)}" alt="${escape(alt)}" loading="lazy" class="geo-inline-img">`)
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => `<a href="${escape(href)}" class="geo-link">${escape(label)}</a>`)
      .replace(/\*\*([^*]+)\*\*/g, (_, t) => `<strong>${t}</strong>`)
      .replace(/\*([^*]+)\*/g, (_, t) => `<em>${t}</em>`)
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    if (!line) { closeParagraph(); continue }
    const h3 = line.match(/^### (.+)/)
    const h2 = line.match(/^## (.+)/)
    const h1 = line.match(/^# (.+)/)
    if (h1) { closeParagraph(); out.push(`<h2 class="geo-h2">${inline(h1[1])}</h2>`); continue }
    if (h2) { closeParagraph(); out.push(`<h3 class="geo-h3">${inline(h2[1])}</h3>`); continue }
    if (h3) { closeParagraph(); out.push(`<h4 class="geo-h4">${inline(h3[1])}</h4>`); continue }
    if (!inParagraph) { out.push('<p>'); inParagraph = true } else { out.push(' ') }
    out.push(inline(line))
  }
  closeParagraph()
  return out.join('')
}

async function fetchPost(slug) {
  const url = `${SUPABASE_URL}/rest/v1/partner_posts?slug=eq.${encodeURIComponent(slug)}&status=eq.published&select=id,title,h1,meta_description,main_image,bg_image,thematique,post_type,content,published_at&limit=1`
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  })
  if (!res.ok) return null
  const rows = await res.json()
  return rows[0] || null
}

function renderHtml(post, requestedType) {
  const type = post.post_type || requestedType || 'formation'
  const title = escape(post.h1 || post.title || '')
  const desc = escape(post.meta_description || '')
  const img = post.main_image ? escape(post.main_image) : ''
  const bgImg = post.bg_image ? escape(post.bg_image) : img
  const tag = escape(post.thematique || '')
  const typeLabel = TYPE_LABELS[type] || type
  const back = TYPE_BACK[type] || { href: '/', label: 'Géosphérique' }
  const body = markdownToHtml(post.content)
  const publishedAt = post.published_at
    ? new Date(post.published_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    : ''

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} — Géosphérique</title>
  <meta name="description" content="${desc}">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${title} — Géosphérique">
  <meta property="og:description" content="${desc}">
  ${img ? `<meta property="og:image" content="${img}">` : ''}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title} — Géosphérique">
  <meta name="twitter:description" content="${desc}">
  ${img ? `<meta name="twitter:image" content="${img}">` : ''}
  <link rel="canonical" href="https://geospherique-framer-o6dm.vercel.app${back.href}/${post.slug || ''}">
  <link rel="icon" href="/_cdn/framerusercontent.com/images/njEVkppev6A8e0Vlj9YgI2gtDc.png">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body {
      font-family: 'EB Garamond', Georgia, serif;
      background: #000;
      color: #e8e8e0;
      min-height: 100vh;
      -webkit-font-smoothing: antialiased;
    }
    @import url('https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;1,400&display=swap');

    /* Nav */
    .geo-nav {
      position: fixed; top: 0; left: 0; right: 0; z-index: 100;
      display: flex; align-items: center; justify-content: space-between;
      padding: 20px 40px;
      background: linear-gradient(to bottom, rgba(0,0,0,.9) 0%, transparent 100%);
    }
    .geo-nav-logo {
      font-size: 1rem; letter-spacing: .15em; text-transform: uppercase;
      color: #fff; text-decoration: none; font-weight: 400;
    }
    .geo-nav-back {
      display: inline-flex; align-items: center; gap: 8px;
      color: #666; font-size: .8rem; letter-spacing: .08em; text-transform: uppercase;
      text-decoration: none; transition: color .2s;
    }
    .geo-nav-back:hover { color: #fff; }
    .geo-nav-back svg { width: 14px; height: 14px; }

    /* Hero */
    .geo-hero {
      position: relative; width: 100%; height: 60vh; min-height: 380px;
      overflow: hidden; display: flex; align-items: flex-end;
    }
    .geo-hero-img {
      position: absolute; inset: 0; width: 100%; height: 100%;
      object-fit: cover; object-position: center;
    }
    .geo-hero-overlay {
      position: absolute; inset: 0;
      background: linear-gradient(to top, rgba(0,0,0,.85) 0%, rgba(0,0,0,.2) 60%, transparent 100%);
    }
    .geo-hero-content {
      position: relative; z-index: 1; padding: 48px 40px;
      max-width: 900px; width: 100%;
    }
    .geo-no-hero { padding-top: 120px; }

    /* Tags */
    .geo-tags { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
    .geo-tag {
      font-size: .68rem; letter-spacing: .12em; text-transform: uppercase;
      padding: 4px 10px; border: 1px solid rgba(255,255,255,.15);
      border-radius: 2px; color: rgba(255,255,255,.5);
    }
    .geo-tag-type { border-color: rgba(255,255,255,.3); color: rgba(255,255,255,.7); }

    /* Title */
    .geo-h1 {
      font-size: clamp(1.8rem, 4vw, 3.2rem); font-weight: 400;
      letter-spacing: .01em; line-height: 1.15; color: #fff;
      margin-bottom: 16px;
    }
    .geo-meta-date { font-size: .8rem; color: rgba(255,255,255,.4); letter-spacing: .05em; }

    /* Content */
    .geo-article {
      max-width: 760px; margin: 0 auto;
      padding: 64px 40px 120px;
    }
    .geo-lead {
      font-size: 1.25rem; line-height: 1.7; color: rgba(232,232,224,.7);
      margin-bottom: 48px; font-style: italic;
    }
    .geo-body { font-size: 1.05rem; line-height: 1.9; color: #b8b8b0; }
    .geo-body .geo-h2 {
      font-size: 1.6rem; font-weight: 400; color: #fff;
      margin: 2.5em 0 .8em; letter-spacing: .02em;
    }
    .geo-body .geo-h3 {
      font-size: 1.25rem; font-weight: 400; color: rgba(255,255,255,.85);
      margin: 2em 0 .6em;
    }
    .geo-body .geo-h4 {
      font-size: 1rem; font-weight: 400; color: rgba(255,255,255,.7);
      margin: 1.5em 0 .5em; letter-spacing: .05em; text-transform: uppercase;
    }
    .geo-body p { margin-bottom: 1.4em; }
    .geo-body .geo-link { color: rgba(232,232,224,.6); text-underline-offset: 3px; }
    .geo-body .geo-link:hover { color: #fff; }
    .geo-body .geo-inline-img {
      width: 100%; border-radius: 4px; margin: 2em 0; background: #111;
    }

    /* Divider */
    .geo-divider { border: none; border-top: 1px solid #1a1a1a; margin: 0; }

    @media (max-width: 640px) {
      .geo-nav { padding: 16px 20px; }
      .geo-hero-content { padding: 32px 20px; }
      .geo-article { padding: 40px 20px 80px; }
    }
  </style>
</head>
<body>
  <nav class="geo-nav">
    <a class="geo-nav-logo" href="/">Géosphérique</a>
    <a class="geo-nav-back" href="${escape(back.href)}">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10 3L5 8l5 5"/>
      </svg>
      ${escape(back.label)}
    </a>
  </nav>

  ${img ? `
  <header class="geo-hero">
    <img class="geo-hero-img" src="${img}" alt="${title}" loading="eager" fetchpriority="high">
    <div class="geo-hero-overlay"></div>
    <div class="geo-hero-content">
      <div class="geo-tags">
        <span class="geo-tag geo-tag-type">${escape(typeLabel)}</span>
        ${tag ? `<span class="geo-tag">${tag}</span>` : ''}
      </div>
      <h1 class="geo-h1">${title}</h1>
      ${publishedAt ? `<p class="geo-meta-date">${publishedAt}</p>` : ''}
    </div>
  </header>` : `
  <header class="geo-no-hero">
    <div style="max-width:760px;margin:0 auto;padding:0 40px 40px">
      <div class="geo-tags" style="margin-bottom:20px">
        <span class="geo-tag geo-tag-type">${escape(typeLabel)}</span>
        ${tag ? `<span class="geo-tag">${tag}</span>` : ''}
      </div>
      <h1 class="geo-h1">${title}</h1>
      ${publishedAt ? `<p class="geo-meta-date" style="margin-top:12px">${publishedAt}</p>` : ''}
    </div>
  </header>`}

  <hr class="geo-divider">

  <main>
    <article class="geo-article">
      ${desc ? `<p class="geo-lead">${desc}</p>` : ''}
      ${body ? `<div class="geo-body">${body}</div>` : ''}
    </article>
  </main>
</body>
</html>`
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

    const html = renderHtml(post, type)
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600')
    res.status(200).send(html)
  } catch (err) {
    console.error('post handler error:', err)
    res.redirect(307, '/404')
  }
}
