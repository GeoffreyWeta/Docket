/* Theme selection.

   The whole theme lives in CSS custom properties (see the token blocks at the
   top of styles.js), so switching is one attribute on <html> — no re-render, no
   flash, no second stylesheet. The choice is remembered per browser and applied
   by a tiny inline script in index.html before first paint, so a reload never
   flickers the previous theme.

   `paper` is the default on purpose: the stationery look is the product's
   identity, so a first-time visitor sees it even on a dark-mode machine. */

export const THEMES = [
  { id: "paper", label: "Paper", hint: "The house look — legal stationery, wax seals, serif display" },
  { id: "material", label: "Material", hint: "Material-flavoured: neutral surfaces, pill buttons, dp elevation, light nav" },
  { id: "night", label: "Night", hint: "Dark ledger — brighter status hues, brass accents" },
];

export const THEME_KEY = "docket.theme";
const IDS = THEMES.map((t) => t.id);
export const DEFAULT_THEME = "paper";

export function getTheme() {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return IDS.includes(v) ? v : DEFAULT_THEME;
  } catch (e) {
    return DEFAULT_THEME;
  }
}

export function applyTheme(id) {
  const theme = IDS.includes(id) ? id : DEFAULT_THEME;
  const root = document.documentElement;
  if (theme === DEFAULT_THEME) delete root.dataset.theme;   // :root carries paper
  else root.dataset.theme = theme;
  // keep the tab chrome and the pre-paint background in step with the theme
  const meta = document.querySelector('meta[name="color-scheme"]');
  if (meta) meta.setAttribute("content", theme === "night" ? "dark" : "light");
  return theme;
}

export function setTheme(id) {
  const theme = applyTheme(id);
  try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* private mode */ }
  return theme;
}
