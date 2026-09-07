(function (global) {
  "use strict";

  var windows = [];
  var nextZ = 1;
  var focusedId = null;
  var container = null;
  var onChange = null;

  function uid(appId) {
    return appId + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function persist() {
    if (!onChange) return;
    var snapshot = windows.map(function (w) {
      return {
        id: w.id,
        appId: w.appId,
        title: w.title,
        x: w.x,
        y: w.y,
        width: w.width,
        height: w.height,
        minimized: w.minimized,
        zIndex: w.zIndex,
      };
    });
    onChange(snapshot, nextZ);
  }

  function applyGeometry(el, win) {
    el.style.left = win.x + "px";
    el.style.top = win.y + "px";
    el.style.width = win.width + "px";
    el.style.height = win.height + "px";
    el.style.zIndex = String(win.zIndex);
    el.classList.toggle("minimized", win.minimized);
    el.classList.toggle("focused", win.id === focusedId);
  }

  function focusWindow(id) {
    var win = windows.find(function (w) {
      return w.id === id;
    });
    if (!win) return;
    win.minimized = false;
    nextZ += 1;
    win.zIndex = nextZ;
    focusedId = id;
    windows.forEach(function (w) {
      applyGeometry(w.el, w);
    });
    if (win.controller && win.controller.focus) win.controller.focus();
    persist();
    global.DesktopShell && global.DesktopShell.syncTaskbar();
  }

  function closeWindow(id) {
    var idx = windows.findIndex(function (w) {
      return w.id === id;
    });
    if (idx === -1) return;
    var win = windows[idx];
    win.el.remove();
    windows.splice(idx, 1);
    if (focusedId === id) {
      focusedId = windows.length ? windows[windows.length - 1].id : null;
      if (focusedId) focusWindow(focusedId);
    }
    persist();
    global.DesktopShell && global.DesktopShell.syncTaskbar();
  }

  function minimizeWindow(id) {
    var win = windows.find(function (w) {
      return w.id === id;
    });
    if (!win) return;
    win.minimized = true;
    applyGeometry(win.el, win);
    persist();
    global.DesktopShell && global.DesktopShell.syncTaskbar();
  }

  function buildWindowEl(win, app) {
    var el = document.createElement("div");
    el.className = "window";
    el.dataset.windowId = win.id;
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", win.title);

    el.innerHTML =
      '<div class="window-titlebar">' +
      '<span class="window-title">' +
      app.icon +
      " " +
      win.title +
      "</span>" +
      '<div class="window-controls">' +
      '<button type="button" class="win-btn win-minimize" title="Minimize" aria-label="Minimize">—</button>' +
      '<button type="button" class="win-btn win-close" title="Close" aria-label="Close">×</button>' +
      "</div></div>" +
      '<div class="window-body"></div>' +
      '<div class="window-resize" title="Resize" aria-hidden="true"></div>';

    var bodyEl = el.querySelector(".window-body");
    win.controller = app.create(win, bodyEl);

    el.querySelector(".win-minimize").addEventListener("click", function (e) {
      e.stopPropagation();
      minimizeWindow(win.id);
    });

    el.querySelector(".win-close").addEventListener("click", function (e) {
      e.stopPropagation();
      closeWindow(win.id);
    });

    el.addEventListener("mousedown", function () {
      focusWindow(win.id);
    });

    var titlebar = el.querySelector(".window-titlebar");
    var dragging = false;
    var startX, startY, origX, origY;

    titlebar.addEventListener("mousedown", function (e) {
      if (e.target.closest(".window-controls")) return;
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      origX = win.x;
      origY = win.y;
      e.preventDefault();
    });

    var resizeHandle = el.querySelector(".window-resize");
    var resizing = false;
    var startW, startH;

    resizeHandle.addEventListener("mousedown", function (e) {
      resizing = true;
      startX = e.clientX;
      startY = e.clientY;
      startW = win.width;
      startH = win.height;
      e.preventDefault();
      e.stopPropagation();
    });

    function onMouseMove(e) {
      if (dragging) {
        var maxX = window.innerWidth - 120;
        var maxY = window.innerHeight - varTaskbar() - 80;
        win.x = clamp(origX + (e.clientX - startX), 0, maxX);
        win.y = clamp(origY + (e.clientY - startY), 0, maxY);
        applyGeometry(el, win);
      }
      if (resizing) {
        win.width = clamp(startW + (e.clientX - startX), 280, window.innerWidth - win.x - 8);
        win.height = clamp(
          startH + (e.clientY - startY),
          180,
          window.innerHeight - varTaskbar() - win.y - 8
        );
        applyGeometry(el, win);
      }
    }

    function onMouseUp() {
      if (dragging || resizing) persist();
      dragging = false;
      resizing = false;
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);

    return el;
  }

  function varTaskbar() {
    return parseInt(getComputedStyle(document.documentElement).getPropertyValue("--taskbar-h"), 10) || 48;
  }

  function openApp(appId, opts) {
    var app = global.DesktopApps[appId];
    if (!app) return null;

    opts = opts || {};
    nextZ += 1;

    var win = {
      id: opts.id || uid(appId),
      appId: appId,
      title: opts.title || app.title,
      x: typeof opts.x === "number" ? opts.x : 48 + windows.length * 28,
      y: typeof opts.y === "number" ? opts.y : 40 + windows.length * 24,
      width: opts.width || app.defaultSize.width,
      height: opts.height || app.defaultSize.height,
      minimized: !!opts.minimized,
      zIndex: opts.zIndex || nextZ,
    };

    if (win.zIndex >= nextZ) nextZ = win.zIndex;

    var el = buildWindowEl(win, app);
    win.el = el;
    container.appendChild(el);
    windows.push(win);
    applyGeometry(el, win);
    focusWindow(win.id);
    return win;
  }

  function restore(snapshot) {
    snapshot.forEach(function (item) {
      openApp(item.appId, item);
    });
  }

  function getWindows() {
    return windows.slice();
  }

  function init(opts) {
    container = opts.container;
    onChange = opts.onChange;
    if (typeof opts.nextZ === "number") nextZ = opts.nextZ;
  }

  global.DesktopWindowManager = {
    init: init,
    openApp: openApp,
    restore: restore,
    focusWindow: focusWindow,
    closeWindow: closeWindow,
    minimizeWindow: minimizeWindow,
    getWindows: getWindows,
  };
})(window);
