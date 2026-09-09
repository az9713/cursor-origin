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

  var grouped = QS.needsGroup(ast);
  if (grouped) {
    return QS.execGrouped(ast, rows, scopes);
  }

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

QS.needsGroup = function (ast) {
  return (ast.group && ast.group.length) ||
    (ast.columns || []).some(function (c) {
      return c.type === "agg";
    });
};

QS.sameCol = function (a, b) {
  if (!a || !b || a.type === "agg" || b.type === "agg") return false;
  if (a.name.toLowerCase() !== b.name.toLowerCase()) return false;
  if (!a.table || !b.table) return true;
  return a.table.toLowerCase() === b.table.toLowerCase();
};

QS.aggValue = function (agg, bucket, scopes) {
  var fn = String(agg.fn || "").toUpperCase();
  if (fn === "COUNT") {
    if (!agg.arg || agg.arg.type === "star") return bucket.length;
    var n = 0;
    bucket.forEach(function (row) {
      if (QS.readOp(agg.arg, row, scopes) != null) n += 1;
    });
    return n;
  }
  var vals = [];
  bucket.forEach(function (row) {
    var v = QS.readOp(agg.arg, row, scopes);
    if (typeof v === "number") vals.push(v);
  });
  if (!vals.length) return null;
  if (fn === "SUM") return vals.reduce(function (a, b) { return a + b; }, 0);
  if (fn === "AVG") return vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
  if (fn === "MIN") return Math.min.apply(null, vals);
  if (fn === "MAX") return Math.max.apply(null, vals);
  throw QS.err("Unknown aggregate " + agg.fn);
};

QS.readGrouped = function (op, bucket, scopes) {
  if (!op) return null;
  if (op.type === "num" || op.type === "str") return QS.readOp(op, bucket[0], scopes);
  if (op.type === "agg") return QS.aggValue(op, bucket, scopes);
  return QS.readOp(op, bucket[0], scopes);
};

QS.execGrouped = function (ast, rows, scopes) {
  var group = ast.group || [];
  var star = ast.columns.length === 1 && ast.columns[0].type === "star";
  if (star) throw QS.err("SELECT * cannot be used with GROUP BY or aggregates");
  ast.columns.forEach(function (col) {
    if (col.type === "agg") return;
    if (!group.length) throw QS.err("Column " + QS.colToSql(col, false) + " must be aggregated or in GROUP BY");
    var ok = group.some(function (g) {
      return QS.sameCol(col, g);
    });
    if (!ok) throw QS.err("Column " + QS.colToSql(col, false) + " must appear in GROUP BY");
  });

  var buckets = [];
  if (!group.length) {
    buckets = [rows];
  } else {
    var map = {};
    rows.forEach(function (row) {
      var key = group
        .map(function (g) {
          return String(QS.readOp(g, row, scopes));
        })
        .join("\u0001");
      if (!map[key]) {
        map[key] = [];
        buckets.push(map[key]);
      }
      map[key].push(row);
    });
  }

  var headers = ast.columns.map(function (col, idx) {
    var label = col.alias || (col.type === "agg" ? QS.aggToSql(col, false) : QS.colToSql(col, false));
    return { key: "c" + idx, label: label, item: col };
  });

  var out = buckets
    .filter(function (bucket) {
      if (!bucket.length) return false;
      return (ast.having || []).every(function (h) {
        return QS.cmp(h.op, QS.readGrouped(h.left, bucket, scopes), QS.readGrouped(h.right, bucket, scopes));
      });
    })
    .map(function (bucket) {
      return {
        bucket: bucket,
        cells: ast.columns.map(function (col) {
          if (col.type === "agg") return QS.aggValue(col, bucket, scopes);
          return QS.readOp(col, bucket[0], scopes);
        })
      };
    });

  if (ast.order && ast.order.length) {
    out.sort(function (ra, rb) {
      for (var i = 0; i < ast.order.length; i++) {
        var o = ast.order[i];
        var av = QS.orderGrouped(o.col, ra, headers, scopes);
        var bv = QS.orderGrouped(o.col, rb, headers, scopes);
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
    out = out.slice(0, ast.limit);
  }
  return {
    headers: headers,
    rows: out.map(function (r) {
      return r.cells;
    })
  };
};

QS.orderGrouped = function (col, row, headers, scopes) {
  if (col.type === "agg") return QS.aggValue(col, row.bucket, scopes);
  var want = (col.alias || col.name || "").toLowerCase();
  var sql = QS.colToSql(col, false).toLowerCase();
  for (var i = 0; i < headers.length; i++) {
    var lab = String(headers[i].label).toLowerCase();
    if (lab === want || lab === sql) return row.cells[i];
    if (headers[i].item && QS.sameCol(headers[i].item, col)) return row.cells[i];
  }
  return QS.readOp(col, row.bucket[0], scopes);
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
  try {
    var grouped = QS.run(
      "SELECT d.name AS department, COUNT(*) AS n\n" +
        "FROM employees AS e\n" +
        "INNER JOIN departments AS d ON e.dept_id = d.id\n" +
        "GROUP BY d.name\n" +
        "HAVING COUNT(*) >= 2\n" +
        "ORDER BY n DESC"
    );
    ok("group roundtrip", grouped.roundtrip);
    ok("group row count", grouped.rows.length === 3, "got " + grouped.rows.length);
    ok("group first dept", grouped.rows[0][0] === "Payments", String(grouped.rows[0][0]));
    ok("group first n", grouped.rows[0][1] === 3, String(grouped.rows[0][1]));
  } catch (e) {
    fails.push("group " + e.message);
  }
  try {
    var one = QS.run("SELECT COUNT(*) AS n FROM employees");
    ok("count all", one.rows[0][0] === 8, String(one.rows[0][0]));
  } catch (e) {
    fails.push("count " + e.message);
  }
  return { ok: fails.length === 0, fails: fails };
};
