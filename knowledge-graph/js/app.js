window.KG = window.KG || {};

KG.parseHash = function () {
  var h = (location.hash || "").replace(/^#/, "");
  var qpart = h.split("?");
  var path = qpart[0];
  var q = new URLSearchParams(qpart[1] || location.search.replace(/^\?/, ""));
  var segs = path.split("/").filter(Boolean);
  return { id: segs[0] === "n" ? decodeURIComponent(segs[1] || "") : "", q: q.get("q") || "" };
};

KG.writeHash = function (id, query) {
  var path = id ? "/n/" + encodeURIComponent(id) : "";
  var qs = query ? "?q=" + encodeURIComponent(query) : "";
  location.hash = path + qs;
};

KG.boot = function () {
  var data = window.KG_DATA;
  var graph = KG.layout(data);
  var canvas = document.getElementById("graph");
  var ctx = canvas.getContext("2d");
  var cam = { x: 0, y: 0, scale: 0.55 };
  var typesOn = {};
  data.types.forEach(function (t) { typesOn[t] = true; });
  var hover = null;
  var drag = null;
  var colors = {
    person: getComputedStyle(document.documentElement).getPropertyValue("--node-person").trim() || "#5c7a8a",
    company: "#8a6b4a",
    technology: "#4a7a5c",
    event: "#7a5c8a",
    concept: "#6a6a4a"
  };

  var side = document.getElementById("filters");
  side.innerHTML = data.types.map(function (t) {
    return '<label><input type="checkbox" data-type="' + t + '" checked> <span class="swatch ' + t + '"></span>' +
      (data.typeLabels[t] || t) + "</label>";
  }).join("");
  side.querySelectorAll("input").forEach(function (box) {
    box.addEventListener("change", function () {
      typesOn[box.getAttribute("data-type")] = box.checked;
      draw();
    });
  });

  function size() {
    var wrap = canvas.parentElement;
    canvas.width = wrap.clientWidth;
    canvas.height = wrap.clientHeight;
    draw();
  }

  function visible(n) {
    if (!typesOn[n.data.type]) return false;
    var q = KG.parseHash().q.toLowerCase();
    if (!q) return true;
    var hay = (n.data.label + " " + n.data.summary + " " + (n.data.tags || []).join(" ")).toLowerCase();
    return hay.indexOf(q) !== -1;
  }

  function toWorld(mx, my) {
    return { x: (mx - canvas.width / 2) / cam.scale - cam.x, y: (my - canvas.height / 2) / cam.scale - cam.y };
  }

  function hit(mx, my) {
    var p = toWorld(mx, my);
    var found = null;
    graph.nodes.forEach(function (n) {
      if (!visible(n)) return;
      var dx = n.x - p.x;
      var dy = n.y - p.y;
      if (dx * dx + dy * dy < 14 * 14) found = n;
    });
    return found;
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(cam.scale, cam.scale);
    ctx.translate(cam.x, cam.y);
    var sel = KG.parseHash().id;
    graph.links.forEach(function (l) {
      if (!visible(l.source) || !visible(l.target)) return;
      ctx.strokeStyle = "rgba(180,69,26,0.28)";
      ctx.lineWidth = 1 / cam.scale;
      ctx.beginPath();
      ctx.moveTo(l.source.x, l.source.y);
      ctx.lineTo(l.target.x, l.target.y);
      ctx.stroke();
    });
    graph.nodes.forEach(function (n) {
      if (!visible(n)) return;
      ctx.fillStyle = colors[n.data.type] || "#444";
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.data.id === sel ? 8 : 5, 0, Math.PI * 2);
      ctx.fill();
      if (n === hover || n.data.id === sel) {
        ctx.fillStyle = "#1a1612";
        ctx.font = 12 / cam.scale + "px IBM Plex Sans, sans-serif";
        ctx.fillText(n.data.label, n.x + 10, n.y + 4);
      }
    });
    ctx.restore();
  }

  function showDetail(id) {
    var panel = document.getElementById("detail");
    var n = graph.byId[id];
    if (!n) {
      panel.innerHTML = "<p>Click a node. " + data.nodes.length + " nodes, " + data.edges.length + " edges.</p>";
      return;
    }
    var neighbors = data.edges.filter(function (e) {
      return e.source === id || e.target === id;
    }).map(function (e) {
      var other = e.source === id ? e.target : e.source;
      var node = graph.byId[other];
      return "<li><a href=\"#/n/" + encodeURIComponent(other) + "\">" +
        (node ? node.data.label : other) + "</a> <span class=\"meta\">" + e.relation + "</span></li>";
    }).join("");
    panel.innerHTML = "<h2>" + n.data.label + "</h2>" +
      "<p class=\"meta\">" + n.data.type + " · " + (n.data.year || "—") + "</p>" +
      "<p>" + n.data.summary + "</p>" +
      "<p class=\"meta\">" + (n.data.tags || []).join(", ") + "</p>" +
      "<h3>Connected</h3><ul>" + (neighbors || "<li>None</li>") + "</ul>";
  }

  canvas.addEventListener("mousedown", function (ev) {
    var n = hit(ev.offsetX, ev.offsetY);
    if (n) {
      KG.writeHash(n.data.id, KG.parseHash().q);
      return;
    }
    drag = { x: ev.clientX, y: ev.clientY, cx: cam.x, cy: cam.y };
  });
  window.addEventListener("mousemove", function (ev) {
    if (drag) {
      cam.x = drag.cx + (ev.clientX - drag.x) / cam.scale;
      cam.y = drag.cy + (ev.clientY - drag.y) / cam.scale;
      draw();
      return;
    }
    var rect = canvas.getBoundingClientRect();
    hover = hit(ev.clientX - rect.left, ev.clientY - rect.top);
    draw();
  });
  window.addEventListener("mouseup", function () { drag = null; });
  canvas.addEventListener("wheel", function (ev) {
    ev.preventDefault();
    var factor = ev.deltaY > 0 ? 0.92 : 1.08;
    cam.scale = Math.max(0.15, Math.min(3, cam.scale * factor));
    draw();
  }, { passive: false });

  document.getElementById("search").addEventListener("input", function (ev) {
    KG.writeHash(KG.parseHash().id, ev.target.value);
  });

  window.addEventListener("hashchange", function () {
    document.getElementById("search").value = KG.parseHash().q;
    showDetail(KG.parseHash().id);
    draw();
  });

  window.addEventListener("resize", size);
  document.getElementById("search").value = KG.parseHash().q;
  size();
  showDetail(KG.parseHash().id);
};

document.addEventListener("DOMContentLoaded", KG.boot);
