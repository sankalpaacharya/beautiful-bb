---
name: beautiful-bb
description: Switch to or edit the Beautiful bb plugin's themes, such as T3 Night.
---

# Beautiful bb

The plugin contributes app themes through `bb.themes` in its `package.json`.

- Activate T3 Night: `bb theme set plugin:beautiful-bb:t3-night`
- Back to the default: `bb theme reset`
- List themes: `bb theme list`

## Editing a theme

Edit `themes/<name>.src.css`, never the generated `themes/<name>.css`. Then run
`node scripts/build-themes.mjs` to inline `assets/space-banner.jpg` and
`bb plugin reload beautiful-bb` to apply. The build fails if a theme exceeds
bb's 256 KB stylesheet limit.

Token reference: the bb-cli skill's `references/theming.md`.
