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
   Five themes live here and nowhere else. Every colour, radius, shadow AND
   type role below is a variable, so a theme is a token block rather than a
   fork of the stylesheet, which is what lets Material change the type
   system (sans display at weight 400, sentence-case labels, pill badges)
   and not just the palette.

     studio         the default: cool neutrals, indigo primary  <- :root
     paper          the house look: legal stationery, wax seals, serif
     material       flat Material surface, ported from the DOCKET prototype
     material-dark  the same on M3 dark neutrals, tonal green inverted
     night          the editorial look after hours

   THE DEFAULT THEME OWNS :root. theme.js removes the data-theme attribute for
   whichever theme is the default, so the block on bare :root and DEFAULT_THEME
   must name the same thing. The other four are attribute blocks, which beat
   :root on specificity no matter what order they appear in.

   :root is also the fallback for anything a theme does not declare, and the
   attribute blocks lean on that: night declares no type roles, no radii and no
   easing, material declares no seal colours. So the base carries paper's
   STRUCTURE (serif display, mono micro-labels, the 5/7/10/14 radii) and only
   its palette differs. Changing a structural token on :root changes night too.

   Contrast and CVD separation are measured, not eyeballed: see the note in
   ui.jsx before touching a status hue, then run node tools/palette-check.mjs.
   It reads these blocks, resolves the var() chains the way the cascade
   does, and reports every text-on-surface pair below WCAG AA plus the closest
   status-stamp pair under protanopia and deuteranopia.

   Two families, deliberately separate: --brand is the primary (buttons, focus
   rings, links) and --green is positive state (sealed, leading, published).
   They are the same green in every theme except studio, where the primary is
   indigo and success stays emerald, so an "ok" chip never turns indigo.
   ============================================================ */
