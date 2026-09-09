window.QS = window.QS || {};

QS.aliasOf = function (ref) {
  return ref.alias || ref.name;
};

QS.resolveCol = function (col, scopes) {
  var wantTable = col.table ? col.table.toLowerCase() : null;
  var wantName = col.name.toLowerCase();
  var hits = [];
  scopes.forEach(function (sc) {
    var tableOk = !wantTable || sc.alias.toLowerCase() === wantTable || sc.table.toLowerCase() === wantTable;
    if (!tableOk) return;
    sc.cols.forEach(function (c) {
      if (c.toLowerCase() === wantName) hits.push({ scope: sc, col: c });
    });
  });
  if (!hits.length) {
    throw QS.err("Unknown column " + QS.colToSql(col, false));
  }
  if (hits.length > 1 && !wantTable) {
    throw QS.err("Ambiguous column " + col.name);
  }
  return hits[0];
};

QS.readOp = function (op, row, scopes) {
  if (op.type === "num") return op.value;
  if (op.type === "str") return op.value;
  var hit = QS.resolveCol(op, scopes);
  return row[hit.scope.alias + "." + hit.col];
};

QS.cmp = function (op, left, right) {
  if (left == null || right == null) return false;
  var a = left;
  var b = right;
  if (typeof a === "number" && typeof b === "string" && b !== "" && !isNaN(Number(b))) b = Number(b);
  if (typeof b === "number" && typeof a === "string" && a !== "" && !isNaN(Number(a))) a = Number(a);
  if (typeof a !== typeof b) {
    if (op === "=") return false;
    if (op === "<>") return true;
    throw QS.err("Cannot compare " + typeof left + " with " + typeof right);
  }
  if (op === "=") return a === b;
  if (op === "<>") return a !== b;
  if (op === "<") return a < b;
  if (op === "<=") return a <= b;
  if (op === ">") return a > b;
  if (op === ">=") return a >= b;
  throw QS.err("Unknown operator " + op);
};

QS.scopesFor = function (ast) {
  var fromTable = QS.tableByName(ast.from.name);
  if (!fromTable) throw QS.err("Unknown table " + ast.from.name);
  var scopes = [
    {
      table: ast.from.name,
      alias: QS.aliasOf(ast.from),
      cols: fromTable.columns.map(function (c) {
        return c.name;
      }),
      data: fromTable.rows
    }
  ];
  if (ast.join) {
    var jt = QS.tableByName(ast.join.table.name);
    if (!jt) throw QS.err("Unknown table " + ast.join.table.name);
    scopes.push({
      table: ast.join.table.name,
      alias: QS.aliasOf(ast.join.table),
      cols: jt.columns.map(function (c) {
        return c.name;
      }),
      data: jt.rows
    });
  }
  return scopes;
};

QS.rowFrom = function (scope, raw) {
  var out = {};
  scope.cols.forEach(function (c) {
    out[scope.alias + "." + c] = raw[c];
  });
  return out;
};

QS.merge = function (a, b) {
  var o = {};
  Object.keys(a).forEach(function (k) {
    o[k] = a[k];
  });
  Object.keys(b).forEach(function (k) {
    o[k] = b[k];
  });
  return o;
};

