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
  function parseAgg(allowAlias) {
    var fn = eat("KEYWORD").value.toUpperCase();
    eat("LPAREN");
    var arg;
    if (at("STAR")) {
      eat("STAR");
      arg = { type: "star" };
    } else {
      arg = parseColRef(false);
    }
    eat("RPAREN");
    if (fn !== "COUNT" && arg.type === "star") {
      throw QS.err(fn + "(*) is not allowed");
    }
    var alias = null;
    if (allowAlias && at("KEYWORD", "as")) {
      eat("KEYWORD", "as");
      alias = eat("IDENT").value;
    }
    return { type: "agg", fn: fn, arg: arg, alias: alias };
  }
  function atAgg() {
    var t = peek();
    var n = tokens[i + 1];
    return t && t.type === "KEYWORD" && QS.AGGS[t.value] && n && n.type === "LPAREN";
  }
  function parseOperand() {
    if (at("NUMBER")) {
      return { type: "num", value: eat("NUMBER").value };
    }
    if (at("STRING")) {
      return { type: "str", value: eat("STRING").value };
    }
    if (atAgg()) return parseAgg(false);
    if (at("IDENT")) {
      return parseColRef(false);
    }
    var t = peek();
    throw QS.err("Expected column, aggregate, number, or string", t && t.line, t && t.col);
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
  function parseSelectItem() {
    if (atAgg()) return parseAgg(true);
    return parseColRef(true);
  }
  function parseSelectList() {
    if (at("STAR")) {
      eat("STAR");
      return [{ type: "star" }];
    }
    var cols = [parseSelectItem()];
    while (at("COMMA")) {
      eat("COMMA");
      cols.push(parseSelectItem());
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
  var group = [];
  if (at("KEYWORD", "group")) {
    eat("KEYWORD", "group");
    eat("KEYWORD", "by");
    group.push(parseColRef(false));
    while (at("COMMA")) {
      eat("COMMA");
      group.push(parseColRef(false));
    }
  }
  var having = [];
  if (at("KEYWORD", "having")) {
    eat("KEYWORD", "having");
    having.push(parseComparison());
    while (at("KEYWORD", "and")) {
      eat("KEYWORD", "and");
      having.push(parseComparison());
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
  return {
    type: "select",
    columns: columns,
    from: from,
    join: join,
    where: where,
    group: group,
    having: having,
    order: order,
    limit: limit
  };
};

QS.AGGS = { count: true, sum: true, avg: true, min: true, max: true };

QS.operandToSql = function (op) {
  if (op.type === "num") return String(op.value);
  if (op.type === "str") return "'" + String(op.value).replace(/'/g, "''") + "'";
  return QS.colToSql(op, false);
};

QS.colToSql = function (col, withAlias) {
  if (col.type === "star") return "*";
  if (col.type === "agg") return QS.aggToSql(col, withAlias);
  var s = col.table ? col.table + "." + col.name : col.name;
  if (withAlias && col.alias) s += " AS " + col.alias;
  return s;
};

QS.aggToSql = function (agg, withAlias) {
  var inner = agg.arg && agg.arg.type === "star" ? "*" : QS.colToSql(agg.arg, false);
  var s = agg.fn + "(" + inner + ")";
  if (withAlias && agg.alias) s += " AS " + agg.alias;
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
  if (ast.group && ast.group.length) {
    lines.push(
      "GROUP BY " +
        ast.group
          .map(function (g) {
            return QS.colToSql(g, false);
          })
          .join(", ")
    );
  }
  if (ast.having && ast.having.length) {
    lines.push(
      "HAVING " +
        ast.having
          .map(function (h) {
            return QS.operandToSql(h.left) + " " + h.op + " " + QS.operandToSql(h.right);
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
