import { BP } from "./breakpoints";
import { syncThemeChrome } from "./theme";

export function applyLayout(id) {
  if (id === "studio") document.documentElement.dataset.layout = "studio";
  else delete document.documentElement.dataset.layout;
  syncThemeChrome();
}

/* THE ACCENT, AND WHY IT IS A SECOND ATTRIBUTE RATHER THAN A SECOND LAYOUT.
   Studio is a whole look — a typeface, a radius scale, a set of surfaces. The
   accent is ten tokens inside it. Making each colour its own layout would mean
   six copies of the other ninety tokens, and the day one of them is edited the
   six stop agreeing. So the accent layers on top and overrides only the brand
   family; everything else is inherited from the layout beneath it.

   EVERY OPTION IS MEASURED, NOT PICKED. The accent does three jobs and each
   has a floor: it carries text on white (>=4.5:1), it is a FILL under white
   button text (>=4.5:1 the other way), and its dark-mode step carries text on
   #161618 (>=4.5:1). Those are three different colours, which is why each
   entry below is a triple rather than a hex.

   The house green is absent on purpose. #00A651 measures 3.19:1 under white
   text — it is a fine mark and an unreadable button, which is the same finding
   styles.js already records for the main theme. `forest` is that green taken
   down to a step that passes, and it is the closest thing here to the brand.

   Listed in the order the Mac lists its own accent colours, so the picker
   reads as a spectrum rather than in the order they were added. The same rule
   is why there is no bright yellow: white text on any yellow a reader would
   call yellow measures under 2:1, so `gold` is the deepest step that still
   reads as gold and passes. */
export const ACCENTS = [
  { key: "blue",     label: "Blue",     hex: "#0071e3",
    note: "The Apple blue. Calm, familiar, and says nothing in particular." },
  { key: "indigo",   label: "Indigo",   hex: "#5a4ef0",
    note: "The loudest option that still passes everywhere. Reads as software." },
  { key: "purple",   label: "Purple",   hex: "#8a44cc",
    note: "Confident, and far from every colour the interface uses for a status." },
  { key: "pink",     label: "Pink",     hex: "#d12a66",
    note: "Warm and modern. It sits near the red used for refusals, so it is lively rather than calm." },
  { key: "crimson",  label: "Crimson",  hex: "#cc2a44",
    note: "Deliberate. Note that the interface already uses red for refusals." },
  { key: "orange",   label: "Orange",   hex: "#c4480c",
    note: "Energetic. Close to the amber used for \"waiting\", so status pills lean on their words." },
  { key: "gold",     label: "Gold",     hex: "#9a6700",
    note: "Warm and premium. A deep gold, because white text on a bright yellow cannot be read." },
  { key: "forest",   label: "Forest",   hex: "#138354",
    note: "The house green taken down to a step that survives white text on it." },
  { key: "teal",     label: "Teal",     hex: "#118080",
    note: "Cooler than the green and further from every other procurement tool." },
  { key: "graphite", label: "Graphite", hex: "#1d1d1f",
    note: "No accent at all. The most restrained, and the most Apple." },
];
export const ACCENT_KEYS = ACCENTS.map((a) => a.key);
export const DEFAULT_ACCENT = "blue";

/** Always a real accent, so a stored key that has since been removed paints
    the default rather than leaving the brand tokens undefined. */
export function accentOf(key) {
  return ACCENTS.find((a) => a.key === key) || ACCENTS[0];
}

/** Blue is the block already written on [data-layout="studio"], so it is
    applied by REMOVING the attribute — the same trick theme.js uses for light,
    and for the same reason: the default must not depend on a second block
    that could drift from the first. */
export function applyAccent(id) {
  const root = document.documentElement;
  root.dataset.accent = ACCENT_KEYS.includes(id) ? id : DEFAULT_ACCENT;
}

