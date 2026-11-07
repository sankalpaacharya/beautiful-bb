// WebGL renderer for the shader wallpapers. Pass one evaluates the drifting
// noise field once per cell into a small texture; pass two draws the chosen
// style from it. The noise is the expensive part, so it runs on the cell grid
// instead of on every device pixel.

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

/** Slow domain-warped value noise for Glow. */
const FIELD = `
precision highp float;
uniform vec2 uRes;
uniform vec2 uFieldSize;
uniform float uCell;
uniform float uTime;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.0 + vec2(17.0, 9.0);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 center = vec2(gl_FragCoord.x, uFieldSize.y - gl_FragCoord.y) * uCell;
  vec2 p = center / uRes.y;
  // Domain-warped fbm reads as soft rolling waves.
  vec2 q = vec2(fbm(p * 2.2 + uTime * 0.004), fbm(p * 2.2 + vec2(5.2, 1.3) - uTime * 0.003));
  gl_FragColor = vec4(fbm(p * 2.6 + q * 1.6), 0.0, 0.0, 1.0);
}
`;

/**
 * Where the pattern sits: anchored to the top or bottom edge, reaching
 * `uReach` times each style's own depth, optionally weighted toward the left
 * and right edges, and dissolving over `uEdgeFade` of the height next to the
 * anchored edge so it doesn't end in a flat line there.
 */
const LAYOUT = `
uniform float uAnchor;
uniform float uSides;
uniform float uReach;
uniform float uEdgeFade;

float edgeDistance(float yFromTop) { return mix(yFromTop, 1.0 - yFromTop, uAnchor) / uReach; }
float edgeIn(float yFromTop) {
  return uEdgeFade > 0.0 ? smoothstep(0.0, uEdgeFade, mix(yFromTop, 1.0 - yFromTop, uAnchor)) : 1.0;
}
float sideWeight(float x, float least) {
  return mix(1.0, mix(least, 1.0, smoothstep(0.2, 0.85, abs(x - 0.5) * 2.0)), uSides);
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
${LAYOUT}
const float LEVELS = 3.0;

float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }

void main() {
  vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 cell = floor(frag / uCell);
  vec2 center = (cell + 0.5) * uCell;
  vec4 texel = texture2D(uField, vec2((cell.x + 0.5) / uFieldSize.x, 1.0 - (cell.y + 0.5) / uFieldSize.y));

  float fall = 1.0 - smoothstep(0.0, 0.55, edgeDistance(center.y / uRes.y));
  float f = (texel.r + texel.g / 255.0) * fall * edgeIn(center.y / uRes.y) * sideWeight(center.x / uRes.x, 0.15);

  float v = f + (bayer8(cell) - 0.25) / LEVELS;
  v = clamp(v - mix(0.2, 0.0, smoothstep(0.45, 0.8, v)), 0.0, 1.0);
  float a = floor(v * LEVELS + 0.5) / LEVELS * uAlpha;
  gl_FragColor = vec4(uColor * a, a);
}
`;

/**
 * Glow: a soft glow in the color, under a faint halftone grain in the text
 * color.
 */
