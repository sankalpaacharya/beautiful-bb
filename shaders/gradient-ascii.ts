// Gradient ASCII effect, after React Bits' Gradient ASCII background (its
// "horizon" shape). Pass one paints the flowing gradient into a small texture;
// the halo passes draw the glyphs at quarter size and blur them; the composite
// samples the gradient once per character cell and stamps a glyph from an atlas
// whose density follows the gradient's brightness, over the halo and a faint
// copy of the gradient.
import {
  ANCHOR,
  LAYOUT_GLSL,
  deviceSize,
  setLayoutUniforms,
  type EffectColors,
  type EffectFactory,
  type Rgb,
} from "./types";

/** Cell height in CSS pixels; the atlas makes cells 0.6 as wide. */
const CELL = 18;
const CHARACTERS = " =+xX0S8#@";
const FONT = 'ui-monospace, "SF Mono", Menlo, monospace';
const ATLAS_CELL_W = 60;
const ATLAS_CELL_H = 100;
const FONT_SCALE = 0.78;
/** Half React Bits' default speed. */
const SPEED = 0.5;
/** Longest side, in texels, of the gradient and halo textures. */
const FIELD_MAX = 800;
const HALO_MAX = 640;

/**
 * Ramp stops relative to the wallpaper color, after React Bits' default
 * palette of a deep blue, a near white, a light tint, and the color itself.
 * Each is [lightness, chroma, hue turn in degrees]: lightness moves toward
 * white when positive and toward black when negative, by that fraction.
 */
type Stop = readonly [number, number, number];
const DARK_STOPS: readonly Stop[] = [
  [-0.35, 1.1, -14],
  [0.9, 0.15, 0],
  [0.55, 0.6, 8],
  [0, 1, 0],
];
const LIGHT_STOPS: readonly Stop[] = [
  [-0.55, 1.1, -14],
  [0.3, 0.6, 0],
  [0.1, 0.85, 8],
  [-0.2, 1, 0],
];

const VERTEX = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const HASH = `
float hash12(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
`;

/**
 * React Bits' horizon: a lit sky over an arched horizon, warped by flowing
 * noise, colored through an OKLab ramp. Premultiplied output. `uFlip` is the
 * layout's anchor: the sky sits at the anchored edge, or at both edges.
 */
const FIELD = `#version 300 es
precision highp float;
uniform float uAspect;
uniform float uTime;
uniform float uFlip;
uniform vec3 uRamp[4];
in vec2 vUv;
out vec4 outColor;
const float SOFTNESS = 0.5;
const float FLOW = 0.5;
${HASH}
vec2 hash22(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.103, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.xx + q.yz) * q.zy) * 2.0 - 1.0;
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(hash22(i), f);
  float b = dot(hash22(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
  float c = dot(hash22(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
  float d = dot(hash22(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
  return 0.5 + 0.5 * mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

vec3 labToRgb(vec3 lab) {
  float l = lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z;
  float m = lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z;
  float s = lab.x - 0.0894841775 * lab.y - 1.2914855480 * lab.z;
  l = l * l * l;
  m = m * m * m;
  s = s * s * s;
  return vec3(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  );
}

vec3 encode(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

vec3 horizon(vec2 p, float time) {
  float span = 0.5 * max(uAspect, 1.0);
  float x = p.x / span;
  float arch = -0.17 - 0.2 * x * x + 0.02 * sin(time * 0.6);
  float soft = mix(0.05, 0.22, SOFTNESS);
  float edge = p.y - arch;
  float rim = 0.38 * smoothstep(-soft, 0.42, edge);
  vec2 sun = vec2(0.08 * sin(time * 0.31) * span, 0.58);
  float spread = length((p - sun) / vec2(0.95 * span, 0.75));
  float sky = mix(0.55, 1.0, smoothstep(0.2, 0.95, spread));
  return vec3(rim, sky, smoothstep(0.18, 0.62, edge));
}

vec4 tone(float t) {
  float x = smoothstep(0.3, 1.0, t) * 3.0;
  int index = int(floor(x));
  return vec4(mix(uRamp[index], uRamp[min(index + 1, 3)], fract(x)), smoothstep(0.0, 0.38, t));
}

void main() {
  vec2 uv = vec2(vUv.x, uFlip > 1.5 ? 1.0 - min(vUv.y, 1.0 - vUv.y) : mix(vUv.y, 1.0 - vUv.y, uFlip));
  vec2 q = (uv - 0.5) * vec2(uAspect, 1.0);
  vec2 warp = vec2(
    noise(q * 1.6 + vec2(0.0, uTime * 0.3)),
    noise(q * 1.6 + vec2(4.3, -uTime * 0.24))
  ) - 0.5;
  q += warp * FLOW * 0.18;
  vec3 shape = horizon(q, uTime);
  vec2 t = clamp(shape.xy, 0.0, 1.0);
  vec4 mixed = mix(tone(t.x), tone(t.y), shape.z);
  vec3 color = encode(labToRgb(mixed.rgb));
  float dither = (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
  outColor = clamp(vec4(color * mixed.a + dither, mixed.a + dither), 0.0, 1.0);
}`;