// Deployment layout, independent of the reader's light/dark preference.
export const STUDIO_CSS = `
/* ================================================================ studio
   The Apple look. Every rule here is scoped to [data-layout="studio"], so the
   other appearances, and everything the interface DOES, are untouched: this is
   surfaces, type and shape, nothing else.

   What it takes from apple.com and the Mac, deliberately:

   SAN FRANCISCO WHERE IT EXISTS, INTER EVERYWHERE ELSE. -apple-system is SF on
   a Mac, an iPhone and an iPad. Windows and Android have no SF and Apple's
   licence does not let it ship to them, so the stack falls to Inter, the open
   face closest to SF in width, x-height and rhythm. This used to fall to
   Geist, which is narrower and squarer, and that one substitution was most of
   why the layout read as "not quite Apple" on a Windows laptop.

   #F5F5F7 BEHIND WHITE TILES. No visible borders on anything that holds
   content, soft shadows instead, 18px corners. Pill buttons: the accent for
   the one main action, a quiet grey fill for the rest, no gradients and no
   lift on hover. A frosted bar the page scrolls under. A light sidebar with
   rounded selections and accent-coloured glyphs, the way Finder draws one.

   CONTRAST STAYS AT AA. Secondary text is #6E6E73 rather than apple.com's
   #86868B, which measures under 4.5:1 at the sizes a workspace is read at. */
:root[data-layout="studio"]{
  --font-sans:-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter Variable','Helvetica Neue',Helvetica,Arial,sans-serif;
  --font-display:-apple-system,BlinkMacSystemFont,'SF Pro Display','Inter Variable','Helvetica Neue',Helvetica,Arial,sans-serif;
  --font-serif:var(--font-sans);--font-mono:var(--font-sans);--wordmark-font:var(--font-display);
  --h1-weight:700;--h1-ls:-.028em;--h1-size:40px;--stat-v-weight:600;--stat-v-size:30px;
  --th-font:var(--font-sans);--th-size:12px;--th-weight:600;--th-ls:0;--th-tt:none;
  --k-font:var(--font-sans);--k-size:12px;--k-weight:500;--k-ls:0;--k-tt:none;
  --badge-font:var(--font-sans);--badge-size:11.5px;--badge-weight:600;--badge-ls:0;--badge-tt:none;
  --badge-pad:3px 10px;--badge-r:999px;--badge-bd:0;
  --wordmark-weight:600;--wordmark-ls:-.02em;--btn-fw:500;
  --brand-ring:rgba(0,113,227,.25);--hair:#ececf0;--bar-line:rgba(0,0,0,.08);
  --green:#247344;--green-2:#27834d;--green-deep:#175630;--green-tint:#eaf5ed;--green-ring:rgba(36,115,68,.2);
  --wax:#b42324;--wax-tint:#fff0ef;--wax-from:#b42324;--wax-to:#b42324;--wax-from-h:#9a191b;--wax-to-h:#9a191b;--wax-line:#b42324;
  --brass:#885400;--gold-ink:#885400;--brass-tint:#fff4df;
  --chip-ok-line:#c7e3cf;--chip-warn-line:#f1c6c3;--chip-gold-line:#ebd7b4;
  --letter-bg:#f5f5f7;--ceremony-from:#fff0ef;--ceremony-line:#f1c6c3;--addm-line:#ebd7b4;
  --unread-bg:#edf4ff;--login-glow:#fff;--skel-hi:#e8e8ed;
  --seal-hi:#b5d8ff;--seal-core:#0071e3;--seal-crack:#003f7d;
  --scrim:rgba(0,0,0,.3);--tip-bg:#1d1d1f;--tip-ink:#fff;
  --field-bg:#fff;--field-bd:#d2d2d7;--field-bd-h:#86868b;--field-r:12px;--field-shadow:none;
  --shadow:0 1px 2px rgba(0,0,0,.04);
  --card-shadow:0 2px 12px rgba(0,0,0,.05);--card-shadow-hi:0 8px 28px rgba(0,0,0,.1);
  --sh-2:0 4px 18px rgba(0,0,0,.07);--sh-3:0 24px 70px rgba(0,0,0,.2),0 2px 8px rgba(0,0,0,.05);
  --inset-hi:0 0 0 transparent;
  --r:18px;--radius-lg:18px;--r-btn:980px;--r-xs:8px;--r-sm:12px;--r-md:18px;--r-lg:22px;
  --paper:#f5f5f7;--paper-2:#e8e8ed;--card:#fff;--sunk:#f5f5f7;
  --ink:#1d1d1f;--muted:#6e6e73;--faint:#6e6e73;--line:#e5e5ea;--line2:#d2d2d7;
  --brand:#0066cc;--brand-2:#0066cc;--brand-deep:#004d99;--brand-tint:#e7f1ff;
  --pri-from:#0071e3;--pri-to:#0071e3;--pri-from-h:#0077ed;--pri-to-h:#0077ed;
  --pri-line:#0071e3;--pri-glow:rgba(0,113,227,.13);--on-brand:#fff;
  --fill:rgba(118,118,128,.12);--fill-h:rgba(118,118,128,.2);
  --btn-bg:var(--fill);--btn-ink:var(--ink);--btn-bd:1px solid transparent;--btn-shadow:none;--btn-hover:var(--fill-h);
  --topbar-bg:rgba(245,245,247,.8);--menu-bg:rgba(255,255,255,.97);
  --side:#fbfbfd;--side-from:#fbfbfd;--side-to:#fbfbfd;
  --side-ink:#1d1d1f;--side-dim:#1d1d1f;--side-sec:#6e6e73;
  --side-hover:rgba(0,0,0,.045);--side-on-line:transparent;
  --side-edge:inset -1px 0 0 rgba(0,0,0,.08);--wordmark-ink:#1d1d1f;--wordmark-rule:transparent;
}
:root[data-layout="studio"][data-theme="dark"]{
  --brand-ring:rgba(128,186,255,.3);--hair:#2c2c2e;--bar-line:rgba(255,255,255,.09);
  --green:#86d6a1;--green-2:#86d6a1;--green-deep:#afe7c2;--green-tint:#21382b;--green-ring:rgba(134,214,161,.23);
  --wax:#ffb4ad;--wax-tint:#422526;--wax-from:#ffb4ad;--wax-to:#ffb4ad;--wax-from-h:#ffc9c4;--wax-to-h:#ffc9c4;--wax-line:#ffb4ad;
  --brass:#e8bd75;--gold-ink:#e8bd75;--brass-tint:#3a3022;
  --chip-ok-line:#395e45;--chip-warn-line:#74423f;--chip-gold-line:#655234;
  --letter-bg:#2c2c2e;--ceremony-from:#422526;--ceremony-line:#74423f;--addm-line:#655234;
  --unread-bg:#203650;--login-glow:#1c1c1e;--skel-hi:#3a3a3c;
  --seal-hi:#d2e7ff;--seal-core:#80baff;--seal-crack:#183e69;
  --scrim:rgba(0,0,0,.55);--tip-bg:#f5f5f7;--tip-ink:#1d1d1f;
  --field-bg:#2c2c2e;--field-bd:#3a3a3c;--field-bd-h:#636366;
  --shadow:none;--card-shadow:none;--card-shadow-hi:0 0 0 1px #3a3a3c;
  --sh-2:0 6px 24px rgba(0,0,0,.5);--sh-3:0 24px 80px rgba(0,0,0,.7),0 0 0 1px rgba(255,255,255,.07);
  --paper:#000;--paper-2:#1c1c1e;--card:#1c1c1e;--sunk:#2c2c2e;
  --ink:#f5f5f7;--muted:#a1a1a6;--faint:#98989d;--line:#38383a;--line2:#48484a;
  --brand:#80baff;--brand-2:#80baff;--brand-deep:#b6d7ff;--brand-tint:#203650;
  --pri-from:#80baff;--pri-to:#80baff;--pri-from-h:#acd2ff;--pri-to-h:#acd2ff;
  --pri-line:#80baff;--on-brand:#082343;
  --fill:rgba(118,118,128,.24);--fill-h:rgba(118,118,128,.36);
  --topbar-bg:rgba(22,22,23,.8);--menu-bg:rgba(44,44,46,.97);
  --side:#161617;--side-from:#161617;--side-to:#161617;
  --side-ink:#f5f5f7;--side-dim:#f5f5f7;--side-sec:#98989d;
  --side-hover:rgba(255,255,255,.06);
  --side-edge:inset -1px 0 0 rgba(255,255,255,.08);--wordmark-ink:#f5f5f7;
}
/* The selection in the sidebar is the Mac's: a grey capsule, the label in
   ink, the glyph in the accent. Stated with [data-accent] so it outranks the
   accent blocks below, which would otherwise tint the capsule. */
:root[data-layout="studio"][data-accent]{--side-on-bg:rgba(0,0,0,.07);--side-on-ink:#1d1d1f}
:root[data-layout="studio"][data-accent][data-theme="dark"]{--side-on-bg:rgba(255,255,255,.1);--side-on-ink:#f5f5f7}
/* Dark, in the default blue: Apple keeps the button the same #0071E3 with white
   text and lifts only links, to #2997FF. The accent block below would paint the
   button pale blue with navy text instead, which is right for the other accents
   and reads as a disabled control in this one. */
:root[data-layout="studio"][data-accent="blue"][data-theme="dark"]{
  --pri-from:#0071e3;--pri-to:#0071e3;--pri-from-h:#0077ed;--pri-to-h:#0077ed;--pri-line:#0071e3;--on-pri:#fff;
  --brand:#2997ff;--brand-2:#2997ff;--brand-deep:#6cb6ff;--seal-core:#2997ff}
:root[data-layout="studio"][data-accent="blue"][data-theme="dark"] .st-page .st-button{color:#fff}

/* ---------------------------------------------------------------- type */
:root[data-layout="studio"] body{font-family:var(--font-sans);background:var(--paper);color:var(--ink);-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}
:root[data-layout="studio"] :is(button,input,select,textarea){font-family:var(--font-sans)}
:root[data-layout="studio"] :is(.dk,.loginwrap){letter-spacing:-.011em;font-optical-sizing:auto}
:root[data-layout="studio"] :is(.mono,.money,.stat .v){font-variant-numeric:tabular-nums;letter-spacing:-.01em}
/* Real code keeps a real monospace: ui-monospace is SF Mono on Apple, and
   Geist Mono is bundled for everywhere else. The interface itself stays in
   the sans with tabular figures, which is how Apple sets money, and is why
   --font-mono above points at the sans rather than at this. */
:root[data-layout="studio"] :is(code,pre){font-family:ui-monospace,SFMono-Regular,'SF Mono',Menlo,'Geist Mono Variable',Consolas,monospace}
:root[data-layout="studio"] :is(h1,h2,h3,.guidehl,.pn,.dlg h3){font-family:var(--font-display)}
:root[data-layout="studio"] :is(.card h2,.card h3,.guidehl,.pn){font-weight:600;letter-spacing:-.022em}
:root[data-layout="studio"] .pagehead{border-bottom:0;padding-bottom:0;margin-bottom:26px}
:root[data-layout="studio"] .pagehead h1{font-size:clamp(30px,3.1vw,40px);font-weight:700;letter-spacing:-.028em;line-height:1.08}
:root[data-layout="studio"] .pagehead .sub{font-size:15px;color:var(--muted);letter-spacing:-.016em}
:root[data-layout="studio"] .lbl{font-size:13px;font-weight:600;color:var(--ink);letter-spacing:-.01em}
:root[data-layout="studio"] .hint{color:var(--muted)}
:root[data-layout="studio"] :is(.adminmark,.ptag){text-transform:none;letter-spacing:0;font-size:12px}

/* ---------------------------------------------------------------- shell */
:root[data-layout="studio"] .side{background:var(--side);box-shadow:var(--side-edge)}
:root[data-layout="studio"] .side.open{box-shadow:var(--sh-3)}
:root[data-layout="studio"] .wordmark{border-bottom:0;margin-bottom:2px}
:root[data-layout="studio"] .orgline{color:var(--muted)}
:root[data-layout="studio"] .navsec{font-size:12px;font-weight:600;color:var(--side-sec)}
:root[data-layout="studio"] .side .navlist{margin:0 10px}
:root[data-layout="studio"] .side .navi{border:0;border-radius:10px;padding:11px 12px;margin:1px 0;min-height:44px;
  color:var(--side-dim);font-weight:500}
:root[data-layout="studio"] .side .navi :is(svg,.ic){color:var(--brand)}
:root[data-layout="studio"] .side .navi.on{color:var(--side-on-ink);background:var(--side-on-bg);font-weight:600}
:root[data-layout="studio"] .navind{display:none}
:root[data-layout="studio"] .newbtn{border:0;border-radius:980px;gap:6px;background:var(--pri-from);color:var(--on-pri,var(--on-brand));
  font-weight:500;box-shadow:none}
:root[data-layout="studio"] .newbtn :is(svg,.ic){color:inherit}
:root[data-layout="studio"] .newbtn:hover{background:var(--pri-from-h);border-color:transparent}
:root[data-layout="studio"] .sidefoot{color:var(--faint)}
:root[data-layout="studio"] .topbar{background:var(--topbar-bg);
  -webkit-backdrop-filter:saturate(180%) blur(20px);backdrop-filter:saturate(180%) blur(20px);
  border-bottom:1px solid var(--bar-line);box-shadow:none}
:root[data-layout="studio"] .topbar .crumb{font-size:12px;font-weight:500;letter-spacing:.02em;color:var(--muted)}
:root[data-layout="studio"] .topbar .btn{white-space:nowrap}
:root[data-layout="studio"] .iconbtn{border-radius:999px}
:root[data-layout="studio"] .iconbtn:hover{background:var(--fill);border-color:transparent}
/* A monogram, the way Contacts draws one: grey, white initials. The account
   button's avatar had no style of its own outside the drawer and rendered as
   two bare letters. */
:root[data-layout="studio"] .dk .avatar{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;
  width:30px;height:30px;border-radius:50%;font-size:11.5px;font-weight:600;letter-spacing:.02em;color:#fff;
  background:linear-gradient(180deg,#a5a5ab,#85858b);box-shadow:none}
:root[data-layout="studio"] .dk .avatar.lg{width:40px;height:40px;font-size:14px}
:root[data-layout="studio"] .acctbtn{font-weight:500;border-radius:980px}
:root[data-layout="studio"] .acctbtn:hover,:root[data-layout="studio"] .acctbtn.on{background:var(--fill);border-color:transparent}

/* ---------------------------------------------------------------- tiles */
:root[data-layout="studio"] .card{border-color:transparent;border-radius:18px;box-shadow:var(--card-shadow)}
:root[data-layout="studio"] .loginwrap .card{box-shadow:var(--sh-3)}
:root[data-layout="studio"] .card .chead{border-bottom:0;padding:16px 16px 10px}
:root[data-layout="studio"] .card .chead h3{font-size:17px;font-weight:600;letter-spacing:-.022em}
:root[data-layout="studio"] .cbody{padding:16px}
:root[data-layout="studio"] .card .chead + .cbody{padding-top:4px}
:root[data-layout="studio"] .stat{border-color:transparent;border-radius:18px;box-shadow:var(--card-shadow)}
:root[data-layout="studio"] .stat .k{font-size:13px;font-weight:500;color:var(--muted)}
:root[data-layout="studio"] .stat .v{font-weight:600;letter-spacing:-.028em}
:root[data-layout="studio"] .statlink:hover{border-color:transparent;box-shadow:var(--card-shadow-hi)}
:root[data-layout="studio"] .guidebox{border-radius:18px;background:var(--card);box-shadow:var(--card-shadow)}
:root[data-layout="studio"] .guidebox:not(.good):not(.bad){border-color:transparent}
:root[data-layout="studio"] .guidetop{border-bottom-color:var(--hair)}
:root[data-layout="studio"] .guidefoot{border-top-color:var(--hair)}
:root[data-layout="studio"] .guidehl{font-size:19px;font-weight:600;letter-spacing:-.022em}
:root[data-layout="studio"] .figures{background:var(--hair);border-top-color:var(--hair)}
/* Figures standing on the page rather than in a guide's foot are a tile. */
:root[data-layout="studio"] .pgmain>.figures{border-top:0;border-radius:18px;overflow:hidden;box-shadow:var(--card-shadow);margin-bottom:16px}
:root[data-layout="studio"] .quietn{font-weight:600;letter-spacing:-.025em}
:root[data-layout="studio"] .lrow{border-bottom-color:var(--hair)}
:root[data-layout="studio"] :is(.notice,.qa){border-color:transparent;border-radius:12px;background:var(--sunk)}
:root[data-layout="studio"] :is(.aihint,.letter,.addm,.sealrow){border-radius:12px}
:root[data-layout="studio"] :is(.menu,.ndrop,.designcard){border-radius:14px}
:root[data-layout="studio"] .adv{border-color:transparent;border-radius:18px;box-shadow:var(--card-shadow)}
:root[data-layout="studio"] .adv .cbody{border-top-color:var(--hair)}
:root[data-layout="studio"] .adv summary{font-size:15px;letter-spacing:-.016em}
:root[data-layout="studio"] .studio-preview{background:var(--paper);border-color:var(--line)}
:root[data-layout="studio"] .studio-preview>span:first-child{background:var(--paper-2)}
:root[data-layout="studio"] .studio-preview i{background:var(--card);border-color:var(--line)}
:root[data-layout="studio"] .illus{--il-tint:var(--brand-tint);--il-ink:var(--brand);--il-ink-2:var(--brand-deep);--il-paper:var(--card);--il-line:var(--line2);--il-cool:var(--brand);--il-warm:var(--faint)}
:root[data-layout="studio"][data-theme="dark"] .illus{--il-ink:var(--ink);--il-ink-2:var(--faint);--il-line:var(--muted)}
:root[data-layout="studio"] .loginwrap{background:var(--paper)}
/* Keep the admin console's document layout instead of the workspace shell. */
:root[data-layout="studio"] .adminroot .content{background:var(--paper)}

/* ---------------------------------------------------------------- controls */
:root[data-layout="studio"] .btn{border:1px solid transparent;border-radius:980px;background:var(--btn-bg);
  color:var(--btn-ink);box-shadow:none;font-weight:500;letter-spacing:-.01em}
:root[data-layout="studio"] .btn.pri{background:var(--pri-from);border-color:transparent;color:var(--on-pri,var(--on-brand));box-shadow:none}
:root[data-layout="studio"] .btn.wax{background:var(--wax-from);border-color:transparent;color:var(--on-brand);box-shadow:none}
:root[data-layout="studio"] .btn.ghost{background:transparent;border-color:var(--line2)}
:root[data-layout="studio"] .btn.ghost[aria-pressed=true]{background:var(--fill);border-color:transparent;color:var(--ink)}
:root[data-layout="studio"] .anrange .btn.on{background:var(--ink);border-color:transparent;color:var(--card)}
:root[data-layout="studio"] .bellwrap .btn.hasnew{background:rgba(255,59,48,.1);border-color:transparent;color:#c4000f}
:root[data-layout="studio"][data-theme="dark"] .bellwrap .btn.hasnew{background:rgba(255,69,58,.18);color:#ff8a82}
:root[data-layout="studio"] :is(.in,.dk textarea,.dk select){background:var(--field-bg);border-color:var(--field-bd);
  border-radius:12px;box-shadow:none}
:root[data-layout="studio"] :is(.in,.dk textarea,.dk select):focus{border-color:var(--pri-from);box-shadow:0 0 0 4px var(--brand-ring)}
:root[data-layout="studio"] .chip{border-color:transparent}
:root[data-layout="studio"] .chip:not(.warn):not(.ok):not(.gold){background:var(--fill);color:var(--ink)}
:root[data-layout="studio"] .stamp{border:0;border-radius:999px}
:root[data-layout="studio"] .deskchip{border-color:transparent;background:var(--fill);color:var(--ink)}
:root[data-layout="studio"] .deskchip.on{background:var(--ink);color:var(--card)}
:root[data-layout="studio"] .deskchip.on b{color:inherit}
/* The Mac's segmented control: a recessed grey track, the chosen segment a
   raised white capsule. */
:root[data-layout="studio"] :is(.segmented,.antabs){background:var(--fill);border:0;border-radius:9px;padding:2px;gap:2px}
:root[data-layout="studio"] :is(.segmented button,.antab){border-radius:7px;color:var(--ink)}
:root[data-layout="studio"] :is(.segmented button.on,.antab.on){background:var(--card);color:var(--ink);font-weight:600;
  box-shadow:0 3px 8px rgba(0,0,0,.12),0 3px 1px rgba(0,0,0,.04)}
:root[data-layout="studio"][data-theme="dark"] :is(.segmented button.on,.antab.on){background:#636366}
:root[data-layout="studio"] .tabs{border-bottom-color:var(--line)}
:root[data-layout="studio"] .tab{font-size:14px;font-weight:500;letter-spacing:-.012em;color:var(--muted)}
:root[data-layout="studio"] .tab.on{color:var(--ink);border-bottom-color:var(--ink)}
/* The stage tracker in sentence case and the interface face, not spaced
   capitals in a typewriter one. */
:root[data-layout="studio"] :is(.stg .sk,.stg .sd){font-family:var(--font-sans);text-transform:none;letter-spacing:0;font-size:12px}
:root[data-layout="studio"] .stg .sd{font-size:11.5px}
:root[data-layout="studio"] .dlbl{text-transform:none;letter-spacing:0;font-size:12px}

/* ---------------------------------------------------------------- lists */
:root[data-layout="studio"] .tbl th{font-size:12px;font-weight:600;color:var(--muted);border-bottom-color:var(--line)}
:root[data-layout="studio"] .tbl td{border-bottom-color:var(--hair)}
:root[data-layout="studio"] .wq{border-bottom-color:var(--hair)}
:root[data-layout="studio"] .rowline{border-bottom-color:var(--hair)}

/* ---------------------------------------------------------------- layers
   Menus and the notification sheet are frosted like a Mac menu, and the row
   under the pointer takes the accent with white text, as it does there. They
   are nearly opaque on purpose: the account menu and the bell hang from the
   top bar, which has a backdrop filter of its own, and a backdrop filter
   inside another one cannot see the page beneath, so a translucent menu there
   showed the page through it unblurred. */
:root[data-layout="studio"] :is(.menu,.ndrop,.itemdrop){background:var(--menu-bg);
  -webkit-backdrop-filter:saturate(180%) blur(30px);backdrop-filter:saturate(180%) blur(30px);
  border:1px solid var(--bar-line);box-shadow:0 12px 40px rgba(0,0,0,.18)}
:root[data-layout="studio"] .mitem{border-radius:8px}
:root[data-layout="studio"] .mitem:hover{background:var(--pri-from);color:var(--on-pri,var(--on-brand))}
:root[data-layout="studio"] .mitem:hover .ic{color:inherit}
:root[data-layout="studio"] :is(.scrim,.panelwrap,.navscrim){-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}
:root[data-layout="studio"] .dlg{border:0;box-shadow:var(--sh-3)}
:root[data-layout="studio"] .dlg h3{font-size:20px;font-weight:600;letter-spacing:-.022em}
:root[data-layout="studio"] .toast{--tone:var(--green);border:0;border-radius:14px;background:var(--menu-bg);
  -webkit-backdrop-filter:saturate(180%) blur(30px);backdrop-filter:saturate(180%) blur(30px);
  box-shadow:inset 3px 0 0 var(--tone),0 12px 40px rgba(0,0,0,.16),0 0 0 1px var(--bar-line)}
:root[data-layout="studio"] .toast.warn{--tone:var(--wax)}
:root[data-layout="studio"] .toast.info{--tone:var(--brass)}

/* ---------------------------------------------------------------- the ladder */
@media(min-width:${BP.tab}px){
  :root[data-layout="studio"] .card .chead{padding:20px 22px 12px}
  :root[data-layout="studio"] .card .chead h3{font-size:17px}
  :root[data-layout="studio"] .cbody{padding:20px 22px 22px}
  :root[data-layout="studio"] .card .chead + .cbody{padding-top:4px}
  :root[data-layout="studio"] .stat{padding:18px 20px}
  :root[data-layout="studio"] .btn{padding:8px 16px}
  :root[data-layout="studio"] .btn.sm{padding:6px 13px}
  :root[data-layout="studio"] :is(.in,.dk textarea,.dk select.in){padding:9px 13px}
  :root[data-layout="studio"] .tbl :is(th,td){padding-top:11px;padding-bottom:11px}
  :root[data-layout="studio"] .tbl:not(.wide)>tbody>tr>:is(td,td[data-l],td:not([data-l])){padding-top:12px;padding-bottom:12px}
  /* A table that is a tile's whole body lines its first and last columns up
     with the tile's title, the way an inset list does. */
  :root[data-layout="studio"] .card>:is(.tbl,.tscroll>.tbl)>*>tr>:first-child{padding-left:22px}
  :root[data-layout="studio"] .card>:is(.tbl,.tscroll>.tbl)>*>tr>:last-child{padding-right:22px}
}
@media(min-width:${BP.desk}px){
  :root[data-layout="studio"] .side{width:248px;padding-top:22px}
  :root[data-layout="studio"] .wordmark{padding:0 20px 6px}
  :root[data-layout="studio"] .orgline{padding:0 20px 10px}
  :root[data-layout="studio"] .navsec{padding:14px 20px 6px}
  :root[data-layout="studio"] .side .navlist{margin:0 12px}
  :root[data-layout="studio"] .side .navi{padding:7px 10px;min-height:34px;border-radius:8px;font-size:14px}
  :root[data-layout="studio"] .newbtn{margin:16px 16px 0;min-height:36px;padding:8px 14px;font-size:14px}
  :root[data-layout="studio"] .sidefoot{padding:14px 20px 0}
  /* The page scrolls the pane, not the content box, so the frosted bar has
     something to frost: the content passes under it, as on apple.com. */
  :root[data-layout="studio"] .dk>.main{margin:0;border:0;border-radius:0;background:var(--paper);
    overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain}
  :root[data-layout="studio"] .dk>.main>.topbar{position:sticky;top:0;z-index:30;padding:10px 40px;min-height:52px}
  :root[data-layout="studio"] .dk>.main>.content{flex:1 0 auto;overflow:visible;width:100%;max-width:1480px;
    margin:0 auto;padding:34px 40px 64px;background:transparent}
  /* Sticky columns clear the bar they now scroll beneath. */
  :root[data-layout="studio"] .pg > .guide{top:72px}
  :root[data-layout="studio"] .ready{top:72px}
}
@media(hover:hover) and (pointer:fine){
  :root[data-layout="studio"] .btn:hover{border-color:transparent;background:var(--btn-hover);box-shadow:none;transform:none}
  :root[data-layout="studio"] .btn.pri:hover{background:var(--pri-from-h)}
  :root[data-layout="studio"] .btn.wax:hover{background:var(--wax-from-h)}
  :root[data-layout="studio"] .btn.ghost:hover{background:var(--fill);border-color:var(--line2)}
  :root[data-layout="studio"] .bellwrap .btn.hasnew:hover{background:rgba(255,59,48,.16)}
  :root[data-layout="studio"] .btn:active{transform:scale(.98)}
  :root[data-layout="studio"] .btn:disabled:hover{background:var(--btn-bg);border-color:transparent;transform:none}
  :root[data-layout="studio"] .btn.pri:disabled:hover{background:var(--pri-from)}
  :root[data-layout="studio"] .btn.wax:disabled:hover{background:var(--wax-from)}
  :root[data-layout="studio"] .in:hover,:root[data-layout="studio"] .dk textarea:hover{border-color:var(--field-bd-h)}
  :root[data-layout="studio"] .stat:hover{border-color:transparent;box-shadow:var(--card-shadow-hi)}
  :root[data-layout="studio"] .navi:hover{background:var(--side-hover)}
  :root[data-layout="studio"] .navi.on:hover{background:var(--side-on-bg)}
  :root[data-layout="studio"] .dk *::-webkit-scrollbar-thumb{background:rgba(0,0,0,.22);background-clip:content-box}
  :root[data-layout="studio"][data-theme="dark"] .dk *::-webkit-scrollbar-thumb{background:rgba(255,255,255,.24);background-clip:content-box}
}
:root[data-layout="studio"] .st-draft{--st-fg:#5b5b63;--st-bg:#efeff2}
:root[data-layout="studio"] .st-approval{--st-fg:#86571d;--st-bg:#fff1da}
:root[data-layout="studio"] .st-published{--st-fg:#256543;--st-bg:#e7f4ec}
:root[data-layout="studio"] .st-closed{--st-fg:#93424a;--st-bg:#fae9ed}
:root[data-layout="studio"] .st-evaluation{--st-fg:#534597;--st-bg:#efebfa}
:root[data-layout="studio"] .st-awarded{--st-fg:#795820;--st-bg:#f6ecd3}
:root[data-layout="studio"] .st-closing{--st-fg:#92501c;--st-bg:#ffecd9}
:root[data-layout="studio"] .st-paused{--st-fg:#3d608a;--st-bg:#e9f0fa}
:root[data-layout="studio"] .st-cancelled{--st-fg:#993633;--st-bg:#fbe9e7}
:root[data-layout="studio"][data-theme="dark"] .st-draft{--st-fg:#c5c5ce;--st-bg:#333338}
:root[data-layout="studio"][data-theme="dark"] .st-approval{--st-fg:#edc48a;--st-bg:#3e3122}
:root[data-layout="studio"][data-theme="dark"] .st-published{--st-fg:#91d5ab;--st-bg:#233b2d}
:root[data-layout="studio"][data-theme="dark"] .st-closed{--st-fg:#ecb1bd;--st-bg:#442c34}
:root[data-layout="studio"][data-theme="dark"] .st-evaluation{--st-fg:#c5b8ef;--st-bg:#352e49}
:root[data-layout="studio"][data-theme="dark"] .st-awarded{--st-fg:#dfc391;--st-bg:#3d3426}
:root[data-layout="studio"][data-theme="dark"] .st-closing{--st-fg:#efbc97;--st-bg:#443224}
:root[data-layout="studio"][data-theme="dark"] .st-paused{--st-fg:#aec9f0;--st-bg:#29384b}
:root[data-layout="studio"][data-theme="dark"] .st-cancelled{--st-fg:#efaaa3;--st-bg:#472c2a}

/* ---------------------------------------------------------------- accents
   Ten tokens each, light and dark. Nothing else: the layout underneath owns
   the type, the radii and the surfaces, and an accent that reached beyond the
   brand family would be a second layout wearing a colour's name.

   Each triple was measured before it was written down. The numbers in the
   comments are contrast ratios and they are the reason these six and not
   others - see the note above ACCENTS. */

/* Blue is explicit so it also overrides the house palette outside Studio. */
:root[data-accent="blue"]{
  --brand:#0066cc;--brand-2:#0066cc;--brand-deep:#004d99;--brand-tint:#e7f1ff;
  --pri-from:#0071e3;--pri-to:#0071e3;--pri-from-h:#0055ad;--pri-to-h:#0055ad;
  --pri-line:#0066cc;--pri-glow:rgba(0,102,204,.13);--on-brand:#fff;
  --brand-ring:rgba(0,102,204,.22);--side-on-bg:#dce9fb;--side-on-ink:#004d99;
  --newbtn-bg-h:#e7f1ff;--newbtn-line-h:#0066cc;--unread-bg:#e7f1ff;
  --seal-hi:#b5d8ff;--seal-core:#0071e3;--seal-crack:#003f7d}
:root[data-accent="blue"][data-theme="dark"]{
  --brand:#80baff;--brand-2:#80baff;--brand-deep:#b6d7ff;--brand-tint:#203650;
  --pri-from:#80baff;--pri-to:#80baff;--pri-from-h:#acd2ff;--pri-to-h:#acd2ff;
  --pri-line:#80baff;--on-brand:#082343;--side-on-bg:#203650;--side-on-ink:#b6d7ff;
  --newbtn-bg-h:#203650;--newbtn-line-h:#80baff;
  --seal-hi:#d2e7ff;--seal-core:#80baff;--seal-crack:#183e69}

/* Forest - 6.54 on white · 4.77 under white · 8.85 on dark */
:root[data-accent="forest"]{
  --brand:#0f6b45;--brand-2:#0f6b45;--brand-deep:#0b5334;--brand-tint:#e6f3ed;
  --pri-from:#138354;--pri-to:#138354;--pri-from-h:#0f6b45;--pri-to-h:#0f6b45;
  --pri-line:#0f6b45;--pri-glow:rgba(19,131,84,.13);--on-brand:#fff;
  --brand-ring:rgba(19,131,84,.22);--side-on-bg:#e0efe8;--side-on-ink:#0b5334;
  --newbtn-bg-h:#e6f3ed;--newbtn-line-h:#0f6b45;--unread-bg:#eaf5ef;
  --seal-hi:#b7ddc9;--seal-core:#138354;--seal-crack:#08301f}
:root[data-accent="forest"][data-theme="dark"]{
  --brand:#6cc79b;--brand-2:#6cc79b;--brand-deep:#9adebd;--brand-tint:#1d3a2c;
  --pri-from:#6cc79b;--pri-to:#6cc79b;--pri-from-h:#8fd9b3;--pri-to-h:#8fd9b3;
  --pri-line:#6cc79b;--on-brand:#06281a;--side-on-bg:#1d3a2c;--side-on-ink:#9adebd;
  --newbtn-bg-h:#1d3a2c;--newbtn-line-h:#6cc79b;
  --seal-hi:#c8e9d8;--seal-core:#6cc79b;--seal-crack:#17442f}

/* Teal - 6.30 on white · 4.75 under white · 9.73 on dark */
:root[data-accent="teal"]{
  --brand:#0f6b6b;--brand-2:#0f6b6b;--brand-deep:#0b5252;--brand-tint:#e4f2f2;
  --pri-from:#118080;--pri-to:#118080;--pri-from-h:#0f6b6b;--pri-to-h:#0f6b6b;
  --pri-line:#0f6b6b;--pri-glow:rgba(17,128,128,.13);--on-brand:#fff;
  --brand-ring:rgba(17,128,128,.22);--side-on-bg:#dcefef;--side-on-ink:#0b5252;
  --newbtn-bg-h:#e4f2f2;--newbtn-line-h:#0f6b6b;--unread-bg:#e8f4f4;
  --seal-hi:#b4dcdc;--seal-core:#118080;--seal-crack:#07302f}
:root[data-accent="teal"][data-theme="dark"]{
  --brand:#5ecfcf;--brand-2:#5ecfcf;--brand-deep:#92e2e2;--brand-tint:#193c3c;
  --pri-from:#5ecfcf;--pri-to:#5ecfcf;--pri-from-h:#86dede;--pri-to-h:#86dede;
  --pri-line:#5ecfcf;--on-brand:#052827;--side-on-bg:#193c3c;--side-on-ink:#92e2e2;
  --newbtn-bg-h:#193c3c;--newbtn-line-h:#5ecfcf;
  --seal-hi:#c4ecec;--seal-core:#5ecfcf;--seal-crack:#144646}

/* Indigo - 7.09 on white · 5.55 under white · 7.71 on dark */
:root[data-accent="indigo"]{
  --brand:#4b3fd4;--brand-2:#4b3fd4;--brand-deep:#3a30a8;--brand-tint:#ecebfd;
  --pri-from:#5a4ef0;--pri-to:#5a4ef0;--pri-from-h:#4b3fd4;--pri-to-h:#4b3fd4;
  --pri-line:#4b3fd4;--pri-glow:rgba(90,78,240,.13);--on-brand:#fff;
  --brand-ring:rgba(90,78,240,.22);--side-on-bg:#e5e3fb;--side-on-ink:#3a30a8;
  --newbtn-bg-h:#ecebfd;--newbtn-line-h:#4b3fd4;--unread-bg:#eeedfd;
  --seal-hi:#c9c5f7;--seal-core:#5a4ef0;--seal-crack:#241c68}
:root[data-accent="indigo"][data-theme="dark"]{
  --brand:#a99dff;--brand-2:#a99dff;--brand-deep:#c7bfff;--brand-tint:#2b2657;
  --pri-from:#a99dff;--pri-to:#a99dff;--pri-from-h:#c0b6ff;--pri-to-h:#c0b6ff;
  --pri-line:#a99dff;--on-brand:#140f3d;--side-on-bg:#2b2657;--side-on-ink:#c7bfff;
  --newbtn-bg-h:#2b2657;--newbtn-line-h:#a99dff;
  --seal-hi:#d6d0ff;--seal-core:#a99dff;--seal-crack:#332c66}

/* Crimson - 6.50 on white · 5.27 under white · 7.74 on dark.
   Offered, but read the note in ACCENTS: this interface already uses red for
   a refusal, and an accent that shares it makes "primary" and "destructive"
   the same colour on a page holding both. */
:root[data-accent="crimson"]{
  --brand:#b3243a;--brand-2:#b3243a;--brand-deep:#8c1a2c;--brand-tint:#fce9ec;
  --pri-from:#cc2a44;--pri-to:#cc2a44;--pri-from-h:#b3243a;--pri-to-h:#b3243a;
  --pri-line:#b3243a;--pri-glow:rgba(204,42,68,.13);--on-brand:#fff;
  --brand-ring:rgba(204,42,68,.22);--side-on-bg:#f9dfe4;--side-on-ink:#8c1a2c;
  --newbtn-bg-h:#fce9ec;--newbtn-line-h:#b3243a;--unread-bg:#fdecef;
  --seal-hi:#f2c2cb;--seal-core:#cc2a44;--seal-crack:#5a0e1b}
:root[data-accent="crimson"][data-theme="dark"]{
  --brand:#f58a9c;--brand-2:#f58a9c;--brand-deep:#ffb3c0;--brand-tint:#4a2028;
  --pri-from:#f58a9c;--pri-to:#f58a9c;--pri-from-h:#ffa3b3;--pri-to-h:#ffa3b3;
  --pri-line:#f58a9c;--on-brand:#3d0a14;--side-on-bg:#4a2028;--side-on-ink:#ffb3c0;
  --newbtn-bg-h:#4a2028;--newbtn-line-h:#f58a9c;
  --seal-hi:#ffc9d2;--seal-core:#f58a9c;--seal-crack:#52242c}

/* Purple - 6.47 on white · 5.56 under white · 8.18 on dark */
:root[data-accent="purple"]{
  --brand:#7b3fb8;--brand-2:#7b3fb8;--brand-deep:#5f2d91;--brand-tint:#f3ebfc;
  --pri-from:#8a44cc;--pri-to:#8a44cc;--pri-from-h:#7b3fb8;--pri-to-h:#7b3fb8;
  --pri-line:#7b3fb8;--pri-glow:rgba(138,68,204,.13);--on-brand:#fff;
  --brand-ring:rgba(138,68,204,.22);--side-on-bg:#ece1f9;--side-on-ink:#5f2d91;
  --newbtn-bg-h:#f3ebfc;--newbtn-line-h:#7b3fb8;--unread-bg:#f5eefc;
  --seal-hi:#dcc6f3;--seal-core:#8a44cc;--seal-crack:#3a1a5c}
:root[data-accent="purple"][data-theme="dark"]{
  --brand:#c9a2ff;--brand-2:#c9a2ff;--brand-deep:#ddc6ff;--brand-tint:#2e2347;
  --pri-from:#c9a2ff;--pri-to:#c9a2ff;--pri-from-h:#d8bbff;--pri-to-h:#d8bbff;
  --pri-line:#c9a2ff;--on-brand:#25103f;--side-on-bg:#2e2347;--side-on-ink:#ddc6ff;
  --newbtn-bg-h:#2e2347;--newbtn-line-h:#c9a2ff;
  --seal-hi:#e6d6ff;--seal-core:#c9a2ff;--seal-crack:#3a2a5c}

/* Pink - 6.13 on white · 4.96 under white · 7.97 on dark.
   Next to crimson on the wheel and to the red the interface uses for a
   refusal, which is why it is a rose rather than the Mac's brighter pink. */
:root[data-accent="pink"]{
  --brand:#b8235a;--brand-2:#b8235a;--brand-deep:#8f1a45;--brand-tint:#fdeaf1;
  --pri-from:#d12a66;--pri-to:#d12a66;--pri-from-h:#b8235a;--pri-to-h:#b8235a;
  --pri-line:#b8235a;--pri-glow:rgba(209,42,102,.13);--on-brand:#fff;
  --brand-ring:rgba(209,42,102,.22);--side-on-bg:#fadbe6;--side-on-ink:#8f1a45;
  --newbtn-bg-h:#fdeaf1;--newbtn-line-h:#b8235a;--unread-bg:#fdedf3;
  --seal-hi:#f6c3d5;--seal-core:#d12a66;--seal-crack:#5a0f2a}
:root[data-accent="pink"][data-theme="dark"]{
  --brand:#ff8fb4;--brand-2:#ff8fb4;--brand-deep:#ffb8cf;--brand-tint:#45202e;
  --pri-from:#ff8fb4;--pri-to:#ff8fb4;--pri-from-h:#ffa8c5;--pri-to-h:#ffa8c5;
  --pri-line:#ff8fb4;--on-brand:#3d0a1f;--side-on-bg:#45202e;--side-on-ink:#ffb8cf;
  --newbtn-bg-h:#45202e;--newbtn-line-h:#ff8fb4;
  --seal-hi:#ffd0df;--seal-core:#ff8fb4;--seal-crack:#5a2436}

/* Orange - 5.78 on white · 4.91 under white · 8.67 on dark.
   A burnt orange: the bright one fails under white text. It sits near the
   amber of "waiting for approval", so status pills keep their words. */
:root[data-accent="orange"]{
  --brand:#b2400a;--brand-2:#b2400a;--brand-deep:#8a3107;--brand-tint:#fff0e6;
  --pri-from:#c4480c;--pri-to:#c4480c;--pri-from-h:#b2400a;--pri-to-h:#b2400a;
  --pri-line:#b2400a;--pri-glow:rgba(196,72,12,.13);--on-brand:#fff;
  --brand-ring:rgba(196,72,12,.22);--side-on-bg:#fde3d2;--side-on-ink:#8a3107;
  --newbtn-bg-h:#fff0e6;--newbtn-line-h:#b2400a;--unread-bg:#fff3eb;
  --seal-hi:#f8cdb3;--seal-core:#c4480c;--seal-crack:#4f1c04}
:root[data-accent="orange"][data-theme="dark"]{
  --brand:#ffa36b;--brand-2:#ffa36b;--brand-deep:#ffc39e;--brand-tint:#45281a;
  --pri-from:#ffa36b;--pri-to:#ffa36b;--pri-from-h:#ffb68a;--pri-to-h:#ffb68a;
  --pri-line:#ffa36b;--on-brand:#3a1600;--side-on-bg:#45281a;--side-on-ink:#ffc39e;
  --newbtn-bg-h:#45281a;--newbtn-line-h:#ffa36b;
  --seal-hi:#ffd6bd;--seal-core:#ffa36b;--seal-crack:#5a3018}

/* Gold - 5.76 on white · 4.87 under white · 10.45 on dark.
   The deepest step that still reads as gold. See the note above ACCENTS for
   why there is no yellow. */
:root[data-accent="gold"]{
  --brand:#8a5d00;--brand-2:#8a5d00;--brand-deep:#6b4800;--brand-tint:#fbf3dc;
  --pri-from:#9a6700;--pri-to:#9a6700;--pri-from-h:#8a5d00;--pri-to-h:#8a5d00;
  --pri-line:#8a5d00;--pri-glow:rgba(154,103,0,.13);--on-brand:#fff;
  --brand-ring:rgba(154,103,0,.22);--side-on-bg:#f5e8c4;--side-on-ink:#6b4800;
  --newbtn-bg-h:#fbf3dc;--newbtn-line-h:#8a5d00;--unread-bg:#fcf6e5;
  --seal-hi:#efd9a1;--seal-core:#9a6700;--seal-crack:#3d2900}
:root[data-accent="gold"][data-theme="dark"]{
  --brand:#f5c451;--brand-2:#f5c451;--brand-deep:#f9da8f;--brand-tint:#3d3218;
  --pri-from:#f5c451;--pri-to:#f5c451;--pri-from-h:#f8d27a;--pri-to-h:#f8d27a;
  --pri-line:#f5c451;--on-brand:#2e2100;--side-on-bg:#3d3218;--side-on-ink:#f9da8f;
  --newbtn-bg-h:#3d3218;--newbtn-line-h:#f5c451;
  --seal-hi:#fbe5ad;--seal-core:#f5c451;--seal-crack:#4f3d10}

/* Graphite - 11.31 on white · 16.83 under white · 10.75 on dark.
   The one with no hue at all. Every status colour in the interface still does
   its job; this only removes the accent competing with them. */
:root[data-accent="graphite"]{
  --brand:#3a3a3f;--brand-2:#3a3a3f;--brand-deep:#1d1d1f;--brand-tint:#ededf1;
  --pri-from:#1d1d1f;--pri-to:#1d1d1f;--pri-from-h:#39393e;--pri-to-h:#39393e;
  --pri-line:#1d1d1f;--pri-glow:rgba(29,29,31,.13);--on-brand:#fff;
  --brand-ring:rgba(29,29,31,.22);--side-on-bg:#e4e4e9;--side-on-ink:#1d1d1f;
  --newbtn-bg-h:#ededf1;--newbtn-line-h:#3a3a3f;--unread-bg:#f0f0f3;
  --seal-hi:#c7c7ce;--seal-core:#3a3a3f;--seal-crack:#1d1d1f}
:root[data-accent="graphite"][data-theme="dark"]{
  --brand:#c7c7ce;--brand-2:#c7c7ce;--brand-deep:#e0e0e7;--brand-tint:#333338;
  --pri-from:#e8e8ed;--pri-to:#e8e8ed;--pri-from-h:#fff;--pri-to-h:#fff;
  --pri-line:#e8e8ed;--on-brand:#1d1d1f;--side-on-bg:#333338;--side-on-ink:#e0e0e7;
  --newbtn-bg-h:#333338;--newbtn-line-h:#c7c7ce;
  --seal-hi:#e0e0e7;--seal-core:#c7c7ce;--seal-crack:#39393e}

/* ------------------------------------------------- the accent, for the FRONT
   The landing page is not inside the app shell and carries its own token
   namespace (--st-*, see studio-landing.jsx), so the blocks above - which
   override the app's --brand family - never reached it. That is why picking
   teal repainted the workspace and left the front page blue.

   These publish the same accent under the names the front page reads. On
   :root rather than [data-layout="studio"] because the landing page sets
   data-design on its own wrapper and is not necessarily under that attribute;
   the tokens are inert unless something asks for them, so a page that does not
   read --st-accent is unaffected by their presence. */
:root[data-accent="forest"]{--st-accent:#0f6b45;--st-accent-fill:#138354;--st-accent-fill-h:#0f6b45}
:root[data-accent="forest"][data-theme="dark"]{--st-accent-dark:#6cc79b;--st-accent-fill:#6cc79b;--st-accent-fill-h:#6cc79b}
:root[data-accent="teal"]{--st-accent:#0f6b6b;--st-accent-fill:#118080;--st-accent-fill-h:#0f6b6b}
:root[data-accent="teal"][data-theme="dark"]{--st-accent-dark:#5ecfcf;--st-accent-fill:#5ecfcf;--st-accent-fill-h:#5ecfcf}
:root[data-accent="indigo"]{--st-accent:#4b3fd4;--st-accent-fill:#5a4ef0;--st-accent-fill-h:#4b3fd4}
:root[data-accent="indigo"][data-theme="dark"]{--st-accent-dark:#a99dff;--st-accent-fill:#a99dff;--st-accent-fill-h:#a99dff}
:root[data-accent="crimson"]{--st-accent:#b3243a;--st-accent-fill:#cc2a44;--st-accent-fill-h:#b3243a}
:root[data-accent="crimson"][data-theme="dark"]{--st-accent-dark:#f58a9c;--st-accent-fill:#f58a9c;--st-accent-fill-h:#f58a9c}
:root[data-accent="purple"]{--st-accent:#7b3fb8;--st-accent-fill:#8a44cc;--st-accent-fill-h:#7b3fb8}
:root[data-accent="purple"][data-theme="dark"]{--st-accent-dark:#c9a2ff;--st-accent-fill:#c9a2ff;--st-accent-fill-h:#c9a2ff}
:root[data-accent="pink"]{--st-accent:#b8235a;--st-accent-fill:#d12a66;--st-accent-fill-h:#b8235a}
:root[data-accent="pink"][data-theme="dark"]{--st-accent-dark:#ff8fb4;--st-accent-fill:#ff8fb4;--st-accent-fill-h:#ff8fb4}
:root[data-accent="orange"]{--st-accent:#b2400a;--st-accent-fill:#c4480c;--st-accent-fill-h:#b2400a}
:root[data-accent="orange"][data-theme="dark"]{--st-accent-dark:#ffa36b;--st-accent-fill:#ffa36b;--st-accent-fill-h:#ffa36b}
:root[data-accent="gold"]{--st-accent:#8a5d00;--st-accent-fill:#9a6700;--st-accent-fill-h:#8a5d00}
:root[data-accent="gold"][data-theme="dark"]{--st-accent-dark:#f5c451;--st-accent-fill:#f5c451;--st-accent-fill-h:#f5c451}
:root[data-accent="graphite"]{--st-accent:#3a3a3f;--st-accent-fill:#1d1d1f;--st-accent-fill-h:#39393e}
:root[data-accent="graphite"][data-theme="dark"]{--st-accent-dark:#c7c7ce;--st-accent-fill:#c7c7ce;--st-accent-fill-h:#c7c7ce}
/* Shared branding; status colours retain their meaning. */
:root[data-accent]{
  --app-brand:var(--brand);--app-brand-deep:var(--brand-deep);
  --app-brand-tint:var(--brand-tint);--app-on-brand:var(--on-brand);
  --engo:var(--brand-2);--engo-ink:var(--brand);--engo-deep:var(--brand-deep);
  --engo-band:var(--seal-crack);--login-glow:var(--brand-tint);
  --st-accent:var(--brand);--st-accent-dark:var(--brand);
  --st-accent-fill:var(--pri-from);--st-accent-fill-h:var(--pri-from-h)}
:root[data-accent]:not([data-layout="studio"]){
  --paper:#f5f5f7;--paper-2:#ebebef;--card:#fff;--sunk:#f5f5f7;
  --ink:#1d1d1f;--muted:#55555c;--faint:#686870;--line:#dedee3;--line2:#c7c7ce;
  --topbar-bg:rgba(245,245,247,.9);--btn-hover:#ededf2;
  --green:#00803e;--green-2:#00a651;--green-deep:#04562b;
  --side:var(--seal-crack);--side-from:var(--seal-crack);--side-to:var(--seal-crack);
  --side-ink:#fff;--side-dim:#ddd;--side-sec:#ddd;--side-on-line:var(--brand);
  --wordmark-ink:#fff;--wordmark-rule:rgba(255,255,255,.2)}
:root[data-accent][data-theme="dark"]{
  --brand-ring:color-mix(in srgb,var(--brand) 28%,transparent);
  --unread-bg:var(--brand-tint);--pri-glow:color-mix(in srgb,var(--brand) 15%,transparent)}
:root[data-accent][data-theme="dark"]:not([data-layout="studio"]){
  --paper:#161618;--paper-2:#242426;--card:#232326;--sunk:#1b1b1e;
  --ink:#f5f5f7;--muted:#b5b5be;--faint:#a1a1ab;--line:#39393e;--line2:#505058;
  --topbar-bg:rgba(22,22,24,.9);--btn-hover:#303036;
  --green:#5fd98f;--green-2:#2fc46e;--green-deep:#8fe8b5}
:root[data-accent] .lp[data-design],
:root[data-accent][data-theme="dark"] .lp[data-design]{
  --lp-pri:var(--app-brand);--lp-pri-deep:var(--app-brand-deep);
  --lp-pri-dark:var(--seal-crack);--lp-pri-tint:var(--app-brand-tint);
  --lp-on-pri:var(--app-on-brand);--lp-on-band:#fff;
  --lp-on-band-muted:#ddd;--lp-on-band-accent:#fff}

`;
