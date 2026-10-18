// The theme pack. Every theme is T3 Night (themes/t3-night.src.css) plus a
// palette. One accent hue drives everything: bb's primary (buttons, links,
// focus rings, selection), file paths, sidebar status tones, and the plugin's
// own pieces. Semantic red/green/amber stay as they are. Each palette has accent and primary colors, the sidebar banner tint, code colors,
// and a wallpaper it pairs with. Colors are [lightness, chroma, hue] in OKLCH.
// scripts/build-themes.mjs turns this into theme CSS, VS Code code themes,
// and the manifest's bb.themes list.

export const THEMES = [
  {
    id: "t3-night",
    name: "T3 Night",
    description: "T3 Code's zinc palette with a lavender accent and a starry sidebar",
    wallpaper: "headphones",
    accent: { light: [0.55, 0.17, 295], dark: [0.78, 0.11, 295] },
    primary: { light: [0.52, 0.17, 295], dark: [0.74, 0.12, 295] },
    banner: null, // keep the base night-sky banner
    code: { keyword: 295, string: 155, func: 250, constant: 25, type: 200 },
  },
  {
    id: "sakura",
    name: "Sakura",
    description: "Soft pink accents and a blossom-dusk sidebar",
    wallpaper: "kitsune",
    accent: { light: [0.58, 0.17, 355], dark: [0.8, 0.1, 355] },
    primary: { light: [0.55, 0.19, 355], dark: [0.76, 0.12, 355] },
    banner: { top: [0.25, 0.09, 350], mid: [0.18, 0.05, 330], glowA: [0.6, 0.18, 0], glowB: [0.55, 0.12, 320] },
    code: { keyword: 355, string: 140, func: 310, constant: 40, type: 200 },
  },
  {
    id: "terminal",
    name: "Terminal",
    description: "Phosphor green on black, monospace everywhere",
    wallpaper: "coder",
    accent: { light: [0.5, 0.14, 150], dark: [0.84, 0.17, 150] },
    primary: { light: [0.5, 0.15, 150], dark: [0.8, 0.17, 150] },
    banner: { top: [0.2, 0.07, 150], mid: [0.15, 0.04, 160], glowA: [0.55, 0.16, 145], glowB: [0.45, 0.1, 180] },
    code: { keyword: 150, string: 110, func: 175, constant: 85, type: 195 },
    monospace: true,
  },
  {
    id: "ember",
    name: "Ember",
    description: "Warm reds and oranges with a glowing ember sidebar",
    wallpaper: "samurai",
    accent: { light: [0.56, 0.18, 35], dark: [0.77, 0.14, 40] },
    primary: { light: [0.55, 0.2, 30], dark: [0.74, 0.15, 38] },
    banner: { top: [0.24, 0.09, 30], mid: [0.17, 0.05, 20], glowA: [0.6, 0.2, 40], glowB: [0.5, 0.15, 10] },
    code: { keyword: 30, string: 95, func: 55, constant: 0, type: 200 },
  },
];
