// Supabase CMS — injects live data into static Framer pages at build time
import { escapeHtml } from './utils.js'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://boszjuorhmpgzultsanu.supabase.co'
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJvc3pqdW9yaG1wZ3p1bHRzYW51Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1ODczODQsImV4cCI6MjA4NDE2MzM4NH0.D3gP76reh7U_g0RqJm_RV3u0232HDv9HikqnYAeBJhc'

async function query(table, select, filter = '') {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}${filter ? '&' + filter : ''}`
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  })
  if (!res.ok) throw new Error(`Supabase ${table}: HTTP ${res.status}`)
  return res.json()
}

// ─── Shared styles injected once per section ───────────────────────────────
const SECTION_STYLE = `
<style>
.geo-cms{font-family:'EB Garamond',Georgia,serif;background:#000;color:#e8e8e0;padding:80px 40px;box-sizing:border-box}
.geo-cms h2{font-size:clamp(1.6rem,3vw,2.4rem);font-weight:400;letter-spacing:.04em;margin:0 0 48px;color:#fff}
.geo-cms-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:24px;max-width:1400px;margin:0 auto}
.geo-cms-card{background:#0f0f0f;border:1px solid #1e1e1e;border-radius:4px;overflow:hidden;transition:border-color .2s}
.geo-cms-card:hover{border-color:#3a3a3a}
.geo-cms-card img{width:100%;aspect-ratio:4/3;object-fit:cover;display:block;background:#1a1a1a}
.geo-cms-card-body{padding:20px}
.geo-cms-card-body h3{font-size:1.1rem;font-weight:400;margin:0 0 8px;color:#fff;line-height:1.3}
.geo-cms-card-body p{font-size:.875rem;color:#888;margin:0 0 12px;line-height:1.5;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.geo-cms-tag{display:inline-block;font-size:.7rem;letter-spacing:.1em;text-transform:uppercase;padding:3px 8px;border:1px solid #2e2e2e;border-radius:2px;color:#666}
.geo-cms-meta{font-size:.75rem;color:#555;margin-top:8px}
.geo-cms-empty{color:#444;font-style:italic;text-align:center;padding:40px 0}
</style>
`

// ─── Section generators ─────────────────────────────────────────────────────

function sectionListes(rows) {
  if (!rows.length) return ''
  const cards = rows.map(r => `
    <article class="geo-cms-card">
      <div class="geo-cms-card-body">
        <h3>${escapeHtml(r.title)}</h3>
        ${r.description ? `<p>${escapeHtml(r.description)}</p>` : ''}
        <div>
          ${r.nature ? `<span class="geo-cms-tag">${escapeHtml(r.nature)}</span> ` : ''}
          ${r.statut ? `<span class="geo-cms-tag">${escapeHtml(r.statut)}</span>` : ''}
        </div>
        ${r.price != null ? `<p class="geo-cms-meta">${r.price} €</p>` : ''}
      </div>
    </article>`).join('')
  return `${SECTION_STYLE}
<section class="geo-cms" id="geo-cms-listes" aria-label="Géosphérique Listes — offres">
  <h2>Les Offres</h2>
  <div class="geo-cms-grid">${cards}</div>
</section>`
}

function sectionArtistes(rows) {
  if (!rows.length) return ''
  const cards = rows.map(r => `
    <article class="geo-cms-card">
      ${r.artwork_url ? `<img src="${escapeHtml(r.artwork_url)}" alt="${escapeHtml(r.artwork_title || '')}" loading="lazy">` : ''}
      <div class="geo-cms-card-body">
        <h3>${escapeHtml(r.artwork_title || '')}</h3>
        ${r.artwork_description ? `<p>${escapeHtml(r.artwork_description)}</p>` : ''}
        <div>
          ${r.artwork_category ? `<span class="geo-cms-tag">${escapeHtml(r.artwork_category)}</span> ` : ''}
          ${r.artwork_type ? `<span class="geo-cms-tag">${escapeHtml(r.artwork_type)}</span>` : ''}
        </div>
        ${r.first_last_name ? `<p class="geo-cms-meta">${escapeHtml(r.first_last_name)}</p>` : ''}
      </div>
    </article>`).join('')
  return `${SECTION_STYLE}
<section class="geo-cms" id="geo-cms-artistes" aria-label="Le Marché des Artistes">
  <h2>Le Marché des Artistes</h2>
  <div class="geo-cms-grid">${cards}</div>
</section>`
}

function sectionPartenaires(rows) {
  if (!rows.length) return ''
  const cards = rows.map(r => `
    <article class="geo-cms-card">
      ${r.photo_url ? `<img src="${escapeHtml(r.photo_url)}" alt="${escapeHtml(r.display_name || '')}" loading="lazy">` : ''}
      <div class="geo-cms-card-body">
        <h3>${escapeHtml(r.page_title || r.display_name || '')}</h3>
        ${r.artist_nature ? `<span class="geo-cms-tag">${escapeHtml(r.artist_nature)}</span>` : ''}
        ${(r.city || r.country) ? `<p class="geo-cms-meta">${[r.city, r.country].filter(Boolean).map(escapeHtml).join(', ')}</p>` : ''}
      </div>
    </article>`).join('')
  return `${SECTION_STYLE}
<section class="geo-cms" id="geo-cms-partenaires" aria-label="Géosphérique Partenaires">
  <h2>Nos Partenaires</h2>
  <div class="geo-cms-grid">${cards}</div>
</section>`
}

function sectionTraversees(rows) {
  if (!rows.length) return ''
  const cards = rows.map(r => `
    <article class="geo-cms-card">
      ${r.main_image ? `<img src="${escapeHtml(r.main_image)}" alt="${escapeHtml(r.title || '')}" loading="lazy">` : ''}
      <div class="geo-cms-card-body">
        <h3>${escapeHtml(r.h1 || r.title || '')}</h3>
        ${r.meta_description ? `<p>${escapeHtml(r.meta_description)}</p>` : ''}
        <div>
          ${r.thematique ? `<span class="geo-cms-tag">${escapeHtml(r.thematique)}</span>` : ''}
        </div>
      </div>
    </article>`).join('')
  return `${SECTION_STYLE}
<section class="geo-cms" id="geo-cms-traversees" aria-label="Les Traversées de Géosphérique">
  <h2>Les Traversées</h2>
  <div class="geo-cms-grid">${cards}</div>
</section>`
}

function sectionFormations(rows) {
  if (!rows.length) return ''
  const cards = rows.map(r => `
    <article class="geo-cms-card">
      ${r.main_image ? `<img src="${escapeHtml(r.main_image)}" alt="${escapeHtml(r.title || '')}" loading="lazy">` : ''}
      <div class="geo-cms-card-body">
        <h3>${escapeHtml(r.h1 || r.title || '')}</h3>
        ${r.meta_description ? `<p>${escapeHtml(r.meta_description)}</p>` : ''}
        ${r.thematique ? `<div><span class="geo-cms-tag">${escapeHtml(r.thematique)}</span></div>` : ''}
      </div>
    </article>`).join('')
  return `${SECTION_STYLE}
<section class="geo-cms" id="geo-cms-formations" aria-label="Géosphérique Formations">
  <h2>Les Formations</h2>
  <div class="geo-cms-grid">${cards}</div>
</section>`
}

function sectionAteliers(rows) {
  if (!rows.length) return ''
  const cards = rows.map(r => `
    <article class="geo-cms-card">
      ${r.main_image ? `<img src="${escapeHtml(r.main_image)}" alt="${escapeHtml(r.title || '')}" loading="lazy">` : ''}
      <div class="geo-cms-card-body">
        <h3>${escapeHtml(r.h1 || r.title || '')}</h3>
        ${r.meta_description ? `<p>${escapeHtml(r.meta_description)}</p>` : ''}
        ${r.thematique ? `<div><span class="geo-cms-tag">${escapeHtml(r.thematique)}</span></div>` : ''}
      </div>
    </article>`).join('')
  return `${SECTION_STYLE}
<section class="geo-cms" id="geo-cms-ateliers" aria-label="Géosphérique Ateliers">
  <h2>Les Ateliers</h2>
  <div class="geo-cms-grid">${cards}</div>
</section>`
}

function sectionOutils(rows) {
  if (!rows.length) return ''
  const cards = rows.map(r => `
    <article class="geo-cms-card">
      ${r.main_image ? `<img src="${escapeHtml(r.main_image)}" alt="${escapeHtml(r.title || '')}" loading="lazy">` : ''}
      <div class="geo-cms-card-body">
        <h3>${escapeHtml(r.h1 || r.title || '')}</h3>
        ${r.meta_description ? `<p>${escapeHtml(r.meta_description)}</p>` : ''}
        ${r.thematique ? `<div><span class="geo-cms-tag">${escapeHtml(r.thematique)}</span></div>` : ''}
      </div>
    </article>`).join('')
  return `${SECTION_STYLE}
<section class="geo-cms" id="geo-cms-outils" aria-label="Géosphérique Outils">
  <h2>Les Outils</h2>
  <div class="geo-cms-grid">${cards}</div>
</section>`
}

// ─── Page route → section builder map ──────────────────────────────────────
const PAGE_MAP = {
  '/geospherique-listes': {
    fetch: () => query(
      'geospherique_listes_offers',
      'id,title,description,price,nature,statut',
      'statut=eq.Ouvert&order=created_at.desc'
    ),
    build: sectionListes,
  },
  '/le-march%C3%A9-des-artistes': {
    fetch: () => query(
      'refuge_artistes_inscriptions',
      'id,artwork_title,artwork_description,artwork_type,artwork_category,artwork_url,first_last_name',
      'is_refused=is.null&order=created_at.desc'
    ),
    build: sectionArtistes,
  },
  '/geospherique-partenaire': {
    fetch: () => query(
      'geospherique_partner_profiles',
      'id,display_name,page_title,city,country,photo_url,artist_nature',
      'is_activated=eq.true&order=activated_at.desc'
    ),
    build: sectionPartenaires,
  },
  '/les-travers%C3%A9es-de-geospherique': {
    fetch: () => query(
      'partner_posts',
      'id,title,h1,meta_description,main_image,thematique,slug',
      'status=eq.published&post_type=eq.travers%C3%A9e&order=published_at.desc'
    ),
    build: sectionTraversees,
  },
  '/partager-un-savoir/geospherique-formations': {
    fetch: () => query(
      'partner_posts',
      'id,title,h1,meta_description,main_image,thematique,slug',
      'status=eq.published&post_type=eq.formation&order=published_at.desc'
    ),
    build: sectionFormations,
  },
  '/partager-un-savoir/geospherique-partages': {
    fetch: () => query(
      'partner_posts',
      'id,title,h1,meta_description,main_image,thematique,slug',
      'status=eq.published&post_type=eq.atelier&order=published_at.desc'
    ),
    build: sectionAteliers,
  },
  '/partager-un-savoir/geospherique-tools': {
    fetch: () => query(
      'partner_posts',
      'id,title,h1,meta_description,main_image,thematique,slug',
      'status=eq.published&post_type=eq.outil&order=published_at.desc'
    ),
    build: sectionOutils,
  },
}

// Also handle non-encoded variants
const ALIASES = {
  '/le-marché-des-artistes': '/le-march%C3%A9-des-artistes',
  '/les-traversées-de-geospherique': '/les-travers%C3%A9es-de-geospherique',
}

// ─── Individual post page injection ────────────────────────────────────────

function buildPostMeta(post) {
  const title = escapeHtml(post.h1 || post.title || '')
  const desc = escapeHtml(post.meta_description || '')
  const img = post.main_image ? escapeHtml(post.main_image) : ''
  return `
<style>
.geo-post{font-family:'EB Garamond',Georgia,serif;background:#000;color:#e8e8e0;padding:80px 40px;box-sizing:border-box;max-width:860px;margin:0 auto}
.geo-post h1{font-size:clamp(2rem,4vw,3.2rem);font-weight:400;letter-spacing:.02em;margin:0 0 24px;color:#fff;line-height:1.2}
.geo-post-meta{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:40px}
.geo-post-tag{font-size:.75rem;letter-spacing:.1em;text-transform:uppercase;padding:4px 10px;border:1px solid #2e2e2e;border-radius:2px;color:#666}
.geo-post-hero{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:4px;margin-bottom:48px;background:#111}
.geo-post-body{font-size:1.05rem;line-height:1.8;color:#c8c8c0}
.geo-post-body p{margin:0 0 1.4em}
</style>
<section class="geo-post" id="geo-post-content">
  ${img ? `<img class="geo-post-hero" src="${img}" alt="${title}" loading="eager">` : ''}
  <h1>${title}</h1>
  ${desc ? `<div class="geo-post-meta"><span class="geo-post-tag">${desc}</span></div>` : ''}
</section>`
}

function injectPostMeta(html, post) {
  const $ = { html }
  // Replace <title>
  const titleVal = escapeHtml(post.h1 || post.title || 'Géosphérique')
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${titleVal} — Géosphérique</title>`)
  // Replace meta description
  const desc = escapeHtml(post.meta_description || '')
  html = html.replace(/(<meta\s+name="description"\s+content=")[^"]*(")/i, `$1${desc}$2`)
  // Inject post section
  const section = buildPostMeta(post)
  return html.replace('</body>', section + '\n</body>')
}

// Route patterns for individual post pages (matches Framer CMS collection structure)
const POST_TYPE_PATHS = {
  'formation': '/geospherique-listes/partager-un-savoir',
  'atelier':   '/partager-un-savoir/geospherique-partages',
  'outil':     '/partager-un-savoir/geospherique-tools',
  'traversée': '/les-traversées-de-geospherique',
}

export function getPostPath(post) {
  const base = POST_TYPE_PATHS[post.post_type]
  if (!base || !post.slug) return null
  return `${base}/${post.slug}`
}

export async function fetchAllPublishedPosts() {
  return query(
    'partner_posts',
    'id,title,h1,meta_description,main_image,thematique,slug,post_type,content',
    'status=eq.published&order=published_at.desc'
  )
}

export async function injectCmsSection(html, pathname) {
  // Check individual post routes first
  for (const [postType, basePath] of Object.entries(POST_TYPE_PATHS)) {
    if (pathname.startsWith(basePath + '/')) {
      const slug = pathname.slice(basePath.length + 1)
      if (!slug) continue
      try {
        const rows = await query(
          'partner_posts',
          'id,title,h1,meta_description,main_image,thematique,slug,post_type',
          `status=eq.published&slug=eq.${encodeURIComponent(slug)}`
        )
        if (rows.length > 0) return injectPostMeta(html, rows[0])
      } catch (e) {
        console.warn(`  ⚠ CMS post ${pathname} — ${e.message}`)
      }
      return html
    }
  }

  const key = ALIASES[pathname] || pathname
  const handler = PAGE_MAP[key]
  if (!handler) return html

  try {
    const rows = await handler.fetch()
    const section = handler.build(rows)
    if (!section) return html
    return html.replace('</body>', section + '\n</body>')
  } catch (e) {
    console.warn(`  ⚠ CMS ${pathname} — ${e.message}`)
    return html
  }
}
