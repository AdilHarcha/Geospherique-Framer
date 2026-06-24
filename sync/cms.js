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
      'status=eq.published&order=published_at.desc'
    ),
    build: sectionTraversees,
  },
}

// Also handle non-encoded variants
const ALIASES = {
  '/le-marché-des-artistes': '/le-march%C3%A9-des-artistes',
  '/les-traversées-de-geospherique': '/les-travers%C3%A9es-de-geospherique',
}

export async function injectCmsSection(html, pathname) {
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
