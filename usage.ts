import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";

export const PROVIDER_NAMES: Record<string, string> = { "claude-code": "Claude", codex: "Codex" };

const limitSchema = z.object({ usedPercent: z.number(), resetsAt: z.string() });
type Limit = z.infer<typeof limitSchema>;

export const weeklyAccountSchema = z.object({
  id: z.string(),
  providerId: z.string(),
  name: z.string(),
  accountKey: z.string().nullable(),
  accountLabel: z.string().nullable(),
  usedPercent: z.number(),
  resetsAt: z.string(),
  fiveHour: limitSchema.nullable(),
});
export type WeeklyAccount = z.infer<typeof weeklyAccountSchema>;

const resourcesSchema = z.object({
  resources: z.array(z.object({
    id: z.string(),
    providerId: z.string(),
    label: z.string(),
    accountKey: z.string().nullable(),
  })),
});
const measurementSchema = z.object({
  accountKey: z.string().nullable(),
  usage: z.discriminatedUnion("status", [
    z.object({
      status: z.literal("ok"),
      accountEmail: z.string().nullable(),
      windows: z.array(z.object({
        kind: z.string(),
        model: z.string().nullable(),
        usedPercent: z.number(),
        resetsAt: z.string().nullable(),
      })),
    }),
    z.object({ status: z.enum(["not_installed", "unauthenticated", "expired", "error"]) }),
  ]),
});

/** The account-wide window of one kind, if it has a reset time; per-model windows carry `model`. */
export function accountLimit(
  windows: ReadonlyArray<{ kind?: unknown; model?: unknown; usedPercent: number; resetsAt: string | null }>,
  kind: "weekly" | "five-hour",
): Limit | null {
  const window = windows.find((window) => window.kind === kind && !window.model);
  return window?.resetsAt ? { usedPercent: window.usedPercent, resetsAt: window.resetsAt } : null;
}

export function uniqueWeeklyAccounts(accounts: WeeklyAccount[]): WeeklyAccount[] {
  const seen = new Set<string>();
  return accounts.filter((account) => {
    if (account.accountKey === null) return true;
    const key = JSON.stringify([account.providerId, account.accountKey]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function pooledWeeklyUsage(bb: BbPluginApi): Promise<WeeklyAccount[]> {
  const { plugins } = await bb.sdk.plugins.list();
  if (!plugins.some((plugin) => plugin.id === "account-pool" && plugin.enabled)) return [];
  const { resources } = await bb.sdk.plugins.callRpc({
    pluginId: "account-pool",
    method: "provider-usage.v1.listResources",
    input: {},
    outputSchema: resourcesSchema,
  });
  const results = await Promise.allSettled(resources.map(async (resource): Promise<WeeklyAccount[]> => {
    const measurement = await bb.sdk.plugins.callRpc({
      pluginId: "account-pool",
      method: "provider-usage.v1.getResource",
      input: { resourceId: resource.id, refresh: false },
      outputSchema: measurementSchema,
    });
    if (measurement.usage.status !== "ok") return [];
    const weekly = accountLimit(measurement.usage.windows, "weekly");
    if (!weekly) return [];
    const accountLabel = measurement.usage.accountEmail ?? resource.label;
    return [{
      id: `account-pool:${resource.id}`,
      providerId: resource.providerId,
      name: PROVIDER_NAMES[resource.providerId] ?? resource.providerId,
      accountKey: measurement.accountKey ?? resource.accountKey,
      accountLabel,
      ...weekly,
      fiveHour: accountLimit(measurement.usage.windows, "five-hour"),
    }];
  }));
  return results.flatMap((result) => {
    if (result.status === "fulfilled") return result.value;
    bb.log.warn("A pooled account's usage could not be collected.");
    return [];
  });
}
