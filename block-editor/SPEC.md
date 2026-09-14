# Block editor — frozen spec

Internal spec for Wave 2 project 13. Vanilla HTML/CSS/JS. Persist to `localStorage` key `block-editor-v1`.

## Product

Mini Notion: nested blocks, slash menu, drag reorder, markdown import/export, nested pages, URL to a block.

Lives at `block-editor/index.html`.

## Block model

Each block: `{ id, type, text, children[] }`.

Session A types: `page`, `h1`, `h2`, `p`, `bullet`, `todo`.

A page is a block whose children are the page body. Nested pages appear as links in the parent.

## Session A must

- Seed: one home page with headings, paragraphs, bullets, a checked/unchecked todo, and one child page
- Type `/` to open a slash menu; choose type; Enter confirms
- Enter splits / creates a block; Backspace at start merges
- Drag handle reorders siblings
- Indent / outdent (Tab / Shift+Tab) for bullets
- Export / import GitHub-flavored-ish markdown for the active page
- Hash `#/p/<pageId>` and `#/p/<pageId>/b/<blockId>` (scroll + highlight)
- Sidebar page list + New page

## Out of scope (later sessions)

Linked databases, relations, transclusion, images.

## Session B must

- Add `parentId` to each block; persist it
- Hash `#/p/<pageId>/b/<blockId>` scrolls to and highlights the block
- Nested bullets: Tab / Shift+Tab indent/outdent; markdown import keeps nesting
- Drag reorder fix: `window.App` assignment and `renderBlocks` delegation

## Session C — Code blocks

- New block type `code`: `{ id, type:'code', text, lang, children:[], parentId, checked }`.
  `lang` defaults to `'js'`. Leaf block — no children.
- Slash menu entry **Code** (icon `</>`, hint ` ``` `).
- Lightweight syntax highlight via **regex spans only** — no Prism, no highlight.js.
  Tokens covered: line comments, block comments, strings (single/double/template),
  keywords, numbers, class names (PascalCase).
- Overlay rendering: a `<pre class="code-backdrop">` with highlighted HTML sits behind a
  `color:transparent` `<textarea>` so the caret is visible against the highlight.
- Editable language badge (`<input>` in the header bar) updates `block.lang` on blur and
  re-highlights the backdrop.
- **Markdown export**: fenced ` ```lang … ``` ` blocks.
- **Markdown import**: detect ` ```lang ``` ` fences; create code blocks. Nested bullet
  import from Session B continues to work.
- `Shift+Enter` in a code block exits to a new paragraph below.
- `Tab` in a code block inserts 2 spaces (no indent/outdent).

## Visual

IBM Plex Sans/Mono, paper `#ebe4d6` / `#fffdf8`, rust `#b4451a`, header `#2a251f`. Hub link `../`.
