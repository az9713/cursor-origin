# Query studio — frozen spec

Internal spec for Project 11 (wave 2). Vanilla HTML/CSS/JS. No new dependencies. Persist to `localStorage` key `query-studio-v1`.

## Product

A bidirectional SQL studio over in-memory tables. Lives at `query-studio/index.html`.

The Cursor tell: the text editor and the visual builder are two views of one AST. Changing either must update the other without dropping clauses. A green **roundtrip** chip means `parse(sql) → astToSql → parse` yields an equal AST.

## Language

Case-insensitive keywords. Identifiers `[A-Za-z_][A-Za-z0-9_]*`. Strings in single quotes (`''` escapes a quote). `--` comments to end of line.

```
query     ::= SELECT selectList FROM tableRef join? where? group? having? order? limit?
selectList::= "*" | selectItem ("," selectItem)*
selectItem::= agg | colRef
agg       ::= aggFn "(" (colRef | "*") ")" ("AS" IDENT)?
aggFn     ::= COUNT | SUM | AVG | MIN | MAX
colRef    ::= (IDENT ".")? IDENT ("AS" IDENT)?
tableRef  ::= IDENT (("AS")? IDENT)?
join      ::= "INNER"? "JOIN" tableRef "ON" comparison
where     ::= "WHERE" comparison ("AND" comparison)*
group     ::= "GROUP" "BY" colRef ("," colRef)*
having    ::= "HAVING" comparison ("AND" comparison)*
order     ::= "ORDER" "BY" colRef ("ASC" | "DESC")? ("," colRef ("ASC" | "DESC")?)*
limit     ::= "LIMIT" NUMBER
comparison::= operand compOp operand
operand   ::= agg | colRef | NUMBER | STRING
compOp    ::= "=" | "<>" | "!=" | "<" | "<=" | ">" | ">="
```

`!=` and `<>` are the same operator; pretty-print as `<>`.

`COUNT(*)` is allowed. `SUM`/`AVG`/`MIN`/`MAX` require a column. `SELECT *` cannot be combined with `GROUP BY`. Non-aggregate SELECT columns must appear in `GROUP BY`. Aggregates without `GROUP BY` collapse to one row.

Table and column names resolve case-insensitively against the schema. Unqualified columns must be unique across the FROM/JOIN tables. After grouping, `ORDER BY` may use a SELECT alias.

## Engine

- Nested-loop join on the ON comparison
- Filter (`WHERE`), then `GROUP BY` + aggregates, then `HAVING`, then sort, limit
- Errors: unknown table/column, ambiguous column, type error on arithmetic-free compare of incompatible values, parse errors with line/col, illegal `GROUP BY` / aggregate mix

## Schema (seed)

`employees`, `departments`, `orders`, `products` — enough rows to JOIN and filter. Read-only.

## UI

- Schema browser listing tables and columns
- SQL editor
- Visual builder: FROM, optional JOIN + ON, column chips (`*` or a subset with optional aliases), aggregates, AND-chain WHERE, GROUP BY, HAVING, ORDER BY, LIMIT
- Results grid
- Preset queries + save/rename/delete custom queries
- Status: row count, parse error, **roundtrip ok / fail**
- `Ctrl+Enter` runs (also auto-runs on a valid parse)
- Hash `#/p/<preset-id>` or `#/s/<saved-id>`

## Seed query

Opens on a JOIN + WHERE + ORDER + LIMIT showcase (employees × departments, salary filter).

## Out of scope

`OR`, subqueries, CTEs, `LEFT JOIN`, expressions in SELECT (other than aggregates), writes.
