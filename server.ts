// Beautiful bb backend. Themes load from `bb.themes` in package.json; this
// entry serves the sidebar usage card: each agent harness's weekly limit plus
// its daily token totals for the last 7 days.
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { dailyTokens, type DailyTokens } from "./tokens";

const TOKENS_TTL_MS = 5 * 60 * 1000;

const harnessSchema = z.object({
  id: z.string(),
  name: z.string(),
  usedPercent: z.number(),
  resetsAt: z.string(),
  /** Fresh tokens per local day, oldest first, ending today; empty if unknown. */
  daily: z.array(z.number()),
});
export type HarnessUsage = z.infer<typeof harnessSchema>;

export const rpcContract = defineRpcContract({
  weekly_usage: {
    input: z.null(),
    output: z.object({ harnesses: z.array(harnessSchema), observedAt: z.number() }),
  },
});

const NAMES: Record<string, string> = { "claude-code": "Claude", codex: "Codex" };

export default async function plugin(bb: BbPluginApi) {
  // Reading session logs walks directories; reuse the result for a few minutes.
  let tokensCache: { at: number; byProvider: Record<string, DailyTokens> } | null = null;
  async function tokensFor(ids: string[]) {
    if (!tokensCache || Date.now() - tokensCache.at > TOKENS_TTL_MS) {
      tokensCache = { at: Date.now(), byProvider: await dailyTokens(ids) };
    }
    return tokensCache.byProvider;
  }

  bb.rpc.register(rpcContract, {
    weekly_usage: async () => {
      const usage = await bb.sdk.system.usageLimits();
      const weekly = Object.entries(usage).flatMap(([id, entry]) => {
        if (entry.status !== "ok") return [];
        // The account-wide weekly window; per-model weekly windows carry `model`.
        const w = entry.windows.find((w) => w.kind === "weekly" && !("model" in w && w.model));
        return w?.resetsAt ? [{ id, usedPercent: w.usedPercent, resetsAt: w.resetsAt }] : [];
      });
      const tokens = await tokensFor(weekly.map((w) => w.id));
      return {
        harnesses: weekly.map((w) => ({ ...w, name: NAMES[w.id] ?? w.id, daily: tokens[w.id] ?? [] })),
        observedAt: Date.now(),
      };
    },
  });
}
