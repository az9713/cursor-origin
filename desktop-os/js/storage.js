(function (global) {
  "use strict";

  var KEY = "desktop-os-v1";

  var defaults = {
    notes: "",
    windows: [],
    nextZ: 1,
  };

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return clone(defaults);
      var data = JSON.parse(raw);
      return {
        notes: typeof data.notes === "string" ? data.notes : defaults.notes,
        windows: Array.isArray(data.windows) ? data.windows : [],
        nextZ: typeof data.nextZ === "number" ? data.nextZ : 1,
      };
    } catch (e) {
      return clone(defaults);
    }
  }

  function save(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  global.DesktopStorage = {
    KEY: KEY,
    load: load,
    save: save,
    saveNotes: function (text) {
      var data = load();
      data.notes = text;
      save(data);
    },
    saveWindows: function (windows, nextZ) {
      var data = load();
      data.windows = windows;
      if (typeof nextZ === "number") data.nextZ = nextZ;
      save(data);
    },
  };
})(window);
