window.ML = window.ML || {};
ML.loadBoardStore = function () {
  try {
    var raw = localStorage.getItem("mini-linear-v1");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
};
ML.saveBoardStore = function (state) {
  localStorage.setItem("mini-linear-v1", JSON.stringify(state));
};
