# Auto-layout playground — frozen spec

Internal spec for Wave 2 project 15. Vanilla HTML/CSS/JS. Persist to `localStorage` key `auto-layout-v1`.

## Product

Boxes with padding, gap, hug/fill, wrap, alignment, absolute-inside-auto-layout. Live inspector plus a deterministic solver. Golden fixtures.

Lives at `auto-layout/index.html`.

## Node model

```
{ id, name, w, h, padding, gap,
  direction: 'row'|'col', wrap, justify, align,
  sizingX: 'hug'|'fill'|'fixed',
  sizingY: 'hug'|'fill'|'fixed',
  position: 'flow'|'absolute',   // Session C; default 'flow'
  absX, absY,                    // Session C; offset from parent inner-top-left (px)
  children[] }
```

Root has a fixed frame (800×520). Solver writes `_x,_y,_w,_h` on each node.

## Session A must

- Seed: 3 fixtures (row hug, column fill, wrap at 480px-wide frame)
- Canvas of computed rects (not the browser flexbox as the source of truth — JS solver)
- Select a node; inspector edits padding/gap/direction/sizing
- Add child / delete node
- Fixture switcher; a status line that says whether the current layout matches the golden numbers (±1px)
- Hash `#/f/<fixtureId>`
- Reset

## Session B must

- Fill inside Hug coerced to Hug (not a solver error, just UI guard + `coerceFillInHug()`)
- `hashchange` event saves state (`saveState()`)
- `localStorage` key: `auto-layout-v1`
- Hash pattern: `#/f/<fixtureId>`

## Session C must

- Node field `position: 'flow' | 'absolute'` (default `'flow'`)
- Absolute children do **not** participate in hug/fill flow calculations
- Absolute children placed at `parent._x + pad.l + absX`, `parent._y + pad.t + absY`
- Absolute children sized from their own hug/fixed/fill resolved against parent inner box
- Absolute children exempt from the fill-in-hug coercion
- Inspector: Position select (`flow` / `absolute`); when absolute, show `Abs X` and `Abs Y` number inputs
- 4th fixture `abs-overlay`: a 400×300 col frame with two flow children (photo fill×fixed h:160,
  footer fill×fixed h:56) and one absolute badge (fixed 72×28, absX=8, absY=8)
- Golden numbers for `abs-overlay` (±1 px):
  - root:   x=0,  y=0,   w=400, h=300
  - photo:  x=16, y=16,  w=368, h=160
  - footer: x=16, y=184, w=368, h=56
  - badge:  x=24, y=24,  w=72,  h=28
- Absolute nodes rendered with dashed stroke in SVG canvas

## Out of scope

CSS grid, sibling constraints.

## Visual

IBM Plex Sans/Mono, paper `#ebe4d6` / `#fffdf8`, rust `#b4451a`, header `#2a251f`. Hub link `../`.