QS.exec = function (ast) {
  var scopes = QS.scopesFor(ast);
  var left = scopes[0];
  var rows = left.data.map(function (r) {
    return QS.rowFrom(left, r);
  });
  if (scopes[1]) {
    var right = scopes[1];
    var joined = [];
    rows.forEach(function (lr) {
      right.data.forEach(function (rr) {
        var row = QS.merge(lr, QS.rowFrom(right, rr));
        if (QS.cmp(ast.join.on.op, QS.readOp(ast.join.on.left, row, scopes), QS.readOp(ast.join.on.right, row, scopes))) {
          joined.push(row);
        }
      });
    });
    rows = joined;
  }
  ast.where.forEach(function (w) {
    rows = rows.filter(function (row) {
      return QS.cmp(w.op, QS.readOp(w.left, row, scopes), QS.readOp(w.right, row, scopes));
    });
  });
  if (ast.order.length) {
    rows.sort(function (ra, rb) {
      for (var i = 0; i < ast.order.length; i++) {
        var o = ast.order[i];
        var av = QS.readOp(o.col, ra, scopes);
        var bv = QS.readOp(o.col, rb, scopes);
        if (av === bv) continue;
        if (av == null) return 1;
        if (bv == null) return -1;
        var cmp = av < bv ? -1 : 1;
        return o.dir === "DESC" ? -cmp : cmp;
      }
      return 0;
    });
  }
  if (ast.limit != null) {
    if (ast.limit < 0 || ast.limit !== Math.floor(ast.limit)) {
      throw QS.err("LIMIT must be a non-negative integer");
    }
    rows = rows.slice(0, ast.limit);
  }

  var headers = [];
  var star = ast.columns.length === 1 && ast.columns[0].type === "star";
  if (star) {
    scopes.forEach(function (sc) {
      sc.cols.forEach(function (c) {
        headers.push({ key: sc.alias + "." + c, label: sc.alias + "." + c });
      });
    });
  } else {
    ast.columns.forEach(function (col) {
      var hit = QS.resolveCol(col, scopes);
      var key = hit.scope.alias + "." + hit.col;
      headers.push({ key: key, label: col.alias || (col.table ? col.table + "." + col.name : col.name) });
    });
  }
  return {
    headers: headers,
    rows: rows.map(function (row) {
      return headers.map(function (h) {
        return row[h.key];
      });
    })
  };
};

QS.run = function (sql) {
  var ast = QS.parse(sql);
  var result = QS.exec(ast);
  result.ast = ast;
  result.sql = QS.astToSql(ast);
  result.roundtrip = QS.stable(ast) === QS.stable(QS.parse(result.sql));
  return result;
};

QS.selfCheck = function () {
  var fails = [];
  function ok(name, cond, detail) {
    if (!cond) fails.push(name + (detail ? ": " + detail : ""));
  }
  QS.PRESETS.forEach(function (p) {
    try {
      var r = QS.run(p.sql);
      ok(p.id + " roundtrip", r.roundtrip);
      ok(p.id + " rows", r.rows.length > 0);
    } catch (e) {
      fails.push(p.id + " threw " + e.message);
    }
  });
  try {
    var join = QS.run(QS.SEED_SQL);
    ok("seed row count", join.rows.length === 7, "got " + join.rows.length);
    ok("seed first employee", join.rows[0][0] === "Chris Patel", String(join.rows[0][0]));
    ok("seed first salary", join.rows[0][2] === 155000, String(join.rows[0][2]));
  } catch (e) {
    fails.push("seed " + e.message);
  }
  try {
    QS.run("SELECT id FROM missing");
    fails.push("unknown table should throw");
  } catch (e) {
    ok("unknown table", /unknown table/i.test(e.message));
  }
  try {
    QS.run("SELECT id FROM employees AS e INNER JOIN departments AS d ON e.dept_id = d.id");
    ok("ambiguous id throws or…", false);
  } catch (e) {
    ok("ambiguous id", /ambiguous/i.test(e.message), e.message);
  }
  try {
    var printed = QS.astToSql(QS.parse("select name from employees where salary>=100000 order by salary desc"));
    ok("pretty keywords", printed.indexOf("SELECT ") === 0);
    ok("pretty where", /WHERE salary >= 100000/.test(printed));
  } catch (e) {
    fails.push("pretty " + e.message);
  }
  try {
    var astLim = QS.parse("SELECT name FROM employees LIMIT 1");
    astLim.limit = -1;
    QS.exec(astLim);
    fails.push("negative limit should throw");
  } catch (e) {
    ok("negative limit", /limit/i.test(e.message), e.message);
  }
  return { ok: fails.length === 0, fails: fails };
};
