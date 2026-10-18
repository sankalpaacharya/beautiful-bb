// Always-mounted effects layer: keeps this window in step with the plugin's
// settings (live, through the settings-changed signal) and runs Agent
// activity: a wave on working threads' sidebar rows and a sparkle burst on the
// row when a thread finishes.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  experimental_useSidebarThreads as useSidebarThreads,
  useRealtime,
  useRpc,
  useSdk,
} from "@get-bb/plugin-sdk/app";
import type { Preferences, rpcContract } from "./server";
import { applyFeatures, rowStatus } from "./features";
import { shareSdk } from "./actions";
import "./effects.css";

const SETTINGS_CHANGED = "settings-changed";
const BUSY = new Set(["starting", "active", "stopping"]);
const SPARKS = ["✦", "✧", "*", "+", "·", "✦", "⋆", "+"];

export function usePreferences() {
  const rpc = useRpc<typeof rpcContract>();
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const refetch = useCallback(() => {
    rpc.call("settings_get", null).then(setPrefs, () => {});
  }, [rpc]);
  useEffect(refetch, [refetch]);
  useRealtime(SETTINGS_CHANGED, refetch);
  return prefs;
}

/** A short burst of accent glyphs over a sidebar row. */
function burst(threadId: string) {
  const row = document.querySelector(`[data-sidebar-thread-id="${CSS.escape(threadId)}"]`)?.parentElement;
  if (!row) return;
  const rect = row.getBoundingClientRect();
  if (rect.width === 0) return;
  const layer = document.createElement("div");
  layer.className = "bbb-burst";
  layer.setAttribute("aria-hidden", "true");
  layer.style.left = `${rect.right - 28}px`;
  layer.style.top = `${rect.top + rect.height / 2}px`;
  SPARKS.forEach((glyph, i) => {
    const spark = document.createElement("span");
    const angle = (i / SPARKS.length) * Math.PI * 2 + Math.random() * 0.6;
    const distance = 16 + Math.random() * 18;
    spark.textContent = glyph;
    spark.style.setProperty("--dx", `${Math.cos(angle) * distance}px`);
    spark.style.setProperty("--dy", `${Math.sin(angle) * distance}px`);
    spark.style.animationDelay = `${Math.random() * 80}ms`;
    layer.appendChild(spark);
  });
  document.body.appendChild(layer);
  window.setTimeout(() => layer.remove(), 1100);
}

const WORKING_STATUS = { icon: "bbb-wave", label: "Working", tone: "running" } as const;

function AgentActivity() {
  const { threads, status } = useSidebarThreads();
  const previous = useRef<Map<string, string> | null>(null);
  const marked = useRef(new Set<string>());

  useEffect(() => {
    if (status !== "ready") return;
    const now = new Map(threads.map((t) => [t.id, t.status]));
    for (const t of threads) {
      const busy = BUSY.has(t.status);
      if (busy && !marked.current.has(t.id)) {
        rowStatus(t.id, WORKING_STATUS);
        marked.current.add(t.id);
      } else if (!busy && marked.current.has(t.id)) {
        rowStatus(t.id, null);
        marked.current.delete(t.id);
      }
      // Only celebrate transitions seen in this window, not threads that were
      // already idle when it loaded.
      const before = previous.current?.get(t.id);
      if (before && BUSY.has(before) && t.status === "idle" && !reduceMotion()) burst(t.id);
    }
    previous.current = now;
  }, [threads, status]);

  useEffect(
    () => () => {
      for (const id of marked.current) rowStatus(id, null);
      marked.current.clear();
    },
    [],
  );
  return null;
}

function reduceMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function EffectsOverlay() {
  const prefs = usePreferences();
  const sdk = useSdk();
  useEffect(() => shareSdk(sdk), [sdk]);
  useEffect(() => {
    if (prefs) applyFeatures(prefs);
  }, [prefs]);
  return prefs?.agentActivity ? <AgentActivity /> : null;
}
