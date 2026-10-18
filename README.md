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
