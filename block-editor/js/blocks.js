/* blocks.js — block rendering helpers (pure HTML strings) */
'use strict';

const Blocks = (() => {

  function esc(text) {
    return (text == null ? '' : String(text))
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ─── Code-safe escape (no " escape — needed for string regex) ── */
  function codeEsc(text) {
    return (text == null ? '' : String(text))
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /* ─── Lightweight syntax highlighter (regex spans, no deps) ── */
  //
  // Single-pass tokenizer: each alternative is tried left-to-right.
  // Tokens matched earlier shadow later patterns, so strings and
  // comments are never keyword-highlighted inside them.
  //
  const _HL_RE = /(\/\/[^\n]*)|(\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|\b(abstract|as|async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|enum|export|extends|finally|for|from|function|if|implements|import|in|instanceof|interface|let|new|null|of|package|private|protected|public|return|static|super|switch|this|throw|true|false|try|typeof|undefined|var|void|while|with|yield)\b|\b(\d+\.?\d*(?:e[+\-]?\d+)?)\b|\b([A-Z][a-zA-Z0-9_]*)\b/g;

  function codeHighlight(rawCode, lang) {
    const code = codeEsc(rawCode);
    if (!code) return '';
    // Reset lastIndex (regex is stateful when reused)
    _HL_RE.lastIndex = 0;
    return code.replace(_HL_RE, (m, lineC, blockC, str, kw, num, cls) => {
      if (lineC  !== undefined) return '<span class="hl-comment">' + m + '</span>';
      if (blockC !== undefined) return '<span class="hl-comment">' + m + '</span>';
      if (str    !== undefined) return '<span class="hl-str">'     + m + '</span>';
      if (kw     !== undefined) return '<span class="hl-kw">'      + m + '</span>';
      if (num    !== undefined) return '<span class="hl-num">'      + m + '</span>';
      if (cls    !== undefined) return '<span class="hl-cls">'      + m + '</span>';
      return m;
    });
  }

  /**
   * Render a single block recursively.
   * @param {string} blockId
   * @param {number} depth   — nesting depth for indent styling
   */
  function renderBlock(blockId, depth) {
    depth = depth || 0;
    const b = Store.getBlock(blockId);
    if (!b) return '';

    /* ── Page links ── */
    if (b.type === 'page') {
      return `<div class="block block-page" data-id="${b.id}" data-type="page" data-depth="${depth}">
  <span class="drag-handle" data-drag="${b.id}" draggable="true" title="Drag to reorder">⠿</span>
  <div class="block-body">
    <a class="page-link" href="#/p/${b.id}">📄 ${esc(b.text)}</a>
  </div>
</div>`;
    }

    /* ── Code blocks ── */
    if (b.type === 'code') {
      const lang        = b.lang || 'js';
      const highlighted = codeHighlight(b.text || '', lang);
      return `<div class="block block-code" data-id="${b.id}" data-type="code" data-depth="${depth}">
  <span class="drag-handle" data-drag="${b.id}" draggable="true" title="Drag to reorder">⠿</span>
  <div class="block-body">
    <div class="code-wrap">
      <div class="code-header">
        <input class="code-lang-input" type="text" value="${esc(lang)}" data-lang-id="${b.id}" maxlength="20" spellcheck="false" title="Language (e.g. js, py, css)">
      </div>
      <div class="code-stage">
        <pre class="code-backdrop" aria-hidden="true"><code>${highlighted}
</code></pre>
        <textarea class="code-textarea" data-id="${b.id}" spellcheck="false" autocorrect="off" autocapitalize="off" autocomplete="off">${esc(b.text || '')}</textarea>
      </div>
    </div>
  </div>
</div>`;
    }

    /* ── Content blocks ── */
    const checkedClass = (b.type === 'todo' && b.checked) ? ' is-checked' : '';
    let inner = '';

    if (b.type === 'todo') {
      inner = `<label class="todo-label">
    <input type="checkbox" class="todo-check" data-id="${b.id}"${b.checked ? ' checked' : ''}>
    <span class="block-content" contenteditable="true" data-id="${b.id}" data-placeholder="To-do" spellcheck="false">${esc(b.text)}</span>
  </label>`;
    } else {
      const placeholder = b.type === 'h1' ? 'Heading 1'
                        : b.type === 'h2' ? 'Heading 2'
                        : b.type === 'bullet' ? 'List item'
                        : 'Type something…';
      inner = `<span class="block-content" contenteditable="true" data-id="${b.id}" data-placeholder="${placeholder}" spellcheck="false">${esc(b.text)}</span>`;
    }

    /* Children (nested bullets etc.) */
    const childrenHtml = b.children.length > 0
      ? `<div class="block-children">${b.children.map(cid => renderBlock(cid, depth + 1)).join('\n')}</div>`
      : '';

    return `<div class="block block-${b.type}${checkedClass}" data-id="${b.id}" data-type="${b.type}" data-depth="${depth}">
  <span class="drag-handle" data-drag="${b.id}" draggable="true" title="Drag to reorder">⠿</span>
  <div class="block-body">
    ${inner}
    ${childrenHtml}
  </div>
</div>`;
  }

  /**
   * Render the full page: title + all top-level blocks.
   */
  function renderPage(pageId) {
    const page = Store.getBlock(pageId);
    if (!page) return '<p style="color:red">Page not found.</p>';

    const blocksHtml = page.children
      .map(cid => renderBlock(cid, 0))
      .join('\n');

    return `<div class="page-title-wrap">
  <div class="page-title" contenteditable="true" data-page-title="${page.id}" spellcheck="false">${esc(page.text)}</div>
</div>
<div id="blocks-container">${blocksHtml}</div>`;
  }

  return { renderBlock, renderPage, esc, codeHighlight };
})();