:root{
  /* typefaces (structure: shared with every theme that does not override) */
  --font-sans:'Geist Variable',ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;
  --font-serif:'Source Serif 4 Variable',ui-serif,Charter,Georgia,serif;
  --font-mono:'Geist Mono Variable',ui-monospace,SFMono-Regular,Menlo,monospace;
  --font-display:var(--font-serif);

  /* ---- studio: cool neutral surfaces, one warm-free accent axis ----
     Neutrals sit on a faint blue axis rather than the sepia of paper, the
     primary is indigo, and the seal cools to rose so the whole palette reads
     on one temperature. */
  --paper:#F7F8FA; --paper-2:#EFF1F5; --card:#FFFFFF; --sunk:#F8FAFC;
  --ink:#0F1115; --muted:#4B5563; --faint:#6B7280;
  --line:#E5E7EB; --line2:#D2D6DC; --hair:rgba(15,17,21,.07);
  --on-brand:#FFFFFF;
  --btn-hover:#F9FAFB;
  --topbar-bg:rgba(255,255,255,.88);
  --scrim:rgba(15,17,21,.45);
  --skel-hi:#F3F4F6;
  --tip-bg:#111827; --tip-ink:#FFFFFF;

  /* primary */
  --brand:#4F46E5; --brand-2:#6366F1; --brand-deep:#3730A3;
  --brand-tint:#EEF2FF; --brand-ring:rgba(79,70,229,.24);

  /* positive state */
  --green:#047857; --green-2:#059669; --green-deep:#065F46;
  --green-tint:#ECFDF5; --green-ring:rgba(4,120,87,.2);
  /* critical, and the seal: cool rose, not wax red */
  --wax:#BE123C; --wax-tint:#FFF1F2;
  /* awarded */
  --brass:#B45309; --brass-tint:#FFFBEB; --gold-ink:#92400E;

  /* filled buttons */
  --pri-from:#4F46E5; --pri-to:#4338CA; --pri-from-h:#6366F1; --pri-to-h:#4F46E5; --pri-line:#3730A3;
  --wax-from:#E11D48; --wax-to:#BE123C; --wax-from-h:#F43F5E; --wax-to-h:#E11D48; --wax-line:#9F1239;

  /* chips + stamps */
  --chip-ok-line:#A7F3D0; --chip-warn-line:#FECDD3; --chip-gold-line:#FDE68A;

  /* paper objects: letters, memos, ceremonies, addenda */
  --letter-bg:#F8FAFC; --ceremony-from:#FFF1F2; --ceremony-line:#FDA4AF;
  --addm-line:#FDE68A; --unread-bg:#EEF2FF; --login-glow:#FFFFFF;

  /* seal */
  --seal-hi:#FB7185; --seal-core:#E11D48; --seal-crack:#881337;

  /* sidebar: dark slate, indigo active state */
  --side:#111827; --side-from:#1B2436; --side-to:#0B111C;
  /* --side-sec is a 9.5px uppercase label, so it is small text as far as WCAG
     is concerned and has to clear 4.5 rather than 3.0. Hierarchy against
     --side-dim comes from the type role, not from dimming it below legible. */
  --side-ink:#E5E7EB; --side-dim:#9CA3AF; --side-sec:#8A94A4;
  --side-hover:rgba(255,255,255,.055);
  --side-on-bg:linear-gradient(90deg,rgba(99,102,241,.24),rgba(255,255,255,.02) 70%);
  --side-on-ink:#FFFFFF; --side-on-line:#818CF8;
  --side-edge:inset -1px 0 0 rgba(0,0,0,.4),1px 0 0 rgba(255,255,255,.04);
  --newbtn-bg:rgba(255,255,255,.07); --newbtn-line:rgba(229,231,235,.2);
  --newbtn-bg-h:rgba(255,255,255,.13); --newbtn-line-h:rgba(229,231,235,.34);
  --wordmark-ink:#FFFFFF; --wordmark-rule:rgba(229,231,235,.12);
  /* The wordmark is set, not drawn, so its face is a token. Studio sets DOCKET
     in the sans at a tight track: wide-tracked serif caps are what reads as
     stationery, and this theme is the one that does not want to. The other four
     declare the editorial treatment themselves. */
  --wordmark-font:var(--font-sans); --wordmark-weight:650; --wordmark-ls:.04em;

  /* ---- role tokens (structure) ---- */
  --h1-size:27px; --h1-weight:600; --h1-ls:-.018em;
  --th-font:var(--font-mono); --th-size:9.5px; --th-tt:uppercase; --th-ls:.13em; --th-weight:550;
  --k-font:var(--font-mono); --k-size:9.5px; --k-tt:uppercase; --k-ls:.14em; --k-weight:550;
  --badge-font:var(--font-mono); --badge-size:9.5px; --badge-tt:uppercase; --badge-ls:.11em;
  --badge-r:var(--r-xs); --badge-bd:1px; --badge-pad:3.5px 8px;
  --field-bg:var(--card); --field-bd:var(--line2); --field-r:var(--r-sm);
  --field-shadow:inset 0 1px 2px rgba(15,17,21,.04);
  --stat-v-font:var(--font-display); --stat-v-weight:600; --stat-v-size:29px;
  --card-bd:1px;
  --btn-bg:var(--card); --btn-ink:var(--ink); --btn-bd:1px solid var(--line2); --btn-fw:550;
  --nav-r:0; --nav-mx:0;
  /* tonal roles stay indirect, so a theme that only swaps --brand-* gets its
     own tonal pill without redeclaring these */
  --p-container:var(--brand-tint); --on-p-container:var(--brand-deep);

  /* layout metrics */
  --gutter:14px; --tap:44px; --topbar-h:56px; --drawer-w:min(84vw,304px);
  --sat:env(safe-area-inset-top,0px); --sab:env(safe-area-inset-bottom,0px);
  --sal:env(safe-area-inset-left,0px); --sar:env(safe-area-inset-right,0px);

  /* radii */
  --r-xs:5px; --r-sm:7px; --r:10px; --r-lg:14px; --r-btn:var(--r-sm);

  /* elevation: neutral-cool, layered rather than a single drop */
  --shadow:0 1px 2px rgba(15,17,21,.05),0 1px 3px rgba(15,17,21,.06);
  --sh-2:0 2px 4px rgba(15,17,21,.05),0 6px 14px -3px rgba(15,17,21,.09);
  --sh-3:0 4px 8px rgba(15,17,21,.06),0 18px 36px -10px rgba(15,17,21,.16);
  --inset-hi:inset 0 1px 0 rgba(255,255,255,.12);
  --btn-shadow:var(--shadow); --card-shadow:var(--shadow);

  /* motion */
  --ease:cubic-bezier(.4,0,.2,1); --t:150ms;
}

/* ---- paper: the house look, unchanged. A complete palette rather than a
        delta, because it no longer owns :root. ---- */
