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

## Out of scope (later sessions)

Extract-module, import-rule changes, real git.

## Visual

IBM Plex Sans/Mono, paper `#ebe4d6` / `#fffdf8`, rust `#b4451a`, header `#2a251f`. Hub link `../`.
