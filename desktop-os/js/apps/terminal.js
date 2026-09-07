(function (global) {
  "use strict";

  var vfs = global.DesktopVFS;

  function createTerminalWindow(win, bodyEl) {
    bodyEl.className = "app-terminal";
    bodyEl.innerHTML =
      '<div class="term-output" aria-live="polite"></div>' +
      '<form class="term-form">' +
      '<span class="term-prompt">guest@desktop:~$</span>' +
      '<input class="term-input" type="text" spellcheck="false" autocomplete="off" aria-label="Terminal input">' +
      "</form>";

    var output = bodyEl.querySelector(".term-output");
    var form = bodyEl.querySelector(".term-form");
    var input = bodyEl.querySelector(".term-input");
    var cwd = "/";
    var history = [];
    var historyIndex = -1;

    function writeln(text, className) {
      var line = document.createElement("div");
      line.className = "term-line" + (className ? " " + className : "");
      line.textContent = text;
      output.appendChild(line);
      output.scrollTop = output.scrollHeight;
    }

    function printBlock(text) {
      text.split("\n").forEach(function (line) {
        writeln(line);
      });
    }

    function helpText() {
      return [
        "Available commands:",
        "  ls [path]   — list directory",
        "  cat <file>  — print file contents",
        "  cd <path>   — change directory (optional)",
        "  pwd         — print working directory",
        "  clear       — clear screen",
        "  help        — this message",
      ].join("\n");
    }

    function runLs(args) {
      var target = args.length ? vfs.resolve(cwd, args[0]) : cwd;
      var listing = vfs.listDir(target);
      if (listing === null) {
        writeln("ls: cannot access '" + args[0] + "': Not a directory", "term-err");
        return;
      }
      writeln(listing.join("  "));
    }

    function runCat(args) {
      if (!args.length) {
        writeln("cat: missing file operand", "term-err");
        return;
      }
      var path = vfs.resolve(cwd, args[0]);
      var content = vfs.readFile(path);
      if (content === null) {
        writeln("cat: " + args[0] + ": No such file", "term-err");
        return;
      }
      printBlock(content);
    }

    function runCd(args) {
      if (!args.length) {
        cwd = "/";
        return;
      }
      var path = vfs.resolve(cwd, args[0]);
      if (!vfs.isDir(path)) {
        writeln("cd: " + args[0] + ": Not a directory", "term-err");
        return;
      }
      cwd = path;
    }

    function execute(line) {
      var trimmed = line.trim();
      if (!trimmed) return;

      writeln("guest@desktop:" + cwd + "$ " + trimmed, "term-echo");

      var parts = trimmed.split(/\s+/);
      var cmd = parts[0];
      var args = parts.slice(1);

      switch (cmd) {
        case "help":
          printBlock(helpText());
          break;
        case "clear":
          output.innerHTML = "";
          break;
        case "ls":
          runLs(args);
          break;
        case "cat":
          runCat(args);
          break;
        case "cd":
          runCd(args);
          break;
        case "pwd":
          writeln(cwd);
          break;
        default:
          writeln(cmd + ": command not found", "term-err");
      }
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var line = input.value;
      if (line.trim()) {
        history.push(line);
        historyIndex = history.length;
      }
      input.value = "";
      execute(line);
    });

    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (!history.length) return;
        if (historyIndex > 0) historyIndex -= 1;
        input.value = history[historyIndex] || "";
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (!history.length) return;
        if (historyIndex < history.length - 1) {
          historyIndex += 1;
          input.value = history[historyIndex];
        } else {
          historyIndex = history.length;
          input.value = "";
        }
      }
    });

    printBlock("Desktop OS Terminal — type help for commands.");
    writeln("");

    return {
      focus: function () {
        input.focus();
      },
    };
  }

  global.DesktopApps = global.DesktopApps || {};
  global.DesktopApps.terminal = {
    id: "terminal",
    title: "Terminal",
    icon: "⌨",
    defaultSize: { width: 520, height: 340 },
    create: createTerminalWindow,
  };
})(window);
