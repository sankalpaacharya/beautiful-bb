// Which renderer draws each shader wallpaper.
import type { ShaderId } from "../wallpapers";
import { createDither } from "./dither";
import { createFaultyTerminal } from "./faulty-terminal";
import { createGradientAscii } from "./gradient-ascii";
import type { EffectFactory } from "./types";

export const EFFECTS: Record<ShaderId, EffectFactory> = {
  dither: createDither,
  "faulty-terminal": createFaultyTerminal,
  "gradient-ascii": createGradientAscii,
};