:root[data-theme="paper"]{
  /* typefaces */
  --font-sans:'Geist Variable',ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;
  --font-serif:'Source Serif 4 Variable',ui-serif,Charter,Georgia,serif;
  --font-mono:'Geist Mono Variable',ui-monospace,SFMono-Regular,Menlo,monospace;
  --font-display:var(--font-serif);   /* page titles, stat values, letters */

  /* surfaces + ink */
  --paper:#F4F3ED; --paper-2:#EFEEE6; --card:#FFFFFF; --sunk:#FAF9F3;
  --ink:#141F1B; --muted:#59645D; --faint:#828C85;
  --line:#E3E1D5; --line2:#CFCDBF; --hair:rgba(20,31,27,.07);
  --on-brand:#FFFFFF;                 /* ink on a filled brand surface */
  --btn-hover:#FDFDFB;
  --topbar-bg:rgba(255,255,255,.86);
  --scrim:rgba(20,31,27,.42);
  --skel-hi:#F7F6F0;
  --tip-bg:#12241D; --tip-ink:#FFFFFF;

  /* brand: here the primary and positive state are the same green, which is
     what makes an "ok" chip and a filled button agree in the editorial look */
  --green:#245C48; --green-2:#2E7259; --green-deep:#12362A;
  --green-tint:#E2EDE7; --green-ring:rgba(36,92,72,.16);
  --brand:var(--green); --brand-2:var(--green-2); --brand-deep:var(--green-deep);
  --brand-tint:var(--green-tint); --brand-ring:var(--green-ring);
  --wax:#A9331F; --wax-tint:#F7E7E1;
  --brass:#8A6A14; --brass-tint:#F2EBD6; --gold-ink:#6B5215;

  /* filled buttons */
  --pri-from:#1B4838; --pri-to:#12362A; --pri-from-h:#26614B; --pri-to-h:#164033; --pri-line:#0C2A20;
  --wax-from:#B93A24; --wax-to:#A9331F; --wax-from-h:#C6402A; --wax-to-h:#9E2F1C; --wax-line:#8E2A19;

  /* chips + stamps */
  --chip-ok-line:#BAD3C7; --chip-warn-line:#E4B7AC; --chip-gold-line:#DCCC9A;

  /* paper objects: letters, memos, ceremonies, addenda */
  --letter-bg:#FCFBF6; --ceremony-from:#FBF0EC; --ceremony-line:#D9A797;
  --addm-line:#E4D6AC; --unread-bg:#FBFAF4; --login-glow:#FBFAF5;

  /* wax seal */
  --seal-hi:#E0674C; --seal-core:#A9331F; --seal-crack:#7C2415;

  /* sidebar */
  --side:#12241D; --side-from:#16291F; --side-to:#0E1F18;
  --side-ink:#DCE5DE; --side-dim:#87998F; --side-sec:#6B7D74;
  --side-hover:rgba(255,255,255,.035); --side-on-bg:linear-gradient(90deg,rgba(169,51,31,.16),rgba(255,255,255,.02) 70%);
  --side-on-ink:#FFFFFF; --side-on-line:var(--wax); --side-edge:inset -1px 0 0 rgba(0,0,0,.35),1px 0 0 rgba(255,255,255,.03);
  --newbtn-bg:rgba(255,255,255,.05); --newbtn-line:rgba(220,229,222,.22);
  --newbtn-bg-h:rgba(255,255,255,.11); --newbtn-line-h:rgba(220,229,222,.36);
  --wordmark-ink:#FFFFFF; --wordmark-rule:rgba(220,229,222,.11);
  /* the editorial wordmark: serif caps, widely tracked */
  --wordmark-font:var(--font-serif); --wordmark-weight:600; --wordmark-ls:.15em;

  /* ---- role tokens ----
     A theme is not just a palette: what makes the Material surface read as
     Material is that the *type system* changes with it: sans display at
     weight 400, sentence-case 12px table headers, pill badges, sans stat
     figures. These roles let a theme restyle those without touching a rule.
     The values here are the editorial (paper) originals. */
  --h1-size:27px; --h1-weight:600; --h1-ls:-.018em;
  --th-font:var(--font-mono); --th-size:9.5px; --th-tt:uppercase; --th-ls:.13em; --th-weight:550;
  --k-font:var(--font-mono); --k-size:9.5px; --k-tt:uppercase; --k-ls:.14em; --k-weight:550;
  --badge-font:var(--font-mono); --badge-size:9.5px; --badge-tt:uppercase; --badge-ls:.11em;
  --badge-r:var(--r-xs); --badge-bd:1px; --badge-pad:3.5px 8px;
  --field-bg:var(--card); --field-bd:var(--line2); --field-r:var(--r-sm);
  --field-shadow:inset 0 1px 2px rgba(20,31,27,.04);
  --stat-v-font:var(--font-display); --stat-v-weight:600; --stat-v-size:29px;
  --card-bd:1px;
  --btn-bg:var(--card); --btn-ink:var(--ink); --btn-bd:1px solid var(--line2); --btn-fw:550;
  --nav-r:0; --nav-mx:0;
  /* M3 tonal roles: the active-nav pill, tonal buttons, selection */
  --p-container:var(--green-tint); --on-p-container:var(--green-deep);

  /* ---- layout metrics ----
     The shell reads these instead of hard numbers, so the phone→desktop
     escalation at the bottom of this file is a handful of token overrides
     rather than a second layout. --tap is the minimum comfortable touch
     target (WCAG 2.5.5 asks 44px); the safe-area insets keep content clear
     of the notch and home bar now that the viewport is viewport-fit=cover. */
  /* --topbar-h is the real height of the phone app bar (44px tap target plus
     6px above and below), because the notification sheet hangs off it */
  --gutter:14px; --tap:44px; --topbar-h:56px; --drawer-w:min(84vw,304px);
  --sat:env(safe-area-inset-top,0px); --sab:env(safe-area-inset-bottom,0px);
  --sal:env(safe-area-inset-left,0px); --sar:env(safe-area-inset-right,0px);

  /* radii */
  --r-xs:5px; --r-sm:7px; --r:10px; --r-lg:14px; --r-btn:var(--r-sm);

  /* elevation: tinted to the paper, never neutral grey */
  --shadow:0 1px 1px rgba(20,31,27,.04),0 1px 2px rgba(20,31,27,.05);
  --sh-2:0 1px 2px rgba(20,31,27,.04),0 4px 10px -2px rgba(20,31,27,.07);
  --sh-3:0 2px 4px rgba(20,31,27,.05),0 12px 28px -6px rgba(20,31,27,.13);
  --inset-hi:inset 0 1px 0 rgba(255,255,255,.09);
  --btn-shadow:var(--shadow); --card-shadow:var(--shadow);

  /* motion */
  --ease:cubic-bezier(.4,0,.2,1); --t:150ms;
}

