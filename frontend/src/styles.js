/* DOCKET design system.
   Typefaces are self-hosted and bundled by Vite (imported in main.jsx):
   Geist for the interface, Source Serif 4 for display, Geist Mono for
   references, timestamps and money. No webfont CDN, no layout shift.

   MOBILE FIRST, literally: every rule outside a media query describes a
   360px-wide touch screen, and the only media queries in this file are
   `min-width`: a wider viewport may add, never repair. The four widths that
   are allowed to change the layout live in breakpoints.js and are shared with
   ui.jsx, so the CSS shell and the JS that picks the chrome cannot drift.
   The escalation ladder sits at the bottom of CSS, in one place. */

import { BP } from "./breakpoints";

export const CSS = `
/* ============================================================ tokens
   TWO THEMES. Light on :root, dark behind one attribute, and nothing else.

     light   the house look: a deep green band over white cards on a barely
             tinted page. Written on bare :root, so it is also the fallback
             for anything dark does not declare.
     dark    the same product after hours: the band darkens, the cards become
             raised green-black surfaces, and the accent brightens so it stays
             the only saturated thing on the screen.

   THE LIGHT THEME OWNS :root. theme.js removes the data-theme attribute for
   it, so the block on bare :root and DEFAULT_THEME must name the same thing.
   Dark is an attribute block, which beats :root on specificity no matter what
   order they appear in.

   :root also carries the STRUCTURE (radii, type roles, easing, layout
   metrics), which dark inherits wholesale. Changing a structural token here
   changes both themes.

   THE BRAND COLOUR LIVES IN ONE PLACE. --engo below is the only hex that
   encodes it; everything else derives. Change that line and the theme follows.

   Two greens, because one cannot do both jobs on white:

     --engo      #00A651  3.19:1 on white. A FILL and a MARK, never body text.
     --engo-ink  #00803E  5.05:1 on white, and 5.05:1 the other way for a white
                          label on a green button. This is the one that carries
                          text.

   Getting that backwards is the single most likely way to break the theme:
   brand green as a text colour on white is unreadable and passes no check.

   Contrast and CVD separation are measured, not eyeballed: see the note in
   ui.jsx before touching a status hue, then run node tools/palette-check.mjs.
   It reads these blocks, resolves the var() chains the way the cascade does,
   and reports every text-on-surface pair below WCAG AA plus the closest
   status-stamp pair under protanopia and deuteranopia.

   Two families, deliberately separate: --brand is the primary (buttons, focus
   rings, links) and --green is positive state (sealed, leading, published).
   Here they are the same green, because the house colour is a green and a
   second accent would fight it.
   ============================================================ */
:root{
  color-scheme:light;

  /* typefaces (structure: shared with dark) */
  --font-sans:'Geist Variable',ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;
  --font-serif:'Source Serif 4 Variable',ui-serif,Charter,Georgia,serif;
  --font-mono:'Geist Mono Variable',ui-monospace,SFMono-Regular,Menlo,monospace;
  /* The display face is the SANS. Source Serif set the page titles and the
     headline figures, and a serif title over a dashboard reads as stationery
     sitting on top of software. The serif is still loaded and still available
     as --font-serif for anything that genuinely wants it. */
  --font-display:var(--font-sans);

  /* ---- the brand, in one place ---- */
  --engo:#00A651;
  --engo-ink:#00803E;      /* the readable-on-white step */
  --engo-deep:#046B36;
  /* The one dark field in the interface: the navigation rail. White on it
     measures 12.3:1. Named here because it is a brand colour, used once. */
  --engo-band:#0B3D24;

  --paper:#F2F6F3; --paper-2:#E8EFEA; --card:#FFFFFF; --sunk:#F5F9F6;
  --ink:#0E1A15; --muted:#47564E; --faint:#63746B;
  --line:#DCE6DF; --line2:#C6D4CB; --hair:rgba(14,26,21,.07);
  --on-brand:#FFFFFF;
  --btn-hover:#F5F9F6;
  --topbar-bg:rgba(242,246,243,.88);
  --scrim:rgba(11,29,21,.42);
  --skel-hi:#EDF3EF;
  --tip-bg:#0E1A15; --tip-ink:#FFFFFF;

  /* ---- categorical series slots (charts) ----
     Eight hues in a fixed order, assigned by identity and never by rank. The
     order is the colour-blindness safety mechanism, not a preference: this set
     clears the adjacent-pair separation gate under protanopia and deuteranopia
     in both light and dark, and re-ordering it silently breaks that.

     Cards here are pure white, which is the surface this palette was validated
     against. Three slots (aqua, yellow, magenta) sit just under 3:1 there.
     That is permitted only where the values are legible by some other route,
     which is why every Figure in charts.jsx carries a table view and why direct
     labels ride the marks. Do not use these as text colours. */
  --s1:#2a78d6; --s2:#eb6834; --s3:#1baf7a; --s4:#eda100;
  --s5:#e87ba4; --s6:#008300; --s7:#4a3aa7; --s8:#e34948;

  /* primary */
  --brand:var(--engo-ink); --brand-2:var(--engo); --brand-deep:#04562B;
  --brand-tint:#E6F6ED; --brand-ring:rgba(0,166,81,.26);

  /* positive state: the same family, because the house colour is a green */
  --green:var(--engo-ink); --green-2:var(--engo); --green-deep:#04562B;
  --green-tint:#E6F6ED; --green-ring:rgba(0,166,81,.24);

  /* critical, and the seal */
  --wax:#C02A1E; --wax-tint:#FDECEA;
  /* awarded */
  --brass:#A8620B; --brass-tint:#FEF6E7; --gold-ink:#8A4F08;

  /* filled buttons: the deep step, so a white label clears 5:1 */
  --pri-from:#00A651; --pri-to:#00803E; --pri-from-h:#12B860; --pri-to-h:#008F46;
  --pri-line:#04562B; --pri-glow:rgba(0,128,62,.42);
  --wax-from:#D0392B; --wax-to:#B3241A; --wax-from-h:#DC4536; --wax-to-h:#C22C20;
  --wax-line:#8E1A12;

  /* chips + stamps */
  --chip-ok-line:#A5E3C2; --chip-warn-line:#F5C2BC; --chip-gold-line:#F3DCA6;

  /* paper objects: letters, memos, ceremonies, addenda */
  --letter-bg:#F7FBF8; --ceremony-from:#FDECEA; --ceremony-line:#EFA79D;
  --addm-line:#F3DCA6; --unread-bg:#E6F6ED; --login-glow:#FFFFFF;

  /* seal */
  --seal-hi:#7DE8AE; --seal-core:#00A651; --seal-crack:#04452A;

  /* sidebar: the other half of the section idea, a deep green rail against
     the light page, the same field the band uses */
  --side:var(--engo-band); --side-from:#0E4A2C; --side-to:#08301C;
  /* --side-sec is a 9.5px uppercase label, so it is small text as far as WCAG
     is concerned and has to clear 4.5 rather than 3.0. Hierarchy against
     --side-dim comes from the type role, not from dimming it below legible. */
  --side-ink:#EAF6EF; --side-dim:#9FC4AF; --side-sec:#7FAB92;
  --side-hover:rgba(255,255,255,.08);
  --side-on-bg:linear-gradient(90deg,rgba(255,255,255,.16),rgba(255,255,255,.03) 72%);
  --side-on-ink:#FFFFFF; --side-on-line:#2BD97F;
  --side-edge:inset -1px 0 0 rgba(0,0,0,.18);
  --newbtn-bg:rgba(255,255,255,.12); --newbtn-line:rgba(234,246,239,.28);
  --newbtn-bg-h:rgba(255,255,255,.2); --newbtn-line-h:rgba(234,246,239,.44);
  /* The wordmark is set, not drawn, so its face is a token. */
  --wordmark-ink:#FFFFFF; --wordmark-rule:rgba(234,246,239,.18);
  --wordmark-font:var(--font-sans); --wordmark-weight:700; --wordmark-ls:.02em;

  /* ---- role tokens (structure) ----
     THE MICRO-LABELS ARE SENTENCE CASE NOW, and this is the single change that
     does most of the work on how the product feels. They used to be 9.5px
     uppercase mono at .13em tracking, applied to every table header, every
     stat key, the nav section caps and every status stamp: nine and a half
     pixels, shouted, on a tracked-out typewriter face. That is what read as a
     court filing rather than an app, and it was also the least legible type in
     the interface.

     Mono survives where the glyphs genuinely have to line up or be
     transcribed: money, timestamps and reference codes, which is what the
     .mono class is for. It is no longer the voice of the whole chrome.

     The sizes went UP with the case change. Sentence case at 9.5px would have
     been quieter and no more readable; the point was legibility, not volume.
     --k-size in particular is the sidebar section cap, which WCAG counts as
     small text, so 11.5px buys real headroom on that contrast requirement. */
  --h1-size:28px; --h1-weight:680; --h1-ls:-.022em;
  --th-font:var(--font-sans); --th-size:11.5px; --th-tt:none; --th-ls:.005em; --th-weight:600;
  --k-font:var(--font-sans); --k-size:11.5px; --k-tt:none; --k-ls:.005em; --k-weight:600;
  --badge-font:var(--font-sans); --badge-size:11px; --badge-tt:none; --badge-ls:.005em;
  --badge-weight:600;
  --badge-r:999px; --badge-bd:1px; --badge-pad:4px 10px;
  --field-bg:var(--card); --field-bd:var(--line2); --field-r:var(--r-sm);
  --field-shadow:inset 0 1px 2px rgba(14,26,21,.04);
  --stat-v-font:var(--font-display); --stat-v-weight:700; --stat-v-size:30px;
  --card-bd:1px;
  --btn-bg:var(--card); --btn-ink:var(--ink); --btn-bd:1px solid var(--line2); --btn-fw:550;
  --nav-r:0; --nav-mx:0;
  /* tonal roles stay indirect, so a change to --brand-* gets its own tonal
     pill without redeclaring these */
  --p-container:var(--brand-tint); --on-p-container:var(--brand-deep);

  /* layout metrics */
  --gutter:14px; --tap:44px; --topbar-h:56px; --drawer-w:min(84vw,304px);
  --sat:env(safe-area-inset-top,0px); --sab:env(safe-area-inset-bottom,0px);
  --sal:env(safe-area-inset-left,0px); --sar:env(safe-area-inset-right,0px);

  /* radii */
  --r-xs:5px; --r-sm:7px; --r:10px; --r-lg:14px; --r-btn:var(--r-sm);
  --radius-lg:14px;

  /* elevation: soft and layered rather than a single drop */
  --shadow:0 1px 2px rgba(14,26,21,.06);
  --sh-2:0 2px 10px rgba(14,26,21,.07);
  --sh-3:0 16px 40px -10px rgba(14,26,21,.18);
  --inset-hi:none;
  --btn-shadow:var(--shadow); --card-shadow:var(--shadow);

  /* motion */
  --ease:cubic-bezier(.4,0,.2,1); --t:150ms;
}

/* ---- dark ----
   Not an inversion. Three things change in kind rather than in value, and
   none of them is optional:

   1. THE ACCENT CLIMBS. #00A651 is a fill on white and unreadable as text on
      it; on a dark card the readable step is LIGHTER than the fill, so
      --engo-ink becomes the brighter green and --brand follows it. A filled
      button keeps a mid green with a white label, because white on #0C6E3C
      still clears 5:1 and an ink-on-bright-green button does not.
   2. THE CARD IS RAISED, THE PAGE IS NOT. --card sits above --paper here, so
      a sheet reads as a sheet. --paper-2 is DARKER than the page on purpose:
      it is the recessed tone (segmented tracks, receipts), never a surface.
   3. THE RAIL STAYS THE ONE DARK FIELD. On light it is the only dark surface
      in the interface; on dark it has to stay distinguishable from a page that
      is now also dark, which is why --side sits BELOW --paper rather than
      above it. A rail that merges into the page loses the shape of the app.

   Everything not declared here is inherited from :root, which is where the
   type roles, radii, easing and layout metrics live. ---- */
:root[data-theme="dark"]{
  color-scheme:dark;

  --engo:#2FC46E;
  --engo-ink:#5FD98F;      /* the readable-on-dark step: 8.1:1 on --card */
  --engo-deep:#8FE8B5;
  --engo-band:#071410;

  --paper:#0C1511; --paper-2:#081009; --card:#132019; --sunk:#0F1A14;
  --ink:#E6EFE9; --muted:#A4B3AA; --faint:#7D8D84;
  --line:#213029; --line2:#31443A; --hair:rgba(230,239,233,.09);
  --on-brand:#FFFFFF;
  --btn-hover:#1A2A21;
  --topbar-bg:rgba(12,21,17,.86);
  --scrim:rgba(3,8,5,.62);
  --skel-hi:#1B2A22;
  --tip-bg:#E6EFE9; --tip-ink:#0C1511;

  /* Series slots stepped for a dark surface: the same eight hues, not a
     different palette, so a category keeps its identity when the theme flips.
     All eight clear 3:1 here, so the light mode's relief caveat does not apply. */
  --s1:#3987e5; --s2:#d95926; --s3:#199e70; --s4:#c98500;
  --s5:#d55181; --s6:#008300; --s7:#9085e9; --s8:#e66767;

  --brand:var(--engo-ink); --brand-2:var(--engo); --brand-deep:var(--engo-deep);
  --brand-tint:rgba(47,196,110,.16); --brand-ring:rgba(47,196,110,.3);

  --green:var(--engo-ink); --green-2:var(--engo); --green-deep:var(--engo-deep);
  --green-tint:rgba(47,196,110,.16); --green-ring:rgba(47,196,110,.28);

  --wax:#F08A7E; --wax-tint:rgba(192,42,30,.18);
  --brass:#E0A44B; --brass-tint:rgba(168,98,11,.2); --gold-ink:#EFC684;

  --pri-from:#128A4C; --pri-to:#0C6E3C; --pri-from-h:#169C57; --pri-to-h:#0F7C45;
  --pri-line:#2FC46E; --pri-glow:rgba(0,0,0,.5);
  --wax-from:#B33A2C; --wax-to:#992B20; --wax-from-h:#C24435; --wax-to-h:#A93326;
  --wax-line:#F08A7E;

  --chip-ok-line:rgba(47,196,110,.5); --chip-warn-line:rgba(240,138,126,.45);
  --chip-gold-line:rgba(224,164,75,.45);

  --letter-bg:#16241C; --ceremony-from:#241A18; --ceremony-line:#7A4034;
  --addm-line:#5C4B25; --unread-bg:#16241C; --login-glow:#132019;

  --seal-hi:#7DE8AE; --seal-core:#2FC46E; --seal-crack:#04331F;

  --side:var(--engo-band); --side-from:#0A1B14; --side-to:#050F0B;
  --side-ink:#DCE9E1; --side-dim:#8DA095; --side-sec:#76897E;
  --side-hover:rgba(255,255,255,.06);
  --side-on-bg:linear-gradient(90deg,rgba(47,196,110,.22),rgba(255,255,255,.02) 70%);
  --side-on-ink:#FFFFFF; --side-on-line:#2FC46E;
  --side-edge:inset -1px 0 0 rgba(0,0,0,.5);
  --newbtn-bg:rgba(255,255,255,.07); --newbtn-line:rgba(220,233,225,.2);
  --newbtn-bg-h:rgba(255,255,255,.13); --newbtn-line-h:rgba(220,233,225,.34);
  --wordmark-ink:#F1F8F4; --wordmark-rule:rgba(220,233,225,.14);

  --field-shadow:inset 0 1px 2px rgba(0,0,0,.25);

  --shadow:0 1px 2px rgba(0,0,0,.4);
  --sh-2:0 2px 8px rgba(0,0,0,.45);
  --sh-3:0 16px 40px -10px rgba(0,0,0,.6);
  --inset-hi:inset 0 1px 0 rgba(255,255,255,.05);
}
*{box-sizing:border-box}
html,body{margin:0}
/* the drawer is open: stop the page behind it scrolling under the finger */
body.navopen{overflow:hidden}

/* ============================================================ shell
   On a phone the document scrolls, the app bar sticks to the top and
   navigation is an off-canvas drawer. From ${BP.desk}px up (and only there)
   this becomes the classic two-pane app: a permanent sidebar beside a content
   pane that owns its own scrollbar. Both live in the ladder at the bottom.
   ============================================================ */
.dk{display:block;width:100%;min-height:100vh;min-height:100dvh;background:var(--paper);color:var(--ink);
  font-family:var(--font-sans);font-size:14px;line-height:1.5;font-weight:400;
  letter-spacing:-.005em;font-optical-sizing:auto;-webkit-tap-highlight-color:transparent;
  -webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:optimizeLegibility}
.dk ::selection{background:var(--p-container);color:var(--on-p-container)}
/* touch-action:manipulation drops the 300ms double-tap wait on every control */
.dk button{font:inherit;letter-spacing:inherit;cursor:pointer;touch-action:manipulation}
/* 16px is not a style choice: iOS Safari zooms the page on focus below it.
   The desktop rung takes fields back down to 13.5px. */
.dk input,.dk select,.dk textarea{font-family:inherit;font-size:16px;line-height:1.5;
  letter-spacing:inherit;color:var(--ink)}
.dk input[type="checkbox"],.dk input[type="radio"]{width:19px;height:19px;accent-color:var(--brand);flex-shrink:0}
.dk input[type="range"]{height:var(--tap);accent-color:var(--brand)}
.dk :focus-visible{outline:2px solid var(--brand);outline-offset:2px;border-radius:var(--r-xs)}
.dk h1,.dk h2,.dk h3{font-weight:600}
.dk img,.dk svg{max-width:100%}

/* ---- navigation drawer ----
   Off-canvas and transformed rather than mounted/unmounted, so it can slide
   both ways; visibility:hidden also takes it out of the tab order while
   closed, which display:none-free drawers usually forget. */
.side{position:fixed;top:0;bottom:0;left:0;z-index:120;width:var(--drawer-w);
  color:var(--side-ink);display:flex;flex-direction:column;
  padding:calc(16px + var(--sat)) 0 calc(16px + var(--sab)) var(--sal);
  overflow-y:auto;overscroll-behavior:contain;
  background:linear-gradient(180deg,var(--side-from) 0%,var(--side) 46%,var(--side-to) 100%);
  box-shadow:var(--sh-3);
  transform:translateX(-102%);visibility:hidden;
  transition:transform 260ms var(--ease),visibility 260ms step-end}
.side.open{transform:none;visibility:visible;transition:transform 260ms var(--ease),visibility 0s}
.navscrim{position:fixed;inset:0;z-index:110;background:var(--scrim);
  animation:dk-in 200ms var(--ease) both}
.wordmark{display:flex;align-items:center;gap:10px;padding:0 var(--gutter) 15px;
  border-bottom:1px solid var(--wordmark-rule);margin-bottom:10px}
/* The seal, in CSS rather than the SealMark component, because the wordmark
   needs it at 13px next to type. Same three moves as the component: an inner
   rim so it holds an edge on any surface, one off-centre specular, and a halo
   that reads as a ring rather than a glow. */
.wordmark .seal{width:13px;height:13px;border-radius:50%;flex-shrink:0;
  background:
    radial-gradient(circle at 30% 28%,color-mix(in srgb,#fff 30%,transparent) 0 18%,transparent 19%),
    radial-gradient(circle at 33% 30%,var(--seal-hi),var(--seal-core) 62%);
  box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--seal-crack) 34%,transparent),
             0 0 0 2px color-mix(in srgb,var(--seal-core) 22%,transparent)}
.wordmark b{font-family:var(--wordmark-font);font-weight:var(--wordmark-weight);font-size:18px;
  letter-spacing:var(--wordmark-ls);color:var(--wordmark-ink)}
/* closes the drawer from inside it: the scrim is not the only way out */
.drawerx{margin-left:auto;display:inline-flex;align-items:center;justify-content:center;
  min-width:var(--tap);min-height:var(--tap);margin-right:calc(var(--gutter) * -1 + 4px);
  background:none;border:0;border-radius:var(--r-sm);color:var(--side-dim)}
.drawerx:active{background:var(--side-hover);color:var(--side-ink)}
.orgline{padding:0 var(--gutter) 12px;font-size:12px;color:var(--side-dim);line-height:1.5;letter-spacing:0}
.navsec{padding:12px var(--gutter) 4px;font-family:var(--k-font);font-size:var(--k-size);font-weight:var(--k-weight);
  letter-spacing:var(--k-ls);color:var(--side-sec);text-transform:var(--k-tt)}
.navi{display:flex;align-items:center;gap:11px;width:100%;text-align:left;background:none;border:0;color:var(--side-dim);
  padding:11px var(--gutter);min-height:var(--tap);font-size:14.5px;font-weight:450;border-left:2.5px solid transparent;
  transition:color var(--t) var(--ease),background var(--t) var(--ease)}
.navi.on{color:var(--side-on-ink);font-weight:550;border-left-color:var(--side-on-line);background:var(--side-on-bg)}
.navi:active{color:var(--side-ink);background:var(--side-hover)}
.side .spacer{flex:1;min-height:10px}
.newbtn{margin:12px var(--gutter) 0;padding:11px 14px;min-height:var(--tap);border-radius:var(--r-sm);
  display:inline-flex;align-items:center;justify-content:center;
  border:1px solid var(--newbtn-line);background:var(--newbtn-bg);color:var(--side-ink);font-weight:550;font-size:14px;
  box-shadow:var(--inset-hi);transition:background var(--t) var(--ease),border-color var(--t) var(--ease)}
.newbtn:active{background:var(--newbtn-bg-h)}
.sidefoot{padding:14px var(--gutter) 0;font-size:11px;color:var(--side-sec);letter-spacing:.01em}

/* ---- everything else the top bar holds on a wide screen ----
   On a phone the secondary chrome (guide, security, theme, sound, the demo
   account switcher, sign out) moves into the foot of the drawer, stacked and
   full-width, instead of overflowing the app bar. */
/* Two per row: five stacked full-width buttons pushed "Sign out" off the end
   of a 844px-tall phone, and these are all short labels with an icon. */
/* align-items:start, not the grid default: the account list is the tallest
   thing in here by far, and a stretched sibling button grew to match its row.
   That was always wrong and merely looked like a tall rectangle; on a theme
   whose buttons are pills it became a 480px stadium. */
.chromeacts{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px;align-items:start;
  padding:12px var(--gutter) 0;border-top:1px solid var(--wordmark-rule)}
/* Two per row is for the short labelled buttons. Who you are, a section cap,
   the account list and the paired appearance controls are each a full-width
   band: half a drawer is not enough for any of them. */
.chromeacts .me,.chromeacts .msec,.chromeacts .mscroll,.chromeacts .mrow{grid-column:1 / -1}
.chromeacts .btn{width:100%;justify-content:flex-start;font-size:13.5px;
  background:var(--newbtn-bg);border:1px solid var(--newbtn-line);color:var(--side-ink);box-shadow:none}
.chromeacts .btn:active{background:var(--newbtn-bg-h);color:var(--side-ink)}
.chromeacts .whoami{grid-column:1 / -1;flex-direction:column;align-items:stretch;gap:8px;width:100%}
.chromeacts .whoami select{width:100%;max-width:none;min-height:var(--tap)}
.chromeacts .me{display:flex;align-items:center;gap:10px;color:var(--side-ink);font-size:13.5px;font-weight:550}

/* ---- app bar + content ---- */
.main{display:block;min-width:0}
/* sticky, not fixed: no scroll-jank, no manual offset for the content below */
.topbar{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:8px;min-height:var(--topbar-h);
  padding:calc(6px + var(--sat)) calc(var(--gutter) + var(--sar)) 6px calc(var(--gutter) + var(--sal));
  background:var(--topbar-bg);backdrop-filter:saturate(160%) blur(8px);
  border-bottom:1px solid var(--line);box-shadow:var(--shadow)}
.topbar .crumb{font-family:var(--k-font);font-size:var(--k-size);font-weight:var(--k-weight);color:var(--muted);
  letter-spacing:var(--k-ls);text-transform:var(--k-tt);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.topbar .grow{flex:1}
/* square, borderless, tap-sized: the drawer handle and its kind */
.iconbtn{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;
  min-width:var(--tap);min-height:var(--tap);padding:0;
  background:none;border:1px solid transparent;border-radius:var(--r-sm);color:var(--ink)}
.iconbtn:active{background:var(--sunk);border-color:var(--line)}
.whoami{display:flex;align-items:center;gap:10px}
.whoami .avatar{width:32px;height:32px;border-radius:50%;flex-shrink:0;color:var(--on-brand);display:flex;align-items:center;
  justify-content:center;font-size:11.5px;font-weight:600;letter-spacing:.02em;
  background:linear-gradient(155deg,var(--brand) 0%,var(--pri-to) 100%);
  box-shadow:var(--shadow),var(--inset-hi)}
/* padding-right clears the native chevron: long role labels ran under it */
.whoami select{border:1px solid var(--line2);border-radius:var(--r-sm);padding:8px 30px 8px 10px;background:var(--card);
  max-width:100%;min-width:0;box-shadow:var(--shadow);transition:border-color var(--t) var(--ease)}
.content{display:block;min-width:0;
  padding:16px calc(var(--gutter) + var(--sar)) calc(36px + var(--sab)) calc(var(--gutter) + var(--sal))}

/* ---- page head ----
   Stacked on a phone: title, then the tools as their own full-width row. It
   becomes a single baseline-aligned row from ${BP.tab}px up. */
.pagehead{display:flex;flex-direction:column;align-items:stretch;gap:7px;margin:0 0 16px}
.pagehead h1{font-family:var(--font-display);font-weight:var(--h1-weight);font-size:22px;margin:0;
  letter-spacing:var(--h1-ls);line-height:1.2;overflow-wrap:break-word}
.pagehead .sub{color:var(--muted);font-size:13px;letter-spacing:0}
.pagehead .grow{display:none}
/* the head stretches its children so the tool row can fill the width, but a
   status stamp or a countdown must still hug its own text */
.pagehead>span{align-self:flex-start}
/* search boxes, filters and page actions. Every child is free to fill the
   row on a phone; from ${BP.tab}px they shrink to their natural width. */
.pagetools{display:flex;flex-wrap:wrap;gap:8px;align-items:center;width:100%}
.pagetools>.in,.pagetools>select.in{flex:1 1 100%;min-width:0}
.pagetools>.btn,.pagetools>label.btn{flex:1 1 auto;justify-content:center}
.pagetools .checkline{flex:1 1 100%}
/* a checkbox with its own label, tap-sized, never squashed between two fields */
.checkline{display:inline-flex;align-items:center;gap:9px;min-height:var(--tap);
  font-size:13.5px;cursor:pointer;line-height:1.4}

/* atoms */
.card{background:var(--card);border:var(--card-bd) solid var(--line);border-radius:var(--r);box-shadow:var(--card-shadow)}
.card .chead{display:flex;align-items:center;gap:8px;padding:12px var(--gutter);
  border-bottom:var(--card-bd) solid var(--line);flex-wrap:wrap}
.card .chead h3{margin:0;font-size:13.5px;font-weight:600;letter-spacing:-.006em;min-width:0;overflow-wrap:break-word}
.cbody{padding:14px var(--gutter)}
.mono{font-family:var(--font-mono);font-size:12px;font-weight:450;letter-spacing:0;font-variant-numeric:tabular-nums}
.money{font-family:var(--font-mono);font-weight:500;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.muted{color:var(--muted)} .faint{color:var(--faint)} .waxfg{color:var(--wax)} .greenfg{color:var(--green)}
.stamp{display:inline-flex;align-items:center;font-family:var(--badge-font);font-size:var(--badge-size);
  font-weight:var(--badge-weight,550);letter-spacing:var(--badge-ls);text-transform:var(--badge-tt);
  padding:var(--badge-pad);border-radius:var(--badge-r);
  border:var(--badge-bd) solid color-mix(in srgb,currentColor 33%,transparent);white-space:nowrap;
  background:var(--st-bg,transparent);color:var(--st-fg,var(--muted))}
/* Status stamps: foregrounds darkened against their own tint so the small
   uppercase label clears WCAG AA on the badge, in both themes. The unprefixed
   set belongs to whichever theme owns :root, so this one is light; dark
   restates all nine below.

   Six stages on one colour axis is the hard part. Paper reuses gold for both
   approval and awarded and green for both published and evaluation; studio
   splits the green pair (emerald published / indigo evaluation) and keeps the
   amber pair separated by tint depth, which measures better under both
   protanopia and deuteranopia. */
.st-draft{--st-fg:#52525B;--st-bg:#F4F4F5}
.st-approval{--st-fg:#92400E;--st-bg:#FEF3C7}
.st-published{--st-fg:#065F46;--st-bg:#D1FAE5}
/* closed sits a step darker than published rather than only a hue away: under
   deuteranopia emerald and rose both land on the same yellow, so the pair is
   separated by lightness (measured deltaE 1.4 -> 8.0) */
.st-closed{--st-fg:#9F1239;--st-bg:#FECDD3}
.st-evaluation{--st-fg:#3730A3;--st-bg:#E0E7FF}
.st-awarded{--st-fg:#78350F;--st-bg:#FDE68A}
.st-closing{--st-fg:#9A3412;--st-bg:#FFEDD5}
.st-paused{--st-fg:#1E3A5F;--st-bg:#DBE6F3}
.st-cancelled{--st-fg:#7F1D1D;--st-bg:#F5D0CE}
/* Dark keeps the same nine states and the same separations, stepped for a
   dark ground: the foreground is the light end of each hue and the fill is
   that hue at low alpha, so a stamp reads as tinted rather than painted.
   Published and closed are still separated by lightness, not only hue, for
   the same deuteranopia reason as above. */
:root[data-theme="dark"] .st-draft{--st-fg:#C3CDC7;--st-bg:rgba(195,205,199,.14)}
:root[data-theme="dark"] .st-approval{--st-fg:#F7DDB0;--st-bg:rgba(224,164,75,.09)}
:root[data-theme="dark"] .st-published{--st-fg:#5FD98F;--st-bg:rgba(47,196,110,.18)}
:root[data-theme="dark"] .st-closed{--st-fg:#F5B9A8;--st-bg:rgba(240,138,126,.30)}
:root[data-theme="dark"] .st-evaluation{--st-fg:#A7C4F5;--st-bg:rgba(57,135,229,.18)}
:root[data-theme="dark"] .st-awarded{--st-fg:#EFC684;--st-bg:rgba(224,164,75,.24)}
:root[data-theme="dark"] .st-closing{--st-fg:#F0B27A;--st-bg:rgba(217,140,76,.32)}
:root[data-theme="dark"] .st-paused{--st-fg:#8FBEDD;--st-bg:rgba(110,168,208,.16)}
:root[data-theme="dark"] .st-cancelled{--st-fg:#F5AFA0;--st-bg:rgba(216,76,76,.22)}
/* status vocabulary is always a stamp; the tone variants carry their own colour
   where there is no STATUS entry to read one from (e.g. award approval). */
.stamp.gold{color:var(--gold-ink);background:var(--brass-tint);border-color:var(--chip-gold-line)}
/* min-height applies to every chip, not just the clickable ones: a row that
   mixes 24px labels with 34px buttons reads as a rendering fault, and half the
   chips in the supplier register are downloads. 32px clears WCAG 2.5.8. */
.chip{display:inline-flex;align-items:center;gap:5px;min-height:32px;font-size:var(--badge-size,11.5px);font-weight:450;
  padding:var(--badge-pad);border-radius:99px;border:1px solid var(--line);color:var(--muted);
  background:var(--card);white-space:nowrap;font-variant-numeric:tabular-nums}
.chip.warn{color:var(--wax);border-color:var(--chip-warn-line);background:var(--wax-tint)}
.chip.ok{color:var(--green);border-color:var(--chip-ok-line);background:var(--green-tint)}
.chip.gold{color:var(--brass);border-color:var(--chip-gold-line);background:var(--brass-tint)}
button.chip:active{background:var(--sunk)}

/* Buttons are tap targets first: inline-flex so a label-wrapped file input
   centres like a real button, and min-height var(--tap) so nothing on a phone
   is smaller than a fingertip. The desktop rung trims them back down. */
.btn{display:inline-flex;align-items:center;justify-content:center;
  min-height:var(--tap);padding:9px 15px;border-radius:var(--r-btn);border:var(--btn-bd);background:var(--btn-bg);
  font-weight:var(--btn-fw);font-size:13.5px;color:var(--btn-ink);letter-spacing:-.004em;box-shadow:var(--btn-shadow);
  transition:background var(--t) var(--ease),border-color var(--t) var(--ease),box-shadow var(--t) var(--ease),transform var(--t) var(--ease)}
.btn:active{transform:translateY(.5px);box-shadow:var(--shadow)}
.btn.pri{background:linear-gradient(180deg,var(--pri-from) 0%,var(--pri-to) 100%);border-color:var(--pri-line);color:var(--on-brand);
  box-shadow:0 1px 2px color-mix(in srgb,var(--pri-line) 40%,transparent),var(--inset-hi)}
.btn.pri:hover{background:linear-gradient(180deg,var(--pri-from-h) 0%,var(--pri-to-h) 100%);border-color:var(--pri-line);
  box-shadow:0 2px 8px -1px color-mix(in srgb,var(--pri-line) 46%,transparent),var(--inset-hi)}
.btn.wax{background:linear-gradient(180deg,var(--wax-from) 0%,var(--wax-to) 100%);border-color:var(--wax-line);color:var(--on-brand);
  box-shadow:0 1px 2px color-mix(in srgb,var(--wax-line) 40%,transparent),var(--inset-hi)}
.btn.wax:hover{background:linear-gradient(180deg,var(--wax-from-h) 0%,var(--wax-to-h) 100%);
  box-shadow:0 2px 8px -1px color-mix(in srgb,var(--wax-line) 46%,transparent),var(--inset-hi)}
/* .sm stays a comfortable tap on a phone: it is only "small" on a desktop */
.btn.sm{padding:7px 12px;font-size:13px;border-radius:var(--r-xs)}
.btn:disabled{opacity:.42;cursor:not-allowed;box-shadow:none;transform:none}
.btn.iconly{padding:0;min-width:var(--tap)}
/* a file input dressed as a button still has to accept a fat finger */
label.btn{cursor:pointer}

.in,.dk textarea,.dk select.in{width:100%;min-height:var(--tap);padding:10px 12px;
  border:1px solid var(--field-bd);border-radius:var(--field-r);
  background:var(--field-bg);box-shadow:var(--field-shadow);
  transition:border-color var(--t) var(--ease),box-shadow var(--t) var(--ease)}
.in:focus,.dk textarea:focus,.dk select.in:focus{outline:0;border-color:var(--brand);
  box-shadow:0 0 0 3px var(--brand-ring),inset 0 1px 2px rgba(20,31,27,.03)}
.in::placeholder,.dk textarea::placeholder{color:var(--faint)}
.dk textarea{resize:vertical;min-height:96px;line-height:1.55}
/* numeric fields (scores, weights, thresholds): wide enough to tap and centred
   on a phone, a compact field again from the tablet rung. Never a percentage:
   these sit in flex rows where 100% would swallow the label beside them. */
.in.numin{width:118px;max-width:100%;text-align:center}
.lbl{display:block;font-size:12px;font-weight:600;color:var(--muted);margin:0 0 6px;letter-spacing:.005em;line-height:1.4}
/* The sentence under a field that explains what it is for. Distinct from a
   validation message: this is always present and never red. */
.hint{font-size:12.5px;color:var(--faint);line-height:1.5;margin-top:5px}
.lbl .faint{font-weight:400;text-transform:none;letter-spacing:0}
.in:disabled{opacity:.55;cursor:not-allowed}
.frow{margin-bottom:14px}
/* a row of fields that is a column on a phone: the workspace rename, the
   supplier profile, the compliance-document uploader */
.formrow{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end}
.formrow>.frow{flex:1 1 100%;margin-bottom:0}
.formrow>.in{flex:1 1 100%}
.formrow>.btn,.formrow>label.btn{flex:1 1 auto;justify-content:center}
/* line item: description on its own row, then qty · unit · remove */
.lineedit{display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:center;margin-bottom:10px}
/* Narrow: the item link and the description each take a row of their own, and
   quantity/unit/remove share the third. */
.lineedit>.itempick{grid-column:1 / -1;justify-self:start}
.lineedit>.desc{grid-column:1 / -1}
/* criterion: name on its own row, then weight · remove */
.critedit{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;margin-bottom:10px}
.critedit>.cname{grid-column:1 / -1}
/* a priced tender line in the bid room: what it is, then the rate and the
   extended total side by side underneath it */
.priceline{display:grid;grid-template-columns:1fr auto;gap:6px 10px;align-items:center;
  padding:10px 0;border-bottom:1px dashed var(--line)}
.priceline:last-of-type{border-bottom:0}
.priceline .pdesc{grid-column:1 / -1;font-size:13.5px}
.priceline .in{max-width:none}
.priceline .ptotal{text-align:right;font-size:13px;color:var(--muted)}

/* ============================================================ tables
   A seven-column comparison does not fit a phone, and pinch-zooming a table
   is not a reading experience. So on a phone every .tbl collapses into a list
   of records: the header row is dropped and each cell carries its own label
   from data-l, drawn in the same type role the <th> would have used. From
   ${BP.tab}px up the very same markup is a real table again.

   Two tables genuinely need columns to mean anything: the line-item
   comparison and the consensus matrix, both of which grow a column per bidder
   and they opt out with .wide, staying a table inside a .tscroll pane.
   ============================================================ */
.tbl{width:100%;border-collapse:collapse}
.tbl th{font-family:var(--th-font);font-size:var(--th-size);font-weight:var(--th-weight);letter-spacing:var(--th-ls);
  text-transform:var(--th-tt);color:var(--faint);text-align:left;padding:9px 12px;
  border-bottom:1px solid var(--line);white-space:nowrap}
.tbl td{padding:10px 12px;border-bottom:1px solid var(--hair);font-size:13px;vertical-align:middle}
.tbl tr:last-child td{border-bottom:0}
.tbl tr.click{cursor:pointer;transition:background var(--t) var(--ease)}
.tbl .num{font-variant-numeric:tabular-nums}
/* short mono data (refs, money, dates, counts) must never break mid-token;
   the (non-mono) title column absorbs the width instead */
.tbl .mono,.tbl .money{white-space:nowrap}
.tbl td.best{color:var(--green);font-weight:600}
.subtbl td{padding:6px 12px;font-size:12.5px;border-bottom:1px dashed var(--line)}
.subtbl tr:last-child td{border-bottom:0}
.breakrow>td{background:var(--sunk);padding:8px 14px 15px}
/* horizontal scroll pane for the tables that stay tables */
.tscroll{overflow-x:auto;-webkit-overflow-scrolling:touch;overscroll-behavior-x:contain}
.tscroll>.tbl.wide{min-width:620px}
/* a table you scroll sideways should not also wrap its label column to four
   lines: let it take its natural width and let the pane scroll. The breakrow
   is exempt, its cell holds a whole nested table. */
.tbl.wide>thead>tr>th:first-child,
.tbl.wide>tbody>tr:not(.breakrow)>td:first-child{white-space:nowrap}

/* ---- record-list mode (phones) ---- */
.tbl:not(.wide){display:block}
.tbl:not(.wide)>thead{display:none}
.tbl:not(.wide)>tbody{display:block}
.tbl:not(.wide)>tbody>tr{display:block;padding:12px var(--gutter);
  border-bottom:1px solid var(--line)}
.tbl:not(.wide)>tbody>tr:last-child{border-bottom:0}
.tbl:not(.wide)>tbody>tr.click:active{background:var(--sunk)}
.tbl:not(.wide)>tbody>tr>td{display:block;padding:2px 0;border:0;font-size:13.5px}
.tbl:not(.wide)>tbody>tr>td:empty{display:none}
.tbl:not(.wide)>tbody>tr>td[data-l]{display:flex;flex-wrap:wrap;align-items:baseline;gap:3px 10px;
  padding:3px 0;font-size:13px}
.tbl:not(.wide)>tbody>tr>td[data-l]::before{content:attr(data-l);flex:0 0 auto;
  font-family:var(--th-font);font-size:var(--th-size);font-weight:var(--th-weight);
  letter-spacing:var(--th-ls);text-transform:var(--th-tt);color:var(--faint)}
/* a labelled number is a two-column fact: label left, figure hard right */
.tbl:not(.wide)>tbody>tr>td[data-l].num{justify-content:space-between}
/* the unlabelled lead cell is the record's title, so it gets the emphasis */
.tbl:not(.wide)>tbody>tr>td:not([data-l]){padding-bottom:4px}

/* ---- grids + stats ----
   One column is the default; the ladder widens each grid at the point its
   content stops being cramped. Stat tiles are the exception: a 2-up row of
   figures reads fine even at 360px, so .g4 starts paired. */
.grid{display:grid;gap:12px}
.g4{grid-template-columns:repeat(2,minmax(0,1fr))}
.g3,.g2{grid-template-columns:minmax(0,1fr)}
.grid2{display:grid;grid-template-columns:minmax(0,1fr);gap:12px}
.stat{background:var(--card);border:var(--card-bd) solid var(--line);border-radius:var(--r);padding:12px 13px;
  box-shadow:var(--card-shadow);min-width:0;
  transition:box-shadow var(--t) var(--ease),border-color var(--t) var(--ease)}
.stat .k{font-family:var(--k-font);font-size:var(--k-size);font-weight:var(--k-weight);letter-spacing:var(--k-ls);
  text-transform:var(--k-tt);color:var(--faint);line-height:1.35}
.stat .v{font-family:var(--stat-v-font);font-size:24px;font-weight:var(--stat-v-weight);margin-top:4px;
  letter-spacing:var(--h1-ls);line-height:1.1;font-variant-numeric:tabular-nums;overflow-wrap:break-word}
.stat .d{font-size:11.5px;color:var(--muted);margin-top:3px;line-height:1.45}
/* A figure you can walk through to what it counts. The arrow only appears on
   approach, so a wall of stats stays quiet until you reach for one. */
.statlink{position:relative;display:block;width:100%;text-align:left;cursor:pointer;font:inherit;color:inherit}
.statlink:hover{border-color:var(--line-strong,var(--line2));box-shadow:var(--card-shadow-hi,var(--card-shadow))}
.statlink:focus-visible{outline:2px solid var(--brass);outline-offset:2px}
.statlink .statgo{position:absolute;top:11px;right:12px;font-size:13px;color:var(--faint);
  opacity:0;transform:translateX(-3px);transition:opacity var(--t) var(--ease),transform var(--t) var(--ease)}
.statlink:hover .statgo,.statlink:focus-visible .statgo{opacity:1;transform:none}

/* ---- the dashboard's work queue ----
   One row per thing that is waiting, with how long it has been waiting said
   plainly. A .mine row is something this person can act on; a .theirs row is
   somebody else's move and is deliberately quieter. */
.wq{display:flex;align-items:flex-start;gap:11px;padding:11px 0;border-bottom:1px solid var(--line2)}
.wq:last-child{border-bottom:0}
.wq .wqmain{flex:1;min-width:0}
.wq .wqtitle{font-weight:600;line-height:1.35}
.wq .wqwhy{font-size:12px;color:var(--muted);margin-top:2px;line-height:1.45}
.wq .wqage{font-family:var(--font-mono);font-size:11px;color:var(--faint);white-space:nowrap;
  font-variant-numeric:tabular-nums;padding-top:2px}
.wq.late .wqage{color:var(--wax)}
.wq.theirs{opacity:.72}
.wqmark{width:9px;height:9px;border-radius:50%;flex:0 0 auto;margin-top:6px;background:var(--line2)}
.wq.mine .wqmark{background:var(--brass)}
.wq.late .wqmark{background:var(--wax)}

/* ---- tabs ----
   A phone scrolls them sideways rather than wrapping them into a second row
   that shifts the whole page down; the scrollbar itself is hidden because the
   overflowing tab is the affordance. */
.tabs{display:flex;align-items:center;gap:2px;border-bottom:1px solid var(--line);margin-bottom:14px;
  overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.tabs::-webkit-scrollbar{display:none}
.tabs>.btn{flex:0 0 auto}
.tab{flex:0 0 auto;min-height:var(--tap);background:none;border:0;border-bottom:2px solid transparent;
  padding:10px 12px;font-family:var(--th-font);
  font-size:var(--th-size);font-weight:var(--th-weight);letter-spacing:var(--th-ls);text-transform:var(--th-tt);
  color:var(--muted);white-space:nowrap;
  transition:color var(--t) var(--ease),border-color var(--t) var(--ease)}
.tab.on{color:var(--ink);border-bottom-color:var(--wax)}

/* ---- stage tracker ----
   Six stages will not fit one phone row legibly, so they wrap 3-up as a grid
   and the connector rail is dropped: a rail that jumps between rows reads as
   a wrong diagram. The rail comes back with the single row at ${BP.tab}px. */
.stages{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px 4px;margin:0 0 18px}
.stg{min-width:0;position:relative;padding-top:16px;text-align:center}
.stg::before{content:"";position:absolute;top:5px;left:0;right:0;height:2px;background:var(--line2);display:none}
.stg:first-child::before{left:50%}
.stg:last-child::before{right:50%}
.stg.done::before{background:var(--green)}
.stg .dot{position:absolute;top:0;left:50%;transform:translateX(-50%);width:11px;height:11px;border-radius:50%;
  background:var(--card);border:2px solid var(--line2);transition:background var(--t) var(--ease)}
.stg.done .dot{background:var(--green);border-color:var(--green);box-shadow:0 0 0 3px var(--green-ring)}
.stg.done.wax .dot{background:var(--wax);border-color:var(--wax);box-shadow:0 0 0 3px color-mix(in srgb,var(--seal-core) 22%,transparent)}
.stg.done.gold .dot{background:var(--brass);border-color:var(--brass);box-shadow:0 0 0 3px rgba(138,106,20,.15)}
.stg .sk{font-family:var(--font-mono);font-size:9.5px;font-weight:500;letter-spacing:.09em;text-transform:uppercase;color:var(--faint)}
.stg.done .sk{color:var(--ink);font-weight:550}
.stg .sd{font-family:var(--font-mono);font-size:9.5px;color:var(--faint);font-variant-numeric:tabular-nums}

/* seals + ceremony */
.sealrow{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;padding:12px var(--gutter);
  border:1px solid var(--line);border-radius:var(--r-sm);background:var(--sunk)}
.sealdot{width:15px;height:15px;border-radius:50%;flex-shrink:0;
  background:radial-gradient(circle at 34% 32%,var(--seal-hi),var(--seal-core) 70%);
  box-shadow:0 0 0 3px color-mix(in srgb,var(--seal-core) 20%,transparent),0 1px 3px color-mix(in srgb,var(--seal-core) 38%,transparent)}
.ceremony{border:1.5px dashed var(--ceremony-line);border-radius:var(--r);background:linear-gradient(180deg,var(--ceremony-from),var(--wax-tint));
  padding:22px var(--gutter);text-align:center;box-shadow:var(--shadow)}
.ceremony h3{font-family:var(--font-display);font-size:19px;font-weight:600;letter-spacing:-.018em;margin:9px 0 7px}
/* the hold-to-confirm button is the point of a ceremony, never clipped */
.ceremony .btn{max-width:100%;white-space:normal;height:auto;padding:11px 16px}
.receipt{border:1.5px solid var(--wax);border-radius:var(--r);background:var(--card);
  padding:22px var(--gutter);text-align:center;box-shadow:var(--sh-2)}
.letter{white-space:pre-wrap;overflow-wrap:break-word;border:1px solid var(--line);border-left:3px solid var(--brass);
  border-radius:var(--r-sm);background:var(--letter-bg);padding:14px var(--gutter);
  font-family:var(--font-serif);font-size:14.5px;line-height:1.6;
  letter-spacing:0;margin-top:10px;box-shadow:var(--shadow)}

/* meter */
.meter{height:6px;border-radius:99px;background:var(--line);overflow:hidden;box-shadow:inset 0 1px 1px rgba(20,31,27,.05)}
.meter>div{height:100%;background:linear-gradient(90deg,var(--green),var(--green-2));border-radius:99px;transition:width .4s var(--ease)}

/* timeline */
.tline{list-style:none;margin:0;padding:0 0 0 4px}
.tline li{position:relative;padding:0 0 17px 22px;border-left:1px solid var(--line2)}
.tline li:last-child{border-left-color:transparent;padding-bottom:2px}
.tline li::before{content:"";position:absolute;left:-4.5px;top:4px;width:8px;height:8px;border-radius:50%;
  background:var(--card);border:2px solid var(--green)}
.tline li.waxdot::before{border-color:var(--wax)}
.tline .when{font-family:var(--font-mono);font-size:10.5px;color:var(--faint);font-variant-numeric:tabular-nums}
.tline .what{font-weight:550;font-size:13px;margin:1px 0;letter-spacing:-.004em}
.tline .who{font-size:12px;color:var(--muted)}

/* misc
   .rowline wraps: on a phone the trailing control drops under the label it
   belongs to instead of squeezing the text to two characters. */
.rowline{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;padding:11px 0;
  border-bottom:1px solid var(--hair)}
.rowline:last-child{border-bottom:0}
.aihint{border:1px solid var(--line);border-left:3px solid var(--brass);border-radius:var(--r-sm);background:var(--letter-bg);
  padding:13px var(--gutter);font-size:13px;white-space:pre-wrap;overflow-wrap:break-word;line-height:1.6}
.empty{padding:26px var(--gutter);text-align:center;color:var(--faint);font-size:13px;line-height:1.6}
.qa{padding:13px var(--gutter);border:1px solid var(--line);border-radius:var(--r-sm);background:var(--sunk);margin-bottom:10px}
.notice{border:1px solid var(--line);border-radius:var(--r-sm);padding:11px 13px;font-size:12.5px;color:var(--muted);
  background:var(--sunk);line-height:1.55}
.addm{border:1px solid var(--addm-line);border-left:3px solid var(--brass);border-radius:var(--r-sm);background:var(--brass-tint);
  padding:12px var(--gutter);margin-bottom:10px;font-size:13px;line-height:1.55}
/* the category bars in analytics: label column shrinks with the viewport
   rather than pushing the bar off the card */
.bars{display:flex;flex-direction:column;gap:9px}
.bar{display:flex;align-items:center;gap:9px}
.bar .bl{flex:0 0 76px;font-family:var(--font-mono);font-size:10.5px;color:var(--muted);text-align:right;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bar .bt{flex:1;height:16px;background:var(--line);border-radius:3px;overflow:hidden;min-width:0}
.bar .bt>span{display:block;height:100%;border-radius:3px;background:var(--brand)}
.bar .bv{flex:0 0 auto;font-family:var(--font-mono);font-size:11.5px;font-variant-numeric:tabular-nums}

/* ============================================================ the ladder
   Every width-conditional rule in DOCKET is below this line, and every one of
   them is a \`min-width\`: each rung says what a bigger viewport *buys*, never
   what it repairs. Read top to bottom and the layout grows phone → tablet →
   desktop. The numbers come from breakpoints.js.
   ============================================================ */

/* ---- ${BP.sm}px · a large phone can pair things up ---- */
@media(min-width:${BP.sm}px){
  .g3{grid-template-columns:repeat(2,minmax(0,1fr))}
  .pagetools>.in,.pagetools>select.in{flex:1 1 200px}
  .pagetools .checkline{flex:0 0 auto}
  .formrow>.frow{flex:1 1 180px}
  .formrow>.in{flex:1 1 180px}
  .formrow>.btn,.formrow>label.btn{flex:0 0 auto}
  /* Wide: five columns — item link, description, quantity, unit, remove. The
     link column sizes to content, so an unlinked line gives its width back to
     the description instead of reserving space for a chip that is not there. */
  .lineedit{grid-template-columns:auto 1fr 100px 120px auto}
  .lineedit>.itempick{grid-column:auto}
  .lineedit>.desc{grid-column:auto}
  .critedit{grid-template-columns:1fr 110px auto}
  .critedit>.cname{grid-column:auto}
  .priceline{grid-template-columns:1fr 150px 130px}
  .priceline .pdesc{grid-column:auto}
}

/* ---- ${BP.tab}px · tablet: records become tables, controls stop being
        finger-sized, and the page head collapses to one row ---- */
@media(min-width:${BP.tab}px){
  .dk,.loginwrap{--gutter:16px}
  .dk input,.dk select,.dk textarea{font-size:13.5px}
  .dk input[type="checkbox"],.dk input[type="radio"]{width:16px;height:16px}
  .dk input[type="range"]{height:auto}
  .in,.dk textarea,.dk select.in{min-height:0;padding:8px 11px}
  .in.numin{width:84px;text-align:left}
  .dk textarea{min-height:92px}
  .btn{min-height:0;padding:8px 14px;font-size:13px}
  .btn.sm{padding:5px 10px;font-size:12px}
  .btn.iconly{min-width:0;padding:5px 9px}
  .checkline{min-height:0;font-size:12.5px}
  .chip{min-height:0}
  .pagehead>span{align-self:auto}
  /* the cap that stops a long role label stretching the whole bar */
  .whoami select{padding:6px 28px 6px 9px;font-size:13px;max-width:308px}
  .whoami .avatar{width:29px;height:29px;font-size:11px}
  .card .chead{gap:10px;padding:13px 16px}
  .card .chead h3{font-size:13px}
  .cbody{padding:15px 16px}
  .lbl{font-size:11.5px}
  .grid,.grid2{gap:14px}
  .g2,.grid2{grid-template-columns:repeat(2,minmax(0,1fr))}
  .g3{grid-template-columns:repeat(3,minmax(0,1fr))}
  .stat{padding:14px 16px}
  .stat .v{font-size:var(--stat-v-size);margin-top:5px}
  .pagehead{flex-direction:row;align-items:flex-end;flex-wrap:wrap;gap:14px;margin:2px 0 20px}
  .pagehead h1{font-size:var(--h1-size)}
  .pagehead .sub{padding-bottom:3px}
  .pagehead .grow{display:block;flex:1}
  .pagetools{width:auto;flex:0 1 auto;justify-content:flex-end}
  .pagetools>.in{flex:0 0 200px}
  .pagetools>select.in{flex:0 0 auto;width:auto}
  .pagetools>.btn,.pagetools>label.btn{flex:0 0 auto}
  /* the record lists are tables again: same markup, same labels, now in the
     header row where a wide screen can afford to keep them */
  .tbl:not(.wide){display:table}
  .tbl:not(.wide)>thead{display:table-header-group}
  .tbl:not(.wide)>tbody{display:table-row-group}
  .tbl:not(.wide)>tbody>tr{display:table-row;padding:0;border-bottom:0}
  .tbl:not(.wide)>tbody>tr>td,
  .tbl:not(.wide)>tbody>tr>td[data-l],
  .tbl:not(.wide)>tbody>tr>td:empty{display:table-cell;padding:10px 12px;font-size:13px;
    border-bottom:1px solid var(--hair)}
  .tbl:not(.wide)>tbody>tr>td[data-l]::before{content:none}
  /* the lead cell is the more specific selector on a phone, so its padding has
     to be undone at matching specificity or restored rows sit unevenly */
  .tbl:not(.wide)>tbody>tr>td:not([data-l]){padding:10px 12px}
  .tbl:not(.wide)>tbody>tr:last-child>td{border-bottom:0}
  .tbl .num{text-align:right}
  .tscroll>.tbl.wide{min-width:0}
  .tabs{margin-bottom:17px}
  .tab{min-height:0;padding:9px 13px}
  .stages{display:flex;gap:0;margin:0 0 20px}
  /* Equal segments, not content-width ones. Without flex:1 each stage shrank to
     its own label and the six captions ran together as one word, while the dots
     -- positioned at 50% of each stage -- drifted off the captions they name.
     Equal segments are also what the connector rail assumes: it spans each
     stage edge to edge, so only equal stages join into one continuous line. */
  .stg{flex:1;padding-left:3px;padding-right:3px}
  .stg::before{display:block}
  .sealrow{flex-wrap:nowrap;padding:12px 14px}
  .rowline{flex-wrap:nowrap}
  .ceremony{padding:28px}
  .ceremony h3{font-size:21px}
  .receipt{padding:26px}
  .letter{padding:16px 18px;line-height:1.65}
  .aihint{padding:13px 15px}
  .empty{padding:30px}
  .bar .bl{flex:0 0 110px;font-size:11px}
}

/* ---- ${BP.desk}px · desktop: the drawer becomes furniture ----
   This is the one rung that changes the shell. The sidebar stops being an
   overlay and takes its own column, and the content pane takes over scrolling
   from the document. It matches DESKTOP_Q in breakpoints.js, which is what
   ui.jsx uses to decide whether to render the drawer handle at all. */
@media(min-width:${BP.desk}px){
  .dk{display:flex;height:100vh;height:100dvh;overflow:hidden}
  .side{position:static;transform:none;visibility:visible;z-index:auto;width:224px;flex-shrink:0;
    padding:20px 0 16px var(--sal);overflow-y:auto;box-shadow:var(--side-edge);transition:none}
  .navscrim,.drawerx,.chromeacts{display:none}
  .wordmark{padding:0 18px 17px;margin-bottom:12px}
  .orgline{padding:0 18px 14px;font-size:11.5px}
  .navsec{padding:12px 18px 4px}
  .navi{gap:9px;min-height:0;padding:8px 18px;font-size:13.5px}
  .newbtn{margin:14px 14px 0;min-height:0;padding:9px 12px;font-size:13px}
  .sidefoot{padding:14px 18px 0;font-size:10.5px}
  .main{flex:1;display:flex;flex-direction:column;min-width:0}
  /* the bar carries eight controls plus an account switcher: let it take a
     second row rather than ellipsing the workspace name or wrapping labels */
  .topbar{position:relative;min-height:0;gap:14px;row-gap:8px;flex-wrap:wrap;padding:11px 26px}
  .topbar .crumb{flex:0 0 auto;overflow:visible;text-overflow:clip}
  .topbar .btn{white-space:nowrap}
  .content{flex:1;overflow-y:auto;padding:28px 26px 40px}
}

/* ---- ${BP.wide}px · room for a four-up figure row ---- */
@media(min-width:${BP.wide}px){
  .g4{grid-template-columns:repeat(4,minmax(0,1fr))}
}

/* ---- pointer, not width ----
   Hover belongs to a mouse. Applied on a touch screen these leave the last
   thing you tapped looking hovered, so they are gated on the capability,
   as are the thin themed scrollbars, which a phone renders as overlays. */
@media(hover:hover) and (pointer:fine){
  .dk *{scrollbar-width:thin;scrollbar-color:var(--line2) transparent}
  .dk *::-webkit-scrollbar{width:10px;height:10px}
  .dk *::-webkit-scrollbar-track{background:transparent}
  .dk *::-webkit-scrollbar-thumb{background:var(--line2);border-radius:99px;border:3px solid transparent;background-clip:content-box}
  .dk *::-webkit-scrollbar-thumb:hover{background:var(--faint);background-clip:content-box}
  .btn:hover{border-color:var(--faint);background:var(--btn-hover);box-shadow:var(--sh-2)}
  .btn:disabled:hover{background:var(--btn-bg);border-color:var(--line2);box-shadow:none}
  .iconbtn:hover{background:var(--sunk);border-color:var(--line)}
  .navi:hover{color:var(--side-ink);background:var(--side-hover)}
  .newbtn:hover{background:var(--newbtn-bg-h);border-color:var(--newbtn-line-h)}
  .drawerx:hover{color:var(--side-ink);background:var(--side-hover)}
  .whoami select:hover{border-color:var(--faint)}
  .in:hover,.dk textarea:hover{border-color:var(--faint)}
  .tbl tr.click:hover td{background:var(--sunk)}
  .stat:hover{box-shadow:var(--sh-2);border-color:var(--line2)}
  .tab:hover{color:var(--ink)}
}

@media(prefers-reduced-motion:reduce){
  .dk *,.loginwrap *{transition-duration:0ms!important;animation-duration:0ms!important}
}
`;

