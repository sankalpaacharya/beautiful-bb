// Builds the theme pack from scripts/themes.mjs:
//   themes/<id>.css                   T3 Night base + the theme's palette
//   themes/<id>-code-{dark,light}.json  only for themes with code: "generated"
//   package.json bb.themes            the list bb shows in Settings → Appearance
//   theme-pack.ts                     names, swatches, and pairings for the frontend
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { THEMES } from "./themes.mjs";

const root = join(import.meta.dirname, "..");
const MAX_BYTES = 256 * 1024;

/** OKLCH [l, c, h] to #rrggbb, for generated VS Code theme files (hex only). */
function hex([l, c, h]) {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
  return `#${lin
    .map((v) => {
      const s = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
      return Math.round(Math.min(Math.max(s, 0), 1) * 255)
        .toString(16)
        .padStart(2, "0");
    })
    .join("")}`;
}

/** #rrggbb to OKLCH [l, c, h]. */
function oklch(color) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(color.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const q = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * q;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * q;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * q;
  return [L, Math.hypot(A, B), ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360];
}

/**
 * The surface ladder every pack theme shares, in OKLCH lightness. Large
 * surfaces stay near-neutral (Linear, Material You, Radix, and Catppuccin's app
 * ports all keep their chroma low) and step by lightness only; the theme's
 * identity lives in its accent and text colors. A ported editor background is
 * often chroma 0.02-0.03, which is what made whole windows read navy or plum.
 */
const LADDER = {
  dark: {
    surface: { sidebar: 0.145, canvas: 0.16, card: 0.185, muted: 0.19, popover: 0.21, hover: 0.215, selected: 0.2 },
    line: { seam: 0.22, hairline: 0.24, border: 0.26, selectedBorder: 0.26, input: 0.27 },
  },
  light: {
    surface: { sidebar: 0.965, canvas: 0.985, card: 0.995, muted: 0.955, popover: 1, hover: 0.945, selected: 0.925 },
    line: { seam: 0.93, hairline: 0.92, border: 0.9, selectedBorder: 0.88, input: 0.87 },
  },
};
const MAX_CHROMA = { surface: { dark: 0.008, light: 0.006 }, line: { dark: 0.014, light: 0.012 } };

/** The ladder tinted with a hint of the theme background's hue. */
function ladder(bg, dark) {
  const [, c, h] = oklch(bg);
  const mode = dark ? "dark" : "light";
  const tint = (tier, l) => hex([l, Math.min(c, MAX_CHROMA[tier][mode]), h]);
  const pick = (tier) => Object.fromEntries(Object.entries(LADDER[mode][tier]).map(([k, l]) => [k, tint(tier, l)]));
  return { ...pick("surface"), ...pick("line") };
}

// Status tones used by the BB Sidebar plugin's thread list. Its stylesheet
// loads after the theme with the same selectors, so these use html-qualified
// selectors to win.
const tones = (light, dark) => `
html:not(.dark),
html .light {
  --bb-sidebar-tone-working: ${light};
  --bb-sidebar-tone-pending: ${light};
}
html.dark,
html .dark {
  --bb-sidebar-tone-working: ${dark};
  --bb-sidebar-tone-pending: ${dark};
}
`;

/** Accent-only overrides on the T3 Night base (T3 Night itself). */
function accentCss(theme) {
  return `
:root,
.light {
  --bbb-accent: ${theme.accent.light};
  --primary: ${theme.primary.light};
  --primary-foreground: #ffffff;
  --file-accent: ${theme.primary.light};
}
.dark {
  --bbb-accent: ${theme.accent.dark};
  --primary: ${theme.primary.dark};
  --primary-foreground: #0a0a0a;
  --file-accent: ${theme.accent.dark};
}
${tones(theme.accent.light, theme.accent.dark)}`;
}

/** Surfaces from the shared ladder; text, accent, and status colors from the theme itself. */
function modeVars(p, dark) {
  const s = ladder(p.bg, dark);
  return `  --canvas: ${s.canvas};
  --ink: ${p.fg};
  --card: ${s.card};
  --popover: ${s.popover};
  --secondary: ${s.muted};
  --muted: ${s.muted};
  --accent: ${s.hover};
  --border: ${s.border};
  --border-hairline: ${s.hairline};
  --border-seam: ${s.seam};
  --input: ${s.input};
  --sidebar: ${s.sidebar};
  --sidebar-foreground: ${p.fg};
  --sidebar-accent: ${s.muted};
  --sidebar-border: ${s.seam};
  --surface-selected: ${s.selected};
  --surface-selected-border: ${s.selectedBorder};
  --muted-foreground: ${p.muted};
  --primary: ${p.accent};
  --primary-foreground: ${dark ? s.canvas : "#ffffff"};
  --file-accent: ${p.accent};
  --bbb-accent: ${p.accent};
  --destructive: ${p.red};
  --destructive-text: ${p.red};
  --warning: ${p.yellow};
  --warning-text: ${p.yellow};
  --attention: ${p.yellow};
  --success: ${p.green};
  --diff-added: ${p.green};
  --diff-removed: ${p.red};
`;
}

