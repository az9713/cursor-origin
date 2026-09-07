window.ML = window.ML || {};
ML.STORE_KEY = "mini-linear-v1";
ML.loadListStore = function () {
  try {
    var raw = localStorage.getItem(ML.STORE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
};
ML.saveListStore = function (state) {
  localStorage.setItem(ML.STORE_KEY, JSON.stringify(state));
};
