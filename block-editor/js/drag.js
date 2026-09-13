/* drag.js — HTML5 drag-and-drop reordering for blocks */
'use strict';

const Drag = (() => {
  let dragId   = null;
  let overId   = null;
  let overPos  = 'after'; // 'before' | 'after'

  function init() {
    const editorEl = document.getElementById('editor');

    editorEl.addEventListener('dragstart', onDragStart, true);
    editorEl.addEventListener('dragover',  onDragOver);
    editorEl.addEventListener('dragleave', onDragLeave);
    editorEl.addEventListener('drop',      onDrop);
    editorEl.addEventListener('dragend',   onDragEnd);
  }

  function blockElFrom(target) {
    return target.closest('.block[data-id]') || null;
  }

  function onDragStart(e) {
    const handle = e.target.closest('[data-drag]');
    if (!handle) { e.preventDefault(); return; }

    const blockEl = handle.closest('.block[data-id]');
    if (!blockEl) { e.preventDefault(); return; }

    dragId = blockEl.dataset.id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragId);

    // Ghost: defer class so browser captures clean snapshot
    requestAnimationFrame(() => blockEl.classList.add('dragging'));
  }

  function onDragOver(e) {
    if (!dragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const target = blockElFrom(e.target);
    clearIndicators();

    if (!target || target.dataset.id === dragId) return;

    const rect = target.getBoundingClientRect();
    overPos     = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    overId      = target.dataset.id;
    target.classList.add(`drop-${overPos}`);
  }

  function onDragLeave(e) {
    // Only clear when leaving the editor entirely
    if (!document.getElementById('editor').contains(e.relatedTarget)) {
      clearIndicators();
    }
  }

  function onDrop(e) {
    e.preventDefault();
    if (!dragId || !overId || dragId === overId) { cleanup(); return; }

    const dragBlock = Store.getBlock(dragId);
    const overBlock = Store.getBlock(overId);
    if (!dragBlock || !overBlock) { cleanup(); return; }

    // Only allow reorder within same parent for simplicity
    if (dragBlock.parentId !== overBlock.parentId) { cleanup(); return; }

    const parent   = Store.getBlock(dragBlock.parentId);
    const siblings = parent.children;
    const fromIdx  = siblings.indexOf(dragId);
    let   toIdx    = siblings.indexOf(overId);

    if (fromIdx === -1 || toIdx === -1) { cleanup(); return; }

    // Remove from old position
    siblings.splice(fromIdx, 1);
    // Recalculate toIdx after removal
    toIdx = siblings.indexOf(overId);
    if (overPos === 'after') toIdx += 1;

    siblings.splice(toIdx, 0, dragId);
    Store.persist();

    cleanup();
    // Trigger re-render via app
    if (window.App) App.renderBlocks();
  }

  function onDragEnd() {
    cleanup();
  }

  function clearIndicators() {
    document.querySelectorAll('.drop-before, .drop-after').forEach(el => {
      el.classList.remove('drop-before', 'drop-after');
    });
    overId  = null;
    overPos = 'after';
  }

  function cleanup() {
    document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
    clearIndicators();
    dragId = null;
  }

  return { init };
})();
