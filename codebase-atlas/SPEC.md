# Codebase atlas — frozen spec

Internal spec for Wave 2 project 17. Vanilla HTML/CSS/JS. Persist to `localStorage` key `codebase-atlas-v1`.

## Product

A fake 300+ file repo in memory (do **not** write 300 files to disk). Search, outline, call graph, command palette, one rename-symbol across files.

Lives at `codebase-atlas/index.html`.

## Repo model

Each file: `{ path, language, text }`. Seed ≥ 350 files under `src/` with a Nit-like or JS-like tiny language so symbols can be parsed (`function name(` / `fn name`). Edges: file A calls symbol defined in file B.

## Session A must

- Seed ≥ 350 files (generator in JS, run at boot if storage empty)
- File tree (virtualized or folder-collapsed — must stay usable)
- Open file in a read/edit pane
- Search by symbol or path (command palette `Ctrl+K` / `Ctrl+P`)
- Outline of symbols in the active file
- Call graph panel for the active symbol (callers / callees)
- Rename symbol: updates all files that reference it; graph and search refresh
- Hash `#/f/<urlencoded-path>`
- Reset seed (clears edits)

## Session C must — Extract Module

Trigger: hover a symbol row in the Outline → click **extract** button (or click a symbol to select it, then click extract).

### Behaviour

1. Opens the **Extract Function** dialog showing the function signature preview and a default destination path: `<source-dir>/<functionName>.js`.
2. User may edit the dest path. Press **Extract** (or `Enter`) to confirm.
3. **Source file** — function body replaced in-place with an import stub:
   - ES module style (if source uses `import`/`export`): `import { fn } from './fn.js'; // extracted`
   - CommonJS style (default for seed files): `const { fn } = require('./fn'); // extracted`
4. **Dest file** — created in-memory: `// Extracted from <source>\n\n<functionBody>\n`
5. `rebuildIndex()` runs; file tree, outline, call graph all refresh.
6. App navigates to `#/f/<urlencoded-dest-path>`.

### Dest path convention

`<sourceDir>/<functionName>.js` — sibling to the source file, named after the extracted function.

### 3-click A/B path

| Step | Click |
|------|-------|
| 1 | Hover a sym row in the Outline → click **extract** |
| 2 | (optionally edit dest path) → click **Extract** button |
| 3 | App navigates to `#/f/<urlencoded-dest-path>`; new file is open |

### Constraints

- 100 % in-memory. No disk writes. File count grows by 1 per extraction.
- `loadFiles` check (`arr.length >= 350`) still satisfied — seed starts at 373.
- All existing features (tree, edit, Ctrl+K/P, outline, call graph, rename, reset) unaffected.

## Out of scope

Import-rule changes, real git.

## Visual

IBM Plex Sans/Mono, paper `#ebe4d6` / `#fffdf8`, rust `#b4451a`, header `#2a251f`. Hub link `../`.
