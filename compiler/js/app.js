(function () {
  const STORAGE_KEY = "compiler-v1";

  const SAMPLE = `let i = 0;
while (i < 5) {
  print i;
  i = i + 1;
}`;

  const sourceEl = document.getElementById("source");
  const highlightEl = document.getElementById("highlight");
  const errorBar = document.getElementById("error-bar");
  const tokensEl = document.getElementById("tokens");
  const astEl = document.getElementById("ast");
  const bytecodeEl = document.getElementById("bytecode");
  const outputEl = document.getElementById("output");
  const btnRun = document.getElementById("run");
  const btnStep = document.getElementById("step");
  const btnReset = document.getElementById("reset");

  let compileResult = null;
  let vmState = null;
  let errorInfo = null;

  function loadSource() {
    const saved = localStorage.getItem(STORAGE_KEY);
    sourceEl.value = saved !== null ? saved : SAMPLE;
  }

  function saveSource() {
    localStorage.setItem(STORAGE_KEY, sourceEl.value);
  }

  function escapeHtml(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function syncHighlight() {
    const text = sourceEl.value;
    highlightEl.innerHTML = escapeHtml(text);
    sourceEl.scrollTop = highlightEl.scrollTop = sourceEl.scrollTop;
    sourceEl.scrollLeft = highlightEl.scrollLeft = sourceEl.scrollLeft;
  }

  function showError(err) {
    errorInfo = err;
    const msg = err.message || String(err);
    const loc =
      err.line != null ? ` (line ${err.line}, col ${err.col})` : "";
    errorBar.textContent = msg + loc;
    sourceEl.classList.add("has-error");

    if (err.line != null) {
      const lines = sourceEl.value.split("\n");
      const lineIdx = err.line - 1;
      if (lineIdx >= 0 && lineIdx < lines.length) {
        const html = lines
          .map((line, i) => {
            const escaped = escapeHtml(line || " ");
            if (i === lineIdx) {
              return `<span class="err-line"><span class="err-squiggle">${escaped}</span></span>`;
            }
            return escaped;
          })
          .join("\n");
        highlightEl.innerHTML = html;
      }
    }
  }

  function clearError() {
    errorInfo = null;
    errorBar.textContent = "";
    sourceEl.classList.remove("has-error");
    syncHighlight();
  }

  function renderTokens(tokens) {
    tokensEl.innerHTML = tokens
      .filter((t) => t.type !== OakLexer.TokenType.EOF)
      .map((t) => {
        let cls = "op";
        if (t.type === OakLexer.TokenType.NUMBER) cls = "num";
        else if (t.type === OakLexer.TokenType.KEYWORD) cls = "kw";
        else if (t.type === OakLexer.TokenType.IDENT) cls = "ident";
        const label = t.type === OakLexer.TokenType.KEYWORD ? t.lexeme : `${t.lexeme}`;
        return `<li class="${cls}" title="${t.type} @ ${t.line}:${t.col}">${escapeHtml(label)}</li>`;
      })
      .join("");
  }

  function renderBytecode(program, currentIp) {
    const rows = OakVM.formatBytecode(program);
    bytecodeEl.innerHTML = `<table class="bytecode-table"><thead><tr><th>#</th><th>Instruction</th></tr></thead><tbody>${rows
      .map(
        (row) =>
          `<tr class="${row.index === currentIp ? "current" : ""}"><td>${row.index}</td><td>${escapeHtml(row.text)}</td></tr>`
      )
      .join("")}</tbody></table>`;
  }

  function renderOutput(state) {
    outputEl.textContent = state ? state.output.join("\n") : "";
  }

  function compileSource() {
    clearPanels();
    clearError();

    try {
      const tokens = OakLexer.lex(sourceEl.value);
      renderTokens(tokens);

      const ast = OakParser.parse(tokens);
      astEl.textContent = OakParser.prettyPrint(ast);

      const program = OakVM.compile(ast);
      compileResult = program;
      renderBytecode(program, vmState ? vmState.ip : -1);
      return { tokens, ast, program };
    } catch (err) {
      showError(err);
      compileResult = null;
      vmState = null;
      btnStep.disabled = true;
      return null;
    }
  }

  function clearPanels() {
    tokensEl.innerHTML = "";
    astEl.textContent = "";
    bytecodeEl.innerHTML = "";
    outputEl.textContent = "";
  }

  function resetVm(program) {
    vmState = OakVM.createState(program);
    renderBytecode(program, vmState.ip);
    renderOutput(vmState);
    btnStep.disabled = false;
  }

  function onRun() {
    saveSource();
    const result = compileSource();
    if (!result) return;

    vmState = OakVM.createState(result.program);
    OakVM.runAll(vmState);
    renderBytecode(result.program, vmState.halted ? -1 : vmState.ip);
    renderOutput(vmState);

    if (vmState.error) {
      showError({ message: vmState.error, line: null, col: null });
    }
    btnStep.disabled = vmState.halted;
  }

  function onStep() {
    saveSource();

    if (!compileResult || !vmState || vmState.halted || vmState.error) {
      const result = compileSource();
      if (!result) return;
      resetVm(result.program);
    }

    OakVM.runStep(vmState);
    renderBytecode(compileResult, vmState.halted ? -1 : vmState.ip);
    renderOutput(vmState);

    if (vmState.error) {
      showError({ message: vmState.error, line: null, col: null });
    }
    btnStep.disabled = vmState.halted || !!vmState.error;
  }

  function onReset() {
    sourceEl.value = SAMPLE;
    saveSource();
    clearError();
    clearPanels();
    compileResult = null;
    vmState = null;
    btnStep.disabled = true;
    syncHighlight();
  }

  sourceEl.addEventListener("input", () => {
    saveSource();
    if (errorInfo) clearError();
    else syncHighlight();
    compileResult = null;
    vmState = null;
    btnStep.disabled = true;
  });

  sourceEl.addEventListener("scroll", () => {
    highlightEl.scrollTop = sourceEl.scrollTop;
    highlightEl.scrollLeft = sourceEl.scrollLeft;
  });

  btnRun.addEventListener("click", onRun);
  btnStep.addEventListener("click", onStep);
  btnReset.addEventListener("click", onReset);

  loadSource();
  syncHighlight();
  btnStep.disabled = true;
})();
