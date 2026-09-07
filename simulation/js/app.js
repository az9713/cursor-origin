window.SIM = window.SIM || {};

SIM.STORE = "simulation-v1";

SIM.defaults = {
  speed: 100,
  population: 40,
  fade: 35,
  seed: 42
};

SIM.loadPrefs = function () {
  try {
    var raw = localStorage.getItem(SIM.STORE);
    if (!raw) return Object.assign({}, SIM.defaults);
    return Object.assign({}, SIM.defaults, JSON.parse(raw));
  } catch (e) {
    return Object.assign({}, SIM.defaults);
  }
};

SIM.savePrefs = function (prefs) {
  try {
    localStorage.setItem(
      SIM.STORE,
      JSON.stringify({
        speed: prefs.speed,
        population: prefs.population,
        fade: prefs.fade
      })
    );
  } catch (e) { /* ignore quota */ }
};

SIM.fadeRate = function (fadeSlider) {
  return 0.002 + (fadeSlider / 100) * 0.078;
};

SIM.App = function () {
  this.prefs = SIM.loadPrefs();
  this.canvas = document.getElementById("stage");
  this.ctx = this.canvas.getContext("2d");
  this.chart = new SIM.Chart(document.getElementById("chart"));
  this.paused = false;
  this.accum = 0;
  this.sampleEvery = 8;
  this.sampleCounter = 0;

  this.ui = {
    speed: document.getElementById("speed"),
    population: document.getElementById("population"),
    fade: document.getElementById("fade"),
    seed: document.getElementById("seed"),
    pause: document.getElementById("pause"),
    step: document.getElementById("step"),
    reset: document.getElementById("reset"),
    speedVal: document.getElementById("speed-val"),
    popVal: document.getElementById("pop-val"),
    fadeVal: document.getElementById("fade-val"),
    statAnts: document.getElementById("stat-ants"),
    statFood: document.getElementById("stat-food"),
    statTick: document.getElementById("stat-tick"),
    statActive: document.getElementById("stat-active")
  };

  this.ui.speed.value = this.prefs.speed;
  this.ui.population.value = this.prefs.population;
  this.ui.fade.value = this.prefs.fade;
  this.ui.seed.value = this.prefs.seed;

  this._bind();
  this.resetWorld(parseInt(this.ui.seed.value, 10) || 42);
  this._updateLabels();
  requestAnimationFrame(this.loop.bind(this));
};

SIM.App.prototype._bind = function () {
  var self = this;
  var persist = function () {
    SIM.savePrefs({
      speed: parseInt(self.ui.speed.value, 10),
      population: parseInt(self.ui.population.value, 10),
      fade: parseInt(self.ui.fade.value, 10)
    });
    self._updateLabels();
  };

  this.ui.speed.addEventListener("input", persist);
  this.ui.population.addEventListener("input", function () {
    persist();
    self.world.syncPopulation(parseInt(self.ui.population.value, 10));
  });
  this.ui.fade.addEventListener("input", persist);

  this.ui.pause.addEventListener("click", function () {
    self.paused = !self.paused;
    self.ui.pause.textContent = self.paused ? "Resume" : "Pause";
    self.ui.pause.classList.toggle("active", self.paused);
  });

  this.ui.step.addEventListener("click", function () {
    if (!self.paused) return;
    self.simStep();
    self.world.render(self.ctx);
    self._updateStats();
    self.chart.draw();
  });

  this.ui.reset.addEventListener("click", function () {
    var seed = parseInt(self.ui.seed.value, 10) || 0;
    self.resetWorld(seed);
  });
};

SIM.App.prototype.resetWorld = function (seed) {
  this.world = new SIM.World(seed);
  this.world.ants = [];
  this.world.syncPopulation(parseInt(this.ui.population.value, 10));
  this.chart.clear();
  this.chart.push(0);
  this.sampleCounter = 0;
  this.accum = 0;
  this.world.render(this.ctx);
  this._updateStats();
  this.chart.draw();
};

SIM.App.prototype._updateLabels = function () {
  var speed = parseInt(this.ui.speed.value, 10) / 100;
  this.ui.speedVal.textContent = speed.toFixed(s2(speed)) + "×";
  this.ui.popVal.textContent = this.ui.population.value;
  this.ui.fadeVal.textContent = this.ui.fade.value;
};

function s2(n) {
  return n % 1 === 0 ? 0 : 1;
}

SIM.App.prototype._updateStats = function () {
  var carrying = 0;
  var i;
  if (this.world.ants) {
    for (i = 0; i < this.world.ants.length; i++) {
      if (this.world.ants[i].carrying) carrying++;
    }
  }
  this.ui.statAnts.textContent = this.world.ants ? this.world.ants.length : 0;
  this.ui.statFood.textContent = this.world.foodCollected;
  this.ui.statTick.textContent = this.world.tick;
  this.ui.statActive.textContent = carrying;
};

SIM.App.prototype.simStep = function () {
  var fade = SIM.fadeRate(parseInt(this.ui.fade.value, 10));
  this.world.fadeTrails(fade);
  this.world.stepAnts();
  this.world.tick++;

  this.sampleCounter++;
  if (this.sampleCounter >= this.sampleEvery) {
    this.sampleCounter = 0;
    this.chart.push(this.world.foodCollected);
  }
};

SIM.App.prototype.loop = function (ts) {
  if (!this.lastTs) this.lastTs = ts;
  var dt = Math.min(50, ts - this.lastTs);
  this.lastTs = ts;

  if (!this.paused) {
    var rate = parseInt(this.ui.speed.value, 10) / 100;
    this.accum += dt * rate * 0.06;
    while (this.accum >= 1) {
      this.simStep();
      this.accum -= 1;
    }
    this.world.render(this.ctx);
    this._updateStats();
    this.chart.draw();
  }

  requestAnimationFrame(this.loop.bind(this));
};

document.addEventListener("DOMContentLoaded", function () {
  new SIM.App();
});
