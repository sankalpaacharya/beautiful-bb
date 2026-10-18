// Beautiful bb frontend entry. Registers every piece of the plugin: the usage
// card above the sidebar footer (one line per harness: logo, weekly limit bar,
// 7-day token bars, percent used, time to reset), the home wallpaper and
// greeting, the settings page, the effects overlay, and command-menu actions.
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
import { setRowStatusSetter, setUsageCardController, toggleFocusMode } from "./features";
import { SettingsPage } from "./settings-page";
import { EffectsOverlay } from "./overlay";
import { HomeGreeting } from "./greeting";
import { WaveIcon } from "./wave-icon";
import { nextTheme, nextWallpaper } from "./actions";

const REFRESH_MS = 2 * 60 * 1000;
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
  app.experimental_icons.register({ name: "bbb-wave", component: WaveIcon });
  app.slots.experimental_appOverlay({ id: "effects", component: EffectsOverlay });
  app.slots.homepageSection({ id: "greeting", title: "Greeting", component: HomeGreeting });
  app.slots.homepageSection({ id: "wallpaper", title: "Wallpaper", component: HomeWallpaper });
  app.slots.navPanel({
    id: "settings",
    title: "Beautiful bb",
    icon: "beautiful-bb/sparkle",
    path: "settings",
    component: SettingsPage,
  });
  // Its footer toggle is hidden by usage-card.css; EffectsOverlay opens or
  // closes it from the Usage card setting.
  setUsageCardController(
    app.experimental_sidebarFooter.register({
      kind: "disclosure",
      id: "weekly-usage",
      label: "Weekly usage",
      icon: "ChartColumn",
      component: WeeklyUsageCard,
    }),
  );
  // Only a content script may decorate thread rows; hand its setter to the
  // effects overlay, which marks working threads.
  app.contentScripts.register({
    id: "thread-row-status",
    mount(context) {
      setRowStatusSetter(context.experimental_setThreadRowStatus ?? null);
      return () => setRowStatusSetter(null);
    },
  });
  app.commands.register({
    id: "toggle-focus-mode",
    title: "Beautiful bb: Toggle focus mode",
    defaultShortcut: { key: "f", mod: true, shift: true },
    run: () => {
      toggleFocusMode();
    },
  });
  app.commands.register({ id: "next-wallpaper", title: "Beautiful bb: Next wallpaper", run: nextWallpaper });
  app.commands.register({ id: "next-theme", title: "Beautiful bb: Next theme", run: nextTheme });
});
