# Query studio — frozen spec

Internal spec for Project 11 (wave 2). Vanilla HTML/CSS/JS. No new dependencies. Persist to `localStorage` key `query-studio-v1`.

## Product

A bidirectional SQL studio over in-memory tables. Lives at `query-studio/index.html`.

The Cursor tell: the text editor and the visual builder are two views of one AST. Changing either must update the other without dropping clauses. A green **roundtrip** chip means `parse(sql) → astToSql → parse` yields an equal AST.

## Language (Session A)

Case-insensitive keywords. Identifiers `[A-Za-z_][A-Za-z0-9_]*`. Strings in single quotes (`''` escapes a quote). `--` comments to end of line.

```
query     ::= SELECT selectList FROM tableRef join? where? order? limit?
selectList::= "*" | colRef ("," colRef)*
colRef    ::= (IDENT ".")? IDENT ("AS" IDENT)?
tableRef  ::= IDENT (("AS")? IDENT)?
join      ::= "INNER"? "JOIN" tableRef "ON" comparison
where     ::= "WHERE" comparison ("AND" comparison)*
order     ::= "ORDER" "BY" colRef ("ASC" | "DESC")? ("," colRef ("ASC" | "DESC")?)*
limit     ::= "LIMIT" NUMBER
comparison::= operand compOp operand
operand   ::= colRef | NUMBER | STRING
compOp    ::= "=" | "<>" | "!=" | "<" | "<=" | ">" | ">="
```

`!=` and `<>` are the same operator; pretty-print as `<>`.

Table and column names resolve case-insensitively against the schema. Unqualified columns must be unique across the FROM/JOIN tables.

## Engine

- Nested-loop join on the ON comparison
- Filter, project, sort, limit
- Errors: unknown table/column, ambiguous column, type error on arithmetic-free compare of incompatible values, parse errors with line/col

## Schema (seed)

`employees`, `departments`, `orders`, `products` — enough rows to JOIN and filter. Read-only.

## UI

- Schema browser listing tables and columns
- SQL editor
- Visual builder: FROM, optional JOIN + ON, column chips (`*` or a subset with optional aliases), AND-chain WHERE rows, ORDER BY rows, LIMIT
- Results grid
- Preset queries + save/rename/delete custom queries
- Status: row count, parse error, **roundtrip ok / fail**
- `Ctrl+Enter` runs (also auto-runs on a valid parse)
- Hash `#/p/<preset-id>` or `#/s/<saved-id>`

## Seed query

Opens on a JOIN + WHERE + ORDER + LIMIT showcase (employees × departments, salary filter).

## Out of scope (Session C)

`OR`, `GROUP BY` / `HAVING`, aggregates, subqueries, CTEs, `LEFT JOIN`, expressions in SELECT, writes.
