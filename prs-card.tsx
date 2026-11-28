// The PRs card: a one-row header in the footer stack that counts what needs
// the user, and a fixed-height panel that floats upward from it over the
// thread list, so the cards below never move. The panel holds filter chips
// (one repo and one state at a time) over a list built for skimming: a state
// icon pinned at the left and lines changed pinned at the right, with the full
// title over a quiet line of number and age between them; most urgent first,
// drafts last. The list scrolls both ways, and long titles slide under the
// pinned parts. Everything else is in the row's tooltip. Clicking a row opens the PR. The
// filter survives reloads.
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { useBbNavigate, useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "./server";
import {
  age,
  applyFilter,
  checksSummary,
  filterChips,
  liveFilter,
  NO_FILTER,
  status,
  summarize,
  type PrFilter,
  type PrsResult,
  type PullRequest,
  type Status,
} from "./prs";
import "./prs-card.css";

const REFRESH_MS = 5 * 60 * 1000;
const FILTER_KEY = "beautiful-bb:prs-filter";
/** Space between the header card and the panel above it, and the panel's margin from the window top. */
const GAP_PX = 6;

/** Lucide icon paths (ISC), drawn at 12px like the system card's glyphs. */
const ICONS = {
  pr: "M18 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6M6 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6M13 6h3a2 2 0 0 1 2 2v7M6 9v12",
  draft: "M18 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6M6 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6M18 6V5M18 11v-1M6 9v12",
  failing: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M15 9l-6 6M9 9l6 6",
  running: "M21 12a9 9 0 1 1-6.22-8.56",
  conflicts: "M21.73 18l-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3M12 9v4M12 17h.01",
  changes: "M5 19l-2 2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9M9 10h6M12 7v6M9 17h6",
  approved: "M20 6L9 17l-5-5",
  chevron: "M18 15l-6-6-6 6",
  clock: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M12 6v6l4 2",
  usage: "M3 3v16a2 2 0 0 0 2 2h16M18 17V9M13 17V5M8 17v-3",
} as const;
type IconName = keyof typeof ICONS;
type Tone = "warn" | "bad";

export function Icon({ name, tone }: { name: IconName; tone?: Tone }) {
  return (
    <svg className="bbb-pr-icon" data-tone={tone} viewBox="0 0 24 24" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

/** The row's one icon: the most pressing thing about the PR. */
const STATUS: Record<Status, { label: string; icon: IconName; tone?: Tone }> = {
  failing: { label: "CI failing", icon: "failing", tone: "bad" },
  conflicts: { label: "Merge conflicts", icon: "conflicts", tone: "warn" },
  changes: { label: "Changes requested", icon: "changes", tone: "warn" },
  running: { label: "CI running", icon: "running", tone: "warn" },
  ready: { label: "Ready to merge", icon: "approved" },
  approved: { label: "Approved", icon: "approved" },
  draft: { label: "Draft", icon: "draft" },
  open: { label: "Open", icon: "pr" },
};

const CI_TEXT: Record<PullRequest["ci"], string> = {
  failing: "failing",
  running: "running",
  passing: "passing",
  none: "no checks",
};

const REVIEW_TEXT: Record<PullRequest["review"], string | null> = {
  approved: "Approved",
  changes: "Changes requested",
  pending: "Review required",
  none: null,
};

const lineCount = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });

function details(pr: PullRequest, now: number): string {
  return [
    pr.title,
    `${pr.repo} #${pr.number}${pr.draft ? ", draft" : ""}`,
    `+${lineCount.format(pr.additions)} −${lineCount.format(pr.deletions)} lines${pr.size ? `, ${pr.size}` : ""}`,
    `CI ${CI_TEXT[pr.ci]}${pr.ci === "none" ? "" : `: ${checksSummary(pr.checks)}`}`,
    [REVIEW_TEXT[pr.review], pr.merge === "conflicts" && "Merge conflicts"].filter(Boolean).join(", "),
    `Opened ${age(pr.createdAt, now)} ago`,
  ]
    .filter(Boolean)
    .join("\n");
}

function Avatar({ src }: { src: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) return null;
  return <img className="bbb-pr-avatar" src={src} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} />;
}

/** Opens a PR in the default browser through the plugin server; bb's own opener is the fallback. */
function useOpenUrl() {
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  return useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();
      const url = e.currentTarget.href;
      rpc.call("open_pr", url).then(
        (opened) => opened || navigate.openUrl(url),
        () => navigate.openUrl(url),
      );
    },
    [rpc, navigate],
  );
}

