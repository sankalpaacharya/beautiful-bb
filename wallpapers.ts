// The home wallpapers and their colors. Shared by the server (setting values)
// and the app (rendering and pickers), so it holds data only. Every list of
// wallpaper ids or labels derives from here.

/** Wallpapers drawn live by a WebGL effect, each ported from React Bits. */
export const SHADERS = [
  { id: "dither", label: "Dither" },
  { id: "faulty-terminal", label: "Faulty terminal" },
  { id: "gradient-ascii", label: "Gradient ASCII" },
] as const;

export type ShaderId = (typeof SHADERS)[number]["id"];

export const WALLPAPERS = [{ id: "none", label: "None" }, ...SHADERS] as const;

export type WallpaperId = (typeof WALLPAPERS)[number]["id"];

export const WALLPAPER_IDS = WALLPAPERS.map((w) => w.id) as [WallpaperId, ...WallpaperId[]];

export const DEFAULT_WALLPAPER: WallpaperId = "dither";

/** Shader colors as CSS colors; theme-following entries use bb's tokens. */
export const SHADER_COLORS = [
  { id: "accent", label: "Theme accent", css: "var(--bbb-accent, var(--primary))" },
  { id: "teal", label: "Teal", css: "#5cccbd" },
  { id: "indigo", label: "Indigo", css: "#6b85ff" },
  { id: "amber", label: "Amber", css: "#ffad5c" },
  { id: "rose", label: "Rose", css: "#ff80a8" },
  { id: "neutral", label: "Neutral", css: "var(--foreground)" },
] as const;

export type ShaderColorId = (typeof SHADER_COLORS)[number]["id"];

export const SHADER_COLOR_IDS = SHADER_COLORS.map((c) => c.id) as [ShaderColorId, ...ShaderColorId[]];

export const SHADER_COLOR_CSS = Object.fromEntries(SHADER_COLORS.map((c) => [c.id, c.css])) as Record<ShaderColorId, string>;

export const DEFAULT_SHADER_COLOR: ShaderColorId = "accent";
