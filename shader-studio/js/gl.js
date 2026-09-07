(function () {
  "use strict";

  var VERTEX_SRC =
    "#version 300 es\n" +
    "in vec2 a_position;\n" +
    "void main() {\n" +
    "  gl_Position = vec4(a_position, 0.0, 1.0);\n" +
    "}\n";

  function ShaderGL(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: true
    });
    if (!this.gl) {
      throw new Error("WebGL2 is not available in this browser.");
    }

    this.program = null;
    this.uniforms = {};
    this.rafId = 0;
    this.running = false;
    this.onError = null;
    this.values = {
      time: 0,
      resolution: [1, 1],
      rust: 0.55,
      grain: 0.35
    };

    this._initGeometry();
    this._resize();
  }

  ShaderGL.prototype._initGeometry = function () {
    var gl = this.gl;
    var buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW
    );
    this.buffer = buffer;
  };

  ShaderGL.prototype._resize = function () {
    var dpr = window.devicePixelRatio || 1;
    var rect = this.canvas.getBoundingClientRect();
    var w = Math.max(1, Math.floor(rect.width * dpr));
    var h = Math.max(1, Math.floor(rect.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.values.resolution = [w, h];
    this.gl.viewport(0, 0, w, h);
  };

  ShaderGL.prototype.compile = function (fragmentSource) {
    var gl = this.gl;
    var error = null;

    if (this.program) {
      gl.deleteProgram(this.program);
      this.program = null;
      this.uniforms = {};
    }

    var vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, VERTEX_SRC);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
      error = "Vertex shader: " + gl.getShaderInfoLog(vs);
      gl.deleteShader(vs);
      return error;
    }

    var fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, fragmentSource);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      error = gl.getShaderInfoLog(fs) || "Fragment shader compile failed.";
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      return error;
    }

    var program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      error = gl.getProgramInfoLog(program) || "Program link failed.";
      gl.deleteProgram(program);
      return error;
    }

    this.program = program;
    this.uniforms = {
      time: gl.getUniformLocation(program, "u_time"),
      resolution: gl.getUniformLocation(program, "u_resolution"),
      rust: gl.getUniformLocation(program, "u_rust"),
      grain: gl.getUniformLocation(program, "u_grain")
    };

    var posLoc = gl.getAttribLocation(program, "a_position");
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    return null;
  };

  ShaderGL.prototype.setUniforms = function (values) {
    if (values.time !== undefined) this.values.time = values.time;
    if (values.rust !== undefined) this.values.rust = values.rust;
    if (values.grain !== undefined) this.values.grain = values.grain;
    if (values.resolution) this.values.resolution = values.resolution.slice();
  };

  ShaderGL.prototype._draw = function () {
    var gl = this.gl;
    if (!this.program) return;

    gl.useProgram(this.program);
    if (this.uniforms.time) gl.uniform1f(this.uniforms.time, this.values.time);
    if (this.uniforms.resolution) {
      gl.uniform2f(
        this.uniforms.resolution,
        this.values.resolution[0],
        this.values.resolution[1]
      );
    }
    if (this.uniforms.rust) gl.uniform1f(this.uniforms.rust, this.values.rust);
    if (this.uniforms.grain) gl.uniform1f(this.uniforms.grain, this.values.grain);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  ShaderGL.prototype.renderOnce = function (options) {
    this._resize();
    if (options) {
      this.setUniforms(options);
    }
    this._draw();
  };

  ShaderGL.prototype.start = function () {
    var self = this;
    if (self.running) return;
    self.running = true;

    function frame(now) {
      if (!self.running) return;
      self.rafId = requestAnimationFrame(frame);
      self._resize();
      self.values.time = now / 1000;
      self._draw();
    }

    self.rafId = requestAnimationFrame(frame);
  };

  ShaderGL.prototype.stop = function () {
    this.running = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  };

  ShaderGL.prototype.dispose = function () {
    this.stop();
    var gl = this.gl;
    if (this.program) gl.deleteProgram(this.program);
    if (this.buffer) gl.deleteBuffer(this.buffer);
    this.program = null;
  };

  window.ShaderGL = ShaderGL;
})();
