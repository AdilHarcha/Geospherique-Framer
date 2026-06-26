import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { load } from 'cheerio'

const __dirname = dirname(fileURLToPath(import.meta.url))

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://boszjuorhmpgzultsanu.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJvc3pqdW9yaG1wZ3p1bHRzYW51Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1ODczODQsImV4cCI6MjA4NDE2MzM4NH0.D3gP76reh7U_g0RqJm_RV3u0232HDv9HikqnYAeBJhc'

const MOBILE_CLASS = 'hidden-1ikagkv'

// Generic Framer layer names to skip (auto-generated, not meaningful)
const GENERIC_RE = /^(frame|stack|container|group|section|rectangle|ellipse|polygon|vector|image|text|div|row|column|grid|flex|layout|component|variant|layer|page|slide|card|item|cell|icon|button|link|nav|header|footer|hero|banner|wrapper|inner|outer|content|background|overlay|spacer|separator|divider)\s*\d*$/i

function isMobileEl($, el) {
  let node = el
  while (node && node.tagName) {
    if (($(node).attr('class') || '').split(/\s+/).includes(MOBILE_CLASS)) return true
    node = node.parent
  }
  return false
}

function elType($, el) {
  const $el = $(el)
  if (el.tagName === 'a' || el.tagName === 'A') return 'link'
  if (el.tagName === 'img' || el.tagName === 'IMG') return 'image'
  if ($el.find('img').length && !$el.text().trim()) return 'image'
  if ($el.find('a').length === $el.children().length) return 'link'
  return 'text'
}

function elPreview($, el, type) {
  const $el = $(el)
  if (type === 'image') {
    const img = $el.is('img') ? $el : $el.find('img').first()
    return img.attr('alt') || img.attr('src')?.split('/').pop()?.split('?')[0] || ''
  }
  if (type === 'link') {
    return $el.text().trim().replace(/\s+/g, ' ').slice(0, 50) || $el.attr('href') || ''
  }
  return $el.text().trim().replace(/\s+/g, ' ').slice(0, 60)
}

// ─── Auto-detect elements from Framer HTML ───────────────────────────────────
function detectGeoSlots(html) {
  const $ = load(html)
  const slots = []
  const seenSel = new Set()

  function addSlot(name, sel, type, preview) {
    if (seenSel.has(sel)) return
    seenSel.add(sel)
    slots.push({ name, type, sel, preview })
  }

  // 1. Named Framer layers (data-framer-name) — user-defined names in layers panel
  $('[data-framer-name]').each((_, el) => {
    if (isMobileEl($, el)) return
    const name = $(el).attr('data-framer-name') || ''
    if (!name || GENERIC_RE.test(name.trim())) return
    const sel = `[data-framer-name="${name}"]`
    const type = elType($, el)
    const preview = elPreview($, el, type)
    addSlot(name, sel, type, preview)
  })

  // 2. Headings with id (h1–h3)
  $('h1,h2,h3').each((_, el) => {
    if (isMobileEl($, el)) return
    const id = $(el).attr('id')
    const text = $(el).text().trim().replace(/\s+/g, ' ')
    if (!text) return
    const sel = id ? `#${id}` : null
    if (!sel) return
    addSlot(`<${el.tagName.toLowerCase()}>`, sel, 'text', text.slice(0, 60))
  })

  // 3. Top-level <a> with href
  $('a[href]').each((_, el) => {
    if (isMobileEl($, el)) return
    const href = $(el).attr('href') || ''
    if (!href || href === '#') return
    const text = $(el).text().trim().replace(/\s+/g, ' ').slice(0, 40) || href
    const id = $(el).attr('id')
    const sel = id ? `#${id}` : `a[href="${href}"]`
    addSlot(text || href, sel, 'link', text || href)
  })

  // 4. <img> with meaningful src
  $('img').each((_, el) => {
    if (isMobileEl($, el)) return
    const src = $(el).attr('src') || ''
    if (!src || src.startsWith('data:')) return
    const id = $(el).attr('id')
    const alt = $(el).attr('alt') || src.split('/').pop()?.split('?')[0] || 'image'
    const sel = id ? `#${id}` : `img[src="${src.split('?')[0]}"]`
    addSlot(alt, sel, 'image', alt)
  })

  return {
    texts: slots.filter(s => s.type === 'text'),
    images: slots.filter(s => s.type === 'image'),
    links: slots.filter(s => s.type === 'link'),
    collections: slots.filter(s => s.type === 'collection'),
  }
}

