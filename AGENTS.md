# cursor_origin

## What this is

Hub repo for Cursor stress-test sub-projects. GitHub: `az9713/cursor-origin`. Each product lives in its own folder with its own `index.html`. Do not put app code at the repo root.

Current sub-projects:
- `mini-linear/` — Project 1: messy mini Linear, then architectural refactor
- `spreadsheet/` — Project 2: grid with a real formula engine
- `vector-editor/` — Project 3: Figma-lite artboard
- `desktop-os/` — Project 4: windowed desktop + three apps
- `compiler/` — Project 5: toy language playground
- `page-clone/` — Project 6: original page + inspector
- `simulation/` — Project 7: ant simulation
- `saas-shell/` — Project 8: Incident Commander SaaS shell
- `shader-studio/` — Project 9: WebGL2 shader studio
- `knowledge-graph/` — Project 10: computing-history graph
- `query-studio/` — Project 11: bidirectional SQL studio (text ↔ visual builder)
- `language-workbench/` — Project 12: Nit workbench (tabs, diagnostics, rename)
- `block-editor/` — Project 13: nested blocks / slash menu
- `calendar-engine/` — Project 14: recurrences + ICS
- `auto-layout/` — Project 15: hug/fill layout solver
- `structured-merge/` — Project 16: three-way JSON merge
- `codebase-atlas/` — Project 17: in-memory 350-file atlas
- `motion-editor/` — Project 18: keyframe timeline
- `spec-hunter/` — Project 19: planted-bug issue tracker
- `crdt-notes/` — Project 20: two-peer CRDT notes
- `regex-studio/` — Project 21: bidirectional regex studio
- `git-theatre/` — Project 22: in-browser Git object store
- `circuit-lab/` — Project 23: schematic ↔ HDL
- `packet-forge/` — Project 24: packet header forge
- `ledger-books/` — Project 25: double-entry ledger
- `constraint-sketch/` — Project 26: geometric constraint sketch
- `path-studio/` — Project 27: tile map + pathfinding
- `css-cascade/` — Project 28: CSS cascade laboratory
- `audio-tracker/` — Project 29: multi-track audio tracker
- `board-rules/` — Project 30: chess rules + PGN

## How to run

Open `index.html` at the repo root (hub) or any sub-project `index.html`. Or from the repo root:

```bash
python -m http.server 8080
```

Then visit `http://localhost:8080/` or a folder such as `http://localhost:8080/spreadsheet/`.

## Conventions

- Do not commit `.env` or secrets
- Ask before adding dependencies
- use gh cli to create/push the repo `github.com/az9713/cursor-origin`
- always have a README.md at repo root
- if any main html exists, make it a GitHub page and render it live in README.md
- Customer-facing docs: HTML. Do not ship Markdown as the customer-facing surface.
- Process record for the whole hub: `development_journey.html`
- Internal docs (plans, agent notes, specs for the agent): Markdown is fine.
- New apps go in a sibling folder (`mini-linear/`, later `spreadsheet/`, etc.), never overwrite the hub `index.html`
- Frozen product spec for an app: `<app>/SPEC.md`
