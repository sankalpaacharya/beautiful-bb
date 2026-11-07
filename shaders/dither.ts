// Dither effect, after React Bits' Dither background. Pass one evaluates the
// flowing waves once per cell into a small texture; pass two dithers them into
// pixels. The noise is the expensive part, so it runs on the cell grid instead
// of on every device pixel.
import {
  LAYOUT_GLSL,
  deviceSize,
  setLayoutUniforms,
  type EffectColors,
  type EffectFactory,
} from "./types";

/** Pixel size in CSS pixels. */
const CELL = 2;

const VERTEX = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

/**
 * Waves for Dither, ported from React Bits' Dither background: ridged Perlin
 * fbm, warped by a copy of itself that flows with time. Stored as r + g/255 for
 * precision in an 8-bit texture.
 */
const WAVES = `
precision highp float;
uniform vec2 uRes;
uniform float uCell;
uniform float uTime;

const float SPEED = 0.02;
const float FREQUENCY = 3.0;
const float AMPLITUDE = 0.3;

vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
vec2 fade(vec2 t) { return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }
float cnoise(vec2 P) {
  vec4 Pi = floor(P.xyxy) + vec4(0.0, 0.0, 1.0, 1.0);
  vec4 Pf = fract(P.xyxy) - vec4(0.0, 0.0, 1.0, 1.0);
  Pi = mod289(Pi);
  vec4 i = permute(permute(Pi.xzxz) + Pi.yyww);
  vec4 gx = fract(i * (1.0 / 41.0)) * 2.0 - 1.0;
  vec4 gy = abs(gx) - 0.5;
  gx = gx - floor(gx + 0.5);
  vec2 g00 = vec2(gx.x, gy.x);
  vec2 g10 = vec2(gx.y, gy.y);
  vec2 g01 = vec2(gx.z, gy.z);
  vec2 g11 = vec2(gx.w, gy.w);
  vec4 norm = taylorInvSqrt(vec4(dot(g00, g00), dot(g01, g01), dot(g10, g10), dot(g11, g11)));
  g00 *= norm.x;
  g01 *= norm.y;
  g10 *= norm.z;
  g11 *= norm.w;
  float n00 = dot(g00, vec2(Pf.x, Pf.y));
  float n10 = dot(g10, vec2(Pf.z, Pf.y));
  float n01 = dot(g01, vec2(Pf.x, Pf.w));
  float n11 = dot(g11, vec2(Pf.z, Pf.w));
  vec2 f = fade(Pf.xy);
  vec2 nx = mix(vec2(n00, n01), vec2(n10, n11), f.x);
  return 2.3 * mix(nx.x, nx.y, f.y);
}
float fbm(vec2 p) {
  float value = 0.0;
  float amp = 1.0;
  for (int i = 0; i < 4; i++) {
    value += amp * abs(cnoise(p));
    p *= FREQUENCY;
    amp *= AMPLITUDE;
  }
  return value;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5) * uCell / uRes - 0.5;
  uv.x *= uRes.x / uRes.y;
  float v = clamp(fbm(uv + fbm(uv - uTime * SPEED)), 0.0, 1.0);
  gl_FragColor = vec4(floor(v * 255.0) / 255.0, fract(v * 255.0), 0.0, 1.0);
}
`;

/**
 * Dither, after React Bits: the waves offset by an 8x8 Bayer matrix and
 * quantized to a few alpha levels, one per cell. The layout fades the waves
 * out away from the anchored edge before quantizing, so the edge of the
 * pattern dithers away instead of cutting off.
 */
const DITHER = `
precision highp float;
uniform sampler2D uField;
uniform vec2 uRes;
uniform vec2 uFieldSize;
uniform float uCell;
uniform vec3 uColor;
uniform float uAlpha;
${LAYOUT_GLSL}
const float LEVELS = 3.0;

float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }

void main() {
  vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 cell = floor(frag / uCell);
  vec2 center = (cell + 0.5) * uCell;
  vec4 texel = texture2D(uField, vec2((cell.x + 0.5) / uFieldSize.x, 1.0 - (cell.y + 0.5) / uFieldSize.y));

  float f = (texel.r + texel.g / 255.0) * layoutMask(center.x / uRes.x, center.y / uRes.y, 0.55);

  float v = f + (bayer8(cell) - 0.25) / LEVELS;
  v = clamp(v - mix(0.2, 0.0, smoothstep(0.45, 0.8, v)), 0.0, 1.0);
  float a = floor(v * LEVELS + 0.5) / LEVELS * uAlpha;
  gl_FragColor = vec4(uColor * a, a);
}
`;

