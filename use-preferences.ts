// The plugin's settings as typed Preferences, kept live through the server's
// settings-changed signal. Null until the first read returns.
import { useCallback, useEffect, useState } from "react";
import { useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import type { Preferences, rpcContract } from "./server";

const SETTINGS_CHANGED = "settings-changed";

export function usePreferences(): Preferences | null {
  const rpc = useRpc<typeof rpcContract>();
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const refetch = useCallback(() => {
    rpc.call("settings_get", null).then(setPrefs, () => {});
  }, [rpc]);
  useEffect(refetch, [refetch]);
  useRealtime(SETTINGS_CHANGED, refetch);
  return prefs;
}
