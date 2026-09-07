# Ant City — frozen spec

Internal spec for the ant/city simulation. Vanilla HTML/CSS/JS. No dependencies. Persist slider prefs to `localStorage` key `simulation-v1`.

## Product

Canvas-based ant colony demo with city buildings, pheromone trails, and a control panel. Lives at `simulation/index.html`.

## World

- Fixed logical size 960×640; canvas scales to fit panel
- Seeded procedural city: 8–14 axis-aligned building blocks with gaps for streets
- One nest (colony hub) placed in a clear cell; 10–18 food sources in reachable lots
- Buildings are impassable; ants slide along edges on collision

## Ants

- Population controlled by slider (4–120); excess ants removed, deficit spawned at nest
- States: **explore** (seek food) and **return** (carry food home)
- Explore: biased random walk + follow food-pheromone gradient; deposit home pheromone lightly
- Return: steer toward nest + deposit food pheromone; food counted on delivery
- Speed slider scales simulation substeps per frame

## Pheromone

- Two float grids (food trail, home trail) matching world resolution
- Fade rate controlled by slider (0.002–0.08 per tick)
- Rendered as warm rust / amber overlays on canvas

## Controls

| Control | Range | Effect |
|---------|-------|--------|
| Speed | 0.25–4× | Simulation rate |
| Population | 4–120 | Target ant count |
| Pheromone fade | 0–100 | Maps to decay rate |
| Pause | toggle | Stop/resume loop |
| Step | button | One tick while paused |
| Seed | integer | Resets world deterministically |
| Reset | button | Rebuild from seed |

Slider values persist in `localStorage` (`simulation-v1`). Seed is not persisted (explicit replay choice).

## Stats

- Live labels: ant count, food collected, tick count
- Canvas sparkline/bar chart: food collected over last ~120 samples

## Visual

- Warm paper background, rust accent (`tokens.css` palette aligned with hub)
- Link to `../` hub in header

## Out of scope

- Web Workers, npm, backend, multi-colony wars, ant death/lifecycle, editing buildings at runtime.