type Program = { program: WebGLProgram; uniform(name: string): WebGLUniformLocation | null };

type Resources = {
  field: Program;
  composite: Program;
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  buffer: WebGLBuffer;
};

function compile(gl: WebGLRenderingContext, fragment: string): Program | null {
  const program = gl.createProgram();
  const shaders = [
    [gl.VERTEX_SHADER, VERTEX],
    [gl.FRAGMENT_SHADER, fragment],
  ] as const;
  if (!program) return null;
  for (const [type, source] of shaders) {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    gl.attachShader(program, shader);
    gl.deleteShader(shader);
  }
  gl.bindAttribLocation(program, 0, "aPos");
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn("[beautiful-bb] Wallpaper shader failed to link:", gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return { program, uniform: (name) => gl.getUniformLocation(program, name) };
}

function createResources(gl: WebGLRenderingContext): Resources | null {
  const field = compile(gl, WAVES);
  const composite = compile(gl, DITHER);
  const texture = gl.createTexture();
  const framebuffer = gl.createFramebuffer();
  const buffer = gl.createBuffer();
  if (!field || !composite || !texture || !framebuffer || !buffer) return null;
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { field, composite, texture, framebuffer, buffer };
}

export const createDither: EffectFactory = (canvas, { layout, scale }) => {
  const gl = canvas.getContext("webgl", { premultipliedAlpha: true, antialias: false, alpha: true });
  if (!gl) return null;
  let resources = createResources(gl);
  if (!resources) return null;

  let colors: EffectColors = { color: [0, 0, 0], alpha: 0, mode: "dark" };
  let fieldSize: [number, number] = [0, 0];
  let lastSeconds = 0;
  const cellPx = () => Math.max(1, Math.round(CELL * scale * (window.devicePixelRatio || 1)));

  const sizeField = (r: Resources) => {
    const pitch = cellPx();
    fieldSize = [Math.ceil(canvas.width / pitch), Math.ceil(canvas.height / pitch)];
    gl.bindTexture(gl.TEXTURE_2D, r.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, fieldSize[0], fieldSize[1], 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  };

  const draw = (seconds: number) => {
    lastSeconds = seconds;
    const r = resources;
    if (!r || gl.isContextLost()) return;
    const pitch = cellPx();

    gl.bindFramebuffer(gl.FRAMEBUFFER, r.framebuffer);
    gl.viewport(0, 0, fieldSize[0], fieldSize[1]);
    gl.useProgram(r.field.program);
    gl.uniform2f(r.field.uniform("uRes"), canvas.width, canvas.height);
    gl.uniform2f(r.field.uniform("uFieldSize"), fieldSize[0], fieldSize[1]);
    gl.uniform1f(r.field.uniform("uCell"), pitch);
    gl.uniform1f(r.field.uniform("uTime"), seconds);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(r.composite.program);
    gl.bindTexture(gl.TEXTURE_2D, r.texture);
    gl.uniform1i(r.composite.uniform("uField"), 0);
    gl.uniform2f(r.composite.uniform("uRes"), canvas.width, canvas.height);
    gl.uniform2f(r.composite.uniform("uFieldSize"), fieldSize[0], fieldSize[1]);
    gl.uniform1f(r.composite.uniform("uCell"), pitch);
    gl.uniform3f(r.composite.uniform("uColor"), ...colors.color);
    gl.uniform1f(r.composite.uniform("uAlpha"), colors.alpha);
    setLayoutUniforms(gl, r.composite.program, layout);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const resize = () => {
    [canvas.width, canvas.height] = deviceSize(canvas);
    if (resources) sizeField(resources);
    draw(lastSeconds);
  };

  // The GPU can drop the context (sleep, driver reset); rebuild when it returns.
  const onLost = (event: Event) => {
    event.preventDefault();
    resources = null;
  };
  const onRestored = () => {
    resources = createResources(gl);
    if (resources) sizeField(resources);
    draw(lastSeconds);
  };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);

  sizeField(resources);
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
      gl.deleteProgram(r.field.program);
      gl.deleteProgram(r.composite.program);
      gl.deleteTexture(r.texture);
      gl.deleteFramebuffer(r.framebuffer);
      gl.deleteBuffer(r.buffer);
    },
  };
};
