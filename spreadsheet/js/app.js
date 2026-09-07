window.SS = window.SS || {};

SS.STORE = "spreadsheet-v2";
SS.cells = {};
SS.sel = { c0: 6, r0: 1, c1: 6, r1: 1 };
SS.anchor = { col: 6, row: 1 };
SS.editing = null;
SS.history = [];
SS.future = [];
SS.dragging = false;
SS.filling = false;

SS.seed = function () {
  return {
    A1: "Item", B1: "Qty", C1: "Price", D1: "Line total",
    A2: "Apples", B2: "4", C2: "1.25", D2: "=B2*C2",
    A3: "Pears", B3: "6", C3: "0.8", D3: "=B3*C3",
    A4: "Figs", B4: "2", C4: "3.5", D4: "=B4*C4",
    A5: "Rye", B5: "1", C5: "4", D5: "=B5*C5",
    C7: "SUM lines", D7: "=SUM(D2:D5)",
    C8: "AVERAGE qty", D8: "=AVERAGE(B2:B5)",
    C9: "IF total>15", D9: '=IF(D7>15,"over","ok")',

    F1: "Showcase", G1: "Result", H1: "Type in the bar",
    F2: "SUM", G2: "=SUM(D2:D5)", H2: "SUM(D2:D5)",
    F3: "AVERAGE", G3: "=AVERAGE(B2:B5)", H3: "AVERAGE(B2:B5)",
    F4: "IF compare", G4: '=IF(D7>15,"over","ok")', H4: "IF(D7>15,\"over\",\"ok\")",
    F5: "IF equal", G5: '=IF(B2=4,"qty is 4","other")', H5: "IF(B2=4,\"qty is 4\",\"other\")",
    F6: "Cell refs", G6: "=D2+D3", H6: "D2+D3",
    F7: "Parentheses", G7: "=(B2+B3)*C2", H7: "(B2+B3)*C2",
    F8: "Unary minus", G8: "=-C4", H8: "-C4",
    F9: "Divide by zero", G9: "=1/0", H9: "1/0",
    F11: "Cycle pair",
    F12: "=F13", H12: "F12 is =F13",
    F13: "=F12", H13: "F13 is =F12"
  };
};

SS.getRaw = function (col, row) {
  return SS.cells[SS.cellKey(col, row)] || "";
};

SS.setRaw = function (col, row, value) {
  var key = SS.cellKey(col, row);
  if (value === "" || value === undefined || value === null) delete SS.cells[key];
  else SS.cells[key] = String(value);
};

SS.snapshot = function () {
  SS.history.push(JSON.stringify(SS.cells));
  if (SS.history.length > 80) SS.history.shift();
  SS.future = [];
};

SS.persist = function () {
  try { localStorage.setItem(SS.STORE, JSON.stringify(SS.cells)); } catch (e) {}
};

SS.load = function () {
  try {
    var saved = JSON.parse(localStorage.getItem(SS.STORE) || "null");
    if (saved && typeof saved === "object" && Object.keys(saved).length) {
      SS.cells = saved;
      return;
    }
  } catch (e) {}
  SS.cells = SS.seed();
  SS.persist();
};

SS.display = function (col, row) {
  return SS.evalCell(col, row, SS.getRaw, []);
};

SS.normSel = function () {
  return {
    c0: Math.min(SS.sel.c0, SS.sel.c1),
    c1: Math.max(SS.sel.c0, SS.sel.c1),
    r0: Math.min(SS.sel.r0, SS.sel.r1),
    r1: Math.max(SS.sel.r0, SS.sel.r1)
  };
};

SS.active = function () {
  return { col: SS.anchor.col, row: SS.anchor.row };
};

SS.pushStatus = function (text) {
  document.getElementById("status").textContent = text;
};

