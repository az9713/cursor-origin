(function (global) {
  "use strict";

  var STORAGE_KEY = "vector-editor-v1";
  var SNAP = 8;
  var ARTBOARD_W = 800;
  var ARTBOARD_H = 560;
  var uid = 0;

  function nextId() {
    uid += 1;
    return "s" + uid;
  }

  function snap(v) {
    return Math.round(v / SNAP) * SNAP;
  }

  function clampToArtboard(x, y, w, h) {
    w = Math.max(SNAP, w);
    h = Math.max(SNAP, h);
    if (x + w > ARTBOARD_W) x = ARTBOARD_W - w;
    if (y + h > ARTBOARD_H) y = ARTBOARD_H - h;
    if (x < 0) x = 0;
    if (y < 0) y = 0;
    return { x: x, y: y, width: w, height: h };
  }

  function bbox(shape) {
    if (shape.type === "polyline") {
      if (!shape.points.length) return { x: 0, y: 0, width: SNAP, height: SNAP };
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      shape.points.forEach(function (p) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      });
      return {
        x: minX,
        y: minY,
        width: Math.max(SNAP, maxX - minX),
        height: Math.max(SNAP, maxY - minY)
      };
    }
    return {
      x: shape.x,
      y: shape.y,
      width: shape.width,
      height: shape.height
    };
  }

  function layerName(shape) {
    if (shape.name) return shape.name;
    if (shape.type === "rect") return "Rectangle";
    if (shape.type === "ellipse") return "Ellipse";
    if (shape.type === "polyline") return "Path";
    return "Shape";
  }

  function defaultStyle() {
    return {
      fill: "#e8dcc8",
      stroke: "#1a1612",
      strokeWidth: 2
    };
  }

  function seedShapes() {
    uid = 4;
    var style = defaultStyle();
    return [
      {
        id: "s1",
        type: "rect",
        name: "Card",
        x: 64,
        y: 72,
        width: 240,
        height: 160,
        fill: "#e8dcc8",
        stroke: style.stroke,
        strokeWidth: 2,
        visible: true
      },
      {
        id: "s2",
        type: "ellipse",
        name: "Badge",
        x: 400,
        y: 96,
        width: 128,
        height: 128,
        fill: "#d4a574",
        stroke: style.stroke,
        strokeWidth: 2,
        visible: true
      },
      {
        id: "s3",
        type: "polyline",
        name: "Arrow",
        points: [
          { x: 120, y: 320 },
          { x: 200, y: 400 },
          { x: 320, y: 360 },
          { x: 440, y: 440 }
        ],
        fill: "none",
        stroke: "#b4451a",
        strokeWidth: 3,
        visible: true
      },
      {
        id: "s4",
        type: "rect",
        name: "Accent",
        x: 560,
        y: 280,
        width: 96,
        height: 96,
        fill: "#b4451a",
        stroke: "#1a1612",
        strokeWidth: 2,
        visible: true
      }
    ];
  }

  function cloneShapes(shapes) {
    return JSON.parse(JSON.stringify(shapes));
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { shapes: seedShapes(), selection: null };
      var data = JSON.parse(raw);
      if (!data || !Array.isArray(data.shapes)) {
        return { shapes: seedShapes(), selection: null };
      }
      data.shapes.forEach(function (s) {
        var n = parseInt(String(s.id).replace(/\D/g, ""), 10);
        if (!isNaN(n) && n >= uid) uid = n;
      });
      return {
        shapes: data.shapes,
        selection: data.selection || null
      };
    } catch (e) {
      return { shapes: seedShapes(), selection: null };
    }
  }

  function save(shapes, selection) {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ shapes: shapes, selection: selection })
      );
    } catch (e) {
      /* quota or private mode */
    }
  }

  function shapeToSvg(shape) {
    if (!shape.visible) return "";
    var sw = shape.strokeWidth || 2;
    if (shape.type === "rect") {
      return (
        '<rect x="' + shape.x + '" y="' + shape.y + '" width="' + shape.width +
        '" height="' + shape.height + '" fill="' + shape.fill + '" stroke="' +
        shape.stroke + '" stroke-width="' + sw + '"/>'
      );
    }
    if (shape.type === "ellipse") {
      var cx = shape.x + shape.width / 2;
      var cy = shape.y + shape.height / 2;
      var rx = shape.width / 2;
      var ry = shape.height / 2;
      return (
        '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry +
        '" fill="' + shape.fill + '" stroke="' + shape.stroke +
        '" stroke-width="' + sw + '"/>'
      );
    }
    if (shape.type === "polyline" && shape.points.length >= 2) {
      var d = shape.points.map(function (p, i) {
        return (i === 0 ? "M" : "L") + p.x + " " + p.y;
      }).join(" ");
      return (
        '<path d="' + d + '" fill="none" stroke="' + shape.stroke +
        '" stroke-width="' + sw + '" stroke-linecap="round" stroke-linejoin="round"/>'
      );
    }
    return "";
  }

  function exportSvg(shapes) {
    var body = shapes.map(shapeToSvg).join("\n  ");
    return (
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' +
      ARTBOARD_W + " " + ARTBOARD_H + '" width="' + ARTBOARD_W +
      '" height="' + ARTBOARD_H + '">\n' +
      '  <rect width="100%" height="100%" fill="#fffdf8"/>\n  ' +
      body + "\n</svg>"
    );
  }

  function findShape(shapes, id) {
    for (var i = 0; i < shapes.length; i++) {
      if (shapes[i].id === id) return shapes[i];
    }
    return null;
  }

  function findIndex(shapes, id) {
    for (var i = 0; i < shapes.length; i++) {
      if (shapes[i].id === id) return i;
    }
    return -1;
  }

  function hitTest(shapes, x, y) {
    for (var i = shapes.length - 1; i >= 0; i--) {
      var s = shapes[i];
      if (!s.visible) continue;
      if (s.type === "rect" || s.type === "ellipse") {
        if (x >= s.x && x <= s.x + s.width && y >= s.y && y <= s.y + s.height) {
          return s.id;
        }
      } else if (s.type === "polyline") {
        var box = bbox(s);
        var pad = 8;
        if (
          x >= box.x - pad && x <= box.x + box.width + pad &&
          y >= box.y - pad && y <= box.y + box.height + pad
        ) {
          return s.id;
        }
      }
    }
    return null;
  }

  function createRect(x1, y1, x2, y2) {
    var x = snap(Math.min(x1, x2));
    var y = snap(Math.min(y1, y2));
    var w = snap(Math.abs(x2 - x1));
    var h = snap(Math.abs(y2 - y1));
    w = Math.max(SNAP, w);
    h = Math.max(SNAP, h);
    var c = clampToArtboard(x, y, w, h);
    var style = defaultStyle();
    return {
      id: nextId(),
      type: "rect",
      name: "Rectangle",
      x: c.x,
      y: c.y,
      width: c.width,
      height: c.height,
      fill: style.fill,
      stroke: style.stroke,
      strokeWidth: style.strokeWidth,
      visible: true
    };
  }

  function createEllipse(x1, y1, x2, y2) {
    var shape = createRect(x1, y1, x2, y2);
    shape.type = "ellipse";
    shape.name = "Ellipse";
    return shape;
  }

  function createPolyline(points) {
    if (points.length < 2) return null;
    var snapped = points.map(function (p) {
      return { x: snap(p.x), y: snap(p.y) };
    });
    return {
      id: nextId(),
      type: "polyline",
      name: "Path",
      points: snapped,
      fill: "none",
      stroke: "#b4451a",
      strokeWidth: 3,
      visible: true
    };
  }

  global.VectorModel = {
    STORAGE_KEY: STORAGE_KEY,
    SNAP: SNAP,
    ARTBOARD_W: ARTBOARD_W,
    ARTBOARD_H: ARTBOARD_H,
    snap: snap,
    bbox: bbox,
    layerName: layerName,
    load: load,
    save: save,
    cloneShapes: cloneShapes,
    exportSvg: exportSvg,
    findShape: findShape,
    findIndex: findIndex,
    hitTest: hitTest,
    createRect: createRect,
    createEllipse: createEllipse,
    createPolyline: createPolyline,
    clampToArtboard: clampToArtboard
  };
})(window);
