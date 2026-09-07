(function (global) {
  "use strict";

  function createNotesWindow(win, bodyEl) {
    bodyEl.className = "app-notes";
    bodyEl.innerHTML =
      '<textarea class="notes-editor" spellcheck="true" placeholder="Start typing…"></textarea>';
    var editor = bodyEl.querySelector(".notes-editor");
    var data = global.DesktopStorage.load();
    editor.value = data.notes || "";

    editor.addEventListener("input", function () {
      global.DesktopStorage.saveNotes(editor.value);
    });

    return {
      focus: function () {
        editor.focus();
      },
    };
  }

  global.DesktopApps = global.DesktopApps || {};
  global.DesktopApps.notes = {
    id: "notes",
    title: "Notes",
    icon: "📝",
    defaultSize: { width: 420, height: 320 },
    create: createNotesWindow,
  };
})(window);