/* ---- Material ------------------------------------------------------------
   Ported from the DOCKET Material prototype, values intact. Flat means
   elevation carries no shadow at rest: separation comes from surface tone,
   and the display face drops to weight 400, which is the thing that stops a
   Material page reading like a bolded editorial one. Table headers, stat
   keys and badges lose the mono uppercase and become sentence-case sans;
   fields fill with surface-variant; the nav marks its active item with a
   tonal pill instead of a wax edge. ------------------------------------- */
:root[data-theme="material"],:root[data-theme="material-dark"]{
  --font-display:var(--font-sans);
  --h1-size:28px; --h1-weight:400; --h1-ls:0;
  --r-xs:8px; --r-sm:12px; --r:16px; --r-lg:28px; --r-btn:999px;
  --th-font:var(--font-sans); --th-size:12px; --th-tt:none; --th-ls:.01em; --th-weight:500;
  --k-font:var(--font-sans); --k-size:12px; --k-tt:none; --k-ls:.01em; --k-weight:500;
  --badge-font:var(--font-sans); --badge-size:12px; --badge-tt:none; --badge-ls:.01em;
  --badge-r:999px; --badge-bd:0; --badge-pad:5px 12px;
  --field-bg:var(--paper-2); --field-bd:transparent; --field-r:var(--r-sm); --field-shadow:none;
  --stat-v-font:var(--font-sans); --stat-v-weight:500; --stat-v-size:30px;
  --card-bd:0; --card-shadow:none; --btn-shadow:none; --inset-hi:none;
  --btn-bg:var(--paper-2); --btn-ink:var(--ink); --btn-bd:0 solid transparent; --btn-fw:500;
  --nav-r:999px; --nav-mx:8px;
  --ease:cubic-bezier(.2,0,0,1); --t:180ms;   /* M3 emphasized easing */
  /* Material's primary is its green, as before the primary/positive split */
  --brand:var(--green); --brand-2:var(--green-2); --brand-deep:var(--green-deep);
  --brand-tint:var(--green-tint); --brand-ring:var(--green-ring);
  --side-on-bg:var(--p-container); --side-on-ink:var(--on-p-container); --side-on-line:transparent;
  --newbtn-bg:var(--p-container); --newbtn-line:transparent; --newbtn-line-h:transparent;
  --wordmark-ink:var(--on-p-container);
  /* Material sets the wordmark in its own display face, which is the sans. The
     sidebar used to use the serif while the login screen used the sans; both
     now agree. */
  --wordmark-font:var(--font-display); --wordmark-weight:500; --wordmark-ls:.08em;
}
:root[data-theme="material"]{
  --paper:#F6F5F9; --paper-2:#EDECF1; --card:#FFFFFF; --sunk:#F3F2F7;
  --ink:#1B1B1F; --muted:#46464F; --faint:#74747E;
  --line:#DFDEE4; --line2:#E9E8ED; --hair:#E9E8ED;
  --btn-hover:#E6E5EB;
  --topbar-bg:rgba(255,255,255,.92);
  --scrim:rgba(27,27,31,.46);
  --skel-hi:#F8F7FB;
  --tip-bg:#2F2E33; --tip-ink:#FFFFFF;
  --p-container:#CDE8D9; --on-p-container:#04291B;
  /* Pinned from the editorial palette. These four families used to arrive from
     :root while paper was the base; studio owns :root now, so the Material
     surface states them itself rather than inheriting indigo and rose. */
  --green:#245C48; --green-2:#2E7259; --green-deep:#12362A;
  --wax:#A9331F; --brass:#8A6A14;
  --seal-hi:#E0674C; --seal-core:#A9331F; --seal-crack:#7C2415;
  --green-tint:#CDE8D9; --green-ring:rgba(36,92,72,.2);
  --wax-tint:#F9E7E2; --brass-tint:#F6EFDC; --gold-ink:#75590E;
  /* filled buttons are flat in Material: one tone, no gradient, no edge */
  --pri-from:var(--green); --pri-to:var(--green); --pri-from-h:#2E7259; --pri-to-h:#2E7259; --pri-line:transparent;
  --wax-from:var(--wax); --wax-to:var(--wax); --wax-from-h:#C6402A; --wax-to-h:#C6402A; --wax-line:transparent;
  --chip-ok-line:transparent; --chip-warn-line:transparent; --chip-gold-line:transparent;
  --letter-bg:#F3F2F7; --ceremony-from:#F9E7E2; --ceremony-line:transparent;
  --addm-line:transparent; --unread-bg:#F3F2F7; --login-glow:#FFFFFF;
  --side:#FFFFFF; --side-from:#FFFFFF; --side-to:#FFFFFF;
  --side-ink:#1B1B1F; --side-dim:#46464F; --side-sec:#74747E;
  --side-hover:rgba(27,27,31,.05);
  --side-edge:inset -1px 0 0 #E9E8ED;
  --newbtn-bg-h:#BCDDCB;
  --wordmark-rule:#E9E8ED;
  --shadow:none; --sh-2:none; --sh-3:0 2px 10px rgba(0,0,0,.14);
}
/* Material dark: M3 dark neutrals with the tonal green inverted, so the
   primary reads *lighter* than its container rather than darker. */