/**
 * One glyph per cell, picked by the gradient's brightness at the cell's
 * center (its darkness in light mode) and thinned by the layout so the glyphs
 * get lighter and sparser toward where the effect fades out.
 */
const GLYPHS = `
uniform sampler2D uField;
uniform sampler2D uAtlas;
uniform vec2 uResolution;
uniform vec2 uCell;
uniform vec2 uOffset;
uniform float uGlyphTime;
uniform float uLight;
${LAYOUT_GLSL}
${HASH}
const float COUNT = ${CHARACTERS.length}.0;
const float DENSITY = 0.8;
const float OPACITY = 0.85;
// React Bits flickers at 0.2; a quarter of that keeps the glyphs calm.
const float FLICKER = 0.05;
const float DEPTH = 0.6;

float sampleGlyph(float index, vec2 local, vec2 coord) {
  vec2 atlasUv = vec2((index + local.x) / COUNT, 1.0 - local.y);
  vec2 continuous = coord / vec2(COUNT, 1.0);
  return textureGrad(uAtlas, atlasUv, dFdx(continuous), dFdy(continuous)).a;
}

vec4 glyphAt(vec2 px) {
  vec2 coord = (px - uOffset) / uCell;
  vec2 cell = floor(coord);
  vec2 local = coord - cell;
  vec2 uv = clamp(((cell + 0.5) * uCell + uOffset) / uResolution, vec2(0.0), vec2(1.0));
  vec4 field = texture(uField, uv);
  vec3 visible = uLight > 0.5 ? field.rgb + (1.0 - field.a) : field.rgb;
  float luma = dot(visible, vec3(0.2126, 0.7152, 0.0722));
  float value = uLight > 0.5 ? clamp((1.0 - luma) * 1.5, 0.0, 1.0) : luma;
  value *= layoutMask(uv.x, 1.0 - uv.y, DEPTH);
  float pick = hash12(cell);
  float level = hash12(cell * 1.73 + 4.1);
  float tick = floor(uGlyphTime * 9.0 + level * 9.0);
  float wobble = (hash12(cell * 2.31 + tick * 17.7) - 0.5) * FLICKER * 0.4 + (level - 0.5) * 0.1;
  float tone = clamp(pow(value, 0.75) + wobble, 0.0, 1.0);
  float index = floor(tone * (COUNT - 1.0) + 0.5);
  float present = step(pick, DENSITY * mix(1.0, 0.3 + tone * 1.1, 0.55));
  float cutoff = smoothstep(0.03, 0.1, value);
  float coverage = sampleGlyph(index, local, coord);
  float alpha = OPACITY * present * cutoff * coverage * mix(1.0, 0.35 + 0.65 * level, 0.55);
  if (uLight < 0.5) return field * alpha;
  return vec4(visible * 0.8 * alpha, alpha);
}
`;

