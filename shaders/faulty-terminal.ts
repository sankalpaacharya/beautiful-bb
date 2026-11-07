// Faulty Terminal effect, after React Bits' Faulty Terminal background with its
// default props and the "blocks" glyphs. Pass one evaluates the drifting noise
// once per glyph cell into two small ping-pong textures, keeping each ring of
// the glyph lit for a moment after it turns off (persistence). Pass two draws
// the glyphs, their halo and bloom, the rolling scanline band, and the
// horizontal glitch, then turns the light into the wallpaper color's alpha.
import {
  LAYOUT_GLSL,
  deviceSize,
  setLayoutUniforms,
  type EffectColors,
  type EffectFactory,
  type EffectLayout,
} from "./types";

/** Glyph cell size in CSS pixels at scale 1. */
const CELL_W = 34;
const CELL_H = 38;
/** React Bits runs at 0.3; half speed keeps the wallpaper calm. */
const TIME_SCALE = 0.15;
/** React Bits' decay time for persistence 0.5, in seconds. */
const PERSISTENCE_SECONDS = 0.08 + 0.5 * 1.4;
/** Caps the drawing buffer; the glyphs are soft enough to upscale. */
const MAX_PIXELS = 2_000_000;
/** UV range the barrel distortion samples (curvature 0.2), plus room for the glitch. */
const UV_MIN = -0.25;
const UV_MAX = 1.25;

const VERTEX = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const CELL_FRAGMENT = `#version 300 es
precision highp float;
precision highp int;

uniform float iTime;
uniform ivec2 uOrigin;
uniform sampler2D uPrev0;
uniform sampler2D uPrev1;
uniform float uDecay;
uniform float uFresh;

layout(location = 0) out vec4 outRings;
layout(location = 1) out vec4 outExtra;

float time;

float noise(vec2 p) {
  return sin(p.x * 10.0) * sin(p.y * (3.0 + sin(time * 0.090909))) + 0.2;
}

mat2 rotate(float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return mat2(c, -s, s, c);
}

float fbm(vec2 p) {
  p *= 1.1;
  float f = 0.0;
  float amp = 0.5;
  mat2 modify = rotate(time * 0.02);
  f += amp * noise(p);
  p = modify * p * 2.0;
  amp *= 0.454545;
  f += amp * noise(p);
  p = modify * p * 2.0;
  amp *= 0.454545;
  f += amp * noise(p);
  return f;
}

float pattern(vec2 p) {
  vec2 q = vec2(fbm(p + 1.0), fbm(rotate(0.1 * time) * p + 1.0));
  vec2 r = vec2(fbm(rotate(0.1) * q), fbm(q));
  return fbm(p + r);
}

void main() {
  time = iTime * 0.333333;
  ivec2 texel = ivec2(gl_FragCoord.xy);
  vec2 s = vec2(texel + uOrigin) / vec2(30.0, 15.0);
  float intensity = pattern(s * 0.1) * 1.3 - 0.03;

  vec4 on0 = step(vec4(0.1), intensity - vec4(0.0, 1.0, 2.0, 4.0) * 0.0625);
  vec2 on1 = step(vec2(0.1), intensity - vec2(5.0, 8.0) * 0.0625);

  vec4 fade0 = max(texelFetch(uPrev0, texel, 0) * (1.0 - uFresh) * uDecay - 1.0 / 255.0, 0.0);
  vec2 fade1 = max(texelFetch(uPrev1, texel, 0).xy * (1.0 - uFresh) * uDecay - 1.0 / 255.0, 0.0);

  outRings = max(on0, fade0);
  outExtra = vec4(max(on1, fade1), 0.0, 0.0);
}`;

/**
 * React Bits' main pass with its defaults baked in. Light is computed as core
 * (the glyph) and halo (a 3x3 blur of it plus bloom), then becomes premultiplied
 * alpha in the wallpaper color, so the background shows through everywhere the
 * terminal is dark. Light mode follows React Bits' lightMode: a darker, vivid
 * ink of the color, with a weaker halo.
 */
