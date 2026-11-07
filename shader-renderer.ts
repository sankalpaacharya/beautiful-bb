// WebGL renderer for the shader wallpapers. Pass one evaluates the drifting
// noise field once per cell into a small texture; pass two draws the chosen
// style from it. The noise is the expensive part, so it runs on the cell grid
// instead of on every device pixel.

const VERTEX = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

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
 * Dither: the field thresholded through an 8x8 Bayer matrix, one small square
 * per lit cell with a gap around it. Dense along the left and right edges,
 * thin in the middle behind the composer, and capped well under full
 * coverage so it never turns solid.
 */
const DITHER = `
precision highp float;
uniform sampler2D uField;
uniform vec2 uRes;
uniform vec2 uFieldSize;
uniform float uCell;
uniform vec3 uColor;
uniform float uAlpha;

float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }

void main() {
  vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 cell = floor(frag / uCell);
  vec2 center = (cell + 0.5) * uCell;
  float wave = texture2D(uField, vec2((cell.x + 0.5) / uFieldSize.x, 1.0 - (cell.y + 0.5) / uFieldSize.y)).r;

  float fall = 1.0 - smoothstep(0.0, 0.55, center.y / uRes.y);
  float sides = mix(0.15, 1.0, smoothstep(0.2, 0.85, abs(center.x / uRes.x - 0.5) * 2.0));
  float v = clamp((wave - 0.25) * 1.9 * fall * fall * sides, 0.0, 0.65);

  vec2 inCell = fract(frag / uCell);
  float square = step(0.25, inCell.x) * step(inCell.x, 0.75) * step(0.25, inCell.y) * step(inCell.y, 0.75);
  float a = step(1.0 - v, bayer8(cell)) * square * uAlpha;
  gl_FragColor = vec4(uColor * a, a);
}
`;

/**
 * Glow: a soft glow in the color along the top corners, under a faint
 * halftone grain in the text color.
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

float sides(float x) { return mix(0.12, 1.0, smoothstep(0.2, 0.85, abs(x - 0.5) * 2.0)); }

void main() {
  vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 cell = floor(frag / uCell);
  vec2 center = (cell + 0.5) * uCell;
  vec2 extent = uFieldSize * uCell;

  float smoothWave = texture2D(uField, vec2(frag.x / extent.x, 1.0 - frag.y / extent.y)).r;
  float glow = (1.0 - smoothstep(0.0, 0.75, frag.y / uRes.y)) * sides(frag.x / uRes.x);
  glow = glow * glow * 0.16 * (0.6 + 0.6 * smoothWave);

  float cellWave = texture2D(uField, vec2((cell.x + 0.5) / uFieldSize.x, 1.0 - (cell.y + 0.5) / uFieldSize.y)).r;
  float fall = 1.0 - smoothstep(0.0, 0.6, center.y / uRes.y);
  float v = clamp((cellWave - 0.2) * 1.8 * fall * fall * sides(center.x / uRes.x), 0.0, 1.0);
  float r = 0.38 * uCell * sqrt(v);
  float grain = (1.0 - smoothstep(r - 0.8, r + 0.8, length(frag - center))) * step(0.04, v) * uInkAlpha;

  gl_FragColor = vec4(uColor * glow + uInk * grain, max(glow, grain));
}
`;

const STYLES = { dither: DITHER, glow: GLOW } as const;

export type ShaderStyle = keyof typeof STYLES;

export type Rgb = readonly [number, number, number];

/** `alpha` scales the dither's squares; `ink` and `inkAlpha` draw the glow's grain. */
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
  const field = compile(gl, FIELD);
  const composite = compile(gl, STYLES[style]);
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
export function createShaderRenderer(canvas: HTMLCanvasElement, style: ShaderStyle, cell: number): ShaderRenderer | null {
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
