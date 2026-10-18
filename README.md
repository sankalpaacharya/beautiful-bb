# Beautiful bb

Themes and UI polish for [bb](https://getbb.app). Every feature can be switched
on or off from the plugin's own page: click the sparkle icon in bb's left
rail. Changes apply right away. The same settings are also available with
`bb plugin config beautiful-bb`.

| Setting | What it does | Default |
| --- | --- | --- |
| Theme | T3 Night, Sakura, Terminal, Ember, or bb default. One accent colors everything: buttons, links, focus rings, sidebar status, code, and the plugin's own pieces | Picked on the page |
| Usage card | Weekly limit and 7-day token bars above the sidebar footer | On |
| Agent activity | A wave on working threads in the sidebar, sparkles when one finishes | On |
| Wave spinner | Wave spinner instead of the "Working..." shimmer | On |
| Composer accent | Thin accent border on the message box while typing | Off |
| Focus mode | Hides the sidebar and dims chrome; Cmd+Shift+F | Off |
| Home greeting | Hello, today's tokens, and the last finished thread on the home screen | On |
| Living wallpaper | The ASCII wallpaper flickers gently | On |
| Home wallpaper | None, one of six built-in pieces, or Custom image | None |
| Custom wallpaper image | Image URL or file path, used with Custom image | Empty |
| Wallpaper style | Colorful ASCII, ASCII, or Photo | Colorful ASCII |

Command menu (Cmd+Shift+P): **Beautiful bb: Toggle focus mode**, **Next wallpaper**, **Next theme**.

Themes can also be picked in Settings → Appearance. Each comes with matching code colors for diffs and code blocks.

## Themes

Four themes, built from `scripts/themes.mjs` by `node scripts/build-themes.mjs`
(theme CSS, code themes, and the manifest's theme list): **T3 Night**
(lavender), **Sakura** (pink, pairs with the kitsune), **Terminal** (phosphor
green, monospace everywhere, pairs with the coder), and **Ember** (red-orange,
pairs with the samurai).

### T3 Night

The look of [T3 Code](https://github.com/pingdotgg/t3code) in bb:

- T3 Code's zinc light palette and near-black dark palette with an indigo accent
- System UI font and SF Mono, matching T3 Code
- Text one step larger across the app
- A starry night-sky banner at the top of the sidebar (dark mode), tinted
  with T3 Code's violet and built on the Hubble eXtreme Deep Field
- Indigo text selection and cursor, slim scrollbars

## Weekly usage card

A compact card above the sidebar footer shows each signed-in agent harness
(Claude, Codex): its weekly limit as a progress bar with the time until reset,
and a 7-day bar graph of tokens used per day. It stays dim until you hover or
focus it.

Token counts come from the harnesses' local session logs (`~/.claude/projects`
and `~/.codex/sessions`), so work outside bb counts too. They include input,
output, and cache writes, not cache reads.

## Wave spinner

The shimmering "Working..." line in a running thread becomes a 3x3 lavender
wave spinner (after [WaveSpinner](https://ui.heygaia.io/docs/components/wave-spinner)).
`working-spinner.css` is generated: edit `scripts/build-wave-spinner.mjs` and
run `node scripts/build-wave-spinner.mjs`.

## Home wallpaper

The home screen (the new-thread page, also opened with Cmd+N) can show art
behind the composer, redrawn as an ASCII texture in the style of a terminal
printout. Colorful ASCII keeps each character tinted with the image's colors.
Six original anime pieces ship with the plugin, made for it with GPT-6-Astra:
headphones girl, late-night coder, astronaut capybara, sleeping kitsune,
samurai, and robot buddy. Choose Custom image to use your own.

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
node scripts/build-themes.mjs   # inlines assets/space-banner.jpg into themes/*.css
bb plugin reload beautiful-bb
```

## Credits

Sidebar banner: Hubble eXtreme Deep Field, NASA, ESA (public domain).
Palette ported from T3 Code (MIT).
