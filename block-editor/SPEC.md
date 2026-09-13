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

Linked databases, relations, transclusion, images, code blocks with highlight.

## Visual

IBM Plex Sans/Mono, paper `#ebe4d6` / `#fffdf8`, rust `#b4451a`, header `#2a251f`. Hub link `../`.
