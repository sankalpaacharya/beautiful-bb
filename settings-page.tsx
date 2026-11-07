// The plugin's page in the bb nav rail: one place to switch each Beautiful bb
// change on or off and to pick the home wallpaper. New features add a row here.
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { experimental_usePluginId as usePluginId, useRpc, useSdk } from "@get-bb/plugin-sdk/app";
import type { Preferences, rpcContract } from "./server";
import { applyFeatures, toggleFocusMode } from "./features";
import { applyFontScale, loadFontSample } from "./typography";
import { FONTS } from "./fonts";
import { applyTheme, themeSelectionId } from "./actions";
import { THEME_PACK } from "./theme-pack";
import { ShaderWallpaper } from "./shader-wallpaper";
import { SHADER_COLORS, SHADER_COLOR_CSS, WALLPAPERS, isArt, isShader, type ShaderColorId, type WallpaperId } from "./wallpapers";
import "./settings-page.css";


/** A wallpaper tile's art, drawn the way the home screen draws it. */
function WallpaperPreview({ id, color, thumb }: { id: WallpaperId; color: ShaderColorId; thumb: (id: string) => string }) {
  if (isShader(id)) {
    return <ShaderWallpaper className="bbs-preview-shader" style={id} color={SHADER_COLOR_CSS[color]} animate={false} scale={0.6} />;
  }
  if (isArt(id)) return <img className="bbs-preview-photo" src={thumb(id)} alt="" loading="lazy" />;
  if (id === "custom") return <span>Image URL or file</span>;
  return null;
}

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

const DEFAULT_FONT_SCALE = 107;

/** Text size slider: resizes live while dragging, saves once the hand settles. */
function TextSize({ value, onSave }: { value: number; onSave: (percent: number) => void }) {
  const [draft, setDraft] = useState(value);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const change = (percent: number) => {
    setDraft(percent);
    applyFontScale(percent);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => onSave(percent), 400);
  };
  return (
    <div className="bbs-textsize">
      <span className="bbs-textsize-sample" aria-hidden="true" style={{ fontSize: `${(draft / 100) * 1.5}rem` }}>
        Aa
      </span>
      <input
        type="range"
        min={85}
        max={140}
        step={1}
        value={draft}
        aria-label="Text size"
        aria-valuetext={`${draft} percent`}
        style={{ ["--fill" as string]: `${((draft - 85) / (140 - 85)) * 100}%` }}
        onChange={(e) => change(Number(e.target.value))}
      />
      <span className="bbs-textsize-value">{draft}%</span>
      <button type="button" disabled={draft === DEFAULT_FONT_SCALE} onClick={() => change(DEFAULT_FONT_SCALE)}>
        Reset
      </button>
    </div>
  );
}

/** Font tiles, each drawn in its own font; web fonts load only the sample's glyphs. */
function FontPicker({ value, onChange }: { value: Preferences["font"]; onChange: (id: Preferences["font"]) => void }) {
  useEffect(() => FONTS.forEach((f) => loadFontSample(f, "Aa")), []);
  return (
    <div className="bbs-fonts" role="radiogroup" aria-label="Font">
      {FONTS.map((f) => (
        <button
          key={f.id}
          type="button"
          role="radio"
          aria-checked={value === f.id}
          className="bbs-font"
          style={f.source.kind === "theme" ? undefined : { fontFamily: f.source.family }}
          onClick={() => onChange(f.id)}
        >
          <span className="bbs-font-sample" aria-hidden="true">
            Aa
          </span>
          <span className="bbs-theme-name">{f.name}</span>
          <span className="bbs-theme-detail">{f.detail}</span>
        </button>
      ))}
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
          {[
            ...THEME_PACK,
            {
              id: "default",
              name: "bb default",
              description: "bb's own palette, no plugin theme",
              accent: "#a1a1aa",
              swatches: ["#0f0f10", "#e4e4e7", "#a1a1aa", "#52525b"],
            },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={activeTheme === t.id}
              className="bbs-theme"
              style={{ ["--swatch" as string]: t.accent }}
              onClick={() => chooseTheme(t.id)}
            >
              <span className="bbs-theme-preview" style={{ background: t.swatches[0] }} aria-hidden="true">
                {t.swatches.slice(1).map((color) => (
                  <span key={color} style={{ background: color }} />
                ))}
              </span>
              <span className="bbs-theme-name">{t.name}</span>
              <span className="bbs-theme-detail">{t.description}</span>
            </button>
          ))}
        </div>
        <p className="bbs-section-detail">Popular editor themes in their official colors, with matching code colors. Each also switches the home wallpaper to the one it pairs with, when one of the bundled pieces is on.</p>
      </section>

      <section className="bbs-section" aria-labelledby="bbs-font">
        <h2 id="bbs-font">Font</h2>
        <FontPicker value={prefs.font} onChange={(font) => update({ font })} />
        <p className="bbs-section-detail">The font for bb's interface text, in every theme. Code and the terminal keep their monospace font. Web fonts load from Google Fonts.</p>
      </section>

      <section className="bbs-section" aria-labelledby="bbs-textsize">
        <h2 id="bbs-textsize">Text size</h2>
        <div className="bbs-list">
          <TextSize value={prefs.fontScale} onSave={(fontScale) => update({ fontScale })} />
        </div>
        <p className="bbs-section-detail">Resizes text across bb, in every theme. Spacing and layout stay the same.</p>
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
        <h2 id="bbs-wallpaper">Home wallpaper</h2>
        <p className="bbs-section-detail">Shown behind the new-thread screen, which Cmd+N opens.</p>
        <div className="bbs-list bbs-list-tight">
          <Row
            title="Home greeting"
            detail="A hello with today's token count and the thread that finished last."
            control={<Switch label="Home greeting" checked={prefs.homeGreeting} onChange={(v) => update({ homeGreeting: v })} />}
          />
          {isShader(prefs.wallpaper) && (
            <>
              <Row
                title="Color"
                detail="Theme accent and Neutral follow the active theme."
                control={
                  <div className="bbs-swatches" role="radiogroup" aria-label="Wallpaper color">
                    {SHADER_COLORS.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        role="radio"
                        aria-checked={prefs.shaderColor === c.id}
                        aria-label={c.label}
                        title={c.label}
                        style={{ color: c.css }}
                        onClick={() => update({ shaderColor: c.id })}
                      />
                    ))}
                  </div>
                }
              />
              <Row
                title="Animate"
                detail="The pattern drifts slowly. Reduced motion keeps it still either way."
                control={<Switch label="Animate" checked={prefs.animateShader} onChange={(v) => update({ animateShader: v })} />}
              />
            </>
          )}
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
                <WallpaperPreview id={w.id} color={prefs.shaderColor} thumb={thumb} />
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
