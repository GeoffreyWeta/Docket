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
   down to a step that passes, and it is the closest thing here to the brand. */
export const ACCENTS = [
  { key: "blue",     label: "Blue",     hex: "#0071e3",
    note: "The Apple blue. Calm, familiar, and says nothing in particular." },
  { key: "forest",   label: "Forest",   hex: "#138354",
    note: "The house green taken down to a step that survives white text on it." },
  { key: "teal",     label: "Teal",     hex: "#118080",
    note: "Cooler than the green and further from every other procurement tool." },
  { key: "indigo",   label: "Indigo",   hex: "#5a4ef0",
    note: "The loudest option that still passes everywhere. Reads as software." },
  { key: "crimson",  label: "Crimson",  hex: "#cc2a44",
    note: "Deliberate. Note that the interface already uses red for refusals." },
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
  if (id && id !== DEFAULT_ACCENT && ACCENT_KEYS.includes(id)) root.dataset.accent = id;
  else delete root.dataset.accent;
}

// Deployment layout, independent of the reader's light/dark preference.
export const STUDIO_CSS = `
:root[data-layout="studio"]{
  /* SAN FRANCISCO WHERE IT EXISTS, AND A FACE THAT LOOKS LIKE IT WHERE IT DOES
     NOT. -apple-system resolves to SF on macOS and iOS, which is the whole
     point of this layout, and to nothing at all anywhere else. The stack used
     to fall from there straight to Helvetica Neue, which Windows does not
     ship, and land on Arial: measured with CSS.getPlatformFontsForNode on
     Windows 11, this layout was rendering in Arial, which is the one thing it
     was trying not to look like.

     Geist Variable catches that fall. It is already bundled with the app, so
     it always resolves, and it is a neutral grotesque built on the same
     principles as SF rather than a 1982 Helvetica clone. Apple hardware never
     reaches it; everyone else lands on it instead of Arial. */
  --font-sans:-apple-system,BlinkMacSystemFont,'SF Pro Text','Geist Variable','Helvetica Neue',Helvetica,Arial,sans-serif;
  --font-display:var(--font-sans);--font-serif:var(--font-sans);--font-mono:var(--font-sans);
  --h1-weight:600;--h1-ls:-.04em;--stat-v-weight:500;
  --th-weight:500;--th-ls:0;--k-weight:500;--k-ls:0;--badge-weight:500;--badge-ls:0;
  --wordmark-weight:600;--wordmark-ls:-.025em;--btn-fw:500;
  --brand-ring:rgba(0,113,227,.22);--hair:rgba(29,29,31,.07);
  --green:#247344;--green-2:#27834d;--green-deep:#175630;--green-tint:#eaf5ed;--green-ring:rgba(36,115,68,.2);
  --wax:#b42324;--wax-tint:#fff0ef;--wax-from:#b42324;--wax-to:#b42324;--wax-from-h:#9a191b;--wax-to-h:#9a191b;--wax-line:#b42324;
  --brass:#885400;--gold-ink:#885400;--brass-tint:#fff4df;
  --chip-ok-line:#c7e3cf;--chip-warn-line:#f1c6c3;--chip-gold-line:#ebd7b4;
  --letter-bg:#fafafa;--ceremony-from:#fff0ef;--ceremony-line:#f1c6c3;--addm-line:#ebd7b4;
  --unread-bg:#edf4ff;--login-glow:#fff;--skel-hi:#e8e8ed;
  --seal-hi:#b5d8ff;--seal-core:#0071e3;--seal-crack:#003f7d;
  --scrim:rgba(20,20,24,.38);--tip-bg:#1d1d1f;--tip-ink:#fff;
  --field-shadow:none;--shadow:0 1px 3px rgba(0,0,0,.04);--sh-2:0 3px 14px rgba(0,0,0,.05);--sh-3:0 18px 60px rgba(0,0,0,.16);
  --r:16px;--radius-lg:18px;--r-btn:10px;
  --paper:#f5f5f7;--paper-2:#ebebef;--card:#fff;--sunk:#f5f5f7;
  --ink:#1d1d1f;--muted:#55555c;--faint:#686870;--line:#dedee3;--line2:#c7c7ce;
  --brand:#0066cc;--brand-2:#0066cc;--brand-deep:#004d99;--brand-tint:#e7f1ff;
  --pri-from:#0071e3;--pri-to:#0071e3;--pri-from-h:#0055ad;--pri-to-h:#0055ad;
  --pri-line:#0066cc;--pri-glow:rgba(0,102,204,.13);--on-brand:#fff;
  --btn-hover:#ededf2;--topbar-bg:rgba(245,245,247,.9);
  --side:#ededf1;--side-from:#ededf1;--side-to:#ededf1;
  --side-ink:#1d1d1f;--side-dim:#55555c;--side-sec:#686870;
  --side-hover:#e0e0e7;--side-on-bg:#dce9fb;--side-on-ink:#004d99;--side-on-line:transparent;
  --side-edge:inset -1px 0 0 #dedee3;--wordmark-ink:#1d1d1f;--wordmark-rule:#dedee3;
  --newbtn-bg:#fff;--newbtn-line:#d4d4dc;--newbtn-bg-h:#e7f1ff;--newbtn-line-h:#0066cc;
  --r-xs:6px;--r-sm:10px;--r-md:16px;--r-lg:22px;
}
:root[data-layout="studio"][data-theme="dark"]{
  --brand-ring:rgba(128,186,255,.28);--hair:rgba(245,245,247,.08);
  --green:#86d6a1;--green-2:#86d6a1;--green-deep:#afe7c2;--green-tint:#21382b;--green-ring:rgba(134,214,161,.23);
  --wax:#ffb4ad;--wax-tint:#422526;--wax-from:#ffb4ad;--wax-to:#ffb4ad;--wax-from-h:#ffc9c4;--wax-to-h:#ffc9c4;--wax-line:#ffb4ad;
  --brass:#e8bd75;--gold-ink:#e8bd75;--brass-tint:#3a3022;
  --chip-ok-line:#395e45;--chip-warn-line:#74423f;--chip-gold-line:#655234;
  --letter-bg:#28282c;--ceremony-from:#422526;--ceremony-line:#74423f;--addm-line:#655234;
  --unread-bg:#203650;--login-glow:#232326;--skel-hi:#303036;
  --seal-hi:#d2e7ff;--seal-core:#80baff;--seal-crack:#183e69;
  --scrim:rgba(0,0,0,.6);--tip-bg:#f5f5f7;--tip-ink:#1d1d1f;
  --shadow:0 1px 3px rgba(0,0,0,.2);--sh-2:0 3px 14px rgba(0,0,0,.2);--sh-3:0 18px 60px rgba(0,0,0,.45);
  --paper:#161618;--paper-2:#242426;--card:#232326;--sunk:#1b1b1e;
  --ink:#f5f5f7;--muted:#b5b5be;--faint:#a1a1ab;--line:#39393e;--line2:#505058;
  --brand:#80baff;--brand-2:#80baff;--brand-deep:#b6d7ff;--brand-tint:#203650;
  --pri-from:#80baff;--pri-to:#80baff;--pri-from-h:#acd2ff;--pri-to-h:#acd2ff;
  --pri-line:#80baff;--on-brand:#082343;--btn-hover:#303036;--topbar-bg:rgba(22,22,24,.9);
  --side:#1e1e21;--side-from:#1e1e21;--side-to:#1e1e21;
  --side-ink:#f5f5f7;--side-dim:#b5b5be;--side-sec:#a1a1ab;
  --side-hover:#303036;--side-on-bg:#203650;--side-on-ink:#b6d7ff;
  --side-edge:inset -1px 0 0 #39393e;--wordmark-ink:#f5f5f7;--wordmark-rule:#39393e;
  --newbtn-bg:#303036;--newbtn-line:#505058;--newbtn-bg-h:#203650;--newbtn-line-h:#80baff;
}
:root[data-layout="studio"] .side .navlist{margin:0 10px}
:root[data-layout="studio"] .side .navi{border:0;border-radius:9px;padding:11px 12px;margin:2px 0;min-height:44px}
:root[data-layout="studio"] .navind{display:none}
:root[data-layout="studio"] .topbar{border-bottom:1px solid var(--line);box-shadow:none}
:root[data-layout="studio"] .card{border-radius:18px;box-shadow:0 2px 8px rgba(0,0,0,.025)}
:root[data-layout="studio"] .btn{border-radius:10px}
:root[data-layout="studio"] .btn.pri{box-shadow:none}
:root[data-layout="studio"] .chead{padding:20px 24px}
:root[data-layout="studio"] .cbody{padding:24px}
:root[data-layout="studio"] .guidebox{border-radius:22px;background:var(--card)}
:root[data-layout="studio"] .pagehead h1{font-size:clamp(28px,3vw,38px);letter-spacing:-.04em}
@media(min-width:${BP.desk}px){
  :root[data-layout="studio"] .side{width:240px;padding-top:28px}
  :root[data-layout="studio"] .main{margin:12px 12px 12px 0;border:1px solid var(--line);border-radius:20px;overflow:hidden;background:var(--card)}
  :root[data-layout="studio"] .content{padding:36px 32px 48px;background:var(--paper)}
  :root[data-layout="studio"] .topbar{padding:16px 24px;background:var(--card)}
}

/* One typographic voice across login, admin, workspace and portal. Tabular
   figures keep amounts aligned without changing to a typewriter face. */
:root[data-layout="studio"] body{font-family:var(--font-sans);background:var(--paper);color:var(--ink);-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}
:root[data-layout="studio"] :is(button,input,select,textarea){font-family:var(--font-sans)}
:root[data-layout="studio"] :is(.mono,.money,.stat .v){font-variant-numeric:tabular-nums;letter-spacing:-.015em}
/* Real code keeps a real monospace: ui-monospace is SF Mono on Apple, and
   Geist Mono is bundled for everywhere else. The UI itself stays in the sans
   with tabular figures, which is how Apple sets money and is why --font-mono
   above is pointed at the sans rather than at this. */
:root[data-layout="studio"] :is(code,pre){font-family:ui-monospace,SFMono-Regular,'SF Mono',Menlo,'Geist Mono Variable',Consolas,monospace}
:root[data-layout="studio"] :is(.dk,.loginwrap){letter-spacing:-.015em}
:root[data-layout="studio"] :is(.card h2,.card h3,.guidehl,.pn){font-weight:600;letter-spacing:-.025em}
:root[data-layout="studio"] .pagehead{border-bottom:0;padding-bottom:4px;margin-bottom:24px}
:root[data-layout="studio"] :is(.lbl,.tbl th){font-weight:500;letter-spacing:0}
:root[data-layout="studio"] :is(.adminmark,.ptag){text-transform:none;letter-spacing:0;font-size:12px}
:root[data-layout="studio"] :is(.in,.dk textarea,.dk select){background:var(--field-bg);border-color:var(--line2);border-radius:10px;box-shadow:none}
:root[data-layout="studio"] :is(.in,.dk textarea,.dk select):focus{border-color:var(--brand);box-shadow:0 0 0 3px var(--brand-ring)}
:root[data-layout="studio"] :is(.stat,.menu,.ndrop,.designcard){border-radius:16px;box-shadow:var(--shadow)}
:root[data-layout="studio"] .btn{font-weight:500;letter-spacing:-.01em}
:root[data-layout="studio"] .side .navi.on{color:var(--side-on-ink);background:var(--side-on-bg)}
:root[data-layout="studio"] :is(.segmented,.antabs){border-radius:10px;padding:3px;gap:3px}
:root[data-layout="studio"] :is(.segmented button,.antab){border-radius:7px}
:root[data-layout="studio"] .illus{--il-tint:var(--brand-tint);--il-ink:var(--brand);--il-ink-2:var(--brand-deep);--il-paper:var(--card);--il-line:var(--line2);--il-cool:var(--brand);--il-warm:var(--faint)}
:root[data-layout="studio"][data-theme="dark"] .illus{--il-ink:var(--ink);--il-ink-2:var(--faint);--il-line:var(--muted)}
:root[data-layout="studio"] .loginwrap{background:var(--paper)}
:root[data-layout="studio"] .studio-preview{background:var(--paper);border-color:var(--line)}
:root[data-layout="studio"] .studio-preview>span:first-child{background:var(--paper-2)}
:root[data-layout="studio"] .studio-preview i{background:var(--card);border-color:var(--line)}
/* Keep the admin console's document layout instead of the workspace shell. */
:root[data-layout="studio"] .adminroot .content{background:var(--paper)}
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
   others — see the note above ACCENTS. */

/* Forest — 6.54 on white · 4.77 under white · 8.85 on dark */
:root[data-layout="studio"][data-accent="forest"]{
  --brand:#0f6b45;--brand-2:#0f6b45;--brand-deep:#0b5334;--brand-tint:#e6f3ed;
  --pri-from:#138354;--pri-to:#138354;--pri-from-h:#0f6b45;--pri-to-h:#0f6b45;
  --pri-line:#0f6b45;--pri-glow:rgba(19,131,84,.13);--on-brand:#fff;
  --brand-ring:rgba(19,131,84,.22);--side-on-bg:#e0efe8;--side-on-ink:#0b5334;
  --newbtn-bg-h:#e6f3ed;--newbtn-line-h:#0f6b45;--unread-bg:#eaf5ef;
  --seal-hi:#b7ddc9;--seal-core:#138354;--seal-crack:#08301f}
:root[data-layout="studio"][data-accent="forest"][data-theme="dark"]{
  --brand:#6cc79b;--brand-2:#6cc79b;--brand-deep:#9adebd;--brand-tint:#1d3a2c;
  --pri-from:#6cc79b;--pri-to:#6cc79b;--pri-from-h:#8fd9b3;--pri-to-h:#8fd9b3;
  --pri-line:#6cc79b;--on-brand:#06281a;--side-on-bg:#1d3a2c;--side-on-ink:#9adebd;
  --newbtn-bg-h:#1d3a2c;--newbtn-line-h:#6cc79b;
  --seal-hi:#c8e9d8;--seal-core:#6cc79b;--seal-crack:#17442f}

/* Teal — 6.30 on white · 4.75 under white · 9.73 on dark */
:root[data-layout="studio"][data-accent="teal"]{
  --brand:#0f6b6b;--brand-2:#0f6b6b;--brand-deep:#0b5252;--brand-tint:#e4f2f2;
  --pri-from:#118080;--pri-to:#118080;--pri-from-h:#0f6b6b;--pri-to-h:#0f6b6b;
  --pri-line:#0f6b6b;--pri-glow:rgba(17,128,128,.13);--on-brand:#fff;
  --brand-ring:rgba(17,128,128,.22);--side-on-bg:#dcefef;--side-on-ink:#0b5252;
  --newbtn-bg-h:#e4f2f2;--newbtn-line-h:#0f6b6b;--unread-bg:#e8f4f4;
  --seal-hi:#b4dcdc;--seal-core:#118080;--seal-crack:#07302f}
:root[data-layout="studio"][data-accent="teal"][data-theme="dark"]{
  --brand:#5ecfcf;--brand-2:#5ecfcf;--brand-deep:#92e2e2;--brand-tint:#193c3c;
  --pri-from:#5ecfcf;--pri-to:#5ecfcf;--pri-from-h:#86dede;--pri-to-h:#86dede;
  --pri-line:#5ecfcf;--on-brand:#052827;--side-on-bg:#193c3c;--side-on-ink:#92e2e2;
  --newbtn-bg-h:#193c3c;--newbtn-line-h:#5ecfcf;
  --seal-hi:#c4ecec;--seal-core:#5ecfcf;--seal-crack:#144646}

/* Indigo — 7.09 on white · 5.55 under white · 7.71 on dark */
:root[data-layout="studio"][data-accent="indigo"]{
  --brand:#4b3fd4;--brand-2:#4b3fd4;--brand-deep:#3a30a8;--brand-tint:#ecebfd;
  --pri-from:#5a4ef0;--pri-to:#5a4ef0;--pri-from-h:#4b3fd4;--pri-to-h:#4b3fd4;
  --pri-line:#4b3fd4;--pri-glow:rgba(90,78,240,.13);--on-brand:#fff;
  --brand-ring:rgba(90,78,240,.22);--side-on-bg:#e5e3fb;--side-on-ink:#3a30a8;
  --newbtn-bg-h:#ecebfd;--newbtn-line-h:#4b3fd4;--unread-bg:#eeedfd;
  --seal-hi:#c9c5f7;--seal-core:#5a4ef0;--seal-crack:#241c68}
:root[data-layout="studio"][data-accent="indigo"][data-theme="dark"]{
  --brand:#a99dff;--brand-2:#a99dff;--brand-deep:#c7bfff;--brand-tint:#2b2657;
  --pri-from:#a99dff;--pri-to:#a99dff;--pri-from-h:#c0b6ff;--pri-to-h:#c0b6ff;
  --pri-line:#a99dff;--on-brand:#140f3d;--side-on-bg:#2b2657;--side-on-ink:#c7bfff;
  --newbtn-bg-h:#2b2657;--newbtn-line-h:#a99dff;
  --seal-hi:#d6d0ff;--seal-core:#a99dff;--seal-crack:#332c66}

/* Crimson — 6.50 on white · 5.27 under white · 7.74 on dark.
   Offered, but read the note in ACCENTS: this interface already uses red for
   a refusal, and an accent that shares it makes "primary" and "destructive"
   the same colour on a page holding both. */
:root[data-layout="studio"][data-accent="crimson"]{
  --brand:#b3243a;--brand-2:#b3243a;--brand-deep:#8c1a2c;--brand-tint:#fce9ec;
  --pri-from:#cc2a44;--pri-to:#cc2a44;--pri-from-h:#b3243a;--pri-to-h:#b3243a;
  --pri-line:#b3243a;--pri-glow:rgba(204,42,68,.13);--on-brand:#fff;
  --brand-ring:rgba(204,42,68,.22);--side-on-bg:#f9dfe4;--side-on-ink:#8c1a2c;
  --newbtn-bg-h:#fce9ec;--newbtn-line-h:#b3243a;--unread-bg:#fdecef;
  --seal-hi:#f2c2cb;--seal-core:#cc2a44;--seal-crack:#5a0e1b}
:root[data-layout="studio"][data-accent="crimson"][data-theme="dark"]{
  --brand:#f58a9c;--brand-2:#f58a9c;--brand-deep:#ffb3c0;--brand-tint:#4a2028;
  --pri-from:#f58a9c;--pri-to:#f58a9c;--pri-from-h:#ffa3b3;--pri-to-h:#ffa3b3;
  --pri-line:#f58a9c;--on-brand:#3d0a14;--side-on-bg:#4a2028;--side-on-ink:#ffb3c0;
  --newbtn-bg-h:#4a2028;--newbtn-line-h:#f58a9c;
  --seal-hi:#ffc9d2;--seal-core:#f58a9c;--seal-crack:#52242c}

/* Graphite — 11.31 on white · 16.83 under white · 10.75 on dark.
   The one with no hue at all. Every status colour in the interface still does
   its job; this only removes the accent competing with them. */
:root[data-layout="studio"][data-accent="graphite"]{
  --brand:#3a3a3f;--brand-2:#3a3a3f;--brand-deep:#1d1d1f;--brand-tint:#ededf1;
  --pri-from:#1d1d1f;--pri-to:#1d1d1f;--pri-from-h:#39393e;--pri-to-h:#39393e;
  --pri-line:#1d1d1f;--pri-glow:rgba(29,29,31,.13);--on-brand:#fff;
  --brand-ring:rgba(29,29,31,.22);--side-on-bg:#e4e4e9;--side-on-ink:#1d1d1f;
  --newbtn-bg-h:#ededf1;--newbtn-line-h:#3a3a3f;--unread-bg:#f0f0f3;
  --seal-hi:#c7c7ce;--seal-core:#3a3a3f;--seal-crack:#1d1d1f}
:root[data-layout="studio"][data-accent="graphite"][data-theme="dark"]{
  --brand:#c7c7ce;--brand-2:#c7c7ce;--brand-deep:#e0e0e7;--brand-tint:#333338;
  --pri-from:#e8e8ed;--pri-to:#e8e8ed;--pri-from-h:#fff;--pri-to-h:#fff;
  --pri-line:#e8e8ed;--on-brand:#1d1d1f;--side-on-bg:#333338;--side-on-ink:#e0e0e7;
  --newbtn-bg-h:#333338;--newbtn-line-h:#c7c7ce;
  --seal-hi:#e0e0e7;--seal-core:#c7c7ce;--seal-crack:#39393e}
`;
