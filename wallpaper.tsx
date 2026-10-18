// Home wallpaper: art behind the home screen (the new-thread page that Cmd+N
// opens), drawn as an ASCII texture by default. Chosen with the plugin's
// "Home wallpaper", "Custom wallpaper image", and "Wallpaper style" settings.
import { useEffect, useRef, useState } from "react";
import { experimental_usePluginId as usePluginId, useSettings } from "@get-bb/plugin-sdk/app";
import "./wallpaper.css";

/** Glyphs from empty to dense; a cell's darkness picks one. */
const RAMP = " .:-=+*#%@";
const CELL_W = 5;
const CELL_H = 9;
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
function drawAscii(canvas: HTMLCanvasElement, img: HTMLImageElement, ink: string, colorful: boolean) {
  const { width, height } = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const cols = Math.floor(width / CELL_W);
  const rows = Math.floor(height / CELL_H);
  if (cols < 1 || rows < 1) return;

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
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 4;
      const alpha = pixels[i + 3]! / 255;
      const luma = (0.2126 * pixels[i]! + 0.7152 * pixels[i + 1]! + 0.0722 * pixels[i + 2]!) / 255;
      const light = 1 - alpha * (1 - luma);
      if (light >= BACKGROUND_LUMA) continue;
      // A square-root curve lifts light subject areas (skin, cloth) off the blank background.
      const darkness = Math.sqrt((BACKGROUND_LUMA - light) / BACKGROUND_LUMA);
      const glyph = RAMP[Math.min(RAMP.length - 1, Math.max(1, Math.round(darkness * (RAMP.length - 1))))]!;
      if (colorful) ctx.fillStyle = tint(pixels[i]!, pixels[i + 1]!, pixels[i + 2]!, darkCanvas);
      ctx.fillText(glyph, x * CELL_W, y * CELL_H);
    }
  }
}

function AsciiWallpaper({ src, colorful }: { src: string; colorful: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let image: HTMLImageElement | null = null;
    let cancelled = false;
    const redraw = () => {
      if (image) drawAscii(canvas, image, getComputedStyle(canvas).color, colorful);
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
      observer.disconnect();
    };
  }, [src, colorful]);
  if (failed) return <img className="bbb-wallpaper-photo" src={src} alt="" />;
  return <canvas ref={canvasRef} className="bbb-wallpaper-ascii" />;
}

export function HomeWallpaper() {
  const pluginId = usePluginId();
  const { values } = useSettings();
  const wallpaper = typeof values?.wallpaper === "string" ? values.wallpaper : "none";
  const custom = typeof values?.customWallpaper === "string" ? values.customWallpaper : "";
  const src = wallpaperSrc(pluginId, wallpaper, custom);
  if (!src) return null;
  const style = values?.wallpaperStyle;
  return (
    <div className="bbb-wallpaper" data-style={style} aria-hidden="true">
      {style === "photo" ? (
        <img className="bbb-wallpaper-photo" src={src} alt="" decoding="async" />
      ) : (
        <AsciiWallpaper key={src} src={src} colorful={style !== "ascii"} />
      )}
    </div>
  );
}
