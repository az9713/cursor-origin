window.SS = window.SS || {};

SS.COLS = 26;
SS.ROWS = 40;

SS.colName = function (i) {
  return String.fromCharCode(65 + i);
};

SS.parseRef = function (text) {
  var m = /^(\$?)([A-Za-z]+)(\$?)(\d+)$/.exec(String(text).trim());
  if (!m) return null;
  var col = 0;
  var letters = m[2].toUpperCase();
  for (var i = 0; i < letters.length; i++) col = col * 26 + (letters.charCodeAt(i) - 64);
  col -= 1;
  var row = parseInt(m[4], 10) - 1;
  return { col: col, row: row, absCol: m[1] === "$", absRow: m[3] === "$", name: SS.colName(col) + (row + 1) };
};

SS.inSheet = function (ref) {
  return ref && ref.col >= 0 && ref.col < SS.COLS && ref.row >= 0 && ref.row < SS.ROWS;
};

SS.cellKey = function (col, row) {
  return SS.colName(col) + (row + 1);
};

SS.tokenize = function (src) {
  var s = String(src);
  var i = 0;
  var out = [];
  function peek() { return s[i]; }
  function push(type, value) { out.push({ type: type, value: value }); }
  while (i < s.length) {
    var c = s[i];
    if (c <= " ") { i++; continue; }
    if (c === '"' || c === "'") {
      var q = c;
      i++;
      var buf = "";
      while (i < s.length && s[i] !== q) {
        if (s[i] === "\\") i++;
        buf += s[i++] || "";
      }
      if (s[i] === q) i++;
      push("str", buf);
      continue;
    }
    if (/[0-9.]/.test(c) && !(c === "." && i + 1 < s.length && !/[0-9]/.test(s[i + 1]))) {
      var num = "";
      while (i < s.length && /[0-9.]/.test(s[i])) num += s[i++];
      push("num", parseFloat(num));
      continue;
    }
    if (/[A-Za-z$]/.test(c)) {
      var ident = "";
      while (i < s.length && /[A-Za-z0-9$]/.test(s[i])) ident += s[i++];
      if (s[i] === ":" && /[A-Za-z$]/.test(s[i + 1] || "")) {
        ident += s[i++];
        while (i < s.length && /[A-Za-z0-9$]/.test(s[i])) ident += s[i++];
        push("range", ident);
      } else if (SS.parseRef(ident)) push("ref", ident);
      else push("name", ident.toUpperCase());
      continue;
    }
    if ("+-*/(),".indexOf(c) !== -1) { push(c, c); i++; continue; }
    if (c === ">" || c === "<" || c === "=") {
      var op = c;
      i++;
      if ((op === ">" || op === "<") && s[i] === "=") { op += "="; i++; }
      else if (op === "<" && s[i] === ">") { op = "<>"; i++; }
      push("cmp", op);
      continue;
    }
    push("bad", c);
    i++;
  }
  push("eof", "");
  return out;
};