const HALO = `#version 300 es
precision highp float;
uniform vec2 uDownscale;
in vec2 vUv;
out vec4 outColor;
${GLYPHS}
void main() {
  outColor = glyphAt(gl_FragCoord.xy * uDownscale);
}`;

const BLUR = `#version 300 es
precision highp float;
uniform sampler2D uSource;
uniform vec2 uStep;
in vec2 vUv;
out vec4 outColor;
void main() {
  vec4 sum = texture(uSource, vUv) * 0.2270270270;
  sum += texture(uSource, vUv + uStep * 1.3846153846) * 0.3162162162;
  sum += texture(uSource, vUv - uStep * 1.3846153846) * 0.3162162162;
  sum += texture(uSource, vUv + uStep * 3.2307692308) * 0.0702702703;
  sum += texture(uSource, vUv - uStep * 3.2307692308) * 0.0702702703;
  outColor = sum;
}`;

/**
 * Glyphs over the halo and the gradient, React Bits' blend for each mode, then
 * scaled as a whole by the wallpaper alpha and the layout so everything,
 * gradient wash included, stays premultiplied and fades out together.
 */
const COMPOSITE = `#version 300 es
precision highp float;
uniform sampler2D uHalo;
uniform float uAlpha;
in vec2 vUv;
out vec4 outColor;
${GLYPHS}
const float GLOW = 0.2;
// React Bits' gradient is an opaque 0.9 backdrop; here it is a faint glow
// held to where the layout is strongest, so the glyphs carry the gradient.
const float GRADIENT = 0.3;
void main() {
  float mask = layoutMask(vUv.x, 1.0 - vUv.y, DEPTH);
  vec4 base = texture(uField, vUv) * GRADIENT * smoothstep(0.35, 1.0, mask);
  vec4 glyph = glyphAt(gl_FragCoord.xy);
  vec4 halo = texture(uHalo, vUv) * GLOW;
  vec4 color;
  if (uLight < 0.5) {
    color = base + glyph + halo;
  } else {
    color = glyph + base * (1.0 - glyph.a);
    color += halo * 0.6 * (1.0 - color.a);
  }
  color.a = clamp(color.a, 0.0, 1.0);
  color.rgb = clamp(color.rgb, 0.0, color.a);
  outColor = color * uAlpha * mask;
}`;

type GL = WebGL2RenderingContext;

type Program = { program: WebGLProgram; u: Record<string, WebGLUniformLocation | null> };

type Target = { texture: WebGLTexture; framebuffer: WebGLFramebuffer; width: number; height: number };

type Resources = {
  field: Program;
  halo: Program;
  blur: Program;
  composite: Program;
  vao: WebGLVertexArrayObject;
  atlas: WebGLTexture;
  fieldTarget: Target;
  haloA: Target;
  haloB: Target;
};

