// Command-menu actions. Commands run outside React, so they reach the server
// over the plugin's RPC endpoint and the theme API through the SDK handle the
// effects overlay shares.
import type { PluginBrowserBbSdk } from "@get-bb/plugin-sdk/app";
import type { Preferences } from "./server";
import { THEME_PACK } from "./theme-pack";

const PLUGIN_ID = "beautiful-bb";
const WALLPAPERS: Preferences["wallpaper"][] = ["headphones", "coder", "capybara", "kitsune", "samurai", "robot"];

let sdk: PluginBrowserBbSdk | null = null;

export function shareSdk(handle: PluginBrowserBbSdk) {
  sdk = handle;
}

async function rpc<T>(method: string, input: unknown): Promise<T> {
  const res = await fetch(`/api/v1/plugins/${PLUGIN_ID}/rpc/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await res.json();
  if (!res.ok || body?.ok === false) throw new Error(body?.error?.message ?? `${method} failed`);
  return body.result as T;
}

export const themeSelectionId = (id: string) => `plugin:${PLUGIN_ID}:${id}`;

/** Apply a pack theme and the wallpaper it pairs with, unless wallpapers are off. */
export async function applyTheme(handle: PluginBrowserBbSdk, themeId: string) {
  const theme = THEME_PACK.find((t) => t.id === themeId);
  if (!theme) return;
  await handle.theme.set(themeSelectionId(theme.id));
  const prefs = await rpc<Preferences>("settings_get", null);
  if (prefs.wallpaper !== "none" && prefs.wallpaper !== "custom") {
    await rpc("settings_set", { wallpaper: theme.wallpaper });
  }
}

export async function nextWallpaper() {
  const prefs = await rpc<Preferences>("settings_get", null);
  const i = WALLPAPERS.indexOf(prefs.wallpaper);
  await rpc("settings_set", { wallpaper: WALLPAPERS[(i + 1) % WALLPAPERS.length] });
}

export async function nextTheme() {
  if (!sdk) return;
  const current = (await sdk.theme.get()).themeId;
  const i = THEME_PACK.findIndex((t) => themeSelectionId(t.id) === current);
  await applyTheme(sdk, THEME_PACK[(i + 1) % THEME_PACK.length]!.id);
}
