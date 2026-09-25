import { BP } from "./breakpoints";
import { syncThemeChrome } from "./theme";

export function applyLayout(id) {
  if (id === "studio") document.documentElement.dataset.layout = "studio";
  else delete document.documentElement.dataset.layout;
  syncThemeChrome();
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
`;
