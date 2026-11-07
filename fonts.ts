// The UI fonts the settings page offers. Shared by the server (setting values)
// and the app (which loads web fonts and sets --font-sans), so it holds data
// only.

export type FontSource =
  /** Keep the active theme's own --font-sans. */
  | { kind: "theme" }
  /** A face bb's app bundle already registers. */
  | { kind: "bundled"; family: string }
  /** Loaded from Google Fonts; `spec` is a css2 `family=` value. */
  | { kind: "web"; family: string; spec: string };

export type Font = { id: string; name: string; detail: string; source: FontSource };

export const FONTS = [
  { id: "theme", name: "Theme default", detail: "The active theme's own font", source: { kind: "theme" } },
  {
    id: "inter",
    name: "Inter",
    detail: "Bundled with bb",
    // bb registers its bundled Inter as "Inter Variable".
    source: { kind: "bundled", family: '"Inter Variable", Inter, system-ui, sans-serif' },
  },
  {
    id: "geist",
    name: "Geist",
    detail: "Vercel's crisp UI sans",
    source: { kind: "web", family: '"Geist", system-ui, sans-serif', spec: "Geist:wght@400;500;600;700" },
  },
  {
    id: "ibm-plex-sans",
    name: "IBM Plex Sans",
    detail: "Friendly, slightly technical",
    source: { kind: "web", family: '"IBM Plex Sans", system-ui, sans-serif', spec: "IBM+Plex+Sans:wght@400;500;600;700" },
  },
  {
    id: "shippori-mincho",
    name: "Shippori Mincho",
    detail: "Japanese Mincho serif, with Latin",
    source: {
      kind: "web",
      family: '"Shippori Mincho", "Hiragino Mincho ProN", serif',
      spec: "Shippori+Mincho:wght@400;500;600;700;800",
    },
  },
] as const satisfies readonly Font[];

export type FontId = (typeof FONTS)[number]["id"];

export const FONT_IDS = FONTS.map((f) => f.id) as [FontId, ...FontId[]];

export const FONT_BY_ID = Object.fromEntries(FONTS.map((f) => [f.id, f])) as Record<FontId, Font>;
