/** Server-safe theme constants and the pre-hydration script (no React imports). */
export type Theme = "light" | "dark";

export const THEME_KEY = "ff-theme";
export const THEME_COLORS: Record<Theme, string> = { light: "#f7f5ef", dark: "#16191f" };
/** Runs synchronously in <head>. Anything but a stored "dark" is light. */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}")==="dark"?"dark":"light";var d=document.documentElement;d.setAttribute("data-ff-theme",t);d.style.colorScheme=t;var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",t==="dark"?"${THEME_COLORS.dark}":"${THEME_COLORS.light}")}catch(e){document.documentElement.setAttribute("data-ff-theme","light")}})()`;

