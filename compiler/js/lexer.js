/* Oak lexer — tokenizes source into a stream of { type, lexeme, line, col } */

const OakLexer = (function () {
  const KEYWORDS = new Set(["let", "print", "if", "else", "while"]);

  const TokenType = {
    NUMBER: "NUMBER",
    IDENT: "IDENT",
    KEYWORD: "KEYWORD",
    PLUS: "PLUS",
    MINUS: "MINUS",
    STAR: "STAR",
    SLASH: "SLASH",
    EQ: "EQ",
    EQEQ: "EQEQ",
    BANG: "BANG",
    BANGEQ: "BANGEQ",
    LT: "LT",
    LTE: "LTE",
    GT: "GT",
    GTE: "GTE",
    LPAREN: "LPAREN",
    RPAREN: "RPAREN",
    LBRACE: "LBRACE",
    RBRACE: "RBRACE",
    SEMI: "SEMI",
    EOF: "EOF",
  };

  class LexError extends Error {
    constructor(message, line, col) {
      super(message);
      this.name = "LexError";
      this.line = line;
      this.col = col;
    }
  }

  function lex(source) {
    const tokens = [];
    let i = 0;
    let line = 1;
    let col = 1;

    function peek(offset = 0) {
      return source[i + offset] ?? "\0";
    }

    function advance() {
      const ch = source[i++];
      if (ch === "\n") {
        line++;
        col = 1;
      } else {
        col++;
      }
      return ch;
    }

    function atEnd() {
      return i >= source.length;
    }

    function skipWhitespaceAndComments() {
      while (!atEnd()) {
        const ch = peek();
        if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") {
          advance();
        } else if (ch === "/" && peek(1) === "/") {
          while (!atEnd() && peek() !== "\n") advance();
        } else {
          break;
        }
      }
    }

    function add(type, lexeme, startLine, startCol) {
      tokens.push({ type, lexeme, line: startLine, col: startCol });
    }

    while (!atEnd()) {
      skipWhitespaceAndComments();
      if (atEnd()) break;

      const startLine = line;
      const startCol = col;
      const ch = advance();

      if (ch >= "0" && ch <= "9") {
        let num = ch;
        while (peek() >= "0" && peek() <= "9") num += advance();
        if (peek() === "." && peek(1) >= "0" && peek(1) <= "9") {
          num += advance();
          while (peek() >= "0" && peek() <= "9") num += advance();
        }
        add(TokenType.NUMBER, num, startLine, startCol);
        continue;
      }

      if ((ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_") {
        let ident = ch;
        while (
          (peek() >= "a" && peek() <= "z") ||
          (peek() >= "A" && peek() <= "Z") ||
          (peek() >= "0" && peek() <= "9") ||
          peek() === "_"
        ) {
          ident += advance();
        }
        if (KEYWORDS.has(ident)) {
          add(TokenType.KEYWORD, ident, startLine, startCol);
        } else {
          add(TokenType.IDENT, ident, startLine, startCol);
        }
        continue;
      }

      switch (ch) {
        case "+":
          add(TokenType.PLUS, "+", startLine, startCol);
          break;
        case "-":
          add(TokenType.MINUS, "-", startLine, startCol);
          break;
        case "*":
          add(TokenType.STAR, "*", startLine, startCol);
          break;
        case "/":
          add(TokenType.SLASH, "/", startLine, startCol);
          break;
        case "=":
          if (peek() === "=") {
            advance();
            add(TokenType.EQEQ, "==", startLine, startCol);
          } else {
            add(TokenType.EQ, "=", startLine, startCol);
          }
          break;
        case "!":
          if (peek() === "=") {
            advance();
            add(TokenType.BANGEQ, "!=", startLine, startCol);
          } else {
            throw new LexError("Unexpected '!'", startLine, startCol);
          }
          break;
        case "<":
          if (peek() === "=") {
            advance();
            add(TokenType.LTE, "<=", startLine, startCol);
          } else {
            add(TokenType.LT, "<", startLine, startCol);
          }
          break;
        case ">":
          if (peek() === "=") {
            advance();
            add(TokenType.GTE, ">=", startLine, startCol);
          } else {
            add(TokenType.GT, ">", startLine, startCol);
          }
          break;
        case "(":
          add(TokenType.LPAREN, "(", startLine, startCol);
          break;
        case ")":
          add(TokenType.RPAREN, ")", startLine, startCol);
          break;
        case "{":
          add(TokenType.LBRACE, "{", startLine, startCol);
          break;
        case "}":
          add(TokenType.RBRACE, "}", startLine, startCol);
          break;
        case ";":
          add(TokenType.SEMI, ";", startLine, startCol);
          break;
        default:
          throw new LexError(`Unexpected character '${ch}'`, startLine, startCol);
      }
    }

    add(TokenType.EOF, "", line, col);
    return tokens;
  }

  return { lex, TokenType, LexError };
})();
