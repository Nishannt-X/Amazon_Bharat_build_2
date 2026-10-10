/** Light/dark preference shared by /map and /report. Light is the default;
 * the OS colour scheme is ignored until the user picks a mode. The choice
 * lives in localStorage and is mirrored onto <html data-ff-theme> by an inline
 * script (see THEME_INIT_SCRIPT) before first paint, so there is no flash and
 * no hydration mismatch. */
import { useSyncExternalStore } from "react";

import { THEME_COLORS, THEME_KEY, type Theme } from "./theme-init";

const EVENT = "ff-theme-change";

function read(): Theme {
  return document.documentElement.getAttribute("data-ff-theme") === "dark" ? "dark" : "light";
}

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_KEY && event.key !== null) return;
    apply(event.newValue === "dark" ? "dark" : "light");
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function apply(theme: Theme) {
  const root = document.documentElement;
  root.setAttribute("data-ff-theme", theme);
  root.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[theme]);
  window.dispatchEvent(new Event(EVENT));
}

export function setTheme(theme: Theme) {
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* storage blocked: applies for this page only */ }
  apply(theme);
}

/** "light" on the server and during hydration, then the real value. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, read, () => "light");
}
