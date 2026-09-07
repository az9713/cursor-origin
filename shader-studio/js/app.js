(function () {
  "use strict";

  var STORAGE_KEY = window.ShaderPresets.STORAGE_KEY;
  var PRESETS = window.ShaderPresets.PRESETS;
  var DEFAULT_SHADER = window.ShaderPresets.DEFAULT_SHADER;

  var previewCanvas = document.getElementById("preview");
  var fragmentEl = document.getElementById("fragment");
  var galleryEl = document.getElementById("gallery");
  var errorOverlay = document.getElementById("error-overlay");
  var errorText = document.getElementById("error-text");
  var statusDot = document.getElementById("status-dot");
  var statusLabel = document.getElementById("status-label");
  var rustSlider = document.getElementById("rust");
  var grainSlider = document.getElementById("grain");
  var rustOut = document.getElementById("rust-val");
  var grainOut = document.getElementById("grain-val");
  var resetBtn = document.getElementById("reset-shader");

  var runtime = new window.ShaderGL(previewCanvas);
  var compileTimer = 0;
  var activePresetId = null;

  function loadSource() {
    var saved = localStorage.getItem(STORAGE_KEY);
    fragmentEl.value = saved !== null ? saved : DEFAULT_SHADER;
  }

  function saveSource() {
    localStorage.setItem(STORAGE_KEY, fragmentEl.value);
  }

  function setStatus(ok, label) {
    statusDot.className = "status-dot " + (ok ? "ok" : "err");
    statusLabel.textContent = label;
  }

  function showError(message) {
    errorText.textContent = message;
    errorOverlay.classList.add("visible");
    setStatus(false, "Compile error");
  }

  function hideError() {
    errorOverlay.classList.remove("visible");
    errorText.textContent = "";
    setStatus(true, "Running");
  }

  function getSliderValues() {
    return {
      rust: parseFloat(rustSlider.value),
      grain: parseFloat(grainSlider.value)
    };
  }

  function syncSliderLabels() {
    rustOut.textContent = parseFloat(rustSlider.value).toFixed(2);
    grainOut.textContent = parseFloat(grainSlider.value).toFixed(2);
  }

  function applyUniforms() {
    var vals = getSliderValues();
    runtime.setUniforms({ rust: vals.rust, grain: vals.grain });
    syncSliderLabels();
  }

  function compileAndRun() {
    var err = runtime.compile(fragmentEl.value);
    if (err) {
      runtime.stop();
      showError(err);
      return false;
    }
    hideError();
    applyUniforms();
    runtime.start();
    return true;
  }

  function scheduleCompile() {
    clearTimeout(compileTimer);
    compileTimer = setTimeout(function () {
      saveSource();
      compileAndRun();
      refreshThumbnails();
    }, 300);
  }

  function setActivePreset(id) {
    activePresetId = id;
    var buttons = galleryEl.querySelectorAll(".preset-btn");
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].classList.toggle("active", buttons[i].dataset.id === id);
    }
  }

  function loadPreset(preset) {
    fragmentEl.value = preset.source;
    saveSource();
    setActivePreset(preset.id);
    compileAndRun();
    refreshThumbnails();
  }

  function renderThumbnail(canvas, source, time) {
    try {
      var thumb = new window.ShaderGL(canvas);
      var err = thumb.compile(source);
      if (err) {
        thumb.dispose();
        return;
      }
      thumb.setUniforms({
        time: time,
        rust: parseFloat(rustSlider.value),
        grain: parseFloat(grainSlider.value)
      });
      thumb.renderOnce();
      thumb.dispose();
    } catch (e) {
      /* ignore thumbnail failures */
    }
  }

  function refreshThumbnails() {
    var time = performance.now() / 1000;
    var canvases = galleryEl.querySelectorAll(".preset-btn canvas");
    for (var i = 0; i < canvases.length; i++) {
      var btn = canvases[i].closest(".preset-btn");
      var preset = window.ShaderPresets.getById(btn.dataset.id);
      if (preset) {
        renderThumbnail(canvases[i], preset.source, time + i * 0.4);
      }
    }
  }

  function buildGallery() {
    galleryEl.innerHTML = "";
    for (var i = 0; i < PRESETS.length; i++) {
      (function (preset) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "preset-btn";
        btn.dataset.id = preset.id;
        btn.title = "Load " + preset.name;

        var canvas = document.createElement("canvas");
        canvas.width = 160;
        canvas.height = 100;

        var label = document.createElement("span");
        label.textContent = preset.name;

        btn.appendChild(canvas);
        btn.appendChild(label);
        btn.addEventListener("click", function () {
          loadPreset(preset);
        });

        galleryEl.appendChild(btn);
      })(PRESETS[i]);
    }
  }

  function onResize() {
    runtime._resize();
    refreshThumbnails();
  }

  function init() {
    loadSource();
    syncSliderLabels();
    buildGallery();

    rustSlider.addEventListener("input", function () {
      applyUniforms();
      syncSliderLabels();
      refreshThumbnails();
    });
    grainSlider.addEventListener("input", function () {
      applyUniforms();
      syncSliderLabels();
      refreshThumbnails();
    });

    fragmentEl.addEventListener("input", scheduleCompile);

    fragmentEl.addEventListener("keydown", function (evt) {
      if (evt.key === "Tab") {
        evt.preventDefault();
        var start = fragmentEl.selectionStart;
        var end = fragmentEl.selectionEnd;
        fragmentEl.value =
          fragmentEl.value.substring(0, start) + "  " + fragmentEl.value.substring(end);
        fragmentEl.selectionStart = fragmentEl.selectionEnd = start + 2;
        scheduleCompile();
      }
    });

    resetBtn.addEventListener("click", function () {
      fragmentEl.value = DEFAULT_SHADER;
      setActivePreset(null);
      scheduleCompile();
    });

    window.addEventListener("resize", onResize);

    if (compileAndRun()) {
      refreshThumbnails();
    }

    setInterval(refreshThumbnails, 4000);
  }

  init();
})();
