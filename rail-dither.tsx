// Rail dither: the Dither pattern rising from the bottom of bb's navigation
// rail, the narrow strip of icon buttons left of the sidebar. bb has no slot
// for the rail, so this adds its own host element to the rail, renders into it
// through a portal, and removes it on unmount.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ShaderLayout } from "./shader-renderer";
import { ShaderWallpaper } from "./shader-wallpaper";
import "./rail-dither.css";

const RAIL = 'nav[data-testid="sidebar-navigation-rail"]';
// The rail ends just above the settings button, so the pattern dissolves
// toward that edge instead of stopping in a flat line.
const LAYOUT: ShaderLayout = { anchor: "bottom", sides: false, reach: 1.1, edgeFade: 0.14 };

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

export function RailDither({ color, animate }: { color: string; animate: boolean }) {
  const rail = useRail();
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!rail) return;
    const element = document.createElement("div");
    element.className = "bbb-rail-dither";
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
    <ShaderWallpaper className="bbb-rail-dither-canvas" style="dither" color={color} animate={animate} layout={LAYOUT} />,
    host,
  );
}
