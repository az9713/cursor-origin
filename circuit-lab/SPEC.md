# Circuit lab — frozen spec

Internal spec for Wave 3 project 23. Vanilla HTML/CSS/JS. Persist to `localStorage` key `circuit-lab-v1`.

## Product

Logic schematic ↔ tiny HDL. Both views are one netlist. Gates, wires, clock, probes, truth table. Step and run. Lives at `circuit-lab/index.html`.

A wire that looks connected must toggle. Text ↔ schematic must not drop a pin.

## Language (Session A)

```
stmt ::= ident "=" "NOT" ident
       | ident "=" ("AND"|"OR"|"XOR"|"NAND"|"NOR") ident ident
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

## Out of scope (later sessions)

Buses, new gate types beyond the grammar, multi-bit vectors.

## Visual

IBM Plex Sans/Mono, paper `#ebe4d6` / `#fffdf8`, rust `#b4451a`, header `#2a251f`.
