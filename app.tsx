// Beautiful bb frontend: the weekly usage card pinned above the sidebar footer.
// Each harness is one line: logo, weekly limit progress bar, 7-day token bars,
// percent used, and time until the limit resets.
import { useCallback, useEffect, useState } from "react";
import {
  definePluginApp,
  experimental_ProviderIcon as ProviderIcon,
  experimental_useProviders as useProviders,
  useRpc,
} from "@get-bb/plugin-sdk/app";
import type { HarnessUsage, rpcContract } from "./server";
import "./usage-card.css";
import "./working-spinner.css";
import { HomeWallpaper } from "./wallpaper";
import { applyFeatures, setUsageCardController } from "./features";
import { SettingsPage } from "./settings-page";

const REFRESH_MS = 2 * 60 * 1000;
const FEATURES_REFRESH_MS = 15 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const dayTime = new Intl.DateTimeFormat(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });

function until(ms: number): string {
  if (ms < HOUR_MS) return `${Math.max(1, Math.round(ms / 60000))}m`;
  if (ms < DAY_MS) return `${Math.round(ms / HOUR_MS)}h`;
  const days = Math.floor(ms / DAY_MS);
  const hours = Math.round((ms % DAY_MS) / HOUR_MS);
  return hours ? `${days}d ${hours}h` : `${days}d`;
}

const tokenCount = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });
const weekday = new Intl.DateTimeFormat(undefined, { weekday: "short" });

/** Seven bars of fresh tokens per day, today on the right. */
function TokenBars({ daily, now }: { daily: number[]; now: number }) {
  const peak = Math.max(...daily, 1);
  const total = daily.reduce((sum, n) => sum + n, 0);
  return (
    <span className="bbb-bars" title={`${tokenCount.format(total)} tokens in the last 7 days`}>
      {daily.map((n, i) => {
        const day = weekday.format(now - (daily.length - 1 - i) * DAY_MS);
        return (
          <span
            key={i}
            className="bbb-day"
            data-empty={n === 0 || undefined}
            style={{ height: `${Math.max((n / peak) * 100, 12)}%` }}
            title={`${day}: ${tokenCount.format(n)} tokens`}
          />
        );
      })}
    </span>
  );
}

function HarnessRow({ h, now }: { h: HarnessUsage; now: number }) {
  const { providers } = useProviders();
  const provider = providers.find((p) => p.id === h.id) ?? { id: h.id };
  const resetsAt = Date.parse(h.resetsAt);
  const used = Math.min(Math.max(h.usedPercent, 0), 100);
  return (
    <li
      className="bbb-row"
      aria-label={`${h.name}: ${h.usedPercent}% of weekly limit used, resets ${dayTime.format(resetsAt)}.`}
    >
      <span className="bbb-icon" title={h.name} aria-hidden="true">
        <ProviderIcon providerKind="agent" provider={provider} />
      </span>
      <span className="bbb-bar" aria-hidden="true">
        <span style={{ width: `${used}%` }} />
      </span>
      {h.daily.length > 0 && <TokenBars daily={h.daily} now={now} />}
      <span className="bbb-pct">{h.usedPercent}%</span>
      <span className="bbb-in" title={`Resets ${dayTime.format(resetsAt)}`}>
        {until(resetsAt - now)}
      </span>
    </li>
  );
}

function useWeeklyUsage() {
  const rpc = useRpc<typeof rpcContract>();
  const [harnesses, setHarnesses] = useState<HarnessUsage[] | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const refetch = useCallback(() => {
    rpc.call("weekly_usage", null).then(
      (result) => {
        setHarnesses(result.harnesses);
        setNow(result.observedAt);
      },
      () => setHarnesses((current) => current ?? []),
    );
  }, [rpc]);
  useEffect(() => {
    refetch();
    const timer = window.setInterval(refetch, REFRESH_MS);
    window.addEventListener("focus", refetch);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refetch);
    };
  }, [refetch]);
  return { harnesses, now };
}

function WeeklyUsageCard() {
  const { harnesses, now } = useWeeklyUsage();
  if (harnesses === null) return <div className="bbb-card bbb-loading" aria-busy="true" />;
  if (!harnesses.length) {
    return (
      <div className="bbb-card">
        <p className="bbb-empty">Sign in to Claude Code or Codex to see weekly limits here.</p>
      </div>
    );
  }
  return (
    <section className="bbb-card" aria-label="Weekly usage limits" tabIndex={0}>
      <ul>
        {harnesses.map((h) => (
          <HarnessRow key={h.id} h={h} now={now} />
        ))}
      </ul>
    </section>
  );
}

export default definePluginApp((app) => {
  app.slots.homepageSection({ id: "wallpaper", title: "Wallpaper", component: HomeWallpaper });
  app.slots.navPanel({
    id: "settings",
    title: "Beautiful bb",
    icon: "beautiful-bb/sparkle",
    path: "settings",
    component: SettingsPage,
  });
  setUsageCardController(
    app.experimental_sidebarFooter.register({
      kind: "disclosure",
      id: "weekly-usage",
      label: "Weekly usage",
      icon: "ChartColumn",
      component: WeeklyUsageCard,
    }),
  );
  // Apply the feature switches from settings: open or close the usage card
  // (its footer toggle is hidden by usage-card.css) and gate the wave spinner
  // CSS on <html data-bbb-wave>. Re-checked on focus and every few seconds so
  // a settings change shows up without a reload.
  app.contentScripts.register({
    id: "apply-features",
    mount({ pluginId, signal }) {
      const root = document.documentElement;
      const apply = async () => {
        try {
          const res = await fetch(`/api/v1/plugins/${encodeURIComponent(pluginId)}/rpc/features`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "null",
            signal,
          });
          if (!res.ok) return;
          const body = await res.json();
          const features = body?.result ?? body;
          applyFeatures({ usageCard: features?.usageCard !== false, waveSpinner: features?.waveSpinner !== false });
        } catch {
          // Aborted on teardown, or the server is restarting; the next tick retries.
        }
      };
      void apply();
      const timer = window.setInterval(apply, FEATURES_REFRESH_MS);
      window.addEventListener("focus", apply);
      return () => {
        window.clearInterval(timer);
        window.removeEventListener("focus", apply);
        root.removeAttribute("data-bbb-wave");
      };
    },
  });
});
