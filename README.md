# Beautiful bb

Themes and UI polish for [bb](https://getbb.app). Every feature can be switched
on or off from the plugin's own page: click the sparkle icon in bb's left
rail. Changes apply right away. The same settings are also available with
`bb plugin config beautiful-bb`.

| Setting | What it does | Default |
| --- | --- | --- |
| Theme | T3 Night, Tokyo Night, Rosé Pine, Kanagawa, Everforest, Vesper, Poimandres, Catppuccin, GitHub, Solarized, Iris, or bb default. One accent colors everything: buttons, links, focus rings, sidebar status, code, and the plugin's own pieces | Picked on the page |
| Appearance | System, Light, or Dark for every theme. Switches bb's own Settings → Appearance mode, so the two always agree. Not part of `bb plugin config` | System |
| Font | Theme default, bb's bundled Inter, or any Google Fonts family, from a searchable dropdown that previews each font | Theme default |
| Text size | Slider from 85% to 140% that scales the active theme's own text sizes; 100% leaves them as the theme sets them | 100% |
| Usage card | Weekly limit and 7-day token bars above the sidebar footer | On |
| Agent activity | A wave on working threads in the sidebar, sparkles when one finishes | On |
| Wave spinner | 4x4 shade grid instead of the "Working..." shimmer | On |
| Composer accent | Thin accent border on the message box while typing | Off |
| Focus mode | Hides the sidebar and dims chrome; Cmd+Shift+F | Off |
| Home greeting | Hello, today's tokens, and the last finished thread on the home screen | On |
| Home wallpaper | None, Dither, Faulty terminal, or Gradient ASCII | Dither |
| Rail pattern | The home wallpaper's pattern rising from the bottom of the navigation rail | On |
| Wallpaper color | Theme accent (follows the active theme), Teal, Indigo, Amber, Rose, or Neutral, for the wallpaper and the rail | Theme accent |
| Animate wallpaper | The wallpaper and the rail move slowly; reduced motion keeps them still | On |

Command menu (Cmd+Shift+P): **Beautiful bb: Toggle focus mode**, **Next theme**, **Toggle light and dark**.

Themes can also be picked in Settings → Appearance. Each comes with matching code colors for diffs and code blocks.

## Themes

Eleven themes, built from `scripts/themes.mjs` by `node scripts/build-themes.mjs`. Each has a light and a dark version, and bb's Light, Dark or System appearance picks which one shows. The theme picker previews the version for bb's current mode:

| Theme | Dark | Light | Code colors |
| --- | --- | --- | --- |
| **T3 Night** | T3 Code zinc with lavender | T3 Code zinc | generated |
| **Tokyo Night** | Night | Day | official `tokyo-night` |
| **Rosé Pine** | Main | Dawn | official `rose-pine` / `rose-pine-dawn` |
| **Kanagawa** | Wave | Lotus | official `kanagawa-wave` / `kanagawa-lotus` |
| **Everforest** | Dark | Light | official `everforest-dark` / `everforest-light` |
| **Vesper** | Peach on near-black | zinc with a peach accent | official `vesper` |
| **Poimandres** | Mint on blue-gray | zinc with a mint accent | official `poimandres` |
| **Catppuccin** | Mocha | Latte | official `catppuccin-mocha` / `catppuccin-latte` |
| **GitHub** | Dark default | Light default | official `github-dark-default` / `github-light-default` |
| **Solarized** | Dark | Light | official `solarized-dark` / `solarized-light` |
| **Iris** | Violet-tinted dark | Soft lavender light | `rose-pine` / `rose-pine-dawn` |

Palettes come from each theme's own VS Code theme file. One accent per theme
colors bb's buttons, links, focus rings, selection, sidebar status, and the
plugin's own pieces; red, green, and yellow keep their meaning.

### T3 Night

The look of [T3 Code](https://github.com/pingdotgg/t3code) in bb:

- T3 Code's zinc light palette and near-black dark palette with an indigo accent
- System UI font and SF Mono, matching T3 Code
- Text one step larger across the app
- Indigo text selection and cursor, slim scrollbars

## Weekly usage card

A compact card above the sidebar footer shows each signed-in agent harness
(Claude, Codex): its weekly limit as a progress bar with the time until reset,
and a 7-day bar graph of tokens used per day. It stays dim until you hover or
focus it.

The sidebar footer shows one panel at a time, so opening bb's own Usage panel
hides the card; it comes back as soon as you close that panel.

Token counts come from the harnesses' local session logs (`~/.claude/projects`
and `~/.codex/sessions`), so work outside bb counts too. They include input,
output, and cache writes, not cache reads.

## Wave spinner

The shimmering "Working..." line in a running thread becomes Armada's 4x4
shade grid: a bright diagonal front sweeping from the top-left corner, in the
theme's accent colour.
`working-spinner.css` is generated: edit `scripts/build-wave-spinner.mjs` and
run `node scripts/build-wave-spinner.mjs`.

## Home wallpaper

The home screen (the new-thread page, also opened with Cmd+N) shows a slowly
moving WebGL effect along the top of the pane, dense at the left and right
edges and thin in the middle, fading out before the composer. Each effect is a
port of a React Bits background, tinted with the wallpaper color:
[Dither](https://reactbits.dev/backgrounds/dither),
[Faulty Terminal](https://reactbits.dev/backgrounds/faulty-terminal), and
[Gradient ASCII](https://reactbits.dev/backgrounds/gradient-ascii). Without
WebGL the home screen simply shows no wallpaper. Each effect lives in
`shaders/` behind the small `EffectFactory` interface in `shaders/types.ts`.

## Install

```sh
bb plugin install https://github.com/sankalpaacharya/beautiful-bb
bb theme set plugin:beautiful-bb:t3-night
```

Or pick **T3 Night** in Settings → Appearance.

## Develop

```sh
git clone https://github.com/sankalpaacharya/beautiful-bb
cd beautiful-bb
bb plugin install .
```

Edit `themes/*.src.css`, then:

```sh
node scripts/build-themes.mjs   # writes themes/*.css
bb plugin reload beautiful-bb
```

## Credits

Palette ported from T3 Code (MIT).
