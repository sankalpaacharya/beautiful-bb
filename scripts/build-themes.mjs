// Builds the theme pack from scripts/themes.mjs:
//   themes/<id>.css                   T3 Night base + the theme's palette, banner inlined
//   themes/<id>-code-{dark,light}.json  only for themes with code: "generated"
//   package.json bb.themes            the list bb shows in Settings → Appearance
//   theme-pack.ts                     names, swatches, and pairings for the frontend
// bb serves theme CSS as one stylesheet, so the banner image is inlined.
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

/** Surfaces and text for one mode, derived from the theme's own colors. */
function modeVars(p, dark) {
  const mix = (color, pct, base = p.bg) => `color-mix(in srgb, ${color} ${pct}%, ${base})`;
  return `  --canvas: ${p.bg};
  --ink: ${p.fg};
  --card: ${dark ? mix(p.fg, 4) : mix("#ffffff", 55)};
  --popover: ${dark ? mix(p.fg, 5) : mix("#ffffff", 65)};
  --secondary: ${mix(p.fg, dark ? 4 : 5)};
  --muted: ${mix(p.fg, dark ? 4 : 5)};
  --accent: ${mix(p.fg, dark ? 6 : 8)};
  --border: ${mix(p.fg, dark ? 9 : 14)};
  --border-hairline: ${mix(p.fg, dark ? 9 : 14)};
  --border-seam: ${mix(p.fg, dark ? 8 : 12)};
  --input: ${mix(p.fg, dark ? 14 : 22)};
  --sidebar: ${p.sidebar};
  --sidebar-foreground: ${p.fg};
  --sidebar-accent: ${mix(p.fg, dark ? 6 : 8, p.sidebar)};
  --sidebar-border: ${mix(p.fg, dark ? 8 : 12, p.sidebar)};
  --surface-selected: ${mix(p.fg, dark ? 7 : 9, p.sidebar)};
  --surface-selected-border: ${mix(p.fg, dark ? 12 : 16, p.sidebar)};
  --muted-foreground: ${p.muted};
  --primary: ${p.accent};
  --primary-foreground: ${dark ? p.bg : "#ffffff"};
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

/** The sidebar banner, tinted from the theme's accent and glow colors. */
function bannerCss(p, dark) {
  const scope = dark ? ".dark " : ":root:not(.dark) ";
  return `
${scope}[data-sidebar="sidebar"]::before {
  background:
    radial-gradient(80% 60% at 80% 0%, color-mix(in srgb, ${p.glow} ${dark ? 38 : 30}%, transparent), transparent 70%),
    radial-gradient(70% 50% at 10% 75%, color-mix(in srgb, ${p.accent} ${dark ? 28 : 22}%, transparent), transparent 70%),
    linear-gradient(to bottom, color-mix(in srgb, ${p.accent} ${dark ? 22 : 18}%, ${p.sidebar}), ${p.sidebar} 70%, transparent);
}
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
${bannerCss(light, false)}`
    : `
:root,
.light {
  --bbb-accent: ${theme.lightAccent};
  --primary: ${theme.lightAccent};
  --primary-foreground: #ffffff;
  --file-accent: ${theme.lightAccent};
}
`;
  // The Hubble starfield layer belongs to T3 Night; other themes keep only
  // their own tinted banner.
  const darkCss = `
.dark {
${modeVars(dark, true)}}
${bannerCss(dark, true)}
.dark [data-sidebar="sidebar"]::after {
  display: none;
}
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

const banner = readFileSync(join(root, "assets", "space-banner.jpg")).toString("base64");
const base = readFileSync(join(root, "themes", "t3-night.src.css"), "utf8").replaceAll(
  "__SPACE_BANNER__",
  `data:image/jpeg;base64,${banner}`,
);

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
    `export const THEME_PACK = ${JSON.stringify(
      THEMES.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        wallpaper: t.wallpaper,
        accent: t.base ? t.accent.dark : t.dark.accent,
        swatches: t.swatches,
      })),
      null,
      2,
    )} as const;\n`,
);
