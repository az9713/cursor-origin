/* store.js — flat block store + localStorage persistence */
'use strict';

const Store = (() => {
  const STORAGE_KEY = 'block-editor-v1';
  let state = null;

  /* ─── ID generation ─────────────────────────── */
  function uid() {
    return Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
  }

  /* ─── Seed data ─────────────────────────────── */
  function seed() {
    const homeId    = uid();
    const childId   = uid();

    const h1Id      = uid();
    const p1Id      = uid();
    const h2Id      = uid();
    const b1Id      = uid();
    const b2Id      = uid();
    const b3Id      = uid();
    const todo1Id   = uid();
    const todo2Id   = uid();

    const ch1Id     = uid();
    const cp1Id     = uid();
    const cb1Id     = uid();
    const cb2Id     = uid();

    const blocks = {
      [homeId]: {
        id: homeId, type: 'page', text: 'Home',
        children: [h1Id, p1Id, h2Id, b1Id, b2Id, b3Id, todo1Id, todo2Id, childId],
        parentId: null, checked: false
      },
      [h1Id]:   { id: h1Id,   type: 'h1',     text: 'Welcome to Block Editor',          children: [],   parentId: homeId,  checked: false },
      [p1Id]:   { id: p1Id,   type: 'p',      text: 'A mini Notion-style block editor. Type / to insert blocks, drag ⠿ to reorder.',
                              children: [],   parentId: homeId,  checked: false },
      [h2Id]:   { id: h2Id,   type: 'h2',     text: 'Features',                         children: [],   parentId: homeId,  checked: false },
      [b1Id]:   { id: b1Id,   type: 'bullet', text: 'Slash commands — type / anywhere', children: [],   parentId: homeId,  checked: false },
      [b2Id]:   { id: b2Id,   type: 'bullet', text: 'Drag ⠿ handle to reorder blocks',  children: [b3Id], parentId: homeId, checked: false },
      [b3Id]:   { id: b3Id,   type: 'bullet', text: 'Tab / Shift+Tab to indent bullets',children: [],   parentId: b2Id,   checked: false },
      [todo1Id]:{ id: todo1Id,type: 'todo',   text: 'Build block model',                children: [],   parentId: homeId,  checked: true  },
      [todo2Id]:{ id: todo2Id,type: 'todo',   text: 'Add slash menu',                  children: [],   parentId: homeId,  checked: false },
      [childId]:{ id: childId,type: 'page',   text: 'Getting Started',
                              children: [ch1Id, cp1Id, cb1Id, cb2Id],
                              parentId: homeId,  checked: false },

      [ch1Id]:  { id: ch1Id,  type: 'h1',     text: 'Getting Started',                  children: [],   parentId: childId, checked: false },
      [cp1Id]:  { id: cp1Id,  type: 'p',      text: 'This is a nested page. Navigate back with the breadcrumb above.',
                              children: [],   parentId: childId, checked: false },
      [cb1Id]:  { id: cb1Id,  type: 'bullet', text: 'Indent me with Tab',               children: [cb2Id], parentId: childId, checked: false },
      [cb2Id]:  { id: cb2Id,  type: 'bullet', text: 'I am already indented',            children: [],   parentId: cb1Id,  checked: false },
    };

    return { rootPageId: homeId, currentPageId: homeId, blocks };
  }

  /* ─── Persistence ───────────────────────────── */
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Validate minimal shape
        if (parsed.rootPageId && parsed.blocks && parsed.blocks[parsed.rootPageId]) {
          state = parsed;
          if (!state.blocks[state.currentPageId]) {
            state.currentPageId = state.rootPageId;
          }
          return;
        }
      }
    } catch (_) { /* fall through to seed */ }
    state = seed();
    persist();
  }

  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
  }

  /* ─── Read ──────────────────────────────────── */
  const getBlock  = (id) => state.blocks[id] || null;
  const getPage   = (id) => state.blocks[id] || null;
  const getCurrent = () => state.blocks[state.currentPageId];
  const getRoot    = () => state.blocks[state.rootPageId];
  const getAllPages = () => Object.values(state.blocks).filter(b => b.type === 'page');

  /* ─── Navigation ────────────────────────────── */
  function navigateTo(pageId) {
    if (state.blocks[pageId]) {
      state.currentPageId = pageId;
      persist();
      return true;
    }
    return false;
  }

  /* ─── Block CRUD ────────────────────────────── */
  function createBlock(type, parentId, afterId = null) {
    const id = uid();
    const block = {
      id, type, text: '', children: [], parentId, checked: false,
      lang: type === 'code' ? 'js' : '',
    };
    state.blocks[id] = block;

    const parent = state.blocks[parentId];
    if (parent) {
      if (afterId !== null) {
        const idx = parent.children.indexOf(afterId);
        parent.children.splice(idx + 1, 0, id);
      } else {
        parent.children.push(id);
      }
    }
    persist();
    return id;
  }

  function updateBlock(id, changes) {
    const block = state.blocks[id];
    if (!block) return;
    Object.assign(block, changes);
    persist();
  }

  function _deleteDeep(id) {
    const block = state.blocks[id];
    if (!block) return;
    [...(block.children || [])].forEach(_deleteDeep);
    delete state.blocks[id];
  }

  function deleteBlock(id) {
    const block = state.blocks[id];
    if (!block) return;

    // Remove from parent's children array
    if (block.parentId && state.blocks[block.parentId]) {
      const parent = state.blocks[block.parentId];
      parent.children = parent.children.filter(cid => cid !== id);
    }

    _deleteDeep(id);
    persist();
  }

  /* ─── Structural operations ─────────────────── */

  /**
   * Split block at caret. Returns new block id inserted after current.
   * H1/H2 produce a 'p' continuation; all others keep their type.
   */
  function splitBlock(blockId, beforeText, afterText) {
    const block = state.blocks[blockId];
    if (!block) return null;

    block.text = beforeText;

    const newType = (block.type === 'h1' || block.type === 'h2') ? 'p' : block.type;
    const newId = createBlock(newType, block.parentId, blockId);
    state.blocks[newId].text = afterText;
    state.blocks[newId].checked = false;
    persist();
    return newId;
  }

  /**
   * Merge blockId into its previous sibling.
   * Returns { id: prevId, caretPos } or null if not possible.
   */
  function mergeWithPrev(blockId) {
    const block = state.blocks[blockId];
    if (!block) return null;

    // Don't merge if block itself has children
    if (block.children && block.children.length > 0) return null;

    const parent = state.blocks[block.parentId];
    if (!parent) return null;

    const siblings = parent.children;
    const idx = siblings.indexOf(blockId);
    if (idx === 0) return null; // no previous sibling

    const prevId = siblings[idx - 1];
    const prev   = state.blocks[prevId];
    if (!prev || prev.type === 'page') return null;

    const caretPos = prev.text.length;
    prev.text = prev.text + block.text;

    siblings.splice(idx, 1);
    delete state.blocks[blockId];
    persist();
    return { id: prevId, caretPos };
  }

  /**
   * Indent block: make it a child of its previous sibling.
   * Returns true on success.
   */
  function indentBlock(blockId) {
    const block  = state.blocks[blockId];
    const parent = state.blocks[block.parentId];
    const siblings = parent.children;
    const idx = siblings.indexOf(blockId);

    if (idx === 0) return false;

    const prevSibId  = siblings[idx - 1];
    const prevSib    = state.blocks[prevSibId];
    if (prevSib.type === 'page') return false;

    siblings.splice(idx, 1);
    block.parentId = prevSibId;
    prevSib.children.push(blockId);
    persist();
    return true;
  }

  /**
   * Outdent block: lift it to grandparent, placed after current parent.
   * Returns true on success.
   */
  function outdentBlock(blockId) {
    const block  = state.blocks[blockId];
    const parent = state.blocks[block.parentId];
    // Can't outdent if parent is a page (block is already at page body level)
    if (!parent || parent.type === 'page') return false;

    const grandparent = state.blocks[parent.parentId];
    const parentIdx   = grandparent.children.indexOf(parent.id);

    // Remove from current parent
    parent.children = parent.children.filter(id => id !== blockId);

    // Insert after parent in grandparent's children
    grandparent.children.splice(parentIdx + 1, 0, blockId);
    block.parentId = parent.parentId;
    persist();
    return true;
  }

  /**
   * Reorder block within its parent (same parent drag-and-drop).
   */
  function reorderSibling(blockId, newIndex) {
    const block  = state.blocks[blockId];
    const parent = state.blocks[block.parentId];
    const children = parent.children;
    const oldIndex  = children.indexOf(blockId);
    if (oldIndex === -1) return;

    children.splice(oldIndex, 1);
    // Clamp
    const clampedIdx = Math.min(newIndex, children.length);
    children.splice(clampedIdx, 0, blockId);
    persist();
  }

  /**
   * Create a standalone page as child of rootPage.
   */
  function createPage(parentId) {
    const id = uid();
    const block = {
      id, type: 'page', text: 'Untitled',
      children: [], parentId, checked: false
    };
    state.blocks[id] = block;
    const parent = state.blocks[parentId];
    if (parent) parent.children.push(id);
    persist();
    return id;
  }

  /**
   * Replace a page's body with imported blocks (flat, no nesting).
   */
  function importPageBlocks(pageId, newBlocks) {
    const page = state.blocks[pageId];
    if (!page) return;

    // Remove existing body
    [...page.children].forEach(_deleteDeep);
    page.children = [];

    // Insert new blocks. Nested bullets/todos already have parentId + children ids.
    newBlocks.forEach(b => {
      if (!b.parentId) {
        b.parentId = pageId;
        page.children.push(b.id);
      }
      state.blocks[b.id] = b;
    });
    persist();
  }

  load();

  return {
    get state() { return state; },
    uid,
    getBlock, getPage, getCurrent, getRoot, getAllPages,
    navigateTo,
    createBlock, updateBlock, deleteBlock,
    splitBlock, mergeWithPrev,
    indentBlock, outdentBlock,
    reorderSibling,
    createPage,
    importPageBlocks,
    persist,
  };
})();
