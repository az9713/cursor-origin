window.ML = window.ML || {};
ML.renderBoard = function (main, f) {
  var issues = ML.filterIssuesBoard(ML.state.issues, f);
  var board = document.createElement("div");
  board.className = "ml-board";
  main.appendChild(board);
  if (!issues.length) {
    board.innerHTML = '<div class="ml-empty">No issues match these filters.</div>';
    return;
  }
  ML.mountColumn_backlog(board, issues);
  ML.mountColumn_todo(board, issues);
  ML.mountColumn_in_progress(board, issues);
  ML.mountColumn_done(board, issues);
};
