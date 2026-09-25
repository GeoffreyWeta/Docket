import { BP } from "./breakpoints";

// Deployment layout, independent of the reader's light/dark preference.
export const STUDIO_CSS = `
:root[data-layout="studio"]{
  --font-sans:-apple-system,BlinkMacSystemFont,'Geist Variable','Segoe UI',sans-serif;
  --paper:#f5f5f7;--paper-2:#ebebef;--card:#fff;--sunk:#f5f5f7;
  --ink:#1d1d1f;--muted:#55555c;--faint:#686870;--line:#dedee3;--line2:#c7c7ce;
  --brand:#0066cc;--brand-2:#0066cc;--brand-deep:#004d99;--brand-tint:#e7f1ff;
  --pri-from:#0066cc;--pri-to:#0066cc;--pri-from-h:#0055ad;--pri-to-h:#0055ad;
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
.lp[data-design="studio"]{
  --lp-bg:#fff;--lp-paper:#f5f5f7;--lp-card:#fff;
  --lp-ink:#1d1d1f;--lp-ink-2:#343438;--lp-muted:#55555c;--lp-faint:#686870;
  --lp-line:#dedee3;--lp-line-2:#c7c7ce;
  --lp-pri:#0066cc;--lp-pri-deep:#004d99;--lp-pri-dark:#1d1d1f;--lp-pri-tint:#e7f1ff;
  --lp-on-pri:#fff;--lp-on-band:#f5f5f7;--lp-on-band-muted:#c4c4ce;--lp-on-band-accent:#80baff;
  --lp-ok:#0b6e4f;--lp-warn:#8a5200;--lp-crit:#b02418;--lp-radius:22px;
  --t1:clamp(42px,6.5vw,88px);--t2:clamp(30px,4vw,48px);
  font-family:-apple-system,BlinkMacSystemFont,'Geist Variable','Segoe UI',sans-serif;
}
:root[data-theme="dark"] .lp[data-design="studio"]{
  --lp-bg:#161618;--lp-paper:#1e1e21;--lp-card:#232326;
  --lp-ink:#f5f5f7;--lp-ink-2:#d9d9df;--lp-muted:#b5b5be;--lp-faint:#a1a1ab;
  --lp-line:#39393e;--lp-line-2:#505058;
  --lp-pri:#80baff;--lp-pri-deep:#b6d7ff;--lp-pri-dark:#09090b;--lp-pri-tint:#203650;
  --lp-on-pri:#082343;--lp-ok:#60c99e;--lp-warn:#e3b168;--lp-crit:#ff9c91;
}
.lp[data-design="studio"] .lpbar{background:color-mix(in srgb,var(--lp-bg) 88%,transparent);backdrop-filter:blur(20px);border-bottom:1px solid var(--lp-line)}
.lp[data-design="studio"] .lputil{background:var(--lp-paper);color:var(--lp-muted)}
.lp[data-design="studio"] .lphero{padding-block:64px 72px;background:var(--lp-paper)}
.lp[data-design="studio"] .lphero::before,
.lp[data-design="studio"] .lpglow,
.lp[data-design="studio"] .lpheroart,
.lp[data-design="studio"] .lpfloat{display:none}
.lp[data-design="studio"] .lpherogrid{grid-template-columns:minmax(0,1fr);gap:52px}
.lp[data-design="studio"] .lpherocopy{text-align:center;max-width:860px;margin-inline:auto}
.lp[data-design="studio"] .lpkick{font-family:inherit;letter-spacing:.02em;text-transform:none;font-size:14px;font-weight:600}
.lp[data-design="studio"] .lpherocopy h1{font-weight:650;letter-spacing:-.055em;line-height:1.04;max-width:none}
.lp[data-design="studio"] .studio-headline{color:var(--lp-muted)}
.lp[data-design="studio"] .lplead{max-width:580px;margin:24px auto 0;font-size:clamp(17px,2vw,21px);line-height:1.5}
.lp[data-design="studio"] .lpacts{justify-content:center;gap:14px;margin-top:28px}
.lp[data-design="studio"] .btn{border-radius:999px;padding-inline:22px}
.lp[data-design="studio"] .lpticks{justify-content:center;flex-wrap:wrap;margin-top:22px;font-size:11px}
.lp[data-design="studio"] .lpheropanel{width:100%;max-width:980px;margin-inline:auto;border:1px solid var(--lp-line-2);border-radius:18px;overflow:hidden;background:var(--lp-card);box-shadow:0 28px 65px -30px rgba(0,0,0,.28)}
.lp[data-design="studio"] .lpheropanel .lppanel{border:0;border-radius:0;box-shadow:none}
.studio-window{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px;background:var(--lp-paper);border-bottom:1px solid var(--lp-line);color:var(--lp-muted);font-size:11px}
.studio-window>span:first-child{display:flex;gap:6px}
.studio-window i{width:8px;height:8px;border-radius:50%;background:var(--lp-line-2)}
.lp[data-design="studio"] .lphead{max-width:760px;margin:0 auto 44px;text-align:center}
.lp[data-design="studio"] .lpsec.tint{border:0}
.lp[data-design="studio"] .lprows{display:grid;gap:20px;border:0}
.lp[data-design="studio"] .lprows li{grid-template-columns:44px 1fr;align-content:start;gap:18px;padding:28px;background:var(--lp-card);border:1px solid var(--lp-line);border-radius:24px}
.lp[data-design="studio"] .lprows li h3,
.lp[data-design="studio"] .lprows li p,
.lp[data-design="studio"] .lprows li .lpmore{grid-column:1 / -1}
.lp[data-design="studio"] .lprows li::after{display:none}
.lp[data-design="studio"] .lprows .lpnum{text-align:right;align-self:center}
.lp[data-design="studio"] .lpnext article{padding:32px;border-radius:24px}
.lp[data-design="studio"] .lpticker{animation:none;width:auto;justify-content:center}
.lp[data-design="studio"] .lpticker ul{flex-wrap:wrap;justify-content:center}
.lp[data-design="studio"] .lpticker ul[aria-hidden="true"]{display:none}
@media(min-width:${BP.tab}px){
  .lp[data-design="studio"] .lprows{grid-template-columns:repeat(2,minmax(0,1fr))}
  .lp[data-design="studio"] .lphero{padding-top:88px}
}
`;
