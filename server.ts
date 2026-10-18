// Beautiful bb. Themes are declared in package.json under `bb.themes`; bb
// loads them from the manifest, so the server entry has nothing to run yet.
import type { BbPluginApi } from "@get-bb/plugin-sdk";

export default async function plugin(bb: BbPluginApi) {
  bb.log.info("loaded");
}
