// Beautiful bb backend. Themes load from `bb.themes` in package.json. This
// entry owns the feature settings (each feature can be switched off) and serves
// the sidebar cards' and home greeting's data.
import { execFile } from "node:child_process";
import { userInfo } from "node:os";
import { promisify } from "node:util";
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { FAMILY_NAME, normalizeFont, type CatalogFont } from "./fonts";
import {
  DEFAULT_SHADER_COLOR,
  DEFAULT_WALLPAPER,
  SHADER_COLORS,
  SHADER_COLOR_IDS,
  WALLPAPERS,
  WALLPAPER_IDS,
} from "./wallpapers";
import { dailyTokens, type DailyTokens } from "./tokens";
import { pooledWeeklyUsage, PROVIDER_NAMES, sessionWindow, uniqueWeeklyAccounts, weeklyAccountSchema } from "./usage";
import { dailyGains, dayBarSchema, dayBars, trackUsage } from "./usage-history";
import { createSystemSampler, systemStatsSchema, topProcess } from "./system";
import { prsResultSchema } from "./prs";
import { myPullRequests, openInBrowser } from "./prs-source";

const TOKENS_TTL_MS = 5 * 60 * 1000;
/** Realtime channel: published whenever a setting changes, so every window re-applies. */
export const SETTINGS_CHANGED = "settings-changed";

const harnessSchema = weeklyAccountSchema.omit({ accountKey: true }).extend({
  daily: z.array(dayBarSchema),
  historySince: z.string().nullable(),
});
export type HarnessUsage = z.infer<typeof harnessSchema>;

const catalogFontSchema = z.object({ family: z.string(), category: z.string() });

export const rpcContract = defineRpcContract({
  font_catalog: {
    input: z.null(),
    output: z.object({ fonts: z.array(catalogFontSchema) }),
  },
  weekly_usage: {
    input: z.null(),
    output: z.object({ harnesses: z.array(harnessSchema), observedAt: z.number() }),
  },
  system_stats: {
    input: z.null(),
    output: systemStatsSchema,
  },
  top_process: {
    input: z.null(),
    output: z.object({ name: z.string(), cpu: z.number() }).nullable(),
  },
  features: {
    input: z.null(),
    output: z.object({ usageCard: z.boolean(), waveSpinner: z.boolean() }),
  },
  my_prs: {
    /** `refresh` may fetch from GitHub (when the shared cache is stale); otherwise it only reads the cache. */
    input: z.object({ refresh: z.boolean() }),
    output: prsResultSchema,
  },
  open_pr: {
    input: z.string(),
    output: z.boolean(),
  },
  greeting: {
    input: z.null(),
    output: z.object({ name: z.string().nullable(), tokensToday: z.number() }),
  },
  settings_get: {
    input: z.null(),
    output: z.lazy(() => preferencesSchema),
  },
  settings_set: {
    input: z.lazy(() => preferencesSchema.partial()),
    output: z.lazy(() => preferencesSchema),
  },
});

/** Everything the plugin's settings page reads and writes. */
const preferencesSchema = z.object({
  usageCard: z.boolean(),
  systemCard: z.boolean(),
  prsCard: z.boolean(),
  waveSpinner: z.boolean(),
  agentActivity: z.boolean(),
  composerGlow: z.boolean(),
  homeGreeting: z.boolean(),
  railPattern: z.boolean(),
  animateShader: z.boolean(),
  shaderColor: z.enum(SHADER_COLOR_IDS),
  /** Text size as a percent of bb's default type scale. */
  fontScale: z.number().int().min(85).max(140),
  /** UI font: "theme", "inter", or "google:<Family>"; see fonts.ts. */
  font: z.string().transform(normalizeFont),
  wallpaper: z.enum(WALLPAPER_IDS),
});
export type Preferences = z.infer<typeof preferencesSchema>;

/** Google's public catalog of font families, as the fonts.google.com site loads it. */
const CATALOG_URL = "https://fonts.google.com/metadata/fonts";
const catalogSchema = z.object({
  familyMetadataList: z.array(z.object({ family: z.string(), category: z.string(), popularity: z.number() })),
});

let catalog: Promise<CatalogFont[]> | null = null;

/** Every Google Fonts family, most popular first. Fetched once; a failed fetch is retried on the next call. */
function fontCatalog(): Promise<CatalogFont[]> {
  catalog ??= (async () => {
    const res = await fetch(CATALOG_URL, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`Google Fonts catalog returned ${res.status}`);
    const { familyMetadataList } = catalogSchema.parse(await res.json());
    return familyMetadataList
      .filter((f) => FAMILY_NAME.test(f.family))
      .sort((a, b) => a.popularity - b.popularity)
      .map(({ family, category }) => ({ family, category }));
  })().catch((error) => {
    catalog = null;
    throw error;
  });
  return catalog;
}

