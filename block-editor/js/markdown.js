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
      }

      // Recurse into children (for nested bullets)
      if (b.type !== 'page') {
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

    function mkBlock(type, text, checked = false) {
      return {
        id:       Store.uid(),
        type,
        text:     text.trim(),
        children: [],
        checked,
        parentId: null, // filled in by store.importPageBlocks
      };
    }

    for (const raw of lines) {
      const line = raw;

      // Headings
      const h1 = line.match(/^#\s+(.+)/);
      if (h1) { blocks.push(mkBlock('h1', h1[1])); continue; }

      const h2 = line.match(/^##\s+(.+)/);
      if (h2) { blocks.push(mkBlock('h2', h2[1])); continue; }

      // Todos (must come before plain bullet)
      const todoX = line.match(/^[\s]*-\s+\[x\]\s+(.+)/i);
      if (todoX) { blocks.push(mkBlock('todo', todoX[1], true)); continue; }

      const todoO = line.match(/^[\s]*-\s+\[\s?\]\s+(.+)/i);
      if (todoO) { blocks.push(mkBlock('todo', todoO[1], false)); continue; }

      // Bullet
      const bullet = line.match(/^[\s]*-\s+(.+)/);
      if (bullet) { blocks.push(mkBlock('bullet', bullet[1])); continue; }

      // Blank lines → skip
      if (!line.trim()) continue;

      // Everything else → paragraph
      blocks.push(mkBlock('p', line));
    }

    return blocks;
  }

  return { exportPage, importMarkdown };
})();
