// Beautiful bb frontend entry. Registers every piece of the plugin: the PRs
// card (prs-card.tsx), the system card (live CPU and memory) and the usage card
// above the sidebar footer (one line per account: logo, weekly limit bar, 7-day
// activity bars, percent used, time to reset; and a 5-hour limit line under it
// when the plan has one), the home wallpaper and greeting,
// the settings page, the effects overlay, and command-menu actions.
import { Fragment, useCallback, useEffect, useState } from "react";
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
import { footerCardsClosed, setRowStatusSetter, setUsageCardController, toggleFocusMode } from "./features";
import { mountTypography } from "./typography";
import { SettingsPage } from "./settings-page";
import { EffectsOverlay } from "./overlay";
import { HomeGreeting } from "./greeting";
import { WaveIcon } from "./wave-icon";
import { nextTheme } from "./actions";
import { toggleColorMode } from "./color-mode";
import { PrsCard } from "./prs-card";
import { SystemCard } from "./system-card";
import { usePreferences } from "./use-preferences";
import { until } from "./duration";

const REFRESH_MS = 2 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const dayTime = new Intl.DateTimeFormat(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
const weekday = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const monthDay = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const points = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

function formatDay(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return monthDay.format(new Date(year!, month! - 1, date));
}

const tokenCount = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });

type DayBar = HarnessUsage["daily"][number];

function describeBar(bar: DayBar, providerName: string): string {
  if (!bar) return "no reading";
  if (bar.unit === "percent") return `This account, +${points.format(bar.amount)}% of the weekly limit`;
  const tokens = `${tokenCount.format(bar.amount)} tokens`;
  return bar.shared ? `${providerName}-wide activity (no per-account history yet), ${tokens}` : `This account, ${tokens}`;
}

function describeBars(daily: DayBar[], historySince: string | null, providerName: string): string {
  if (!daily.some((bar) => bar?.shared)) {
    const total = daily.reduce((sum, bar) => sum + (bar?.amount ?? 0), 0);
    return `This account: ${tokenCount.format(total)} tokens in the last 7 days`;
  }
  const since = historySince ? `This account's history since ${formatDay(historySince)}. ` : "";
  return `${since}Fainter bars are ${providerName}-wide activity (no per-account history yet).`;
}

/**
 * Seven bars of daily activity, today on the right. Weekly-limit growth and
 * token counts are scaled separately, each against its own busiest day.
 */
function UsageBars({ daily, historySince, providerName, now }: { daily: DayBar[]; historySince: string | null; providerName: string; now: number }) {
  const peak = (unit: string) => Math.max(...daily.map((bar) => (bar?.unit === unit ? bar.amount : 0)), 1);
  const peaks = { percent: peak("percent"), tokens: peak("tokens") };
  return (
    <span className="bbb-bars" title={describeBars(daily, historySince, providerName)}>
      {daily.map((bar, i) => {
        const day = weekday.format(now - (daily.length - 1 - i) * DAY_MS);
        return (
          <span
            key={i}
            className="bbb-day"
            data-empty={!bar?.amount || undefined}
            data-shared={bar?.shared || undefined}
            style={{ height: `${Math.max(bar ? (bar.amount / peaks[bar.unit]) * 100 : 0, 12)}%` }}
            title={`${day}: ${describeBar(bar, providerName)}`}
          />
        );
      })}
    </span>
  );
}

function HarnessRow({ h, now }: { h: HarnessUsage; now: number }) {
  const { providers } = useProviders();
  const provider = providers.find((provider) => provider.id === h.providerId) ?? { id: h.providerId };
  const name = h.accountLabel ? `${h.name} — ${h.accountLabel}` : h.name;
  const resetsAt = Date.parse(h.resetsAt);
  const used = Math.min(Math.max(h.usedPercent, 0), 100);
  return (
    <li
      className="bbb-row"
      title={name}
      aria-label={`${name}: ${h.usedPercent}% of weekly limit used, resets ${dayTime.format(resetsAt)}.`}
    >
      <span className="bbb-icon" aria-hidden="true">
        <ProviderIcon providerKind="agent" provider={provider} />
      </span>
      <span className="bbb-bar" aria-hidden="true">
        <span style={{ width: `${used}%`, backgroundSize: `${used > 0 ? 10000 / used : 100}% 100%` }} />
      </span>
      <UsageBars daily={h.daily} historySince={h.historySince} providerName={h.name} now={now} />
      <span className="bbb-pct">{h.usedPercent}%</span>
      <span className="bbb-in" title={`Resets ${dayTime.format(resetsAt)}`}>
        {until(resetsAt - now)}
      </span>
    </li>
  );
}

