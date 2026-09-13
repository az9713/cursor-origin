/* editor.js — contenteditable editing: Enter/Backspace/Tab + slash trigger */
'use strict';

const Editor = (() => {
  // Slash state
  let slashBlockId  = null;
  let slashStart    = -1; // index of '/' in block text

  /* ── Caret utilities ─────────────────────────── */

  function getCaretOffset(el) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return 0;
    const range = sel.getRangeAt(0).cloneRange();
    range.selectNodeContents(el);
    range.setEnd(sel.anchorNode, sel.anchorOffset);
    return range.toString().length;
  }

  function setCaretOffset(el, offset) {
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    let remaining = offset;
    let placed = false;

    function walk(node) {
      if (placed) return;
      if (node.nodeType === Node.TEXT_NODE) {
        const len = node.textContent.length;
        if (remaining <= len) {
          range.setStart(node, remaining);
          range.collapse(true);
          placed = true;
        } else {
          remaining -= len;
        }
      } else {
        for (const child of node.childNodes) walk(child);
      }
    }

    walk(el);
    if (!placed) {
      range.selectNodeContents(el);
      range.collapse(false);
    }

    sel.removeAllRanges();
    sel.addRange(range);
  }

  function focusedContentEl() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    let node = sel.anchorNode;
    if (node && node.nodeType === Node.TEXT_NODE) node = node.parentNode;
    if (!node) return null;
    return node.closest('[data-id][contenteditable="true"]') || null;
  }

  /* ── Text sync ───────────────────────────────── */

  function syncToStore(el) {
    const id = el && el.dataset.id;
    if (!id) return;
    const block = Store.getBlock(id);
    if (!block) return;
    const text = el.textContent;
    if (block.text !== text) Store.updateBlock(id, { text });
  }

  /* ── Init ────────────────────────────────────── */

  function init() {
    const editor = document.getElementById('editor');
    editor.addEventListener('keydown',  onKeyDown,  true);
    editor.addEventListener('input',    onInput);
    editor.addEventListener('change',   onChange);
    editor.addEventListener('blur',     onBlur, true);

    // Page title: prevent Enter, optionally focus first block
    editor.addEventListener('keydown', e => {
      if (e.target.closest('[data-page-title]')) {
        if (e.key === 'Enter') {
          e.preventDefault();
          // Focus first block
          const first = document.querySelector('#blocks-container .block-content');
          if (first) { first.focus(); setCaretOffset(first, 0); }
        }
      }
    });
  }

  /* ── keydown ─────────────────────────────────── */

  function onKeyDown(e) {
    // Let slash menu handle arrow / Enter / Escape first
    if (SlashMenu.handleKey(e)) return;

    const el = focusedContentEl();
    if (!el) return;

    const blockId = el.dataset.id;
    const block   = Store.getBlock(blockId);
    if (!block) return;

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      handleEnter(el, block);
      return;
    }

    if (e.key === 'Backspace') {
      const caret = getCaretOffset(el);
      if (caret === 0) {
        // If block has a type other than 'p', first backspace resets it to 'p'
        if (block.type !== 'p' && block.text === '') {
          e.preventDefault();
          Store.updateBlock(blockId, { type: 'p' });
          App.renderBlocks();
          requestAnimationFrame(() => {
            const newEl = document.querySelector(`[data-id="${blockId}"]`);
            if (newEl) { setCaretOffset(newEl, 0); }
          });
          return;
        }
        e.preventDefault();
        handleBackspaceAtStart(el, block);
        return;
      }
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      if (block.type !== 'bullet') return; // only bullets indent/outdent

      if (e.shiftKey) {
        Store.outdentBlock(blockId);
      } else {
        Store.indentBlock(blockId);
      }
      App.renderBlocks();
      requestAnimationFrame(() => {
        const newEl = document.querySelector(`[data-id="${blockId}"]`);
        if (newEl) { newEl.focus(); setCaretOffset(newEl, newEl.textContent.length); }
      });
      return;
    }

    // Arrow key cross-block navigation
    if (e.key === 'ArrowUp') {
      const caret = getCaretOffset(el);
      if (caret === 0) { e.preventDefault(); focusSibling(block, -1); }
      return;
    }
    if (e.key === 'ArrowDown') {
      const caret = getCaretOffset(el);
      if (caret === el.textContent.length) { e.preventDefault(); focusSibling(block, +1); }
      return;
    }
  }

  function handleEnter(el, block) {
    syncToStore(el);
    const caret  = getCaretOffset(el);
    const text   = block.text;
    const before = text.slice(0, caret);
    const after  = text.slice(caret);

    const newId = Store.splitBlock(block.id, before, after);
    SlashMenu.hide();
    App.renderBlocks();

    requestAnimationFrame(() => {
      const newEl = document.querySelector(`[data-id="${newId}"]`);
      if (newEl) { newEl.focus(); setCaretOffset(newEl, 0); }
    });
  }

  function handleBackspaceAtStart(el, block) {
    syncToStore(el);
    const result = Store.mergeWithPrev(block.id);
    if (!result) return;

    App.renderBlocks();
    requestAnimationFrame(() => {
      const prevEl = document.querySelector(`[data-id="${result.id}"]`);
      if (prevEl) { prevEl.focus(); setCaretOffset(prevEl, result.caretPos); }
    });
  }

  function focusSibling(block, direction) {
    const parent   = Store.getBlock(block.parentId);
    if (!parent) return;
    const siblings = parent.children;
    const idx      = siblings.indexOf(block.id) + direction;
    if (idx < 0 || idx >= siblings.length) return;

    const sibId = siblings[idx];
    const sibEl = document.querySelector(`[data-id="${sibId}"]`);
    if (!sibEl) return;

    const pos = direction > 0 ? 0 : sibEl.textContent.length;
    sibEl.focus();
    setCaretOffset(sibEl, pos);
  }

  /* ── input ───────────────────────────────────── */

  function onInput(e) {
    // Page title
    const titleEl = e.target.closest('[data-page-title]');
    if (titleEl) {
      const pageId = titleEl.dataset.pageTitle;
      Store.updateBlock(pageId, { text: titleEl.textContent });
      Sidebar.render();
      return;
    }

    const el = e.target.closest('[data-id][contenteditable="true"]');
    if (!el) return;

    const blockId = el.dataset.id;
    const text    = el.textContent;
    Store.updateBlock(blockId, { text });

    // Slash detection
    const caret    = getCaretOffset(el);
    const textSoFar = text.slice(0, caret);
    const slashIdx  = textSoFar.lastIndexOf('/');

    if (slashIdx !== -1) {
      const beforeSlash = textSoFar.slice(0, slashIdx);
      const afterSlash  = textSoFar.slice(slashIdx + 1);

      // Only trigger if slash at start or after whitespace, and no space in query
      if ((slashIdx === 0 || /\s/.test(beforeSlash.slice(-1))) && !afterSlash.includes(' ')) {
        slashBlockId = blockId;
        slashStart   = slashIdx;

        if (!SlashMenu.active) {
          SlashMenu.show(el, (type) => applySlash(blockId, type));
        }
        SlashMenu.updateQuery(afterSlash);
        return;
      }
    }

    // If slash menu was open but query got invalid
    if (SlashMenu.active) SlashMenu.hide();
  }

  function applySlash(blockId, type) {
    const block = Store.getBlock(blockId);
    if (!block) return;

    // Remove the slash + query from the text
    const cleanText = block.text.slice(0, slashStart);

    if (type === 'page') {
      // Convert this block to a page-type block
      Store.updateBlock(blockId, { type: 'page', text: cleanText || 'Untitled' });
    } else {
      Store.updateBlock(blockId, { type, text: cleanText });
    }

    slashBlockId = null;
    slashStart   = -1;
    App.renderBlocks();

    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-id="${blockId}"]`);
      if (el) { el.focus(); setCaretOffset(el, el.textContent.length); }
    });
  }

  /* ── change (checkbox) ───────────────────────── */

  function onChange(e) {
    if (e.target.classList.contains('todo-check')) {
      const id = e.target.dataset.id;
      Store.updateBlock(id, { checked: e.target.checked });
      // Toggle strikethrough class on parent block
      const blockEl = e.target.closest('.block');
      if (blockEl) {
        blockEl.classList.toggle('is-checked', e.target.checked);
      }
    }
  }

  /* ── blur — sync text ────────────────────────── */

  function onBlur(e) {
    const el = e.target.closest('[data-id][contenteditable="true"]');
    if (el) syncToStore(el);
  }

  return { init, setCaretOffset, getCaretOffset };
})();
