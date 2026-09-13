# Language workbench — frozen spec

Internal spec for Wave 2 project 11 (hub card 12). Vanilla HTML/CSS/JS. Persist to `localStorage` key `language-workbench-v1`.

## Product

In-browser workbench for a tiny language **Nit**: file tree, editor tabs, diagnostics, go-to-definition, find-references, rename, outline.

Lives at `language-workbench/index.html`.

## Language (Nit)

```
program   ::= (fnDecl | varDecl)*
fnDecl    ::= "fn" IDENT "(" params? ")" block
params    ::= IDENT ("," IDENT)*
varDecl   ::= "let" IDENT "=" expr ";"
block     ::= "{" stmt* "}"
stmt      ::= varDecl | IDENT "=" expr ";" | "return" expr ";" | expr ";"
expr      ::= IDENT | NUMBER | IDENT "(" args? ")" | expr op expr
op        ::= "+" | "-" | "*"
```

Identifiers `[A-Za-z_][A-Za-z0-9_]*`. `--` comments. One file is one program. Cross-file: `use "path.nit";` imports another workspace file’s top-level `fn` names.

## Session A must

- Seed workspace: at least 3 files (`main.nit`, `math.nit`, `io.nit`) that `use` each other
- File tree + open tabs + dirty flag
- Diagnostics list (unknown ident, duplicate fn) with click-to-line
- Outline of fns in the active file
- Go to definition and find references for the ident under the caret (or selected word)
- Rename a symbol across open files
- Hash `#/f/<filename>`
- Reset seed button

## Out of scope (later sessions)

Extract-function, new identifier rules, LSP server, syntax highlight beyond a cheap token paint.

## Visual

IBM Plex Sans/Mono, paper `#ebe4d6` / `#fffdf8`, rust `#b4451a`, header `#2a251f`. Hub link back to `../`.
