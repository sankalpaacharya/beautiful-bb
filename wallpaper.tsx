// Home wallpaper: what sits behind the home screen (the new-thread page that
// Cmd+N opens). The Dither shader is the default; the bundled art and custom
// images show as faded photos. Chosen with the plugin's wallpaper settings.
import { experimental_usePluginId as usePluginId } from "@get-bb/plugin-sdk/app";
import type { Preferences } from "./server";
import { usePreferences } from "./use-preferences";
import { ShaderWallpaper } from "./shader-wallpaper";
import type { ShaderStyle } from "./shader-renderer";
import { SHADER_COLOR_CSS, isArt, isShader } from "./wallpapers";
import "./wallpaper.css";

export type WallpaperLayer =
  | { kind: "none" }
  | { kind: "shader"; style: ShaderStyle; color: string; animate: boolean }
  | { kind: "photo"; src: string };

/** The plugin's `/wallpaper` route serves bundled art and custom local files. */
function routeSrc(pluginId: string, key: string) {
  // The query changes only when the choice changes, so the browser refetches then.
  return `/api/v1/plugins/${encodeURIComponent(pluginId)}/http/wallpaper?v=${encodeURIComponent(key)}`;
}

export function resolveWallpaper(prefs: Preferences, pluginId: string): WallpaperLayer {
  const { wallpaper } = prefs;
  if (wallpaper === "none") return { kind: "none" };
  if (isShader(wallpaper)) {
    return { kind: "shader", style: wallpaper, color: SHADER_COLOR_CSS[prefs.shaderColor], animate: prefs.animateShader };
  }
  if (isArt(wallpaper)) return { kind: "photo", src: routeSrc(pluginId, wallpaper) };
  const custom = prefs.customWallpaper.trim();
  if (/^https?:\/\//i.test(custom)) return { kind: "photo", src: custom };
  if (custom.startsWith("/") || custom.startsWith("~/")) return { kind: "photo", src: routeSrc(pluginId, `custom:${custom}`) };
  return { kind: "none" };
}

export function HomeWallpaper() {
  const pluginId = usePluginId();
  const prefs = usePreferences();
  const layer = prefs ? resolveWallpaper(prefs, pluginId) : { kind: "none" as const };
  if (layer.kind === "none") return null;
  return (
    <div className="bbb-wallpaper" data-kind={layer.kind} aria-hidden="true">
      {layer.kind === "shader" ? (
        <ShaderWallpaper className="bbb-wallpaper-shader" style={layer.style} color={layer.color} animate={layer.animate} />
      ) : (
        <img className="bbb-wallpaper-photo" src={layer.src} alt="" decoding="async" />
      )}
    </div>
  );
}
