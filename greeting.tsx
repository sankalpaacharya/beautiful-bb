// Home greeting on the new-thread screen: a time-of-day hello, today's fresh
// token count across Claude and Codex, and the thread that finished last.
import { useEffect, useState } from "react";
import {
  experimental_useSidebarThreads as useSidebarThreads,
  useBbNavigate,
  useRpc,
  useSettings,
} from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "./server";
import "./greeting.css";

const tokenCount = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });

function partOfDay(hour: number) {
  if (hour < 5) return "Up late";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function ago(ms: number) {
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
}

export function HomeGreeting() {
  const { values } = useSettings();
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const { threads } = useSidebarThreads();
  const [data, setData] = useState<{ name: string | null; tokensToday: number } | null>(null);

  useEffect(() => {
    rpc.call("greeting", null).then(setData, () => setData({ name: null, tokensToday: 0 }));
  }, [rpc]);

  if (values?.homeGreeting === false || !data) return null;

  const last = threads
    .filter((t) => t.status === "idle" && !t.isArchived && !t.isHidden)
    .reduce<(typeof threads)[number] | null>((a, t) => (!a || t.updatedAt > a.updatedAt ? t : a), null);
  const now = Date.now();

  return (
    <div className="bbb-greeting">
      <p className="bbb-greeting-hello">
        {partOfDay(new Date().getHours())}
        {data.name ? `, ${data.name}` : ""}.
      </p>
      <p className="bbb-greeting-meta">
        <span>{data.tokensToday > 0 ? `${tokenCount.format(data.tokensToday)} tokens today` : "No tokens used yet today"}</span>
        {last && (
          <button type="button" onClick={() => navigate.toThread(last.id)}>
            Last finished: {last.displayTitle} <span className="bbb-greeting-ago">{ago(now - last.updatedAt)}</span>
          </button>
        )}
      </p>
    </div>
  );
}
