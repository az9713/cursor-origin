(function (global) {
  "use strict";

  var vfs = global.DesktopVFS;

  function iconFor(name, path) {
    if (vfs.isDir(path)) return "📁";
    if (name.endsWith(".sh")) return "⚙";
    if (name.endsWith(".txt")) return "📄";
    return "📄";
  }

  function renderListing(bodyEl, cwd, onOpenFile) {
    var listing = vfs.listDir(cwd);
    if (!listing) {
      bodyEl.innerHTML = '<p class="finder-error">Not a folder.</p>';
      return;
    }

    var html =
      '<div class="finder-toolbar">' +
      '<button type="button" class="finder-up" title="Up"' +
      (cwd === "/" ? " disabled" : "") +
      ">↑ Up</button>" +
      '<span class="finder-path">' +
      cwd +
      "</span></div>" +
      '<ul class="finder-list">';

    if (cwd !== "/") {
      html +=
        '<li class="finder-item" data-action="up">' +
        '<span class="finder-icon">↩</span>' +
        '<span class="finder-name">..</span></li>';
    }

    listing.forEach(function (name) {
      var path = cwd === "/" ? "/" + name : cwd + "/" + name;
      var isDir = vfs.isDir(path);
      html +=
        '<li class="finder-item" data-path="' +
        path +
        '" data-dir="' +
        (isDir ? "1" : "0") +
        '">' +
        '<span class="finder-icon">' +
        iconFor(name, path) +
        "</span>" +
        '<span class="finder-name">' +
        name +
        "</span></li>";
    });

    html += "</ul>";
    html +=
      '<div class="finder-preview" hidden><pre class="finder-file-content"></pre></div>';
    bodyEl.innerHTML = html;

    var upBtn = bodyEl.querySelector(".finder-up");
    var preview = bodyEl.querySelector(".finder-preview");
    var previewPre = bodyEl.querySelector(".finder-file-content");

    function goUp() {
      if (cwd === "/") return;
      var parts = cwd.split("/").filter(Boolean);
      parts.pop();
      renderListing(bodyEl, parts.length ? "/" + parts.join("/") : "/", onOpenFile);
    }

    upBtn.addEventListener("click", goUp);

    bodyEl.querySelectorAll(".finder-item").forEach(function (item) {
      item.addEventListener("dblclick", function () {
        if (item.dataset.action === "up") {
          goUp();
          return;
        }
        var path = item.dataset.path;
        if (item.dataset.dir === "1") {
          renderListing(bodyEl, path, onOpenFile);
          return;
        }
        var content = vfs.readFile(path);
        if (content === null) return;
        preview.hidden = false;
        previewPre.textContent = content;
        if (onOpenFile) onOpenFile(path, content);
      });

      item.addEventListener("click", function () {
        bodyEl.querySelectorAll(".finder-item").forEach(function (el) {
          el.classList.remove("selected");
        });
        item.classList.add("selected");
        if (item.dataset.dir === "0" && item.dataset.path) {
          var content = vfs.readFile(item.dataset.path);
          if (content !== null) {
            preview.hidden = false;
            previewPre.textContent = content;
          }
        } else {
          preview.hidden = true;
        }
      });
    });
  }

  function createFinderWindow(win, bodyEl) {
    bodyEl.className = "app-finder";
    renderListing(bodyEl, "/", null);
    return {
      focus: function () {},
    };
  }

  global.DesktopApps = global.DesktopApps || {};
  global.DesktopApps.finder = {
    id: "finder",
    title: "Finder",
    icon: "📂",
    defaultSize: { width: 480, height: 360 },
    create: createFinderWindow,
  };
})(window);