function link(gl: GL, fragment: string): Program | null {
  const program = gl.createProgram();
  if (!program) return null;
  for (const [type, source] of [
    [gl.VERTEX_SHADER, VERTEX],
    [gl.FRAGMENT_SHADER, fragment],
  ] as const) {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    gl.attachShader(program, shader);
    gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn("[beautiful-bb] Wallpaper shader failed to link:", gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  const u: Program["u"] = {};
  const count: number = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i++) {
    const name = gl.getActiveUniform(program, i)?.name.replace(/\[0\]$/, "");
    if (name) u[name] = gl.getUniformLocation(program, name);
  }
  return { program, u };
}

function createTarget(gl: GL): Target | null {
  const texture = gl.createTexture();
  const framebuffer = gl.createFramebuffer();
  if (!texture || !framebuffer) return null;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return { texture, framebuffer, width: 0, height: 0 };
}

function sizeTarget(gl: GL, target: Target, width: number, height: number) {
  target.width = width;
  target.height = height;
  gl.bindTexture(gl.TEXTURE_2D, target.texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target.texture, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

/** One row of white glyphs on transparent, mipmapped for minified sampling. */
function buildAtlas(gl: GL): WebGLTexture | null {
  const canvas = document.createElement("canvas");
  canvas.width = ATLAS_CELL_W * CHARACTERS.length;
  canvas.height = ATLAS_CELL_H;
  const context = canvas.getContext("2d");
  const texture = gl.createTexture();
  if (!context || !texture) return null;
  context.font = `300 ${Math.round(ATLAS_CELL_H * FONT_SCALE)}px ${FONT}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#fff";
  [...CHARACTERS].forEach((char, i) => context.fillText(char, (i + 0.5) * ATLAS_CELL_W, ATLAS_CELL_H / 2 + 3));
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

function createResources(gl: GL): Resources | null {
  const field = link(gl, FIELD);
  const halo = link(gl, HALO);
  const blur = link(gl, BLUR);
  const composite = link(gl, COMPOSITE);
  const vao = gl.createVertexArray();
  const atlas = buildAtlas(gl);
  const fieldTarget = createTarget(gl);
  const haloA = createTarget(gl);
  const haloB = createTarget(gl);
  if (!field || !halo || !blur || !composite || !vao || !atlas || !fieldTarget || !haloA || !haloB) return null;
  return { field, halo, blur, composite, vao, atlas, fieldTarget, haloA, haloB };
}

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

function toLab([r, g, b]: Rgb): [number, number, number] {
  const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** OKLab ramp of shades and hue neighbors of the wallpaper color. */
function writeRamp(out: Float32Array, { color, mode }: EffectColors) {
  const [lightness, a, b] = toLab(color);
  const chroma = Math.hypot(a, b);
  const hue = Math.atan2(b, a);
  (mode === "light" ? LIGHT_STOPS : DARK_STOPS).forEach(([shift, scale, turn], i) => {
    const h = hue + (turn * Math.PI) / 180;
    out[i * 3] = shift >= 0 ? lightness + (1 - lightness) * shift : lightness * (1 + shift);
    out[i * 3 + 1] = Math.cos(h) * chroma * scale;
    out[i * 3 + 2] = Math.sin(h) * chroma * scale;
  });
}

export const createGradientAscii: EffectFactory = (canvas, { layout, scale }) => {
  const gl = canvas.getContext("webgl2", { premultipliedAlpha: true, alpha: true, antialias: false });
  if (!gl) return null;
  let resources = createResources(gl);
  if (!resources) return null;

  const ramp = new Float32Array(12);
  let colors: EffectColors = { color: [0, 0, 0], alpha: 0, mode: "dark" };
  writeRamp(ramp, colors);
  const cell = { width: 0, height: 0, offsetX: 0, offsetY: 0 };
  let lastSeconds = 0;

  const sizeTargets = (r: Resources) => {
    const { width, height } = canvas;
    const longest = Math.max(width, height);
    const fieldScale = Math.min(0.5, FIELD_MAX / longest);
    const haloScale = Math.min(0.25, HALO_MAX / longest);
    sizeTarget(gl, r.fieldTarget, Math.max(1, Math.round(width * fieldScale)), Math.max(1, Math.round(height * fieldScale)));
    const haloW = Math.max(1, Math.round(width * haloScale));
    const haloH = Math.max(1, Math.round(height * haloScale));
    sizeTarget(gl, r.haloA, haloW, haloH);
    sizeTarget(gl, r.haloB, haloW, haloH);
    cell.height = CELL * scale * Math.min(window.devicePixelRatio || 1, 2);
    cell.width = cell.height * (ATLAS_CELL_W / ATLAS_CELL_H);
    cell.offsetX = (width - Math.ceil(width / cell.width) * cell.width) / 2;
    cell.offsetY = (height - Math.ceil(height / cell.height) * cell.height) / 2;
  };

  const bindGlyphs = (r: Resources, program: Program, glyphTime: number) => {
    const { u } = program;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, r.fieldTarget.texture);
    gl.uniform1i(u.uField, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, r.atlas);
    gl.uniform1i(u.uAtlas, 1);
    gl.uniform2f(u.uResolution, canvas.width, canvas.height);
    gl.uniform2f(u.uCell, cell.width, cell.height);
    gl.uniform2f(u.uOffset, cell.offsetX, cell.offsetY);
    gl.uniform1f(u.uGlyphTime, glyphTime);
    gl.uniform1f(u.uLight, colors.mode === "light" ? 1 : 0);
    setLayoutUniforms(gl, program.program, layout);
  };

  const draw = (seconds: number) => {
    lastSeconds = seconds;
    const r = resources;
    if (!r || gl.isContextLost()) return;
    const glyphTime = seconds * SPEED;
    gl.bindVertexArray(r.vao);
    gl.disable(gl.BLEND);

    gl.bindFramebuffer(gl.FRAMEBUFFER, r.fieldTarget.framebuffer);
    gl.viewport(0, 0, r.fieldTarget.width, r.fieldTarget.height);
    gl.useProgram(r.field.program);
    gl.uniform1f(r.field.u.uAspect, canvas.width / canvas.height);
    gl.uniform1f(r.field.u.uTime, seconds * SPEED * 0.5);
    gl.uniform1f(r.field.u.uFlip, ANCHOR[layout.anchor]);
    gl.uniform3fv(r.field.u.uRamp, ramp);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindFramebuffer(gl.FRAMEBUFFER, r.haloA.framebuffer);
    gl.viewport(0, 0, r.haloA.width, r.haloA.height);
    gl.useProgram(r.halo.program);
    bindGlyphs(r, r.halo, glyphTime);
    gl.uniform2f(r.halo.u.uDownscale, canvas.width / r.haloA.width, canvas.height / r.haloA.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.useProgram(r.blur.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(r.blur.u.uSource, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, r.haloB.framebuffer);
    gl.bindTexture(gl.TEXTURE_2D, r.haloA.texture);
    gl.uniform2f(r.blur.u.uStep, 1 / r.haloA.width, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, r.haloA.framebuffer);
    gl.bindTexture(gl.TEXTURE_2D, r.haloB.texture);
    gl.uniform2f(r.blur.u.uStep, 0, 1 / r.haloA.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(r.composite.program);
    bindGlyphs(r, r.composite, glyphTime);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, r.haloA.texture);
    gl.uniform1i(r.composite.u.uHalo, 2);
    gl.uniform1f(r.composite.u.uAlpha, colors.alpha);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const resize = () => {
    [canvas.width, canvas.height] = deviceSize(canvas);
    if (resources) sizeTargets(resources);
    draw(lastSeconds);
  };

  // The GPU can drop the context (sleep, driver reset); rebuild when it returns.
  const onLost = (event: Event) => {
    event.preventDefault();
    resources = null;
  };
  const onRestored = () => {
    resources = createResources(gl);
    if (resources) sizeTargets(resources);
    draw(lastSeconds);
  };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);

  sizeTargets(resources);
  return {
    resize,
    setColors(next) {
      colors = next;
      writeRamp(ramp, colors);
      draw(lastSeconds);
    },
    draw,
    dispose() {
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      const r = resources;
      resources = null;
      if (!r || gl.isContextLost()) return;
      for (const p of [r.field, r.halo, r.blur, r.composite]) gl.deleteProgram(p.program);
      for (const t of [r.fieldTarget, r.haloA, r.haloB]) {
        gl.deleteTexture(t.texture);
        gl.deleteFramebuffer(t.framebuffer);
      }
      gl.deleteTexture(r.atlas);
      gl.deleteVertexArray(r.vao);
    },
  };
};
