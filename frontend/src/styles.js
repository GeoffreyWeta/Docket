/* DOCKET design system.
   Typefaces are self-hosted and bundled by Vite (imported in main.jsx):
   Geist for the interface, Source Serif 4 for display, Geist Mono for
   references, timestamps and money. No webfont CDN, no layout shift. */

export const CSS = `
/* ============================================================ tokens
   Three themes live here and nowhere else: every colour, radius and
   shadow below is a variable, so a theme is a token block rather than a
   fork of the stylesheet. \`paper\` is the house look (legal stationery),
   \`material\` is a Material-flavoured surface (neutral surfaces, pill
   buttons, dp elevation, sans display, light navigation), \`night\` is the
   dark ledger. Contrast and CVD separation for all three are measured —
   see the note in ui.jsx before changing a status hue.
   ============================================================ */
:root,:root[data-theme="paper"]{
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

  /* brand */
  --green:#245C48; --green-2:#2E7259; --green-deep:#12362A;
  --green-tint:#E2EDE7; --green-ring:rgba(36,92,72,.16);
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
  --side-r:0; --side-mx:0;
  --newbtn-bg:rgba(255,255,255,.05); --newbtn-line:rgba(220,229,222,.22);
  --newbtn-bg-h:rgba(255,255,255,.11); --newbtn-line-h:rgba(220,229,222,.36);
  --wordmark-ink:#FFFFFF; --wordmark-rule:rgba(220,229,222,.11);

  /* radii */
  --r-xs:5px; --r-sm:7px; --r:10px; --r-lg:14px; --r-btn:var(--r-sm);

  /* elevation — tinted to the paper, never neutral grey */
  --shadow:0 1px 1px rgba(20,31,27,.04),0 1px 2px rgba(20,31,27,.05);
  --sh-2:0 1px 2px rgba(20,31,27,.04),0 4px 10px -2px rgba(20,31,27,.07);
  --sh-3:0 2px 4px rgba(20,31,27,.05),0 12px 28px -6px rgba(20,31,27,.13);
  --inset-hi:inset 0 1px 0 rgba(255,255,255,.09);
  --btn-shadow:var(--shadow); --card-shadow:var(--shadow);

  /* motion */
  --ease:cubic-bezier(.4,0,.2,1); --t:150ms;
}

/* ---- Material-flavoured: neutral surfaces, dp elevation, pill buttons,
        sans display, a light navigation drawer ---- */
:root[data-theme="material"]{
  --font-display:var(--font-sans);
  --paper:#F4F6F4; --paper-2:#EDF2EE; --card:#FFFFFF; --sunk:#F1F5F2;
  --ink:#191C1A; --muted:#414942; --faint:#6B756E;
  --line:#D7DED9; --line2:#BEC8C1; --hair:rgba(25,28,26,.08);
  --btn-hover:#F6FAF7;
  --topbar-bg:rgba(255,255,255,.92);
  --scrim:rgba(25,28,26,.46);
  --skel-hi:#F7FAF8;
  --tip-bg:#2E322F; --tip-ink:#FFFFFF;
  --green-tint:#D7EBE0; --green-ring:rgba(36,92,72,.2);
  --wax-tint:#FBE4DE; --brass-tint:#F5EEDC;
  --letter-bg:#F7FAF8; --ceremony-from:#FBEDE9; --ceremony-line:#E2B4A6;
  --addm-line:#E7DBB6; --unread-bg:#F1F7F3; --login-glow:#FFFFFF;
  --side:#EDF2EE; --side-from:#EDF2EE; --side-to:#E7EDE9;
  --side-ink:#1B1F1C; --side-dim:#47504A; --side-sec:#5C665F;
  --side-hover:rgba(25,28,26,.05); --side-on-bg:var(--green-tint);
  --side-on-ink:var(--green-deep); --side-on-line:transparent;
  --side-edge:inset -1px 0 0 rgba(25,28,26,.08);
  --side-r:999px; --side-mx:8px;
  --newbtn-bg:var(--green-tint); --newbtn-line:transparent;
  --newbtn-bg-h:#C8E2D6; --newbtn-line-h:transparent;
  --wordmark-ink:var(--green-deep); --wordmark-rule:rgba(25,28,26,.1);
  --r-xs:4px; --r-sm:8px; --r:12px; --r-lg:16px; --r-btn:999px;
  --shadow:0 1px 2px rgba(25,28,26,.1),0 1px 3px 1px rgba(25,28,26,.06);
  --sh-2:0 1px 2px rgba(25,28,26,.1),0 2px 6px 2px rgba(25,28,26,.07);
  --sh-3:0 4px 8px 3px rgba(25,28,26,.1),0 1px 3px rgba(25,28,26,.12);
  --inset-hi:none;
  --btn-shadow:none; --card-shadow:none;
}

/* ---- night ledger: dark surfaces, brighter status hues (validated against
        the dark card surface), brass kept as the accent ---- */
:root[data-theme="night"]{
  color-scheme:dark;
  --paper:#0F1613; --paper-2:#0B120F; --card:#16211C; --sunk:#121B17;
  --ink:#E4EBE6; --muted:#A3B0A8; --faint:#7C8A83;
  --line:#253029; --line2:#35443C; --hair:rgba(228,235,230,.09);
  --on-brand:#08120D;
  --btn-hover:#1C2822;
  --topbar-bg:rgba(15,22,19,.86);
  --scrim:rgba(4,8,6,.62);
  --skel-hi:#1B2620;
  --tip-bg:#E4EBE6; --tip-ink:#0F1613;
  --green:#3FA97C; --green-2:#4FBE8C; --green-deep:#8FD9B6;
  --green-tint:rgba(63,169,124,.16); --green-ring:rgba(63,169,124,.26);
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
  --newbtn-bg:rgba(255,255,255,.06); --newbtn-line:rgba(214,226,218,.2);
  --newbtn-bg-h:rgba(255,255,255,.12); --newbtn-line-h:rgba(214,226,218,.34);
  --shadow:0 1px 2px rgba(0,0,0,.4);
  --sh-2:0 2px 6px rgba(0,0,0,.45);
  --sh-3:0 8px 26px -4px rgba(0,0,0,.6);
  --inset-hi:inset 0 1px 0 rgba(255,255,255,.05);
}
*{box-sizing:border-box}

.dk{display:flex;height:100vh;width:100%;background:var(--paper);color:var(--ink);
  font-family:var(--font-sans);font-size:14px;line-height:1.5;font-weight:400;
  letter-spacing:-.005em;font-optical-sizing:auto;
  -webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:optimizeLegibility}
.dk ::selection{background:var(--green-tint);color:var(--green-deep)}
.dk button{font:inherit;letter-spacing:inherit;cursor:pointer}
.dk input,.dk select,.dk textarea{font:inherit;letter-spacing:inherit;color:var(--ink)}
.dk :focus-visible{outline:2px solid var(--green);outline-offset:2px;border-radius:var(--r-xs)}
.dk h1,.dk h2,.dk h3{font-weight:600}

/* thin, themed scrollbars */
.dk *{scrollbar-width:thin;scrollbar-color:var(--line2) transparent}
.dk *::-webkit-scrollbar{width:10px;height:10px}
.dk *::-webkit-scrollbar-track{background:transparent}
.dk *::-webkit-scrollbar-thumb{background:var(--line2);border-radius:99px;border:3px solid transparent;background-clip:content-box}
.dk *::-webkit-scrollbar-thumb:hover{background:var(--faint);background-clip:content-box}

/* sidebar */
.side{width:224px;flex-shrink:0;color:var(--side-ink);display:flex;flex-direction:column;padding:20px 0 16px;
  background:linear-gradient(180deg,var(--side-from) 0%,var(--side) 46%,var(--side-to) 100%);
  box-shadow:var(--side-edge)}
.wordmark{display:flex;align-items:center;gap:10px;padding:0 18px 17px;border-bottom:1px solid var(--wordmark-rule);margin-bottom:12px}
.wordmark .seal{width:13px;height:13px;border-radius:50%;flex-shrink:0;
  background:radial-gradient(circle at 34% 32%,var(--seal-hi),var(--seal-core) 68%);
  box-shadow:0 0 0 2.5px color-mix(in srgb,var(--seal-hi) 30%,transparent),0 1px 3px rgba(0,0,0,.4)}
.wordmark b{font-family:var(--font-serif);font-weight:600;font-size:18px;letter-spacing:.15em;color:var(--wordmark-ink)}
.orgline{padding:0 18px 14px;font-size:11.5px;color:var(--side-dim);line-height:1.5;letter-spacing:0}
.navsec{padding:12px 18px 4px;font-family:var(--font-mono);font-size:9.5px;font-weight:500;
  letter-spacing:.18em;color:var(--side-sec);text-transform:uppercase}
.navi{display:flex;align-items:center;gap:9px;width:100%;text-align:left;background:none;border:0;color:var(--side-dim);
  padding:8px 18px;font-size:13.5px;font-weight:450;border-left:2.5px solid transparent;
  transition:color var(--t) var(--ease),background var(--t) var(--ease)}
.navi:hover{color:var(--side-ink);background:var(--side-hover)}
.navi.on{color:var(--side-on-ink);font-weight:550;border-left-color:var(--side-on-line);background:var(--side-on-bg)}
.side .spacer{flex:1}
.newbtn{margin:14px 14px 0;padding:9px 12px;border-radius:var(--r-sm);border:1px solid var(--newbtn-line);
  background:var(--newbtn-bg);color:var(--side-ink);font-weight:550;font-size:13px;
  box-shadow:var(--inset-hi);transition:background var(--t) var(--ease),border-color var(--t) var(--ease)}
.newbtn:hover{background:var(--newbtn-bg-h);border-color:var(--newbtn-line-h)}
.sidefoot{padding:14px 18px 0;font-size:10.5px;color:var(--side-sec);letter-spacing:.01em}

/* topbar + content */
.main{flex:1;display:flex;flex-direction:column;min-width:0}
.topbar{display:flex;align-items:center;gap:14px;padding:11px 26px;background:var(--topbar-bg);
  backdrop-filter:saturate(160%) blur(8px);border-bottom:1px solid var(--line);
  box-shadow:var(--shadow);position:relative;z-index:20}
.topbar .crumb{font-family:var(--font-mono);font-size:11px;font-weight:450;color:var(--muted);letter-spacing:.04em}
.topbar .grow{flex:1}
.whoami{display:flex;align-items:center;gap:10px}
.whoami .avatar{width:29px;height:29px;border-radius:50%;flex-shrink:0;color:var(--on-brand);display:flex;align-items:center;
  justify-content:center;font-size:11px;font-weight:600;letter-spacing:.02em;
  background:linear-gradient(155deg,var(--green) 0%,var(--pri-to) 100%);
  box-shadow:var(--shadow),var(--inset-hi)}
/* padding-right clears the native chevron — long role labels ran under it */
.whoami select{border:1px solid var(--line2);border-radius:var(--r-sm);padding:6px 28px 6px 9px;background:var(--card);
  font-size:13px;max-width:308px;box-shadow:var(--shadow);transition:border-color var(--t) var(--ease)}
.whoami select:hover{border-color:var(--faint)}
.content{flex:1;overflow-y:auto;padding:28px 26px 40px;min-width:0}
.pagehead{display:flex;align-items:flex-end;gap:14px;margin:2px 0 20px;flex-wrap:wrap}
.pagehead h1{font-family:var(--font-display);font-weight:600;font-size:27px;margin:0;letter-spacing:-.018em;line-height:1.15}
.pagehead .sub{color:var(--muted);font-size:13px;padding-bottom:3px;letter-spacing:0}
.pagehead .grow{flex:1}

/* atoms */
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--card-shadow)}
.card .chead{display:flex;align-items:center;gap:10px;padding:13px 16px;border-bottom:1px solid var(--line);flex-wrap:wrap}
.card .chead h3{margin:0;font-size:13px;font-weight:600;letter-spacing:-.006em}
.cbody{padding:15px 16px}
.mono{font-family:var(--font-mono);font-size:12px;font-weight:450;letter-spacing:0;font-variant-numeric:tabular-nums}
.money{font-family:var(--font-mono);font-weight:500;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.muted{color:var(--muted)} .faint{color:var(--faint)} .waxfg{color:var(--wax)} .greenfg{color:var(--green)}
.stamp{display:inline-flex;align-items:center;font-family:var(--font-mono);font-size:9.5px;font-weight:550;
  letter-spacing:.11em;text-transform:uppercase;padding:3.5px 8px;border-radius:var(--r-xs);
  border:1px solid color-mix(in srgb,currentColor 33%,transparent);white-space:nowrap;
  background:var(--st-bg,transparent);color:var(--st-fg,var(--muted))}
/* status stamps: foregrounds darkened against their own tint so the small
   uppercase label clears WCAG AA on the badge, in every theme */
.st-draft{--st-fg:#4E5852;--st-bg:#ECEBE3}
.st-approval{--st-fg:#75590E;--st-bg:#F6EFDC}
.st-published{--st-fg:#1E5240;--st-bg:#E1EDE6}
.st-closed{--st-fg:#962B19;--st-bg:#F8E8E2}
.st-evaluation{--st-fg:#0E3527;--st-bg:#DBE8E0}
.st-awarded{--st-fg:#6B5215;--st-bg:#F3ECD9}
:root[data-theme="material"] .st-draft{--st-bg:#ECEFEC}
:root[data-theme="material"] .st-published{--st-bg:#D7EBE0}
:root[data-theme="material"] .st-closed{--st-bg:#FBE4DE}
:root[data-theme="material"] .st-evaluation{--st-bg:#DDEBE3}
:root[data-theme="material"] .st-awarded{--st-bg:#F5EEDC}
:root[data-theme="night"] .st-draft{--st-fg:#C3CDC7;--st-bg:rgba(195,205,199,.14)}
:root[data-theme="night"] .st-approval{--st-fg:#E6CA84;--st-bg:rgba(217,184,99,.16)}
:root[data-theme="night"] .st-published{--st-fg:#6FD3A6;--st-bg:rgba(63,169,124,.18)}
:root[data-theme="night"] .st-closed{--st-fg:#F09479;--st-bg:rgba(216,102,76,.18)}
:root[data-theme="night"] .st-evaluation{--st-fg:#8FD9B6;--st-bg:rgba(63,169,124,.14)}
:root[data-theme="night"] .st-awarded{--st-fg:#E6CA84;--st-bg:rgba(217,184,99,.14)}
/* status vocabulary is always a stamp; the tone variants carry their own colour
   where there is no STATUS entry to read one from (e.g. award approval). */
.stamp.gold{color:var(--gold-ink);background:var(--brass-tint);border-color:var(--chip-gold-line)}
.chip{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:450;padding:2.5px 9px;border-radius:99px;
  border:1px solid var(--line);color:var(--muted);background:var(--card);white-space:nowrap;font-variant-numeric:tabular-nums}
.chip.warn{color:var(--wax);border-color:var(--chip-warn-line);background:var(--wax-tint)}
.chip.ok{color:var(--green);border-color:var(--chip-ok-line);background:var(--green-tint)}
.chip.gold{color:var(--brass);border-color:var(--chip-gold-line);background:var(--brass-tint)}

.btn{padding:8px 14px;border-radius:var(--r-btn);border:1px solid var(--line2);background:var(--card);
  font-weight:550;font-size:13px;color:var(--ink);letter-spacing:-.004em;box-shadow:var(--btn-shadow);
  transition:background var(--t) var(--ease),border-color var(--t) var(--ease),box-shadow var(--t) var(--ease),transform var(--t) var(--ease)}
.btn:hover{border-color:var(--faint);background:var(--btn-hover);box-shadow:var(--sh-2)}
.btn:active{transform:translateY(.5px);box-shadow:var(--shadow)}
.btn.pri{background:linear-gradient(180deg,var(--pri-from) 0%,var(--pri-to) 100%);border-color:var(--pri-line);color:var(--on-brand);
  box-shadow:0 1px 2px color-mix(in srgb,var(--pri-line) 40%,transparent),var(--inset-hi)}
.btn.pri:hover{background:linear-gradient(180deg,var(--pri-from-h) 0%,var(--pri-to-h) 100%);border-color:var(--pri-line);
  box-shadow:0 2px 8px -1px color-mix(in srgb,var(--pri-line) 46%,transparent),var(--inset-hi)}
.btn.wax{background:linear-gradient(180deg,var(--wax-from) 0%,var(--wax-to) 100%);border-color:var(--wax-line);color:var(--on-brand);
  box-shadow:0 1px 2px color-mix(in srgb,var(--wax-line) 40%,transparent),var(--inset-hi)}
.btn.wax:hover{background:linear-gradient(180deg,var(--wax-from-h) 0%,var(--wax-to-h) 100%);
  box-shadow:0 2px 8px -1px color-mix(in srgb,var(--wax-line) 46%,transparent),var(--inset-hi)}
.btn.sm{padding:5px 10px;font-size:12px;border-radius:var(--r-xs)}
.btn:disabled{opacity:.42;cursor:not-allowed;box-shadow:none;transform:none}
.btn:disabled:hover{background:var(--card);border-color:var(--line2)}

.in,.dk textarea,.dk select.in{width:100%;padding:8px 11px;border:1px solid var(--line2);border-radius:var(--r-sm);
  background:var(--card);box-shadow:inset 0 1px 2px rgba(20,31,27,.04);
  transition:border-color var(--t) var(--ease),box-shadow var(--t) var(--ease)}
.in:hover,.dk textarea:hover{border-color:var(--faint)}
.in:focus,.dk textarea:focus,.dk select.in:focus{outline:0;border-color:var(--green);
  box-shadow:0 0 0 3px var(--green-ring),inset 0 1px 2px rgba(20,31,27,.03)}
.in::placeholder,.dk textarea::placeholder{color:var(--faint)}
.dk textarea{resize:vertical;min-height:92px;line-height:1.55}
.lbl{display:block;font-size:11.5px;font-weight:600;color:var(--muted);margin:0 0 6px;letter-spacing:.005em}
.frow{margin-bottom:14px}

/* tables */
.tbl{width:100%;border-collapse:collapse}
.tbl th{font-family:var(--font-mono);font-size:9.5px;font-weight:550;letter-spacing:.13em;text-transform:uppercase;
  color:var(--faint);text-align:left;padding:9px 12px;border-bottom:1px solid var(--line);white-space:nowrap}
.tbl td{padding:10px 12px;border-bottom:1px solid var(--hair);font-size:13px;vertical-align:middle}
.tbl tr:last-child td{border-bottom:0}
.tbl tr.click{cursor:pointer;transition:background var(--t) var(--ease)}
.tbl tr.click:hover td{background:var(--sunk)}
.tbl .num{text-align:right;font-variant-numeric:tabular-nums}
/* short mono data — refs, money, dates, counts — must never break mid-token;
   the (non-mono) title column absorbs the width instead */
.tbl .mono,.tbl .money{white-space:nowrap}
.tbl td.best{color:var(--green);font-weight:600}
.subtbl td{padding:6px 12px;font-size:12.5px;border-bottom:1px dashed var(--line)}
.subtbl tr:last-child td{border-bottom:0}
.breakrow>td{background:var(--sunk);padding:8px 14px 15px}

/* grids + stats */
.grid{display:grid;gap:14px}
.g4{grid-template-columns:repeat(4,1fr)} .g3{grid-template-columns:repeat(3,1fr)} .g2{grid-template-columns:repeat(2,1fr)}
.grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.stat{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:14px 16px;box-shadow:var(--shadow);
  transition:box-shadow var(--t) var(--ease),border-color var(--t) var(--ease)}
.stat:hover{box-shadow:var(--sh-2);border-color:var(--line2)}
.stat .k{font-family:var(--font-mono);font-size:9.5px;font-weight:550;letter-spacing:.14em;text-transform:uppercase;color:var(--faint)}
.stat .v{font-family:var(--font-display);font-size:29px;font-weight:600;margin-top:5px;letter-spacing:-.022em;
  line-height:1.1;font-variant-numeric:tabular-nums}
.stat .d{font-size:11.5px;color:var(--muted);margin-top:3px;line-height:1.45}

/* tabs */
.tabs{display:flex;gap:2px;border-bottom:1px solid var(--line);margin-bottom:17px;overflow-x:auto}
.tab{background:none;border:0;border-bottom:2px solid transparent;padding:9px 13px;font-family:var(--font-mono);
  font-size:10.5px;font-weight:550;letter-spacing:.11em;text-transform:uppercase;color:var(--muted);white-space:nowrap;
  transition:color var(--t) var(--ease),border-color var(--t) var(--ease)}
.tab:hover{color:var(--ink)}
.tab.on{color:var(--ink);border-bottom-color:var(--wax)}

/* stage tracker */
.stages{display:flex;margin:0 0 20px}
.stg{flex:1;min-width:0;position:relative;padding-top:16px;text-align:center}
.stg::before{content:"";position:absolute;top:5px;left:0;right:0;height:2px;background:var(--line2)}
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
.sealrow{display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid var(--line);border-radius:var(--r-sm);background:var(--sunk)}
.sealdot{width:15px;height:15px;border-radius:50%;flex-shrink:0;
  background:radial-gradient(circle at 34% 32%,var(--seal-hi),var(--seal-core) 70%);
  box-shadow:0 0 0 3px color-mix(in srgb,var(--seal-core) 20%,transparent),0 1px 3px color-mix(in srgb,var(--seal-core) 38%,transparent)}
.ceremony{border:1.5px dashed var(--ceremony-line);border-radius:var(--r);background:linear-gradient(180deg,var(--ceremony-from),var(--wax-tint));
  padding:28px;text-align:center;box-shadow:var(--shadow)}
.ceremony h3{font-family:var(--font-display);font-size:21px;font-weight:600;letter-spacing:-.018em;margin:9px 0 7px}
.receipt{border:1.5px solid var(--wax);border-radius:var(--r);background:var(--card);padding:26px;text-align:center;box-shadow:var(--sh-2)}
.letter{white-space:pre-wrap;border:1px solid var(--line);border-left:3px solid var(--brass);border-radius:var(--r-sm);
  background:var(--letter-bg);padding:16px 18px;font-family:var(--font-serif);font-size:14.5px;line-height:1.65;
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

/* misc */
.rowline{display:flex;align-items:center;gap:10px;padding:11px 0;border-bottom:1px solid var(--hair)}
.rowline:last-child{border-bottom:0}
.aihint{border:1px solid var(--line);border-left:3px solid var(--brass);border-radius:var(--r-sm);background:var(--letter-bg);
  padding:13px 15px;font-size:13px;white-space:pre-wrap;line-height:1.6}
.empty{padding:30px;text-align:center;color:var(--faint);font-size:13px;line-height:1.6}
.qa{padding:13px 15px;border:1px solid var(--line);border-radius:var(--r-sm);background:var(--sunk);margin-bottom:10px}
.notice{border:1px solid var(--line);border-radius:var(--r-sm);padding:11px 13px;font-size:12.5px;color:var(--muted);
  background:var(--sunk);line-height:1.55}
.addm{border:1px solid var(--addm-line);border-left:3px solid var(--brass);border-radius:var(--r-sm);background:var(--brass-tint);
  padding:12px 14px;margin-bottom:10px;font-size:13px;line-height:1.55}

@media(max-width:960px){
  .dk{flex-direction:column;height:auto;min-height:100vh}
  .side{width:100%;flex-direction:row;align-items:center;flex-wrap:wrap;padding:10px;
    background:linear-gradient(180deg,var(--side-from),var(--side-to));box-shadow:0 1px 0 rgba(0,0,0,.3)}
  .wordmark{border:0;padding:0 12px;margin:0}
  .orgline,.navsec,.sidefoot{display:none}
  .navi{width:auto;padding:7px 10px;border-left:0;border-bottom:2px solid transparent}
  .navi.on{border-bottom-color:var(--wax);background:none}
  .newbtn{margin:0 8px}
  .g4,.g3{grid-template-columns:repeat(2,1fr)} .g2,.grid2{grid-template-columns:minmax(0,1fr)}
  .content{padding:18px 16px 32px}
  /* the action buttons plus the account switcher exceed a phone's width, so the
     bar wraps and the switcher takes its own row rather than scrolling the page */
  .topbar{padding:10px 16px;flex-wrap:wrap;row-gap:9px}
  .whoami{flex:1 1 100%;min-width:0}
  .whoami select{flex:1;min-width:0;max-width:none}
  .pagehead h1{font-size:23px}
  .stages{flex-wrap:wrap;gap:10px 0}
  .stg{flex:1 0 33%}
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
:root[data-theme="material"] .btn{position:relative;overflow:hidden;font-weight:500;letter-spacing:.005em;padding:9px 18px}
:root[data-theme="material"] .btn.sm{padding:6px 13px}
:root[data-theme="material"] .btn::after{content:"";position:absolute;inset:0;pointer-events:none;border-radius:inherit;
  background:radial-gradient(circle at center,currentColor 14%,transparent 14.5%);
  opacity:0;transform:scale(.35);transition:transform .5s var(--ease),opacity .55s var(--ease)}
:root[data-theme="material"] .btn:active::after{opacity:.18;transform:scale(2.8);transition-duration:0s,0s}
:root[data-theme="material"] .btn.pri,:root[data-theme="material"] .btn.wax{border-color:transparent;box-shadow:none}
:root[data-theme="material"] .btn.pri{background:var(--green)}
:root[data-theme="material"] .btn.pri:hover{background:var(--pri-from-h);box-shadow:var(--shadow)}
:root[data-theme="material"] .btn.wax{background:var(--wax)}
:root[data-theme="material"] .btn.wax:hover{background:var(--wax-from-h);box-shadow:var(--shadow)}
:root[data-theme="material"] .btn:hover{box-shadow:var(--shadow)}
:root[data-theme="material"] .btn:active{transform:none}
:root[data-theme="material"] .in,:root[data-theme="material"] .dk textarea,:root[data-theme="material"] .dk select.in{
  background:var(--sunk);border:1px solid transparent;border-bottom:1.5px solid var(--line2);
  border-radius:var(--r-xs) var(--r-xs) 0 0;box-shadow:none}
:root[data-theme="material"] .in:hover,:root[data-theme="material"] .dk textarea:hover{background:var(--paper-2);border-bottom-color:var(--muted)}
:root[data-theme="material"] .in:focus,:root[data-theme="material"] .dk textarea:focus,
:root[data-theme="material"] .dk select.in:focus{border-bottom:2px solid var(--green);box-shadow:none;background:var(--card)}
:root[data-theme="material"] .navi{width:auto;border-left:0;border-radius:var(--side-r);
  margin:2px var(--side-mx);padding:9px 15px;font-weight:500}
:root[data-theme="material"] .navi.on{font-weight:600}
:root[data-theme="material"] .newbtn{border-radius:var(--r-btn);font-weight:500;color:var(--green-deep)}
:root[data-theme="material"] .tbl td{padding:12px}
:root[data-theme="material"] .tab.on{border-bottom-width:3px;border-bottom-color:var(--green)}
:root[data-theme="material"] .stat{border-radius:var(--r-lg)}
:root[data-theme="material"] .wordmark .seal{box-shadow:0 0 0 2.5px color-mix(in srgb,var(--seal-hi) 26%,transparent)}
:root[data-theme="material"] .side{padding-top:16px}
/* night: the paper objects need a touch more edge definition on dark surfaces */
:root[data-theme="night"] .letter,:root[data-theme="night"] .aihint{border-color:var(--line2)}
:root[data-theme="night"] .ceremony{background:var(--ceremony-from)}
:root[data-theme="night"] .receipt{background:var(--card)}
`;

