// Home wallpaper: art behind the home screen (the new-thread page that Cmd+N
// opens), drawn as an ASCII texture by default. Chosen with the plugin's
// "Home wallpaper", "Custom wallpaper image", and "Wallpaper style" settings.
import { useEffect, useRef, useState } from "react";
import { experimental_usePluginId as usePluginId, useSettings } from "@get-bb/plugin-sdk/app";
import "./wallpaper.css";

/** Glyphs from empty to dense; a cell's darkness picks one. */
const RAMP = " .:-=+*#%@";
/** Glyph cell size in CSS pixels on the home screen. */
const HOME_CELL = { w: 5, h: 9 };
/** Source pixels lighter than this are background and stay blank. */
const BACKGROUND_LUMA = 0.94;

/** Where to load the selected wallpaper from, or null when none is set. */
function wallpaperSrc(pluginId: string, wallpaper: string, custom: string): string | null {
  if (wallpaper === "none") return null;
  const v = custom.trim();
  if (wallpaper === "custom") {
    if (/^https?:\/\//i.test(v)) return v;
    if (!v.startsWith("/") && !v.startsWith("~/")) return null;
  }
  // The plugin's `/wallpaper` route serves bundled art and custom local files.
  // The query changes only when the choice changes, so the browser refetches then.
  const key = wallpaper === "custom" ? `custom:${v}` : wallpaper;
  return `/api/v1/plugins/${encodeURIComponent(pluginId)}/http/wallpaper?v=${encodeURIComponent(key)}`;
}

/** A glyph color that keeps the pixel's hue but stays legible on the canvas. */
function tint(r: number, g: number, b: number, darkCanvas: boolean): string {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    const [rn, gn, bn] = [r / 255, g / 255, b / 255];
    h = max === rn ? ((gn - bn) / d) % 6 : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
    h *= 60;
  }
  const sat = Math.min(100, s * 130);
  const light = darkCanvas ? 62 + l * 18 : 30 + l * 15;
  return `hsl(${Math.round((h + 360) % 360)} ${Math.round(sat)}% ${Math.round(light)}%)`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Remote images must allow CORS for the ASCII pass to read their pixels.
    if (/^https?:/i.test(src)) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src}`));
    img.src = src;
  });
}

/** Draws `img` into `canvas` as glyphs, fit to the canvas width and anchored to its bottom. */
type Cell = { w: number; h: number };

/** One drawn glyph, kept so the living wallpaper can redraw it. */
type Glyph = { x: number; y: number; level: number; color: string };

function drawAscii(canvas: HTMLCanvasElement, img: HTMLImageElement, ink: string, colorful: boolean, cell: Cell): Glyph[] {
  const CELL_W = cell.w;
  const CELL_H = cell.h;
  const { width, height } = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const cols = Math.floor(width / CELL_W);
  const rows = Math.floor(height / CELL_H);
  if (cols < 1 || rows < 1) return [];

  // Sample one pixel per cell: the image spans the full width, sits on the
  // bottom edge, and is cropped at the top only when it is taller than the pane.
  const sample = document.createElement("canvas");
  sample.width = cols;
  sample.height = rows;
  const sctx = sample.getContext("2d", { willReadFrequently: true })!;
  const drawnRows = Math.min(rows, Math.round((cols * CELL_W * img.naturalHeight) / img.naturalWidth / CELL_H));
  const visibleSrcH = (drawnRows * CELL_H * img.naturalWidth) / (cols * CELL_W);
  sctx.drawImage(img, 0, img.naturalHeight - visibleSrcH, img.naturalWidth, visibleSrcH, 0, rows - drawnRows, cols, drawnRows);
  const pixels = sctx.getImageData(0, 0, cols, rows).data;

  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = ink;
  ctx.font = `${CELL_H}px ui-monospace, "SF Mono", Menlo, monospace`;
  ctx.textBaseline = "top";
  const darkCanvas = document.documentElement.classList.contains("dark");
  const glyphs: Glyph[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 4;
      const alpha = pixels[i + 3]! / 255;
      const luma = (0.2126 * pixels[i]! + 0.7152 * pixels[i + 1]! + 0.0722 * pixels[i + 2]!) / 255;
      const light = 1 - alpha * (1 - luma);
      if (light >= BACKGROUND_LUMA) continue;
      // A square-root curve lifts light subject areas (skin, cloth) off the blank background.
      const darkness = Math.sqrt((BACKGROUND_LUMA - light) / BACKGROUND_LUMA);
      const level = Math.min(RAMP.length - 1, Math.max(1, Math.round(darkness * (RAMP.length - 1))));
      const color = colorful ? tint(pixels[i]!, pixels[i + 1]!, pixels[i + 2]!, darkCanvas) : ink;
      ctx.fillStyle = color;
      ctx.fillText(RAMP[level]!, x * CELL_W, y * CELL_H);
      glyphs.push({ x: x * CELL_W, y: y * CELL_H, level, color });
    }
  }
  return glyphs;
}

const FLICKER_MS = 120;
const FLICKER_SHARE = 0.025;

/**
 * Living wallpaper: every tick, a small share of glyphs re-roll one step
 * denser or lighter than their drawn level, like a terminal printout
 * breathing. Returns a stop function.
 */
function flicker(canvas: HTMLCanvasElement, glyphs: Glyph[], cell: Cell): () => void {
  if (!glyphs.length || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return () => {};
  const ctx = canvas.getContext("2d")!;
  const timer = window.setInterval(() => {
    if (document.hidden) return;
    const count = Math.ceil(glyphs.length * FLICKER_SHARE);
    for (let n = 0; n < count; n++) {
      const g = glyphs[Math.floor(Math.random() * glyphs.length)]!;
      const shift = Math.floor(Math.random() * 3) - 1;
      const level = Math.min(RAMP.length - 1, Math.max(1, g.level + shift));
      ctx.clearRect(g.x, g.y, cell.w, cell.h);
      ctx.fillStyle = g.color;
      ctx.fillText(RAMP[level]!, g.x, g.y);
    }
  }, FLICKER_MS);
  return () => window.clearInterval(timer);
}

/** Canvas that draws `src` as ASCII art; falls back to the photo if pixels can't be read. */
export function AsciiArt({
  src,
  colorful,
  cell = HOME_CELL,
  className = "bbb-wallpaper-ascii",
  living = false,
}: {
  src: string;
  colorful: boolean;
  cell?: Cell;
  className?: string;
  living?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let image: HTMLImageElement | null = null;
    let cancelled = false;
    let stopFlicker = () => {};
    const redraw = () => {
      if (!image) return;
      stopFlicker();
      const glyphs = drawAscii(canvas, image, getComputedStyle(canvas).color, colorful, cell);
      if (living) stopFlicker = flicker(canvas, glyphs, cell);
    };
    loadImage(src).then(
      (img) => {
        if (cancelled) return;
        image = img;
        try {
          redraw();
        } catch {
          // A remote image without CORS taints the canvas; show it as a photo.
          setFailed(true);
        }
      },
      () => !cancelled && setFailed(true),
    );
    const observer = new ResizeObserver(redraw);
    observer.observe(canvas);
    return () => {
      cancelled = true;
      stopFlicker();
      observer.disconnect();
    };
  }, [src, colorful, cell, living]);
  if (failed) return <img className="bbb-wallpaper-photo" src={src} alt="" />;
  return <canvas ref={canvasRef} className={className} />;
}

export function HomeWallpaper() {
  const pluginId = usePluginId();
  const { values } = useSettings();
  const wallpaper = typeof values?.wallpaper === "string" ? values.wallpaper : "none";
  const custom = typeof values?.customWallpaper === "string" ? values.customWallpaper : "";
  const src = wallpaperSrc(pluginId, wallpaper, custom);
  if (!src) return null;
  const style = values?.wallpaperStyle;
  const living = values?.livingWallpaper !== false && style !== "photo";
  return (
    <div className="bbb-wallpaper" data-style={style} data-living={living || undefined} aria-hidden="true">
      {style === "photo" ? (
        <img className="bbb-wallpaper-photo" src={src} alt="" decoding="async" />
      ) : (
        <AsciiArt key={src} src={src} colorful={style !== "ascii"} living={living} />
      )}
    </div>
  );
}
