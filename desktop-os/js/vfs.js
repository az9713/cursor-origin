(function (global) {
  "use strict";

  var VFS = {
    "/": { type: "dir", children: ["readme.txt", "home", "bin"] },
    "/readme.txt": {
      type: "file",
      content:
        "Welcome to Desktop OS\n\nThis is a demo virtual filesystem shared by Finder and Terminal.\nTry: ls, cat readme.txt, help",
    },
    "/home": { type: "dir", children: ["welcome.txt", "projects"] },
    "/home/welcome.txt": {
      type: "file",
      content: "Hello from /home.\nOpen Finder or use the terminal to explore.",
    },
    "/home/projects": { type: "dir", children: ["roadmap.txt"] },
    "/home/projects/roadmap.txt": {
      type: "file",
      content:
        "Roadmap\n-------\n1. Window manager\n2. Notes persistence\n3. Terminal VFS\n4. Ship demo",
    },
    "/bin": { type: "dir", children: ["hello.sh"] },
    "/bin/hello.sh": {
      type: "file",
      content: "#!/bin/sh\necho 'Hello from a fake script file.'",
    },
  };

  function normalizePath(path) {
    if (!path || path === ".") return "/";
    var parts = path.replace(/\\/g, "/").split("/");
    var stack = [];
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];
      if (!part || part === ".") continue;
      if (part === "..") {
        stack.pop();
        continue;
      }
      stack.push(part);
    }
    return stack.length ? "/" + stack.join("/") : "/";
  }

  function resolve(cwd, input) {
    if (!input) return normalizePath(cwd);
    if (input.charAt(0) === "/") return normalizePath(input);
    var base = cwd === "/" ? "" : cwd;
    return normalizePath(base + "/" + input);
  }

  function getNode(path) {
    return VFS[normalizePath(path)] || null;
  }

  function listDir(path) {
    var node = getNode(path);
    if (!node || node.type !== "dir") return null;
    return node.children.slice().sort();
  }

  function readFile(path) {
    var node = getNode(path);
    if (!node || node.type !== "file") return null;
    return node.content;
  }

  function isDir(path) {
    var node = getNode(path);
    return !!(node && node.type === "dir");
  }

  function isFile(path) {
    var node = getNode(path);
    return !!(node && node.type === "file");
  }

  global.DesktopVFS = {
    normalizePath: normalizePath,
    resolve: resolve,
    getNode: getNode,
    listDir: listDir,
    readFile: readFile,
    isDir: isDir,
    isFile: isFile,
    rootListing: function () {
      return listDir("/");
    },
  };
})(window);