export const EXTRA_CSS = `
.bellwrap{position:relative}
.bellwrap .btn.hasnew{border-color:var(--chip-warn-line);color:var(--wax);background:var(--wax-tint)}
.ndrop{position:absolute;right:0;top:42px;width:368px;max-height:440px;overflow-y:auto;z-index:60;
  background:var(--card);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--sh-3)}
.nitem{padding:12px 14px;border-bottom:1px solid var(--hair);font-size:12.5px;line-height:1.5}
.nitem:last-child{border-bottom:0}
.nitem .ns{font-weight:600;margin-bottom:2px;letter-spacing:-.004em}
.nitem .nb{color:var(--muted);line-height:1.5}
.nitem.unread{background:var(--unread-bg);border-left:3px solid var(--wax)}

.loginwrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;
  font-family:var(--font-sans);font-size:14px;line-height:1.5;color:var(--ink);letter-spacing:-.005em;
  -webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;font-optical-sizing:auto;
  background:radial-gradient(1100px 620px at 50% -12%,var(--login-glow) 0%,var(--paper) 52%,var(--paper-2) 100%)}
.loginwrap button{font:inherit;letter-spacing:inherit;cursor:pointer}
.loginwrap input{font:inherit;letter-spacing:inherit;color:var(--ink)}
.loginwrap :focus-visible{outline:2px solid var(--green);outline-offset:2px;border-radius:var(--r-xs)}
.loginwrap .card{box-shadow:var(--sh-3)}
.logincard{width:100%;max-width:428px}
.loginlogo{display:flex;align-items:center;gap:11px;justify-content:center;margin-bottom:20px}
.loginlogo .seal{width:15px;height:15px;border-radius:50%;flex-shrink:0;
  background:radial-gradient(circle at 34% 32%,var(--seal-hi),var(--seal-core) 70%);
  box-shadow:0 0 0 3px color-mix(in srgb,var(--seal-core) 22%,transparent),0 1px 3px color-mix(in srgb,var(--wax-line) 40%,transparent)}
.loginlogo b{font-family:var(--font-display);font-size:24px;font-weight:600;letter-spacing:.17em;color:var(--green-deep)}
.demogrid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.demogrid .btn{text-align:left;font-weight:450;font-size:12.5px;line-height:1.4;padding:9px 11px}
.docrow{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px dashed var(--line);font-size:13px}
.docrow:last-child{border-bottom:0}
.doclink{background:none;border:0;padding:0;color:var(--green);font-weight:550;text-align:left;cursor:pointer;font-size:13px;
  letter-spacing:-.004em;text-underline-offset:2px;transition:color var(--t) var(--ease)}
.doclink:hover{color:var(--green-deep);text-decoration:underline}

/* full-page loading state */
.booting{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;
  background:var(--paper);font-family:var(--font-sans);color:var(--muted);font-size:13.5px;letter-spacing:-.004em;
  -webkit-font-smoothing:antialiased}
.booting .seal{width:15px;height:15px;border-radius:50%;
  background:radial-gradient(circle at 34% 32%,var(--seal-hi),var(--seal-core) 70%);
  box-shadow:0 0 0 3px color-mix(in srgb,var(--seal-core) 22%,transparent);animation:pulse 1.6s var(--ease) infinite}
@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.55;transform:scale(.9)}}
`;
