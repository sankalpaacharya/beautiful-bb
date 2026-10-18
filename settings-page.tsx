// The plugin's page in the bb nav rail: one place to switch each Beautiful bb
// change on or off and to pick the home wallpaper. New features add a row here.
import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { experimental_usePluginId as usePluginId, useRpc, useSdk } from "@get-bb/plugin-sdk/app";
import type { Preferences, rpcContract } from "./server";
import { applyFeatures, toggleFocusMode } from "./features";
import { applyTheme, themeSelectionId } from "./actions";
import { THEME_PACK } from "./theme-pack";
import { AsciiArt } from "./wallpaper";
import "./settings-page.css";


const WALLPAPERS: { id: Preferences["wallpaper"]; label: string }[] = [
  { id: "none", label: "None" },
  { id: "headphones", label: "Headphones girl" },
  { id: "coder", label: "Late-night coder" },
  { id: "capybara", label: "Astronaut capybara" },
  { id: "kitsune", label: "Sleeping kitsune" },
  { id: "samurai", label: "Samurai" },
  { id: "robot", label: "Robot buddy" },
  { id: "custom", label: "Your image" },
];

/** Tiles are about a sixth of the home pane's width, so glyphs shrink to match. */
const TILE_CELL = { w: 2, h: 3.6 };

/** A tile drawn the way the home screen would draw this wallpaper. */
function Preview({ src, style }: { src: string; style: Preferences["wallpaperStyle"] }) {
  if (style === "photo") return <img className="bbs-preview-photo" src={src} alt="" loading="lazy" />;
  return <AsciiArt key={`${src}:${style}`} src={src} colorful={style === "ascii-color"} cell={TILE_CELL} className="bbs-preview-ascii" />;
}

const STYLES: { id: Preferences["wallpaperStyle"]; label: string }[] = [
  { id: "ascii-color", label: "Colorful ASCII" },
  { id: "ascii", label: "ASCII" },
  { id: "photo", label: "Photo" },
];