const MAIN_FRAGMENT = `#version 300 es
precision highp float;
precision highp int;

uniform float iTime;
uniform vec2 iResolution;
uniform vec2 uGrid;
uniform sampler2D uRings0;
uniform sampler2D uRings1;
uniform ivec2 uOrigin;
uniform ivec2 uCellCount;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uLightMode;
${LAYOUT_GLSL}
out vec4 outColor;

const float DIGIT_SIZE = 1.5;
const float SCANLINE_INTENSITY = 0.3;
const float FLICKER_AMOUNT = 1.0;
const float CURVATURE = 0.2;
const float BRIGHTNESS = 1.0;
const float GLOW = 0.5;
const float VIGNETTE = 0.25;
const float DEPTH = 0.6;

float time;

ivec2 cellTexel(vec2 cell) {
  return clamp(ivec2(cell) - uOrigin, ivec2(0), uCellCount - 1);
}

float ringValue(float n, vec4 r0, vec2 r1) {
  if (n < 0.5) return r0.x;
  if (n < 1.5) return r0.y;
  if (n < 2.5) return r0.z;
  if (n < 4.5) return r0.w;
  if (n < 5.5) return r1.x;
  return r1.y;
}

float digit(vec2 p) {
  vec2 cell = floor(p * uGrid);
  ivec2 texel = cellTexel(cell);
  vec4 r0 = texelFetch(uRings0, texel, 0);
  vec2 r1 = texelFetch(uRings1, texel, 0).xy;
  p = fract(p * uGrid) * DIGIT_SIZE;

  float px5 = p.x * 5.0;
  float py5 = (1.0 - p.y) * 5.0;
  float x = fract(px5);
  float y = fract(py5);
  float i = floor(py5) - 2.0;
  float j = floor(px5) - 2.0;
  float inside = step(0.0, p.x) * step(p.x, 1.0) * step(0.0, p.y) * step(p.y, 1.0);
  float on = ringValue(i * i + j * j, r0, r1);
  return inside * on * (0.2 + y * 0.8) * (0.75 + x * 0.25);
}

float onOff(float a, float b, float c) {
  return step(c, sin(iTime + a * cos(iTime * b))) * FLICKER_AMOUNT;
}

float displace(vec2 look) {
  float y = look.y - mod(iTime * 0.25, 1.0);
  float window = 1.0 / (1.0 + 50.0 * y * y);
  return sin(look.y * 20.0 + iTime) * 0.0125 * onOff(4.0, 2.0, 0.8) * (1.0 + cos(iTime * 60.0)) * window;
}

vec2 getLight(vec2 p) {
  float bar = (step(mod(p.y + time * 20.0, 1.0), 0.2) * 0.4 + 1.0) * SCANLINE_INTENSITY;
  p.x += displace(p);

  float middle = digit(p);
  vec2 off = vec2(0.06, 0.03) / uGrid;
  float sum = 0.0;
  for (int oy = -1; oy <= 1; oy++) {
    for (int ox = -1; ox <= 1; ox++) sum += digit(p + off * vec2(float(ox), float(oy)));
  }
  return vec2(0.9 * middle, sum * 0.1 * bar);
}

float glowAt(vec2 p) {
  vec2 cell = floor(p * uGrid);
  vec2 cellPx = iResolution / uGrid;
  float sigma = 0.5 * min(cellPx.x, cellPx.y);
  float center = 0.5 / DIGIT_SIZE;
  float total = 0.0;
  for (int oy = -1; oy <= 1; oy++) {
    for (int ox = -1; ox <= 1; ox++) {
      vec2 c = cell + vec2(float(ox), float(oy));
      ivec2 texel = cellTexel(c);
      vec4 r0 = texelFetch(uRings0, texel, 0);
      vec2 r1 = texelFetch(uRings1, texel, 0).xy;
      float emission = (r0.x + 4.0 * (r0.y + r0.z + r0.w + r1.y) + 8.0 * r1.x) / 25.0;
      vec2 d = (p - (c + center) / uGrid) * iResolution;
      total += emission * exp(-dot(d, d) / (2.0 * sigma * sigma));
    }
  }
  return total;
}

// The bulge is in normalized coordinates, so on a tall, narrow canvas (the
// navigation rail) it bends the few glyph columns into diagonals; it fades out
// as the canvas gets narrower than it is tall.
vec2 barrel(vec2 uv) {
  vec2 c = uv * 2.0 - 1.0;
  c *= 1.0 + CURVATURE * clamp(iResolution.x / iResolution.y, 0.0, 1.0) * dot(c, c);
  return c * 0.5 + 0.5;
}

void main() {
  vec2 screen = gl_FragCoord.xy / iResolution;
  float mask = layoutMask(screen.x, 1.0 - screen.y, DEPTH);
  if (mask < 0.002) {
    outColor = vec4(0.0);
    return;
  }

  time = iTime * 0.333333;
  vec2 uv = barrel(screen);
  vec2 light = getLight(uv);
  float core = light.x;
  float halo = light.y + GLOW * 0.2 * glowAt(uv);

  float edge = 0.04 + 0.22 * VIGNETTE;
  vec2 fade = smoothstep(vec2(0.0), vec2(edge), uv) * smoothstep(vec2(0.0), vec2(edge), 1.0 - uv);
  float m = fade.x * fade.y;
  m = m * m * (3.0 - 2.0 * m);
  float keep = mix(1.0, m, clamp(VIGNETTE * 1.5, 0.0, 1.0));
  core *= keep;
  halo *= keep;

  vec3 luma = vec3(0.2126, 0.7152, 0.0722);
  float peak = max(uColor.r, max(uColor.g, uColor.b));

  if (uLightMode > 0.5) {
    vec3 hue = uColor / max(peak, 0.0001);
    vec3 vivid = clamp(mix(vec3(dot(hue, luma)), hue, 1.6), 0.0, 1.0);
    vivid = clamp(vivid * (0.3 / max(dot(vivid, luma), 0.0001)), 0.0, 1.0);
    vec3 ink = mix(uColor, vivid, smoothstep(0.3, 0.6, dot(uColor, luma)));
    float cover = clamp((core * 1.15 + halo * 0.4) * BRIGHTNESS, 0.0, 0.94);
    float a = cover * uAlpha * mask;
    outColor = vec4(ink * a, a);
    return;
  }

  float phosphor = clamp(GLOW, 0.0, 1.0);
  vec3 vividTint = clamp(mix(vec3(dot(uColor, luma)), uColor, 1.0 + 0.8 * phosphor), 0.0, 1.0);
  vec3 coreTint = mix(uColor, vec3(peak), phosphor * 0.45 * smoothstep(0.45, 0.9, core));
  float total = core + halo;
  vec3 hue = (core * coreTint + halo * vividTint) / max(total, 0.0001);
  float a = clamp(total * BRIGHTNESS, 0.0, 1.0) * uAlpha * mask;
  outColor = vec4(hue * a, a);
}`;