:root[data-theme="material-dark"]{
  color-scheme:dark;
  --paper:#121216; --paper-2:#28272D; --card:#1C1B1F; --sunk:#1F1E23;
  --ink:#E5E1E6; --muted:#C6C4CD; --faint:#918F99;
  --line:#35343A; --line2:#2C2B31; --hair:#2C2B31;
  --on-brand:#06371F;
  --btn-hover:#33323A;
  --topbar-bg:rgba(18,18,22,.9);
  --scrim:rgba(0,0,0,.6);
  --skel-hi:#26252B;
  --tip-bg:#E5E1E6; --tip-ink:#1C1B1F;
  --primary:#8FD5B0;
  --green:#8FD5B0; --green-2:#ABF2CB; --green-deep:#ABF2CB;
  --p-container:#1F5340; --on-p-container:#ABF2CB;
  --green-tint:rgba(143,213,176,.16); --green-ring:rgba(143,213,176,.26);
  --wax:#F2B8A5; --wax-tint:rgba(242,184,165,.16);
  --brass:#E6CA84; --brass-tint:rgba(230,202,132,.15); --gold-ink:#F0DDA8;
  --pri-from:#8FD5B0; --pri-to:#8FD5B0; --pri-from-h:#A6E3C2; --pri-to-h:#A6E3C2; --pri-line:transparent;
  --wax-from:#F2B8A5; --wax-to:#F2B8A5; --wax-from-h:#F7CBBC; --wax-to-h:#F7CBBC; --wax-line:transparent;
  --chip-ok-line:rgba(143,213,176,.5); --chip-warn-line:rgba(242,184,165,.5); --chip-gold-line:rgba(230,202,132,.45);
  --letter-bg:#1F1E23; --ceremony-from:#2A2229; --ceremony-line:transparent;
  --addm-line:transparent; --unread-bg:#26252B; --login-glow:#1C1B1F;
  --seal-hi:#F7CBBC; --seal-core:#C9705A; --seal-crack:#5A2418;
  --side:#1C1B1F; --side-from:#1C1B1F; --side-to:#1C1B1F;
  --side-ink:#E5E1E6; --side-dim:#C6C4CD; --side-sec:#918F99;
  --side-hover:rgba(255,255,255,.06);
  --side-edge:inset -1px 0 0 #2C2B31;
  --newbtn-bg-h:#27614C;
  --wordmark-rule:#2C2B31;
  --shadow:none; --sh-2:none; --sh-3:0 2px 10px rgba(0,0,0,.5);
}