type RowProps = { pr: PullRequest; now: number; onOpen: (e: MouseEvent<HTMLAnchorElement>) => void };

function PrRow({ pr, now, onOpen }: RowProps) {
  const s = STATUS[status(pr)];
  return (
    <li>
      <a className="bbb-pr" href={pr.url} title={details(pr, now)} data-draft={pr.draft || undefined} onClick={onOpen}>
        <span className="bbb-pr-state" role="img" aria-label={s.label}>
          <Icon name={s.icon} tone={s.tone} />
        </span>
        <span className="bbb-pr-text">
          <span className="bbb-pr-title">{pr.title}</span>
          <span className="bbb-pr-sub">
            #{pr.number}
            {pr.draft && " · draft"} · {age(pr.createdAt, now)}
          </span>
        </span>
        <span className="bbb-pr-diff" aria-label={`${pr.additions} lines added, ${pr.deletions} removed`}>
          <ins>+{lineCount.format(pr.additions)}</ins>
          <del>−{lineCount.format(pr.deletions)}</del>
        </span>
      </a>
    </li>
  );
}

/**
 * Asks the server for the list. Only loading the card and a five-minute timer
 * while the window is visible may call GitHub, and the shared cache still
 * skips the call while its data is fresh or a backoff holds. Hover, window
 * focus and opening the panel only re-read the cache.
 */
function usePullRequests() {
  const rpc = useRpc<typeof rpcContract>();
  const [result, setResult] = useState<PrsResult | null>(null);
  const load = useCallback(
    (refresh: boolean) => {
      rpc.call("my_prs", { refresh }).then(
        (next) => setResult((current) => (next.status !== "ok" && current?.status === "ok" ? current : next)),
        () => setResult((current) => current ?? { status: "error" }),
      );
    },
    [rpc],
  );
  const reread = useCallback(() => load(false), [load]);
  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") load(true);
    };
    refreshIfVisible();
    const timer = window.setInterval(refreshIfVisible, REFRESH_MS);
    document.addEventListener("visibilitychange", refreshIfVisible);
    window.addEventListener("focus", reread);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshIfVisible);
      window.removeEventListener("focus", reread);
    };
  }, [load, reread]);
  // Another plugin or window is fetching; pick its result up from the cache shortly.
  useEffect(() => {
    if (result?.status !== "pending") return;
    const timer = window.setTimeout(reread, 3000);
    return () => window.clearTimeout(timer);
  }, [result, reread]);
  return { result, reread };
}

function readFilter(): PrFilter {
  try {
    const s = JSON.parse(localStorage.getItem(FILTER_KEY) ?? "{}");
    return {
      repo: typeof s.repo === "string" ? s.repo : null,
      state: s.state === "attention" || s.state === "ready" ? s.state : null,
    };
  } catch {
    return NO_FILTER;
  }
}

function useStoredFilter() {
  const [filter, setFilter] = useState(readFilter);
  const update = useCallback((change: Partial<PrFilter>) => {
    setFilter((current) => {
      const next = { ...current, ...change };
      localStorage.setItem(FILTER_KEY, JSON.stringify(next));
      return next;
    });
  }, []);
  return [filter, update] as const;
}

/** Nonzero counts only, so a quiet day shows just "PRs 6". */
function Summary({ prs }: { prs: PullRequest[] }) {
  const { failing, blocked, ready } = summarize(prs);
  const item = (n: number, icon: IconName, label: string, tone?: Tone) =>
    n > 0 && (
      <span title={`${n} ${label}`}>
        <Icon name={icon} tone={tone} />
        {n}
        <span className="bbb-sr"> {label}</span>
      </span>
    );
  return (
    <span className="bbb-prs-summary">
      {item(failing, "failing", "failing CI", "bad")}
      {item(blocked, "conflicts", "with conflicts or requested changes", "warn")}
      {item(ready, "approved", "ready to merge")}
    </span>
  );
}

type ChipProps = { active: boolean; count: number; label: string; onClick: () => void; children: ReactNode };

function Chip({ active, count, label, onClick, children }: ChipProps) {
  return (
    <button
      type="button"
      className="bbb-chip"
      aria-pressed={active}
      data-empty={count === 0 || undefined}
      title={`${label}: ${count}`}
      onClick={onClick}
    >
      {children}
      <span className="bbb-chip-count">{count}</span>
    </button>
  );
}

