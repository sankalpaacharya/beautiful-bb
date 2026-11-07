// The plugin's page in the bb nav rail: one place to switch each Beautiful bb
// change on or off and to pick the home wallpaper. New features add a row here.
import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useRpc, useSdk } from "@get-bb/plugin-sdk/app";
import type { Preferences, rpcContract } from "./server";
import { applyFeatures, toggleFocusMode } from "./features";
import { applyFontScale } from "./typography";
import { FontSelect } from "./font-select";
import { applyTheme, themeSelectionId } from "./actions";
import { THEME_PACK } from "./theme-pack";
import { ShaderWallpaper } from "./shader-wallpaper";
import { SHADER_COLORS, SHADER_COLOR_CSS, WALLPAPERS, type ShaderColorId, type WallpaperId } from "./wallpapers";
import "./settings-page.css";

const THEMES = [
  ...THEME_PACK,
  {
    id: "default",
    name: "bb default",
    description: "bb's own palette, no plugin theme",
    accent: "#a1a1aa",
    swatches: ["#0f0f10", "#e4e4e7", "#a1a1aa", "#52525b"],
  },
];

type ThemeOption = (typeof THEMES)[number];

function Check() {
  return (
    <svg className="bbs-check" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A thumbnail of bb in the theme's colors: sidebar, a few lines of text and code, and the composer. */
function ThemePreview({ theme }: { theme: ThemeOption }) {
  const [background, , code1, code2] = theme.swatches;
  const vars = { "--t-bg": background, "--t-accent": theme.accent, "--t-code1": code1, "--t-code2": code2 } as CSSProperties;
  return (
    <span className="bbs-art bbs-theme-art" style={vars} aria-hidden="true">
      <span className="bbs-mock-side">
        <i />
        <i data-on />
        <i />
      </span>
      <span className="bbs-mock-pane">
        <i />
        <i data-short />
        <span className="bbs-mock-code">
          <i />
          <i />
        </span>
        <span className="bbs-mock-composer">
          <i />
        </span>
      </span>
    </span>
  );
}

/** A wallpaper tile's art, drawn the way the home screen draws it. */
function WallpaperPreview({ id, color }: { id: WallpaperId; color: ShaderColorId }) {
  if (id === "none") return null;
  return <ShaderWallpaper className="bbs-preview-shader" style={id} color={SHADER_COLOR_CSS[color]} animate={false} scale={0.6} />;
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

/** One setting: its name and a line of detail, the control at the right edge, and optional full-width content below. */
function Row({ title, detail, control, children }: { title: string; detail: string; control?: ReactNode; children?: ReactNode }) {
  return (
    <div className="bbs-row">
      <div className="bbs-row-head">
        <div className="bbs-row-text">
          <p className="bbs-row-title">{title}</p>
          <p className="bbs-row-detail">{detail}</p>
        </div>
        {control && <div className="bbs-row-control">{control}</div>}
      </div>
      {children}
    </div>
  );
}

function Group({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="bbs-group" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      <div className="bbs-card">{children}</div>
    </section>
  );
}

const DEFAULT_FONT_SCALE = 100;

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
      <button type="button" className="bbs-button" disabled={draft === DEFAULT_FONT_SCALE} onClick={() => change(DEFAULT_FONT_SCALE)}>
        Reset
      </button>
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
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTheme, chooseTheme] = useActiveTheme();
  const [focusOn, setFocusOn] = useState(() => document.documentElement.hasAttribute("data-bbb-focus"));

  useEffect(() => {
    rpc.call("settings_get", null).then(setPrefs, (e) => setError(e instanceof Error ? e.message : String(e)));
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
        (e) => setError(`Couldn't save: ${e instanceof Error ? e.message : String(e)}`),
      );
    },
    [rpc],
  );

  if (!prefs) {
    return <div className="bbs-page">{error && <p className="bbs-error">Couldn't load settings: {error}</p>}</div>;
  }

  return (
    <div className="bbs-page">
      {error && (
        <p className="bbs-error" role="alert">
          {error}
        </p>
      )}

      <Group id="bbs-appearance" title="Appearance">
        <Row title="Theme" detail="Editor themes in their official colors, with matching code colors.">
          <div className="bbs-picker" role="radiogroup" aria-label="Theme">
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={activeTheme === t.id}
                className="bbs-option"
                title={t.description}
                onClick={() => chooseTheme(t.id)}
              >
                <ThemePreview theme={t} />
                <span className="bbs-option-label">{t.name}</span>
                <Check />
              </button>
            ))}
          </div>
        </Row>
        <Row
          title="Font"
          detail="Interface text, from Google Fonts. Code and the terminal stay monospace."
          control={<FontSelect value={prefs.font} onChange={(font) => update({ font })} />}
        />
        <Row
          title="Text size"
          detail="Resizes text across bb. Spacing and layout stay the same."
          control={<TextSize value={prefs.fontScale} onSave={(fontScale) => update({ fontScale })} />}
        />
      </Group>

      <Group id="bbs-home" title="Home screen">
        <Row title="Wallpaper" detail="Behind the new-thread screen.">
          <div className="bbs-picker" id="bbs-wallpaper" role="radiogroup" aria-label="Home wallpaper">
            {WALLPAPERS.map((w) => (
              <button
                key={w.id}
                type="button"
                role="radio"
                aria-checked={prefs.wallpaper === w.id}
                className="bbs-option bbs-tile"
                onClick={() => update({ wallpaper: w.id })}
              >
                <span className="bbs-art bbs-tile-art" data-kind={w.id === "none" ? w.id : undefined}>
                  <WallpaperPreview id={w.id} color={prefs.shaderColor} />
                </span>
                <span className="bbs-option-label">{w.label}</span>
                <Check />
              </button>
            ))}
          </div>
        </Row>
        {prefs.wallpaper !== "none" && (
          <>
            <Row
              title="Color"
              detail="For the wallpaper and the rail. Theme accent and Neutral follow the theme."
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
              detail="The pattern drifts slowly. Reduced motion keeps it still."
              control={<Switch label="Animate" checked={prefs.animateShader} onChange={(v) => update({ animateShader: v })} />}
            />
            <Row
              title="Rail pattern"
              detail="The same pattern, rising from the bottom of the navigation rail."
              control={<Switch label="Rail pattern" checked={prefs.railPattern} onChange={(v) => update({ railPattern: v })} />}
            />
          </>
        )}
        <Row
          title="Greeting"
          detail="A hello with today's token count and the thread that finished last."
          control={<Switch label="Home greeting" checked={prefs.homeGreeting} onChange={(v) => update({ homeGreeting: v })} />}
        />
      </Group>

      <Group id="bbs-sidebar" title="Sidebar and threads">
        <Row
          title="Usage card"
          detail="Weekly limit, reset time, and 7-day token use for Claude and Codex, above the sidebar footer."
          control={<Switch label="Usage card" checked={prefs.usageCard} onChange={(v) => update({ usageCard: v })} />}
        />
        <Row
          title="Agent activity"
          detail="A small wave on working threads, and sparkles when one finishes."
          control={<Switch label="Agent activity" checked={prefs.agentActivity} onChange={(v) => update({ agentActivity: v })} />}
        />
        <Row
          title="Wave spinner"
          detail="A wave instead of the shimmering “Working…” text in a running thread."
          control={<Switch label="Wave spinner" checked={prefs.waveSpinner} onChange={(v) => update({ waveSpinner: v })} />}
        />
        <Row
          title="Composer accent"
          detail="A thin accent border on the message box while you type."
          control={<Switch label="Composer accent" checked={prefs.composerGlow} onChange={(v) => update({ composerGlow: v })} />}
        />
        <Row
          title="Focus mode"
          detail="Hides the sidebar and dims header and composer extras. Toggle with ⌘⇧F."
          control={<Switch label="Focus mode" checked={focusOn} onChange={(v) => setFocusOn(toggleFocusMode(v))} />}
        />
      </Group>
    </div>
  );
}
