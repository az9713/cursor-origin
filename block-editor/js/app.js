/* app.js — top-level controller, wires everything together */
'use strict';

const App = (() => {

  /* ── Render full page ────────────────────────── */
  function render(pageId) {
    const id      = pageId || Store.state.currentPageId;
    const editorEl = document.getElementById('editor');
    editorEl.innerHTML = Blocks.renderPage(id);
    _initCodeBlocks();
    Sidebar.render();
    renderBreadcrumb(id);
  }

  /* ── Re-render only the blocks container ─────── */
  function renderBlocks() {
    const id        = Store.state.currentPageId;
    const container = document.getElementById('blocks-container');
    if (!container) { render(id); return; }

    const page = Store.getBlock(id);
    if (!page) return;

    container.innerHTML = page.children
      .map(cid => Blocks.renderBlock(cid, 0))
      .join('\n');

    _initCodeBlocks();
    Sidebar.render();
  }

  /* ── Breadcrumb ──────────────────────────────── */
  function renderBreadcrumb(pageId) {
    const bc   = document.getElementById('breadcrumb');
    const page = Store.getBlock(pageId);
    if (!page) { bc.innerHTML = ''; return; }

    // Walk up to root
    const path = [];
    let cur = page;
    while (cur) {
      path.unshift(cur);
      cur = cur.parentId ? Store.getBlock(cur.parentId) : null;
    }

    bc.innerHTML = path.map((p, i) => {
      const label = Blocks.esc(p.text) || 'Untitled';
      if (i < path.length - 1) {
        return `<a class="bc-item" href="#/p/${p.id}">${label}</a>`;
      }
      return `<span class="bc-item bc-current">${label}</span>`;
    }).join('<span class="bc-sep">›</span>');
  }

  /* ── Scroll-and-highlight a block ────────────── */
  function highlightBlock(blockId) {
    if (!blockId) return;
    const el = document.querySelector(`.block[data-id="${blockId}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('block-highlighted'); // reset animation
    void el.offsetWidth; // reflow
    el.classList.add('block-highlighted');
    setTimeout(() => el.classList.remove('block-highlighted'), 2200);
  }

  /* ── Hash routing callback ───────────────────── */
  function handleRoute(route) {
    if (!route) {
      // No hash — use stored current page
      render(Store.state.currentPageId);
      return;
    }

    const pageId = route.pageId;
    if (!Store.getBlock(pageId)) {
      // Unknown page id, fall back to root
      Router.navigate(Store.state.rootPageId);
      return;
    }

    Store.navigateTo(pageId);
    render(pageId);

    if (route.blockId) {
      requestAnimationFrame(() => highlightBlock(route.blockId));
    }
  }

  /* ── Export MD ───────────────────────────────── */
  function doExport() {
    const md      = Markdown.exportPage(Store.state.currentPageId);
    const name    = (Store.getCurrent().text || 'page').replace(/[^a-z0-9]/gi, '-').toLowerCase();
    const blob    = new Blob([md], { type: 'text/markdown' });
    const url     = URL.createObjectURL(blob);
    const a       = document.createElement('a');
    a.href        = url;
    a.download    = `${name}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /* ── Import MD ───────────────────────────────── */
  function doImport() {
    const overlay    = document.getElementById('import-overlay');
    const textarea   = document.getElementById('import-textarea');
    const confirmBtn = document.getElementById('import-confirm');
    const cancelBtn  = document.getElementById('import-cancel');

    textarea.value = '';
    overlay.classList.add('visible');
    textarea.focus();

    function close() {
      overlay.classList.remove('visible');
      confirmBtn.removeEventListener('click', onConfirm);
      cancelBtn.removeEventListener('click',  close);
    }

    function onConfirm() {
      const text = textarea.value.trim();
      if (!text) { close(); return; }
      const blocks = Markdown.importMarkdown(text);
      Store.importPageBlocks(Store.state.currentPageId, blocks);
      close();
      render();
    }

    confirmBtn.addEventListener('click', onConfirm);
    cancelBtn.addEventListener('click',  close);
  }

  /* ── Init ────────────────────────────────────── */
  function init() {
    // Wire sub-modules
    Drag.init();
    Editor.init();
    Sidebar.init();

    // Toolbar buttons
    document.getElementById('export-btn').addEventListener('click', doExport);
    document.getElementById('import-btn').addEventListener('click', doImport);

    // Hash change
    Router.onHashChange(handleRoute);

    // Initial route
    const initial = Router.parse();
    if (initial && Store.getBlock(initial.pageId)) {
      handleRoute(initial);
    } else {
      Router.navigate(Store.state.currentPageId);
    }
  }

  /* ── Init code block textarea heights ────────── */
  function _initCodeBlocks() {
    document.querySelectorAll('.code-textarea').forEach(ta => {
      ta.style.height = 'auto';
      ta.style.height = (ta.scrollHeight || 62) + 'px';
    });
  }

  return { init, render, renderBlocks, highlightBlock };
})();

window.App = App;

/* ── Bootstrap ───────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => App.init());