function Chips({ prs, filter, onChange }: { prs: PullRequest[]; filter: PrFilter; onChange: (f: Partial<PrFilter>) => void }) {
  const chips = filterChips(prs, filter);
  const row = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (row.current) setEdgeFades(row.current);
  });
  const stateChip = (state: "attention" | "ready", icon: IconName, label: string, count: number, tone?: Tone) => (
    <Chip
      active={filter.state === state}
      count={count}
      label={label}
      onClick={() => onChange({ state: filter.state === state ? null : state })}
    >
      <Icon name={icon} tone={tone} />
      <span className="bbb-sr">{label}</span>
    </Chip>
  );
  return (
    <div
      className="bbb-chips"
      role="group"
      aria-label="Filter pull requests"
      ref={row}
      onScroll={(e) => setEdgeFades(e.currentTarget)}
    >
      <Chip active={!filter.repo && !filter.state} count={prs.length} label="All open PRs" onClick={() => onChange(NO_FILTER)}>
        All
      </Chip>
      {stateChip("attention", "conflicts", "Needs attention", chips.attention, "warn")}
      {stateChip("ready", "approved", "Ready to merge", chips.ready)}
      {chips.repos.map((r) => (
        <Chip
          key={r.repo}
          active={filter.repo === r.repo}
          count={r.count}
          label={r.repo}
          onClick={() => onChange({ repo: filter.repo === r.repo ? null : r.repo })}
        >
          <Avatar src={r.avatar} />
          {r.tag}
        </Chip>
      ))}
    </div>
  );
}

/** Fades a scroller's edges only while there is more to scroll that way. */
function setEdgeFades(el: HTMLElement) {
  el.toggleAttribute("data-more-above", el.scrollTop > 1);
  el.toggleAttribute("data-more-below", el.scrollTop + el.clientHeight < el.scrollHeight - 1);
  el.toggleAttribute("data-more-left", el.scrollLeft > 1);
  el.toggleAttribute("data-more-right", el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
}

/**
 * Keeps the panel's bottom edge just above the header card and its width
 * matched to it, every frame while open: the sidebar can resize and the
 * footer stack can change height under it. It places the panel, then reads
 * where it actually landed and corrects by the difference, so the result
 * holds even when the fixed-position containing block is not the viewport.
 */
function usePinAbove(anchor: RefObject<HTMLElement | null>, panel: RefObject<HTMLElement | null>, open: boolean) {
  useLayoutEffect(() => {
    if (!open) return;
    let frame = 0;
    let last = "";
    const place = () => {
      const a = anchor.current?.getBoundingClientRect();
      const p = panel.current;
      if (a && p) {
        const next = `${a.left}|${a.width}|${a.top}`;
        if (next !== last) {
          last = next;
          p.style.setProperty("--bbb-prs-room", `${a.top - 2 * GAP_PX}px`);
          p.style.width = `${a.width}px`;
          p.style.left = `${a.left}px`;
          p.style.top = `${a.top - GAP_PX - p.offsetHeight}px`;
          const landed = p.getBoundingClientRect();
          p.style.left = `${2 * a.left - landed.left}px`;
          p.style.top = `${parseFloat(p.style.top) + (a.top - GAP_PX - landed.bottom)}px`;
        }
      }
      frame = requestAnimationFrame(place);
    };
    place();
    return () => cancelAnimationFrame(frame);
  }, [anchor, panel, open]);
}

/**
 * Escape or a press outside the panel and the header closes it. bb closes the
 * whole footer disclosure on Escape, so while the panel is open this listener
 * runs first (window, capture) and keeps that Escape to itself.
 */
function useDismiss(open: boolean, close: () => void, inside: RefObject<HTMLElement | null>[]) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      close();
    };
    const onPointer = (e: PointerEvent) => {
      if (!inside.some((r) => r.current?.contains(e.target as Node))) close();
    };
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointer, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPointer, true);
    };
  }, [open, close, inside]);
}

/** Past this, the header shows a muted clock even without a problem: the timer has not run for a while. */
const STALE_HINT_MS = 15 * 60 * 1000;

const PROBLEM_TEXT: Record<NonNullable<Extract<PrsResult, { status: "ok" }>["problem"]>, string> = {
  "rate-limited": "GitHub rate limit reached",
  error: "Couldn't reach GitHub",
  "no-gh": "The GitHub CLI (gh) isn't installed",
  "signed-out": "gh is signed out",
};

