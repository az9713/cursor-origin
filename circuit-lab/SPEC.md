# Circuit lab — frozen spec

Internal spec for Wave 3 project 23. Vanilla HTML/CSS/JS. Persist to `localStorage` key `circuit-lab-v1`.

## Product

Logic schematic ↔ tiny HDL. Both views are one netlist. Gates, wires, clock, probes, truth table. Step and run. Lives at `circuit-lab/index.html`.

A wire that looks connected must toggle. Text ↔ schematic must not drop a pin.

## Language (Session A)

```
stmt ::= ident "=" "NOT" ident
       | ident "=" ("AND"|"OR"|"XOR"|"NAND"|"NOR"|"XNOR") ident ident
       | ident "=" "IN" INT          # numbered input switch
       | ident "=" "OUT" ident       # probe
       | ident "=" "DFF" ident       # rising-edge D flip-flop, clocked
```

Idents `[A-Za-z_][A-Za-z0-9_]*`. One statement per line. `#` comments.

Simulation: combinational settle (max 64 iterations; loop = error). Clock tick flips DFFs then settles.

## Session A must

- Schematic canvas (place gates, click to wire ports, input switches, probes)
- HDL textarea; editing either updates the other (roundtrip chip: parse → print → parse)
- Step (one clock) and Run (animate)
- Truth table for combinational circuits (no DFF): all input combinations
- ≥ 2 seed circuits: XOR from NAND-ish or AND/OR/NOT, and a 1-bit register
- Hash `#/c/<circuitId>`
- Reset seed
- Hub link `../`

## Session C must

- New gate type `XNOR`: `ident = XNOR ident ident` (2-input; output 1 iff inputs equal)
- `parseHDL` / `printHDL` / `checkRoundtrip` handle XNOR
- Simulator combinational settle evaluates XNOR
- Palette button + schematic drawing (same style as XOR / NAND)
- Roundtrip chip still works for XOR seed and DFF seed
- XOR seed truth table remains `0110`; DFF still latches only on Step
- Optional third seed `#/c/xnor` (2-input XNOR with probes) — does not replace `xor` or `dff-reg`

## Out of scope (later sessions)

Buses, multi-bit vectors.

## Visual

IBM Plex Sans/Mono, paper `#ebe4d6` / `#fffdf8`, rust `#b4451a`, header `#2a251f`.
