// Applies the plugin's switches in this window. The usage card is a footer
// disclosure opened or closed through its controller; CSS-only features match
// while their attribute is set on <html>.
import type {
  ExperimentalSidebarFooterDisclosureController,
  PluginComposerThreadRowStatus,
} from "@get-bb/plugin-sdk/app";
import type { Preferences } from "./server";
import { applyTypography } from "./typography";

export type FeatureSwitches = Pick<
  Preferences,
  "usageCard" | "waveSpinner" | "composerGlow" | "agentActivity" | "font" | "fontScale"
>;

let usageCard: ExperimentalSidebarFooterDisclosureController | null = null;

export function setUsageCardController(controller: ExperimentalSidebarFooterDisclosureController) {
  usageCard = controller;
}

/**
 * Footer disclosures are exclusive: opening another one (bb's Usage panel)
 * closes the card, and its own toggle is hidden. While the card is switched
 * on, reopen it whenever no footer disclosure is open.
 */
let reopenWatcher: MutationObserver | null = null;

function reopenUsageCardWhenFooterIdle() {
  if (!document.querySelector('[data-footer-item] [aria-expanded="true"]')) usageCard?.open();
}

function watchUsageCard(on: boolean) {
  if (!on) {
    reopenWatcher?.disconnect();
    reopenWatcher = null;
    return;
  }
  if (reopenWatcher) return;
  reopenWatcher = new MutationObserver(reopenUsageCardWhenFooterIdle);
  reopenWatcher.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["aria-expanded"] });
}

export function applyFeatures(features: FeatureSwitches) {
  if (features.usageCard) usageCard?.open();
  else usageCard?.close();
  watchUsageCard(features.usageCard);
  const root = document.documentElement;
  root.toggleAttribute("data-bbb-wave", features.waveSpinner);
  root.toggleAttribute("data-bbb-glow", features.composerGlow);
  root.toggleAttribute("data-bbb-activity", features.agentActivity);
  applyTypography(features);
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
