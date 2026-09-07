# Knowledge Graph Explorer

Frozen product spec for the history-of-computing knowledge graph demo.

## Goal

Interactive browser explorer for a fictional-but-grounded graph of computing history (~350 nodes). Vanilla HTML/CSS/JS, no build step, served from `knowledge-graph/index.html`.

## Data

- `js/data.js` exports `KG_DATA` with `types`, `nodes`, `edges`.
- Node fields: `id`, `label`, `type`, `year`, `summary`, `tags[]`.
- Edge fields: `source`, `target`, `relation`.
- Types: `person`, `company`, `technology`, `event`, `concept`.

## Layout

- `js/layout.js`: cluster-by-type seed positions + lightweight force simulation (repulsion + edge attraction).
- Canvas renderer with pan/zoom; labels on hover/selection.

## Interaction

| Feature | Behavior |
|---------|----------|
| Pan | Drag background |
| Zoom | Wheel |
| Click node | Select, open detail panel, set `#/n/<id>` |
| Search | Filter/highlight by label, tags, summary; `?q=` in URL |
| Type filter | Toggle types in sidebar |
| Detail panel | Label, type, year, summary, connected nodes |
| URL state | `#/n/<id>` deep-link node; `?q=<query>` search |

## Visual

- Warm paper background (`--paper`), rust accent links (`--rust`).
- Header link back to repo hub (`../`).

## Files

```
knowledge-graph/
  SPEC.md
  index.html
  css/tokens.css
  css/app.css
  js/data.js
  js/layout.js
  js/app.js
```

## Run

From repo root: `python -m http.server 8080` → http://localhost:8080/knowledge-graph/
