window.QS = window.QS || {};

QS.STORE = "query-studio-v1";
QS.syncing = false;

QS.esc = function (s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
};

QS.loadStore = function () {
  try {
    return JSON.parse(localStorage.getItem(QS.STORE) || "{}") || {};
  } catch (e) {
    return {};
  }
};

QS.saveStore = function (patch) {
  var cur = QS.loadStore();
  Object.keys(patch).forEach(function (k) {
    cur[k] = patch[k];
  });
  localStorage.setItem(QS.STORE, JSON.stringify(cur));
};

QS.parseHash = function () {
  var h = (location.hash || "").replace(/^#/, "");
  var parts = h.split("/").filter(Boolean);
  if (parts[0] === "p" && parts[1]) return { kind: "p", id: decodeURIComponent(parts[1]) };
  if (parts[0] === "s" && parts[1]) return { kind: "s", id: decodeURIComponent(parts[1]) };
  return { kind: "", id: "" };
};

QS.writeHash = function (kind, id) {
  location.hash = kind && id ? "/" + kind + "/" + encodeURIComponent(id) : "";
};

QS.availableCols = function (ast) {
  var scopes = [];
  function add(ref) {
    var t = QS.tableByName(ref.name);
    if (!t) return;
    var alias = QS.aliasOf(ref);
    t.columns.forEach(function (c) {
      scopes.push({
        table: ref.name,
        alias: alias,
        name: c.name,
        label: alias + "." + c.name,
        ast: { type: "col", table: alias, name: c.name, alias: null }
      });
    });
  }
  add(ast.from);
  if (ast.join) add(ast.join.table);
  return scopes;
};

QS.defaultAst = function () {
  return QS.parse(QS.SEED_SQL);
};

QS.colKey = function (c) {
  if (!c || c.type === "star") return "*";
  return (c.table ? c.table + "." : "") + c.name;
};

QS.renderSchema = function () {
  var el = document.getElementById("schema");
  el.innerHTML = Object.keys(QS.SCHEMA)
    .map(function (name) {
      var t = QS.SCHEMA[name];
      var cols = t.columns
        .map(function (c) {
          return "<li><code>" + QS.esc(c.name) + "</code><span>" + QS.esc(c.type) + "</span></li>";
        })
        .join("");
      return (
        "<article><h3>" +
        QS.esc(name) +
        " <em>" +
        t.rows.length +
        "</em></h3><ul>" +
        cols +
        "</ul></article>"
      );
    })
    .join("");
};

QS.renderPresets = function () {
  var hash = QS.parseHash();
  var saved = QS.loadStore().saved || [];
  var presetHtml = QS.PRESETS.map(function (p) {
    var on = hash.kind === "p" && hash.id === p.id ? " on" : "";
    return (
      '<button type="button" class="link' +
      on +
      '" data-kind="p" data-id="' +
      QS.esc(p.id) +
      '">' +
      QS.esc(p.name) +
      "</button>"
    );
  }).join("");
  var savedHtml = saved
    .map(function (s) {
      var on = hash.kind === "s" && hash.id === s.id ? " on" : "";
      return (
        '<div class="saved-row">' +
        '<button type="button" class="link' +
        on +
        '" data-kind="s" data-id="' +
        QS.esc(s.id) +
        '">' +
        QS.esc(s.name) +
        "</button>" +
        '<button type="button" class="tiny" data-ren="' +
        QS.esc(s.id) +
        '" aria-label="Rename saved query">ren</button>' +
        '<button type="button" class="tiny" data-del="' +
        QS.esc(s.id) +
        '" aria-label="Delete saved query">×</button></div>'
      );
    })
    .join("");
  document.getElementById("presets").innerHTML =
    "<h3>Presets</h3>" + presetHtml + "<h3>Saved</h3>" + (savedHtml || "<p class=\"hint\">None yet.</p>");
};

QS.renderBuilder = function (ast) {
  var cols = QS.availableCols(ast);
  var star = ast.columns.length === 1 && ast.columns[0].type === "star";

  var tableOpts = Object.keys(QS.SCHEMA)
    .map(function (n) {
      return "<option value=\"" + QS.esc(n) + "\"" + (n === ast.from.name.toLowerCase() ? " selected" : "") + ">" + QS.esc(n) + "</option>";
    })
    .join("");

  var joinTables = Object.keys(QS.SCHEMA)
    .filter(function (n) {
      return n !== ast.from.name.toLowerCase();
    })
    .map(function (n) {
      var on = ast.join && ast.join.table.name.toLowerCase() === n;
      return "<option value=\"" + QS.esc(n) + "\"" + (on ? " selected" : "") + ">" + QS.esc(n) + "</option>";
    })
    .join("");

  function colOptions(selectedLabel) {
    var want = String(selectedLabel || "").toLowerCase();
    return (
      '<option value=""></option>' +
      cols
        .map(function (c) {
          var hit =
            want &&
            (c.label.toLowerCase() === want ||
              c.name.toLowerCase() === want ||
              (c.table + "." + c.name).toLowerCase() === want);
          return "<option value=\"" + QS.esc(c.label) + "\"" + (hit ? " selected" : "") + ">" + QS.esc(c.label) + "</option>";
        })
        .join("")
    );
  }

  function operandLabel(op) {
    if (!op) return "";
    if (op.type === "col") return (op.table ? op.table + "." : "") + op.name;
    if (op.type === "num") return String(op.value);
    if (op.type === "str") return "'" + op.value + "'";
    return "";
  }

  var joinOn = ast.join
    ? {
        left: operandLabel(ast.join.on.left),
        op: ast.join.on.op,
        right: operandLabel(ast.join.on.right)
      }
    : { left: "", op: "=", right: "" };

  var ops = ["=", "<>", "<", "<=", ">", ">="];
  function opSel(name, cur) {
    return (
      "<select data-field=\"" +
      name +
      "\">" +
      ops
        .map(function (o) {
          return "<option" + (o === cur ? " selected" : "") + ">" + o + "</option>";
        })
        .join("") +
      "</select>"
    );
  }

  var colChips = cols
    .map(function (c) {
      var match = ast.columns.some(function (col) {
        if (col.type === "star") return false;
        if (col.name.toLowerCase() !== c.name.toLowerCase()) return false;
        var t = (col.table || "").toLowerCase();
        if (t) return t === c.alias.toLowerCase() || t === c.table.toLowerCase();
        var hits = cols.filter(function (x) {
          return x.name.toLowerCase() === col.name.toLowerCase();
        });
        return hits.length === 1 && hits[0].label === c.label;
      });
      var alias = "";
      ast.columns.forEach(function (col) {
        if (col.type === "star") return;
        if (col.name.toLowerCase() === c.name.toLowerCase() && col.alias) {
          var t = (col.table || "").toLowerCase();
          if (!t || t === c.alias.toLowerCase() || t === c.table.toLowerCase()) alias = col.alias;
        }
      });
      return (
        '<label class="chip"><input type="checkbox" data-col="' +
        QS.esc(c.label) +
        '"' +
        (match ? " checked" : "") +
        (star ? " disabled" : "") +
        "> <code>" +
        QS.esc(c.label) +
        '</code> <input type="text" data-alias-for="' +
        QS.esc(c.label) +
        '" value="' +
        QS.esc(alias) +
        '" placeholder="alias" ' +
        (star || !match ? "disabled" : "") +
        "></label>"
      );
    })
    .join("");

  var whereRows = (ast.where.length ? ast.where : []).map(function (w, idx) {
    var left = operandLabel(w.left);
    var right = w.right.type === "col" ? operandLabel(w.right) : w.right.type === "str" ? w.right.value : String(w.right.value);
    var rightIsCol = w.right.type === "col";
    return (
      '<div class="clause" data-where="' +
      idx +
      '">' +
      (idx ? "<span class=\"conj\">AND</span>" : "<span class=\"conj\">WHERE</span>") +
      "<select data-wleft>" +
      colOptions(left) +
      "</select>" +
      opSel("wop", w.op) +
      (rightIsCol
        ? "<select data-wright-col>" + colOptions(operandLabel(w.right)) + "</select>"
        : '<input data-wright type="text" value="' + QS.esc(right) + '">') +
      '<label class="tiny-lab"><input type="checkbox" data-wright-mode' +
      (rightIsCol ? " checked" : "") +
      ' aria-label="Compare to a column"> column</label>' +
      '<button type="button" class="tiny" data-rm-where="' +
      idx +
      '">×</button></div>'
    );
  }).join("");

  var orderRows = ast.order
    .map(function (o, idx) {
      return (
        '<div class="clause" data-order="' +
        idx +
        '"><select data-oleft>' +
        colOptions(operandLabel(o.col)) +
        "</select><select data-odir><option" +
        (o.dir === "ASC" ? " selected" : "") +
        ">ASC</option><option" +
        (o.dir === "DESC" ? " selected" : "") +
        ">DESC</option></select>" +
        '<button type="button" class="tiny" data-rm-order="' +
        idx +
        '">×</button></div>'
      );
    })
    .join("");

  document.getElementById("builder").innerHTML =
    '<div class="field"><label for="b-from">From</label><select id="b-from">' +
    tableOpts +
    '</select> <label class="alias-lab">AS</label> <input id="b-from-alias" type="text" value="' +
    QS.esc(ast.from.alias || "") +
    '"></div>' +
    '<div class="field join-row"><label><input type="checkbox" id="b-join-on"' +
    (ast.join ? " checked" : "") +
    "> Inner join</label>" +
    "<select id=\"b-join-table\" " +
    (ast.join ? "" : "disabled") +
    ">" +
    joinTables +
    '</select> <label class="alias-lab">AS</label> <input id="b-join-alias" type="text" value="' +
    QS.esc(ast.join && ast.join.table.alias ? ast.join.table.alias : "") +
    '" ' +
    (ast.join ? "" : "disabled") +
    ">" +
    "<select id=\"b-join-left\" " +
    (ast.join ? "" : "disabled") +
    ">" +
    colOptions(joinOn.left) +
    "</select>" +
    opSel("jop", joinOn.op).replace('data-field="jop"', 'id="b-join-op"' + (ast.join ? "" : " disabled")) +
    "<select id=\"b-join-right\" " +
    (ast.join ? "" : "disabled") +
    ">" +
    colOptions(joinOn.right) +
    "</select></div>" +
    '<div class="field"><label>Columns</label> <label class="chip star"><input type="checkbox" id="b-star"' +
    (star ? " checked" : "") +
    "> <code>*</code></label></div>" +
    '<div class="chips" id="b-cols">' +
    colChips +
    "</div>" +
    '<div class="field head-row"><label>Where</label><button type="button" class="ghost" id="b-add-where">Add condition</button></div>' +
    '<div id="b-where">' +
    (whereRows || '<p class="hint">No filter.</p>') +
    "</div>" +
    '<div class="field head-row"><label>Order</label><button type="button" class="ghost" id="b-add-order">Add sort</button></div>' +
    '<div id="b-order">' +
    (orderRows || '<p class="hint">Result order is table order.</p>') +
    "</div>" +
    '<div class="field"><label for="b-limit">Limit</label><input id="b-limit" type="number" min="0" step="1" value="' +
    (ast.limit == null ? "" : ast.limit) +
    '" placeholder="none"></div>';
};

QS.parseColLabel = function (label) {
  var parts = String(label || "").split(".");
  if (parts.length === 2) return { type: "col", table: parts[0], name: parts[1], alias: null };
  if (parts.length === 1 && parts[0]) return { type: "col", table: null, name: parts[0], alias: null };
  return null;
};

QS.parseRightValue = function (raw) {
  var s = String(raw == null ? "" : raw).trim();
  if (s === "") return { type: "str", value: "" };
  if (/^-?\d+(\.\d+)?$/.test(s)) return { type: "num", value: Number(s) };
  if (s.length >= 2 && s[0] === "'" && s[s.length - 1] === "'") {
    return { type: "str", value: s.slice(1, -1).replace(/''/g, "'") };
  }
  return { type: "str", value: s };
};

QS.astFromBuilder = function () {
  var fromName = document.getElementById("b-from").value;
  var fromAlias = document.getElementById("b-from-alias").value.trim() || null;
  var ast = {
    type: "select",
    columns: [],
    from: { name: fromName, alias: fromAlias },
    join: null,
    where: [],
    order: [],
    limit: null
  };
  if (document.getElementById("b-join-on").checked) {
    ast.join = {
      table: {
        name: document.getElementById("b-join-table").value,
        alias: document.getElementById("b-join-alias").value.trim() || null
      },
      on: {
        type: "cmp",
        op: document.getElementById("b-join-op").value,
        left: QS.parseColLabel(document.getElementById("b-join-left").value) || {
          type: "col",
          table: null,
          name: "id",
          alias: null
        },
        right: QS.parseColLabel(document.getElementById("b-join-right").value) || {
          type: "col",
          table: null,
          name: "id",
          alias: null
        }
      }
    };
  }
  if (document.getElementById("b-star").checked) {
    ast.columns = [{ type: "star" }];
  } else {
    document.querySelectorAll("#b-cols input[data-col]").forEach(function (box) {
      if (!box.checked) return;
      var col = QS.parseColLabel(box.getAttribute("data-col"));
      var aliasIn = document.querySelector('#b-cols [data-alias-for="' + box.getAttribute("data-col") + '"]');
      col.alias = aliasIn && aliasIn.value.trim() ? aliasIn.value.trim() : null;
      ast.columns.push(col);
    });
    var prevKeys = [];
    var prevAst = QS.lastAst;
    try {
      prevAst = QS.parse(document.getElementById("sql").value);
    } catch (e) {
      prevAst = QS.lastAst;
    }
    if (prevAst) {
      prevAst.columns.forEach(function (c) {
        if (c.type === "star") return;
        prevKeys.push(((c.table || "") + "." + c.name).toLowerCase());
      });
    }
    ast.columns.sort(function (a, b) {
      function idx(c) {
        var key = ((c.table || "") + "." + c.name).toLowerCase();
        var i = prevKeys.indexOf(key);
        if (i >= 0) return i;
        for (var n = 0; n < prevKeys.length; n++) {
          if (prevKeys[n].split(".")[1] === c.name.toLowerCase()) return n;
        }
        return 999;
      }
      return idx(a) - idx(b);
    });
    if (!ast.columns.length) {
      var wasStar = prevAst && prevAst.columns.length === 1 && prevAst.columns[0].type === "star";
      if (wasStar) {
        QS.availableCols(ast).forEach(function (c) {
          ast.columns.push({ type: "col", table: c.alias, name: c.name, alias: null });
        });
      } else if (prevAst && prevAst.columns.length && prevAst.columns[0].type !== "star") {
        ast.columns = prevAst.columns.slice();
      } else {
        ast.columns = [{ type: "star" }];
      }
    }
  }
  document.querySelectorAll("#b-where .clause").forEach(function (row) {
    var left = QS.parseColLabel(row.querySelector("[data-wleft]").value);
    var opEl = row.querySelectorAll("select")[1];
    var mode = row.querySelector("[data-wright-mode]");
    var right;
    if (mode && mode.checked) {
      var colSel = row.querySelector("[data-wright-col]");
      right = QS.parseColLabel(colSel ? colSel.value : row.querySelector("[data-wright]").value);
    } else {
      var inp = row.querySelector("[data-wright]");
      right = QS.parseRightValue(inp ? inp.value : "");
    }
    if (!left) throw QS.err("Pick a column for WHERE");
    if (!right) throw QS.err("Pick a value for WHERE");
    ast.where.push({ type: "cmp", op: opEl.value, left: left, right: right });
  });
  document.querySelectorAll("#b-order .clause").forEach(function (row) {
    var col = QS.parseColLabel(row.querySelector("[data-oleft]").value);
    var dir = row.querySelector("[data-odir]").value;
    if (!col) throw QS.err("Pick a column for ORDER BY");
    ast.order.push({ col: col, dir: dir });
  });
  var lim = document.getElementById("b-limit").value;
  if (lim !== "") {
    var n = Number(lim);
    if (n < 0 || n !== Math.floor(n)) throw QS.err("LIMIT must be a non-negative integer");
    ast.limit = n;
  }
  return ast;
};

QS.hintJoin = function (fromName, joinName) {
  var hit = QS.FK.filter(function (f) {
    return (
      (f.from === fromName && f.to === joinName) ||
      (f.from === joinName && f.to === fromName)
    );
  })[0];
  var fromAlias = document.getElementById("b-from-alias").value.trim() || fromName;
  var joinAlias = document.getElementById("b-join-alias").value.trim() || joinName;
  if (hit) {
    if (hit.from === fromName) {
      return { left: fromAlias + "." + hit.col, right: joinAlias + "." + hit.toCol };
    }
    return { left: fromAlias + "." + hit.toCol, right: joinAlias + "." + hit.col };
  }
  var fromT = QS.tableByName(fromName);
  var joinT = QS.tableByName(joinName);
  if (!fromT || !joinT) return null;
  return {
    left: fromAlias + "." + fromT.columns[0].name,
    right: joinAlias + "." + joinT.columns[0].name
  };
};

QS.clearResults = function (msg) {
  document.getElementById("results").innerHTML =
    '<p class="hint">' + QS.esc(msg || "No results.") + "</p>";
};

QS.applySql = function (sql, fromBuilder) {
  document.getElementById("sql").value = sql;
  var status = document.getElementById("status");
  var rail = document.getElementById("canonical");
  var ast;
  try {
    ast = QS.parse(sql);
  } catch (e) {
    QS.syncing = false;
    document.getElementById("sql").classList.add("err");
    document.getElementById("parse-err").hidden = false;
    document.getElementById("parse-err").textContent =
      (e.line ? "Line " + e.line + ":" + e.col + " — " : "") + e.message;
    status.innerHTML = '<span class="pill bad">parse error</span>';
    rail.textContent = "";
    QS.clearResults("Fix the SQL to run.");
    if (!QS.lastAst) {
      try {
        QS.syncing = true;
        QS.renderBuilder(QS.parse(QS.SEED_SQL));
        QS.syncing = false;
      } catch (e2) {}
    }
    return;
  }
  try {
    var result = QS.exec(ast);
    result.ast = ast;
    result.sql = QS.astToSql(ast);
    result.roundtrip = QS.stable(ast) === QS.stable(QS.parse(result.sql));
    QS.lastAst = ast;
    QS.lastGoodSql = sql;
    QS.saveStore({ sql: sql, hash: location.hash });
    QS.syncing = true;
    if (!fromBuilder) QS.renderBuilder(result.ast);
    QS.syncing = false;
    QS.renderResults(result);
    rail.textContent = result.sql;
    status.innerHTML =
      '<span class="pill ' +
      (result.roundtrip ? "ok" : "bad") +
      '">roundtrip ' +
      (result.roundtrip ? "ok" : "fail") +
      "</span> <span>" +
      result.rows.length +
      " rows</span>";
    document.getElementById("sql").classList.remove("err");
    document.getElementById("parse-err").hidden = true;
  } catch (e) {
    QS.syncing = false;
    QS.lastAst = ast;
    QS.saveStore({ sql: sql, hash: location.hash });
    if (!fromBuilder) {
      QS.syncing = true;
      QS.renderBuilder(ast);
      QS.syncing = false;
    }
    document.getElementById("sql").classList.add("err");
    document.getElementById("parse-err").hidden = false;
    document.getElementById("parse-err").textContent = e.message;
    status.innerHTML = '<span class="pill bad">query error</span>';
    rail.textContent = QS.astToSql(ast);
    QS.clearResults(e.message);
  }
};

QS.renderResults = function (result) {
  var head = result.headers.map(function (h) {
    return "<th>" + QS.esc(h.label) + "</th>";
  }).join("");
  var body = result.rows
    .map(function (row) {
      return (
        "<tr>" +
        row
          .map(function (cell) {
            return "<td>" + QS.esc(cell) + "</td>";
          })
          .join("") +
        "</tr>"
      );
    })
    .join("");
  document.getElementById("results").innerHTML =
    "<table><thead><tr>" +
    head +
    "</tr></thead><tbody>" +
    (body || '<tr><td class="empty" colspan="' +
      Math.max(result.headers.length, 1) +
      '">No rows.</td></tr>') +
    "</tbody></table>";
};

QS.builderToSql = function () {
  if (QS.syncing) return;
  try {
    var ast = QS.astFromBuilder();
    var sql = QS.astToSql(ast);
    QS.applySql(sql, true);
    QS.renderBuilder(QS.parse(sql));
  } catch (e) {
    document.getElementById("status").innerHTML =
      '<span class="pill bad">builder error</span> <span>' + QS.esc(e.message) + "</span>";
  }
};

QS.loadFromHash = function (useCanonical) {
  var hash = QS.parseHash();
  var store = QS.loadStore();
  var canonical = null;
  if (hash.kind === "p") {
    var p = QS.PRESETS.filter(function (x) {
      return x.id === hash.id;
    })[0];
    if (p) canonical = p.sql;
  }
  if (hash.kind === "s") {
    var s = (store.saved || []).filter(function (x) {
      return x.id === hash.id;
    })[0];
    if (s) canonical = s.sql;
  }
  if (!canonical) return false;
  if (!useCanonical && store.sql && store.hash === location.hash) {
    QS.applySql(store.sql, false);
  } else {
    QS.applySql(canonical, false);
  }
  QS.renderPresets();
  return true;
};

QS.bind = function () {
  document.getElementById("sql").addEventListener("input", function () {
    clearTimeout(QS._t);
    QS._t = setTimeout(function () {
      QS.applySql(document.getElementById("sql").value, false);
    }, 180);
  });
  document.getElementById("run-btn").onclick = function () {
    QS.applySql(document.getElementById("sql").value, false);
  };
  document.getElementById("reset-btn").onclick = function () {
    localStorage.removeItem(QS.STORE);
    QS.writeHash("p", "join-depts");
    QS.applySql(QS.SEED_SQL, false);
    QS.renderPresets();
  };
  document.getElementById("save-btn").onclick = function () {
    var name = window.prompt("Name this query", "Saved query");
    if (!name) return;
    var store = QS.loadStore();
    var saved = store.saved || [];
    var id = "s" + Date.now().toString(36);
    saved.push({ id: id, name: name, sql: document.getElementById("sql").value });
    QS.saveStore({ saved: saved, sql: document.getElementById("sql").value });
    QS.writeHash("s", id);
    QS.renderPresets();
  };
  document.getElementById("presets").addEventListener("click", function (ev) {
    var del = ev.target.closest("[data-del]");
    if (del) {
      var delId = del.getAttribute("data-del");
      var store = QS.loadStore();
      store.saved = (store.saved || []).filter(function (s) {
        return s.id !== delId;
      });
      QS.saveStore({ saved: store.saved });
      var hash = QS.parseHash();
      if (hash.kind === "s" && hash.id === delId) QS.writeHash("p", "join-depts");
      QS.renderPresets();
      return;
    }
    var ren = ev.target.closest("[data-ren]");
    if (ren) {
      var store2 = QS.loadStore();
      var item = (store2.saved || []).filter(function (s) {
        return s.id === ren.getAttribute("data-ren");
      })[0];
      if (!item) return;
      var name = window.prompt("Rename query", item.name);
      if (!name) return;
      item.name = name;
      QS.saveStore({ saved: store2.saved });
      QS.renderPresets();
      return;
    }
    var btn = ev.target.closest("[data-kind]");
    if (!btn) return;
    QS._hashFromClick = true;
    var before = location.hash;
    QS.writeHash(btn.getAttribute("data-kind"), btn.getAttribute("data-id"));
    if (location.hash === before) QS.loadFromHash(true);
  });
  document.getElementById("builder").addEventListener("change", function (ev) {
    if (
      ev.target.id === "b-join-on" ||
      ev.target.id === "b-from" ||
      ev.target.id === "b-join-table"
    ) {
      if (document.getElementById("b-join-on").checked) {
        var h = QS.hintJoin(
          document.getElementById("b-from").value,
          document.getElementById("b-join-table").value
        );
        if (h && document.getElementById("b-join-left")) {
          document.getElementById("b-join-left").value = h.left;
          document.getElementById("b-join-right").value = h.right;
        }
      }
    }
    QS.builderToSql();
  });
  document.getElementById("builder").addEventListener("input", function (ev) {
    var id = ev.target.id || "";
    if (
      id === "b-from-alias" ||
      id === "b-join-alias" ||
      id === "b-limit" ||
      ev.target.getAttribute("data-alias-for") ||
      ev.target.hasAttribute("data-wright")
    ) {
      clearTimeout(QS._bt);
      QS._bt = setTimeout(QS.builderToSql, 160);
    }
  });
  document.getElementById("builder").addEventListener("click", function (ev) {
    var addW = ev.target.closest("#b-add-where");
    var addO = ev.target.closest("#b-add-order");
    var rmW = ev.target.closest("[data-rm-where]");
    var rmO = ev.target.closest("[data-rm-order]");
    if (!addW && !addO && !rmW && !rmO) return;
    try {
      var ast = QS.astFromBuilder();
      var cols = QS.availableCols(ast);
      var first = cols[0] ? cols[0].ast : { type: "col", table: null, name: "id", alias: null };
      if (addW) ast.where.push({ type: "cmp", op: "=", left: first, right: { type: "num", value: 0 } });
      if (addO) ast.order.push({ col: first, dir: "ASC" });
      if (rmW) ast.where.splice(Number(rmW.getAttribute("data-rm-where")), 1);
      if (rmO) ast.order.splice(Number(rmO.getAttribute("data-rm-order")), 1);
      QS.applySql(QS.astToSql(ast), false);
    } catch (e) {
      document.getElementById("status").innerHTML =
        '<span class="pill bad">builder error</span> <span>' + QS.esc(e.message) + "</span>";
    }
  });
  document.addEventListener("keydown", function (ev) {
    if ((ev.ctrlKey || ev.metaKey) && ev.key === "Enter") {
      ev.preventDefault();
      if (document.getElementById("builder").contains(ev.target)) QS.builderToSql();
      else QS.applySql(document.getElementById("sql").value, false);
    }
  });
  window.addEventListener("hashchange", function () {
    var fromClick = QS._hashFromClick;
    QS._hashFromClick = false;
    QS.loadFromHash(fromClick);
  });
};

QS.boot = function () {
  QS.renderSchema();
  QS.renderPresets();
  QS.bind();
  var check = QS.selfCheck();
  document.getElementById("selfcheck").textContent = check.ok
    ? "self-check ok"
    : "self-check failed: " + check.fails.join("; ");
  document.getElementById("selfcheck").className = "selfcheck " + (check.ok ? "ok" : "bad");
  if (QS.loadFromHash(false)) return;
  var stored = QS.loadStore().sql;
  if (stored) QS.applySql(stored, false);
  else {
    QS.writeHash("p", "join-depts");
    QS.applySql(QS.SEED_SQL, false);
  }
};

document.addEventListener("DOMContentLoaded", QS.boot);