function paletteCss(theme) {
  if (theme.base) return accentCss(theme);
  const { dark, light } = theme;
  // Light first: ":root" also matches in dark mode, so the .dark block must
  // come after it to win, as in the base stylesheet.
  const lightCss = light
    ? `
:root,
.light {
${modeVars(light, false)}}
`
    : `
:root,
.light {
  --bbb-accent: ${theme.lightAccent};
  --primary: ${theme.lightAccent};
  --primary-foreground: #ffffff;
  --file-accent: ${theme.lightAccent};
}
`;
  const darkCss = `
.dark {
${modeVars(dark, true)}}
`;
  return lightCss + darkCss + tones(light ? light.accent : theme.lightAccent, dark.accent);
}

function generatedCode(theme, type) {
  const isDark = type === "dark";
  const tone = (hue) => hex([isDark ? 0.8 : 0.5, isDark ? 0.12 : 0.16, hue]);
  const { keyword, string, func, constant, type: typeHue } = theme.codeHues;
  const fg = isDark ? "#e4e4e7" : "#27272a";
  const rule = (scope, foreground, fontStyle) => ({ scope, settings: { foreground, ...(fontStyle ? { fontStyle } : {}) } });
  return {
    name: `${theme.id}-${type}`,
    type,
    colors: {
      "editor.background": isDark ? "#0c0c0d" : "#fcfcfc",
      "editor.foreground": fg,
      "editorLineNumber.foreground": isDark ? "#3f3f46" : "#d4d4d8",
      "editor.selectionBackground": tone(keyword) + "40",
    },
    tokenColors: [
      rule(["comment", "punctuation.definition.comment"], isDark ? "#71717a" : "#a1a1aa", "italic"),
      rule(["keyword", "storage", "storage.type", "keyword.control"], tone(keyword)),
      rule(["string", "string.quoted", "markup.inline.raw"], tone(string)),
      rule(["entity.name.function", "support.function", "meta.function-call"], tone(func)),
      rule(["constant", "constant.numeric", "constant.language", "variable.other.constant"], tone(constant)),
      rule(["entity.name.type", "support.type", "entity.name.class"], tone(typeHue)),
      rule(["entity.name.tag", "support.class.component"], tone(keyword)),
      rule(["entity.other.attribute-name"], tone(func)),
      rule(["variable", "variable.parameter"], fg),
      rule(["punctuation", "meta.brace"], isDark ? "#a1a1aa" : "#71717a"),
      rule(["markup.inserted"], isDark ? "#34d399" : "#059669"),
      rule(["markup.deleted"], isDark ? "#f87171" : "#dc2626"),
    ],
  };
}

const base = readFileSync(join(root, "themes", "t3-night.src.css"), "utf8");

// Drop generated files from themes that left the pack.
const pkgPath = join(root, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const keep = new Set(THEMES.map((t) => t.id));
for (const old of pkg.bb.themes ?? []) {
  if (keep.has(old.id)) continue;
  for (const f of [`${old.id}.css`, `${old.id}-code-dark.json`, `${old.id}-code-light.json`]) {
    rmSync(join(root, "themes", f), { force: true });
  }
}

const manifestThemes = [];
for (const theme of THEMES) {
  const css = `${base}\n/* ${theme.name}: ${theme.description}. Generated from scripts/themes.mjs. */\n${paletteCss(theme)}`;
  const size = Buffer.byteLength(css);
  if (size > MAX_BYTES) throw new Error(`${theme.id}: ${size} bytes exceeds bb's ${MAX_BYTES}-byte theme limit`);
  writeFileSync(join(root, "themes", `${theme.id}.css`), css);
  let codeTheme = theme.code;
  if (theme.code === "generated") {
    codeTheme = {};
    for (const type of ["dark", "light"]) {
      const file = `${theme.id}-code-${type}.json`;
      writeFileSync(join(root, "themes", file), JSON.stringify(generatedCode(theme, type), null, 2) + "\n");
      codeTheme[type] = `./themes/${file}`;
    }
  }
  manifestThemes.push({ id: theme.id, name: theme.name, description: theme.description, css: `./themes/${theme.id}.css`, codeTheme });
  console.log(`themes/${theme.id}.css: ${size} bytes`);
}

pkg.bb.themes = manifestThemes;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

writeFileSync(
  join(root, "theme-pack.ts"),
  `// Generated by scripts/build-themes.mjs from scripts/themes.mjs.\n` +
    `type PackTheme = {\n  id: string;\n  name: string;\n  description: string;\n  accent: string;\n  swatches: readonly string[];\n};\n\n` +
    `export const THEME_PACK = ${JSON.stringify(
      THEMES.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        accent: t.base ? t.accent.dark : t.dark.accent,
        // The preview's background is the generated canvas, not the editor's.
        swatches: t.base ? t.swatches : [ladder(t.dark.bg, true).canvas, ...t.swatches.slice(1)],
      })),
      null,
      2,
    )} as const satisfies readonly PackTheme[];\n`,
);
