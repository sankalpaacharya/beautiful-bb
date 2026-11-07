// Font picker for the settings page: a searchable dropdown of the theme's own
// font, bb's bundled Inter, and every Google Fonts family, most popular first.
// Each row is drawn in its own font, loading only the glyphs of its name.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "./server";
import { fontLabel, fontStack, googleFont, parseFont, type CatalogFont, type FontValue } from "./fonts";
import { loadFontSample } from "./typography";

/** Rows rendered at once; typing narrows the rest. */
const VISIBLE = 60;

type Option = { value: FontValue; label: string; detail: string };

const FIXED: Option[] = [
  { value: "theme", label: "Theme default", detail: "From the theme" },
  { value: "inter", label: "Inter", detail: "Bundled" },
];

function useCatalog() {
  const rpc = useRpc<typeof rpcContract>();
  const [state, setState] = useState<{ fonts: CatalogFont[] } | { error: string } | null>(null);
  useEffect(() => {
    rpc.call("font_catalog", null).then(
      ({ fonts }) => setState({ fonts }),
      (e) => setState({ error: e instanceof Error ? e.message : String(e) }),
    );
  }, [rpc]);
  return state;
}

function FontName({ value, label }: { value: FontValue; label: string }) {
  const choice = parseFont(value);
  useEffect(() => {
    if (choice.kind === "google") loadFontSample(choice.family, label);
  }, [choice.kind === "google" ? choice.family : value, label]);
  const stack = fontStack(choice);
  return <span style={stack ? { fontFamily: stack } : undefined}>{label}</span>;
}

export function FontSelect({ value, onChange }: { value: FontValue; onChange: (value: FontValue) => void }) {
  const catalog = useCatalog();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const listId = useId();

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const fixed = FIXED.filter((o) => !q || o.label.toLowerCase().includes(q));
    const fonts = catalog && "fonts" in catalog ? catalog.fonts : [];
    // The catalog is popularity-ordered; a stable sort keeps that within each rank.
    const rank = (family: string) => (family === q ? 0 : family.startsWith(q) ? 1 : 2);
    const google = fonts
      .filter((f) => f.family !== "Inter" && (!q || f.family.toLowerCase().includes(q)))
      .sort((a, b) => (q ? rank(a.family.toLowerCase()) - rank(b.family.toLowerCase()) : 0))
      .map((f): Option => ({ value: googleFont(f.family), label: f.family, detail: f.category }));
    return [...fixed, ...google];
  }, [catalog, query]);
  const shown = matches.slice(0, VISIBLE);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    if (!open) return;
    input.current?.focus({ preventScroll: true });
    // The settings page scrolls; bring the whole list into view, not just the trigger.
    popover.current?.scrollIntoView({ block: "nearest" });
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = (option: Option) => {
    onChange(option.value);
    setOpen(false);
    setQuery("");
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") setActive((i) => Math.min(i + 1, shown.length - 1));
    else if (e.key === "ArrowUp") setActive((i) => Math.max(i - 1, 0));
    else if (e.key === "Enter" && shown[active]) choose(shown[active]!);
    else if (e.key === "Escape") setOpen(false);
    else return;
    e.preventDefault();
  };

  const current = parseFont(value);
  return (
    <div className="bbs-fontselect" ref={root}>
      <button type="button" className="bbs-fontselect-trigger" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <FontName value={value} label={fontLabel(current)} />
        <span className="bbs-fontselect-chevron" aria-hidden="true" />
      </button>
      {open && (
        <div className="bbs-fontselect-popover" ref={popover}>
          <input
            ref={input}
            className="bbs-fontselect-search"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={shown[active] ? `${listId}-${active}` : undefined}
            aria-label="Search fonts"
            placeholder="Search fonts"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
          {shown.length > 0 ? (
            <ul className="bbs-fontselect-list" role="listbox" id={listId} ref={list} aria-label="Fonts">
              {shown.map((option, i) => (
                <li
                  key={option.value}
                  id={`${listId}-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={option.value === value}
                  data-active={i === active || undefined}
                  onPointerEnter={() => setActive(i)}
                  onClick={() => choose(option)}
                >
                  <FontName value={option.value} label={option.label} />
                  <span className="bbs-fontselect-detail">{option.detail}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="bbs-fontselect-empty" id={listId}>
              {catalog === null ? "Loading Google Fonts…" : `No fonts match “${query.trim()}”.`}
            </p>
          )}
          {catalog === null && shown.length > 0 && <p className="bbs-fontselect-footer">Loading Google Fonts…</p>}
          {catalog && "error" in catalog && <p className="bbs-fontselect-footer">Couldn't load Google Fonts: {catalog.error}</p>}
          {catalog && "fonts" in catalog && matches.length > VISIBLE && (
            <p className="bbs-fontselect-footer">{matches.length - VISIBLE} more. Keep typing to narrow.</p>
          )}
        </div>
      )}
    </div>
  );
}
