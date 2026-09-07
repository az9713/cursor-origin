# Shader Studio — frozen spec

Internal spec. Vanilla HTML/CSS/JS, raw WebGL2. No libraries. Persist fragment source to `localStorage` key `shader-studio-v1`.

## Product

Live GLSL fragment editor with fullscreen preview. Lives at `shader-studio/index.html`.

## Editor

- Textarea for fragment shader source (GLSL ES 3.00)
- Debounced recompile on input (~300 ms)
- Fixed vertex shader (fullscreen triangle)
- Compile errors shown in overlay on canvas; cleared on success

## Uniforms

| Uniform | Source |
|---------|--------|
| `u_time` | `performance.now() / 1000` |
| `u_resolution` | canvas width × height (CSS pixels × devicePixelRatio) |
| `u_rust` | slider 0–1 (default 0.55) |
| `u_grain` | slider 0–1 (default 0.35) |

User shaders must declare and use these uniforms.

## Presets

Gallery of 5 author presets with click-to-load thumbnails. Loading a preset replaces editor text and recompiles.

## Persistence

- Save editor text to `shader-studio-v1` on change
- Restore on load; if empty, use default template shader

## Visual

- Dark studio chrome, rust accent (`#c45c2a` family)
- Link to repo hub (`../`)
- Layout: header, left gallery + controls, center canvas, right editor

## Out of scope

- Vertex shader editing, multiple passes, textures, audio reactivity, backend, npm build step
