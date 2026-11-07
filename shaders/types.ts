// The contract every wallpaper effect implements. An effect owns its WebGL
// context, programs, and passes for one canvas; the ShaderWallpaper component
// only sizes it, feeds it colors and time, and disposes it.

export type Rgb = readonly [number, number, number];

/** `color` is the wallpaper color; `alpha` scales the effect's overall opacity. */
export type EffectColors = { color: Rgb; alpha: number; mode: "dark" | "light" };

export type EffectLayout = {
  /** The edge the effect grows from; "both" mirrors it from the top and bottom toward the middle. */
  anchor: "top" | "bottom" | "both";
  /** Dense along the left and right edges, thin in the middle. */
  sides: boolean;
  /** Scales how far from the anchored edge the effect reaches. */
  reach: number;
  /** Fraction of the height next to the anchored edge over which the effect fades in; 0 keeps it full there. */
  edgeFade: number;
};

export type EffectOptions = {
  layout: EffectLayout;
  /** Shrinks the effect's cells or glyphs, for small previews; 1 is full size. */
  scale: number;
};

export type EffectRenderer = {
  /** Match the drawing buffer to the canvas's CSS size and pixel density. */
  resize(): void;
  setColors(colors: EffectColors): void;
  /** Draw the effect at `seconds` of animation time. */
  draw(seconds: number): void;
  dispose(): void;
};

/** Null when the browser can't run the effect (no WebGL, or a shader failed to build). */
export type EffectFactory = (canvas: HTMLCanvasElement, options: EffectOptions) => EffectRenderer | null;

/**
 * GLSL for placing an effect, valid in GLSL ES 1.00 and 3.00. Declares the
 * layout uniforms; `layoutMask(xFromLeft, yFromTop, depth)` returns 0..1 to
 * multiply into the effect's final alpha, where `depth` is the effect's own
 * reach as a fraction of the height (Dither uses 0.55). Set the uniforms with
 * `setLayoutUniforms`.
 */
export const LAYOUT_GLSL = `
uniform float uAnchor;
uniform float uSides;
uniform float uReach;
uniform float uEdgeFade;

float fromEdge(float yFromTop) { return uAnchor > 1.5 ? min(yFromTop, 1.0 - yFromTop) : mix(yFromTop, 1.0 - yFromTop, uAnchor); }
float edgeDistance(float yFromTop) { return fromEdge(yFromTop) / uReach; }
float edgeIn(float yFromTop) {
  return uEdgeFade > 0.0 ? smoothstep(0.0, uEdgeFade, fromEdge(yFromTop)) : 1.0;
}
float sideWeight(float x, float least) {
  return mix(1.0, mix(least, 1.0, smoothstep(0.2, 0.85, abs(x - 0.5) * 2.0)), uSides);
}
float layoutMask(float xFromLeft, float yFromTop, float depth) {
  return (1.0 - smoothstep(0.0, depth, edgeDistance(yFromTop))) * edgeIn(yFromTop) * sideWeight(xFromLeft, 0.15);
}
`;

type GL = WebGLRenderingContext | WebGL2RenderingContext;

/** uAnchor values as LAYOUT_GLSL reads them. */
export const ANCHOR: Record<EffectLayout["anchor"], number> = { top: 0, bottom: 1, both: 2 };

export function setLayoutUniforms(gl: GL, program: WebGLProgram, layout: EffectLayout) {
  gl.uniform1f(gl.getUniformLocation(program, "uAnchor"), ANCHOR[layout.anchor]);
  gl.uniform1f(gl.getUniformLocation(program, "uSides"), layout.sides ? 1 : 0);
  gl.uniform1f(gl.getUniformLocation(program, "uReach"), layout.reach);
  gl.uniform1f(gl.getUniformLocation(program, "uEdgeFade"), layout.edgeFade);
}

/** CSS-pixel size times device pixel ratio, rounded and at least 1. */
export function deviceSize(canvas: HTMLCanvasElement): [number, number] {
  const { width, height } = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  return [Math.max(1, Math.round(width * dpr)), Math.max(1, Math.round(height * dpr))];
}
