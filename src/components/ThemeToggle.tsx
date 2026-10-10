"use client";

import { Moon, Sun } from "lucide-react";
import { setTheme, useTheme } from "../lib/theme";

/** Compact light/dark switch. Both icons are always rendered and CSS picks one
 * from <html data-ff-theme>, so the first paint is right before hydration. */
export default function ThemeToggle() {
  const theme = useTheme();
  const dark = theme === "dark";
  return <button type="button" role="switch" aria-checked={dark} aria-label="Dark mode" title={dark ? "Switch to light mode" : "Switch to dark mode"}
    onClick={() => setTheme(dark ? "light" : "dark")} className="ff-theme-toggle">
    <Sun size={18} aria-hidden="true" className="ff-theme-sun" />
    <Moon size={18} aria-hidden="true" className="ff-theme-moon" />
  </button>;
}
