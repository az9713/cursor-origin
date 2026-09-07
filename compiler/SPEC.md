# Oak — tiny language spec

Internal spec for the compiler playground. Customer-facing surface is `index.html`.

## Syntax

```
program     ::= statement*
statement   ::= letStmt | assignStmt | printStmt | ifStmt | whileStmt | block
letStmt     ::= "let" IDENT "=" expression ";"
assignStmt  ::= IDENT "=" expression ";"
printStmt   ::= "print" expression ";"
ifStmt      ::= "if" "(" expression ")" block ("else" block)?
whileStmt   ::= "while" "(" expression ")" block
block       ::= "{" statement* "}"

expression  ::= comparison
comparison  ::= additive ( compOp additive )*
compOp      ::= "==" | "!=" | "<" | "<=" | ">" | ">="
additive    ::= multiplicative ( ("+" | "-") multiplicative )*
multiplicative ::= unary ( ("*" | "/") unary )*
unary       ::= "-" unary | primary
primary     ::= NUMBER | IDENT | "(" expression ")"
```

## Keywords

`let`, `print`, `if`, `else`, `while`

## Types

Numbers only (IEEE doubles). Truthy: non-zero numbers. Falsy: `0`.

## Bytecode opcodes

| Opcode        | Args   | Effect                          |
|---------------|--------|---------------------------------|
| LOAD_CONST    | idx    | push constants[idx]             |
| LOAD_VAR      | idx    | push vars[idx]                  |
| STORE_VAR     | idx    | pop → vars[idx]                 |
| ADD/SUB/MUL/DIV | —    | pop b, pop a, push a op b       |
| EQ/NE/LT/LE/GT/GE | —  | comparison → 0 or 1             |
| NEG           | —      | negate top                      |
| PRINT         | —      | pop and print                     |
| JMP           | off    | ip += off                       |
| JMP_IF_FALSE  | off    | pop; if falsy, ip += off        |
| HALT          | —      | stop execution                  |

## Sample program

```
let i = 0;
while (i < 5) {
  print i;
  i = i + 1;
}
```