SS.parseFormula = function (src) {
  var tokens = SS.tokenize(src);
  var p = 0;
  function peek() { return tokens[p]; }
  function eat(type) {
    if (peek().type === type) return tokens[p++];
    return null;
  }
  function fail() { return { type: "err", message: "parse" }; }

  function parseCmp() {
    var left = parseAdd();
    if (peek().type === "cmp") {
      var op = eat("cmp").value;
      var right = parseAdd();
      return { type: "cmp", op: op, left: left, right: right };
    }
    return left;
  }
  function parseAdd() {
    var node = parseMul();
    while (peek().type === "+" || peek().type === "-") {
      var op = peek().type;
      p++;
      node = { type: "bin", op: op, left: node, right: parseMul() };
    }
    return node;
  }
  function parseMul() {
    var node = parseUnary();
    while (peek().type === "*" || peek().type === "/") {
      var op = peek().type;
      p++;
      node = { type: "bin", op: op, left: node, right: parseUnary() };
    }
    return node;
  }
  function parseUnary() {
    if (peek().type === "-") { p++; return { type: "neg", inner: parseUnary() }; }
    if (peek().type === "+") { p++; return parseUnary(); }
    return parsePrimary();
  }
  function parsePrimary() {
    var t = peek();
    if (t.type === "num") { p++; return { type: "num", value: t.value }; }
    if (t.type === "str") { p++; return { type: "str", value: t.value }; }
    if (t.type === "ref") { p++; return { type: "ref", raw: t.value, ref: SS.parseRef(t.value) }; }
    if (t.type === "range") {
      p++;
      var parts = t.value.split(":");
      return { type: "range", start: SS.parseRef(parts[0]), end: SS.parseRef(parts[1]) };
    }
    if (t.type === "name") {
      p++;
      if (!eat("(")) return fail();
      var args = [];
      if (peek().type !== ")") {
        args.push(parseCmp());
        while (eat(",")) args.push(parseCmp());
      }
      if (!eat(")")) return fail();
      return { type: "fn", name: t.value, args: args };
    }
    if (eat("(")) {
      var inner = parseCmp();
      if (!eat(")")) return fail();
      return inner;
    }
    return fail();
  }

  var ast = parseCmp();
  if (peek().type !== "eof") return fail();
  return ast;
};

SS.asNumber = function (v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number" && !isNaN(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v))) return Number(v);
  return null;
};

