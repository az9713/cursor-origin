(function () {
  "use strict";

  var M = window.VectorModel;
  var artboard = document.getElementById("artboard");
  var shapesG = document.getElementById("shapes");
  var previewG = document.getElementById("preview");
  var selectionG = document.getElementById("selection");
  var layersEl = document.getElementById("layers");
  var statusEl = document.getElementById("status");
  var toolBtns = document.querySelectorAll(".tool");

  var state = {
    shapes: [],
    selection: null,
    tool: "select"
  };

  var history = new VectorHistory(function (s) {
    return { shapes: M.cloneShapes(s.shapes), selection: s.selection };
  });

  var interaction = {
    mode: null,
    startX: 0,
    startY: 0,
    startShape: null,
    handle: null,
    drawPoints: []
  };

  function getStateSnapshot() {
    return { shapes: state.shapes, selection: state.selection };
  }

  function finishEdit() {
    persist();
    updateUi();
  }

  function persist() {
    M.save(state.shapes, state.selection);
  }

  function svgPoint(evt) {
    var pt = artboard.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    var ctm = artboard.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    var local = pt.matrixTransform(ctm.inverse());
    return {
      x: Math.max(0, Math.min(M.ARTBOARD_W, local.x)),
      y: Math.max(0, Math.min(M.ARTBOARD_H, local.y))
    };
  }

  function setTool(tool) {
    state.tool = tool;
    artboard.className = "tool-" + tool;
    toolBtns.forEach(function (btn) {
      btn.classList.toggle("active", btn.dataset.tool === tool);
    });
    if (tool !== "draw") {
      interaction.drawPoints = [];
      clearPreview();
    }
    setStatus();
  }

  function setStatus(msg) {
    if (msg) {
      statusEl.textContent = msg;
      return;
    }
    var labels = {
      select: "Select · drag to move · handles to resize",
      rect: "Rectangle · drag on artboard",
      ellipse: "Ellipse · drag on artboard",
      draw: "Draw · click points · double-click or Enter to finish"
    };
    statusEl.textContent = (labels[state.tool] || "") + " · Snap 8px";
  }

  function renderShapes() {
    shapesG.innerHTML = "";
    state.shapes.forEach(function (shape) {
      if (!shape.visible) return;
      var el = shapeElement(shape);
      if (el) shapesG.appendChild(el);
    });
  }

  function shapeElement(shape) {
    var g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("class", "shape");
    g.dataset.id = shape.id;

    var sw = shape.strokeWidth || 2;

    if (shape.type === "rect") {
      var r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      r.setAttribute("x", shape.x);
      r.setAttribute("y", shape.y);
      r.setAttribute("width", shape.width);
      r.setAttribute("height", shape.height);
      r.setAttribute("fill", shape.fill);
      r.setAttribute("stroke", shape.stroke);
      r.setAttribute("stroke-width", sw);
      g.appendChild(r);
    } else if (shape.type === "ellipse") {
      var e = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
      e.setAttribute("cx", shape.x + shape.width / 2);
      e.setAttribute("cy", shape.y + shape.height / 2);
      e.setAttribute("rx", shape.width / 2);
      e.setAttribute("ry", shape.height / 2);
      e.setAttribute("fill", shape.fill);
      e.setAttribute("stroke", shape.stroke);
      e.setAttribute("stroke-width", sw);
      g.appendChild(e);
    } else if (shape.type === "polyline" && shape.points.length >= 2) {
      var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      var d = shape.points.map(function (p, i) {
        return (i === 0 ? "M" : "L") + p.x + " " + p.y;
      }).join(" ");
      path.setAttribute("d", d);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", shape.stroke);
      path.setAttribute("stroke-width", sw);
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      g.appendChild(path);
    } else {
      return null;
    }
    return g;
  }

  function renderSelection() {
    selectionG.innerHTML = "";
    if (!state.selection) return;
    var shape = M.findShape(state.shapes, state.selection);
    if (!shape || !shape.visible) return;

    var box = M.bbox(shape);
    var rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("class", "sel-box");
    rect.setAttribute("x", box.x);
    rect.setAttribute("y", box.y);
    rect.setAttribute("width", box.width);
    rect.setAttribute("height", box.height);
    selectionG.appendChild(rect);

    var handles = [
      { id: "nw", x: box.x, y: box.y },
      { id: "n", x: box.x + box.width / 2, y: box.y },
      { id: "ne", x: box.x + box.width, y: box.y },
      { id: "e", x: box.x + box.width, y: box.y + box.height / 2 },
      { id: "se", x: box.x + box.width, y: box.y + box.height },
      { id: "s", x: box.x + box.width / 2, y: box.y + box.height },
      { id: "sw", x: box.x, y: box.y + box.height },
      { id: "w", x: box.x, y: box.y + box.height / 2 }
    ];

    handles.forEach(function (h) {
      var c = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      c.setAttribute("class", "handle");
      c.setAttribute("data-handle", h.id);
      c.setAttribute("x", h.x - 4);
      c.setAttribute("y", h.y - 4);
      c.setAttribute("width", 8);
      c.setAttribute("height", 8);
      selectionG.appendChild(c);
    });
  }

  function clearPreview() {
    previewG.innerHTML = "";
  }

  function renderDrawPreview(cursor) {
    previewG.innerHTML = "";
    var pts = interaction.drawPoints;
    if (!pts.length) return;

    pts.forEach(function (p) {
      var dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      dot.setAttribute("class", "draw-vertex");
      dot.setAttribute("cx", p.x);
      dot.setAttribute("cy", p.y);
      dot.setAttribute("r", 4);
      previewG.appendChild(dot);
    });

    if (pts.length >= 1 && cursor) {
      var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      var all = pts.concat([cursor]);
      var d = all.map(function (p, i) {
        return (i === 0 ? "M" : "L") + p.x + " " + p.y;
      }).join(" ");
      path.setAttribute("d", d);
      path.setAttribute("class", "draw-preview");
      previewG.appendChild(path);
    } else if (pts.length >= 2) {
      var p2 = document.createElementNS("http://www.w3.org/2000/svg", "path");
      var d2 = pts.map(function (p, i) {
        return (i === 0 ? "M" : "L") + p.x + " " + p.y;
      }).join(" ");
      p2.setAttribute("d", d2);
      p2.setAttribute("class", "draw-preview");
      previewG.appendChild(p2);
    }
  }

  function renderCreatePreview(x1, y1, x2, y2, type) {
    previewG.innerHTML = "";
    var x = M.snap(Math.min(x1, x2));
    var y = M.snap(Math.min(y1, y2));
    var w = Math.max(M.SNAP, M.snap(Math.abs(x2 - x1)));
    var h = Math.max(M.SNAP, M.snap(Math.abs(y2 - y1)));

    if (type === "rect") {
      var r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      r.setAttribute("x", x);
      r.setAttribute("y", y);
      r.setAttribute("width", w);
      r.setAttribute("height", h);
      r.setAttribute("fill", "rgba(180,69,26,0.12)");
      r.setAttribute("stroke", "#b4451a");
      r.setAttribute("stroke-width", 2);
      r.setAttribute("stroke-dasharray", "6 4");
      previewG.appendChild(r);
    } else {
      var e = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
      e.setAttribute("cx", x + w / 2);
      e.setAttribute("cy", y + h / 2);
      e.setAttribute("rx", w / 2);
      e.setAttribute("ry", h / 2);
      e.setAttribute("fill", "rgba(180,69,26,0.12)");
      e.setAttribute("stroke", "#b4451a");
      e.setAttribute("stroke-width", 2);
      e.setAttribute("stroke-dasharray", "6 4");
      previewG.appendChild(e);
    }
  }

  function renderLayers() {
    layersEl.innerHTML = "";
    if (!state.shapes.length) {
      var empty = document.createElement("li");
      empty.className = "empty-layers";
      empty.textContent = "No layers yet";
      layersEl.appendChild(empty);
      return;
    }

    for (var i = state.shapes.length - 1; i >= 0; i--) {
      (function (shape, index) {
        var li = document.createElement("li");
        li.className = "layer-item";
        if (shape.id === state.selection) li.classList.add("selected");
        if (!shape.visible) li.classList.add("hidden-layer");

        var name = document.createElement("span");
        name.className = "layer-name";
        name.textContent = M.layerName(shape);
        li.appendChild(name);

        var up = layerButton("↑", "Move up");
        var down = layerButton("↓", "Move down");
        var eye = layerButton(shape.visible ? "◉" : "○", "Toggle visibility");
        var del = layerButton("×", "Delete");
        del.classList.add("danger");

        up.addEventListener("click", function (e) {
          e.stopPropagation();
          moveLayer(index, 1);
        });
        down.addEventListener("click", function (e) {
          e.stopPropagation();
          moveLayer(index, -1);
        });
        eye.addEventListener("click", function (e) {
          e.stopPropagation();
          toggleVisibility(shape.id);
        });
        del.addEventListener("click", function (e) {
          e.stopPropagation();
          deleteShape(shape.id);
        });

        li.appendChild(up);
        li.appendChild(down);
        li.appendChild(eye);
        li.appendChild(del);

        li.addEventListener("click", function () {
          state.selection = shape.id;
          persist();
          updateUi();
        });

        layersEl.appendChild(li);
      })(state.shapes[i], i);
    }
  }

  function layerButton(text, title) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "layer-btn";
    btn.textContent = text;
    btn.title = title;
    return btn;
  }

  function moveLayer(index, delta) {
    var next = index + delta;
    if (next < 0 || next >= state.shapes.length) return;
    history.snapshot(getStateSnapshot());
    var tmp = state.shapes[index];
    state.shapes[index] = state.shapes[next];
    state.shapes[next] = tmp;
    finishEdit();
  }

  function toggleVisibility(id) {
    var shape = M.findShape(state.shapes, id);
    if (!shape) return;
    history.snapshot(getStateSnapshot());
    shape.visible = !shape.visible;
    finishEdit();
  }

  function deleteShape(id) {
    history.snapshot(getStateSnapshot());
    var idx = M.findIndex(state.shapes, id);
    if (idx === -1) return;
    state.shapes.splice(idx, 1);
    if (state.selection === id) state.selection = null;
    finishEdit();
  }

  function updateUndoButtons() {
    document.getElementById("undo").disabled = !history.canUndo();
    document.getElementById("redo").disabled = !history.canRedo();
  }

  function updateUi() {
    renderShapes();
    renderSelection();
    renderLayers();
    updateUndoButtons();
  }

  function selectAt(x, y) {
    var id = M.hitTest(state.shapes, x, y);
    state.selection = id;
    persist();
    updateUi();
    return id;
  }

  function finishDraw() {
    if (interaction.drawPoints.length < 2) {
      interaction.drawPoints = [];
      clearPreview();
      setStatus();
      return;
    }
    history.snapshot(getStateSnapshot());
    var shape = M.createPolyline(interaction.drawPoints);
    if (shape) {
      state.shapes.push(shape);
      state.selection = shape.id;
    }
    interaction.drawPoints = [];
    clearPreview();
    finishEdit();
  }

  function applyMove(shape, dx, dy) {
    if (shape.type === "polyline") {
      shape.points = shape.points.map(function (p) {
        return { x: M.snap(p.x + dx), y: M.snap(p.y + dy) };
      });
    } else {
      var c = M.clampToArtboard(
        M.snap(shape.x + dx),
        M.snap(shape.y + dy),
        shape.width,
        shape.height
      );
      shape.x = c.x;
      shape.y = c.y;
    }
  }

  function applyResize(shape, handle, mx, my, startBox) {
    var x = startBox.x;
    var y = startBox.y;
    var w = startBox.width;
    var h = startBox.height;
    var right = x + w;
    var bottom = y + h;

    if (handle.indexOf("w") !== -1) x = M.snap(mx);
    if (handle.indexOf("e") !== -1) right = M.snap(mx);
    if (handle.indexOf("n") !== -1) y = M.snap(my);
    if (handle.indexOf("s") !== -1) bottom = M.snap(my);

    w = Math.max(M.SNAP, right - x);
    h = Math.max(M.SNAP, bottom - y);

    if (shape.type === "polyline" && startBox.width && startBox.height) {
      shape.points = interaction.startShape.points.map(function (p) {
        return {
          x: M.snap(x + ((p.x - startBox.x) / startBox.width) * w),
          y: M.snap(y + ((p.y - startBox.y) / startBox.height) * h)
        };
      });
    } else if (shape.type !== "polyline") {
      var c = M.clampToArtboard(x, y, w, h);
      shape.x = c.x;
      shape.y = c.y;
      shape.width = c.width;
      shape.height = c.height;
    }
  }

  function onPointerDown(evt) {
    if (evt.button !== 0) return;
    var p = svgPoint(evt);
    var target = evt.target;

    if (state.tool === "draw") {
      interaction.drawPoints.push({ x: M.snap(p.x), y: M.snap(p.y) });
      renderDrawPreview();
      setStatus("Draw · " + interaction.drawPoints.length + " points");
      return;
    }

    if (state.tool === "select") {
      if (target.classList && target.classList.contains("handle")) {
        var shape = M.findShape(state.shapes, state.selection);
        if (!shape) return;
        history.snapshot(getStateSnapshot());
        interaction.mode = "resize";
        interaction.handle = target.getAttribute("data-handle");
        interaction.startX = p.x;
        interaction.startY = p.y;
        interaction.startShape = M.cloneShapes([shape])[0];
        evt.preventDefault();
        return;
      }

      var hit = selectAt(p.x, p.y);
      if (hit) {
        history.snapshot(getStateSnapshot());
        interaction.mode = "move";
        interaction.startX = p.x;
        interaction.startY = p.y;
        interaction.startShape = M.cloneShapes([M.findShape(state.shapes, hit)])[0];
        evt.preventDefault();
      } else {
        state.selection = null;
        persist();
        updateUi();
      }
      return;
    }

    interaction.mode = "create";
    interaction.startX = p.x;
    interaction.startY = p.y;
    evt.preventDefault();
  }

  function onPointerMove(evt) {
    var p = svgPoint(evt);

    if (state.tool === "draw" && interaction.drawPoints.length) {
      renderDrawPreview({ x: M.snap(p.x), y: M.snap(p.y) });
      return;
    }

    if (interaction.mode === "create") {
      renderCreatePreview(
        interaction.startX,
        interaction.startY,
        p.x,
        p.y,
        state.tool
      );
      return;
    }

    if (interaction.mode === "move" && interaction.startShape) {
      var dx = p.x - interaction.startX;
      var dy = p.y - interaction.startY;
      var shape = M.findShape(state.shapes, state.selection);
      if (!shape) return;
      var base = interaction.startShape;
      if (shape.type === "polyline") {
        shape.points = base.points.map(function (pt) {
          return { x: M.snap(pt.x + dx), y: M.snap(pt.y + dy) };
        });
      } else {
        var c = M.clampToArtboard(
          M.snap(base.x + dx),
          M.snap(base.y + dy),
          base.width,
          base.height
        );
        shape.x = c.x;
        shape.y = c.y;
      }
      updateUi();
      return;
    }

    if (interaction.mode === "resize" && interaction.startShape) {
      var s = M.findShape(state.shapes, state.selection);
      if (!s) return;
      var box = M.bbox(interaction.startShape);
      applyResize(s, interaction.handle, p.x, p.y, box);
      updateUi();
    }
  }

  function onPointerUp(evt) {
    if (interaction.mode === "create") {
      var p = svgPoint(evt);
      var w = Math.abs(p.x - interaction.startX);
      var h = Math.abs(p.y - interaction.startY);
      clearPreview();
      if (w >= 4 || h >= 4) {
        history.snapshot(getStateSnapshot());
        var shape;
        if (state.tool === "rect") {
          shape = M.createRect(interaction.startX, interaction.startY, p.x, p.y);
        } else if (state.tool === "ellipse") {
          shape = M.createEllipse(interaction.startX, interaction.startY, p.x, p.y);
        }
        if (shape) {
          state.shapes.push(shape);
          state.selection = shape.id;
          finishEdit();
        }
      }
      interaction.mode = null;
      return;
    }

    if (interaction.mode === "move" || interaction.mode === "resize") {
      interaction.mode = null;
      interaction.startShape = null;
      interaction.handle = null;
      persist();
      updateUi();
      return;
    }
  }

  function onDblClick(evt) {
    if (state.tool === "draw") {
      evt.preventDefault();
      finishDraw();
    }
  }

  function undo() {
    var prev = history.undo(getStateSnapshot());
    if (!prev) return;
    state.shapes = prev.shapes;
    state.selection = prev.selection;
    persist();
    updateUi();
  }

  function redo() {
    var next = history.redo(getStateSnapshot());
    if (!next) return;
    state.shapes = next.shapes;
    state.selection = next.selection;
    persist();
    updateUi();
  }

  function exportSvg() {
    var svg = M.exportSvg(state.shapes);
    var blob = new Blob([svg], { type: "image/svg+xml" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "artboard.svg";
    a.click();
    URL.revokeObjectURL(url);
    setStatus("Exported artboard.svg");
  }

  function init() {
    var loaded = M.load();
    state.shapes = loaded.shapes;
    state.selection = loaded.selection;

    toolBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        setTool(btn.dataset.tool);
      });
    });

    document.getElementById("undo").addEventListener("click", undo);
    document.getElementById("redo").addEventListener("click", redo);
    document.getElementById("export").addEventListener("click", exportSvg);

    artboard.addEventListener("mousedown", onPointerDown);
    window.addEventListener("mousemove", onPointerMove);
    window.addEventListener("mouseup", onPointerUp);
    artboard.addEventListener("dblclick", onDblClick);

    document.addEventListener("keydown", function (evt) {
      var tag = evt.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (evt.key === "v" || evt.key === "V") {
        setTool("select");
        return;
      }
      if (evt.key === "r" || evt.key === "R") {
        setTool("rect");
        return;
      }
      if (evt.key === "o" || evt.key === "O") {
        setTool("ellipse");
        return;
      }
      if (evt.key === "Delete" || evt.key === "Backspace") {
        if (state.selection) {
          evt.preventDefault();
          deleteShape(state.selection);
        }
        return;
      }
      if (evt.ctrlKey && evt.key === "z") {
        evt.preventDefault();
        if (evt.shiftKey) redo();
        else undo();
        return;
      }
      if (evt.ctrlKey && (evt.key === "y" || evt.key === "Y")) {
        evt.preventDefault();
        redo();
        return;
      }
      if (evt.key === "Enter" && state.tool === "draw") {
        evt.preventDefault();
        finishDraw();
        return;
      }
      if (evt.key === "Escape" && state.tool === "draw") {
        interaction.drawPoints = [];
        clearPreview();
        setStatus();
      }
    });

    setTool("select");
    updateUi();
  }

  init();
})();
