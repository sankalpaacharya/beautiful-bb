// The theme pack: T3 Night plus popular editor themes in their official
// palettes (colors taken from each theme's own VS Code theme file). Every
// theme builds on themes/t3-night.src.css (fonts, larger type, polish)
// and swaps in its palette. One accent drives bb's primary (buttons, links,
// focus rings, selection), file paths, sidebar status tones, and the plugin's
// own pieces; red/green/yellow keep their meaning.
//
// `code` names bb's bundled Shiki theme for diffs and code blocks, or
// "generated" to build one from `codeHues`. `light: null` keeps T3 Night's
// zinc light mode with the theme's light accent.
// scripts/build-themes.mjs turns this into theme CSS, code themes, and the
// manifest's bb.themes list.

export const THEMES = [
  {
    id: "t3-night",
    name: "T3 Night",
    description: "T3 Code's zinc palette with a lavender accent",
    base: true,
    accent: { light: "oklch(0.55 0.17 295)", dark: "oklch(0.78 0.11 295)" },
    primary: { light: "oklch(0.52 0.17 295)", dark: "oklch(0.74 0.12 295)" },
    code: "generated",
    codeHues: { keyword: 295, string: 155, func: 250, constant: 25, type: 200 },
    swatches: ["#0a0a0a", "#b9a5f0", "#7aa2f7", "#34d399"],
  },
  {
    id: "tokyo-night",
    name: "Tokyo Night",
    description: "Deep navy with neon blues and purples, by enkia",
    dark: { bg: "#1a1b26", sidebar: "#16161e", fg: "#c0caf5", muted: "#737aa2", accent: "#7aa2f7", red: "#f7768e", green: "#9ece6a", yellow: "#e0af68" },
    light: { bg: "#e1e2e7", sidebar: "#d6d8df", fg: "#3760bf", muted: "#6172b0", accent: "#2e7de9", red: "#f52a65", green: "#587539", yellow: "#8c6c3e" },
    code: { dark: "tokyo-night", light: "github-light-default" },
    swatches: ["#1a1b26", "#7aa2f7", "#bb9af7", "#9ece6a"],
  },
  {
    id: "rose-pine",
    name: "Rosé Pine",
    description: "Soho vibes: muted plum with rose, iris, and gold",
    dark: { bg: "#191724", sidebar: "#1f1d2e", fg: "#e0def4", muted: "#908caa", accent: "#c4a7e7", red: "#eb6f92", green: "#9ccfd8", yellow: "#f6c177" },
    light: { bg: "#faf4ed", sidebar: "#fffaf3", fg: "#575279", muted: "#797593", accent: "#907aa9", red: "#b4637a", green: "#286983", yellow: "#ea9d34" },
    code: { dark: "rose-pine", light: "rose-pine-dawn" },
    swatches: ["#191724", "#c4a7e7", "#ebbcba", "#f6c177"],
  },
  {
    id: "kanagawa",
    name: "Kanagawa",
    description: "Inspired by Hokusai's Great Wave: ink, wave blue, and old paper",
    dark: { bg: "#1f1f28", sidebar: "#16161d", fg: "#dcd7ba", muted: "#938aa9", accent: "#7e9cd8", red: "#e46876", green: "#98bb6c", yellow: "#e6c384" },
    light: { bg: "#f2ecbc", sidebar: "#e7dba0", fg: "#545464", muted: "#766b90", accent: "#4d699b", red: "#c84053", green: "#6f894e", yellow: "#77713f" },
    code: { dark: "kanagawa-wave", light: "kanagawa-lotus" },
    swatches: ["#1f1f28", "#7e9cd8", "#957fb8", "#e6c384"],
  },
  {
    id: "everforest",
    name: "Everforest",
    description: "Soft forest greens that are easy on the eyes",
    dark: { bg: "#2d353b", sidebar: "#272e33", fg: "#d3c6aa", muted: "#9da9a0", accent: "#a7c080", red: "#e67e80", green: "#a7c080", yellow: "#dbbc7f" },
    light: { bg: "#fdf6e3", sidebar: "#f4f0d9", fg: "#5c6a72", muted: "#829181", accent: "#8da101", red: "#f85552", green: "#8da101", yellow: "#dfa000" },
    code: { dark: "everforest-dark", light: "everforest-light" },
    swatches: ["#2d353b", "#a7c080", "#83c092", "#dbbc7f"],
  },
  {
    id: "vesper",
    name: "Vesper",
    description: "Minimal near-black with a warm peach accent, by Rauno Freiberg",
    dark: { bg: "#101010", sidebar: "#0b0b0b", fg: "#eeeeee", muted: "#a0a0a0", accent: "#ffc799", red: "#ff8080", green: "#99ffe4", yellow: "#ffc799" },
    light: null,
    lightAccent: "#c56f2a",
    code: { dark: "vesper", light: "github-light-default" },
    swatches: ["#101010", "#ffc799", "#99ffe4", "#a0a0a0"],
  },
  {
    id: "poimandres",
    name: "Poimandres",
    description: "Cool blue-gray with mint and sky highlights",
    dark: { bg: "#1b1e28", sidebar: "#171922", fg: "#e4f0fb", muted: "#a6accd", accent: "#5de4c7", red: "#d0679d", green: "#5de4c7", yellow: "#fffac2" },
    light: null,
    lightAccent: "#1f9e85",
    code: { dark: "poimandres", light: "github-light-default" },
    swatches: ["#1b1e28", "#5de4c7", "#89ddff", "#fcc5e9"],
  },
  {
    id: "catppuccin",
    name: "Catppuccin",
    description: "Soothing pastels: Latte by day, Mocha by night",
    dark: { bg: "#1e1e2e", sidebar: "#181825", fg: "#cdd6f4", muted: "#a6adc8", accent: "#cba6f7", red: "#f38ba8", green: "#a6e3a1", yellow: "#f9e2af" },
    light: { bg: "#eff1f5", sidebar: "#e6e9ef", fg: "#4c4f69", muted: "#6c6f85", accent: "#8839ef", red: "#d20f39", green: "#40a02b", yellow: "#df8e1d" },
    code: { dark: "catppuccin-mocha", light: "catppuccin-latte" },
    swatches: ["#1e1e2e", "#cba6f7", "#89b4fa", "#a6e3a1"],
    lightSwatches: ["#eff1f5", "#8839ef", "#1e66f5", "#40a02b"],
  },
  {
    id: "github",
    name: "GitHub",
    description: "GitHub's own light and dark default themes",
    dark: { bg: "#0d1117", sidebar: "#010409", fg: "#e6edf3", muted: "#7d8590", accent: "#2f81f7", red: "#f85149", green: "#3fb950", yellow: "#d29922" },
    light: { bg: "#ffffff", sidebar: "#f6f8fa", fg: "#1f2328", muted: "#656d76", accent: "#0969da", red: "#cf222e", green: "#1a7f37", yellow: "#9a6700" },
    code: { dark: "github-dark-default", light: "github-light-default" },
    swatches: ["#0d1117", "#2f81f7", "#a371f7", "#3fb950"],
    lightSwatches: ["#ffffff", "#0969da", "#8250df", "#1a7f37"],
  },
  {
    id: "solarized",
    name: "Solarized",
    description: "Ethan Schoonover's precision colors on warm paper or deep teal",
    dark: { bg: "#002b36", sidebar: "#073642", fg: "#93a1a1", muted: "#839496", accent: "#268bd2", red: "#dc322f", green: "#859900", yellow: "#b58900" },
    light: { bg: "#fdf6e3", sidebar: "#eee8d5", fg: "#586e75", muted: "#657b83", accent: "#268bd2", red: "#dc322f", green: "#859900", yellow: "#b58900" },
    code: { dark: "solarized-dark", light: "solarized-light" },
    swatches: ["#002b36", "#268bd2", "#2aa198", "#b58900"],
    lightSwatches: ["#fdf6e3", "#268bd2", "#2aa198", "#b58900"],
  },
  {
    id: "iris",
    name: "Iris",
    description: "Quiet violet surfaces with lavender focus and readable contrast",
    // Hand-authored palette, used verbatim instead of the generated surface ladder.
    palette: "iris.src.css",
    accent: { light: "#6b4ca0", dark: "#8d6bc1" },
    code: { dark: "rose-pine", light: "rose-pine-dawn" },
    swatches: ["#1d1928", "#8d6bc1", "#ad89df", "#61b88b"],
    lightSwatches: ["#f8f6fb", "#6b4ca0", "#7656ac", "#367a5c"],
  },
];
