# cursor_origin

## What this is

Hub repo for Cursor stress-test sub-projects. GitHub: `az9713/cursor-origin`. Each product lives in its own folder with its own `index.html`. Do not put app code at the repo root.

Current sub-projects:
- `mini-linear/` — Project 1: messy mini Linear, then architectural refactor

## How to run

Open `index.html` at the repo root (hub) or `mini-linear/index.html` (the app). Or from the repo root:

```bash
python -m http.server 8080
```

Then visit `http://localhost:8080/` or `http://localhost:8080/mini-linear/`.

## Conventions

- Do not commit `.env` or secrets
- Ask before adding dependencies
- use gh cli to create/push the repo `github.com/az9713/cursor-origin`
- always have a README.md at repo root
- if any main html exists, make it a GitHub page and render it live in README.md
- Customer-facing docs: HTML. Do not ship Markdown as the customer-facing surface.
- Internal docs (plans, agent notes, specs for the agent): Markdown is fine.
- New apps go in a sibling folder (`mini-linear/`, later `spreadsheet/`, etc.), never overwrite the hub `index.html`
- Frozen product spec for an app: `<app>/SPEC.md`
