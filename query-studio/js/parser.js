window.QS = window.QS || {};

QS.parse = function (source) {
  var tokens = QS.lex(source);
  var i = 0;

  function peek() {
    return tokens[i];
  }
  function at(type, value) {
    var t = peek();
    if (!t) return false;
    if (t.type !== type) return false;
    if (value != null && t.value !== value) return false;
    return true;
  }
  function eat(type, value) {
    if (!at(type, value)) {
      var t = peek();
      throw QS.err(
        "Expected " + (value || type) + ", got " + (t ? t.value || t.type : "EOF"),
        t && t.line,
        t && t.col
      );
    }
    return tokens[i++];
  }
  function parseColRef(allowAlias) {
    var t = eat("IDENT");
    var table = null;
    var name = t.value;
    if (at("DOT")) {
      eat("DOT");
      table = name;
      name = eat("IDENT").value;
    }
    var alias = null;
    if (allowAlias) {
      if (at("KEYWORD", "as")) {
        eat("KEYWORD", "as");
        alias = eat("IDENT").value;
      }
    }
    return { type: "col", table: table, name: name, alias: alias };
  }
  function parseOperand() {
    if (at("NUMBER")) {
      return { type: "num", value: eat("NUMBER").value };
    }
    if (at("STRING")) {
      return { type: "str", value: eat("STRING").value };
    }
    if (at("IDENT")) {
      return parseColRef(false);
    }
    var t = peek();
    throw QS.err("Expected column, number, or string", t && t.line, t && t.col);
  }
  function parseComparison() {
    var left = parseOperand();
    var op = eat("OP").value;
    var right = parseOperand();
    return { type: "cmp", op: op, left: left, right: right };
  }
  function parseTableRef() {
    var name = eat("IDENT").value;
    var alias = null;
    if (at("KEYWORD", "as")) {
      eat("KEYWORD", "as");
      alias = eat("IDENT").value;
    } else if (at("IDENT")) {
      alias = eat("IDENT").value;
    }
    return { name: name, alias: alias };
  }
  function parseSelectList() {
    if (at("STAR")) {
      eat("STAR");
      return [{ type: "star" }];
    }
    var cols = [parseColRef(true)];
    while (at("COMMA")) {
      eat("COMMA");
      cols.push(parseColRef(true));
    }
    return cols;
  }

  eat("KEYWORD", "select");
  var columns = parseSelectList();
  eat("KEYWORD", "from");
  var from = parseTableRef();
  var join = null;
  if (at("KEYWORD", "inner") || at("KEYWORD", "join")) {
    if (at("KEYWORD", "inner")) eat("KEYWORD", "inner");
    eat("KEYWORD", "join");
    var jtable = parseTableRef();
    eat("KEYWORD", "on");
    join = { table: jtable, on: parseComparison() };
  }
  var where = [];
  if (at("KEYWORD", "where")) {
    eat("KEYWORD", "where");
    where.push(parseComparison());
    while (at("KEYWORD", "and")) {
      eat("KEYWORD", "and");
      where.push(parseComparison());
    }
  }
  var order = [];
  if (at("KEYWORD", "order")) {
    eat("KEYWORD", "order");
    eat("KEYWORD", "by");
    function parseOrder() {
      var col = parseColRef(false);
      var dir = "ASC";
      if (at("KEYWORD", "asc")) {
        eat("KEYWORD", "asc");
        dir = "ASC";
      } else if (at("KEYWORD", "desc")) {
        eat("KEYWORD", "desc");
        dir = "DESC";
      }
      return { col: col, dir: dir };
    }
    order.push(parseOrder());
    while (at("COMMA")) {
      eat("COMMA");
      order.push(parseOrder());
    }
  }
  var limit = null;
  if (at("KEYWORD", "limit")) {
    eat("KEYWORD", "limit");
    limit = eat("NUMBER").value;
    if (limit !== Math.floor(limit) || limit < 0) {
      throw QS.err("LIMIT must be a non-negative integer", peek().line, peek().col);
    }
  }
  if (!at("EOF")) {
    var extra = peek();
    throw QS.err("Unexpected input after query", extra.line, extra.col);
  }
  return { type: "select", columns: columns, from: from, join: join, where: where, order: order, limit: limit };
};

QS.operandToSql = function (op) {
  if (op.type === "num") return String(op.value);
  if (op.type === "str") return "'" + String(op.value).replace(/'/g, "''") + "'";
  return QS.colToSql(op, false);
};

QS.colToSql = function (col, withAlias) {
  if (col.type === "star") return "*";
  var s = col.table ? col.table + "." + col.name : col.name;
  if (withAlias && col.alias) s += " AS " + col.alias;
  return s;
};

QS.astToSql = function (ast) {
  var lines = [];
  var cols = ast.columns.map(function (c) {
    return c.type === "star" ? "*" : QS.colToSql(c, true);
  });
  lines.push("SELECT " + cols.join(", "));
  var from = ast.from.name + (ast.from.alias ? " AS " + ast.from.alias : "");
  lines.push("FROM " + from);
  if (ast.join) {
    var jt = ast.join.table.name + (ast.join.table.alias ? " AS " + ast.join.table.alias : "");
    var on = QS.operandToSql(ast.join.on.left) + " " + ast.join.on.op + " " + QS.operandToSql(ast.join.on.right);
    lines.push("INNER JOIN " + jt + " ON " + on);
  }
  if (ast.where && ast.where.length) {
    lines.push(
      "WHERE " +
        ast.where
          .map(function (w) {
            return QS.operandToSql(w.left) + " " + w.op + " " + QS.operandToSql(w.right);
          })
          .join(" AND ")
    );
  }
  if (ast.order && ast.order.length) {
    lines.push(
      "ORDER BY " +
        ast.order
          .map(function (o) {
            return QS.colToSql(o.col, false) + " " + o.dir;
          })
          .join(", ")
    );
  }
  if (ast.limit != null) lines.push("LIMIT " + ast.limit);
  return lines.join("\n");
};

QS.stable = function (v) {
  return JSON.stringify(v);
};

QS.roundtripOk = function (sql) {
  var a = QS.parse(sql);
  var printed = QS.astToSql(a);
  var b = QS.parse(printed);
  return QS.stable(a) === QS.stable(b);
};
