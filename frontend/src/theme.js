/* Theme selection.

   The whole theme lives in CSS custom properties (see the token blocks at the
   top of styles.js), so switching is one attribute on <html>, with no re-render, no
   flash, no second stylesheet. The choice is remembered per browser and applied
   by a tiny inline script in index.html before first paint, so a reload never
   flickers the previous theme.

   `studio` is the default: cool neutrals and an indigo primary, so a first-time
   visitor meets a contemporary surface. `paper`, the stationery look the product
   was drawn in, is one click away and unchanged.

   DEFAULT_THEME and the block on bare :root in styles.js must name the same
   theme, because applyTheme removes the attribute entirely for the default. */

export const THEMES = [
  { id: "studio", label: "Studio", icon: "stamp",
    hint: "The default: cool neutral surfaces, indigo primary, emerald for state" },
  { id: "paper", label: "Paper", icon: "tender",
    hint: "The house look: legal stationery, wax seals, serif display" },
  { id: "material", label: "Material", icon: "dashboard",
    hint: "Material: flat surfaces, pill buttons, sans display at weight 400, tonal nav" },
  { id: "material-dark", label: "Material dark", icon: "dashboard",
    hint: "Material on M3 dark neutrals, with the tonal green inverted" },
  { id: "night", label: "Night", icon: "seal",
    hint: "Dark ledger: the editorial look after hours, brass accents" },
];
export const DARK = new Set(["night", "material-dark"]);

export const THEME_KEY = "docket.theme";
const IDS = THEMES.map((t) => t.id);
export const DEFAULT_THEME = "studio";

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
  if (theme === DEFAULT_THEME) delete root.dataset.theme;   // :root carries studio
  else root.dataset.theme = theme;
  // keep the tab chrome and the pre-paint background in step with the theme
  const meta = document.querySelector('meta[name="color-scheme"]');
  if (meta) meta.setAttribute("content", DARK.has(theme) ? "dark" : "light");
  return theme;
}

export function setTheme(id) {
  const theme = applyTheme(id);
  try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* private mode */ }
  return theme;
}
