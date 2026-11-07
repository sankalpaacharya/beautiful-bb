// The plugin's typography in this window: the UI font and the text size, both
// written as inline custom properties on <html>, which outrank theme
// stylesheets. A content script owns them, so they apply as soon as the
// plugin loads and disappear when it unloads.
import { FONT_BY_ID, FONT_IDS, type Font, type FontId } from "./fonts";
import type { Preferences } from "./server";

export type Typography = Pick<Preferences, "font" | "fontScale">;

const CACHE_KEY = "beautiful-bb:typography";
const FONT_LINK = "data-bbb-font";

/**
 * bb's desktop type scale in rem: [size, line height]. Line heights given as
 * rem scale with the text; bb's unitless ratios stay as they are.
 */
const TYPE_SCALE: Record<string, [number, number | null]> = {
  "2xs": [0.625, 0.875],
  xs: [0.75, 1],
  sm: [0.8125, null],
  base: [0.9375, 1.375],
  lg: [1.125, null],
  xl: [1.25, null],
  "2xl": [1.5, null],
};

function googleFontsHref(spec: string, text?: string) {
  const subset = text ? `&text=${encodeURIComponent(text)}` : "";
  return `https://fonts.googleapis.com/css2?family=${spec}${subset}&display=swap`;
}

function addStylesheet(key: string, href: string) {
  if (document.querySelector(`link[${FONT_LINK}="${key}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.setAttribute(FONT_LINK, key);
  document.head.append(link);
}

/** Loads just the glyphs in `text`, for drawing a font's sample tile. */
export function loadFontSample(font: Font, text: string) {
  if (font.source.kind === "web") addStylesheet(`${font.id}:sample`, googleFontsHref(font.source.spec, text));
}

function applyFont(id: FontId) {
  const { source } = FONT_BY_ID[id];
  const style = document.documentElement.style;
  if (source.kind === "theme") {
    style.removeProperty("--font-sans");
    return;
  }
  if (source.kind === "web") addStylesheet(id, googleFontsHref(source.spec));
  style.setProperty("--font-sans", source.family);
}

/** Rewrites bb's --text-* tokens. Touch screens keep bb's own mobile scale. */
export function applyFontScale(percent: number) {
  const style = document.documentElement.style;
  const fine = window.matchMedia("(pointer: fine)").matches;
  for (const [step, [size, lineHeight]] of Object.entries(TYPE_SCALE)) {
    if (!fine) {
      style.removeProperty(`--text-${step}`);
      style.removeProperty(`--text-${step}--line-height`);
      continue;
    }
    style.setProperty(`--text-${step}`, `${((size * percent) / 100).toFixed(4)}rem`);
    if (lineHeight !== null) style.setProperty(`--text-${step}--line-height`, `${((lineHeight * percent) / 100).toFixed(4)}rem`);
  }
}

/** Applies the font and text size and remembers them for the next launch. */
export function applyTypography({ font, fontScale }: Typography) {
  applyFont(font);
  applyFontScale(fontScale);
  localStorage.setItem(CACHE_KEY, JSON.stringify({ font, fontScale } satisfies Typography));
}

function cachedTypography(): Typography | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null");
    if (typeof value !== "object" || value === null) return null;
    const { font, fontScale } = value as Record<string, unknown>;
    if (!FONT_IDS.includes(font as FontId) || typeof fontScale !== "number") return null;
    return { font: font as FontId, fontScale };
  } catch {
    return null;
  }
}

/**
 * Content-script mount: applies the last-used typography before the settings
 * read returns, so launch doesn't reflow from the theme's font. The returned
 * disposer removes everything this module added.
 */
export function mountTypography(): () => void {
  const cached = cachedTypography();
  if (cached) {
    applyFont(cached.font);
    applyFontScale(cached.fontScale);
  }
  return () => {
    const style = document.documentElement.style;
    style.removeProperty("--font-sans");
    for (const step of Object.keys(TYPE_SCALE)) {
      style.removeProperty(`--text-${step}`);
      style.removeProperty(`--text-${step}--line-height`);
    }
    document.querySelectorAll(`link[${FONT_LINK}]`).forEach((link) => link.remove());
  };
}
