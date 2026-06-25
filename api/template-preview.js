import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { load } from 'cheerio'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ─── Auto-detect connection points from template HTML ───────────────────────

function detectSlots(html) {
  const $ = load(html)
  const texts = []
  const images = []
  const links = []

  const SKIP_TAGS = new Set(['html','head','body','script','style','meta','link','noscript','svg','path','circle','rect','line','polygon'])
  const SKIP_ID_RE = /^_cp|__geo|__framer/

  function getSelector(el) {
    const id = $(el).attr('id')
    if (id && !SKIP_ID_RE.test(id)) return '#' + id
    const tag = el.tagName.toLowerCase()
    const cls = ($(el).attr('class') || '').split(/\s+/).filter(c => c && !SKIP_ID_RE.test(c)).slice(0, 2).map(c => '.' + c).join('')
    return tag + cls
  }

  // Text slots — leaf nodes with visible text content
  $('*').each((_, el) => {
    const tag = el.tagName ? el.tagName.toLowerCase() : ''
    if (SKIP_TAGS.has(tag)) return
    const $el = $(el)
    if ($el.children().length > 0) return // not a leaf
    const text = $el.text().trim().replace(/\s+/g, ' ')
    if (!text || text.length < 2) return
    // skip if inside badge or picker UI
    if ($el.closest('[id*="geo-badge"],[id*="framer-badge"],[id^="_cp"]').length) return
    texts.push({ sel: getSelector(el), tag, preview: text.slice(0, 60) })
  })

  // Image slots
  $('img').each((_, el) => {
    const $el = $(el)
    const src = $el.attr('src') || ''
    const alt = $el.attr('alt') || ''
    if (!src) return
    const preview = alt || src.split('/').pop().split('?')[0].slice(0, 40)
    images.push({ sel: getSelector(el), tag: 'img', preview })
  })

  // Background-image elements
  $('[style]').each((_, el) => {
    const style = $(el).attr('style') || ''
    if (!style.includes('background-image') || !style.includes('url(')) return
    const m = style.match(/url\(['"]?([^'")\s]+)/)
    if (!m) return
    const preview = m[1].split('/').pop().split('?')[0].slice(0, 40)
    images.push({ sel: getSelector(el), tag: 'bg-img', preview })
  })

  // Link slots
  $('a[href]').each((_, el) => {
    const $el = $(el)
    const href = $el.attr('href') || ''
    if (!href || href.startsWith('#') || href.startsWith('javascript')) return
    const text = $el.text().trim().replace(/\s+/g, ' ').slice(0, 40) || href.slice(0, 40)
    links.push({ sel: getSelector(el), tag: 'a', preview: text, href })
  })

  // Deduplicate by selector
  function dedup(arr) {
    const seen = new Set()
    return arr.filter(x => { if (seen.has(x.sel)) return false; seen.add(x.sel); return true })
  }

  return { texts: dedup(texts), images: dedup(images), links: dedup(links) }
}

// ─── Picker + side panel injection ─────────────────────────────────────────

function buildPickerInject(slots) {
  const slotsJson = JSON.stringify(slots)

  return `
<style id="_cp_style">
  ._cp_hover { outline: 2px solid #6366f1 !important; outline-offset: 1px !important; cursor: crosshair !important; }
  ._cp_mapped { outline: 2px solid #10b981 !important; outline-offset: 1px !important; }
  ._cp_selected { outline: 3px solid #f59e0b !important; outline-offset: 2px !important; }

  #_cp_bar {
    position: fixed; bottom: 0; left: 0; right: 360px; z-index: 2147483646;
    background: rgba(10,10,15,0.92); backdrop-filter: blur(10px);
    padding: 9px 16px; display: flex; align-items: center; gap: 12px;
    font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    font-size: 12px; color: #6b7280;
    border-top: 1px solid rgba(255,255,255,0.06); pointer-events: none;
  }
  #_cp_bar_info { flex: 1; display: flex; align-items: center; gap: 8px; overflow: hidden; }
  #_cp_bar_tag { color: #818cf8; font-family: 'SF Mono',monospace; font-size: 11px; flex-shrink: 0; }
  #_cp_bar_text { color: #d1d5db; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #_cp_bar_dot { width: 6px; height: 6px; border-radius: 50%; background: #6366f1; flex-shrink: 0; }
  #_cp_count { background: #10b981; color: white; border-radius: 999px; padding: 2px 10px; font-size: 11px; font-weight: 600; flex-shrink: 0; }

  /* Side panel */
  #_cp_panel {
    position: fixed; top: 0; right: 0; bottom: 0;
    width: 360px; z-index: 2147483647;
    background: rgba(8,8,12,0.97); backdrop-filter: blur(12px);
    border-left: 1px solid rgba(255,255,255,0.07);
    font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    font-size: 12px; color: #9ca3af;
    display: flex; flex-direction: column;
    overflow: hidden;
  }
  #_cp_panel_header {
    padding: 14px 16px 12px;
    border-bottom: 1px solid rgba(255,255,255,0.07);
    display: flex; align-items: center; justify-content: space-between; flex-shrink: 0;
  }
  #_cp_panel_header h2 { margin:0; font-size: 13px; font-weight: 600; color: #e5e7eb; letter-spacing: .02em; }
  #_cp_panel_body { flex: 1; overflow-y: auto; padding: 8px 0 60px; }
  #_cp_panel_body::-webkit-scrollbar { width: 4px; }
  #_cp_panel_body::-webkit-scrollbar-track { background: transparent; }
  #_cp_panel_body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }

  .cp-section { border-bottom: 1px solid rgba(255,255,255,0.05); }
  .cp-section-header {
    padding: 10px 16px; display: flex; align-items: center; gap: 8px;
    cursor: pointer; user-select: none; transition: background .15s;
  }
  .cp-section-header:hover { background: rgba(255,255,255,0.03); }
  .cp-section-icon { font-size: 14px; width: 20px; text-align: center; flex-shrink: 0; }
  .cp-section-title { flex: 1; font-size: 12px; font-weight: 600; color: #d1d5db; }
  .cp-section-badge {
    font-size: 10px; font-weight: 600; padding: 1px 7px; border-radius: 999px;
    background: rgba(99,102,241,0.2); color: #818cf8;
  }
  .cp-section-arrow { color: #4b5563; font-size: 10px; transition: transform .2s; }
  .cp-section.open .cp-section-arrow { transform: rotate(90deg); }
  .cp-section-items { display: none; }
  .cp-section.open .cp-section-items { display: block; }

  .cp-item {
    padding: 7px 16px 7px 44px; display: flex; align-items: center; gap: 8px;
    cursor: pointer; transition: background .12s; border-radius: 0;
  }
  .cp-item:hover { background: rgba(255,255,255,0.04); }
  .cp-item.active { background: rgba(245,158,11,0.1); }
  .cp-item.mapped { background: rgba(16,185,129,0.07); }
  .cp-item-tag {
    font-size: 10px; font-family: 'SF Mono',monospace; color: #6366f1;
    background: rgba(99,102,241,0.1); padding: 1px 5px; border-radius: 3px; flex-shrink: 0;
  }
  .cp-item-tag.img-tag { color: #f59e0b; background: rgba(245,158,11,0.1); }
  .cp-item-tag.link-tag { color: #10b981; background: rgba(16,185,129,0.1); }
  .cp-item-preview { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #9ca3af; font-size: 11px; }
  .cp-item-dot { width: 5px; height: 5px; border-radius: 50%; background: #10b981; flex-shrink: 0; display: none; }
  .cp-item.mapped .cp-item-dot { display: block; }

  #_cp_empty_notice {
    padding: 32px 16px; text-align: center; color: #4b5563; font-size: 11px; line-height: 1.6;
  }
</style>

<div id="_cp_bar">
  <div id="_cp_bar_dot"></div>
  <div id="_cp_bar_info"><span>Survolez et cliquez un élément pour l'assigner</span></div>
  <span id="_cp_count">0 mappé</span>
</div>

<div id="_cp_panel">
  <div id="_cp_panel_header">
    <h2>Connexions CMS</h2>
    <span id="_cp_mapped_total" style="font-size:11px;color:#4b5563;">0 / 0 mappés</span>
  </div>
  <div id="_cp_panel_body">
    <div id="_cp_empty_notice">Chargement des emplacements…</div>
  </div>
</div>

<script>
(function () {
  var SKIP = { HTML:1,BODY:1,HEAD:1,SCRIPT:1,STYLE:1,META:1,LINK:1,NOSCRIPT:1 };
  var SLOTS = ${slotsJson};
  var mappings = [];
  var hovered = null;
  var activeItem = null;

  // ── Utilities ────────────────────────────────────────────────────────────
  function updateCount() {
    var n = mappings.length;
    var total = SLOTS.texts.length + SLOTS.images.length + SLOTS.links.length;
    var el = document.getElementById('_cp_count');
    if (el) el.textContent = n + (n > 1 ? ' mappés' : ' mappé');
    var tot = document.getElementById('_cp_mapped_total');
    if (tot) tot.textContent = n + ' / ' + total + ' mappés';
  }

  function applyMapped() {
    document.querySelectorAll('._cp_mapped').forEach(function(el) { el.classList.remove('_cp_mapped'); });
    mappings.forEach(function(m) {
      if (!m.selector) return;
      try { var el = document.querySelector(m.selector); if (el) el.classList.add('_cp_mapped'); } catch(e) {}
    });
    document.querySelectorAll('.cp-item').forEach(function(li) {
      var sel = li.dataset.sel;
      var isMapped = mappings.some(function(m) { return m.selector === sel; });
      li.classList.toggle('mapped', isMapped);
    });
  }

  function getSelector(el) {
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
      if (node.parentNode) {
        var sibs = Array.prototype.filter.call(node.parentNode.children, function(c){ return c.tagName===node.tagName; });
        if (sibs.length > 1) sel += ':nth-of-type(' + (sibs.indexOf(node)+1) + ')';
      }
      parts.unshift(sel); node = node.parentNode;
    }
    return parts.join(' > ');
  }

  function isSkipped(el) {
    if (!el || !el.tagName) return true;
    if (SKIP[el.tagName]) return true;
    if (el.id && /^_cp/.test(el.id)) return true;
    var p = el; while(p) { if (p.id === '_cp_bar' || p.id === '_cp_panel') return true; p = p.parentElement; }
    return false;
  }

  function scrollToSelector(sel) {
    try {
      var el = document.querySelector(sel);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    } catch(e) {}
  }

  function selectItem(li) {
    if (activeItem) activeItem.classList.remove('active');
    activeItem = li;
    li.classList.add('active');
    scrollToSelector(li.dataset.sel);
    var sel = li.dataset.sel;
    var tag = li.dataset.tag;
    var existing = null;
    for (var i = 0; i < mappings.length; i++) { if (mappings[i].selector === sel) { existing = mappings[i]; break; } }
    document.querySelectorAll('._cp_selected').forEach(function(e) { e.classList.remove('_cp_selected'); });
    try { var target = document.querySelector(sel); if (target) target.classList.add('_cp_selected'); } catch(e) {}
    window.parent.postMessage({
      type: 'cms-element-click',
      selector: sel, tagName: tag,
      text: li.dataset.preview || '',
      src: li.dataset.href || '',
      isImg: tag === 'img' || tag === 'bg-img',
      existingMapping: existing
    }, '*');
  }

  // ── Build side panel ─────────────────────────────────────────────────────
  function buildPanel() {
    var body = document.getElementById('_cp_panel_body');
    if (!body) return;
    body.innerHTML = '';

    var sections = [
      { key: 'texts',  icon: '✦', label: 'Textes',  tagClass: '',          items: SLOTS.texts  },
      { key: 'images', icon: '◻', label: 'Images',  tagClass: 'img-tag',   items: SLOTS.images },
      { key: 'links',  icon: '⤷', label: 'Liens',   tagClass: 'link-tag',  items: SLOTS.links  },
    ];

    sections.forEach(function(sec) {
      if (!sec.items.length) return;
      var div = document.createElement('div');
      div.className = 'cp-section open';
      var header = document.createElement('div');
      header.className = 'cp-section-header';
      header.innerHTML =
        '<span class="cp-section-icon">' + sec.icon + '</span>' +
        '<span class="cp-section-title">' + sec.label + '</span>' +
        '<span class="cp-section-badge">' + sec.items.length + '</span>' +
        '<span class="cp-section-arrow">▶</span>';
      var itemsDiv = document.createElement('div');
      itemsDiv.className = 'cp-section-items';

      sec.items.forEach(function(slot) {
        var li = document.createElement('div');
        li.className = 'cp-item';
        li.dataset.sel = slot.sel;
        li.dataset.tag = slot.tag;
        li.dataset.preview = slot.preview;
        if (slot.href) li.dataset.href = slot.href;
        li.innerHTML =
          '<span class="cp-item-tag ' + sec.tagClass + '">' + slot.tag + '</span>' +
          '<span class="cp-item-preview">' + slot.preview.replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</span>' +
          '<span class="cp-item-dot"></span>';
        li.addEventListener('click', function() { selectItem(li); });
        itemsDiv.appendChild(li);
      });

      header.addEventListener('click', function() {
        div.classList.toggle('open');
      });

      div.appendChild(header);
      div.appendChild(itemsDiv);
      body.appendChild(div);
    });

    updateCount();
  }

  // ── Page mouse events ────────────────────────────────────────────────────
  document.addEventListener('mouseover', function(e) {
    var el = e.target;
    if (isSkipped(el)) return;
    if (hovered && hovered !== el) hovered.classList.remove('_cp_hover');
    hovered = el;
    el.classList.add('_cp_hover');
    var info = document.getElementById('_cp_bar_info');
    if (info) {
      var tag = '<' + el.tagName.toLowerCase() + '>';
      var txt = (el.textContent || el.alt || '').trim().replace(/\\s+/g,' ').slice(0,60);
      info.innerHTML = '<span id="_cp_bar_tag">' + tag + '</span>' +
        (txt ? '<span id="_cp_bar_text">«\\u00a0' + txt + '\\u00a0»</span>' : '');
    }
  }, { passive: true });

  document.addEventListener('mouseout', function(e) {
    if (e.target === hovered) {
      hovered.classList.remove('_cp_hover'); hovered = null;
      var info = document.getElementById('_cp_bar_info');
      if (info) info.innerHTML = '<span>Survolez et cliquez un élément pour l\\'assigner</span>';
    }
  }, { passive: true });

  document.addEventListener('click', function(e) {
    var el = e.target;
    if (isSkipped(el)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    var selector = getSelector(el);
    var tagName = el.tagName.toLowerCase();
    var text = (el.textContent || '').trim().replace(/\\s+/g,' ').slice(0,80);
    var src = el.src || el.href || '';
    var bgImg = el.style && el.style.backgroundImage;
    var isImg = tagName === 'img' || !!bgImg || tagName === 'video' || tagName === 'picture';
    var existing = null;
    for (var i = 0; i < mappings.length; i++) { if (mappings[i].selector === selector) { existing = mappings[i]; break; } }
    document.querySelectorAll('._cp_selected').forEach(function(e) { e.classList.remove('_cp_selected'); });
    el.classList.add('_cp_selected');
    // Highlight matching item in panel
    document.querySelectorAll('.cp-item').forEach(function(li) {
      li.classList.remove('active');
      if (li.dataset.sel === selector) { li.classList.add('active'); activeItem = li; li.scrollIntoView({ block: 'nearest' }); }
    });
    window.parent.postMessage({ type: 'cms-element-click', selector, tagName, text, src, isImg, existingMapping: existing }, '*');
  }, true);

  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'cms-update-mappings') {
      mappings = e.data.mappings || [];
      updateCount(); applyMapped();
    }
  });

  // ── Init ─────────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildPanel);
  } else {
    buildPanel();
  }
})();
</script>
`
}

export default function handler(req, res) {
  const { template = 'formation' } = req.query
  const name = (template === 'traversée' || template === 'traversee') ? 'traversee' : 'formation'

  try {
    let html = readFileSync(join(__dirname, 'templates', `${name}.html`), 'utf8')

    // Strip X-Frame-Options/CSP meta that block iframe embedding
    html = html.replace(/<meta[^>]+http-equiv=["']?[Xx]-[Ff]rame-[Oo]ptions["']?[^>]*>/gi, '')
    html = html.replace(/<meta[^>]+[Cc]ontent-[Ss]ecurity-[Pp]olicy[^>]*>/gi, '')

    // Auto-detect slots from template HTML
    const slots = detectSlots(html)

    // Inject picker + panel before </body>
    html = html.replace('</body>', buildPickerInject(slots) + '\n</body>')

    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    res.setHeader('Content-Security-Policy', "frame-ancestors *")
    res.status(200).send(html)
  } catch (err) {
    console.error('template-preview error:', err)
    res.status(500).send(`<html><body style="font-family:sans-serif;padding:2rem">
      <p>Template introuvable : <code>${name}</code></p></body></html>`)
  }
}
