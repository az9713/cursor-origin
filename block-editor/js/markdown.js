/* markdown.js — GFM-ish import/export for a page */
'use strict';

const Markdown = (() => {

  /* ─── Export ────────────────────────────────── */
  function exportPage(pageId) {
    const page = Store.getBlock(pageId);
    if (!page) return '';

    const lines = [];

    function exportBlock(blockId, depth) {
      const b = Store.getBlock(blockId);
      if (!b) return;
      const pad = '  '.repeat(depth);

      switch (b.type) {
        case 'h1':     lines.push(`# ${b.text}`);                        break;
        case 'h2':     lines.push(`## ${b.text}`);                       break;
        case 'p':      lines.push(b.text || '');                         break;
        case 'bullet': lines.push(`${pad}- ${b.text}`);                  break;
        case 'todo':   lines.push(`${pad}- [${b.checked ? 'x' : ' '}] ${b.text}`); break;
        case 'page':   lines.push(`- 📄 [${b.text}](#/p/${b.id})`);     break;
        case 'code':
          lines.push('```' + (b.lang || 'js'));
          if (b.text) lines.push(b.text);
          lines.push('```');
          break;
      }

      // Recurse into children (for nested bullets); code blocks are leaf nodes
      if (b.type !== 'page' && b.type !== 'code') {
        b.children.forEach(cid => exportBlock(cid, depth + 1));
      }
    }

    page.children.forEach(cid => exportBlock(cid, 0));
    return lines.join('\n');
  }

  /* ─── Import ────────────────────────────────── */
  function importMarkdown(text) {
    const lines  = text.split('\n');
    const blocks = [];
    const stack  = []; // nestable bullets/todos: { indent, block }

    function mkBlock(type, text, checked = false) {
      return {
        id:       Store.uid(),
        type,
        text:     text.trim(),
        children: [],
        checked,
        parentId: null, // roots filled in by store.importPageBlocks
      };
    }

    function indentOf(line) {
      const m = line.match(/^(\s*)/);
      return Math.floor((m ? m[1].length : 0) / 2);
    }

    function attachNestable(block, indent) {
      while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
      const parent = stack.length ? stack[stack.length - 1].block : null;
      if (parent && (parent.type === 'bullet' || parent.type === 'todo')) {
        parent.children.push(block.id);
        block.parentId = parent.id;
      }
      blocks.push(block);
      stack.push({ indent, block });
    }

    function attachRoot(block) {
      stack.length = 0;
      blocks.push(block);
    }

    // Index loop so fenced code blocks can consume multiple lines at once
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];

      // ── Fenced code block ─────────────────────────────────────────
      const fence = line.match(/^```(\w*)\s*$/);
      if (fence) {
        const lang = fence[1].trim() || 'js';
        const codeLines = [];
        i++;
        while (i < lines.length && !/^```\s*$/.test(lines[i])) {
          codeLines.push(lines[i]);
          i++;
        }
        if (i < lines.length) i++; // skip closing ```
        attachRoot({
          id:       Store.uid(),
          type:     'code',
          text:     codeLines.join('\n'),
          lang,
          children: [],
          checked:  false,
          parentId: null,
        });
        continue; // i already advanced past closing ```
      }

      // ── Headings ──────────────────────────────────────────────────
      const h1 = line.match(/^#\s+(.+)/);
      if (h1) { attachRoot(mkBlock('h1', h1[1])); i++; continue; }

      const h2 = line.match(/^##\s+(.+)/);
      if (h2) { attachRoot(mkBlock('h2', h2[1])); i++; continue; }

      // ── Todos (must come before plain bullet) ─────────────────────
      const todoX = line.match(/^[\s]*-\s+\[x\]\s+(.+)/i);
      if (todoX) { attachNestable(mkBlock('todo', todoX[1], true), indentOf(line)); i++; continue; }

      const todoO = line.match(/^[\s]*-\s+\[\s?\]\s+(.+)/i);
      if (todoO) { attachNestable(mkBlock('todo', todoO[1], false), indentOf(line)); i++; continue; }

      // ── Bullet ────────────────────────────────────────────────────
      const bullet = line.match(/^[\s]*-\s+(.+)/);
      if (bullet) { attachNestable(mkBlock('bullet', bullet[1]), indentOf(line)); i++; continue; }

      // ── Blank lines → skip ────────────────────────────────────────
      if (!line.trim()) { i++; continue; }

      // ── Everything else → paragraph ───────────────────────────────
      attachRoot(mkBlock('p', line));
      i++;
    }

    return blocks;
  }

  return { exportPage, importMarkdown };
})();