/* ---- night ledger: dark surfaces, brighter status hues (validated against
        the dark card surface), brass kept as the accent ---- */
:root[data-theme="night"]{
  color-scheme:dark;
  --paper:#0F1613; --paper-2:#0B120F; --card:#16211C; --sunk:#121B17;
  --ink:#E4EBE6; --muted:#A3B0A8; --faint:#7C8A83;
  --line:#253029; --line2:#35443C; --hair:rgba(228,235,230,.09);
  /* night's filled buttons are a dark green gradient, so the label on them has
     to be white: the near-black this used to be measured 2.45:1, which is
     unreadable and predates the studio palette. */
  --on-brand:#FFFFFF;
  --btn-hover:#1C2822;
  --topbar-bg:rgba(15,22,19,.86);
  --scrim:rgba(4,8,6,.62);
  --skel-hi:#1B2620;
  --tip-bg:#E4EBE6; --tip-ink:#0F1613;
  --green:#3FA97C; --green-2:#4FBE8C; --green-deep:#8FD9B6;
  --green-tint:rgba(63,169,124,.16); --green-ring:rgba(63,169,124,.26);
  /* night's primary is its green, as before the primary/positive split */
  --brand:var(--green); --brand-2:var(--green-2); --brand-deep:var(--green-deep);
  --brand-tint:var(--green-tint); --brand-ring:var(--green-ring);
  --wax:#D8664C; --wax-tint:rgba(216,102,76,.16);
  --brass:#D9B863; --brass-tint:rgba(217,184,99,.15); --gold-ink:#E6CA84;
  --pri-from:#2E7259; --pri-to:#245C48; --pri-from-h:#37866A; --pri-to-h:#2A6A52; --pri-line:#4FBE8C;
  --wax-from:#C2543C; --wax-to:#A9412C; --wax-from-h:#D06045; --wax-to-h:#B84832; --wax-line:#E4785C;
  --chip-ok-line:rgba(63,169,124,.5); --chip-warn-line:rgba(216,102,76,.5); --chip-gold-line:rgba(217,184,99,.45);
  --letter-bg:#1A241E; --ceremony-from:#22201C; --ceremony-line:#6B4436;
  --addm-line:#5C4B25; --unread-bg:#1B2620; --login-glow:#16211C;
  --seal-hi:#F08A6D; --seal-core:#C2543C; --seal-crack:#571A0F;
  --side:#0A100D; --side-from:#0C1410; --side-to:#070C0A;
  --side-ink:#D6E2DA; --side-dim:#8A9A91; --side-sec:#6E7E75;
  --side-hover:rgba(255,255,255,.05); --side-on-bg:linear-gradient(90deg,rgba(216,102,76,.2),rgba(255,255,255,.02) 70%);
  --side-on-ink:#FFFFFF; --side-on-line:var(--wax);
  --side-edge:inset -1px 0 0 rgba(0,0,0,.5);
  --wordmark-ink:#F2F7F4; --wordmark-rule:rgba(214,226,218,.13);
  --wordmark-font:var(--font-serif); --wordmark-weight:600; --wordmark-ls:.15em;
  --newbtn-bg:rgba(255,255,255,.06); --newbtn-line:rgba(214,226,218,.2);
  --newbtn-bg-h:rgba(255,255,255,.12); --newbtn-line-h:rgba(214,226,218,.34);
  --shadow:0 1px 2px rgba(0,0,0,.4);
  --sh-2:0 2px 6px rgba(0,0,0,.45);
  --sh-3:0 8px 26px -4px rgba(0,0,0,.6);
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
.chromeacts{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px;
  padding:12px var(--gutter) 0;border-top:1px solid var(--wordmark-rule)}
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
   uppercase label clears WCAG AA on the badge, in every theme. The unprefixed
   set belongs to whichever theme owns :root, so this one is studio.

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
/* paper keeps the editorial set it always had */
:root[data-theme="paper"] .st-draft{--st-fg:#4E5852;--st-bg:#ECEBE3}
:root[data-theme="paper"] .st-approval{--st-fg:#75590E;--st-bg:#F6EFDC}
:root[data-theme="paper"] .st-published{--st-fg:#1E5240;--st-bg:#E1EDE6}
:root[data-theme="paper"] .st-closed{--st-fg:#962B19;--st-bg:#F8E8E2}
:root[data-theme="paper"] .st-evaluation{--st-fg:#0E3527;--st-bg:#DBE8E0}
:root[data-theme="paper"] .st-awarded{--st-fg:#6B5215;--st-bg:#F3ECD9}
/* Material maps the lifecycle onto the prototype's reserved status roles:
   neutral / warn / ok / crit, plus a primary-tonal for evaluation and a
   deeper brass for the awarded terminal state so it never reads as "pending". */
:root[data-theme="material"] .st-draft{--st-fg:#46464F;--st-bg:#EDECF1}
:root[data-theme="material"] .st-approval{--st-fg:#75590E;--st-bg:#F6EFDC}
:root[data-theme="material"] .st-published{--st-fg:#1E5240;--st-bg:#DCEDE4}
:root[data-theme="material"] .st-closed{--st-fg:#962B19;--st-bg:#F9E7E2}
:root[data-theme="material"] .st-evaluation{--st-fg:#04291B;--st-bg:#CDE8D9}
:root[data-theme="material"] .st-awarded{--st-fg:#4A3A0C;--st-bg:#EFE3BE}
:root[data-theme="material-dark"] .st-draft{--st-fg:#C6C4CD;--st-bg:#33323A}
:root[data-theme="material-dark"] .st-approval{--st-fg:#E6CA84;--st-bg:#3A3218}
:root[data-theme="material-dark"] .st-published{--st-fg:#8FD5B0;--st-bg:#1F3D30}
:root[data-theme="material-dark"] .st-closed{--st-fg:#F2B8A5;--st-bg:#43281F}
:root[data-theme="material-dark"] .st-evaluation{--st-fg:#ABF2CB;--st-bg:#1F5340}
:root[data-theme="material-dark"] .st-awarded{--st-fg:#F0DDA8;--st-bg:#453A18}
:root[data-theme="night"] .st-draft{--st-fg:#C3CDC7;--st-bg:rgba(195,205,199,.14)}
:root[data-theme="night"] .st-approval{--st-fg:#E6CA84;--st-bg:rgba(217,184,99,.16)}
:root[data-theme="night"] .st-published{--st-fg:#6FD3A6;--st-bg:rgba(63,169,124,.18)}
:root[data-theme="night"] .st-closed{--st-fg:#F09479;--st-bg:rgba(216,102,76,.18)}
:root[data-theme="night"] .st-evaluation{--st-fg:#8FD9B6;--st-bg:rgba(63,169,124,.14)}
:root[data-theme="night"] .st-awarded{--st-fg:#E6CA84;--st-bg:rgba(217,184,99,.14)}
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
.frow{margin-bottom:14px}
/* a row of fields that is a column on a phone: the workspace rename, the
   supplier profile, the compliance-document uploader */
.formrow{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end}
.formrow>.frow{flex:1 1 100%;margin-bottom:0}
.formrow>.in{flex:1 1 100%}
.formrow>.btn,.formrow>label.btn{flex:1 1 auto;justify-content:center}
/* line item: description on its own row, then qty · unit · remove */
.lineedit{display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:center;margin-bottom:10px}
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
  .lineedit{grid-template-columns:1fr 100px 120px auto}
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
/* --- Material control behaviour, mirroring the prototype ---------------- */
[data-theme^="material"] .btn{position:relative;overflow:hidden;letter-spacing:.005em;padding:9px 18px}
[data-theme^="material"] .btn.sm{padding:6px 13px;font-size:12.5px}
/* the press ripple, and M3's tonal active state underneath it */
[data-theme^="material"] .btn::after{content:"";position:absolute;inset:0;pointer-events:none;border-radius:inherit;
  background:radial-gradient(circle at center,currentColor 14%,transparent 14.5%);
  opacity:0;transform:scale(.35);transition:transform .5s var(--ease),opacity .55s var(--ease)}
[data-theme^="material"] .btn:active::after{opacity:.16;transform:scale(2.8);transition-duration:0s,0s}
[data-theme^="material"] .btn:active{transform:none;background:var(--p-container);color:var(--on-p-container)}
[data-theme^="material"] .btn.pri{background:var(--green);color:var(--on-brand);border:0}
[data-theme^="material"] .btn.pri:active{filter:brightness(1.12);background:var(--green);color:var(--on-brand)}
[data-theme^="material"] .btn.wax{background:var(--wax);color:var(--on-brand);border:0}
[data-theme^="material"] .btn.wax:active{filter:brightness(1.12);background:var(--wax);color:var(--on-brand)}
[data-theme^="material"] .btn:disabled{opacity:.38}
/* filled fields: the focus ring is an inner stroke, not an outer glow */
[data-theme^="material"] .in:focus,[data-theme^="material"] .dk textarea:focus,
[data-theme^="material"] .dk select.in:focus{border-color:var(--green);
  box-shadow:inset 0 0 0 1px var(--green)}
/* navigation drawer of pills */
[data-theme^="material"] .navi{width:auto;border-left:0;border-radius:var(--nav-r);
  margin:2px var(--nav-mx);padding:9px 15px;font-weight:500}
[data-theme^="material"] .navi.on{font-weight:600}
[data-theme^="material"] .newbtn{border-radius:var(--r-btn);font-weight:500;color:var(--on-p-container)}
[data-theme^="material"] .side{padding-top:16px}
[data-theme^="material"] .tbl td{padding:12px}
[data-theme^="material"] .tbl th{border-bottom-color:var(--line)}
[data-theme^="material"] .tab.on{border-bottom-width:3px;border-bottom-color:var(--green)}
[data-theme^="material"] .stat{border-radius:var(--r-lg)}
[data-theme^="material"] .stamp{font-weight:500}
[data-theme^="material"] .chip{border-radius:999px}
/* flat means flat: no letterpress edge on the seal, no dashed ceremony frame */
[data-theme^="material"] .wordmark .seal{box-shadow:0 0 0 2.5px color-mix(in srgb,var(--seal-hi) 26%,transparent)}
[data-theme^="material"] .ceremony{border-style:solid;border-width:0;border-radius:var(--r-lg)}
[data-theme^="material"] .receipt{border-width:0;border-radius:var(--r-lg);background:var(--paper-2)}
[data-theme^="material"] .letter,[data-theme^="material"] .aihint,[data-theme^="material"] .addm{
  border-width:0;border-left-width:3px;border-radius:var(--r-xs)}
[data-theme^="material"] .dlg{border:0}
/* night: paper objects need a touch more edge definition on dark surfaces */
:root[data-theme="night"] .letter,:root[data-theme="night"] .aihint{border-color:var(--line2)}
:root[data-theme="night"] .ceremony{background:var(--ceremony-from)}
:root[data-theme="night"] .receipt{background:var(--card)}

/* Material's hover tones, gated with the rest of them: a tap on a phone must
   not leave the control it landed on looking permanently hovered. */
@media(hover:hover) and (pointer:fine){
  [data-theme^="material"] .btn:hover{background:var(--btn-hover)}
  [data-theme^="material"] .btn.pri:hover{background:var(--pri-from-h)}
  [data-theme^="material"] .btn.wax:hover{background:var(--wax-from-h)}
  [data-theme^="material"] .in:hover,[data-theme^="material"] .dk textarea:hover{border-color:transparent;background:var(--sunk)}
  [data-theme^="material"] .navi:hover{background:var(--paper-2)}
  [data-theme^="material"] .navi.on:hover{background:var(--p-container)}
}
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