/* ============================================================ theme deltas
   Tokens carry most of a theme. These are the handful of behaviours the
   Material surface needs that a colour swap cannot express: flat fills
   instead of gradients, a press ripple, filled inputs with an underline,
   and a navigation drawer of pills rather than a left-edge marker.
   ============================================================ */
export const THEME_CSS = `
/* --- the house look: cards, the section band, pill controls -------------
   Behaviours rather than colours, which is why they are here and not in the
   token block. THEME_CSS is concatenated after CSS (see ALL_CSS in App.jsx),
   so a plain \`.card\` selector wins on source order and none of these need a
   theme attribute to beat the shell rules. Both themes get them; what differs
   between light and dark is the tokens they read. */
.card{
  background:var(--card);
  border:1px solid var(--line);
  border-radius:var(--radius-lg);
  box-shadow:var(--sh-2);
}
.stat{
  background:var(--card);
  border:1px solid var(--line);
  border-radius:16px;
  box-shadow:var(--shadow);
}
.statlink:hover{border-color:var(--brand-2);box-shadow:var(--sh-2)}

/* NO BAND ON THE PAGE HEAD.

   The Eat N Go look opened every page with a deep green field carrying the
   title in white. While it was one theme among seven that was a striking thing
   to pick. Promoted to the only theme it became the first thing on every
   screen, and it is not what the approved design does: there the page is
   light, the heading is ink on it, and the ONE dark surface in the interface
   is the navigation rail. One dark field, not two.

   The green has not gone anywhere. It is the rail, the primary, the seal and
   the positive state, which is plenty for a house colour. A green slab behind
   every title on top of all that is the product shouting its own brand at
   somebody who already works there.

   What survives is a rule under the title rather than a field behind it. */
.pagehead{
  margin:0 0 18px;
  padding:0 0 13px;
  border-bottom:1px solid var(--line);
}
.pagehead h1{color:var(--ink)}
.pagehead .sub{color:var(--muted)}

/* Radii follow the approved design rather than the theme they arrived with:
   controls at 9 instead of 11, and no pill on .btn. A 20px card next to a
   fully round button reads as a consumer app, which this is not. Chips stay
   round, because a chip genuinely is a pill. */
.in,
.dk textarea,
.dk select{border-radius:9px}
.btn{border-radius:9px}
.chip{border-radius:999px}
.btn.pri{box-shadow:0 3px 12px -3px var(--pri-glow)}
.segmented,
.antabs{background:var(--paper-2);border-color:var(--line)}
.segmented button.on,
.antab.on{background:var(--card);box-shadow:var(--shadow)}

/* dark: paper objects need a touch more edge definition on dark surfaces,
   and the recessed tone is darker than the page rather than lighter. */
:root[data-theme="dark"] .letter,
:root[data-theme="dark"] .aihint{border-color:var(--line2)}
:root[data-theme="dark"] .ceremony{background:var(--ceremony-from)}
:root[data-theme="dark"] .receipt{background:var(--card)}
`;

