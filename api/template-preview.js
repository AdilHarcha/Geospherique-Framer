import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { load } from 'cheerio'

const __dirname = dirname(fileURLToPath(import.meta.url))

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://boszjuorhmpgzultsanu.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJvc3pqdW9yaG1wZ3p1bHRzYW51Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1ODczODQsImV4cCI6MjA4NDE2MzM4NH0.D3gP76reh7U_g0RqJm_RV3u0232HDv9HikqnYAeBJhc'

const MOBILE_CLASS = 'hidden-1ikagkv'
const GEO_RE = /^geo(text|image|link|collection)\d*/i

// ─── Detect geo* slots only ──────────────────────────────────────────────────
function detectGeoSlots(html) {
  const $ = load(html)
  const slots = []
  const seen = new Set()

  $('[data-geo-name]').each((_, el) => {
    const geoName = $(el).attr('data-geo-name') || ''
    if (!GEO_RE.test(geoName)) return
    if (seen.has(geoName)) return // deduplicate: first occurrence wins

    // Skip mobile-only variants
    let node = el
    let isMobile = false
    while (node && node.tagName) {
      const cls = ($(node).attr('class') || '').split(/\s+/)
      if (cls.includes(MOBILE_CLASS)) { isMobile = true; break }
      node = node.parent
    }
    if (isMobile) return

    seen.add(geoName)

    const typeMatch = geoName.match(/^geo(text|image|link|collection)/i)
    const type = typeMatch ? typeMatch[1].toLowerCase() : 'text'

    const $el = $(el)
    let preview = ''
    if (type === 'image') {
      const img = $el.find('img').first()
      preview = img.attr('alt') || img.attr('src')?.split('/').pop()?.split('?')[0] || ''
      if (!preview) {
        const m = ($el.attr('style') || '').match(/url\(['"]?([^'")\s]+)/)
        if (m) preview = m[1].split('/').pop().split('?')[0]
      }
    } else if (type === 'link') {
      preview = $el.text().trim().replace(/\s+/g, ' ').slice(0, 50) || $el.attr('href') || ''
    } else {
      preview = $el.text().trim().replace(/\s+/g, ' ').slice(0, 60)
    }

    slots.push({ name: geoName, type, sel: `[data-geo-name="${geoName}"]`, preview })
  })

  const texts = slots.filter(s => s.type === 'text')
  const images = slots.filter(s => s.type === 'image')
  const links = slots.filter(s => s.type === 'link')
  const collections = slots.filter(s => s.type === 'collection')

  return { texts, images, links, collections }
}

// ─── Picker injection ────────────────────────────────────────────────────────
function buildPickerInject(slots, embedded = false) {
  const slotsJson = JSON.stringify(slots)
  const totalSlots = slots.texts.length + slots.images.length + slots.links.length + slots.collections.length

  return `
<style id="_cp_style">
  ._cp_hover { outline: 2px solid #6366f1 !important; outline-offset: 1px !important; cursor: crosshair !important; }
  ._cp_mapped { outline: 2px solid #10b981 !important; outline-offset: 1px !important; }
  ._cp_selected { outline: 3px solid #f59e0b !important; outline-offset: 2px !important; }

  #_cp_bar {
    position: fixed; bottom: 0; left: 0; right: ${embedded ? '0' : '360px'}; z-index: 2147483646;
    background: rgba(10,10,15,0.92); backdrop-filter: blur(10px);
    padding: 9px 16px; display: flex; align-items: center; gap: 12px;
    font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; font-size: 12px; color: #6b7280;
    border-top: 1px solid rgba(255,255,255,0.06); pointer-events: none;
  }
  #_cp_bar_info { flex: 1; display: flex; align-items: center; gap: 8px; overflow: hidden; }
  #_cp_bar_tag { color: #818cf8; font-family: 'SF Mono',monospace; font-size: 11px; flex-shrink: 0; }
  #_cp_bar_text { color: #d1d5db; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #_cp_count { background: #10b981; color: white; border-radius: 999px; padding: 2px 10px; font-size: 11px; font-weight: 600; flex-shrink: 0; }

  #_cp_panel {
    position: fixed; top: 0; right: 0; bottom: 0; width: 360px; z-index: 2147483647;
    ${embedded ? 'display: none !important;' : ''}
    background: rgba(8,8,12,0.97); backdrop-filter: blur(12px);
    border-left: 1px solid rgba(255,255,255,0.07);
    font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; font-size: 12px; color: #9ca3af;
    display: flex; flex-direction: column; overflow: hidden;
  }
  #_cp_panel_header {
    padding: 14px 16px 12px; border-bottom: 1px solid rgba(255,255,255,0.07);
    display: flex; align-items: center; justify-content: space-between; flex-shrink: 0;
  }
  #_cp_panel_header h2 { margin:0; font-size: 13px; font-weight: 600; color: #e5e7eb; }
  #_cp_panel_body { flex: 1; overflow-y: auto; padding: 8px 0 60px; }
  #_cp_panel_body::-webkit-scrollbar { width: 4px; }
  #_cp_panel_body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }

  .cp-section { border-bottom: 1px solid rgba(255,255,255,0.05); }
  .cp-section-header {
    padding: 10px 16px; display: flex; align-items: center; gap: 8px;
    cursor: pointer; user-select: none;
  }
  .cp-section-header:hover { background: rgba(255,255,255,0.03); }
  .cp-section-title { flex: 1; font-size: 11px; font-weight: 600; color: #d1d5db; text-transform: uppercase; letter-spacing: .05em; }
  .cp-section-badge { font-size: 10px; font-weight: 600; padding: 1px 7px; border-radius: 999px; background: rgba(99,102,241,0.2); color: #818cf8; }
  .cp-section-arrow { color: #4b5563; font-size: 9px; transition: transform .2s; }
  .cp-section.open .cp-section-arrow { transform: rotate(90deg); }
  .cp-section-items { display: none; }
  .cp-section.open .cp-section-items { display: block; }

  .cp-item { padding: 8px 16px; display: flex; align-items: center; gap: 8px; cursor: pointer; transition: background .12s; }
  .cp-item:hover { background: rgba(255,255,255,0.04); }
  .cp-item.active { background: rgba(245,158,11,0.1); }
  .cp-item.mapped { background: rgba(16,185,129,0.07); }
  .cp-geo-name { font-size: 10px; font-family: 'SF Mono',monospace; color: #818cf8; background: rgba(99,102,241,0.15); padding: 2px 6px; border-radius: 4px; flex-shrink: 0; }
  .cp-geo-name.img { color: #f59e0b; background: rgba(245,158,11,0.15); }
  .cp-geo-name.link { color: #10b981; background: rgba(16,185,129,0.15); }
  .cp-geo-name.collection { color: #c084fc; background: rgba(192,132,252,0.15); }
  .cp-item-preview { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #6b7280; font-size: 11px; }
  .cp-item-dot { width: 5px; height: 5px; border-radius: 50%; background: #10b981; flex-shrink: 0; display: none; }
  .cp-item.mapped .cp-item-dot { display: block; }
  #_cp_empty { padding: 40px 16px; text-align: center; color: #374151; font-size: 12px; line-height: 1.8; }
</style>

<div id="_cp_bar">
  <div id="_cp_bar_info"><span>Survolez un élément pour l'identifier</span></div>
  <span id="_cp_count">0 mappé</span>
</div>

<div id="_cp_panel">
  <div id="_cp_panel_header">
    <h2>Emplacements geo*</h2>
    <span id="_cp_total" style="font-size:11px;color:#4b5563;">${totalSlots} détectés</span>
  </div>
  <div id="_cp_panel_body">
    ${totalSlots === 0
      ? '<div id="_cp_empty">Aucun élément <code style="color:#818cf8">geo*</code> détecté.<br>Nommez vos éléments Framer<br><code style="color:#818cf8">geotext1</code>, <code style="color:#f59e0b">geoimage1</code>, <code style="color:#10b981">geolink1</code>…</div>'
      : '<div id="_cp_empty_notice">Chargement…</div>'
    }
  </div>
</div>

<script>
(function () {
  var SKIP = { HTML:1,BODY:1,HEAD:1,SCRIPT:1,STYLE:1,META:1,LINK:1,NOSCRIPT:1 };
  var SLOTS = ${slotsJson};
  var mappings = [];
  var hovered = null;
  var activeItem = null;

  function allSlots() {
    return [].concat(SLOTS.texts||[], SLOTS.images||[], SLOTS.links||[], SLOTS.collections||[]);
  }

  function updateCount() {
    var n = mappings.length;
    var el = document.getElementById('_cp_count');
    if (el) el.textContent = n + (n > 1 ? ' mappés' : ' mappé');
  }

  function applyMapped() {
    document.querySelectorAll('._cp_mapped').forEach(function(el) { el.classList.remove('_cp_mapped'); });
    mappings.forEach(function(m) {
      if (!m.selector) return;
      try { var el = document.querySelector(m.selector); if (el) el.classList.add('_cp_mapped'); } catch(e) {}
    });
    document.querySelectorAll('.cp-item').forEach(function(li) {
      li.classList.toggle('mapped', mappings.some(function(m) { return m.selector === li.dataset.sel; }));
    });
  }

  function getSelector(el) {
    var geo = el.getAttribute && el.getAttribute('data-geo-name');
    if (geo) return '[data-geo-name="' + geo + '"]';
    if (el.id && !/^_cp|__geo|__framer/.test(el.id)) return '#' + el.id;
    var parts = [], node = el;
    for (var i = 0; i < 8; i++) {
      if (!node || node === document.documentElement) break;
      var sel = node.tagName.toLowerCase();
      if (node.id && !/^_cp|__geo|__framer/.test(node.id)) { parts.unshift('#' + node.id); break; }
      if (node.className && typeof node.className === 'string') {
        var cls = node.className.trim().split(/\\s+/).filter(function(c){ return c && !/^_cp/.test(c); }).slice(0,2).map(function(c){ return '.'+c; }).join('');
        if (cls) sel += cls;
      }
      parts.unshift(sel); node = node.parentNode;
    }
    return parts.join(' > ');
  }

  function isSkipped(el) {
    if (!el || !el.tagName || SKIP[el.tagName]) return true;
    var p = el; while(p) { if (p.id === '_cp_bar' || p.id === '_cp_panel') return true; p = p.parentElement; }
    return false;
  }

  function selectItem(li) {
    if (activeItem) activeItem.classList.remove('active');
    activeItem = li; li.classList.add('active');
    var sel = li.dataset.sel;
    document.querySelectorAll('._cp_selected').forEach(function(e) { e.classList.remove('_cp_selected'); });
    try { var t = document.querySelector(sel); if (t) { t.classList.add('_cp_selected'); t.scrollIntoView({ behavior:'smooth', block:'center' }); } } catch(e) {}
    window.parent.postMessage({ type:'cms-element-click', selector:sel, geoName:li.dataset.name, geoType:li.dataset.type, preview:li.dataset.preview }, '*');
  }

  function buildPanel() {
    var body = document.getElementById('_cp_panel_body');
    if (!body) return;
    body.innerHTML = '';
    var defs = [
      { key:'texts',       label:'Textes',      cls:'' },
      { key:'images',      label:'Images',      cls:'img' },
      { key:'links',       label:'Liens',       cls:'link' },
      { key:'collections', label:'Collections', cls:'collection' },
    ];
    defs.forEach(function(d) {
      var items = SLOTS[d.key] || [];
      if (!items.length) return;
      var sec = document.createElement('div'); sec.className = 'cp-section open';
      var hdr = document.createElement('div'); hdr.className = 'cp-section-header';
      hdr.innerHTML = '<span class="cp-section-title">' + d.label + '</span><span class="cp-section-badge">' + items.length + '</span><span class="cp-section-arrow">▶</span>';
      var itemsDiv = document.createElement('div'); itemsDiv.className = 'cp-section-items';
      items.forEach(function(slot) {
        var li = document.createElement('div'); li.className = 'cp-item';
        li.dataset.sel = slot.sel; li.dataset.name = slot.name; li.dataset.type = slot.type; li.dataset.preview = slot.preview;
        li.innerHTML = '<span class="cp-geo-name ' + d.cls + '">' + slot.name + '</span><span class="cp-item-preview">' + slot.preview.replace(/</g,'&lt;') + '</span><span class="cp-item-dot"></span>';
        li.addEventListener('click', function() { selectItem(li); });
        itemsDiv.appendChild(li);
      });
      hdr.addEventListener('click', function() { sec.classList.toggle('open'); });
      sec.appendChild(hdr); sec.appendChild(itemsDiv); body.appendChild(sec);
    });
    updateCount();
  }

  document.addEventListener('mouseover', function(e) {
    var el = e.target; if (isSkipped(el)) return;
    if (hovered && hovered !== el) hovered.classList.remove('_cp_hover');
    hovered = el; el.classList.add('_cp_hover');
    var info = document.getElementById('_cp_bar_info');
    if (info) {
      var geo = el.getAttribute('data-geo-name');
      var txt = (el.textContent || '').trim().replace(/\\s+/g,' ').slice(0,50);
      info.innerHTML = geo
        ? '<span id="_cp_bar_tag" style="color:#818cf8">' + geo + '</span>' + (txt ? '<span id="_cp_bar_text" style="color:#d1d5db;margin-left:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">« ' + txt + ' »</span>' : '')
        : '<span id="_cp_bar_tag" style="color:#4b5563">&lt;' + el.tagName.toLowerCase() + '&gt;</span>' + (txt ? '<span id="_cp_bar_text" style="color:#6b7280;margin-left:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + txt + '</span>' : '');
    }
  }, { passive: true });

  document.addEventListener('mouseout', function(e) {
    if (e.target === hovered) {
      hovered.classList.remove('_cp_hover'); hovered = null;
      var info = document.getElementById('_cp_bar_info');
      if (info) info.innerHTML = '<span>Survolez un élément pour l\\'identifier</span>';
    }
  }, { passive: true });

  document.addEventListener('click', function(e) {
    var el = e.target; if (isSkipped(el)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    var selector = getSelector(el);
    var geo = el.getAttribute('data-geo-name') || '';
    document.querySelectorAll('._cp_selected').forEach(function(e) { e.classList.remove('_cp_selected'); });
    el.classList.add('_cp_selected');
    document.querySelectorAll('.cp-item').forEach(function(li) {
      li.classList.remove('active');
      if (li.dataset.sel === selector) { li.classList.add('active'); activeItem = li; li.scrollIntoView({ block:'nearest' }); }
    });
    window.parent.postMessage({ type:'cms-element-click', selector, geoName:geo, tagName:el.tagName.toLowerCase(), text:(el.textContent||'').trim().slice(0,80) }, '*');
  }, true);

  window.addEventListener('message', function(e) {
    if (!e.data) return;
    if (e.data.type === 'cms-update-mappings') { mappings = e.data.mappings || []; updateCount(); applyMapped(); }
    if (e.data.type === 'cms-select-slot') {
      var sel = e.data.selector;
      document.querySelectorAll('._cp_selected').forEach(function(el) { el.classList.remove('_cp_selected'); });
      try {
        var t = document.querySelector(sel);
        if (t) { t.classList.add('_cp_selected'); t.scrollIntoView({ behavior:'smooth', block:'center' }); }
      } catch(err) {}
      document.querySelectorAll('.cp-item').forEach(function(li) {
        li.classList.remove('active');
        if (li.dataset.sel === sel) { li.classList.add('active'); activeItem = li; li.scrollIntoView({ block:'nearest' }); }
      });
    }
  });

  function init() {
    buildPanel();
    window.parent.postMessage({ type:'cms-slots-ready', slots:SLOTS }, '*');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
</script>`
}

// ─── Load HTML from Supabase by page_id ──────────────────────────────────────
async function fetchPageHtml(pageId) {
  const url = `${SUPABASE_URL}/rest/v1/cms_pages?id=eq.${encodeURIComponent(pageId)}&select=html&limit=1`
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  })
  if (!res.ok) return null
  const rows = await res.json()
  return rows[0]?.html || null
}

// ─── Handler ─────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const { template, page_id, embedded } = req.query
  const isEmbedded = embedded === '1'

  let html

  if (page_id) {
    html = await fetchPageHtml(page_id)
    if (!html) {
      return res.status(404).send(`<html><body style="font-family:sans-serif;padding:2rem;color:#6b7280">
        <p>Page introuvable : <code>${page_id}</code></p></body></html>`)
    }
  } else {
    // Legacy: load from local file (formation / traversee templates)
    const name = (template === 'traversée' || template === 'traversee') ? 'traversee' : 'formation'
    try {
      html = readFileSync(join(__dirname, 'templates', `${name}.html`), 'utf8')
    } catch {
      return res.status(404).send(`<html><body style="font-family:sans-serif;padding:2rem;color:#6b7280">
        <p>Template introuvable : <code>${name}</code></p></body></html>`)
    }
  }

  // Strip iframe-blocking headers
  html = html.replace(/<meta[^>]+http-equiv=["']?[Xx]-[Ff]rame-[Oo]ptions["']?[^>]*>/gi, '')
  html = html.replace(/<meta[^>]+[Cc]ontent-[Ss]ecurity-[Pp]olicy[^>]*>/gi, '')

  const slots = detectGeoSlots(html)
  html = html.replace('</body>', buildPickerInject(slots, isEmbedded) + '\n</body>')

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
  res.setHeader('Content-Security-Policy', "frame-ancestors *")
  res.status(200).send(html)
}
