# SaaS Shell — Incident Commander

Vanilla HTML/CSS/JS design-system shell for stress-testing Cursor. No build step, no npm.

## Product

**Incident Commander** — on-call incident management with dashboard, list/detail, war room, team, settings, on-call, and search.

## Run

From repo root:

```bash
python -m http.server 8080
```

Open `http://localhost:8080/saas-shell/` (hash routes, e.g. `#/dashboard`).

## Files

| File | Role |
|------|------|
| `index.html` | Shell layout, nav, modals |
| `css/tokens.css` | Design tokens (industrial rust/paper) |
| `css/app.css` | Layout, components, states |
| `js/state.js` | Seed data, localStorage `saas-shell-v1` |
| `js/router.js` | Hash router parse/write |
| `js/app.js` | Views, keyboard shortcuts, render |

## Routes

| Hash | View |
|------|------|
| `#/dashboard` | KPI cards, active incidents, recent activity |
| `#/incidents` | Filterable list; empty state when no matches |
| `#/incident/:id` | Detail, metadata, actions |
| `#/war-room/:id` | Timeline / war room for incident |
| `#/team` | Team roster |
| `#/settings` | Workspace settings (persisted) |
| `#/oncall` | On-call schedule |
| `#/search?q=` | Global search results |

Query params on `#/incidents`: `status`, `severity`, `q`.

## UX

- `?` — keyboard shortcut help overlay
- Empty, error, and loading states on relevant views
- Dummy data persists in `localStorage` key `saas-shell-v1`
- Link to hub at `../`

## Visual

Industrial palette: rust `#b4451a`, paper `#f3eee4`, IBM Plex Sans/Mono.
