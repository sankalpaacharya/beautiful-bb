// Applies the plugin's switches in this window. The usage card is a footer
// disclosure opened or closed through its controller; CSS-only features match
// while their attribute is set on <html>.
import type {
  ExperimentalSidebarFooterDisclosureController,
  PluginComposerThreadRowStatus,
} from "@get-bb/plugin-sdk/app";

export type FeatureSwitches = {
  usageCard: boolean;
  waveSpinner: boolean;
  composerGlow: boolean;
  agentActivity: boolean;
  fontScale: number;
};

let usageCard: ExperimentalSidebarFooterDisclosureController | null = null;

export function setUsageCardController(controller: ExperimentalSidebarFooterDisclosureController) {
  usageCard = controller;
}

export function applyFeatures(features: FeatureSwitches) {
  if (features.usageCard) usageCard?.open();
  else usageCard?.close();
  const root = document.documentElement;
  root.toggleAttribute("data-bbb-wave", features.waveSpinner);
  root.toggleAttribute("data-bbb-glow", features.composerGlow);
  root.toggleAttribute("data-bbb-activity", features.agentActivity);
  applyFontScale(features.fontScale);
}

/**
 * bb's desktop type scale in rem: [size, line height]. Line heights given as
 * rem scale with the text; bb's unitless ratios stay as they are.
 */
const TYPE_SCALE: Record<string, [number, number | null]> = {
  "2xs": [0.625, 0.875],
  xs: [0.75, 1],
  sm: [0.8125, null],
  base: [0.9375, 1.375],
  lg: [1.125, null],
  xl: [1.25, null],
  "2xl": [1.5, null],
};

/**
 * Text size slider: rewrites bb's --text-* tokens as inline styles on <html>,
 * which outrank theme stylesheets. Touch screens keep bb's own mobile scale.
 */
export function applyFontScale(percent: number) {
  const style = document.documentElement.style;
  const fine = window.matchMedia("(pointer: fine)").matches;
  for (const [step, [size, lineHeight]] of Object.entries(TYPE_SCALE)) {
    if (!fine) {
      style.removeProperty(`--text-${step}`);
      style.removeProperty(`--text-${step}--line-height`);
      continue;
    }
    style.setProperty(`--text-${step}`, `${((size * percent) / 100).toFixed(4)}rem`);
    if (lineHeight !== null) style.setProperty(`--text-${step}--line-height`, `${((lineHeight * percent) / 100).toFixed(4)}rem`);
  }
}

type RowStatusSetter = (threadId: string, status: PluginComposerThreadRowStatus | null) => void;
let setRowStatus: RowStatusSetter | null = null;

/** The content-script context owns thread row statuses; it hands its setter over here. */
export function setRowStatusSetter(setter: RowStatusSetter | null) {
  setRowStatus = setter;
}

export function rowStatus(threadId: string, status: PluginComposerThreadRowStatus | null) {
  setRowStatus?.(threadId, status);
}

/**
 * Focus mode: bb's sidebar collapses and the composer's extra chrome fades
 * (focus.css matches <html data-bbb-focus>). Leaving restores the sidebar
 * only if focus mode was what collapsed it.
 */
let collapsedSidebar = false;

export function toggleFocusMode(force?: boolean) {
  const root = document.documentElement;
  const on = force ?? !root.hasAttribute("data-bbb-focus");
  root.toggleAttribute("data-bbb-focus", on);
  const trigger = document.querySelector<HTMLButtonElement>('button[data-sidebar="trigger"]');
  const open = trigger?.getAttribute("aria-expanded") === "true";
  if (on && open) {
    trigger!.click();
    collapsedSidebar = true;
  } else if (!on && collapsedSidebar) {
    if (!open) trigger?.click();
    collapsedSidebar = false;
  }
  return on;
}
