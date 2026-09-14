# Structured three-way merge — frozen spec

Internal spec for Wave 2 project 16. Vanilla HTML/CSS/JS. Persist to `localStorage` key `structured-merge-v1`.

## Product

Merge two edits of a nested JSON document against a base. Conflict cards, accept/reject hunks, reconstruct a valid document.

Lives at `structured-merge/index.html`.

## Model

Three JSON values: `base`, `ours`, `theirs`. Diff by path (object keys, array index). A hunk is `{ path, kind: add|remove|change|conflict, base, ours, theirs }`.

Conflict = both sides changed the same path to different values.

Result starts as `base` plus auto-applied non-conflicts. Conflicts stay pending until Accept ours / Accept theirs.

## Session A must (completed)

- Seed: 2 fixtures (nested object + array insert) that produce at least one auto-merge and one conflict
- Three panes (base / ours / theirs) + result pane
- Conflict list with Accept ours / Accept theirs
- Result must always be parseable JSON
- Export result
- Hash `#/f/<fixtureId>`
- Reset

## Session B must (completed)

- `null` SETs the key (does not delete it)
- Switching fixtures stashes pending resolutions (`state.stash`)
- STORAGE_KEY `structured-merge-v1`

## Session C must (completed)

- **Move detection**: objects/array elements that have an `id` field and appear at a different array index on one side vs base emit a `kind:'move'` hunk (`fromPath → toPath`) instead of a remove+add pair
- Moves are applied by replacing the entire parent array with the reordered version from the moving side (`setAtPath(result, arrayPath, sideArray)`) — result is always valid JSON
- Third fixture **`reorder-todos`**: base items `[{id:1},{id:2},{id:3}]`, ours moves id:3 to index 0 (producing 3 move hunks), theirs auto-renames the title — no conflicts
- Existing `feature-flags` and `todo-list` fixtures keep identical auto-merge + conflict behaviour (ids don't change array position → no moves invented)
- Move hunks render in the auto-merged panel as `items.N → items.M  [move]  [ours]  id:3`

### Visual token for moves

Amber pill: `background rgba(138,98,0,.10); color #7a5800` — distinct from green (add), rust (remove/conflict), and gray (change).

### 3-click A/B path

1. Open `#/f/reorder-todos` (or select from the fixture dropdown)
2. Auto-merged panel shows: 3 amber **move** rows (`items.2 → items.0`, `items.0 → items.1`, `items.1 → items.2`) + 1 `change` row for `title`; conflict badge = 0
3. Result pane shows `{ "title": "Backlog v2", "items": [{"id":3,…}, {"id":1,…}, {"id":2,…}] }`

## Out of scope

YAML, block-tree documents.

## Visual

IBM Plex Sans/Mono, paper `#ebe4d6` / `#fffdf8`, rust `#b4451a`, header `#2a251f`. Hub link `../`.
