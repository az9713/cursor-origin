# Vector editor — frozen spec

Internal spec for Project 3. Vanilla HTML/CSS/JS. No new dependencies. Persist to `localStorage` key `vector-editor-v1`.

## Product

A Figma-lite vector editor with one artboard. Lives at `vector-editor/index.html`.

## Artboard

- Single fixed artboard (800×560 px) on warm paper background
- Shapes render in SVG; selection overlay with resize handles

## Tools

| Key | Tool | Behavior |
|-----|------|----------|
| V | Select | Click to select; drag body to move; drag handles to resize |
| R | Rectangle | Drag to create axis-aligned rectangle |
| O | Ellipse | Drag to create ellipse in bounding box |
| P / toolbar | Draw | Click to add polyline vertices; double-click or Enter to finish |

## Shapes

- **Rectangle** — x, y, width, height, fill, stroke
- **Ellipse** — x, y, width, height (bounding box), fill, stroke
- **Polyline** — points[], stroke, no fill (open path)

All positions and sizes snap to an 8 px grid on create, move, and resize.

## Layers panel

- Lists shapes top-to-bottom (front at top)
- Reorder via up/down buttons
- Toggle visibility (eye)
- Delete layer (removes shape)

## History

- Undo / Redo buttons and Ctrl+Z / Ctrl+Y
- Snapshots on create, move, resize, reorder, delete, hide toggle

## Export

- Download current artboard as standalone SVG file

## Keyboard

- V, R, O — switch tools
- Delete / Backspace — delete selected shape
- Ctrl+Z — undo; Ctrl+Y / Ctrl+Shift+Z — redo
- Enter — finish polyline while drawing
- Escape — cancel polyline in progress

## Seed

First visit (no saved state) loads 4 demo shapes: rectangle, ellipse, polyline, small accent rectangle.

## Out of scope

Multiple artboards, text, groups, boolean ops, pen curves, collaboration, backend.
