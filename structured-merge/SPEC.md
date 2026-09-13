# Structured three-way merge — frozen spec

Internal spec for Wave 2 project 16. Vanilla HTML/CSS/JS. Persist to `localStorage` key `structured-merge-v1`.

## Product

Merge two edits of a nested JSON document against a base. Conflict cards, accept/reject hunks, reconstruct a valid document.

Lives at `structured-merge/index.html`.

## Model

Three JSON values: `base`, `ours`, `theirs`. Diff by path (object keys, array index). A hunk is `{ path, kind: add|remove|change|conflict, base, ours, theirs }`.

Conflict = both sides changed the same path to different values.

Result starts as `base` plus auto-applied non-conflicts. Conflicts stay pending until Accept ours / Accept theirs.

## Session A must

- Seed: 2 fixtures (nested object + array insert) that produce at least one auto-merge and one conflict
- Three panes (base / ours / theirs) + result pane
- Conflict list with Accept ours / Accept theirs
- Result must always be parseable JSON
- Export result
- Hash `#/f/<fixtureId>`
- Reset

## Out of scope (later sessions)

Move detection (same node, new path), YAML, block-tree documents.

## Visual

IBM Plex Sans/Mono, paper `#ebe4d6` / `#fffdf8`, rust `#b4451a`, header `#2a251f`. Hub link `../`.
