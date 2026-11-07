// Shader wallpaper: a slowly drifting WebGL field drawn as Dither (small
// squares through a Bayer matrix) or Glow (a soft glow under a faint grain),
// fading out from one edge of its container.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { experimental_useCodeTheme as useCodeTheme } from "@get-bb/plugin-sdk/app";
import {
  createShaderRenderer,
  type Rgb,
  type ShaderLayout,
  type ShaderRenderer,
  type ShaderStyle,
} from "./shader-renderer";

const FRAME_MS = 1000 / 30;

/** Dot pitch in CSS pixels. */
const CELL: Record<ShaderStyle, number> = { dither: 2, glow: 5 };

/** The home pane: from the top, thin in the middle behind the composer. */
export const HOME_LAYOUT: ShaderLayout = { anchor: "top", sides: true, reach: 1, edgeFade: 0 };

const TONES = {
  dark: { alpha: 0.42, ink: [1, 1, 1], inkAlpha: 0.16 },
  light: { alpha: 0.5, ink: [0, 0, 0], inkAlpha: 0.1 },
} as const;

let probe: CanvasRenderingContext2D | null = null;

/** An element's computed `color`, oklch and color-mix included, as 0..1 RGB. */
function computedRgb(element: Element): Rgb {
  const ctx = (probe ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true })!);
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = getComputedStyle(element).color;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return [r! / 255, g! / 255, b! / 255];
}

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const subscribeReducedMotion = (onChange: () => void) => {
  reducedMotion.addEventListener("change", onChange);
  return () => reducedMotion.removeEventListener("change", onChange);
};

/**
 * `color` is any CSS color, including `var(...)` tokens; `animate` lets the
 * field drift; `scale` shrinks the dots, for previews.
 */
export function ShaderWallpaper({
  style,
  color,
  animate,
  layout = HOME_LAYOUT,
  scale = 1,
  className,
}: {
  style: ShaderStyle;
  color: string;
  animate: boolean;
  layout?: ShaderLayout;
  scale?: number;
  className?: string;
}) {
  const { anchor, sides, reach, edgeFade } = layout;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [renderer, setRenderer] = useState<ShaderRenderer | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  // A random start keeps each window's field from looking identical.
  const epoch = useRef(performance.now() - Math.random() * 600_000);
  const { mode, name } = useCodeTheme();
  const still = useSyncExternalStore(subscribeReducedMotion, () => reducedMotion.matches);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const next = createShaderRenderer(canvas, style, CELL[style] * scale, { anchor, sides, reach, edgeFade });
    if (!next) {
      setUnsupported(true);
      return;
    }
    next.resize();
    const sizes = new ResizeObserver(() => next.resize());
    sizes.observe(canvas);
    setRenderer(next);
    return () => {
      sizes.disconnect();
      next.dispose();
      setRenderer(null);
    };
  }, [style, scale, anchor, sides, reach, edgeFade]);

  // `name` changes with the palette, which can change what `color` resolves to.
  useEffect(() => {
    if (renderer) renderer.setColors({ color: computedRgb(canvasRef.current!), ...TONES[mode] });
  }, [renderer, color, mode, name]);

  useEffect(() => {
    if (!renderer) return;
    const seconds = (now: number) => (now - epoch.current) / 1000;
    if (!animate || still) {
      renderer.draw(seconds(performance.now()));
      return;
    }
    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (now - last < FRAME_MS) return;
      last = now;
      renderer.draw(seconds(now));
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [renderer, animate, still]);

  if (unsupported) return null;
  return <canvas ref={canvasRef} className={className} style={{ color }} />;
}
