// Rail pattern: the home wallpaper's effect rising from the bottom of bb's
// navigation rail, the narrow strip of icon buttons left of the sidebar. bb has no slot
// for the rail, so this adds its own host element to the rail, renders into it
// through a portal, and removes it on unmount.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { EffectLayout } from "./shaders/types";
import { ShaderWallpaper } from "./shader-wallpaper";
import type { ShaderId } from "./wallpapers";
import "./rail-pattern.css";

const RAIL = 'nav[data-testid="sidebar-navigation-rail"]';
// The rail ends just above the settings button, so the pattern dissolves
// toward that edge instead of stopping in a flat line.
const LAYOUT: EffectLayout = { anchor: "bottom", sides: false, reach: 1.1, edgeFade: 0.14 };

/** The rail is about 48px wide; glyph effects shrink so several columns fit. */
const RAIL_SCALE: Record<ShaderId, number> = { dither: 1, "faulty-terminal": 0.4, "gradient-ascii": 0.6 };

/** The rail element, following bb as it mounts and replaces it. */
function useRail(): Element | null {
  const [rail, setRail] = useState(() => document.querySelector(RAIL));
  useEffect(() => {
    let frame = 0;
    const observer = new MutationObserver(() => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setRail(document.querySelector(RAIL));
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);
  return rail;
}

export function RailPattern({ style, color, animate }: { style: ShaderId; color: string; animate: boolean }) {
  const rail = useRail();
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!rail) return;
    const element = document.createElement("div");
    element.className = "bbb-rail-pattern";
    element.setAttribute("aria-hidden", "true");
    rail.prepend(element);
    setHost(element);
    return () => {
      element.remove();
      setHost(null);
    };
  }, [rail]);
  if (!host) return null;
  return createPortal(
    <ShaderWallpaper
      className="bbb-rail-pattern-canvas"
      style={style}
      color={color}
      animate={animate}
      layout={LAYOUT}
      scale={RAIL_SCALE[style]}
    />,
    host,
  );
}
