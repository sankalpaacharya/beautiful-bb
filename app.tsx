// Beautiful bb frontend entry. Registers every piece of the plugin: the PRs
// card (prs-card.tsx), the system card (live CPU and memory) and the usage card
// above the sidebar footer (one line per account: logo, weekly limit bar, 7-day
// activity bars, percent used, time to reset; a short 5-hour bar beside the
// weekly one when the account reports one), the home wallpaper and greeting,
// the settings page, the effects overlay, link previews in messages, and
// command-menu actions.
import { useCallback, useEffect, useState, type ReactNode } from "react";
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
import { mountLinkPreviews } from "./link-previews";
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
import { tipLevel, useUsageTip } from "./usage-tip";

const REFRESH_MS = 2 * 60 * 1000;

const dayTime = new Intl.DateTimeFormat(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
const clock = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

type DayBar = HarnessUsage["daily"][number];

/**
 * Seven bars of daily activity, today on the right. Weekly-limit growth and
 * token counts are scaled separately, each against its own busiest day.
 */
function UsageBars({ daily }: { daily: DayBar[] }) {
  const peak = (unit: string) => Math.max(...daily.map((bar) => (bar?.unit === unit ? bar.amount : 0)), 1);
  const peaks = { percent: peak("percent"), tokens: peak("tokens") };
  return (
    <span className="bbb-bars">
      {daily.map((bar, i) => (
        <span
          key={i}
          className="bbb-day"
          data-empty={!bar?.amount || undefined}
          data-shared={bar?.shared || undefined}
          style={{ height: `${Math.max(bar ? (bar.amount / peaks[bar.unit]) * 100 : 0, 12)}%` }}
        />
      ))}
    </span>
  );
}

/** A limit bar, filled with the shared value gradient sized to the whole track. */
function LimitBar({ usedPercent }: { usedPercent: number }) {
  const used = Math.min(Math.max(usedPercent, 0), 100);
  return (
    <span className="bbb-bar" aria-hidden="true">
      <span style={{ width: `${used}%`, backgroundSize: `${used > 0 ? 10000 / used : 100}% 100%` }} />
    </span>
  );
}

/** Lucide clock (ISC). */
const CLOCK = "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M12 6v6l4 2";

function TipHead({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <>
      <span className="bbb-tip-provider">{icon}</span>
      <span className="bbb-tip-title">{title}</span>
    </>
  );
}

function TipWindow({ label, usedPercent }: { label: string; usedPercent: number }) {
  return (
    <>
      <svg className="bbb-tip-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={CLOCK} /></svg>
      <span className="bbb-tip-muted">{label}</span>
      <LimitBar usedPercent={usedPercent} />
      <span className="bbb-tip-pct" data-level={tipLevel(usedPercent)}>{usedPercent}%</span>
    </>
  );
}

function HarnessRow({ h, now, tip }: { h: HarnessUsage; now: number; tip: ReturnType<typeof useUsageTip> }) {
  const { providers } = useProviders();
  const provider = providers.find((provider) => provider.id === h.providerId) ?? { id: h.providerId };
  const name = h.accountLabel ? `${h.name} — ${h.accountLabel}` : h.name;
  const resetsAt = Date.parse(h.resetsAt);
  const five = h.fiveHour;
  const fiveResetsAt = five ? Date.parse(five.resetsAt) : 0;
  const limits = five
    ? `Weekly: ${h.usedPercent}% · resets ${dayTime.format(resetsAt)}\n5-hour limit: ${five.usedPercent}% · resets in ${until(fiveResetsAt - now)} (${clock.format(fiveResetsAt)})`
    : null;
  // The card already shows the weekly numbers; the tip adds the 5-hour window.
  const fiveTip = five && (
    <span className="bbb-tip-windows">
      <TipHead icon={<ProviderIcon providerKind="agent" provider={provider} />} title={h.name} />
      <TipWindow label="5 hours" usedPercent={five.usedPercent} />
    </span>
  );
  return (
    <li
      className="bbb-row"
      onPointerEnter={fiveTip ? (event) => tip.show(event.currentTarget, fiveTip) : undefined}
      onPointerLeave={tip.hide}
      aria-label={limits
        ? `${name}: ${limits.replace("\n", ", ")}.`
        : `${name}: ${h.usedPercent}% of weekly limit used, resets ${dayTime.format(resetsAt)}.`}
    >
      <span className="bbb-icon" aria-hidden="true">
        <ProviderIcon providerKind="agent" provider={provider} />
      </span>
      {five ? (
        <span className="bbb-pair" aria-hidden="true">
          <LimitBar usedPercent={h.usedPercent} />
          <span className="bbb-five-bar"><LimitBar usedPercent={five.usedPercent} /></span>
        </span>
      ) : <LimitBar usedPercent={h.usedPercent} />}
      <UsageBars daily={h.daily} />
      <span className="bbb-pct">{h.usedPercent}%</span>
      <span className="bbb-in" title={five ? undefined : `Resets ${dayTime.format(resetsAt)}`}>
        {until(resetsAt - now)}
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
  const tip = useUsageTip();
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
        {harnesses.map((harness) => <HarnessRow key={harness.id} h={harness} now={now} tip={tip} />)}
      </ul>
      {tip.layer}
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
  app.contentScripts.register({ id: "link-previews", mount: mountLinkPreviews });
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
