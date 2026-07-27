/* One source of truth for the layout breakpoints.

   The stylesheet is mobile-first: every rule outside a media query describes a
   phone, and these four widths are the only places the layout is allowed to
   change its mind. styles.js interpolates them into its `min-width` queries and
   ui.jsx builds its matchMedia queries from the same numbers, so the CSS shell
   and the JS that decides which chrome to render can never drift apart.

   sm    large phone / small tablet: dialogs stop being bottom sheets
   tab   tablet: tables become tables again, page heads become one row
   desk  desktop: the two-pane app shell: static sidebar, scrolling content
   wide  roomy desktop: four-up stat rows */
export const BP = { sm: 600, tab: 900, desk: 1024, wide: 1280 };

export const up = (px) => `(min-width:${px}px)`;

/** The width at which the navigation drawer becomes a permanent sidebar. */
export const DESKTOP_Q = up(BP.desk);
