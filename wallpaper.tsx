// Home wallpaper: the chosen WebGL effect behind the home screen (the
// new-thread page that Cmd+N opens), or nothing when the wallpaper is None.
import { usePreferences } from "./use-preferences";
import { ShaderWallpaper } from "./shader-wallpaper";
import { SHADER_COLOR_CSS } from "./wallpapers";
import "./wallpaper.css";

export function HomeWallpaper() {
  const prefs = usePreferences();
  if (!prefs || prefs.wallpaper === "none") return null;
  return (
    <div className="bbb-wallpaper" aria-hidden="true">
      <ShaderWallpaper
        className="bbb-wallpaper-shader"
        style={prefs.wallpaper}
        color={SHADER_COLOR_CSS[prefs.shaderColor]}
        animate={prefs.animateShader}
      />
    </div>
  );
}
