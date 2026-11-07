// Beautiful bb backend. Themes load from `bb.themes` in package.json. This
// entry owns the feature settings (each feature can be switched off) and serves
// the sidebar usage card's and home greeting's data.
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

const TOKENS_TTL_MS = 5 * 60 * 1000;
/** Realtime channel: published whenever a setting changes, so every window re-applies. */
export const SETTINGS_CHANGED = "settings-changed";

const harnessSchema = z.object({
  id: z.string(),
  name: z.string(),
  usedPercent: z.number(),
  resetsAt: z.string(),
  /** Tokens per local day (see tokens.ts), oldest first, ending today; empty if unknown. */
  daily: z.array(z.number()),
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
  features: {
    input: z.null(),
    output: z.object({ usageCard: z.boolean(), waveSpinner: z.boolean() }),
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

const NAMES: Record<string, string> = { "claude-code": "Claude", codex: "Codex" };

/** Everything the plugin's settings page reads and writes. */
const preferencesSchema = z.object({
  usageCard: z.boolean(),
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
      description: "Show each agent's weekly limit and 7-day token use above the sidebar footer.",
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
