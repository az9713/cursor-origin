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
- Pull requests are a GitHub feature. The Origin (`cursor`) remote is a second copy of the repo, not a second PR queue.
