// The plugin's typography in this window: the UI font and the text size, both
// written as inline custom properties on <html>, which outrank theme
// stylesheets. A content script owns them, so they apply as soon as the
// plugin loads and disappear when it unloads.
import { fontStack, googleFontsHref, normalizeFont, parseFont, type FontValue } from "./fonts";
import type { Preferences } from "./server";

export type Typography = Pick<Preferences, "font" | "fontScale">;

const CACHE_KEY = "beautiful-bb:typography";
const FONT_LINK = "data-bbb-font";

/** The text-size tokens bb and its themes define; each also has a `--line-height` twin. */
const TEXT_TOKENS = ["2xs", "xs", "sm", "base", "lg", "xl", "2xl"].flatMap((step) => [
  `--text-${step}`,
  `--text-${step}--line-height`,
]);

function clearFontScale() {
  const style = document.documentElement.style;
  for (const token of TEXT_TOKENS) style.removeProperty(token);
}

/** A rem length scaled by `percent`; null for unitless ratios, which already follow the text. */
function scaleRem(value: string, percent: number): string | null {
  const rem = /^\s*([\d.]+)rem\s*$/.exec(value);
  return rem ? `${((Number(rem[1]) * percent) / 100).toFixed(4)}rem` : null;
}

function addStylesheet(key: string, href: string) {
  if (document.querySelector(`link[${FONT_LINK}="${key}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.setAttribute(FONT_LINK, key);
  document.head.append(link);
}

/** Loads just the glyphs in `text` of a Google family, for drawing its name in a picker. */
export function loadFontSample(family: string, text: string) {
  addStylesheet(`sample:${family}`, googleFontsHref(family, text));
}

function applyFont(value: FontValue) {
  const choice = parseFont(value);
  const stack = fontStack(choice);
  const style = document.documentElement.style;
  if (!stack) {
    style.removeProperty("--font-sans");
    return;
  }
  if (choice.kind === "google") addStylesheet(`font:${choice.family}`, googleFontsHref(choice.family));
  style.setProperty("--font-sans", stack);
}

/**
 * Scales the --text-* tokens bb and the active theme define right now, read
 * live rather than copied, so the plugin never fights them. At 100% nothing is
 * written. Re-run it when the theme changes, since themes set these tokens.
 */
export function applyFontScale(percent: number) {
  clearFontScale();
  if (percent === 100) return;
  const live = getComputedStyle(document.documentElement);
  const style = document.documentElement.style;
  for (const token of TEXT_TOKENS) {
    const scaled = scaleRem(live.getPropertyValue(token), percent);
    if (scaled) style.setProperty(token, scaled);
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
    if (typeof font !== "string" || typeof fontScale !== "number") return null;
    return { font: normalizeFont(font), fontScale };
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
    clearFontScale();
    document.querySelectorAll(`link[${FONT_LINK}]`).forEach((link) => link.remove());
  };
}