SS.render = function () {
  var table = document.getElementById("sheet");
  var s = SS.normSel();
  var html = "<thead><tr><th class='corner'></th>";
  for (var c = 0; c < SS.COLS; c++) html += "<th>" + SS.colName(c) + "</th>";
  html += "</tr></thead><tbody>";
  for (var r = 0; r < SS.ROWS; r++) {
    html += "<tr><th class='rowh'>" + (r + 1) + "</th>";
    for (c = 0; c < SS.COLS; c++) {
      var val = SS.display(c, r);
      var shown = SS.formatValue(val);
      var cls = "cell";
      if (c === SS.anchor.col && r === SS.anchor.row) cls += " sel";
      else if (c >= s.c0 && c <= s.c1 && r >= s.r0 && r <= s.r1) cls += " in-range";
      if (typeof val === "string" && val.charAt(0) === "#") cls += " err";
      html += '<td class="' + cls + '" data-c="' + c + '" data-r="' + r + '">' +
        String(shown).replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</td>";
    }
    html += "</tr>";
  }
  html += "</tbody>";
  table.innerHTML = html;
  var a = SS.active();
  document.getElementById("addr").textContent = SS.cellKey(a.col, a.row);
  if (!SS.editing) document.getElementById("formula").value = SS.getRaw(a.col, a.row);
  SS.placeFill();
};

SS.placeFill = function () {
  var handle = document.getElementById("fill");
  var s = SS.normSel();
  var td = document.querySelector('td.cell[data-c="' + s.c1 + '"][data-r="' + s.r1 + '"]');
  if (!td) { handle.hidden = true; return; }
  var wrap = document.querySelector(".sheet-wrap");
  var rect = td.getBoundingClientRect();
  var box = wrap.getBoundingClientRect();
  handle.hidden = false;
  handle.style.left = (rect.right - box.left + wrap.scrollLeft - 5) + "px";
  handle.style.top = (rect.bottom - box.top + wrap.scrollTop - 5) + "px";
};

SS.select = function (col, row, extend) {
  col = Math.max(0, Math.min(SS.COLS - 1, col));
  row = Math.max(0, Math.min(SS.ROWS - 1, row));
  if (!extend) {
    SS.anchor = { col: col, row: row };
    SS.sel = { c0: col, r0: row, c1: col, r1: row };
  } else {
    SS.sel.c1 = col;
    SS.sel.r1 = row;
  }
  SS.render();
};

SS.commitEdit = function (move) {
  if (!SS.editing) return;
  var input = document.querySelector("td.edit input");
  var col = SS.editing.col;
  var row = SS.editing.row;
  var next = input ? input.value : "";
  SS.editing = null;
  if (next !== SS.getRaw(col, row)) {
    SS.snapshot();
    SS.setRaw(col, row, next);
    SS.persist();
  }
  if (move === "down") SS.select(col, row + 1, false);
  else if (move === "tab") SS.select(col + 1, row, false);
  else SS.select(col, row, false);
};

SS.startEdit = function (initial) {
  SS.commitEdit();
  var a = SS.active();
  SS.editing = { col: a.col, row: a.row };
  var td = document.querySelector('td.cell[data-c="' + a.col + '"][data-r="' + a.row + '"]');
  if (!td) return;
  td.classList.add("edit");
  td.innerHTML = "";
  var input = document.createElement("input");
  input.value = initial !== undefined ? initial : SS.getRaw(a.col, a.row);
  td.appendChild(input);
  input.focus();
  if (initial !== undefined) input.value = initial;
  input.addEventListener("keydown", function (ev) {
    if (ev.key === "Enter") { ev.preventDefault(); SS.commitEdit("down"); }
    else if (ev.key === "Tab") { ev.preventDefault(); SS.commitEdit("tab"); }
    else if (ev.key === "Escape") {
      ev.preventDefault();
      SS.editing = null;
      SS.render();
    }
  });
  input.addEventListener("blur", function () { if (SS.editing) SS.commitEdit(); });
};

SS.clearSel = function () {
  var s = SS.normSel();
  SS.snapshot();
  for (var r = s.r0; r <= s.r1; r++) {
    for (var c = s.c0; c <= s.c1; c++) SS.setRaw(c, r, "");
  }
  SS.persist();
  SS.render();
};