export const EXTRA_CSS = `
.bellwrap{position:relative;display:flex}
.bellwrap .btn.hasnew{border-color:var(--chip-warn-line);color:var(--wax);background:var(--wax-tint)}
/* Notifications: a full-width sheet under the app bar on a phone: a 368px
   dropdown anchored to a button 8px from the screen edge would hang off it,
   and the anchored dropdown it always was from ${BP.desk}px up. */
.ndrop{position:fixed;left:var(--gutter);right:var(--gutter);top:calc(var(--topbar-h) + var(--sat) + 4px);
  max-height:min(68dvh,460px);overflow-y:auto;overscroll-behavior:contain;z-index:60;
  background:var(--card);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--sh-3)}
.nitem{padding:12px 14px;border-bottom:1px solid var(--hair);font-size:12.5px;line-height:1.5}
.nitem:last-child{border-bottom:0}
.nitem .ns{font-weight:600;margin-bottom:2px;letter-spacing:-.004em}
.nitem .nb{color:var(--muted);line-height:1.5}
.nitem.unread{background:var(--unread-bg);border-left:3px solid var(--wax)}

/* ---- overlay panels (guide, account security) ----
   Same story as the dialogs in motion.js: a bottom sheet you can thumb on a
   phone, a centred card on a desktop. The head stays put while the body
   scrolls, so the close button is never scrolled away. */
.panelwrap{position:fixed;inset:0;z-index:100;background:var(--scrim);
  display:flex;align-items:flex-end;justify-content:center;padding:0;
  animation:dk-in 200ms var(--ease) both}
.panel{width:100%;max-width:none;max-height:92dvh;overflow-y:auto;overscroll-behavior:contain;
  border-radius:var(--r-lg) var(--r-lg) 0 0;padding-bottom:var(--sab);
  animation:dk-sheet 260ms var(--ease) both}
.panel>.chead{position:sticky;top:0;z-index:2;background:var(--card);
  border-radius:var(--r-lg) var(--r-lg) 0 0}

.loginwrap{min-height:100vh;min-height:100dvh;display:flex;align-items:flex-start;justify-content:center;
  padding:calc(20px + var(--sat)) calc(16px + var(--sar)) calc(24px + var(--sab)) calc(16px + var(--sal));
  font-family:var(--font-sans);font-size:14px;line-height:1.5;color:var(--ink);letter-spacing:-.005em;
  -webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;font-optical-sizing:auto;
  background:radial-gradient(1100px 620px at 50% -12%,var(--login-glow) 0%,var(--paper) 52%,var(--paper-2) 100%)}
.loginwrap button{font:inherit;letter-spacing:inherit;cursor:pointer;touch-action:manipulation}
.loginwrap input{font-family:inherit;font-size:16px;letter-spacing:inherit;color:var(--ink)}
.loginwrap :focus-visible{outline:2px solid var(--brand);outline-offset:2px;border-radius:var(--r-xs)}
.loginwrap .card{box-shadow:var(--sh-3)}
.logincard{width:100%;max-width:428px}
.loginlogo{display:flex;align-items:center;gap:11px;justify-content:center;margin-bottom:18px}
.loginlogo .seal{width:16px;height:16px;border-radius:50%;flex-shrink:0;
  background:
    radial-gradient(circle at 30% 28%,color-mix(in srgb,#fff 32%,transparent) 0 18%,transparent 19%),
    radial-gradient(circle at 33% 30%,var(--seal-hi),var(--seal-core) 62%);
  box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--seal-crack) 34%,transparent),
             0 0 0 3px color-mix(in srgb,var(--seal-core) 18%,transparent)}
/* the wordmark is brand, not positive state (identical in every theme whose
   primary is its green, which is all of them except studio), and it takes the
   same face and tracking as the one in the sidebar */
.loginlogo b{font-family:var(--wordmark-font);font-size:24px;font-weight:var(--wordmark-weight);
  letter-spacing:var(--wordmark-ls);color:var(--brand-deep)}
/* one demo account per row on a phone: the labels are names and roles, and
   two of them side by side at 360px wrap to three lines each */
.demogrid{display:grid;grid-template-columns:minmax(0,1fr);gap:8px}
.demogrid .btn{text-align:left;justify-content:flex-start;font-weight:450;font-size:13px;line-height:1.4;padding:10px 12px}
.linkrow{display:flex;flex-wrap:wrap;gap:4px 16px;justify-content:space-between;margin-top:12px}
.docrow{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;padding:9px 0;
  border-bottom:1px dashed var(--line);font-size:13px}
.docrow:last-child{border-bottom:0}
/* file names wrap rather than run past the card edge, and the vertical padding
   takes the link past the 24px minimum target size (WCAG 2.5.8) */
.doclink{background:none;border:0;padding:4px 0;color:var(--brand);font-weight:550;text-align:left;cursor:pointer;
  font-size:13px;letter-spacing:-.004em;text-underline-offset:2px;white-space:normal;overflow-wrap:anywhere;
  transition:color var(--t) var(--ease)}
/* the tap highlight is off across the app, so touch gets its feedback here */
.doclink:active{color:var(--brand-deep);text-decoration:underline}

/* full-page loading state */
.booting{min-height:100vh;min-height:100dvh;display:flex;flex-direction:column;align-items:center;
  justify-content:center;gap:14px;padding:24px;text-align:center;
  background:var(--paper);font-family:var(--font-sans);color:var(--muted);font-size:13.5px;letter-spacing:-.004em;
  -webkit-font-smoothing:antialiased}
.booting .seal{width:15px;height:15px;border-radius:50%;
  background:radial-gradient(circle at 34% 32%,var(--seal-hi),var(--seal-core) 70%);
  box-shadow:0 0 0 3px color-mix(in srgb,var(--seal-core) 22%,transparent);animation:pulse 1.6s var(--ease) infinite}
@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.55;transform:scale(.9)}}

/* ---- the ladder, for the pieces above ---- */
@media(min-width:${BP.sm}px){
  .loginwrap{align-items:center;padding:24px calc(24px + var(--sar)) 24px calc(24px + var(--sal))}
  .loginlogo{margin-bottom:20px}
  .demogrid{grid-template-columns:1fr 1fr}
  .demogrid .btn{font-size:12.5px;padding:9px 11px}
  .panelwrap{align-items:center;padding:20px}
  .panel{max-width:640px;max-height:88dvh;border-radius:var(--r);padding-bottom:0;
    animation:dk-pop 260ms var(--ease) both}
  .panel.narrow{max-width:480px}
  .panel>.chead{border-radius:var(--r) var(--r) 0 0}
}
@media(min-width:${BP.tab}px){
  .docrow{flex-wrap:nowrap}
}
@media(min-width:${BP.desk}px){
  .ndrop{position:absolute;left:auto;right:0;top:42px;width:368px;max-height:440px}
}
@media(hover:hover) and (pointer:fine){
  .doclink:hover{color:var(--brand-deep);text-decoration:underline}
}
`;
