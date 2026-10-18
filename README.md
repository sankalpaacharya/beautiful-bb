# Beautiful bb

Themes and UI polish for [bb](https://getbb.app).

## Themes

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
