/* DOCKET design system.
   Typefaces are self-hosted and bundled by Vite (imported in main.jsx):
   Geist for the interface, Source Serif 4 for display, Geist Mono for
   references, timestamps and money. No webfont CDN, no layout shift. */

export const CSS = `
:root{
  /* typefaces */
  --font-sans:'Geist Variable',ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;
  --font-serif:'Source Serif 4 Variable',ui-serif,Charter,Georgia,serif;
  --font-mono:'Geist Mono Variable',ui-monospace,SFMono-Regular,Menlo,monospace;

  /* surfaces + ink */
  --paper:#F4F3ED; --paper-2:#EFEEE6; --card:#FFFFFF; --sunk:#FAF9F3;
  --ink:#141F1B; --muted:#59645D; --faint:#828C85;
  --line:#E3E1D5; --line2:#CFCDBF; --hair:rgba(20,31,27,.07);

  /* brand */
  --green:#245C48; --green-deep:#12362A; --green-tint:#E2EDE7; --green-ring:rgba(36,92,72,.16);
  --wax:#A9331F; --wax-tint:#F7E7E1;
  --brass:#8A6A14; --brass-tint:#F2EBD6;

  /* sidebar */
  --side:#12241D; --side-ink:#DCE5DE; --side-dim:#87998F;

  /* radii */
  --r-xs:5px; --r-sm:7px; --r:10px; --r-lg:14px;

  /* elevation — tinted to the paper, never neutral grey */
  --shadow:0 1px 1px rgba(20,31,27,.04),0 1px 2px rgba(20,31,27,.05);
  --sh-2:0 1px 2px rgba(20,31,27,.04),0 4px 10px -2px rgba(20,31,27,.07);
  --sh-3:0 2px 4px rgba(20,31,27,.05),0 12px 28px -6px rgba(20,31,27,.13);
  --inset-hi:inset 0 1px 0 rgba(255,255,255,.09);

  /* motion */
  --ease:cubic-bezier(.4,0,.2,1); --t:150ms;
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
  background:linear-gradient(180deg,#16291F 0%,var(--side) 46%,#0E1F18 100%);
  box-shadow:inset -1px 0 0 rgba(0,0,0,.35),1px 0 0 rgba(255,255,255,.03)}
.wordmark{display:flex;align-items:center;gap:10px;padding:0 18px 17px;border-bottom:1px solid rgba(220,229,222,.11);margin-bottom:12px}
.wordmark .seal{width:13px;height:13px;border-radius:50%;flex-shrink:0;
  background:radial-gradient(circle at 34% 32%,#E0674C,var(--wax) 68%);
  box-shadow:0 0 0 2.5px rgba(212,85,61,.22),0 1px 3px rgba(0,0,0,.4)}
.wordmark b{font-family:var(--font-serif);font-weight:600;font-size:18px;letter-spacing:.15em;color:#fff}
.orgline{padding:0 18px 14px;font-size:11.5px;color:var(--side-dim);line-height:1.5;letter-spacing:0}
.navsec{padding:12px 18px 4px;font-family:var(--font-mono);font-size:9.5px;font-weight:500;
  letter-spacing:.18em;color:#6B7D74;text-transform:uppercase}
.navi{display:flex;align-items:center;gap:9px;width:100%;text-align:left;background:none;border:0;color:var(--side-dim);
  padding:8px 18px;font-size:13.5px;font-weight:450;border-left:2.5px solid transparent;
  transition:color var(--t) var(--ease),background var(--t) var(--ease)}
.navi:hover{color:var(--side-ink);background:rgba(255,255,255,.035)}
.navi.on{color:#fff;font-weight:550;border-left-color:var(--wax);background:linear-gradient(90deg,rgba(169,51,31,.16),rgba(255,255,255,.02) 70%)}
.side .spacer{flex:1}
.newbtn{margin:14px 14px 0;padding:9px 12px;border-radius:var(--r-sm);border:1px solid rgba(220,229,222,.22);
  background:rgba(255,255,255,.05);color:var(--side-ink);font-weight:550;font-size:13px;
  box-shadow:var(--inset-hi);transition:background var(--t) var(--ease),border-color var(--t) var(--ease)}
.newbtn:hover{background:rgba(255,255,255,.11);border-color:rgba(220,229,222,.36)}
.sidefoot{padding:14px 18px 0;font-size:10.5px;color:#6B7D74;letter-spacing:.01em}

/* topbar + content */
.main{flex:1;display:flex;flex-direction:column;min-width:0}
.topbar{display:flex;align-items:center;gap:14px;padding:11px 26px;background:rgba(255,255,255,.86);
  backdrop-filter:saturate(160%) blur(8px);border-bottom:1px solid var(--line);
  box-shadow:0 1px 2px rgba(20,31,27,.03);position:relative;z-index:20}
.topbar .crumb{font-family:var(--font-mono);font-size:11px;font-weight:450;color:var(--muted);letter-spacing:.04em}
.topbar .grow{flex:1}
.whoami{display:flex;align-items:center;gap:10px}
.whoami .avatar{width:29px;height:29px;border-radius:50%;flex-shrink:0;color:#fff;display:flex;align-items:center;
  justify-content:center;font-size:11px;font-weight:600;letter-spacing:.02em;
  background:linear-gradient(155deg,var(--green) 0%,var(--green-deep) 100%);
  box-shadow:0 1px 3px rgba(18,54,42,.3),var(--inset-hi)}
/* padding-right clears the native chevron — long role labels ran under it */
.whoami select{border:1px solid var(--line2);border-radius:var(--r-sm);padding:6px 28px 6px 9px;background:var(--card);
  font-size:13px;max-width:308px;box-shadow:var(--shadow);transition:border-color var(--t) var(--ease)}
.whoami select:hover{border-color:var(--faint)}
.content{flex:1;overflow-y:auto;padding:28px 26px 40px;min-width:0}
.pagehead{display:flex;align-items:flex-end;gap:14px;margin:2px 0 20px;flex-wrap:wrap}
.pagehead h1{font-family:var(--font-serif);font-weight:600;font-size:27px;margin:0;letter-spacing:-.018em;line-height:1.15}
.pagehead .sub{color:var(--muted);font-size:13px;padding-bottom:3px;letter-spacing:0}
.pagehead .grow{flex:1}

/* atoms */
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow)}
.card .chead{display:flex;align-items:center;gap:10px;padding:13px 16px;border-bottom:1px solid var(--line);flex-wrap:wrap}
.card .chead h3{margin:0;font-size:13px;font-weight:600;letter-spacing:-.006em}
.cbody{padding:15px 16px}
.mono{font-family:var(--font-mono);font-size:12px;font-weight:450;letter-spacing:0;font-variant-numeric:tabular-nums}
.money{font-family:var(--font-mono);font-weight:500;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.muted{color:var(--muted)} .faint{color:var(--faint)} .waxfg{color:var(--wax)} .greenfg{color:var(--green)}
.stamp{display:inline-flex;align-items:center;font-family:var(--font-mono);font-size:9.5px;font-weight:550;
  letter-spacing:.11em;text-transform:uppercase;padding:3.5px 8px;border-radius:var(--r-xs);
  border:1px solid currentColor;white-space:nowrap}
/* status vocabulary is always a stamp; the tone variants carry their own colour
   where there is no STATUS entry to read one from (e.g. award approval). */
.stamp.gold{color:#6B5215;background:var(--brass-tint);border-color:rgba(107,82,21,.34)}
.chip{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:450;padding:2.5px 9px;border-radius:99px;
  border:1px solid var(--line);color:var(--muted);background:var(--card);white-space:nowrap;font-variant-numeric:tabular-nums}
.chip.warn{color:var(--wax);border-color:#E4B7AC;background:var(--wax-tint)}
.chip.ok{color:var(--green);border-color:#BAD3C7;background:var(--green-tint)}
.chip.gold{color:var(--brass);border-color:#DCCC9A;background:var(--brass-tint)}

.btn{padding:8px 14px;border-radius:var(--r-sm);border:1px solid var(--line2);background:var(--card);
  font-weight:550;font-size:13px;color:var(--ink);letter-spacing:-.004em;box-shadow:var(--shadow);
  transition:background var(--t) var(--ease),border-color var(--t) var(--ease),box-shadow var(--t) var(--ease),transform var(--t) var(--ease)}
.btn:hover{border-color:var(--faint);background:#FDFDFB;box-shadow:var(--sh-2)}
.btn:active{transform:translateY(.5px);box-shadow:var(--shadow)}
.btn.pri{background:linear-gradient(180deg,#1B4838 0%,var(--green-deep) 100%);border-color:#0C2A20;color:#fff;
  box-shadow:0 1px 2px rgba(12,42,32,.28),var(--inset-hi)}
.btn.pri:hover{background:linear-gradient(180deg,#26614B 0%,#164033 100%);border-color:#0C2A20;
  box-shadow:0 2px 8px -1px rgba(12,42,32,.34),var(--inset-hi)}
.btn.wax{background:linear-gradient(180deg,#B93A24 0%,var(--wax) 100%);border-color:#8E2A19;color:#fff;
  box-shadow:0 1px 2px rgba(142,42,25,.28),var(--inset-hi)}
.btn.wax:hover{background:linear-gradient(180deg,#C6402A 0%,#9E2F1C 100%);
  box-shadow:0 2px 8px -1px rgba(142,42,25,.34),var(--inset-hi)}
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
.stat .v{font-family:var(--font-serif);font-size:29px;font-weight:600;margin-top:5px;letter-spacing:-.022em;
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
.stg.done.wax .dot{background:var(--wax);border-color:var(--wax);box-shadow:0 0 0 3px rgba(169,51,31,.15)}
.stg.done.gold .dot{background:var(--brass);border-color:var(--brass);box-shadow:0 0 0 3px rgba(138,106,20,.15)}
.stg .sk{font-family:var(--font-mono);font-size:9.5px;font-weight:500;letter-spacing:.09em;text-transform:uppercase;color:var(--faint)}
.stg.done .sk{color:var(--ink);font-weight:550}
.stg .sd{font-family:var(--font-mono);font-size:9.5px;color:var(--faint);font-variant-numeric:tabular-nums}

/* seals + ceremony */
.sealrow{display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid var(--line);border-radius:var(--r-sm);background:var(--sunk)}
.sealdot{width:15px;height:15px;border-radius:50%;flex-shrink:0;
  background:radial-gradient(circle at 34% 32%,#E0674C,var(--wax) 70%);
  box-shadow:0 0 0 3px rgba(169,51,31,.13),0 1px 3px rgba(142,42,25,.3)}
.ceremony{border:1.5px dashed #D9A797;border-radius:var(--r);background:linear-gradient(180deg,#FBF0EC,var(--wax-tint));
  padding:28px;text-align:center;box-shadow:var(--shadow)}
.ceremony h3{font-family:var(--font-serif);font-size:21px;font-weight:600;letter-spacing:-.018em;margin:9px 0 7px}
.receipt{border:1.5px solid var(--wax);border-radius:var(--r);background:var(--card);padding:26px;text-align:center;box-shadow:var(--sh-2)}
.letter{white-space:pre-wrap;border:1px solid var(--line);border-left:3px solid var(--brass);border-radius:var(--r-sm);
  background:#FCFBF6;padding:16px 18px;font-family:var(--font-serif);font-size:14.5px;line-height:1.65;
  letter-spacing:0;margin-top:10px;box-shadow:var(--shadow)}

/* meter */
.meter{height:6px;border-radius:99px;background:var(--line);overflow:hidden;box-shadow:inset 0 1px 1px rgba(20,31,27,.05)}
.meter>div{height:100%;background:linear-gradient(90deg,var(--green),#2E7259);border-radius:99px;transition:width .4s var(--ease)}

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
.aihint{border:1px solid var(--line);border-left:3px solid var(--brass);border-radius:var(--r-sm);background:#FCFBF6;
  padding:13px 15px;font-size:13px;white-space:pre-wrap;line-height:1.6}
.empty{padding:30px;text-align:center;color:var(--faint);font-size:13px;line-height:1.6}
.qa{padding:13px 15px;border:1px solid var(--line);border-radius:var(--r-sm);background:var(--sunk);margin-bottom:10px}
.notice{border:1px solid var(--line);border-radius:var(--r-sm);padding:11px 13px;font-size:12.5px;color:var(--muted);
  background:var(--sunk);line-height:1.55}
.addm{border:1px solid #E4D6AC;border-left:3px solid var(--brass);border-radius:var(--r-sm);background:var(--brass-tint);
  padding:12px 14px;margin-bottom:10px;font-size:13px;line-height:1.55}

@media(max-width:960px){
  .dk{flex-direction:column;height:auto;min-height:100vh}
  .side{width:100%;flex-direction:row;align-items:center;flex-wrap:wrap;padding:10px;
    background:linear-gradient(180deg,#16291F,#0E1F18);box-shadow:0 1px 0 rgba(0,0,0,.3)}
  .wordmark{border:0;padding:0 12px;margin:0}
  .orgline,.navsec,.sidefoot{display:none}
  .navi{width:auto;padding:7px 10px;border-left:0;border-bottom:2px solid transparent}
  .navi.on{border-bottom-color:var(--wax);background:none}
  .newbtn{margin:0 8px}
  .g4,.g3{grid-template-columns:repeat(2,1fr)} .g2,.grid2{grid-template-columns:minmax(0,1fr)}
  .content{padding:18px 16px 32px}
  .topbar{padding:10px 16px}
  .pagehead h1{font-size:23px}
  .stages{flex-wrap:wrap;gap:10px 0}
  .stg{flex:1 0 33%}
}
@media(prefers-reduced-motion:reduce){
  .dk *,.loginwrap *{transition-duration:0ms!important;animation-duration:0ms!important}
}
`;

