# Auto-layout playground — frozen spec

Internal spec for Wave 2 project 15. Vanilla HTML/CSS/JS. Persist to `localStorage` key `auto-layout-v1`.

## Product

Boxes with padding, gap, hug/fill, wrap, alignment. Live inspector plus a deterministic solver. Golden fixtures.

Lives at `auto-layout/index.html`.

## Node model

```
{ id, name, w, h, padding, gap, direction: row|col, wrap, justify, align, sizingX: hug|fill|fixed, sizingY: hug|fill|fixed, children[] }
```

Root has a fixed frame (800×520). Solver writes `x,y,w,h` on each node.

## Session A must

- Seed: 3 fixtures (row hug, column fill, wrap at 480px-wide frame)
- Canvas of computed rects (not the browser flexbox as the source of truth — JS solver)
- Select a node; inspector edits padding/gap/direction/sizing
- Add child / delete node
- Fixture switcher; a status line that says whether the current layout matches the golden numbers (±1px)
- Hash `#/f/<fixtureId>`
- Reset

## Out of scope (later sessions)

CSS grid, absolute-inside-auto-layout, constraints between siblings.

## Visual

IBM Plex Sans/Mono, paper `#ebe4d6` / `#fffdf8`, rust `#b4451a`, header `#2a251f`. Hub link `../`.