function Switch({ checked, label, onChange }: { checked: boolean; label: string; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="bbs-switch"
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}

function Row({ title, detail, control }: { title: string; detail: string; control: ReactNode }) {
  return (
    <div className="bbs-row">
      <div className="bbs-row-text">
        <p className="bbs-row-title">{title}</p>
        <p className="bbs-row-detail">{detail}</p>
      </div>
      {control}
    </div>
  );
}

/** The active pack theme id, or "default" when bb's own palette (or another theme) is on. */
function useActiveTheme() {
  const sdk = useSdk();
  const [active, setActive] = useState<string | null>(null);
  const read = useCallback(() => {
    sdk.theme.get().then(
      (t) => setActive(THEME_PACK.find((p) => themeSelectionId(p.id) === t.themeId)?.id ?? "default"),
      () => setActive("default"),
    );
  }, [sdk]);
  useEffect(read, [read]);
  const choose = useCallback(
    (id: string) => {
      setActive(id);
      const done = id === "default" ? sdk.theme.set("default") : applyTheme(sdk, id);
      Promise.resolve(done).then(read, read);
    },
    [sdk, read],
  );
  return [active, choose] as const;
}

export function SettingsPage() {
  const rpc = useRpc<typeof rpcContract>();
  const pluginId = usePluginId();
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customDraft, setCustomDraft] = useState("");
  const [activeTheme, chooseTheme] = useActiveTheme();
  const [focusOn, setFocusOn] = useState(() => document.documentElement.hasAttribute("data-bbb-focus"));

  useEffect(() => {
    rpc.call("settings_get", null).then(
      (p) => {
        setPrefs(p);
        setCustomDraft(p.customWallpaper);
      },
      (e) => setError(e instanceof Error ? e.message : String(e)),
    );
  }, [rpc]);

  const update = useCallback(
    (changes: Partial<Preferences>) => {
      setPrefs((current) => {
        if (!current) return current;
        const next = { ...current, ...changes };
        applyFeatures(next);
        return next;
      });
      rpc.call("settings_set", changes).then(
        (saved) => {
          setPrefs(saved);
          applyFeatures(saved);
          setError(null);
        },
        (e) => setError(`Could not save: ${e instanceof Error ? e.message : String(e)}`),
      );
    },
    [rpc],
  );

  if (!prefs) {
    return <div className="bbs-page">{error && <p className="bbs-error">{error}</p>}</div>;
  }

  const thumb = (id: string) => `/api/v1/plugins/${encodeURIComponent(pluginId)}/http/wallpapers/${id}`;

  return (
    <div className="bbs-page">
      <header className="bbs-header">
        <h1>Beautiful bb</h1>
        <p>Pick the changes you want. Everything here applies right away.</p>
      </header>

      {error && <p className="bbs-error">{error}</p>}

      <section className="bbs-section" aria-labelledby="bbs-look">
        <h2 id="bbs-look">Theme</h2>
        <div className="bbs-themes" role="radiogroup" aria-label="Theme">
          {[...THEME_PACK, { id: "default", name: "bb default", description: "bb's own palette, no plugin theme", accent: "var(--muted-foreground)" }].map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={activeTheme === t.id}
              className="bbs-theme"
              style={{ ["--swatch" as string]: t.accent }}
              onClick={() => chooseTheme(t.id)}
            >
              <span className="bbs-theme-swatch" aria-hidden="true" />
              <span className="bbs-theme-name">{t.name}</span>
              <span className="bbs-theme-detail">{t.description}</span>
            </button>
          ))}
        </div>
        <p className="bbs-section-detail">Pack themes also switch the home wallpaper to the one they pair with, when a built-in wallpaper is on.</p>
      </section>

      <section className="bbs-section" aria-labelledby="bbs-sidebar">
        <h2 id="bbs-sidebar">Sidebar and threads</h2>
        <div className="bbs-list">
          <Row
            title="Usage card"
            detail="Weekly limit, time to reset, and 7-day token use for Claude and Codex, above the sidebar footer."
            control={<Switch label="Usage card" checked={prefs.usageCard} onChange={(v) => update({ usageCard: v })} />}
          />
          <Row
            title="Agent activity"
            detail="A tiny wave on working threads in the sidebar, and a burst of sparkles when one finishes."
            control={
              <Switch label="Agent activity" checked={prefs.agentActivity} onChange={(v) => update({ agentActivity: v })} />
            }
          />
          <Row
            title="Wave spinner"
            detail='A wave spinner instead of the shimmering "Working..." text in a running thread.'
            control={
              <Switch label="Wave spinner" checked={prefs.waveSpinner} onChange={(v) => update({ waveSpinner: v })} />
            }
          />
          <Row
            title="Composer accent"
            detail="A thin accent border on the message box while you type."
            control={
              <Switch label="Composer accent" checked={prefs.composerGlow} onChange={(v) => update({ composerGlow: v })} />
            }
          />
          <Row
            title="Focus mode"
            detail="Hides the sidebar and dims the header and composer extras. Shortcut: ⌘⇧F, or Beautiful bb: Toggle focus mode in the command menu."
            control={<Switch label="Focus mode" checked={focusOn} onChange={(v) => setFocusOn(toggleFocusMode(v))} />}
          />
        </div>
      </section>

      <section className="bbs-section" aria-labelledby="bbs-wallpaper">
        <div className="bbs-section-head">
          <h2 id="bbs-wallpaper">Home wallpaper</h2>
          <div className="bbs-segmented" role="radiogroup" aria-label="Wallpaper style">
            {STYLES.map((s) => (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={prefs.wallpaperStyle === s.id}
                disabled={prefs.wallpaper === "none"}
                onClick={() => update({ wallpaperStyle: s.id })}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <p className="bbs-section-detail">Shown behind the new-thread screen, which Cmd+N opens.</p>
        <div className="bbs-list bbs-list-tight">
          <Row
            title="Home greeting"
            detail="A hello with today's token count and the thread that finished last."
            control={<Switch label="Home greeting" checked={prefs.homeGreeting} onChange={(v) => update({ homeGreeting: v })} />}
          />
          <Row
            title="Living wallpaper"
            detail="The ASCII art flickers gently, with a slow scan line."
            control={
              <Switch label="Living wallpaper" checked={prefs.livingWallpaper} onChange={(v) => update({ livingWallpaper: v })} />
            }
          />
        </div>
        <div className="bbs-grid" role="radiogroup" aria-label="Home wallpaper">
          {WALLPAPERS.map((w) => (
            <button
              key={w.id}
              type="button"
              role="radio"
              aria-checked={prefs.wallpaper === w.id}
              className="bbs-tile"
              onClick={() => update({ wallpaper: w.id })}
            >
              <span className="bbs-tile-art" data-kind={w.id === "none" || w.id === "custom" ? w.id : undefined}>
                {w.id !== "none" && w.id !== "custom" && <Preview src={thumb(w.id)} style={prefs.wallpaperStyle} />}
                {w.id === "custom" && <span>Image URL or file</span>}
              </span>
              <span className="bbs-tile-label">{w.label}</span>
            </button>
          ))}
        </div>
        {prefs.wallpaper === "custom" && (
          <form
            className="bbs-custom"
            onSubmit={(e) => {
              e.preventDefault();
              update({ customWallpaper: customDraft.trim() });
            }}
          >
            <input
              value={customDraft}
              onChange={(e) => setCustomDraft(e.target.value)}
              placeholder="~/Pictures/wallpaper.jpg or https://…"
              aria-label="Custom wallpaper image"
            />
            <button type="submit" disabled={customDraft.trim() === prefs.customWallpaper}>
              Use image
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
