// Beautiful bb frontend: the weekly usage card pinned above the sidebar footer.
// Each harness gets a burn-up chart of its current week: the measured usage
// curve, a dashed even-pace diagonal, and a dotted projection to the reset.
import { useCallback, useEffect, useId, useState } from "react";
import {
  definePluginApp,
  experimental_ProviderIcon as ProviderIcon,
  experimental_useProviders as useProviders,
  useRealtime,
  useRpc,
} from "@get-bb/plugin-sdk/app";
import type { HarnessUsage, rpcContract } from "./server";
import "./usage-card.css";

const USAGE_CHANGED = "usage-changed";
const REFRESH_MS = 2 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

type Tone = "calm" | "hot" | "critical";

type Burn = {
  /** Fraction of the week elapsed, 0–1. */
  elapsed: number;
  /** Projected percent at reset if the week's average rate holds. */
  projected: number;
  /** When usage would hit 100% at that rate, if before the reset. */
  runsOutAt: number | null;
  tone: Tone;
};

function burnOf(h: HarnessUsage, now: number): Burn {
  const end = Date.parse(h.resetsAt);
  const span = end - h.windowStart;
  const elapsedMs = Math.min(Math.max(now - h.windowStart, 0), span);
  const elapsed = span > 0 ? elapsedMs / span : 0;
  const rate = elapsedMs > HOUR_MS ? h.usedPercent / elapsedMs : 0;
  const projected = h.usedPercent + rate * (end - now);
  const runsOutAt = rate > 0 && projected > 100 ? now + (100 - h.usedPercent) / rate : null;
  const tone: Tone = h.usedPercent >= 90 ? "critical" : runsOutAt !== null ? "hot" : "calm";
  return { elapsed, projected, runsOutAt, tone };
}

const dayTime = new Intl.DateTimeFormat(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });

function until(ms: number): string {
  if (ms < HOUR_MS) return `${Math.max(1, Math.round(ms / 60000))}m`;
  if (ms < DAY_MS) return `${Math.round(ms / HOUR_MS)}h`;
  const days = Math.floor(ms / DAY_MS);
  const hours = Math.round((ms % DAY_MS) / HOUR_MS);
  return hours ? `${days}d ${hours}h` : `${days}d`;
}

/** Chart coordinates: x is the week 0–100, y is percent used, flipped for SVG. */
function curvePoints(h: HarnessUsage, now: number) {
  const span = Date.parse(h.resetsAt) - h.windowStart;
  const x = (t: number) => Math.min(Math.max(((t - h.windowStart) / span) * 100, 0), 100);
  const y = (pct: number) => 100 - Math.min(Math.max(pct, 0), 100);
  const measured = h.samples.map((s) => [x(s.t), y(s.pct)] as const);
  const nowPoint = [x(now), y(h.usedPercent)] as const;
  if (!measured.length || measured.at(-1)![0] < nowPoint[0]) measured.push(nowPoint);
  return { measured, start: [0, 100] as const, x, y };
}

function BurnChart({ h, burn, now }: { h: HarnessUsage; burn: Burn; now: number }) {
  const gradientId = useId();
  const { measured, start, y } = curvePoints(h, now);
  const first = measured[0]!;
  const last = measured.at(-1)!;
  const line = measured.map(([px, py]) => `${px},${py}`).join(" ");
  // Before the first sample the curve is unknown: bridge it from the week's
  // zero start with a dashed segment instead of inventing data.
  const gap = first[0] > 0.5 ? `${start[0]},${start[1]} ${first[0]},${first[1]}` : null;
  const area = `${start[0]},100 ${start[0]},${start[1]} ${line} ${last[0]},100`;
  const projectionEnd: readonly [number, number] =
    burn.runsOutAt !== null
      ? [Math.min(((burn.runsOutAt - h.windowStart) / (Date.parse(h.resetsAt) - h.windowStart)) * 100, 100), 0]
      : [100, y(burn.projected)];

  return (
    <div className="bbb-chart" data-tone={burn.tone} aria-hidden="true">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--bbb-tone)" stopOpacity="0.45" />
            <stop offset="100%" stopColor="var(--bbb-tone)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line className="bbb-pace" x1="0" y1="100" x2="100" y2="0" />
        <polygon className="bbb-area" points={area} fill={`url(#${gradientId})`} />
        {gap && <polyline className="bbb-gap" points={gap} />}
        <polyline className="bbb-line" points={line} />
        <line
          className="bbb-projection"
          x1={last[0]}
          y1={last[1]}
          x2={projectionEnd[0]}
          y2={projectionEnd[1]}
        />
      </svg>
      <span className="bbb-now" style={{ left: `${last[0]}%`, top: `${last[1]}%` }} />
    </div>
  );
}

function HarnessRow({ h, now }: { h: HarnessUsage; now: number }) {
  const { providers } = useProviders();
  const provider = providers.find((p) => p.id === h.id) ?? { id: h.id };
  const burn = burnOf(h, now);
  const resetsAt = Date.parse(h.resetsAt);
  const outlook =
    burn.runsOutAt !== null
      ? `Runs out around ${dayTime.format(burn.runsOutAt)}`
      : `On pace for ${Math.round(burn.projected)}% by reset`;
  return (
    <li
      className="bbb-row"
      data-tone={burn.tone}
      aria-label={`${h.name}: ${h.usedPercent}% of weekly limit used. Resets ${dayTime.format(resetsAt)}. ${outlook}.`}
    >
      <div className="bbb-head">
        <span className="bbb-icon" aria-hidden="true">
          <ProviderIcon providerKind="agent" provider={provider} />
        </span>
        <span className="bbb-name">{h.name}</span>
        {h.planLabel && <span className="bbb-plan">{h.planLabel}</span>}
        <span className="bbb-pct">
          {h.usedPercent}
          <small>%</small>
        </span>
      </div>
      <BurnChart h={h} burn={burn} now={now} />
      <div className="bbb-detail">
        <div>
          <p>
            Resets {dayTime.format(resetsAt)}
            <span className="bbb-in">in {until(resetsAt - now)}</span>
          </p>
          <p className="bbb-outlook">{outlook}</p>
        </div>
      </div>
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
  useRealtime(USAGE_CHANGED, refetch);
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
  const card = app.experimental_sidebarFooter.register({
    kind: "disclosure",
    id: "weekly-usage",
    label: "Weekly usage",
    icon: "ChartColumn",
    component: WeeklyUsageCard,
  });
  // Show the card by default; the footer button still hides and reveals it.
  app.contentScripts.register({
    id: "open-weekly-usage",
    mount() {
      card.open();
      return () => {};
    },
  });
});
