// The home wallpapers and shader colors the plugin offers. Shared by the server
// (setting values and image routes) and the app (rendering and pickers), so it
// holds data only. Every list of wallpaper ids or labels derives from here.

/** Original anime pieces bundled in assets/wallpapers/<id>.jpg. */
export const ART = [
  { id: "headphones", label: "Headphones girl" },
  { id: "coder", label: "Late-night coder" },
  { id: "capybara", label: "Astronaut capybara" },
  { id: "kitsune", label: "Sleeping kitsune" },
  { id: "samurai", label: "Samurai" },
  { id: "robot", label: "Robot buddy" },
] as const;

export type ArtId = (typeof ART)[number]["id"];

/** Wallpapers drawn live by a WebGL shader rather than from an image. */
export const SHADERS = [
  { id: "dither", label: "Dither" },
  { id: "glow", label: "Glow" },
] as const;

export type ShaderId = (typeof SHADERS)[number]["id"];

export const WALLPAPERS = [
  { id: "none", label: "None" },
  ...SHADERS,
  ...ART,
  { id: "custom", label: "Custom image" },
] as const;

export type WallpaperId = (typeof WALLPAPERS)[number]["id"];

export const WALLPAPER_IDS = WALLPAPERS.map((w) => w.id) as [WallpaperId, ...WallpaperId[]];

export const DEFAULT_WALLPAPER: WallpaperId = "dither";

export function isArt(id: WallpaperId): id is ArtId {
  return ART.some((a) => a.id === id);
}

export function isShader(id: WallpaperId): id is ShaderId {
  return SHADERS.some((s) => s.id === id);
}

/** Shader colors as CSS colors; theme-following entries use bb's tokens. */
export const SHADER_COLORS = [
  { id: "teal", label: "Teal", css: "#5cccbd" },
  { id: "indigo", label: "Indigo", css: "#6b85ff" },
  { id: "amber", label: "Amber", css: "#ffad5c" },
  { id: "rose", label: "Rose", css: "#ff80a8" },
  { id: "accent", label: "Theme accent", css: "var(--bbb-accent, var(--primary))" },
  { id: "neutral", label: "Neutral", css: "var(--foreground)" },
] as const;

export type ShaderColorId = (typeof SHADER_COLORS)[number]["id"];

export const SHADER_COLOR_IDS = SHADER_COLORS.map((c) => c.id) as [ShaderColorId, ...ShaderColorId[]];

export const SHADER_COLOR_CSS = Object.fromEntries(SHADER_COLORS.map((c) => [c.id, c.css])) as Record<ShaderColorId, string>;

export const DEFAULT_SHADER_COLOR: ShaderColorId = "indigo";
