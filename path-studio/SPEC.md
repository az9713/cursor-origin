# Path studio — frozen spec

Internal spec for Wave 3 project 27. Vanilla HTML/CSS/JS. Persist to `localStorage` key `path-studio-v1`.

## Product

Tile map + pathfinding. Paint walkable tiles, place start/goal, A* / Dijkstra / flow field, cost heatmap, stepping agent. Lives at `path-studio/index.html`.

The path drawn on the map must match the open/closed sets in the debug panel.

## Model

Grid `cols × rows` (seed 24×16). Each cell: `blocked` or cost ≥ 1 (default 1). 4-neighbor movement; Session C adds portal extra edges (cost 1 teleport). Start and goal cells.

Algorithms (Session A):
- Dijkstra
- A* (Manhattan heuristic)
- Flow field (cost-to-go from goal; agent follows descent)

Debug: open set, closed set, final path. Heatmap = g-score or cost-to-go.

Agent: step along the path (or flow field) one cell per tick.

## Session A must

- Paint blocked / cost ( palettes: blocked, cost 1, cost 5 )
- Place start + goal
- Algorithm toggle; recompute on edit
- Heatmap overlay + path polyline
- Debug list (expand counts + path length)
- Step agent / Reset agent
- Hash `#/m/<mapId>` for ≥ 2 seed maps
- Reset
- Hub link `../`

## Session C must

- Portals: a pair of walkable cells. From either cell, neighbors include the other cell at cost 1 (teleport)
- Portal paint tool (two-click to pair). Matching glyph/letter on both cells
- A*, Dijkstra, and flow field all use portal edges
- Seed maps `open` and `maze` have no portals and produce the same path as Session A
- Optional third seed `#/m/portals` demonstrating a portal shortcut
- Debug path list matches the drawn path, including portal jumps
- Grid still 24×16, 4-neighbor + portal extra edge

## Out of scope (later sessions)

Diagonal movement, hierarchical maps.

## Visual

IBM Plex Sans/Mono, paper `#ebe4d6` / `#fffdf8`, rust `#b4451a`, header `#2a251f`.
