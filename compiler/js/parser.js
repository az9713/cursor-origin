/* Oak parser — builds AST from token stream */

const OakParser = (function () {
  const { TokenType } = OakLexer;

  class ParseError extends Error {
    constructor(message, token) {
      super(message);
      this.name = "ParseError";
      this.line = token?.line ?? 1;
      this.col = token?.col ?? 1;
    }
  }

  function parse(tokens) {
    const parser = {
      tokens,
      pos: 0,
    };

    function peek(offset = 0) {
      return parser.tokens[parser.pos + offset] ?? parser.tokens[parser.tokens.length - 1];
    }

    function previous() {
      return parser.tokens[parser.pos - 1];
    }

    function atEnd() {
      return peek().type === TokenType.EOF;
    }

    function check(type) {
      return peek().type === type;
    }

    function match(...types) {
      for (const type of types) {
        if (check(type)) {
          advance();
          return true;
        }
      }
      return false;
    }

    function advance() {
      if (!atEnd()) parser.pos++;
      return previous();
    }

    function consume(type, message) {
      if (check(type)) return advance();
      throw new ParseError(message, peek());
    }

    function keyword(name) {
      const t = peek();
      return t.type === TokenType.KEYWORD && t.lexeme === name;
    }

    function program() {
      const stmts = [];
      while (!atEnd()) {
        stmts.push(statement());
      }
      return { kind: "Program", body: stmts };
    }

    function statement() {
      if (keyword("let")) return letStmt();
      if (keyword("print")) return printStmt();
      if (keyword("if")) return ifStmt();
      if (keyword("while")) return whileStmt();
      if (check(TokenType.LBRACE)) return block();
      if (check(TokenType.IDENT) && peek(1).type === TokenType.EQ) return assignStmt();
      throw new ParseError("Expected statement", peek());
    }

    function letStmt() {
      consume(TokenType.KEYWORD, "Expected 'let'");
      const name = consume(TokenType.IDENT, "Expected variable name").lexeme;
      consume(TokenType.EQ, "Expected '=' after variable name");
      const value = expression();
      consume(TokenType.SEMI, "Expected ';' after let statement");
      return { kind: "Let", name, value };
    }

    function assignStmt() {
      const name = consume(TokenType.IDENT, "Expected variable name").lexeme;
      consume(TokenType.EQ, "Expected '='");
      const value = expression();
      consume(TokenType.SEMI, "Expected ';' after assignment");
      return { kind: "Assign", name, value };
    }

    function printStmt() {
      consume(TokenType.KEYWORD, "Expected 'print'");
      const value = expression();
      consume(TokenType.SEMI, "Expected ';' after print");
      return { kind: "Print", value };
    }

    function ifStmt() {
      consume(TokenType.KEYWORD, "Expected 'if'");
      consume(TokenType.LPAREN, "Expected '(' after 'if'");
      const test = expression();
      consume(TokenType.RPAREN, "Expected ')' after condition");
      const consequent = block();
      let alternate = null;
      if (keyword("else")) {
        advance();
        alternate = block();
      }
      return { kind: "If", test, consequent, alternate };
    }

    function whileStmt() {
      consume(TokenType.KEYWORD, "Expected 'while'");
      consume(TokenType.LPAREN, "Expected '(' after 'while'");
      const test = expression();
      consume(TokenType.RPAREN, "Expected ')' after condition");
      const body = block();
      return { kind: "While", test, body };
    }

    function block() {
      consume(TokenType.LBRACE, "Expected '{'");
      const body = [];
      while (!check(TokenType.RBRACE) && !atEnd()) {
        body.push(statement());
      }
      consume(TokenType.RBRACE, "Expected '}'");
      return { kind: "Block", body };
    }

    function expression() {
      return comparison();
    }

    function comparison() {
      let left = additive();
      while (
        match(TokenType.EQEQ, TokenType.BANGEQ, TokenType.LT, TokenType.LTE, TokenType.GT, TokenType.GTE)
      ) {
        const op = previous().lexeme;
        const right = additive();
        left = { kind: "Binary", op, left, right };
      }
      return left;
    }

    function additive() {
      let left = multiplicative();
      while (match(TokenType.PLUS, TokenType.MINUS)) {
        const op = previous().lexeme;
        const right = multiplicative();
        left = { kind: "Binary", op, left, right };
      }
      return left;
    }

    function multiplicative() {
      let left = unary();
      while (match(TokenType.STAR, TokenType.SLASH)) {
        const op = previous().lexeme;
        const right = unary();
        left = { kind: "Binary", op, left, right };
      }
      return left;
    }

    function unary() {
      if (match(TokenType.MINUS)) {
        return { kind: "Unary", op: "-", operand: unary() };
      }
      return primary();
    }

    function primary() {
      if (match(TokenType.NUMBER)) {
        return { kind: "Number", value: Number(previous().lexeme) };
      }
      if (match(TokenType.IDENT)) {
        return { kind: "Var", name: previous().lexeme };
      }
      if (match(TokenType.LPAREN)) {
        const expr = expression();
        consume(TokenType.RPAREN, "Expected ')' after expression");
        return expr;
      }
      throw new ParseError("Expected expression", peek());
    }

    return program();
  }

  function prettyPrint(node, indent = 0) {
    const pad = "  ".repeat(indent);
    if (!node || typeof node !== "object") return String(node);

    switch (node.kind) {
      case "Program":
        return (
          pad +
          "Program\n" +
          node.body.map((s) => prettyPrint(s, indent + 1)).join("\n")
        );
      case "Block":
        return (
          pad +
          "Block\n" +
          node.body.map((s) => prettyPrint(s, indent + 1)).join("\n")
        );
      case "Let":
        return `${pad}Let ${node.name} =\n${prettyPrint(node.value, indent + 1)}`;
      case "Assign":
        return `${pad}Assign ${node.name} =\n${prettyPrint(node.value, indent + 1)}`;
      case "Print":
        return `${pad}Print\n${prettyPrint(node.value, indent + 1)}`;
      case "If":
        return (
          `${pad}If\n${prettyPrint(node.test, indent + 1)}\n${prettyPrint(node.consequent, indent + 1)}` +
          (node.alternate ? `\n${pad}else\n${prettyPrint(node.alternate, indent + 1)}` : "")
        );
      case "While":
        return `${pad}While\n${prettyPrint(node.test, indent + 1)}\n${prettyPrint(node.body, indent + 1)}`;
      case "Binary":
        return `${pad}Binary ${node.op}\n${prettyPrint(node.left, indent + 1)}\n${prettyPrint(node.right, indent + 1)}`;
      case "Unary":
        return `${pad}Unary ${node.op}\n${prettyPrint(node.operand, indent + 1)}`;
      case "Number":
        return `${pad}Number ${node.value}`;
      case "Var":
        return `${pad}Var ${node.name}`;
      default:
        return pad + JSON.stringify(node, null, 2);
    }
  }

  return { parse, prettyPrint, ParseError };
})();
