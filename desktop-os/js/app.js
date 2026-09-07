(function () {
  "use strict";

  var clockEl = document.getElementById("clock");
  var taskbarApps = document.getElementById("taskbar-apps");
  var windowLayer = document.getElementById("window-layer");
  var storage = window.DesktopStorage;
  var wm = window.DesktopWindowManager;

  var appOrder = ["notes", "finder", "terminal"];

  function updateClock() {
    var now = new Date();
    var h = now.getHours();
    var m = now.getMinutes();
    clockEl.textContent =
      (h % 12 || 12) + ":" + (m < 10 ? "0" : "") + m + " " + (h >= 12 ? "PM" : "AM");
  }

  function syncTaskbar() {
    var open = wm.getWindows();
    taskbarApps.innerHTML = "";

    appOrder.forEach(function (appId) {
      var app = window.DesktopApps[appId];
      var instances = open.filter(function (w) {
        return w.appId === appId;
      });
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "taskbar-btn";
      btn.title = app.title;
      btn.innerHTML = '<span class="taskbar-icon">' + app.icon + "</span>";
      if (instances.length) {
        btn.classList.add("running");
        var focused = instances.some(function (w) {
          return w.el.classList.contains("focused");
        });
        var anyMin = instances.every(function (w) {
          return w.minimized;
        });
        if (focused && !anyMin) btn.classList.add("active");
        if (anyMin) btn.classList.add("minimized");
      }
      btn.addEventListener("click", function () {
        if (!instances.length) {
          wm.openApp(appId);
          return;
        }
        var target = instances[instances.length - 1];
        if (!target.minimized && target.el.classList.contains("focused")) {
          wm.minimizeWindow(target.id);
        } else {
          wm.focusWindow(target.id);
        }
      });
      taskbarApps.appendChild(btn);
    });

    open.forEach(function (win) {
      var pill = document.createElement("button");
      pill.type = "button";
      pill.className = "taskbar-window";
      pill.textContent = win.title;
      pill.classList.toggle("minimized", win.minimized);
      pill.classList.toggle("active", win.el.classList.contains("focused"));
      pill.addEventListener("click", function () {
        if (!win.minimized && win.el.classList.contains("focused")) {
          wm.minimizeWindow(win.id);
        } else {
          wm.focusWindow(win.id);
        }
      });
      taskbarApps.appendChild(pill);
    });
  }

  window.DesktopShell = { syncTaskbar: syncTaskbar };

  wm.init({
    container: windowLayer,
    nextZ: storage.load().nextZ,
    onChange: function (windows, nextZ) {
      storage.saveWindows(windows, nextZ);
      syncTaskbar();
    },
  });

  var saved = storage.load();
  if (saved.windows.length) {
    wm.restore(saved.windows);
  } else {
    wm.openApp("notes", { x: 80, y: 56 });
  }

  syncTaskbar();
  updateClock();
  setInterval(updateClock, 10000);

})();
