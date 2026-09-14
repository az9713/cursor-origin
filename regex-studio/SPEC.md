# Regex studio — frozen spec

Internal spec for Wave 3 project 21. Vanilla HTML/CSS/JS. Persist to `localStorage` key `regex-studio-v1`.

## Product

Bidirectional regex studio. Pattern text and a visual atom/group builder are two views of one AST. Haystack highlighter, capture table, explain-this-match. Lives at `regex-studio/index.html`.

Green **roundtrip** chip means `parse(pattern) → print → parse` yields an equal AST.

## Language (Session A)

No lookbehind, no named groups (Session C).

```
pattern ::= alt
alt     ::= concat ("|" concat)*
concat  ::= quantified+
quantified ::= atom quant?
quant   ::= "*" | "+" | "?" | "{" INT ("," INT?)? "}"
atom    ::= CHAR | "." | "^" | "$" | charclass | "(" pattern ")" | "(?:" pattern ")" | "\" escape
charclass ::= "[" "^"? (CHAR | CHAR "-" CHAR)+ "]"
escape  ::= "d" | "w" | "s" | "D" | "W" | "S" | "|" | "." | "*" | "+" | "?" | "(" | ")" | "[" | "]" | "{" | "}" | "\\" | "n" | "t"
```

`CHAR` is any non-metacharacter. Pretty-print should be stable enough that roundtrip succeeds for seed patterns.

Engine: backtracking matcher that records capture spans (numbered groups). Haystack is a string; show all non-overlapping matches (global).

## Session A must

- Pattern textarea + visual builder (atoms, concat, alt, group, quantifier). Editing either updates the other without dropping a group the text still has.
- Haystack textarea; highlight match spans; capture table for the selected match
- Explain-this-match: a short trace of which atom consumed which substring for the selected match
- Roundtrip chip + parse error with index
- ≥ 3 seed presets (email-ish, digits, alternation+group). Hash `#/p/<presetId>`
- Save/load current pattern+haystack; Reset seed
- Hub link `../`

## Out of scope (later sessions)

Lookbehind, Unicode properties, replace-all UI.

## Session C must (completed)

- Named capturing groups `(?<IDENT>pattern)` where IDENT is `[A-Za-z_][A-Za-z0-9_]*`. Numbered `(pattern)` still works. No lookbehind.
- AST `{ type:'group', index, name, child }` — `name` is a string or `null` for unnamed groups.
- `print` emits `(?<name>...)` when `name` is set so parse → print → parse stays equal.
- Engine numbered captures still work. Capture table shows the name when present.
- Visual builder Group atom accepts `name:pattern` or just the inner pattern.
- Fourth seed preset `named`: `(?<user>[\w.+-]+)@(?<host>[\w.-]+)` at `#/p/named`.

## Visual

IBM Plex Sans/Mono, paper `#ebe4d6` / `#fffdf8`, rust `#b4451a`, header `#2a251f`.
