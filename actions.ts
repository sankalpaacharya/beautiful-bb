// Command-menu actions. Commands run outside React, so they reach the theme
// API through the SDK handle the effects overlay shares.
import type { PluginBrowserBbSdk } from "@get-bb/plugin-sdk/app";
import { THEME_PACK } from "./theme-pack";

const PLUGIN_ID = "beautiful-bb";

let sdk: PluginBrowserBbSdk | null = null;

export function shareSdk(handle: PluginBrowserBbSdk) {
  sdk = handle;
}

export const themeSelectionId = (id: string) => `plugin:${PLUGIN_ID}:${id}`;

export async function applyTheme(handle: PluginBrowserBbSdk, themeId: string) {
  if (THEME_PACK.some((t) => t.id === themeId)) await handle.theme.set(themeSelectionId(themeId));
}

export async function nextTheme() {
  if (!sdk) return;
  const current = (await sdk.theme.get()).themeId;
  const i = THEME_PACK.findIndex((t) => themeSelectionId(t.id) === current);
  await applyTheme(sdk, THEME_PACK[(i + 1) % THEME_PACK.length]!.id);
}
