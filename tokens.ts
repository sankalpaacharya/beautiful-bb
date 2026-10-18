// Daily token totals for the last 7 days, read from the harnesses' own local
// session logs so usage outside bb counts too. "Tokens" here are fresh tokens:
// input, output, and cache writes, without cache reads, which would dwarf the
// rest and track context length rather than work done.
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

export const DAYS = 7;

/** Index 0 is six days ago, index 6 is today, in local time. */
export type DailyTokens = number[];

function dayStarts(now: Date): number[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Array.from({ length: DAYS }, (_, i) => new Date(today).setDate(new Date(today).getDate() - (DAYS - 1 - i)));
}

function dayIndex(starts: number[], t: number): number {
  for (let i = DAYS - 1; i >= 0; i--) if (t >= starts[i]!) return i;
  return -1;
}

async function recentJsonl(dir: string, since: number): Promise<string[]> {
  const found: string[] = [];
  async function walk(path: string) {
    let entries;
    try {
      entries = await readdir(path, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(path, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name.endsWith(".jsonl") && (await stat(full)).mtimeMs >= since) found.push(full);
    }
  }
  await walk(dir);
  return found;
}

async function eachLine(file: string, needle: string, fn: (record: any) => void) {
  const lines = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.includes(needle)) continue;
    try {
      fn(JSON.parse(line));
    } catch {
      // A partially written last line is expected while a session is live.
    }
  }
}

async function claudeDaily(starts: number[]): Promise<DailyTokens> {
  const days = new Array<number>(DAYS).fill(0);
  const seen = new Set<string>();
  for (const file of await recentJsonl(join(homedir(), ".claude", "projects"), starts[0]!)) {
    await eachLine(file, '"usage"', (r) => {
      const usage = r?.message?.usage;
      const t = Date.parse(r?.timestamp);
      if (!usage || Number.isNaN(t)) return;
      // Streaming writes the same message several times; count it once.
      const key = `${r.message.id}:${r.requestId}`;
      if (seen.has(key)) return;
      seen.add(key);
      const i = dayIndex(starts, t);
      if (i < 0) return;
      days[i]! += (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.output_tokens ?? 0);
    });
  }
  return days;
}

async function codexDaily(starts: number[]): Promise<DailyTokens> {
  const days = new Array<number>(DAYS).fill(0);
  for (const file of await recentJsonl(join(homedir(), ".codex", "sessions"), starts[0]!)) {
    // Codex logs running totals per session; repeated events carry the same
    // total, so add only the growth since the previous event.
    let previous = 0;
    await eachLine(file, '"token_count"', (r) => {
      const total = r?.payload?.info?.total_token_usage;
      const t = Date.parse(r?.timestamp);
      if (!total || Number.isNaN(t)) return;
      const fresh = (total.input_tokens ?? 0) - (total.cached_input_tokens ?? 0) + (total.output_tokens ?? 0);
      const delta = fresh - previous;
      previous = fresh;
      const i = dayIndex(starts, t);
      if (delta > 0 && i >= 0) days[i]! += delta;
    });
  }
  return days;
}

const READERS: Record<string, (starts: number[]) => Promise<DailyTokens>> = {
  "claude-code": claudeDaily,
  codex: codexDaily,
};

export async function dailyTokens(providerIds: string[], now = new Date()): Promise<Record<string, DailyTokens>> {
  const starts = dayStarts(now);
  const result: Record<string, DailyTokens> = {};
  await Promise.all(
    providerIds.map(async (id) => {
      const read = READERS[id];
      if (read) result[id] = await read(starts).catch(() => new Array<number>(DAYS).fill(0));
    }),
  );
  return result;
}
