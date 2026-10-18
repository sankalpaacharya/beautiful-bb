// Applies the on/off feature switches in this window. The usage card is a
// footer disclosure opened or closed through its controller; the wave spinner
// CSS only matches while <html data-bbb-wave> is set.
import type { ExperimentalSidebarFooterDisclosureController } from "@get-bb/plugin-sdk/app";

export type FeatureSwitches = { usageCard: boolean; waveSpinner: boolean };

let usageCard: ExperimentalSidebarFooterDisclosureController | null = null;

export function setUsageCardController(controller: ExperimentalSidebarFooterDisclosureController) {
  usageCard = controller;
}

export function applyFeatures(features: FeatureSwitches) {
  if (features.usageCard) usageCard?.open();
  else usageCard?.close();
  document.documentElement.toggleAttribute("data-bbb-wave", features.waveSpinner);
}
