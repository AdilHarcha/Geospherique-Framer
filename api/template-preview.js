import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const PICKER_INJECT = `
<style id="_cp_style">
  ._cp_hover {
    outline: 2px solid #6366f1 !important;
    outline-offset: 1px !important;
    cursor: crosshair !important;
  }
  ._cp_mapped {
    outline: 2px solid #10b981 !important;
    outline-offset: 1px !important;
  }
  ._cp_selected {
    outline: 3px solid #f59e0b !important;
    outline-offset: 2px !important;
  }
  #_cp_bar {
    position: fixed;
    bottom: 0; left: 0; right: 0;
    z-index: 2147483647;
    background: rgba(10, 10, 15, 0.92);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    padding: 9px 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 12px;
    color: #6b7280;
    border-top: 1px solid rgba(255,255,255,0.06);
    pointer-events: none;
  }
  #_cp_bar_info { flex: 1; display: flex; align-items: center; gap: 8px; overflow: hidden; }
  #_cp_bar_tag { color: #818cf8; font-family: 'SF Mono', monospace; font-size: 11px; flex-shrink: 0; }
  #_cp_bar_text { color: #d1d5db; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #_cp_bar_dot { width: 6px; height: 6px; border-radius: 50%; background: #6366f1; flex-shrink: 0; }
  #_cp_count {
    background: #10b981;
    color: white;
    border-radius: 999px;
    padding: 2px 10px;
    font-size: 11px;
    font-weight: 600;
    flex-shrink: 0;
  }
</style>
<div id="_cp_bar">
  <div id="_cp_bar_dot"></div>
  <div id="_cp_bar_info">
    <span>Survolez et cliquez un élément pour l'assigner</span>
  </div>
  <span id="_cp_count">0 mappé</span>
</div>
<script>
(function () {
  var SKIP = { HTML:1, BODY:1, HEAD:1, SCRIPT:1, STYLE:1, META:1, LINK:1, NOSCRIPT:1 };
  var mappings = [];
  var hovered = null;

  function updateCount() {
    var el = document.getElementById('_cp_count');
    if (el) el.textContent = mappings.length + (mappings.length > 1 ? ' mappés' : ' mappé');
  }

  function applyMapped() {
    document.querySelectorAll('._cp_mapped').forEach(function(el) { el.classList.remove('_cp_mapped'); });
    mappings.forEach(function(m) {
      if (!m.selector) return;
      try {
        var el = document.querySelector(m.selector);
        if (el) el.classList.add('_cp_mapped');
      } catch(e) {}
    });
  }

  function getSelector(el) {
    if (el.id && !/^_cp/.test(el.id)) return '#' + el.id;
    var parts = [];
    var node = el;
    for (var i = 0; i < 8; i++) {
      if (!node || node === document.documentElement) break;
      var sel = node.tagName.toLowerCase();
      if (node.id && !/^_cp/.test(node.id)) {
        parts.unshift('#' + node.id);
        break;
      }
      if (node.className && typeof node.className === 'string') {
        var classes = node.className.trim().split(/\s+/)
          .filter(function(c) { return c && !/^_cp/.test(c); })
          .slice(0, 2)
          .map(function(c) { return '.' + c; })
          .join('');
        if (classes) sel += classes;
      }
      if (node.parentNode) {
        var siblings = Array.prototype.filter.call(node.parentNode.children, function(c) { return c.tagName === node.tagName; });
        if (siblings.length > 1) sel += ':nth-of-type(' + (siblings.indexOf(node) + 1) + ')';
      }
      parts.unshift(sel);
      node = node.parentNode;
    }
    return parts.join(' > ');
  }

  function isSkipped(el) {
    if (!el || !el.tagName) return true;
    if (SKIP[el.tagName]) return true;
    if (el.id && /^_cp/.test(el.id)) return true;
    var p = el;
    while (p) {
      if (p.id === '_cp_bar') return true;
      p = p.parentElement;
    }
    return false;
  }

  document.addEventListener('mouseover', function(e) {
    var el = e.target;
    if (isSkipped(el)) return;
    if (hovered && hovered !== el) hovered.classList.remove('_cp_hover');
    hovered = el;
    el.classList.add('_cp_hover');
    var info = document.getElementById('_cp_bar_info');
    if (info) {
      var tag = '<' + el.tagName.toLowerCase() + '>';
      var txt = (el.textContent || el.alt || '').trim().replace(/\\s+/g, ' ').slice(0, 60);
      info.innerHTML = '<span id="_cp_bar_tag">' + tag + '</span>' +
        (txt ? '<span id="_cp_bar_text">«\\u00a0' + txt + '\\u00a0»</span>' : '');
    }
  }, { passive: true });

  document.addEventListener('mouseout', function(e) {
    if (e.target === hovered) {
      hovered.classList.remove('_cp_hover');
      hovered = null;
      var info = document.getElementById('_cp_bar_info');
      if (info) info.innerHTML = '<span>Survolez et cliquez un élément pour l\\'assigner</span>';
    }
  }, { passive: true });

  document.addEventListener('click', function(e) {
    var el = e.target;
    if (isSkipped(el)) return;
    e.preventDefault();
    e.stopImmediatePropagation();

    var selector = getSelector(el);
    var tagName = el.tagName.toLowerCase();
    var text = (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 80);
    var src = el.src || el.href || '';
    var bgImg = el.style && el.style.backgroundImage;
    var isImg = tagName === 'img' || !!bgImg || tagName === 'video' || tagName === 'picture';
    var existing = null;
    for (var i = 0; i < mappings.length; i++) {
      if (mappings[i].selector === selector) { existing = mappings[i]; break; }
    }

    document.querySelectorAll('._cp_selected').forEach(function(e) { e.classList.remove('_cp_selected'); });
    el.classList.add('_cp_selected');

    window.parent.postMessage({
      type: 'cms-element-click',
      selector: selector,
      tagName: tagName,
      text: text,
      src: src,
      isImg: isImg,
      existingMapping: existing
    }, '*');
  }, true);

  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'cms-update-mappings') {
      mappings = e.data.mappings || [];
      updateCount();
      applyMapped();
    }
  });
})();
</script>
`

export default function handler(req, res) {
  const { template = 'formation' } = req.query
  const name = (template === 'traversée' || template === 'traversee') ? 'traversee' : 'formation'

  try {
    let html = readFileSync(join(__dirname, 'templates', `${name}.html`), 'utf8')

    // Strip any X-Frame-Options or CSP meta tags that would block iframe embedding
    html = html.replace(/<meta[^>]+http-equiv=["']?[Xx]-[Ff]rame-[Oo]ptions["']?[^>]*>/gi, '')
    html = html.replace(/<meta[^>]+[Cc]ontent-[Ss]ecurity-[Pp]olicy[^>]*>/gi, '')

    // Inject picker before </body>
    html = html.replace('</body>', PICKER_INJECT + '\n</body>')

    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    // Allow embedding from any origin
    res.setHeader('Content-Security-Policy', "frame-ancestors *")
    res.status(200).send(html)
  } catch (err) {
    console.error('template-preview error:', err)
    res.status(500).send(`<html><body style="font-family:sans-serif;padding:2rem">
      <p>Template introuvable : <code>${name}</code></p></body></html>`)
  }
}
