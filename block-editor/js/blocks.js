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

  return { renderBlock, renderPage, esc };
})();
