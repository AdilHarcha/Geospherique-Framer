import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { load } from 'cheerio'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ─── Auto-detect connection points from template HTML ───────────────────────

// Section names to skip when reading data-geo-name (too generic)
const SKIP_SECTION_NAMES = new Set(['desktop','phone','tablet','mobile','variant','container','frame','group'])
const SKIP_SECTION_RE = /^(variant|desktop|phone|tablet|mobile)\s/i

// Mobile-only variant class (hidden on desktop)
const MOBILE_CLASS = 'hidden-1ikagkv'

function isInsideMobile($, el) {
  let node = el
  while (node) {
    const cls = $(node).attr('class') || ''
    if (cls.split(/\s+/).includes(MOBILE_CLASS)) return true
    node = node.parent && node.parent.tagName ? node.parent : null
  }
  return false
}

function detectSlots(html) {
  const $ = load(html)

  const SKIP_TAGS = new Set(['html','head','body','script','style','meta','link','noscript','svg','path','circle','rect','line','polygon'])
  const SKIP_ID_RE = /^_cp|__geo|__framer/

  function getSelector(el) {
    const id = $(el).attr('id')
    if (id && !SKIP_ID_RE.test(id)) return '#' + id
    const tag = el.tagName.toLowerCase()
    const cls = ($(el).attr('class') || '').split(/\s+/).filter(c => c && !SKIP_ID_RE.test(c)).slice(0, 2).map(c => '.' + c).join('')
    return tag + cls
  }

  function getSectionName($el, idx) {
    // Walk descendants for meaningful data-geo-name
    let name = null
    $el.find('[data-geo-name]').each((_, el) => {
      const n = $(el).attr('data-geo-name') || ''
      if (!n || /^\d+$/.test(n)) return
      const lower = n.toLowerCase()
      if (SKIP_SECTION_NAMES.has(lower) || SKIP_SECTION_RE.test(n)) return
      name = n; return false // break
    })
    if (name) return name
    // Fallback to first h-tag text
    const hTag = $el.find('h1,h2,h3').first().text().trim().replace(/\s+/g,' ').slice(0, 40)
    if (hTag) return hTag
    return `Section ${idx + 1}`
  }

  function dedup(arr) {
    const seen = new Set()
    return arr.filter(x => { if (seen.has(x.sel)) return false; seen.add(x.sel); return true })
  }

  function collectInSection($container) {
    const texts = [], images = [], links = []

    // Text — leaf nodes
    $container.find('*').each((_, el) => {
      const tag = el.tagName ? el.tagName.toLowerCase() : ''
      if (SKIP_TAGS.has(tag)) return
      const $el = $(el)
      if ($el.children().length > 0) return
      const cls = $el.attr('class') || ''
      if (cls.split(/\s+/).includes(MOBILE_CLASS)) return
      if (isInsideMobile($, el)) return
      const text = $el.text().trim().replace(/\s+/g, ' ')
      if (!text || text.length < 2) return
      if ($el.closest('[id*="geo-badge"],[id*="framer-badge"],[id^="_cp"]').length) return
      texts.push({ sel: getSelector(el), tag, preview: text.slice(0, 60) })
    })

    // Images
    $container.find('img').each((_, el) => {
      if (isInsideMobile($, el)) return
      const $el = $(el)
      const src = $el.attr('src') || ''
      if (!src) return
      const alt = $el.attr('alt') || ''
      const preview = alt || src.split('/').pop().split('?')[0].slice(0, 40)
      images.push({ sel: getSelector(el), tag: 'img', preview })
    })

    // Background images
    $container.find('[style]').each((_, el) => {
      if (isInsideMobile($, el)) return
      const style = $(el).attr('style') || ''
      if (!style.includes('background-image') || !style.includes('url(')) return
      const m = style.match(/url\(['"]?([^'")\s]+)/)
      if (!m) return
      const preview = m[1].split('/').pop().split('?')[0].slice(0, 40)
      images.push({ sel: getSelector(el), tag: 'bg-img', preview })
    })

    // Links
    $container.find('a[href]').each((_, el) => {
      if (isInsideMobile($, el)) return
      const $el = $(el)
      const href = $el.attr('href') || ''
      if (!href || href.startsWith('#') || href.startsWith('javascript')) return
      const text = $el.text().trim().replace(/\s+/g, ' ').slice(0, 40) || href.slice(0, 40)
      links.push({ sel: getSelector(el), tag: 'a', preview: text, href })
    })

    return {
      texts: dedup(texts),
      images: dedup(images),
      links: dedup(links),
    }
  }

  // Find main container
  const $main = $('.geo-NVaL2')
  if (!$main.length) {
    // Fallback: single section with everything
    const all = collectInSection($('body'))
    return { sections: [{ id: 'sec_0', name: 'Contenu', ...all }] }
  }

  const sections = []
  $main.children().each((idx, el) => {
    const $el = $(el)
    const cls = $el.attr('class') || ''
    // Skip mobile-only sections at top level
    if (cls.split(/\s+/).includes(MOBILE_CLASS)) return

    const slots = collectInSection($el)
    const total = slots.texts.length + slots.images.length + slots.links.length
    if (total === 0) return

    const name = getSectionName($el, idx)
    sections.push({ id: `sec_${idx}`, name, ...slots })
  })

  // If no sections found, fallback
  if (sections.length === 0) {
    const all = collectInSection($('body'))
    return { sections: [{ id: 'sec_0', name: 'Contenu', ...all }] }
  }

  return { sections }
}

// ─── Picker + side panel injection ─────────────────────────────────────────

function buildPickerInject(slots, embedded = false) {
  const slotsJson = JSON.stringify(slots)

  return `
<style id="_cp_style">
  ._cp_hover { outline: 2px solid #6366f1 !important; outline-offset: 1px !important; cursor: crosshair !important; }
  ._cp_mapped { outline: 2px solid #10b981 !important; outline-offset: 1px !important; }
  ._cp_selected { outline: 3px solid #f59e0b !important; outline-offset: 2px !important; }

  #_cp_bar {
    position: fixed; bottom: 0; left: 0; right: ${embedded ? '0' : '360px'}; z-index: 2147483646;
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
    ${embedded ? 'display: none !important;' : ''}
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

  /* Page sections (grouped like Framer layers) */
  .cp-page-section { border-bottom: 1px solid rgba(255,255,255,0.05); }
  .cp-page-section-header {
    padding: 8px 16px 6px; display: flex; align-items: center; gap: 6px;
    cursor: pointer; user-select: none;
    background: rgba(255,255,255,0.02);
    border-left: 2px solid #6366f1;
  }
  .cp-page-section-header:hover { background: rgba(255,255,255,0.05); }
  .cp-page-section-name { flex: 1; font-size: 11px; font-weight: 600; color: #c4b5fd; letter-spacing: .03em; }
  .cp-page-section-badge { font-size: 10px; color: #4b5563; }
  .cp-page-section-arrow { color: #4b5563; font-size: 9px; transition: transform .2s; }
  .cp-page-section.open .cp-page-section-arrow { transform: rotate(90deg); }
  .cp-page-section-items { display: none; }
  .cp-page-section.open .cp-page-section-items { display: block; }

  /* Type sub-sections inside page sections */
  .cp-section { }
  .cp-section-header {
    padding: 6px 16px 5px 28px; display: flex; align-items: center; gap: 8px;
    cursor: pointer; user-select: none;
  }
  .cp-section-header:hover { background: rgba(255,255,255,0.02); }
  .cp-section-icon { font-size: 11px; width: 16px; text-align: center; flex-shrink: 0; color: #6b7280; }
  .cp-section-title { flex: 1; font-size: 10px; font-weight: 500; color: #6b7280; text-transform: uppercase; letter-spacing: .06em; }
  .cp-section-badge {
    font-size: 9px; font-weight: 600; padding: 1px 5px; border-radius: 999px;
    background: rgba(99,102,241,0.15); color: #818cf8;
  }
  .cp-section-arrow { color: #374151; font-size: 9px; transition: transform .2s; }
  .cp-section.open .cp-section-arrow { transform: rotate(90deg); }
  .cp-section-items { display: none; }
  .cp-section.open .cp-section-items { display: block; }

  .cp-item {
    padding: 6px 16px 6px 44px; display: flex; align-items: center; gap: 8px;
    cursor: pointer; transition: background .12s;
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
  function allItems() {
    var items = [];
    (SLOTS.sections || []).forEach(function(sec) {
      items = items.concat(sec.texts || [], sec.images || [], sec.links || []);
    });
    return items;
  }

  function updateCount() {
    var n = mappings.length;
    var total = allItems().length;
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

    var TYPE_DEFS = [
      { key: 'texts',  icon: '✦', label: 'Textes',  tagClass: ''         },
      { key: 'images', icon: '◻', label: 'Images',  tagClass: 'img-tag'  },
      { key: 'links',  icon: '⤷', label: 'Liens',   tagClass: 'link-tag' },
    ];

    (SLOTS.sections || []).forEach(function(pageSec) {
      var total = (pageSec.texts||[]).length + (pageSec.images||[]).length + (pageSec.links||[]).length;
      if (!total) return;

      var pageDiv = document.createElement('div');
      pageDiv.className = 'cp-page-section open';

      var pageHeader = document.createElement('div');
      pageHeader.className = 'cp-page-section-header';
      pageHeader.innerHTML =
        '<span class="cp-page-section-name">' + pageSec.name.replace(/</g,'&lt;') + '</span>' +
        '<span class="cp-page-section-badge">' + total + '</span>' +
        '<span class="cp-page-section-arrow">▶</span>';

      var pageItems = document.createElement('div');
      pageItems.className = 'cp-page-section-items';

      TYPE_DEFS.forEach(function(td) {
        var items = pageSec[td.key] || [];
        if (!items.length) return;

        var typeDiv = document.createElement('div');
        typeDiv.className = 'cp-section open';

        var typeHeader = document.createElement('div');
        typeHeader.className = 'cp-section-header';
        typeHeader.innerHTML =
          '<span class="cp-section-icon">' + td.icon + '</span>' +
          '<span class="cp-section-title">' + td.label + '</span>' +
          '<span class="cp-section-badge">' + items.length + '</span>' +
          '<span class="cp-section-arrow">▶</span>';

        var typeItems = document.createElement('div');
        typeItems.className = 'cp-section-items';

        items.forEach(function(slot) {
          var li = document.createElement('div');
          li.className = 'cp-item';
          li.dataset.sel = slot.sel;
          li.dataset.tag = slot.tag;
          li.dataset.preview = slot.preview;
          if (slot.href) li.dataset.href = slot.href;
          li.innerHTML =
            '<span class="cp-item-tag ' + td.tagClass + '">' + slot.tag + '</span>' +
            '<span class="cp-item-preview">' + slot.preview.replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</span>' +
            '<span class="cp-item-dot"></span>';
          li.addEventListener('click', function() { selectItem(li); });
          typeItems.appendChild(li);
        });

        typeHeader.addEventListener('click', function() { typeDiv.classList.toggle('open'); });
        typeDiv.appendChild(typeHeader);
        typeDiv.appendChild(typeItems);
        pageItems.appendChild(typeDiv);
      });

      pageHeader.addEventListener('click', function() { pageDiv.classList.toggle('open'); });
      pageDiv.appendChild(pageHeader);
      pageDiv.appendChild(pageItems);
      body.appendChild(pageDiv);
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
    document.querySelectorAll('.cp-item').forEach(function(li) {
      li.classList.remove('active');
      if (li.dataset.sel === selector) { li.classList.add('active'); activeItem = li; li.scrollIntoView({ block: 'nearest' }); }
    });
    window.parent.postMessage({ type: 'cms-element-click', selector, tagName, text, src, isImg, existingMapping: existing }, '*');
  }, true);

  window.addEventListener('message', function(e) {
    if (!e.data) return;
    if (e.data.type === 'cms-update-mappings') {
      mappings = e.data.mappings || [];
      updateCount(); applyMapped();
    }
    if (e.data.type === 'cms-select-slot') {
      var sel = e.data.selector;
      document.querySelectorAll('._cp_selected').forEach(function(el) { el.classList.remove('_cp_selected'); });
      try {
        var target = document.querySelector(sel);
        if (target) {
          target.classList.add('_cp_selected');
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          var info = document.getElementById('_cp_bar_info');
          if (info) {
            var tag = '<' + target.tagName.toLowerCase() + '>';
            var txt = (target.textContent || target.alt || '').trim().replace(/\\s+/g,' ').slice(0,60);
            info.innerHTML = '<span id="_cp_bar_tag">' + tag + '</span>' +
              (txt ? '<span id="_cp_bar_text">«\\u00a0' + txt + '\\u00a0»</span>' : '');
          }
          document.querySelectorAll('.cp-item').forEach(function(li) {
            li.classList.remove('active');
            if (li.dataset.sel === sel) { li.classList.add('active'); activeItem = li; li.scrollIntoView({ block: 'nearest' }); }
          });
        }
      } catch(err) {}
    }
  });

  // ── Init ─────────────────────────────────────────────────────────────────
  function init() {
    buildPanel();
    window.parent.postMessage({ type: 'cms-slots-ready', slots: SLOTS }, '*');
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
</script>
`
}

export default function handler(req, res) {
  const { template = 'formation', embedded } = req.query
  const name = (template === 'traversée' || template === 'traversee') ? 'traversee' : 'formation'
  const isEmbedded = embedded === '1'

  try {
    let html = readFileSync(join(__dirname, 'templates', `${name}.html`), 'utf8')

    // Strip X-Frame-Options/CSP meta that block iframe embedding
    html = html.replace(/<meta[^>]+http-equiv=["']?[Xx]-[Ff]rame-[Oo]ptions["']?[^>]*>/gi, '')
    html = html.replace(/<meta[^>]+[Cc]ontent-[Ss]ecurity-[Pp]olicy[^>]*>/gi, '')

    // Auto-detect slots from template HTML
    const slots = detectSlots(html)

    // Inject picker + panel before </body>
    html = html.replace('</body>', buildPickerInject(slots, isEmbedded) + '\n</body>')

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
