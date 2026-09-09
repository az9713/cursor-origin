window.QS = window.QS || {};

QS.KEYWORDS = {
  select: true,
  from: true,
  inner: true,
  join: true,
  on: true,
  where: true,
  and: true,
  order: true,
  by: true,
  limit: true,
  as: true,
  asc: true,
  desc: true,
  group: true,
  having: true,
  count: true,
  sum: true,
  avg: true,
  min: true,
  max: true
};

QS.lex = function (source) {
  var tokens = [];
  var i = 0;
  var line = 1;
  var col = 1;
  var s = String(source || "");

  function peek(n) {
    return s[i + (n || 0)] || "";
  }
  function advance() {
    var ch = s[i++];
    if (ch === "\n") {
      line += 1;
      col = 1;
    } else {
      col += 1;
    }
    return ch;
  }
  function add(type, value, sl, sc) {
    tokens.push({ type: type, value: value, line: sl, col: sc });
  }

  while (i < s.length) {
    var ch = peek();
    var sl = line;
    var sc = col;

    if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") {
      advance();
      continue;
    }
    if (ch === "-" && peek(1) === "-") {
      while (i < s.length && peek() !== "\n") advance();
      continue;
    }
    if (ch === "'") {
      advance();
      var str = "";
      while (i < s.length) {
        var c = advance();
        if (c === "'" && peek() === "'") {
          str += "'";
          advance();
        } else if (c === "'") {
          break;
        } else if (c === "") {
          throw QS.err("Unterminated string", sl, sc);
        } else {
          str += c;
        }
      }
      add("STRING", str, sl, sc);
      continue;
    }
    if (/[0-9]/.test(ch)) {
      var num = "";
      while (/[0-9.]/.test(peek())) num += advance();
      if (num.split(".").length > 2) throw QS.err("Bad number", sl, sc);
      add("NUMBER", Number(num), sl, sc);
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      var id = "";
      while (/[A-Za-z0-9_]/.test(peek())) id += advance();
      var low = id.toLowerCase();
      if (QS.KEYWORDS[low]) add("KEYWORD", low, sl, sc);
      else add("IDENT", id, sl, sc);
      continue;
    }
    if (ch === "<" && peek(1) === ">") {
      advance();
      advance();
      add("OP", "<>", sl, sc);
      continue;
    }
    if (ch === "!" && peek(1) === "=") {
      advance();
      advance();
      add("OP", "<>", sl, sc);
      continue;
    }
    if ((ch === "<" || ch === ">") && peek(1) === "=") {
      var op = advance() + advance();
      add("OP", op, sl, sc);
      continue;
    }
    if (ch === "=" || ch === "<" || ch === ">") {
      add("OP", advance(), sl, sc);
      continue;
    }
    if (ch === "*") {
      advance();
      add("STAR", "*", sl, sc);
      continue;
    }
    if (ch === ",") {
      advance();
      add("COMMA", ",", sl, sc);
      continue;
    }
    if (ch === ".") {
      advance();
      add("DOT", ".", sl, sc);
      continue;
    }
    if (ch === "(") {
      advance();
      add("LPAREN", "(", sl, sc);
      continue;
    }
    if (ch === ")") {
      advance();
      add("RPAREN", ")", sl, sc);
      continue;
    }
    throw QS.err("Unexpected character '" + ch + "'", sl, sc);
  }
  add("EOF", "", line, col);
  return tokens;
};

QS.err = function (message, line, col) {
  var e = new Error(message);
  e.line = line || 1;
  e.col = col || 1;
  e.name = "QSError";
  return e;
};
