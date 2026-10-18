// The plugin's page in the bb nav rail: one place to switch each Beautiful bb
// change on or off and to pick the home wallpaper. New features add a row here.
import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { experimental_usePluginId as usePluginId, useRpc, useSdk } from "@get-bb/plugin-sdk/app";
import type { Preferences, rpcContract } from "./server";
import { applyFeatures } from "./features";
import "./settings-page.css";

const THEME_ID = "plugin:beautiful-bb:t3-night";

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

function useThemeSwitch() {
  const sdk = useSdk();
  const [active, setActive] = useState<boolean | null>(null);
  useEffect(() => {
    sdk.theme.get().then((t) => setActive(t.themeId === THEME_ID), () => setActive(false));
  }, [sdk]);
  const set = useCallback(
    (on: boolean) => {
      setActive(on);
      sdk.theme.set(on ? THEME_ID : "default").then(
        (t) => setActive(t.themeId === THEME_ID),
        () => setActive(!on),
      );
    },
    [sdk],
  );
  return [active, set] as const;
}

export function SettingsPage() {
  const rpc = useRpc<typeof rpcContract>();
  const pluginId = usePluginId();
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customDraft, setCustomDraft] = useState("");
  const [themeOn, setThemeOn] = useThemeSwitch();

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
        <h2 id="bbs-look">Look</h2>
        <div className="bbs-list">
          <Row
            title="T3 Night theme"
            detail="T3 Code's palette and system fonts, larger text, and a starry sidebar banner."
            control={<Switch label="T3 Night theme" checked={themeOn === true} onChange={setThemeOn} />}
          />
        </div>
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
            title="Wave spinner"
            detail='A lavender wave spinner instead of the shimmering "Working..." text in a running thread.'
            control={
              <Switch label="Wave spinner" checked={prefs.waveSpinner} onChange={(v) => update({ waveSpinner: v })} />
            }
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
                {w.id !== "none" && w.id !== "custom" && <img src={thumb(w.id)} alt="" loading="lazy" />}
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