SS.fillTo = function (col, row) {
  var s = SS.normSel();
  var dc = col - s.c1;
  var dr = row - s.r1;
  if (dc && dr) return;
  if (!dc && !dr) return;
  SS.snapshot();
  var width = s.c1 - s.c0 + 1;
  var height = s.r1 - s.r0 + 1;
  if (dr > 0) {
    for (var r = s.r1 + 1; r <= row; r++) {
      for (var c = s.c0; c <= s.c1; c++) {
        var srcR = s.r0 + ((r - s.r0) % height);
        var raw = SS.getRaw(c, srcR);
        SS.setRaw(c, r, SS.adjustFormula(raw, 0, r - srcR));
      }
    }
    SS.sel.r1 = row;
  } else if (dc > 0) {
    for (c = s.c1 + 1; c <= col; c++) {
      for (r = s.r0; r <= s.r1; r++) {
        var srcC = s.c0 + ((c - s.c0) % width);
        raw = SS.getRaw(srcC, r);
        SS.setRaw(c, r, SS.adjustFormula(raw, c - srcC, 0));
      }
    }
    SS.sel.c1 = col;
  }
  SS.persist();
  SS.render();
};

SS.undo = function () {
  if (!SS.history.length) return;
  SS.future.push(JSON.stringify(SS.cells));
  SS.cells = JSON.parse(SS.history.pop());
  SS.persist();
  SS.render();
};

SS.redo = function () {
  if (!SS.future.length) return;
  SS.history.push(JSON.stringify(SS.cells));
  SS.cells = JSON.parse(SS.future.pop());
  SS.persist();
  SS.render();
};

SS.usedRect = function () {
  var keys = Object.keys(SS.cells);
  if (!keys.length) return { c0: 0, r0: 0, c1: 0, r1: 0 };
  var c0 = SS.COLS, r0 = SS.ROWS, c1 = 0, r1 = 0;
  keys.forEach(function (k) {
    var ref = SS.parseRef(k);
    if (!ref) return;
    c0 = Math.min(c0, ref.col);
    r0 = Math.min(r0, ref.row);
    c1 = Math.max(c1, ref.col);
    r1 = Math.max(r1, ref.row);
  });
  return { c0: c0, r0: r0, c1: c1, r1: r1 };
};

SS.csvEscape = function (s) {
  s = String(s);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
};

