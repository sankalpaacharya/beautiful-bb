// Shader wallpaper: one of the WebGL effects, sized to its container, fed the
// wallpaper color and the theme's light or dark mode, and animated unless
// motion is off.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { experimental_useCodeTheme as useCodeTheme } from "@get-bb/plugin-sdk/app";
import { EFFECTS } from "./shaders/index";
import type { EffectLayout, EffectRenderer, Rgb } from "./shaders/types";
import type { ShaderId } from "./wallpapers";

const FRAME_MS = 1000 / 30;

/** The home pane: from the top and bottom edges, thin in the middle behind the composer. */
export const HOME_LAYOUT: EffectLayout = { anchor: "both", sides: true, reach: 0.7, edgeFade: 0 };

const ALPHA = { dark: 0.42, light: 0.5 } as const;

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
 * effect move; `scale` shrinks its cells, for previews.
 */
type ShaderWallpaperProps = {
  style: ShaderId;
  color: string;
  animate: boolean;
  layout?: EffectLayout;
  scale?: number;
  className?: string;
};

/**
 * Each effect gets its own canvas and state: a canvas keeps the first kind of
 * WebGL context it hands out, and the effects use different kinds.
 */
export function ShaderWallpaper(props: ShaderWallpaperProps) {
  return <EffectCanvas key={props.style} {...props} />;
}

function EffectCanvas({ style, color, animate, layout = HOME_LAYOUT, scale = 1, className }: ShaderWallpaperProps) {
  const { anchor, sides, reach, edgeFade } = layout;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [renderer, setRenderer] = useState<EffectRenderer | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  // A random start keeps each window's field from looking identical.
  const epoch = useRef(performance.now() - Math.random() * 600_000);
  const { mode, name } = useCodeTheme();
  const still = useSyncExternalStore(subscribeReducedMotion, () => reducedMotion.matches);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const next = EFFECTS[style](canvas, { layout: { anchor, sides, reach, edgeFade }, scale });
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
    if (renderer) renderer.setColors({ color: computedRgb(canvasRef.current!), alpha: ALPHA[mode], mode });
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
