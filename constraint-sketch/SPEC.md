# Constraint sketch — frozen spec

Internal spec for Wave 3 project 26. Vanilla HTML/CSS/JS. Persist to `localStorage` key `constraint-sketch-v1`.

## Product

Geometric constraint sketch. Points, lines, circles, coincident / parallel / distance / angle. A real solver (not drag-only). Under/over-constrained badges. Lives at `constraint-sketch/index.html`.

Moving one point must satisfy constraints or fail loudly. Pixel drift after solve (>1px vs last solved positions for a fully constrained sketch) is a bug.

## Model

Entities: point `{id,x,y}`, line `{id,a,b}` (point ids), circle `{id,c,r}` (center point id + radius).
Constraints:
- coincident(p1,p2)
- distance(p1,p2,len)
- parallel(l1,l2)
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

## Out of scope (later sessions)

New constraint types beyond the list, CAD export, parametric dimensions UI beyond the inspector.

## Visual

IBM Plex Sans/Mono, paper `#ebe4d6` / `#fffdf8`, rust `#b4451a`, header `#2a251f`.