const GLOW = `
precision highp float;
uniform sampler2D uField;
uniform vec2 uRes;
uniform vec2 uFieldSize;
uniform float uCell;
uniform vec3 uColor;
uniform vec3 uInk;
uniform float uInkAlpha;
${LAYOUT}
void main() {
  vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 cell = floor(frag / uCell);
  vec2 center = (cell + 0.5) * uCell;
  vec2 extent = uFieldSize * uCell;

  float smoothWave = texture2D(uField, vec2(frag.x / extent.x, 1.0 - frag.y / extent.y)).r;
  float glow = (1.0 - smoothstep(0.0, 0.75, edgeDistance(frag.y / uRes.y))) * edgeIn(frag.y / uRes.y) * sideWeight(frag.x / uRes.x, 0.12);
  glow = glow * glow * 0.16 * (0.6 + 0.6 * smoothWave);

  float cellWave = texture2D(uField, vec2((cell.x + 0.5) / uFieldSize.x, 1.0 - (cell.y + 0.5) / uFieldSize.y)).r;
  float fall = (1.0 - smoothstep(0.0, 0.6, edgeDistance(center.y / uRes.y))) * edgeIn(center.y / uRes.y);
  float v = clamp((cellWave - 0.2) * 1.8 * fall * fall * sideWeight(center.x / uRes.x, 0.12), 0.0, 1.0);
  float r = 0.38 * uCell * sqrt(v);
  float grain = (1.0 - smoothstep(r - 0.8, r + 0.8, length(frag - center))) * step(0.04, v) * uInkAlpha;

  gl_FragColor = vec4(uColor * glow + uInk * grain, max(glow, grain));
}
`;

const STYLES = {
  dither: { field: WAVES, composite: DITHER },
  glow: { field: FIELD, composite: GLOW },
} as const;

export type ShaderStyle = keyof typeof STYLES;

export type ShaderLayout = {
  anchor: "top" | "bottom";
  /** Dense along the left and right edges, thin in the middle. */
  sides: boolean;
  /** Scales how far from the anchored edge the pattern reaches. */
  reach: number;
  /** Fraction of the height next to the anchored edge over which the pattern fades in; 0 keeps it at full strength there. */
  edgeFade: number;
};

export type Rgb = readonly [number, number, number];

/** `alpha` scales the dither's levels; `ink` and `inkAlpha` draw the glow's grain. */
export type ShaderColors = { color: Rgb; alpha: number; ink: Rgb; inkAlpha: number };

export type ShaderRenderer = {
  /** Match the drawing buffer to the canvas's CSS size and pixel density. */
  resize(): void;
  setColors(colors: ShaderColors): void;
  /** Draw the field at `seconds` of drift. */
  draw(seconds: number): void;
  dispose(): void;
};

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

function createResources(gl: WebGLRenderingContext, style: ShaderStyle): Resources | null {
  const field = compile(gl, STYLES[style].field);
  const composite = compile(gl, STYLES[style].composite);
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

/** `cell` is the dot pitch in CSS pixels. Null when WebGL is unavailable. */
export function createShaderRenderer(
  canvas: HTMLCanvasElement,
  style: ShaderStyle,
  cell: number,
  layout: ShaderLayout,
): ShaderRenderer | null {
  const gl = canvas.getContext("webgl", { premultipliedAlpha: true, antialias: false, alpha: true });
  if (!gl) return null;
  let resources = createResources(gl, style);
  if (!resources) return null;

  let colors: ShaderColors = { color: [0, 0, 0], alpha: 0, ink: [0, 0, 0], inkAlpha: 0 };
  let fieldSize: [number, number] = [0, 0];
  let lastSeconds = 0;
  const cellPx = () => Math.max(2, Math.round(cell * (window.devicePixelRatio || 1)));

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
    gl.uniform1f(r.composite.uniform("uAnchor"), layout.anchor === "bottom" ? 1 : 0);
    gl.uniform1f(r.composite.uniform("uSides"), layout.sides ? 1 : 0);
    gl.uniform1f(r.composite.uniform("uReach"), layout.reach);
    gl.uniform1f(r.composite.uniform("uEdgeFade"), layout.edgeFade);
    gl.uniform3f(r.composite.uniform("uInk"), ...colors.ink);
    gl.uniform1f(r.composite.uniform("uInkAlpha"), colors.inkAlpha);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const resize = () => {
    const { width, height } = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    if (resources) sizeField(resources);
    draw(lastSeconds);
  };

  // The GPU can drop the context (sleep, driver reset); rebuild when it returns.
  const onLost = (event: Event) => {
    event.preventDefault();
    resources = null;
  };
  const onRestored = () => {
    resources = createResources(gl, style);
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
}
