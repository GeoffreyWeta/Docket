/* DOCKET design system — extracted verbatim from the reference build. */

export const CSS = `
:root{
  --paper:#F4F3ED; --card:#FFFFFF; --ink:#182420; --muted:#5F6A63; --faint:#8B948D;
  --line:#E1DFD3; --line2:#D3D1C4;
  --green:#245C48; --green-deep:#12362A; --green-tint:#E2EDE7;
  --wax:#A9331F; --wax-tint:#F7E7E1;
  --brass:#8A6A14; --brass-tint:#F2EBD6;
  --side:#12241D; --side-ink:#DCE5DE; --side-dim:#7E9188;
  --r:8px; --shadow:0 1px 2px rgba(18,36,29,.06);
}
*{box-sizing:border-box}
.dk{display:flex;height:100vh;width:100%;background:var(--paper);color:var(--ink);
  font-family:-apple-system,'Segoe UI','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;line-height:1.45;}
.dk ::selection{background:var(--green-tint)}
.dk button{font:inherit;cursor:pointer}
.dk input,.dk select,.dk textarea{font:inherit;color:var(--ink)}
.dk :focus-visible{outline:2px solid var(--green);outline-offset:2px;border-radius:4px}

/* sidebar */
.side{width:216px;flex-shrink:0;background:var(--side);color:var(--side-ink);display:flex;flex-direction:column;padding:18px 0 14px}
.wordmark{display:flex;align-items:center;gap:9px;padding:0 18px 16px;border-bottom:1px solid rgba(220,229,222,.12);margin-bottom:10px}
.wordmark .seal{width:13px;height:13px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#D4553D,var(--wax) 70%);box-shadow:0 0 0 2.5px rgba(212,85,61,.25)}
.wordmark b{font-family:Georgia,'Times New Roman',serif;font-weight:700;font-size:17px;letter-spacing:.14em}
.orgline{padding:0 18px 12px;font-size:11px;color:var(--side-dim);line-height:1.5}
.navsec{padding:10px 10px 2px;font-family:'Courier New',Courier,monospace;font-size:9.5px;letter-spacing:.16em;color:var(--side-dim);text-transform:uppercase}
.navi{display:flex;align-items:center;gap:8px;width:100%;text-align:left;background:none;border:0;color:var(--side-dim);
  padding:8px 18px;font-size:13.5px;border-left:3px solid transparent}
.navi:hover{color:var(--side-ink)}
.navi.on{color:#fff;border-left-color:var(--wax);background:rgba(255,255,255,.04)}
.side .spacer{flex:1}
.newbtn{margin:12px 14px 0;padding:9px 12px;border-radius:6px;border:1px solid rgba(220,229,222,.25);background:transparent;color:var(--side-ink);font-weight:600;font-size:13px}
.newbtn:hover{background:rgba(255,255,255,.07)}
.sidefoot{padding:12px 18px 0;font-size:10.5px;color:var(--side-dim)}

/* topbar + content */
.main{flex:1;display:flex;flex-direction:column;min-width:0}
.topbar{display:flex;align-items:center;gap:14px;padding:10px 26px;border-bottom:1px solid var(--line);background:var(--card)}
.topbar .crumb{font-family:'Courier New',Courier,monospace;font-size:11px;color:var(--muted);letter-spacing:.06em}
.topbar .grow{flex:1}
.whoami{display:flex;align-items:center;gap:10px}
.whoami .avatar{width:28px;height:28px;border-radius:50%;background:var(--green-deep);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600}
.whoami select{border:1px solid var(--line);border-radius:6px;padding:6px 8px;background:var(--card);font-size:13px;max-width:250px}
.content{flex:1;overflow-y:auto;padding:26px;min-width:0}
.pagehead{display:flex;align-items:flex-end;gap:14px;margin:2px 0 18px;flex-wrap:wrap}
.pagehead h1{font-family:Georgia,'Times New Roman',serif;font-weight:600;font-size:24px;margin:0;letter-spacing:-.01em}
.pagehead .sub{color:var(--muted);font-size:13px;padding-bottom:2px}
.pagehead .grow{flex:1}

/* atoms */
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow)}
.card .chead{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--line);flex-wrap:wrap}
.card .chead h3{margin:0;font-size:13px;font-weight:600}
.cbody{padding:14px 16px}
.mono{font-family:'Courier New',Courier,monospace;font-size:12px;letter-spacing:.01em}
.money{font-family:'Courier New',Courier,monospace;font-variant-numeric:tabular-nums}
.muted{color:var(--muted)} .faint{color:var(--faint)} .waxfg{color:var(--wax)} .greenfg{color:var(--green)}
.stamp{display:inline-flex;align-items:center;font-family:'Courier New',Courier,monospace;font-size:10px;letter-spacing:.1em;
  text-transform:uppercase;padding:3px 8px;border-radius:4px;border:1px solid currentColor;white-space:nowrap}
.chip{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;padding:2px 8px;border-radius:99px;border:1px solid var(--line);color:var(--muted);background:var(--card);white-space:nowrap}
.chip.warn{color:var(--wax);border-color:#E4B7AC;background:var(--wax-tint)}
.chip.ok{color:var(--green);border-color:#BAD3C7;background:var(--green-tint)}
.chip.gold{color:var(--brass);border-color:#DCCC9A;background:var(--brass-tint)}
.btn{padding:8px 14px;border-radius:6px;border:1px solid var(--line2);background:var(--card);font-weight:600;font-size:13px;color:var(--ink)}
.btn:hover{border-color:var(--faint)}
.btn.pri{background:var(--green-deep);border-color:var(--green-deep);color:#fff}
.btn.pri:hover{background:var(--green)}
.btn.wax{background:var(--wax);border-color:var(--wax);color:#fff}
.btn.wax:hover{filter:brightness(1.08)}
.btn.sm{padding:5px 10px;font-size:12px}
.btn:disabled{opacity:.45;cursor:not-allowed}
.in,.dk textarea,.dk select.in{width:100%;padding:8px 10px;border:1px solid var(--line2);border-radius:6px;background:var(--card)}
.dk textarea{resize:vertical;min-height:90px}
.lbl{display:block;font-size:11.5px;font-weight:600;color:var(--muted);margin:0 0 5px;letter-spacing:.02em}
.frow{margin-bottom:14px}

/* tables */
.tbl{width:100%;border-collapse:collapse}
.tbl th{font-family:'Courier New',Courier,monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--faint);
  text-align:left;padding:8px 12px;border-bottom:1px solid var(--line);font-weight:500}
.tbl td{padding:10px 12px;border-bottom:1px solid var(--line);font-size:13px;vertical-align:middle}
.tbl tr:last-child td{border-bottom:0}
.tbl tr.click{cursor:pointer}
.tbl tr.click:hover td{background:#FAF9F4}
.tbl .num{text-align:right}
.tbl td.best{color:var(--green);font-weight:600}
.subtbl td{padding:6px 12px;font-size:12.5px;border-bottom:1px dashed var(--line)}
.subtbl tr:last-child td{border-bottom:0}
.breakrow>td{background:#FBFAF6;padding:6px 14px 14px}

/* grids + stats */
.grid{display:grid;gap:14px}
.g4{grid-template-columns:repeat(4,1fr)} .g3{grid-template-columns:repeat(3,1fr)} .g2{grid-template-columns:repeat(2,1fr)}
.stat{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:13px 15px;box-shadow:var(--shadow)}
.stat .k{font-family:'Courier New',Courier,monospace;font-size:10px;letter-spacing:.13em;text-transform:uppercase;color:var(--faint)}
.stat .v{font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:600;margin-top:4px;letter-spacing:-.01em}
.stat .d{font-size:11.5px;color:var(--muted);margin-top:2px}

/* tabs */
.tabs{display:flex;gap:2px;border-bottom:1px solid var(--line);margin-bottom:16px;overflow-x:auto}
.tab{background:none;border:0;border-bottom:2px solid transparent;padding:8px 13px;font-family:'Courier New',Courier,monospace;
  font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);white-space:nowrap}
.tab.on{color:var(--ink);border-bottom-color:var(--wax)}

/* stage tracker */
.stages{display:flex;margin:0 0 18px}
.stg{flex:1;min-width:0;position:relative;padding-top:15px;text-align:center}
.stg::before{content:"";position:absolute;top:5px;left:0;right:0;height:2px;background:var(--line2)}
.stg:first-child::before{left:50%}
.stg:last-child::before{right:50%}
.stg.done::before{background:var(--green)}
.stg .dot{position:absolute;top:0;left:50%;transform:translateX(-50%);width:11px;height:11px;border-radius:50%;background:var(--card);border:2px solid var(--line2)}
.stg.done .dot{background:var(--green);border-color:var(--green)}
.stg.done.wax .dot{background:var(--wax);border-color:var(--wax)}
.stg.done.gold .dot{background:var(--brass);border-color:var(--brass)}
.stg .sk{font-family:'Courier New',Courier,monospace;font-size:9.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--faint)}
.stg.done .sk{color:var(--ink)}
.stg .sd{font-family:'Courier New',Courier,monospace;font-size:9.5px;color:var(--faint)}

/* seals + ceremony */
.sealrow{display:flex;align-items:center;gap:12px;padding:11px 14px;border:1px solid var(--line);border-radius:6px;background:#FBFAF6}
.sealdot{width:15px;height:15px;border-radius:50%;flex-shrink:0;background:radial-gradient(circle at 35% 35%,#D4553D,var(--wax) 72%);box-shadow:0 0 0 3px rgba(169,51,31,.14)}
.ceremony{border:1.5px dashed var(--wax);border-radius:var(--r);background:var(--wax-tint);padding:26px;text-align:center}
.ceremony h3{font-family:Georgia,'Times New Roman',serif;font-size:19px;margin:8px 0 6px}
.receipt{border:1.5px solid var(--wax);border-radius:var(--r);background:#fff;padding:24px;text-align:center}
.letter{white-space:pre-wrap;border:1px solid var(--line);border-left:3px solid var(--brass);border-radius:6px;background:#FCFBF6;padding:14px 16px;font-size:13px;line-height:1.6;margin-top:10px}

/* meter */
.meter{height:6px;border-radius:99px;background:var(--line);overflow:hidden}
.meter>div{height:100%;background:var(--green);border-radius:99px;transition:width .3s}

/* timeline */
.tline{list-style:none;margin:0;padding:0 0 0 4px}
.tline li{position:relative;padding:0 0 16px 22px;border-left:1px solid var(--line2)}
.tline li:last-child{border-left-color:transparent;padding-bottom:2px}
.tline li::before{content:"";position:absolute;left:-4.5px;top:4px;width:8px;height:8px;border-radius:50%;background:var(--card);border:2px solid var(--green)}
.tline li.waxdot::before{border-color:var(--wax)}
.tline .when{font-family:'Courier New',Courier,monospace;font-size:10.5px;color:var(--faint)}
.tline .what{font-weight:600;font-size:13px;margin:1px 0}
.tline .who{font-size:12px;color:var(--muted)}

/* misc */
.rowline{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--line)}
.rowline:last-child{border-bottom:0}
.aihint{border:1px solid var(--line);border-left:3px solid var(--brass);border-radius:6px;background:#FCFBF6;padding:12px 14px;font-size:13px;white-space:pre-wrap;line-height:1.55}
.empty{padding:26px;text-align:center;color:var(--faint);font-size:13px}
.qa{padding:12px 14px;border:1px solid var(--line);border-radius:6px;background:#FBFAF6;margin-bottom:10px}
.notice{border:1px solid var(--line);border-radius:6px;padding:10px 13px;font-size:12.5px;color:var(--muted);background:#FBFAF6}
.addm{border:1px solid #E4D6AC;border-left:3px solid var(--brass);border-radius:6px;background:var(--brass-tint);padding:11px 13px;margin-bottom:10px;font-size:13px}
@media(max-width:960px){
  .dk{flex-direction:column;height:auto;min-height:100vh}
  .side{width:100%;flex-direction:row;align-items:center;flex-wrap:wrap;padding:10px}
  .wordmark{border:0;padding:0 12px;margin:0}
  .orgline,.navsec,.sidefoot{display:none}
  .navi{width:auto;padding:7px 10px;border-left:0;border-bottom:2px solid transparent}
  .navi.on{border-bottom-color:var(--wax);background:none}
  .newbtn{margin:0 8px}
  .g4,.g3{grid-template-columns:repeat(2,1fr)} .g2{grid-template-columns:1fr}
  .content{padding:16px}
  .stages{flex-wrap:wrap;gap:10px 0}
  .stg{flex:1 0 33%}
}
`;

