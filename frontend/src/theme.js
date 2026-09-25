/* Theme selection.

   The whole theme lives in CSS custom properties (see the token blocks at the
   top of styles.js), so switching is one attribute on <html>, with no
   re-render, no flash, no second stylesheet. The choice is remembered per
   browser and applied by a tiny inline script in index.html before first
   paint, so a reload never flickers the previous theme.

   TWO THEMES, and they are the same product at two times of day: `light` is
   the house look, a deep green band over white cards; `dark` is that after
   hours. There is no third option and no preference panel, because a product
   that asks which of seven skins you want has asked a question it should have
   answered itself.

   ONE CONSTANT, NOT TWO. `light` is both the theme written on bare :root in
   styles.js AND what a visitor with nothing stored gets, so applyTheme simply
   removes the attribute for it: :root already paints it. That also means a
   first visit can leave <html> bare, and the pre-paint script in index.html
   only has to stamp anything at all when the stored choice is `dark`.

   Adding or renaming a theme means FOUR places, and the pre-paint script is
   the one that is easy to forget: a token block in styles.js, an entry in
   THEMES below, the pre-paint background rule in index.html, and the id check
   in the pre-paint script beside it. That script cannot import this file — it
   runs before the bundle — so it keeps its own copy of the accepted ids, and a
   theme missing from it will not survive a reload. Nothing else reads this
   list. */

export const THEMES = [
  { id: "light", label: "Light", icon: "sun",
    hint: "The house look: a deep green band over white cards" },
  { id: "dark", label: "Dark", icon: "moon",
    hint: "The same, after hours: raised green-black surfaces, brighter accent" },
];
export const DARK = new Set(["dark"]);

export const THEME_KEY = "docket.theme";
const IDS = THEMES.map((t) => t.id);
/** What a visitor with nothing stored gets, and the block on bare :root. */
export const DEFAULT_THEME = "light";
/** Kept as a named export because callers import it; same thing as the
    default now that :root carries the light theme. */
export const ROOT_THEME = DEFAULT_THEME;

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
  if (theme === ROOT_THEME) delete root.dataset.theme;      // :root carries light
  else root.dataset.theme = theme;
  // keep the tab chrome and the pre-paint background in step with the theme
  const meta = document.querySelector('meta[name="color-scheme"]');
  if (meta) meta.setAttribute("content", DARK.has(theme) ? "dark" : "light");
  syncThemeChrome();
  return theme;
}

export function setTheme(id) {
  const theme = applyTheme(id);
  try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* private mode */ }
  return theme;
}

/** The other theme. With two of them, "next" and "the other one" are the
    same thing, which is what lets the switch be a toggle rather than a menu. */
export function otherTheme(id) {
  return id === "dark" ? "light" : "dark";
}

export function syncThemeChrome() {
  const root = document.documentElement;
  const dark = root.dataset.theme === "dark";
  const studio = root.dataset.layout === "studio";
  const tc = document.querySelector('meta[name="theme-color"]');
  if (tc) tc.setAttribute("content", studio ? (dark ? "#161618" : "#f5f5f7") : (dark ? "#0C1511" : "#F2F6F3"));
}