export const EXTRA_CSS = `
.bellwrap{position:relative}
.bellwrap .btn.hasnew{border-color:#E4B7AC;color:var(--wax);background:var(--wax-tint)}
.ndrop{position:absolute;right:0;top:42px;width:368px;max-height:440px;overflow-y:auto;z-index:60;
  background:var(--card);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--sh-3)}
.nitem{padding:12px 14px;border-bottom:1px solid var(--hair);font-size:12.5px;line-height:1.5}
.nitem:last-child{border-bottom:0}
.nitem .ns{font-weight:600;margin-bottom:2px;letter-spacing:-.004em}
.nitem .nb{color:var(--muted);line-height:1.5}
.nitem.unread{background:#FBFAF4;border-left:3px solid var(--wax)}

.loginwrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;
  font-family:var(--font-sans);font-size:14px;line-height:1.5;color:var(--ink);letter-spacing:-.005em;
  -webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;font-optical-sizing:auto;
  background:radial-gradient(1100px 620px at 50% -12%,#FBFAF5 0%,var(--paper) 52%,var(--paper-2) 100%)}
.loginwrap button{font:inherit;letter-spacing:inherit;cursor:pointer}
.loginwrap input{font:inherit;letter-spacing:inherit;color:var(--ink)}
.loginwrap :focus-visible{outline:2px solid var(--green);outline-offset:2px;border-radius:var(--r-xs)}
.loginwrap .card{box-shadow:var(--sh-3)}
.logincard{width:100%;max-width:428px}
.loginlogo{display:flex;align-items:center;gap:11px;justify-content:center;margin-bottom:20px}
.loginlogo .seal{width:15px;height:15px;border-radius:50%;flex-shrink:0;
  background:radial-gradient(circle at 34% 32%,#E0674C,var(--wax) 70%);
  box-shadow:0 0 0 3px rgba(169,51,31,.15),0 1px 3px rgba(142,42,25,.28)}
.loginlogo b{font-family:var(--font-serif);font-size:24px;font-weight:600;letter-spacing:.17em;color:var(--green-deep)}
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
  background:radial-gradient(circle at 34% 32%,#E0674C,var(--wax) 70%);
  box-shadow:0 0 0 3px rgba(169,51,31,.15);animation:pulse 1.6s var(--ease) infinite}
@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.55;transform:scale(.9)}}
`;
