(function () {
  "use strict";

  var DEFAULT_SHADER =
    "#version 300 es\n" +
    "precision highp float;\n\n" +
    "uniform float u_time;\n" +
    "uniform vec2 u_resolution;\n" +
    "uniform float u_rust;\n" +
    "uniform float u_grain;\n\n" +
    "out vec4 fragColor;\n\n" +
    "float hash(vec2 p) {\n" +
    "  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);\n" +
    "}\n\n" +
    "void main() {\n" +
    "  vec2 uv = gl_FragCoord.xy / u_resolution;\n" +
    "  vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);\n\n" +
    "  float t = u_time * 0.4;\n" +
    "  float wave = sin(p.x * 6.0 + t) * sin(p.y * 5.0 - t * 0.7);\n" +
    "  float glow = 0.5 + 0.5 * wave;\n\n" +
    "  vec3 rust = vec3(0.77, 0.36, 0.16);\n" +
    "  vec3 deep = vec3(0.06, 0.05, 0.04);\n" +
    "  vec3 col = mix(deep, rust, glow * u_rust + 0.15);\n" +
    "  col += (hash(uv * u_resolution + u_time) - 0.5) * u_grain * 0.25;\n\n" +
    "  fragColor = vec4(col, 1.0);\n" +
    "}\n";

  var PRESETS = [
    {
      id: "plasma",
      name: "Plasma",
      source:
        "#version 300 es\n" +
        "precision highp float;\n\n" +
        "uniform float u_time;\n" +
        "uniform vec2 u_resolution;\n" +
        "uniform float u_rust;\n" +
        "uniform float u_grain;\n\n" +
        "out vec4 fragColor;\n\n" +
        "float hash(vec2 p) {\n" +
        "  return fract(sin(dot(p, vec2(41.0, 289.0))) * 45758.5453);\n" +
        "}\n\n" +
        "void main() {\n" +
        "  vec2 uv = gl_FragCoord.xy / u_resolution;\n" +
        "  float t = u_time * 0.8;\n" +
        "  float v = sin(uv.x * 10.0 + t);\n" +
        "  v += sin(uv.y * 12.0 + t * 1.3);\n" +
        "  v += sin((uv.x + uv.y) * 8.0 + t * 0.7);\n" +
        "  v += sin(length(uv - 0.5) * 16.0 - t * 2.0);\n" +
        "  v *= 0.25;\n" +
        "  vec3 cool = vec3(0.08, 0.12, 0.18);\n" +
        "  vec3 hot = vec3(0.95, 0.45, 0.18);\n" +
        "  vec3 col = mix(cool, hot, 0.5 + 0.5 * sin(v * 3.14159));\n" +
        "  col = mix(col, vec3(0.77, 0.36, 0.16), u_rust * 0.6);\n" +
        "  col += (hash(gl_FragCoord.xy + u_time) - 0.5) * u_grain * 0.2;\n" +
        "  fragColor = vec4(col, 1.0);\n" +
        "}\n"
    },
    {
      id: "rust-noise",
      name: "Rust Noise",
      source:
        "#version 300 es\n" +
        "precision highp float;\n\n" +
        "uniform float u_time;\n" +
        "uniform vec2 u_resolution;\n" +
        "uniform float u_rust;\n" +
        "uniform float u_grain;\n\n" +
        "out vec4 fragColor;\n\n" +
        "float hash(vec2 p) {\n" +
        "  p = fract(p * vec2(123.34, 456.21));\n" +
        "  p += dot(p, p + 45.32);\n" +
        "  return fract(p.x * p.y);\n" +
        "}\n\n" +
        "float noise(vec2 p) {\n" +
        "  vec2 i = floor(p);\n" +
        "  vec2 f = fract(p);\n" +
        "  float a = hash(i);\n" +
        "  float b = hash(i + vec2(1.0, 0.0));\n" +
        "  float c = hash(i + vec2(0.0, 1.0));\n" +
        "  float d = hash(i + vec2(1.0, 1.0));\n" +
        "  vec2 u = f * f * (3.0 - 2.0 * f);\n" +
        "  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;\n" +
        "}\n\n" +
        "float fbm(vec2 p) {\n" +
        "  float v = 0.0;\n" +
        "  float a = 0.5;\n" +
        "  for (int i = 0; i < 5; i++) {\n" +
        "    v += a * noise(p);\n" +
        "    p *= 2.1;\n" +
        "    a *= 0.5;\n" +
        "  }\n" +
        "  return v;\n" +
        "}\n\n" +
        "void main() {\n" +
        "  vec2 uv = gl_FragCoord.xy / u_resolution;\n" +
        "  vec2 p = uv * 3.5 + vec2(u_time * 0.05, u_time * 0.03);\n" +
        "  float n = fbm(p);\n" +
        "  float edge = smoothstep(0.35, 0.75, n + u_rust * 0.3);\n" +
        "  vec3 iron = vec3(0.12, 0.11, 0.10);\n" +
        "  vec3 rust = vec3(0.72, 0.32, 0.14);\n" +
        "  vec3 patina = vec3(0.25, 0.20, 0.14);\n" +
        "  vec3 col = mix(iron, patina, n);\n" +
        "  col = mix(col, rust, edge * u_rust);\n" +
        "  col += (hash(gl_FragCoord.xy * 1.7) - 0.5) * u_grain * 0.35;\n" +
        "  fragColor = vec4(col, 1.0);\n" +
        "}\n"
    },
    {
      id: "voronoi",
      name: "Voronoi",
      source:
        "#version 300 es\n" +
        "precision highp float;\n\n" +
        "uniform float u_time;\n" +
        "uniform vec2 u_resolution;\n" +
        "uniform float u_rust;\n" +
        "uniform float u_grain;\n\n" +
        "out vec4 fragColor;\n\n" +
        "vec2 hash2(vec2 p) {\n" +
        "  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));\n" +
        "  return fract(sin(p) * 43758.5453);\n" +
        "}\n\n" +
        "void main() {\n" +
        "  vec2 uv = gl_FragCoord.xy / u_resolution;\n" +
        "  vec2 st = uv * 8.0;\n" +
        "  vec2 i = floor(st);\n" +
        "  vec2 f = fract(st);\n" +
        "  float md = 1.0;\n" +
        "  vec2 mr = vec2(0.0);\n" +
        "  for (int y = -1; y <= 1; y++) {\n" +
        "    for (int x = -1; x <= 1; x++) {\n" +
        "      vec2 g = vec2(float(x), float(y));\n" +
        "      vec2 o = hash2(i + g);\n" +
        "      o = 0.5 + 0.5 * sin(u_time * 0.5 + 6.2831 * o);\n" +
        "      vec2 r = g + o - f;\n" +
        "      float d = dot(r, r);\n" +
        "      if (d < md) {\n" +
        "        md = d;\n" +
        "        mr = r;\n" +
        "      }\n" +
        "    }\n" +
        "  }\n" +
        "  float edge = md;\n" +
        "  float border = smoothstep(0.0, 0.08, edge);\n" +
        "  vec3 bg = vec3(0.05, 0.04, 0.03);\n" +
        "  vec3 cell = vec3(0.18, 0.16, 0.14);\n" +
        "  vec3 accent = vec3(0.85, 0.40, 0.18);\n" +
        "  vec3 col = mix(bg, cell, border);\n" +
        "  col = mix(col, accent, (1.0 - border) * u_rust);\n" +
        "  col += length(mr) * 0.15 * u_rust;\n" +
        "  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * u_grain * 0.2;\n" +
        "  fragColor = vec4(col, 1.0);\n" +
        "}\n"
    },
    {
      id: "ripple",
      name: "Ripple",
      source:
        "#version 300 es\n" +
        "precision highp float;\n\n" +
        "uniform float u_time;\n" +
        "uniform vec2 u_resolution;\n" +
        "uniform float u_rust;\n" +
        "uniform float u_grain;\n\n" +
        "out vec4 fragColor;\n\n" +
        "void main() {\n" +
        "  vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);\n" +
        "  float t = u_time;\n" +
        "  float d = length(p);\n" +
        "  float rings = sin(d * 28.0 - t * 4.0) * 0.5 + 0.5;\n" +
        "  rings *= exp(-d * 1.8);\n" +
        "  float pulse = sin(t * 0.8) * 0.5 + 0.5;\n" +
        "  vec3 dark = vec3(0.04, 0.04, 0.05);\n" +
        "  vec3 ember = vec3(0.90, 0.42, 0.16);\n" +
        "  vec3 col = mix(dark, ember, rings * (0.4 + 0.6 * u_rust));\n" +
        "  col += pulse * 0.05 * ember;\n" +
        "  col += (fract(sin(dot(p * 400.0, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * u_grain * 0.15;\n" +
        "  fragColor = vec4(col, 1.0);\n" +
        "}\n"
    },
    {
      id: "gradient-ray",
      name: "Gradient Ray",
      source:
        "#version 300 es\n" +
        "precision highp float;\n\n" +
        "uniform float u_time;\n" +
        "uniform vec2 u_resolution;\n" +
        "uniform float u_rust;\n" +
        "uniform float u_grain;\n\n" +
        "out vec4 fragColor;\n\n" +
        "void main() {\n" +
        "  vec2 uv = gl_FragCoord.xy / u_resolution;\n" +
        "  vec2 p = (uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0);\n" +
        "  float angle = atan(p.y, p.x) + u_time * 0.3;\n" +
        "  float beam = 0.5 + 0.5 * cos(angle * 5.0);\n" +
        "  float radial = 1.0 - smoothstep(0.0, 0.85, length(p));\n" +
        "  float v = beam * radial;\n" +
        "  vec3 voidCol = vec3(0.03, 0.03, 0.04);\n" +
        "  vec3 copper = vec3(0.82, 0.38, 0.15);\n" +
        "  vec3 gold = vec3(0.95, 0.62, 0.22);\n" +
        "  vec3 col = mix(voidCol, copper, v * u_rust);\n" +
        "  col = mix(col, gold, pow(v, 3.0) * 0.5);\n" +
        "  col += (fract(sin(dot(gl_FragCoord.xy, vec2(41.0, 289.0))) * 43758.5453) - 0.5) * u_grain * 0.18;\n" +
        "  fragColor = vec4(col, 1.0);\n" +
        "}\n"
    }
  ];

  window.ShaderPresets = {
    STORAGE_KEY: "shader-studio-v1",
    DEFAULT_SHADER: DEFAULT_SHADER,
    PRESETS: PRESETS,
    getById: function (id) {
      for (var i = 0; i < PRESETS.length; i++) {
        if (PRESETS[i].id === id) return PRESETS[i];
      }
      return null;
    }
  };
})();
