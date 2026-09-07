(function () {
  "use strict";

  var STORAGE_KEY = "page-clone-v1";
  var selectedEl = null;
  var originalMap = new Map();

  var panel = document.getElementById("inspector-panel");
  var tagEl = document.getElementById("inspector-tag");
  var textEl = document.getElementById("inspector-text");
  var colorEl = document.getElementById("inspector-color");
  var emptyEl = document.getElementById("inspector-empty");
  var fieldsEl = document.getElementById("inspector-fields");
  var applyBtn = document.getElementById("inspector-apply");
  var resetBtn = document.getElementById("inspector-reset");

  function isChrome(el) {
    return el.closest("[data-inspector-chrome]") !== null;
  }

  function getDomPath(el) {
    var path = [];
    var node = el;
    while (node && node !== document.body) {
      var index = 0;
      var sibling = node.previousElementSibling;
      while (sibling) {
        if (sibling.tagName === node.tagName) index++;
        sibling = sibling.previousElementSibling;
      }
      path.unshift(node.tagName.toLowerCase() + ":" + index);
      node = node.parentElement;
    }
    return path.join(">");
  }

  function findByPath(path) {
    var parts = path.split(">");
    var node = document.body;
    for (var i = 0; i < parts.length; i++) {
      var match = parts[i].match(/^([a-z0-9]+):(\d+)$/);
      if (!match) return null;
      var tag = match[1];
      var idx = parseInt(match[2], 10);
      var count = -1;
      var found = null;
      for (var c = 0; c < node.children.length; c++) {
        var child = node.children[c];
        if (child.tagName.toLowerCase() === tag) {
          count++;
          if (count === idx) {
            found = child;
            break;
          }
        }
      }
      if (!found) return null;
      node = found;
    }
    return node;
  }

  function captureOriginal(el) {
    var path = getDomPath(el);
    if (!originalMap.has(path)) {
      originalMap.set(path, {
        text: getTextContent(el),
        color: getComputedStyle(el).color,
      });
    }
  }

  function getTextContent(el) {
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
      return el.value;
    }
    return el.textContent;
  }

  function setTextContent(el, text) {
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
      el.value = text;
    } else {
      el.textContent = text;
    }
  }

  function loadOverrides() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      var data = JSON.parse(raw);
      return data.overrides || {};
    } catch (e) {
      return {};
    }
  }

  function saveOverrides(overrides) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ overrides: overrides }));
  }

  function applyOverride(el, override) {
    if (!el || !override) return;
    captureOriginal(el);
    if (override.text !== undefined) {
      setTextContent(el, override.text);
    }
    if (override.color) {
      el.style.color = override.color;
    }
  }

  function restoreOverrides() {
    var overrides = loadOverrides();
    Object.keys(overrides).forEach(function (path) {
      var el = findByPath(path);
      if (el) captureOriginal(el);
    });
    Object.keys(overrides).forEach(function (path) {
      var el = findByPath(path);
      if (!el) return;
      if (overrides[path].text !== undefined) setTextContent(el, overrides[path].text);
      if (overrides[path].color) el.style.color = overrides[path].color;
    });
  }

  function clearSelection() {
    if (selectedEl) {
      selectedEl.removeAttribute("data-inspect-selected");
      selectedEl = null;
    }
    tagEl.hidden = true;
    fieldsEl.hidden = true;
    emptyEl.hidden = false;
    textEl.value = "";
    colorEl.value = "#000000";
  }

  function selectElement(el) {
    if (!el || el === document.body || el === document.documentElement) return;
    if (isChrome(el)) return;

    if (selectedEl) {
      selectedEl.removeAttribute("data-inspect-selected");
    }

    selectedEl = el;
    captureOriginal(el);
    el.setAttribute("data-inspect-selected", "");

    var path = getDomPath(el);
    tagEl.textContent = "<" + el.tagName.toLowerCase() + ">  " + path;
    tagEl.hidden = false;
    emptyEl.hidden = true;
    fieldsEl.hidden = false;

    textEl.value = getTextContent(el);

    var rgb = getComputedStyle(el).color;
    colorEl.value = rgbToHex(rgb);
  }

  function rgbToHex(rgb) {
    var m = rgb.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!m) return "#000000";
    return (
      "#" +
      [m[1], m[2], m[3]]
        .map(function (x) {
          var h = parseInt(x, 10).toString(16);
          return h.length === 1 ? "0" + h : h;
        })
        .join("")
    );
  }

  function commitOverride() {
    if (!selectedEl) return;
    var path = getDomPath(selectedEl);
    var overrides = loadOverrides();
    overrides[path] = {
      text: textEl.value,
      color: colorEl.value,
    };
    applyOverride(selectedEl, overrides[path]);
    saveOverrides(overrides);
  }

  function resetAll() {
    var overrides = loadOverrides();
    var paths = new Set(Object.keys(overrides));
    originalMap.forEach(function (_, path) {
      paths.add(path);
    });

    paths.forEach(function (path) {
      var el = findByPath(path);
      var orig = originalMap.get(path);
      if (!el) return;
      if (orig) {
        setTextContent(el, orig.text);
      }
      el.style.color = "";
    });

    originalMap.clear();
    localStorage.removeItem(STORAGE_KEY);
    clearSelection();
  }

  document.addEventListener(
    "click",
    function (e) {
      if (isChrome(e.target)) return;
      selectElement(e.target);
    },
    true
  );

  applyBtn.addEventListener("click", commitOverride);
  textEl.addEventListener("input", commitOverride);
  colorEl.addEventListener("input", commitOverride);

  resetBtn.addEventListener("click", function () {
    if (confirm("Reset all inspector overrides?")) {
      resetAll();
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") clearSelection();
  });

  restoreOverrides();
})();