SS.truthy = function (v) {
  if (v === 0 || v === "" || v === false || v === null || v === undefined) return false;
  if (typeof v === "string" && /^#/.test(v)) return false;
  return true;
};

SS.expandRange = function (a, b) {
  if (!a || !b) return [];
  var c0 = Math.min(a.col, b.col);
  var c1 = Math.max(a.col, b.col);
  var r0 = Math.min(a.row, b.row);
  var r1 = Math.max(a.row, b.row);
  var cells = [];
  for (var r = r0; r <= r1; r++) {
    for (var c = c0; c <= c1; c++) cells.push({ col: c, row: r });
  }
  return cells;
};

SS.flattenArgs = function (args, getCell, stack) {
  var out = [];
  args.forEach(function (arg) {
    if (arg.type === "range") {
      SS.expandRange(arg.start, arg.end).forEach(function (cell) {
        out.push(SS.evalCell(cell.col, cell.row, getCell, stack));
      });
    } else {
      out.push(SS.evalAst(arg, getCell, stack));
    }
  });
  return out;
};

SS.evalAst = function (ast, getCell, stack) {
  if (!ast || ast.type === "err") return "#ERROR!";
  if (ast.type === "num") return ast.value;
  if (ast.type === "str") return ast.value;
  if (ast.type === "neg") {
    var n = SS.asNumber(SS.evalAst(ast.inner, getCell, stack));
    return n === null ? "#ERROR!" : -n;
  }
  if (ast.type === "ref") {
    if (!SS.inSheet(ast.ref)) return "#REF!";
    return SS.evalCell(ast.ref.col, ast.ref.row, getCell, stack);
  }
  if (ast.type === "range") return "#ERROR!";
  if (ast.type === "bin") {
    var l = SS.evalAst(ast.left, getCell, stack);
    var r = SS.evalAst(ast.right, getCell, stack);
    if (typeof l === "string" && l[0] === "#") return l;
    if (typeof r === "string" && r[0] === "#") return r;
    var ln = SS.asNumber(l);
    var rn = SS.asNumber(r);
    if (ln === null || rn === null) return "#ERROR!";
    if (ast.op === "+") return ln + rn;
    if (ast.op === "-") return ln - rn;
    if (ast.op === "*") return ln * rn;
    if (ast.op === "/") return rn === 0 ? "#DIV/0!" : ln / rn;
  }
  if (ast.type === "cmp") {
    var a = SS.evalAst(ast.left, getCell, stack);
    var b = SS.evalAst(ast.right, getCell, stack);
    if (typeof a === "string" && a[0] === "#") return a;
    if (typeof b === "string" && b[0] === "#") return b;
    var an = SS.asNumber(a);
    var bn = SS.asNumber(b);
    var left = an === null ? a : an;
    var right = bn === null ? b : bn;
    var ok = false;
    if (ast.op === "=") ok = left === right;
    else if (ast.op === "<>") ok = left !== right;
    else if (ast.op === ">") ok = left > right;
    else if (ast.op === "<") ok = left < right;
    else if (ast.op === ">=") ok = left >= right;
    else if (ast.op === "<=") ok = left <= right;
    return ok ? 1 : 0;
  }
  if (ast.type === "fn") {
    var vals = SS.flattenArgs(ast.args, getCell, stack);
    for (var i = 0; i < vals.length; i++) {
      if (typeof vals[i] === "string" && vals[i][0] === "#" && ast.name !== "IF") return vals[i];
    }
    if (ast.name === "SUM") {
      var sum = 0;
      vals.forEach(function (v) {
        var x = SS.asNumber(v);
        if (x !== null) sum += x;
      });
      return sum;
    }
    if (ast.name === "AVERAGE") {
      var tot = 0;
      var count = 0;
      vals.forEach(function (v) {
        var x = SS.asNumber(v);
        if (x !== null) { tot += x; count++; }
      });
      return count ? tot / count : "#DIV/0!";
    }
    if (ast.name === "IF") {
      if (ast.args.length < 2) return "#ERROR!";
      var cond = SS.evalAst(ast.args[0], getCell, stack);
      if (typeof cond === "string" && cond[0] === "#") return cond;
      var pick = SS.truthy(cond) ? ast.args[1] : (ast.args[2] || { type: "num", value: 0 });
      return SS.evalAst(pick, getCell, stack);
    }
    return "#ERROR!";
  }
  return "#ERROR!";
};

SS.evalCell = function (col, row, getCell, stack) {
  if (col < 0 || col >= SS.COLS || row < 0 || row >= SS.ROWS) return "#REF!";
  var key = SS.cellKey(col, row);
  stack = stack || [];
  if (stack.indexOf(key) !== -1) return "#CYCLE!";
  var raw = getCell(col, row);
  if (raw === undefined || raw === null || raw === "") return "";
  raw = String(raw);
  if (raw.charAt(0) !== "=") {
    if (raw.trim() !== "" && !isNaN(Number(raw))) return Number(raw);
    return raw;
  }
  stack.push(key);
  var ast = SS.parseFormula(raw.slice(1));
  var value = SS.evalAst(ast, getCell, stack);
  stack.pop();
  return value;
};

SS.adjustFormula = function (raw, dCol, dRow) {
  if (!raw || raw.charAt(0) !== "=") return raw;
  return "=" + raw.slice(1).replace(/(\$?)([A-Za-z]+)(\$?)(\d+)/g, function (_, ac, letters, ar, digits) {
    var ref = SS.parseRef((ac || "") + letters + (ar || "") + digits);
    if (!ref) return _;
    var col = ref.absCol ? ref.col : ref.col + dCol;
    var row = ref.absRow ? ref.row : ref.row + dRow;
    if (col < 0 || row < 0 || col >= SS.COLS || row >= SS.ROWS) return "#REF!";
    return (ref.absCol ? "$" : "") + SS.colName(col) + (ref.absRow ? "$" : "") + (row + 1);
  });
};

SS.formatValue = function (v) {
  if (v === "" || v === undefined || v === null) return "";
  if (typeof v === "number") {
    if (!isFinite(v)) return "#ERROR!";
    if (Math.abs(v - Math.round(v)) < 1e-9) return String(Math.round(v));
    return String(Math.round(v * 10000) / 10000);
  }
  return String(v);
};