type Program = { program: WebGLProgram; uniform(name: string): WebGLUniformLocation | null };

type Target = { rings: WebGLTexture; extra: WebGLTexture; framebuffer: WebGLFramebuffer };

type Resources = {
  cell: Program;
  main: Program;
  vao: WebGLVertexArrayObject;
  targets: [Target, Target];
  cellUniforms: {
    iTime: WebGLUniformLocation | null;
    uOrigin: WebGLUniformLocation | null;
    uDecay: WebGLUniformLocation | null;
    uFresh: WebGLUniformLocation | null;
  };
  mainUniforms: {
    iTime: WebGLUniformLocation | null;
    iResolution: WebGLUniformLocation | null;
    uGrid: WebGLUniformLocation | null;
    uOrigin: WebGLUniformLocation | null;
    uCellCount: WebGLUniformLocation | null;
    uColor: WebGLUniformLocation | null;
    uAlpha: WebGLUniformLocation | null;
    uLightMode: WebGLUniformLocation | null;
  };
};

function compile(gl: WebGL2RenderingContext, fragment: string): Program | null {
  const program = gl.createProgram();
  if (!program) return null;
  const shaders = [
    [gl.VERTEX_SHADER, VERTEX],
    [gl.FRAGMENT_SHADER, fragment],
  ] as const;
  for (const [type, source] of shaders) {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
      console.warn("[beautiful-bb] Wallpaper shader failed to compile:", gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      gl.deleteProgram(program);
      return null;
    }
    gl.attachShader(program, shader);
    gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn("[beautiful-bb] Wallpaper shader failed to link:", gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return { program, uniform: (name) => gl.getUniformLocation(program, name) };
}

function cellTexture(gl: WebGL2RenderingContext): WebGLTexture | null {
  const texture = gl.createTexture();
  if (!texture) return null;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  return texture;
}

function createTarget(gl: WebGL2RenderingContext): Target | null {
  const rings = cellTexture(gl);
  const extra = cellTexture(gl);
  const framebuffer = gl.createFramebuffer();
  if (!rings || !extra || !framebuffer) return null;
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, rings, 0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, extra, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { rings, extra, framebuffer };
}

function createResources(gl: WebGL2RenderingContext, layout: EffectLayout): Resources | null {
  const cell = compile(gl, CELL_FRAGMENT);
  const main = compile(gl, MAIN_FRAGMENT);
  const vao = gl.createVertexArray();
  const a = createTarget(gl);
  const b = createTarget(gl);
  if (!cell || !main || !vao || !a || !b) return null;

  gl.useProgram(cell.program);
  gl.uniform1i(cell.uniform("uPrev0"), 0);
  gl.uniform1i(cell.uniform("uPrev1"), 1);
  // The layout never changes for a renderer, and uniforms live with the program.
  gl.useProgram(main.program);
  gl.uniform1i(main.uniform("uRings0"), 0);
  gl.uniform1i(main.uniform("uRings1"), 1);
  setLayoutUniforms(gl, main.program, layout);

  return {
    cell,
    main,
    vao,
    targets: [a, b],
    cellUniforms: {
      iTime: cell.uniform("iTime"),
      uOrigin: cell.uniform("uOrigin"),
      uDecay: cell.uniform("uDecay"),
      uFresh: cell.uniform("uFresh"),
    },
    mainUniforms: {
      iTime: main.uniform("iTime"),
      iResolution: main.uniform("iResolution"),
      uGrid: main.uniform("uGrid"),
      uOrigin: main.uniform("uOrigin"),
      uCellCount: main.uniform("uCellCount"),
      uColor: main.uniform("uColor"),
      uAlpha: main.uniform("uAlpha"),
      uLightMode: main.uniform("uLightMode"),
    },
  };
}

/** COLOR_ATTACHMENT0 and 1, as literals so loading this module never needs WebGL2. */
const DRAW_BUFFERS = [0x8ce0, 0x8ce1];

export const createFaultyTerminal: EffectFactory = (canvas, { layout, scale }) => {
  const gl = canvas.getContext("webgl2", { premultipliedAlpha: true, alpha: true, antialias: false });
  if (!gl) return null;
  let resources = createResources(gl, layout);
  if (!resources) return null;

  let colors: EffectColors = { color: [0, 0, 0], alpha: 0, mode: "dark" };
  let lastSeconds = 0;
  /** Time of the last cell step; null until the cells hold a frame for this size. */
  let steppedAt: number | null = null;
  let current = 0;
  /** Glyph cells across the drawing buffer, fractional. */
  const grid = [1, 1];
  /** The cell textures cover cells origin..origin+count, enough for the barrel's reach. */
  const cells = { x: 0, y: 0, w: 1, h: 1 };

  const sizeCells = (r: Resources) => {
    cells.x = Math.floor(UV_MIN * grid[0]!) - 1;
    cells.y = Math.floor(UV_MIN * grid[1]!) - 1;
    cells.w = Math.floor(UV_MAX * grid[0]!) + 1 - cells.x + 1;
    cells.h = Math.floor(UV_MAX * grid[1]!) + 1 - cells.y + 1;
    for (const target of r.targets) {
      for (const texture of [target.rings, target.extra]) {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, cells.w, cells.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      }
    }
    steppedAt = null;
  };

  const stepCells = (r: Resources, seconds: number) => {
    const fresh = steppedAt === null;
    const dt = fresh ? 0 : Math.min(Math.max(Math.abs(seconds - steppedAt!), 0.001), 0.05);
    const source = r.targets[current]!;
    const target = r.targets[1 - current]!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.drawBuffers(DRAW_BUFFERS);
    gl.viewport(0, 0, cells.w, cells.h);
    gl.useProgram(r.cell.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source.rings);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, source.extra);
    gl.uniform1f(r.cellUniforms.iTime, seconds * TIME_SCALE);
    gl.uniform2i(r.cellUniforms.uOrigin, cells.x, cells.y);
    gl.uniform1f(r.cellUniforms.uDecay, fresh ? 0 : Math.exp(-dt / PERSISTENCE_SECONDS));
    gl.uniform1f(r.cellUniforms.uFresh, fresh ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    current = 1 - current;
    steppedAt = seconds;
  };

  const draw = (seconds: number) => {
    lastSeconds = seconds;
    const r = resources;
    if (!r || gl.isContextLost()) return;
    gl.bindVertexArray(r.vao);
    if (steppedAt !== seconds) stepCells(r, seconds);

    const source = r.targets[current]!;
    const u = r.mainUniforms;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(r.main.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source.rings);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, source.extra);
    gl.uniform1f(u.iTime, seconds * TIME_SCALE);
    gl.uniform2f(u.iResolution, canvas.width, canvas.height);
    gl.uniform2f(u.uGrid, grid[0]!, grid[1]!);
    gl.uniform2i(u.uOrigin, cells.x, cells.y);
    gl.uniform2i(u.uCellCount, cells.w, cells.h);
    gl.uniform3f(u.uColor, colors.color[0], colors.color[1], colors.color[2]);
    gl.uniform1f(u.uAlpha, colors.alpha);
    gl.uniform1f(u.uLightMode, colors.mode === "light" ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  };

  const resize = () => {
    const [width, height] = deviceSize(canvas);
    const fit = Math.min(1, Math.sqrt(MAX_PIXELS / (width * height)));
    canvas.width = Math.max(1, Math.round(width * fit));
    canvas.height = Math.max(1, Math.round(height * fit));
    const cellScale = scale * (window.devicePixelRatio || 1) * fit;
    grid[0] = canvas.width / Math.max(1, CELL_W * cellScale);
    grid[1] = canvas.height / Math.max(1, CELL_H * cellScale);
    if (resources) sizeCells(resources);
    draw(lastSeconds);
  };

  // The GPU can drop the context (sleep, driver reset); rebuild when it returns.
  const onLost = (event: Event) => {
    event.preventDefault();
    resources = null;
  };
  const onRestored = () => {
    resources = createResources(gl, layout);
    current = 0;
    if (resources) sizeCells(resources);
    draw(lastSeconds);
  };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);

  sizeCells(resources);
  return {
    resize,
    setColors(next) {
      colors = next;
      draw(lastSeconds);
    },
    draw,
    dispose() {
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      const r = resources;
      resources = null;
      if (!r || gl.isContextLost()) return;
      gl.deleteProgram(r.cell.program);
      gl.deleteProgram(r.main.program);
      gl.deleteVertexArray(r.vao);
      for (const target of r.targets) {
        gl.deleteTexture(target.rings);
        gl.deleteTexture(target.extra);
        gl.deleteFramebuffer(target.framebuffer);
      }
    },
  };
};
