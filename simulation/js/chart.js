window.SIM = window.SIM || {};

SIM.Chart = function (canvas, maxSamples) {
  this.canvas = canvas;
  this.ctx = canvas.getContext("2d");
  this.max = maxSamples || 120;
  this.samples = [];
};

SIM.Chart.prototype.push = function (value) {
  this.samples.push(value);
  if (this.samples.length > this.max) this.samples.shift();
};

SIM.Chart.prototype.clear = function () {
  this.samples = [];
};

SIM.Chart.prototype.draw = function () {
  var ctx = this.ctx;
  var w = this.canvas.width;
  var h = this.canvas.height;
  var pad = { t: 6, r: 6, b: 14, l: 28 };
  var innerW = w - pad.l - pad.r;
  var innerH = h - pad.t - pad.b;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);

  if (this.samples.length < 2) {
    ctx.fillStyle = "#5c564c";
    ctx.font = "10px IBM Plex Mono, monospace";
    ctx.fillText("Food over time", pad.l, h - 4);
    return;
  }

  var maxV = 1;
  var i;
  for (i = 0; i < this.samples.length; i++) {
    if (this.samples[i] > maxV) maxV = this.samples[i];
  }

  ctx.strokeStyle = "#cfc6b6";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.l, pad.t);
  ctx.lineTo(pad.l, pad.t + innerH);
  ctx.lineTo(pad.l + innerW, pad.t + innerH);
  ctx.stroke();

  ctx.fillStyle = "rgba(180, 69, 26, 0.75)";
  var barW = innerW / this.max;
  for (i = 0; i < this.samples.length; i++) {
    var v = this.samples[i];
    var bh = (v / maxV) * innerH;
    var x = pad.l + i * barW;
    ctx.fillRect(x, pad.t + innerH - bh, Math.max(1, barW - 0.5), bh);
  }

  ctx.fillStyle = "#5c564c";
  ctx.font = "9px IBM Plex Mono, monospace";
  ctx.fillText(String(maxV), 2, pad.t + 8);
  ctx.fillText("0", 8, pad.t + innerH);
  ctx.fillText("food", pad.l, h - 2);
};
