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
`;
