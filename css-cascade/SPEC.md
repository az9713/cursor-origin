# CSS cascade laboratory — frozen spec

Internal spec for Wave 3 project 28. Vanilla HTML/CSS/JS. Persist to `localStorage` key `css-cascade-v1`.

## Product

Editable HTML + stylesheets, specificity math, cascade trace, computed box, what-if disable of a rule. Lives at `css-cascade/index.html`.

Computed width in the inspector must match the rendered box. Winning the cascade on paper but not in the layout is the tell.

## Session A model

Two stylesheets + an HTML snippet rendered in an iframe (sandbox). Select an element (click in preview or tree). For a chosen CSS property (default `width` and `color`):

- List matching rules with specificity `(a,b,c)` and source order
- Mark the winner; allow disable (checkbox) and recompute
- Show computed style from the iframe (`getComputedStyle`) next to the preview box’s `getBoundingClientRect().width`

Do not fake the layout engine — the iframe is the renderer. The trace must explain that same computed value.

## Session A must

- HTML editor + CSS editor (one or two sheets)
- Preview iframe
- Element tree from the preview document
- Cascade trace for selected property
- Disable-rule what-if
- ≥ 2 seed documents (specificity fight; box model width)
- Hash `#/d/<docId>`
- Reset
- Hub link `../`

## Out of scope (later sessions)

Media queries (optional), shadow DOM, animations.

## Session C must

- Parse `@layer name { ... }` via CSSOM `CSSLayerBlockRule` when available
- Cascade trace shows layer name; unlayered wins over layered (normal cascade)
- What-if disable still works
- Seeds `specificity` and `boxmodel` keep the same winning declarations (not wrapped in `@layer`)
- Seed `#/d/layers` — a layer loses to an unlayered rule on `color` or `width`
- Iframe is the renderer; computed width matches `getBoundingClientRect`
- Padding trace (Session B) still works on `boxmodel`

## Visual

IBM Plex Sans/Mono, paper `#ebe4d6` / `#fffdf8`, rust `#b4451a`, header `#2a251f`.
