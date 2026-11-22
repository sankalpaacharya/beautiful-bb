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
| PRs card | Your open pull requests with CI, review and merge state, above the system card | On |
| System card | This Mac's live CPU and memory use above the usage card | On |
| Usage card | Weekly limit and 7-day activity bars above the sidebar footer | On |
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

## PRs card

A one-row card above the system card counts your open pull requests across
every repo, with a warning count when any have failing CI, conflicts or
requested changes. Click it to slide a panel up over the thread list; the
cards below never move. The panel has filter chips (All, needs attention,
ready to merge, and one per repo; one repo and one state at a time,
remembered across reloads) over a list that keeps the same height for every
filter. Each row has a state icon pinned at the left, the title over a quiet
line of number and age, and lines added and removed pinned at the right. The
list scrolls both ways, so long titles can be read in full. Hover a row for
the repo, size label, CI and review; click it to open the PR in your default
browser. Close the panel from the header, with Escape, or by clicking
outside it.

The card reads GitHub through your `gh` CLI and its existing sign-in, with one
read-only GraphQL search (`is:pr is:open author:@me archived:false`, first 100).
The result lives in a cache shared with other bb plugins that show your PRs,
such as bb-armada's Crew tab: `~/.cache/bb-prs/open-prs.json`. Between them
they call GitHub at most once every five minutes, and only one fetch runs at a
time. The card refreshes on that timer while the window is visible; hovering,
opening the panel and focusing the window only re-read the cache. After a
rate limit or error, nobody calls GitHub again until the time GitHub gives, or
a doubling backoff. The last list stays on screen, with a small clock in the
header saying how old it is and when it will retry. Without `gh`, or signed
out, the card shows one line saying so.

## Weekly usage card

A compact card above the sidebar footer shows each signed-in account (Claude,
Codex): its weekly limit as a progress bar with the time until reset, and a
7-day bar graph of daily activity. It stays dim until you hover or focus it.

Accounts signed in through BB's Account Pooler also appear, one compact row per
account, with account details on hover. The same account signed in locally and
in the pool appears once.

When a provider has one account, its bars are that provider's tokens per day
from the local session logs. Those logs cannot tell a provider's accounts
apart, and neither the providers nor the Account Pooler keep per-account
history, so the card records it: each refresh stores every account's
weekly-limit reading in the plugin's storage, keeping eight days. When a
provider has several accounts, a day the account has its own reading for shows
how many percentage points its weekly limit grew that day. Other days fall back
to the provider-wide token activity, drawn fainter, and the tooltip says so.
The first recorded day only starts the history, so per-account bars begin the
day after. Rows switch to this mode on their own when a provider gains a
second account.

The sidebar footer shows one panel at a time, so opening bb's own Usage panel
hides the card; it comes back as soon as you close that panel.

Token counts come from the harnesses' local session logs (`~/.claude/projects`
and `~/.codex/sessions`), so work outside bb counts too. They include input,
output, cache writes, and cache reads.

## System card

A second card, directly above the usage card, shows this Mac's CPU and memory
use, refreshed every two seconds. Each row has a bar and a figure: CPU as a
percent of all cores, memory as gigabytes used of the total. Hover a row for
the load average and the busiest process, or for the memory breakdown, file
cache, swap, and memory pressure.

Memory used is Activity Monitor's "Memory Used": app memory, wired memory, and
compressed memory, read from `vm_stat`. The file cache is not counted, because
macOS frees it on demand. CPU is the busy share of all cores between two
samples.

Both cards' bars share one scale: neutral gray through normal values, the
theme's warning color near 70%, and its destructive color at 100%. Sampling
stops when the card is off screen or the window is hidden.

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

Run the tests with `node --test`.

## Credits

Palette ported from T3 Code (MIT).