const clockTime = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

/** "Updated 12m ago. GitHub rate limit reached; retrying at 10:25 PM." */
function freshness(result: Extract<PrsResult, { status: "ok" }>, now: number): string {
  const updated = `Updated ${age(new Date(result.observedAt).toISOString(), now)} ago.`;
  if (!result.problem) return updated;
  const retry = result.retryAt && result.retryAt > now ? `; retrying at ${clockTime.format(result.retryAt)}` : "";
  return `${updated} ${PROBLEM_TEXT[result.problem]}${retry}.`;
}

const QUIET_LINE: Record<Exclude<PrsResult["status"], "ok">, string> = {
  "no-gh": "Install the GitHub CLI (gh) to see your PRs here.",
  "signed-out": "Run gh auth login to see your PRs here.",
  "rate-limited": "GitHub rate limit reached. Retrying in a few minutes.",
  pending: "",
  error: "Couldn't reach GitHub.",
};

export function PrsCard() {
  const { result, reread } = usePullRequests();
  const [stored, updateFilter] = useStoredFilter();
  const [open, setOpen] = useState(false);
  const onOpen = useOpenUrl();
  const panelId = useId();
  const card = useRef<HTMLElement>(null);
  const head = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [inside] = useState(() => [panel, head]);
  const prs = result?.status === "ok" ? result.prs : [];
  const filter = liveFilter(prs, stored);
  const shown = applyFilter(prs, filter);

  const close = useCallback(() => {
    setOpen(false);
    if (panel.current?.contains(document.activeElement)) head.current?.focus();
  }, []);
  usePinAbove(card, panel, open);
  useDismiss(open, close, inside);
  useLayoutEffect(() => {
    if (list.current) setEdgeFades(list.current);
  });
  const filterKey = `${filter.repo}|${filter.state}`;
  useLayoutEffect(() => {
    list.current?.scrollTo(0, 0);
  }, [filterKey]);

  if (result === null || result.status === "pending") {
    return (
      <section className="bbb-card bbb-prs" aria-busy="true">
        <p className="bbb-prs-head">
          <Icon name="pr" />
          <span className="bbb-prs-label">PRs</span>
        </p>
      </section>
    );
  }
  if (result.status !== "ok" || prs.length === 0) {
    return (
      <div className="bbb-card" onPointerEnter={reread}>
        <p className="bbb-empty">{result.status === "ok" ? "No open PRs." : QUIET_LINE[result.status]}</p>
      </div>
    );
  }
  const filtered = shown.length !== prs.length;
  return (
    <section ref={card} className="bbb-card bbb-prs" aria-label="Your open pull requests" onPointerEnter={reread}>
      <button
        ref={head}
        type="button"
        className="bbb-prs-head"
        aria-expanded={open}
        aria-controls={panelId}
        title={freshness(result, Date.now())}
        onClick={() => {
          if (!open) reread();
          setOpen((was) => !was);
        }}
      >
        <Icon name="pr" />
        <span className="bbb-prs-label">PRs</span>
        <span className="bbb-prs-count">
          {shown.length}
          {filtered && <span> of {prs.length}</span>}
        </span>
        <Summary prs={shown} />
        {(result.problem || Date.now() - result.observedAt > STALE_HINT_MS) && (
          <span className="bbb-prs-stale" role="img" aria-label={freshness(result, Date.now())}>
            <Icon name="clock" />
          </span>
        )}
        <Icon name="chevron" />
      </button>
      {createPortal(
        <div
          ref={panel}
          id={panelId}
          className="bbb-prs-panel"
          role="dialog"
          aria-label="Pull requests"
          data-open={open || undefined}
          inert={!open}
        >
          <div className="bbb-prs-sheet">
            <div className="bbb-prs-sheet-content">
              <Chips prs={prs} filter={filter} onChange={updateFilter} />
              <div className="bbb-prs-list" ref={list} onScroll={(e) => setEdgeFades(e.currentTarget)}>
                {shown.length ? (
                  <ul>
                    {shown.map((pr) => (
                      <PrRow key={pr.url} pr={pr} now={result.observedAt} onOpen={onOpen} />
                    ))}
                  </ul>
                ) : (
                  <p className="bbb-empty">No PRs match.</p>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </section>
  );
}
