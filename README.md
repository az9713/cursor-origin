# cursor-origin

Hub repo for vanilla HTML/CSS/JS apps that stress Cursor’s agentic IDE loop — freeze a spec, implement, click the broken control, keep old flows green. Thirty sibling products through Session C, plus a [warts-and-all development journey](https://az9713.github.io/cursor-origin/development_journey.html). No backends, no build step.

Live hub: https://az9713.github.io/cursor-origin/

<iframe src="https://az9713.github.io/cursor-origin/" width="100%" height="640" style="border:1px solid #d7cfc0; background:#f2ece1;"></iframe>

Apps live next to the hub (`<folder>/`). The directory below is grouped by domain, not bake-off order.

## Apps & shells

| # | App | What |
| --: | --- | --- |
| 1 | [Mini Linear](https://az9713.github.io/cursor-origin/mini-linear/) | Board, list, hash routes ([Session A messy tree](https://az9713.github.io/cursor-origin/mini-linear/messy.html)) |
| 4 | [Desktop OS](https://az9713.github.io/cursor-origin/desktop-os/) | Windows, taskbar, Notes, Finder, fake-VFS Terminal |
| 8 | [SaaS shell](https://az9713.github.io/cursor-origin/saas-shell/) | Incident Commander: eight views, tokens, shortcuts |
| 19 | [Spec hunter](https://az9713.github.io/cursor-origin/spec-hunter/) | Issue tracker whose SPEC is the truth |

## Editors & layout

| # | App | What |
| --: | --- | --- |
| 3 | [Vector editor](https://az9713.github.io/cursor-origin/vector-editor/) | Artboard, layers, SVG export |
| 6 | [Page + inspector](https://az9713.github.io/cursor-origin/page-clone/) | Dense page with a live copy/color inspector |
| 13 | [Block editor](https://az9713.github.io/cursor-origin/block-editor/) | Nested blocks, slash menu, markdown |
| 15 | [Auto-layout](https://az9713.github.io/cursor-origin/auto-layout/) | Hug/fill solver — not CSS flex as truth |
| 18 | [Motion editor](https://az9713.github.io/cursor-origin/motion-editor/) | Keyframes, easing, playhead |
| 26 | [Constraint sketch](https://az9713.github.io/cursor-origin/constraint-sketch/) | Geometric constraints, equal-length, real solver |
| 28 | [CSS cascade](https://az9713.github.io/cursor-origin/css-cascade/) | Specificity, `@layer`, iframe as renderer |

## Language & data

| # | App | What |
| --: | --- | --- |
| 2 | [Spreadsheet](https://az9713.github.io/cursor-origin/spreadsheet/) | Formula engine, fill handle, undo, CSV |
| 5 | [Compiler](https://az9713.github.io/cursor-origin/compiler/) | Lexer, parser, bytecode VM for a toy language |
| 11 | [Query studio](https://az9713.github.io/cursor-origin/query-studio/) | SQL text ↔ visual builder |
| 12 | [Language workbench](https://az9713.github.io/cursor-origin/language-workbench/) | Nit tabs, diagnostics, rename |
| 16 | [Structured merge](https://az9713.github.io/cursor-origin/structured-merge/) | Three-way JSON merge, conflict cards |
| 17 | [Codebase atlas](https://az9713.github.io/cursor-origin/codebase-atlas/) | 350-file fake repo: search, graph, rename |
| 21 | [Regex studio](https://az9713.github.io/cursor-origin/regex-studio/) | Pattern ↔ builder, named groups, roundtrip |

## Systems & protocols

| # | App | What |
| --: | --- | --- |
| 20 | [CRDT notes](https://az9713.github.io/cursor-origin/crdt-notes/) | Three fake peers, offline queue, snapshots |
| 22 | [Git theatre](https://az9713.github.io/cursor-origin/git-theatre/) | In-browser objects, merge, rebase, cherry-pick |
| 23 | [Circuit lab](https://az9713.github.io/cursor-origin/circuit-lab/) | Schematic ↔ HDL, XNOR, DFF |
| 24 | [Packet forge](https://az9713.github.io/cursor-origin/packet-forge/) | Ethernet / IPv4 / TCP / UDP / ICMP ↔ hex |
| 25 | [Ledger books](https://az9713.github.io/cursor-origin/ledger-books/) | Double-entry, personal & business books |
| 27 | [Path studio](https://az9713.github.io/cursor-origin/path-studio/) | A* / Dijkstra / flow field, portals |

## Worlds & media

| # | App | What |
| --: | --- | --- |
| 7 | [Ant simulation](https://az9713.github.io/cursor-origin/simulation/) | Canvas agents, sliders, population chart |
| 9 | [Shader studio](https://az9713.github.io/cursor-origin/shader-studio/) | Live GLSL, WebGL2, presets |
| 10 | [Knowledge graph](https://az9713.github.io/cursor-origin/knowledge-graph/) | History of computing: search, filters, deep links |
| 14 | [Calendar engine](https://az9713.github.io/cursor-origin/calendar-engine/) | Recurrences, DST, ICS |
| 29 | [Audio tracker](https://az9713.github.io/cursor-origin/audio-tracker/) | Piano roll, BPM, 16th swing |
| 30 | [Board rules](https://az9713.github.io/cursor-origin/board-rules/) | Chess + Chess960, board ↔ PGN |

## Run locally

```bash
python -m http.server 8080
```

Open `http://localhost:8080/` or any sub-project folder.