export const EXTRA_CSS = `
.bellwrap{position:relative}
.bellwrap .btn.hasnew{border-color:#E4B7AC;color:var(--wax)}
.ndrop{position:absolute;right:0;top:40px;width:360px;max-height:440px;overflow-y:auto;z-index:60;
  background:var(--card);border:1px solid var(--line);border-radius:var(--r);box-shadow:0 8px 28px rgba(18,36,29,.14)}
.nitem{padding:11px 14px;border-bottom:1px solid var(--line);font-size:12.5px}
.nitem:last-child{border-bottom:0}
.nitem .ns{font-weight:600;margin-bottom:2px}
.nitem .nb{color:var(--muted);line-height:1.45}
.nitem.unread{background:#FBFAF4;border-left:3px solid var(--wax)}
.loginwrap{min-height:100vh;background:var(--paper);display:flex;align-items:center;justify-content:center;padding:24px;
  font-family:-apple-system,'Segoe UI','Helvetica Neue',Helvetica,Arial,sans-serif;color:var(--ink)}
.logincard{width:100%;max-width:420px}
.loginlogo{display:flex;align-items:center;gap:10px;justify-content:center;margin-bottom:18px}
.loginlogo .seal{width:15px;height:15px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#D4553D,var(--wax) 72%);box-shadow:0 0 0 3px rgba(169,51,31,.16)}
.loginlogo b{font-family:Georgia,'Times New Roman',serif;font-size:22px;letter-spacing:.16em}
.demogrid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.demogrid .btn{text-align:left;font-weight:500;font-size:12.5px;line-height:1.35;padding:8px 10px}
.docrow{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px dashed var(--line);font-size:13px}
.docrow:last-child{border-bottom:0}
.doclink{background:none;border:0;padding:0;color:var(--green);font-weight:600;text-align:left;cursor:pointer;font-size:13px}
.doclink:hover{text-decoration:underline}
`;
