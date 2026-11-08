// bb's own System / Light / Dark appearance (Settings → Appearance). bb keeps
// it in localStorage under `bb.theme` and applies a change when a storage
// event names that key. A write from this window fires no storage event, so
// setColorMode dispatches one for bb to pick up.

export const COLOR_MODES = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
] as const;

export type ColorMode = (typeof COLOR_MODES)[number]["id"];

const KEY = "bb.theme";

export function readColorMode(): ColorMode {
  const stored = localStorage.getItem(KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

export function setColorMode(mode: ColorMode) {
  localStorage.setItem(KEY, mode);
  window.dispatchEvent(new StorageEvent("storage", { key: KEY, newValue: mode, storageArea: localStorage }));
}

/** Calls back when bb's appearance setting changes, from this window or another. */
export function subscribeColorMode(onChange: () => void) {
  const listener = (e: StorageEvent) => {
    if (e.key === KEY) onChange();
  };
  window.addEventListener("storage", listener);
  return () => window.removeEventListener("storage", listener);
}

/** Switches to whichever of light and dark bb isn't showing, System included. */
export function toggleColorMode() {
  setColorMode(document.documentElement.classList.contains("dark") ? "light" : "dark");
}
