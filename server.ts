// Beautiful bb backend. Themes load from `bb.themes` in package.json. This
// entry owns the feature settings (each feature can be switched off), serves
// the sidebar usage card's data, and serves the home wallpaper image.
import { execFile } from "node:child_process";
import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { homedir, userInfo } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { dailyTokens, type DailyTokens } from "./tokens";

const TOKENS_TTL_MS = 5 * 60 * 1000;
/** Realtime channel: published whenever a setting changes, so every window re-applies. */
export const SETTINGS_CHANGED = "settings-changed";

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

/** Wallpapers bundled in assets/wallpapers/<id>.jpg (original art made for this plugin). */
export const BUILT_IN_WALLPAPERS = {
  headphones: "Headphones girl",
  coder: "Late-night coder",
  capybara: "Astronaut capybara",
  kitsune: "Sleeping kitsune",
  samurai: "Samurai",
  robot: "Robot buddy",
} as const;

const WALLPAPER_IDS = ["none", ...Object.keys(BUILT_IN_WALLPAPERS), "custom"] as const;
const STYLE_IDS = ["ascii-color", "ascii", "photo"] as const;

/** Everything the plugin's settings page reads and writes. */
const preferencesSchema = z.object({
  usageCard: z.boolean(),
  waveSpinner: z.boolean(),
  agentActivity: z.boolean(),
  composerGlow: z.boolean(),
  homeGreeting: z.boolean(),
  livingWallpaper: z.boolean(),
  wallpaper: z.enum(WALLPAPER_IDS),
  customWallpaper: z.string().max(2048),
  wallpaperStyle: z.enum(STYLE_IDS),
});
export type Preferences = z.infer<typeof preferencesSchema>;

const IMAGE_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
};

/** The plugin's assets directory, whether running from server.ts or dist/server.js. */
function assetsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const beside = join(here, "assets");
  return existsSync(beside) ? beside : join(here, "..", "assets");
}

/** A custom wallpaper value that names a local file, as an absolute path; else null. */
function localPath(value: string): string | null {
  const v = value.trim();
  if (v.startsWith("~/")) return resolve(homedir(), v.slice(2));
  return v.startsWith("/") ? resolve(v) : null;
}

async function serveImage(path: string): Promise<Response> {
  const type = IMAGE_TYPES[extname(path).toLowerCase()];
  if (!type) return new Response(`Not an image file: ${path}`, { status: 415 });
  try {
    const info = await stat(path);
    if (!info.isFile()) throw new Error("not a file");
    const body = Readable.toWeb(createReadStream(path)) as ReadableStream;
    return new Response(body, {
      headers: { "content-type": type, "content-length": String(info.size), "cache-control": "no-cache" },
    });
  } catch {
    return new Response(`Wallpaper file not found: ${path}`, { status: 404 });
  }
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
    homeGreeting: {
      type: "boolean",
      label: "Home greeting",
      description: "A greeting with today's token count on the new-thread screen.",
      default: true,
    },
    livingWallpaper: {
      type: "boolean",
      label: "Living wallpaper",
      description: "Let the ASCII wallpaper flicker gently, with a slow scan line.",
      default: true,
    },
    wallpaper: {
      type: "select",
      label: "Home wallpaper",
      description: "Art behind the home screen (the new-thread page, also opened with Cmd+N).",
      options: [...WALLPAPER_IDS],
      experimental_optionLabels: { none: "None", ...BUILT_IN_WALLPAPERS, custom: "Custom image" },
      default: "none",
    },
    customWallpaper: {
      type: "string",
      label: "Custom wallpaper image",
      description: "Used when Home wallpaper is Custom image: an image URL, or a file path such as ~/Pictures/wallpaper.jpg.",
      default: "",
    },
    wallpaperStyle: {
      type: "select",
      label: "Wallpaper style",
      description: "Draw the wallpaper as a colorful ASCII texture, a one-color ASCII texture, or the image itself.",
      options: [...STYLE_IDS],
      experimental_optionLabels: { "ascii-color": "Colorful ASCII", ascii: "ASCII", photo: "Photo" },
      default: "ascii-color",
    },
  });

  // Serves the selected wallpaper: a bundled one, or a custom local file.
  // Custom URLs load directly in the browser and never reach this route.
  bb.http.route("GET", "/wallpaper", async () => {
    const { wallpaper, customWallpaper } = await settings.get();
    if (wallpaper in BUILT_IN_WALLPAPERS) return serveImage(join(assetsDir(), "wallpapers", `${wallpaper}.jpg`));
    const path = wallpaper === "custom" ? localPath(customWallpaper) : null;
    return path ? serveImage(path) : new Response("No wallpaper file is set", { status: 404 });
  });

  // Thumbnails for the settings page's wallpaper picker.
  for (const id of Object.keys(BUILT_IN_WALLPAPERS)) {
    bb.http.route("GET", `/wallpapers/${id}`, () => serveImage(join(assetsDir(), "wallpapers", `${id}.jpg`)));
  }

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
