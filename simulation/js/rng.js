window.SIM = window.SIM || {};

SIM.createRng = function (seed) {
  var s = (seed >>> 0) || 1;
  return {
    next: function () {
      s = (s + 0x6d2b79f5) >>> 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    float: function (min, max) {
      return min + this.next() * (max - min);
    },
    int: function (min, max) {
      return Math.floor(this.next() * (max - min + 1)) + min;
    }
  };
};