// ─── DevTools injection (embedded=1 only) ────────────────────────────────────
function buildPickerInject() {
  return `
<style id="_cp_style">
  ._cp_hover { outline: 2px solid #6366f1 !important; outline-offset: 1px !important; cursor: crosshair !important; }
  ._cp_selected { outline: 2px solid #f59e0b !important; outline-offset: 2px !important; }
  @keyframes _cp_flash { 0%,100%{box-shadow:0 0 0 0 rgba(245,158,11,0)} 35%{box-shadow:0 0 0 14px rgba(245,158,11,0.4)} 65%{box-shadow:0 0 0 6px rgba(245,158,11,0.12)} }
  ._cp_flash { animation: _cp_flash 1s ease-out !important; }

  #_cp_bar {
    position: fixed; bottom: 0; left: 0; right: 340px; z-index: 2147483646;
    background: rgba(8,8,14,0.95); backdrop-filter: blur(10px);
    padding: 7px 14px; display: flex; align-items: center; gap: 10px;
    font-family: 'SF Mono',monospace; font-size: 11px; color: #6b7280;
    border-top: 1px solid rgba(255,255,255,0.06); pointer-events: none;
  }
  #_cp_bar_tag { color: #818cf8; flex-shrink: 0; }
  #_cp_bar_name { color: #f59e0b; flex-shrink: 0; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #_cp_bar_text { color: #9ca3af; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }

  #_cp_panel {
    position: fixed; top: 0; right: 0; bottom: 0; width: 340px; z-index: 2147483647;
    background: #0b0b10; border-left: 1px solid rgba(255,255,255,0.07);
    font-family: 'SF Mono',monospace; font-size: 11px; color: #9ca3af;
    display: flex; flex-direction: column; overflow: hidden;
  }
  #_cp_header {
    padding: 9px 12px; border-bottom: 1px solid rgba(255,255,255,0.07);
    font-family: -apple-system,sans-serif; font-size: 11px; font-weight: 600;
    color: #e5e7eb; flex-shrink: 0; display: flex; align-items: center; gap: 6px;
  }
  #_cp_header span { font-size: 9px; color: #374151; font-weight: 400; margin-left: auto; }
  #_cp_breadcrumb {
    padding: 5px 12px; border-bottom: 1px solid rgba(255,255,255,0.04);
    font-size: 10px; color: #374151; overflow: hidden; text-overflow: ellipsis;
    white-space: nowrap; flex-shrink: 0; min-height: 26px; display: flex; align-items: center;
  }
  #_cp_tree { flex: 1; overflow-y: auto; padding: 2px 0 32px; }
  #_cp_tree::-webkit-scrollbar { width: 3px; }
  #_cp_tree::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }

  .dn { user-select: none; }
  .dn-row {
    display: flex; align-items: center; gap: 3px; cursor: pointer;
    padding: 2px 0; border-left: 2px solid transparent; min-height: 22px;
  }
  .dn-row:hover { background: rgba(255,255,255,0.05); }
  .dn-row.dn-active { background: rgba(245,158,11,0.1); border-left-color: #f59e0b; }
  .dn-row.dn-hover { background: rgba(99,102,241,0.08); border-left-color: #6366f1; }
  .dn-toggle {
    width: 20px; height: 20px; flex-shrink: 0; display: flex;
    align-items: center; justify-content: center; color: #6b7280; font-size: 10px;
    border-radius: 3px;
  }
  .dn-toggle:hover { color: #e5e7eb; background: rgba(255,255,255,0.08); }
  .dn-tag { color: #818cf8; }
  .dn-fname {
    font-family: -apple-system,sans-serif; font-size: 9px; font-weight: 500;
    background: rgba(245,158,11,0.18); color: #f59e0b;
    padding: 1px 4px; border-radius: 3px; flex-shrink: 0;
    max-width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .dn-id { color: #34d399; font-size: 10px; }
  .dn-preview { color: #6b7280; font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
  .dn-children { }
</style>

<div id="_cp_bar">
  <span id="_cp_bar_tag">&lt;body&gt;</span>
  <span id="_cp_bar_name"></span>
  <span id="_cp_bar_text">Survolez ou cliquez un élément</span>
</div>

<div id="_cp_panel">
  <div id="_cp_header">⚙ DevTools <span id="_cp_header_hint">Cliquez pour sélectionner</span></div>
  <div id="_cp_breadcrumb">document › body</div>
  <div id="_cp_tree"></div>
</div>

<script>
(function () {
  var SKIP_TAGS = { SCRIPT:1, STYLE:1, NOSCRIPT:1, META:1, LINK:1, HEAD:1 };
  var selectedEl = null;
  var hoveredEl = null;
  var elToRow = new WeakMap();

  // ── Build stable CSS selector ─────────────────────────────────────────────
  function buildSel(el) {
    var fname = el.getAttribute && el.getAttribute('data-framer-name');
    if (fname) return '[data-framer-name="' + fname.replace(/\\\\/g,'\\\\\\\\').replace(/"/g,'\\\\"') + '"]';
    if (el.id && !/^_cp/.test(el.id)) return '#' + el.id;
    var parts = [], node = el;
    while (node && node !== document.body && node.tagName) {
      var tag = node.tagName.toLowerCase();
      var idx = 1, sib = node.previousElementSibling;
      while (sib) { idx++; sib = sib.previousElementSibling; }
      parts.unshift(tag + ':nth-child(' + idx + ')');
      node = node.parentElement;
    }
    return parts.length ? 'body > ' + parts.join(' > ') : 'body';
  }

  // ── Flash + select on page ────────────────────────────────────────────────
  function flashEl(el) {
    el.classList.remove('_cp_flash');
    void el.offsetWidth;
    el.classList.add('_cp_flash');
    el.addEventListener('animationend', function() { el.classList.remove('_cp_flash'); }, { once: true });
  }

  function scrollToEl(el) {
    var rect = el.getBoundingClientRect();
    window.scrollTo({ top: Math.max(0, rect.top + window.scrollY - window.innerHeight / 2 + rect.height / 2), behavior: 'smooth' });
  }

  function selectPageEl(el) {
    if (selectedEl) selectedEl.classList.remove('_cp_selected');
    selectedEl = el;
    el.classList.add('_cp_selected');
    flashEl(el);
    scrollToEl(el);
    updateBreadcrumb(el);
    // Highlight tree row
    var row = elToRow.get(el);
    document.querySelectorAll('.dn-row.dn-active').forEach(function(r) { r.classList.remove('dn-active'); });
    if (row) { row.classList.add('dn-active'); row.scrollIntoView({ block:'nearest', behavior:'smooth' }); }
    // Notify parent
    window.parent.postMessage({
      type: 'cms-element-selected',
      selector: buildSel(el),
      tagName: el.tagName.toLowerCase(),
      framerName: el.getAttribute('data-framer-name') || '',
      id: el.id || '',
      text: (el.textContent || '').trim().replace(/\\s+/g,' ').slice(0, 80),
      outerHTMLPreview: el.outerHTML.slice(0, 400),
    }, '*');
  }

  // ── Breadcrumb ────────────────────────────────────────────────────────────
  function updateBreadcrumb(el) {
    var bc = document.getElementById('_cp_breadcrumb');
    if (!bc) return;
    var parts = [], node = el;
    while (node && node.tagName && node !== document.documentElement) {
      var fname = node.getAttribute('data-framer-name');
      parts.unshift(fname
        ? '<span style="color:#f59e0b">' + escHtml(fname) + '</span>'
        : '<span style="color:#818cf8">' + node.tagName.toLowerCase() + '</span>');
      node = node.parentElement;
    }
    bc.innerHTML = 'doc › ' + parts.join(' › ');
  }

  function escHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  // ── Build tree node (lazy) ────────────────────────────────────────────────
  function buildRow(el, depth) {
    var wrapper = document.createElement('div');
    wrapper.className = 'dn';

    var row = document.createElement('div');
    row.className = 'dn-row';
    row.style.paddingLeft = (depth * 13 + 4) + 'px';

    var hasKids = el.children.length > 0;
    var toggle = document.createElement('span');
    toggle.className = 'dn-toggle';
    toggle.textContent = hasKids ? '▶' : '';

    var tagSpan = document.createElement('span');
    tagSpan.className = 'dn-tag';
    tagSpan.textContent = '<' + el.tagName.toLowerCase() + '>';

    var fname = el.getAttribute('data-framer-name');
    var fspan = null;
    if (fname) {
      fspan = document.createElement('span');
      fspan.className = 'dn-fname';
      fspan.textContent = fname;
    }

    var idattr = el.id && !/^_cp/.test(el.id) ? el.id : '';
    var idspan = null;
    if (idattr) {
      idspan = document.createElement('span');
      idspan.className = 'dn-id';
      idspan.textContent = '#' + idattr;
    }

    // Text preview (only leaf nodes or short text)
    var preview = null;
    if (!hasKids) {
      var txt = (el.textContent || '').trim().replace(/\\s+/g,' ').slice(0, 28);
      if (txt) {
        preview = document.createElement('span');
        preview.className = 'dn-preview';
        preview.textContent = '"' + txt + '"';
      }
    }

    row.appendChild(toggle);
    row.appendChild(tagSpan);
    if (fspan) row.appendChild(fspan);
    if (idspan) row.appendChild(idspan);
    if (preview) row.appendChild(preview);

    var childrenDiv = document.createElement('div');
    childrenDiv.className = 'dn-children';
    childrenDiv.style.display = 'none';
    var expanded = false;

    elToRow.set(el, row);

    function expandToggle() {
      if (!hasKids) return;
      expanded = !expanded;
      toggle.textContent = expanded ? '▼' : '▶';
      if (expanded && !childrenDiv.hasChildNodes()) {
        for (var i = 0; i < el.children.length; i++) {
          var c = el.children[i];
          if (SKIP_TAGS[c.tagName] || (c.id && c.id.startsWith('_cp'))) continue;
          childrenDiv.appendChild(buildRow(c, depth + 1));
        }
      }
      childrenDiv.style.display = expanded ? '' : 'none';
    }

    toggle.addEventListener('click', function(e) {
      e.stopPropagation();
      expandToggle();
    });

    row.addEventListener('click', function(e) {
      e.stopPropagation();
      selectPageEl(el);
      // Auto-expand children on row click so user can drill down immediately
      if (hasKids && !expanded) expandToggle();
    });

    wrapper.appendChild(row);
    wrapper.appendChild(childrenDiv);
    return wrapper;
  }

  // ── Page hover ────────────────────────────────────────────────────────────
  function isCpEl(el) {
    var p = el;
    while (p) { if (p.id && p.id.startsWith('_cp')) return true; p = p.parentElement; }
    return false;
  }

  document.addEventListener('mouseover', function(e) {
    var el = e.target;
    if (!el || !el.tagName || SKIP_TAGS[el.tagName] || isCpEl(el)) return;
    if (hoveredEl && hoveredEl !== el) hoveredEl.classList.remove('_cp_hover');
    hoveredEl = el; el.classList.add('_cp_hover');
    // Status bar
    var fname = el.getAttribute('data-framer-name') || '';
    var tag = document.getElementById('_cp_bar_tag');
    var name = document.getElementById('_cp_bar_name');
    var txt = document.getElementById('_cp_bar_text');
    if (tag) { tag.textContent = '<' + el.tagName.toLowerCase() + '>'; }
    if (name) { name.textContent = fname; }
    if (txt) { txt.textContent = (el.textContent || '').trim().replace(/\\s+/g,' ').slice(0, 55); }
    // Tree row highlight
    document.querySelectorAll('.dn-row.dn-hover').forEach(function(r) { r.classList.remove('dn-hover'); });
    var row = elToRow.get(el);
    if (row && !row.classList.contains('dn-active')) {
      row.classList.add('dn-hover');
      row.scrollIntoView({ block:'nearest', behavior:'smooth' });
    }
  }, { passive: true });

  document.addEventListener('mouseout', function(e) {
    if (hoveredEl && e.target === hoveredEl) {
      hoveredEl.classList.remove('_cp_hover'); hoveredEl = null;
    }
  }, { passive: true });

  // ── Page click ────────────────────────────────────────────────────────────
  document.addEventListener('click', function(e) {
    var el = e.target;
    if (!el || !el.tagName || SKIP_TAGS[el.tagName] || isCpEl(el)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    selectPageEl(el);
  }, true);

  // ── Apply action to el + its mobile twin (same data-framer-name) ─────────
  function applyAction(action, el) {
    var targets = [el];
    var fname = el && el.getAttribute && el.getAttribute('data-framer-name');
    if (fname) {
      document.querySelectorAll('[data-framer-name="' + fname.replace(/"/g, '\\"') + '"]').forEach(function(other) {
        if (other !== el) targets.push(other);
      });
    }
    targets.forEach(function(t) {
      if (action === 'hide') {
        t.style.display = t.style.display === 'none' ? '' : 'none';
      } else if (action === 'delete') {
        t.remove();
      }
    });
  }

  // ── Messages from parent ──────────────────────────────────────────────────
  window.addEventListener('message', function(e) {
    if (!e.data || !e.data.type) return;
    if (e.data.type === 'cms-action') {
      if (!selectedEl) return;
      applyAction(e.data.action, selectedEl);
      if (e.data.action === 'delete') selectedEl = null;
      window.parent.postMessage({ type:'cms-html-updated', html:'<!DOCTYPE html>' + document.documentElement.outerHTML }, '*');
    }
  });

  // ── Init ──────────────────────────────────────────────────────────────────
  function buildTree() {
    var tree = document.getElementById('_cp_tree');
    if (!tree || tree.hasChildNodes()) return;
    var body = document.body;
    if (!body) return;
    for (var i = 0; i < body.children.length; i++) {
      var c = body.children[i];
      if (SKIP_TAGS[c.tagName] || (c.id && c.id.startsWith('_cp'))) continue;
      tree.appendChild(buildRow(c, 0));
    }
    window.parent.postMessage({ type:'cms-devtools-ready' }, '*');
  }

  function init() {
    // Try immediately, then retry after paint to handle slow static HTML parsing
    buildTree();
    if (!document.getElementById('_cp_tree').hasChildNodes()) {
      requestAnimationFrame(function() {
        buildTree();
        // Final fallback after 300ms
        setTimeout(buildTree, 300);
      });
    }
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

  // Parse with cheerio — strip scripts, meta restrictions, inject DevTools if embedded
  const $ = load(html)
  $('script').remove()
  $('meta[http-equiv]').filter((_, el) => {
    const v = ($(el).attr('http-equiv') || '').toLowerCase()
    return v === 'x-frame-options' || v === 'content-security-policy'
  }).remove()

  if (isEmbedded) {
    $('body').append(buildPickerInject())
  }

  html = $.html()

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
  res.setHeader('Content-Security-Policy', "frame-ancestors *")
  res.status(200).send(html)
}
