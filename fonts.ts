// The UI font setting. Shared by the server (which stores and validates it)
// and the app (which loads the font and sets --font-sans), so it holds data
// and pure functions only.
//
// The stored value is "theme" (keep the theme's own font), "inter" (bb's
// bundled Inter), or "google:<Family>" for any Google Fonts family.

export type FontValue = "theme" | "inter" | `google:${string}`;

export type FontChoice = { kind: "theme" } | { kind: "inter" } | { kind: "google"; family: string };

/** One entry of the Google Fonts catalog the server serves. */
export type CatalogFont = { family: string; category: string };

const GOOGLE = "google:";

/** Google family names are letters, digits, and spaces; this also keeps them safe in CSS and URLs. */
export const FAMILY_NAME = /^[A-Za-z0-9 ]{1,64}$/;

/** Ids of the fixed fonts earlier versions offered, now Google families. */
const LEGACY: Record<string, string> = { geist: "Geist", "ibm-plex-sans": "IBM Plex Sans", "shippori-mincho": "Shippori Mincho" };

export function googleFont(family: string): FontValue {
  return `${GOOGLE}${family}`;
}

/** Reads a stored value; legacy ids map to their families and anything unreadable falls back to the theme's font. */
export function normalizeFont(value: string): FontValue {
  if (value === "theme" || value === "inter") return value;
  if (value in LEGACY) return googleFont(LEGACY[value]!);
  const family = value.startsWith(GOOGLE) ? value.slice(GOOGLE.length) : "";
  return FAMILY_NAME.test(family) ? googleFont(family) : "theme";
}

export function parseFont(value: FontValue): FontChoice {
  if (value === "theme" || value === "inter") return { kind: value };
  return { kind: "google", family: value.slice(GOOGLE.length) };
}

export function fontLabel(choice: FontChoice): string {
  if (choice.kind === "theme") return "Theme default";
  if (choice.kind === "inter") return "Inter";
  return choice.family;
}

/** The --font-sans stack for a choice, or null to keep the theme's own. */
export function fontStack(choice: FontChoice): string | null {
  if (choice.kind === "theme") return null;
  // bb registers its bundled Inter as "Inter Variable".
  if (choice.kind === "inter") return '"Inter Variable", Inter, system-ui, sans-serif';
  return `"${choice.family}", system-ui, sans-serif`;
}

/** Google Fonts stylesheet for a family; `text` loads only those glyphs, for previews. */
export function googleFontsHref(family: string, text?: string): string {
  const subset = text ? `&text=${encodeURIComponent(text)}` : "";
  return `https://fonts.googleapis.com/css2?family=${family.replaceAll(" ", "+")}:wght@400;500;600;700${subset}&display=swap`;
}