function SessionRow({ h, now }: { h: HarnessUsage; now: number }) {
  if (!h.session) return null;
  const name = h.accountLabel ? `${h.name} — ${h.accountLabel}` : h.name;
  const resetsAt = h.session.resetsAt ? Date.parse(h.session.resetsAt) : null;
  const used = Math.min(Math.max(h.session.usedPercent, 0), 100);
  const resets = resetsAt === null ? "" : `, resets ${dayTime.format(resetsAt)}`;
  return (
    <li
      className="bbb-row bbb-session"
      title={`${name}, 5-hour limit`}
      aria-label={`${name}: ${h.session.usedPercent}% of 5-hour limit used${resets}.`}
    >
      <span className="bbb-window" aria-hidden="true">5h</span>
      <span className="bbb-bar" aria-hidden="true">
        <span style={{ width: `${used}%`, backgroundSize: `${used > 0 ? 10000 / used : 100}% 100%` }} />
      </span>
      <span aria-hidden="true" />
      <span className="bbb-pct">{h.session.usedPercent}%</span>
      <span className="bbb-in" title={resetsAt === null ? undefined : `Resets ${dayTime.format(resetsAt)}`}>
        {resetsAt === null ? "" : until(resetsAt - now)}
      </span>
    </li>
  );
}

const USAGE_KEY = "beautiful-bb:weekly-usage-v3";

/** The last reading, so a restarted plugin server (cold caches, a slow first call) still shows rows. */
function readCachedUsage(): { harnesses: HarnessUsage[]; observedAt: number } | null {
  try {
    const cached = JSON.parse(localStorage.getItem(USAGE_KEY) ?? "null");
    return Array.isArray(cached?.harnesses) && typeof cached.observedAt === "number" ? cached : null;
  } catch {
    return null;
  }
}

function useWeeklyUsage() {
  const rpc = useRpc<typeof rpcContract>();
  const [cached] = useState(readCachedUsage);
  const [harnesses, setHarnesses] = useState<HarnessUsage[] | null>(cached?.harnesses ?? null);
  const [now, setNow] = useState(() => cached?.observedAt ?? Date.now());
  const refetch = useCallback(() => {
    rpc.call("weekly_usage", null).then(
      (result) => {
        setHarnesses(result.harnesses);
        setNow(result.observedAt);
        localStorage.setItem(USAGE_KEY, JSON.stringify(result));
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
    <section className="bbb-card" aria-label="Usage limits" tabIndex={0}>
      <ul>
        {harnesses.map((harness) => (
          <Fragment key={harness.id}>
            <HarnessRow h={harness} now={now} />
            <SessionRow h={harness} now={now} />
          </Fragment>
        ))}
      </ul>
    </section>
  );
}

/** The footer shows one disclosure at a time, so both cards share this one. */
function FooterCards() {
  const prefs = usePreferences();
  useEffect(() => footerCardsClosed, []);
  if (!prefs) return null;
  return (
    <>
      {prefs.prsCard && <PrsCard />}
      {prefs.systemCard && <SystemCard />}
      {prefs.usageCard && <WeeklyUsageCard />}
    </>
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
  // Its footer toggle is hidden by usage-card.css; EffectsOverlay opens it
  // while the PRs, System or Usage card setting is on.
  setUsageCardController(
    app.experimental_sidebarFooter.register({
      kind: "disclosure",
      id: "weekly-usage",
      label: "PRs, system and weekly usage",
      icon: "ChartColumn",
      component: FooterCards,
    }),
  );
  // Only a content script may decorate thread rows; hand its setter to the
  // effects overlay, which marks working threads.
  app.contentScripts.register({ id: "typography", mount: mountTypography });
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
  app.commands.register({ id: "next-theme", title: "Beautiful bb: Next theme", run: nextTheme });
  app.commands.register({ id: "toggle-color-mode", title: "Beautiful bb: Toggle light and dark", run: toggleColorMode });
});
