// Beautiful bb backend. Themes load from `bb.themes` in package.json; this
// entry samples each agent harness's weekly usage limit so the sidebar usage
// card can draw how the week has burned, not just where it stands now.
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_SAMPLES = 1200;
export const USAGE_CHANGED = "usage-changed";

const sampleSchema = z.object({ t: z.number(), pct: z.number() });
type Sample = z.infer<typeof sampleSchema>;

const historySchema = z.object({ resetsAt: z.string(), samples: z.array(sampleSchema) });
type History = z.infer<typeof historySchema>;

const harnessSchema = z.object({
  id: z.string(),
  name: z.string(),
  planLabel: z.string().nullable(),
  usedPercent: z.number(),
  resetsAt: z.string(),
  windowStart: z.number(),
  samples: z.array(sampleSchema),
});
export type HarnessUsage = z.infer<typeof harnessSchema>;

export const rpcContract = defineRpcContract({
  weekly_usage: {
    input: z.null(),
    output: z.object({ harnesses: z.array(harnessSchema), observedAt: z.number() }),
  },
});

const NAMES: Record<string, string> = { "claude-code": "Claude", codex: "Codex" };

type WeeklyReading = { id: string; planLabel: string | null; usedPercent: number; resetsAt: string };

export default async function plugin(bb: BbPluginApi) {
  const historyKey = (id: string) => `weekly-history:${id}`;

  async function readWeekly(): Promise<WeeklyReading[]> {
    const usage = await bb.sdk.system.usageLimits();
    const readings: WeeklyReading[] = [];
    for (const [id, entry] of Object.entries(usage)) {
      if (entry.status !== "ok") continue;
      // The account-wide weekly window; per-model weekly windows carry `model`.
      const weekly = entry.windows.find((w) => w.kind === "weekly" && !("model" in w && w.model));
      if (!weekly?.resetsAt) continue;
      readings.push({ id, planLabel: entry.planLabel, usedPercent: weekly.usedPercent, resetsAt: weekly.resetsAt });
    }
    return readings;
  }

  async function loadHistory(id: string, resetsAt: string): Promise<Sample[]> {
    const parsed = historySchema.safeParse(await bb.storage.kv.get(historyKey(id)));
    // A different reset time means a new week: the old samples no longer apply.
    return parsed.success && parsed.data.resetsAt === resetsAt ? parsed.data.samples : [];
  }

  async function record(readings: WeeklyReading[], now: number) {
    for (const r of readings) {
      const samples = await loadHistory(r.id, r.resetsAt);
      const last = samples.at(-1);
      if (last && last.pct === r.usedPercent && now - last.t < 30 * 60 * 1000) continue;
      samples.push({ t: now, pct: r.usedPercent });
      const history: History = { resetsAt: r.resetsAt, samples: samples.slice(-MAX_SAMPLES) };
      await bb.storage.kv.set(historyKey(r.id), history);
    }
  }

  async function sample() {
    try {
      await record(await readWeekly(), Date.now());
      bb.realtime.publish(USAGE_CHANGED, null);
    } catch (error) {
      bb.log.warn(`usage sample failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  bb.rpc.register(rpcContract, {
    weekly_usage: async () => {
      const now = Date.now();
      const readings = await readWeekly();
      await record(readings, now);
      const harnesses = await Promise.all(
        readings.map(async (r) => ({
          id: r.id,
          name: NAMES[r.id] ?? r.id,
          planLabel: r.planLabel,
          usedPercent: r.usedPercent,
          resetsAt: r.resetsAt,
          windowStart: Date.parse(r.resetsAt) - WEEK_MS,
          samples: await loadHistory(r.id, r.resetsAt),
        })),
      );
      return { harnesses, observedAt: now };
    },
  });

  bb.background.schedule("sample-weekly-usage", "*/10 * * * *", sample);
  void sample();
}
