# Constraint sketch — frozen spec

Internal spec for Wave 3 project 26. Vanilla HTML/CSS/JS. Persist to `localStorage` key `constraint-sketch-v1`.

## Product

Geometric constraint sketch. Points, lines, circles, coincident / parallel / distance / angle / equal-length. A real solver (not drag-only). Under/over-constrained badges. Lives at `constraint-sketch/index.html`.

Moving one point must satisfy constraints or fail loudly. Pixel drift after solve (>1px vs last solved positions for a fully constrained sketch) is a bug.

## Model

Entities: point `{id,x,y}`, line `{id,a,b}` (point ids), circle `{id,c,r}` (center point id + radius).
Constraints:
- coincident(p1,p2)
- distance(p1,p2,len)
- parallel(l1,l2)
- equal-length(l1,l2)  (Session C; two lines same length)
- angle(l1,l2,deg)
- point-on-line(p,l)
- radius(circle, r)  (locks circle radius)

Solver: iterative least-squares / relaxation, max iterations documented in UI. Residual badge: satisfied / under / over / failed.

Drag a free point; solver runs; constrained points move.

## Session A must

- Canvas + toolbar (add point/line/circle, add constraint)
- Inspector for selected entity/constraint
- ≥ 2 seed sketches (a rectangle with distances; a right triangle)
- Status: dof estimate + residual
- Hash `#/s/<sketchId>`
- Reset
- Hub link `../`

## Session C must

- New constraint type `equal-length`: `{ id, type:'equal-length', l1, l2 }` (two lines same length)
- Solver residual is the length difference in pixels (same units as distance): `|len(l1) − len(l2)|`
- Toolbar + inspector: add equal-length like parallel (pick two lines)
- Status badges (satisfied / under / over / failed) still work
- Rectangle and Right Triangle seeds keep Session A constraints and solve to the same geometry
- Optional extra seed `#/s/isosceles` (isosceles triangle using equal-length) — does not replace rectangle or triangle
- Reset still restores the current sketch's seed (Session B)
- No CAD export

## Out of scope (later sessions)

CAD export, parametric dimensions UI beyond the inspector, further constraint types.

## Visual

IBM Plex Sans/Mono, paper `#ebe4d6` / `#fffdf8`, rust `#b4451a`, header `#2a251f`.
