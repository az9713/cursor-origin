# Page Clone — frozen spec

Internal spec for Project 3. Vanilla HTML/CSS/JS. No new dependencies. Persist inspector overrides to `localStorage` key `page-clone-v1`.

## Product

A dense, original marketing + docs page for the fictional product **Harbor Ledger** (maritime finance ops platform). Lives at `page-clone/index.html`. Includes a live DOM inspector for stress-testing page editing workflows.

## Page content

- Hero with headline, subcopy, CTA
- Stats strip (4 metrics)
- Feature grid (6 cards)
- Pricing table (3 tiers)
- FAQ (6 items, accordion)
- Long docs-like section (installation, API overview, webhooks, compliance)
- Footer with hub link

## Typography & visual

- **Not** Inter, not purple-gradient SaaS slop
- Display: Newsreader (serif editorial)
- UI/body: DM Sans
- Mono: IBM Plex Mono for stats/code
- Palette: deep navy, seafoam, sand, amber signal — coastal finance editorial

## Live inspector

- Click any text/node on the page (except inspector chrome) to select it
- Selected node gets a visible highlight outline
- Inspector panel shows: element tag, text editor, color picker
- Changes apply immediately and persist to `localStorage` key `page-clone-v1`
- **Reset** clears all overrides and restores original content/styles
- Inspector chrome is marked `data-inspector-chrome` and is not selectable

## Storage shape

```json
{
  "overrides": {
    "<dom-path>": { "text": "...", "color": "#..." }
  }
}
```

DOM path: tag-index chain from `body` child, e.g. `main:0>section:2>h2:0`.

## Out of scope

Backend, real product, cloning third-party sites, frameworks, build tools.
