// Builds the theme pack from scripts/themes.mjs:
//   themes/<id>.css               T3 Night base + the theme's palette, banner inlined
//   themes/<id>-code-{dark,light}.json   VS Code themes for diffs and code blocks
//   package.json bb.themes        the list bb shows in Settings → Appearance
// bb serves theme CSS as one stylesheet, so the banner image is inlined.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { THEMES } from "./themes.mjs";

const root = join(import.meta.dirname, "..");
const MAX_BYTES = 256 * 1024;

const oklch = ([l, c, h], alpha) => `oklch(${l} ${c} ${h}${alpha === undefined ? "" : ` / ${alpha}`})`;

/** OKLCH to #rrggbb, for VS Code theme files (which take hex only). */
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

function paletteCss(theme) {
  const { accent, primary, banner } = theme;
  // Status tones used by the BB Sidebar plugin's thread list. Its stylesheet
  // loads after the theme with the same selectors, so these use html-qualified
  // selectors to win.
  const tones = (mode) => `  --bb-sidebar-tone-working: ${oklch(accent[mode])};\n  --bb-sidebar-tone-pending: ${oklch(accent[mode])};\n`;
  let css = `
/* ${theme.name}: ${theme.description}. Generated from scripts/themes.mjs. */
:root,
.light {
  --bbb-accent: ${oklch(accent.light)};
  --primary: ${oklch(primary.light)};
  --primary-foreground: #ffffff;
  --file-accent: ${oklch(primary.light)};
${theme.monospace ? "  --font-sans: var(--font-mono);\n" : ""}}
.dark {
  --bbb-accent: ${oklch(accent.dark)};
  --primary: ${oklch(primary.dark)};
  --primary-foreground: #0a0a0a;
  --file-accent: ${oklch(accent.dark)};
}
html:not(.dark),
html .light {
${tones("light")}}
html.dark,
html .dark {
${tones("dark")}}
`;
  if (banner) {
    css += `
.dark [data-sidebar="sidebar"]::before {
  background:
    radial-gradient(80% 60% at 80% 0%, ${oklch(banner.glowA, "45%")}, transparent 70%),
    radial-gradient(70% 50% at 10% 75%, ${oklch(banner.glowB, "35%")}, transparent 70%),
    linear-gradient(to bottom, ${oklch(banner.top)}, ${oklch(banner.mid)} 60%, ${oklch(banner.mid, "0%")});
}
`;
  }
  return css;
}

function codeTheme(theme, type) {
  const dark = type === "dark";
  const L = dark ? 0.8 : 0.5;
  const C = dark ? 0.12 : 0.16;
  const tone = (hue) => hex([L, C, hue]);
  const { keyword, string, func, constant, type: typeHue } = theme.code;
  const fg = dark ? "#e4e4e7" : "#27272a";
  const comment = dark ? "#71717a" : "#a1a1aa";
  const rule = (scope, foreground, fontStyle) => ({ scope, settings: { foreground, ...(fontStyle ? { fontStyle } : {}) } });
  return {
    name: `${theme.id}-${type}`,
    type,
    colors: {
      "editor.background": dark ? "#0c0c0d" : "#fcfcfc",
      "editor.foreground": fg,
      "editorLineNumber.foreground": dark ? "#3f3f46" : "#d4d4d8",
      "editor.selectionBackground": hex([L, C, keyword]) + "40",
      "diffEditor.insertedTextBackground": dark ? "#34d39926" : "#10b98126",
      "diffEditor.removedTextBackground": dark ? "#f8717126" : "#ef444426",
    },
    tokenColors: [
      rule(["comment", "punctuation.definition.comment"], comment, "italic"),
      rule(["keyword", "storage", "storage.type", "keyword.control"], tone(keyword)),
      rule(["string", "string.quoted", "markup.inline.raw"], tone(string)),
      rule(["entity.name.function", "support.function", "meta.function-call"], tone(func)),
      rule(["constant", "constant.numeric", "constant.language", "variable.other.constant"], tone(constant)),
      rule(["entity.name.type", "support.type", "entity.name.class", "entity.other.inherited-class"], tone(typeHue)),
      rule(["entity.name.tag", "support.class.component"], tone(keyword)),
      rule(["entity.other.attribute-name"], tone(func)),
      rule(["variable", "variable.parameter", "meta.definition.variable"], fg),
      rule(["punctuation", "meta.brace"], dark ? "#a1a1aa" : "#71717a"),
      rule(["markup.heading"], tone(keyword), "bold"),
      rule(["markup.inserted"], dark ? "#34d399" : "#059669"),
      rule(["markup.deleted"], dark ? "#f87171" : "#dc2626"),
    ],
  };
}

const banner = readFileSync(join(root, "assets", "space-banner.jpg")).toString("base64");
const base = readFileSync(join(root, "themes", "t3-night.src.css"), "utf8").replaceAll(
  "__SPACE_BANNER__",
  `data:image/jpeg;base64,${banner}`,
);

const manifestThemes = [];
for (const theme of THEMES) {
  const css = base + paletteCss(theme);
  const size = Buffer.byteLength(css);
  if (size > MAX_BYTES) throw new Error(`${theme.id}: ${size} bytes exceeds bb's ${MAX_BYTES}-byte theme limit`);
  writeFileSync(join(root, "themes", `${theme.id}.css`), css);
  for (const type of ["dark", "light"]) {
    writeFileSync(join(root, "themes", `${theme.id}-code-${type}.json`), JSON.stringify(codeTheme(theme, type), null, 2) + "\n");
  }
  manifestThemes.push({
    id: theme.id,
    name: theme.name,
    description: theme.description,
    css: `./themes/${theme.id}.css`,
    codeTheme: { dark: `./themes/${theme.id}-code-dark.json`, light: `./themes/${theme.id}-code-light.json` },
  });
  console.log(`themes/${theme.id}.css: ${size} bytes`);
}

const pkgPath = join(root, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
pkg.bb.themes = manifestThemes;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

// The settings page and wallpaper need the same list at runtime.
writeFileSync(
  join(root, "theme-pack.ts"),
  `// Generated by scripts/build-themes.mjs from scripts/themes.mjs.\n` +
    `export const THEME_PACK = ${JSON.stringify(
      THEMES.map((t) => ({ id: t.id, name: t.name, description: t.description, wallpaper: t.wallpaper, accent: oklch(t.accent.dark) })),
      null,
      2,
    )} as const;\n`,
);