export default async function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    usageCard: {
      type: "boolean",
      label: "Usage card",
      description: "Show each account's weekly limit, 5-hour limit where the plan has one, and 7-day activity above the sidebar footer.",
      default: true,
    },
    systemCard: {
      type: "boolean",
      label: "System card",
      description: "Show this Mac's live CPU and memory use above the usage card.",
      default: true,
    },
    prsCard: {
      type: "boolean",
      label: "PRs card",
      description: "Your open pull requests with CI, review and merge state, above the system card. Uses the gh CLI's sign-in.",
      default: true,
    },
    waveSpinner: {
      type: "boolean",
      label: "Wave spinner",
      description: 'Replace the shimmering "Working..." text in a running thread with a wave spinner.',
      default: true,
    },
    agentActivity: {
      type: "boolean",
      label: "Agent activity",
      description: "A tiny wave on working threads in the sidebar, and a burst of sparkles when one finishes.",
      default: true,
    },
    composerGlow: {
      type: "boolean",
      label: "Composer accent",
      description: "A thin accent border on the message box while you type.",
      default: false,
    },
    railPattern: {
      type: "boolean",
      label: "Rail pattern",
      description: "The home wallpaper's pattern rising from the bottom of the navigation rail, in the wallpaper color.",
      default: true,
    },
    homeGreeting: {
      type: "boolean",
      label: "Home greeting",
      description: "A greeting with today's token count on the new-thread screen.",
      default: true,
    },
    fontScale: {
      type: "number",
      label: "Text size",
      description: "Text size across bb, as a percent of the active theme's own sizes (85 to 140). Spacing stays the same.",
      default: 100,
    },
    font: {
      type: "string",
      label: "Font",
      description:
        'The font for bb\'s interface text: "theme", "inter", or "google:" plus any Google Fonts family, such as "google:Geist". Code and the terminal keep their monospace font.',
      default: "theme",
    },
    animateShader: {
      type: "boolean",
      label: "Animate wallpaper",
      description: "Let the wallpaper and the rail dither move slowly. Reduced motion keeps them still either way.",
      default: true,
    },
    shaderColor: {
      type: "select",
      label: "Wallpaper color",
      description: "The color of the wallpaper and the rail dither.",
      options: [...SHADER_COLOR_IDS],
      experimental_optionLabels: Object.fromEntries(SHADER_COLORS.map((c) => [c.id, c.label])),
      default: DEFAULT_SHADER_COLOR,
    },
    wallpaper: {
      type: "select",
      label: "Home wallpaper",
      description: "The animated effect behind the home screen (the new-thread page, also opened with Cmd+N).",
      options: [...WALLPAPER_IDS],
      experimental_optionLabels: Object.fromEntries(WALLPAPERS.map((w) => [w.id, w.label])),
      default: DEFAULT_WALLPAPER,
    },
  });

  const readPreferences = async (): Promise<Preferences> => preferencesSchema.parse(await settings.get());
  settings.onChange(() => bb.realtime.publish(SETTINGS_CHANGED, null));

  // First name for the home greeting: git's user.name, else the account name.
  const firstName = (async () => {
    try {
      const { stdout } = await promisify(execFile)("git", ["config", "--global", "user.name"], { timeout: 2000 });
      const name = stdout.trim().split(/\s+/)[0];
      if (name) return name;
    } catch {
      // No git or no user.name; fall back below.
    }
    const user = userInfo().username;
    return user ? user[0]!.toUpperCase() + user.slice(1) : null;
  })();

  // Reading session logs walks directories; reuse the result for a few minutes.
  let tokensCache: { at: number; byProvider: Record<string, DailyTokens> } | null = null;
  async function tokensFor(ids: string[]) {
    if (!tokensCache || Date.now() - tokensCache.at > TOKENS_TTL_MS) {
      tokensCache = { at: Date.now(), byProvider: await dailyTokens(ids) };
    }
    return tokensCache.byProvider;
  }

  const system = createSystemSampler();

  bb.rpc.register(rpcContract, {
    system_stats: () => system.snapshot(),
    top_process: topProcess,
    weekly_usage: async () => {
      const [usage, pooled] = await Promise.all([
        bb.sdk.system.usageLimits(),
        pooledWeeklyUsage(bb).catch(() => {
          bb.log.warn("Pooled usage is unavailable; showing local accounts.");
          return [];
        }),
      ]);
      const weekly = Object.entries(usage).flatMap(([id, entry]) => {
        if (entry.status !== "ok") return [];
        // The account-wide weekly window; per-model weekly windows carry `model`.
        const w = entry.windows.find((w) => w.kind === "weekly" && !("model" in w && w.model));
        return w?.resetsAt ? [{
          id,
          providerId: id,
          name: PROVIDER_NAMES[id] ?? id,
          accountKey: "accountKey" in entry && typeof entry.accountKey === "string" ? entry.accountKey : null,
          accountLabel: entry.accountEmail ?? null,
          usedPercent: w.usedPercent,
          resetsAt: w.resetsAt,
          session: sessionWindow(entry.windows),
        }] : [];
      });
      const now = Date.now();
      const accounts = uniqueWeeklyAccounts([...weekly, ...pooled]);
      const tokens = await tokensFor([...new Set(accounts.map((account) => account.providerId))]);
      const harnesses = await Promise.all(accounts.map(async ({ accountKey, ...account }) => {
        const history = await trackUsage(bb.storage.kv, { ...account, accountKey }, now).catch(() => {
          bb.log.warn(`Usage history for ${account.id} is unavailable.`);
          return null;
        });
        const gains = history ? dailyGains(history, now) : new Array<null>(7).fill(null);
        const sharedProvider = accounts.filter((other) => other.providerId === account.providerId).length > 1;
        return {
          ...account,
          daily: dayBars(gains, tokens[account.providerId] ?? [], sharedProvider),
          historySince: history?.since ?? null,
        };
      }));
      return { harnesses, observedAt: now };
    },
    my_prs: ({ refresh }) => myPullRequests(refresh, (message) => bb.log.warn(message)),
    open_pr: openInBrowser,
    greeting: async () => {
      const daily = await tokensFor(["claude-code", "codex"]);
      const tokensToday = Object.values(daily).reduce((sum, days) => sum + (days.at(-1) ?? 0), 0);
      return { name: await firstName, tokensToday };
    },
    font_catalog: async () => ({ fonts: await fontCatalog() }),
    settings_get: readPreferences,
    settings_set: async (changes) => {
      await settings.experimental_set(changes);
      return readPreferences();
    },
    features: async () => {
      const { usageCard, waveSpinner } = await settings.get();
      return { usageCard, waveSpinner };
    },
  });
}
