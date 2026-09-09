/* Theme selection.

   The whole theme lives in CSS custom properties (see the token blocks at the
   top of styles.js), so switching is one attribute on <html>, with no re-render, no
   flash, no second stylesheet. The choice is remembered per browser and applied
   by a tiny inline script in index.html before first paint, so a reload never
   flickers the previous theme.

   `circle` is the default: a white console floating on a slate canvas, with a
   navy primary and a peach accent. `paper`, the stationery look the product was
   drawn in, is one click away and unchanged.

   TWO CONSTANTS, NOT ONE, and they no longer name the same theme:

     ROOT_THEME     the theme written on bare :root in styles.js. It is also the
                    fallback every other block inherits from, so it carries the
                    STRUCTURE (radii, type roles, easing) as well as its own
                    palette. That is still studio, and moving it would silently
                    restyle night and material, which declare no structure of
                    their own. applyTheme removes the attribute only for this
                    one, because only this one is already painted by :root.
     DEFAULT_THEME  what a visitor with nothing stored gets. Now circle, which
                    is a full attribute block like the other four.

   Because those differ, a first visit has to STAMP the default rather than
   leave <html> bare. Two places do that and both must agree with DEFAULT_THEME:
   getTheme below, and the pre-paint script in index.html. */

export const THEMES = [
  { id: "circle", label: "Circle", icon: "seal",
    hint: "The default: a white console on a slate canvas, navy primary, pill controls" },
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
  { id: "engo", label: "Eat N Go", icon: "trophy",
    hint: "House green, in sections: a deep green band over white cards on a light page" },
];
export const DARK = new Set(["night", "material-dark"]);

export const THEME_KEY = "docket.theme";
const IDS = THEMES.map((t) => t.id);
/** What a visitor with nothing stored gets. */
export const DEFAULT_THEME = "circle";
/** The theme written on bare :root in styles.js, and the fallback for every
    token another theme does not declare. See the note at the top of the file. */
export const ROOT_THEME = "studio";

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
  if (theme === ROOT_THEME) delete root.dataset.theme;      // :root carries studio
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