SS.exportCsv = function () {
  var u = SS.usedRect();
  var lines = [];
  for (var r = u.r0; r <= u.r1; r++) {
    var row = [];
    for (var c = u.c0; c <= u.c1; c++) row.push(SS.csvEscape(SS.getRaw(c, r)));
    lines.push(row.join(","));
  }
  var blob = new Blob([lines.join("\n")], { type: "text/csv" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "sheet.csv";
  a.click();
  URL.revokeObjectURL(a.href);
};

SS.parseCsv = function (text) {
  var rows = [];
  var row = [];
  var cur = "";
  var q = false;
  for (var i = 0; i < text.length; i++) {
    var ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (ch !== "\r") cur += ch;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  return rows;
};

SS.importCsv = function (text) {
  SS.snapshot();
  SS.cells = {};
  var rows = SS.parseCsv(text);
  rows.forEach(function (row, r) {
    row.forEach(function (val, c) {
      if (c < SS.COLS && r < SS.ROWS) SS.setRaw(c, r, val);
    });
  });
  SS.persist();
  SS.render();
};

SS.bind = function () {
  var table = document.getElementById("sheet");
  table.addEventListener("mousedown", function (ev) {
    var td = ev.target.closest("td.cell");
    if (!td) return;
    ev.preventDefault();
    SS.commitEdit();
    SS.dragging = true;
    SS.select(Number(td.dataset.c), Number(td.dataset.r), ev.shiftKey);
  });
  table.addEventListener("mouseover", function (ev) {
    if (!SS.dragging && !SS.filling) return;
    var td = ev.target.closest("td.cell");
    if (!td) return;
    if (SS.filling) SS.pushStatus("Fill to " + SS.cellKey(Number(td.dataset.c), Number(td.dataset.r)));
    else SS.select(Number(td.dataset.c), Number(td.dataset.r), true);
  });
  window.addEventListener("mouseup", function (ev) {
    if (SS.filling) {
      var td = ev.target.closest && ev.target.closest("td.cell");
      if (td) SS.fillTo(Number(td.dataset.c), Number(td.dataset.r));
      SS.filling = false;
    }
    SS.dragging = false;
  });
  table.addEventListener("dblclick", function (ev) {
    if (ev.target.closest("td.cell")) SS.startEdit();
  });
  document.getElementById("fill").addEventListener("mousedown", function (ev) {
    ev.preventDefault();
    ev.stopPropagation();
    SS.commitEdit();
    SS.filling = true;
  });
  document.getElementById("formula").addEventListener("focus", function () {
    SS.editing = { col: SS.anchor.col, row: SS.anchor.row, bar: true };
  });
  document.getElementById("formula").addEventListener("keydown", function (ev) {
    if (ev.key === "Enter") {
      ev.preventDefault();
      SS.snapshot();
      SS.setRaw(SS.anchor.col, SS.anchor.row, ev.target.value);
      SS.editing = null;
      SS.persist();
      SS.select(SS.anchor.col, SS.anchor.row + 1, false);
    }
  });
  document.getElementById("undo").onclick = SS.undo;
  document.getElementById("redo").onclick = SS.redo;
  document.getElementById("export").onclick = SS.exportCsv;
  document.getElementById("import-btn").onclick = function () {
    document.getElementById("import").click();
  };
  document.getElementById("import").addEventListener("change", function (ev) {
    var file = ev.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () { SS.importCsv(String(reader.result || "")); };
    reader.readAsText(file);
    ev.target.value = "";
  });
  window.addEventListener("keydown", function (ev) {
    if (SS.editing && !SS.editing.bar) return;
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "z") {
      ev.preventDefault();
      if (ev.shiftKey) SS.redo();
      else SS.undo();
      return;
    }
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "y") {
      ev.preventDefault();
      SS.redo();
      return;
    }
    if (document.activeElement && document.activeElement.id === "formula") return;
    var a = SS.active();
    if (ev.key === "Enter") { ev.preventDefault(); SS.startEdit(); }
    else if (ev.key === "Delete" || ev.key === "Backspace") { ev.preventDefault(); SS.clearSel(); }
    else if (ev.key === "ArrowUp") { ev.preventDefault(); SS.select(a.col, a.row - 1, ev.shiftKey); }
    else if (ev.key === "ArrowDown") { ev.preventDefault(); SS.select(a.col, a.row + 1, ev.shiftKey); }
    else if (ev.key === "ArrowLeft") { ev.preventDefault(); SS.select(a.col - 1, a.row, ev.shiftKey); }
    else if (ev.key === "ArrowRight") { ev.preventDefault(); SS.select(a.col + 1, a.row, ev.shiftKey); }
    else if (ev.key === "Tab") { ev.preventDefault(); SS.select(a.col + (ev.shiftKey ? -1 : 1), a.row, false); }
    else if (ev.key.length === 1 && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
      SS.startEdit(ev.key);
    }
  });
  document.querySelector(".sheet-wrap").addEventListener("scroll", SS.placeFill);
  window.addEventListener("resize", SS.placeFill);
};

SS.boot = function () {
  SS.load();
  SS.bind();
  SS.render();
  var g2 = document.querySelector('td.cell[data-c="6"][data-r="1"]');
  if (g2) g2.scrollIntoView({ block: "nearest", inline: "center" });
  SS.pushStatus("G2 is selected: SUM. Column F labels AVERAGE, IF, refs, errors. F12/F13 is a #CYCLE! pair. Click a result cell and read the formula bar.");
};

document.addEventListener("DOMContentLoaded", SS.boot);
