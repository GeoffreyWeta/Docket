import React, { useState } from "react";
import { Icon } from "./icons";
import { Mark } from "./logo";

const VIEWS = {
  Tenders: [
    ["Kitchen equipment", "Lekki commissary · 7 bids", "Sealed", "blue"],
    ["Cold-chain logistics", "Lagos–Abuja · 4 bids", "In review", "amber"],
    ["Uniforms & PPE", "All locations · 6 bids", "Awarded", "green"],
  ],
  Suppliers: [
    ["Delta Kitchen Systems", "Equipment · Lagos", "Verified", "green"],
    ["Lagos Cold Chain", "Logistics · Lagos", "Verified", "green"],
    ["Sahara Foods", "Food & beverage · Abuja", "In review", "amber"],
  ],
  Approvals: [
    ["Kitchen equipment", "Publication request · Procurement", "Pending", "amber"],
    ["Cold-chain logistics", "Award recommendation · Finance", "In review", "blue"],
    ["Uniforms & PPE", "Award decision · Complete", "Approved", "green"],
  ],
};

function WorkspacePreview() {
  const [view, setView] = useState("Tenders");
  return (
    <div className="st-device">
      <div className="st-devicebar"><span aria-hidden="true"><i /><i /><i /></span><span>Docket / Kestrel Hospitality</span><Icon n="lock" s={12} /></div>
      <div className="st-workspace">
        <aside className="st-rail" aria-label="Workspace preview">
          <div className="st-railbrand"><Mark s={25} /><b>Docket</b></div>
          <span className="st-raillabel">WORKSPACE</span>
          {Object.keys(VIEWS).map((name, i) => <button key={name} aria-pressed={view === name} onClick={() => setView(name)}><Icon n={["tender", "suppliers", "stamp"][i]} s={16} />{name}</button>)}
          <div className="st-railuser"><span>AO</span><div>Amara Okafor<small>Procurement</small></div></div>
        </aside>
        <div className="st-desk">
          <div className="st-desktopline"><span>Your workspace. In focus.</span><span className="st-previewlabel">Illustrative preview</span></div>
          <div className="st-desktitle"><div><small>MONDAY, 21 SEPTEMBER</small><h2>A little clarity.<br />A lot of possibility.</h2></div><span className="st-avatar">AO</span></div>
          <div className="st-metrics"><div><span>Active tenders</span><b>18<span className="st-minichart" aria-hidden="true">▂▃▂▅▄▆▇</span></b></div><div><span>Awaiting approval</span><b>03<Icon n="stamp" s={27} /></b></div><div><span>Integrity checks</span><b>All clear<Icon n="check" s={25} /></b></div></div>
          <div className="st-register"><div className="st-registerhead"><b>{view}</b><span>Everything in its place.</span></div>
            <div aria-live="polite">{VIEWS[view].map(([name, detail, status, tone]) => <div className="st-record" key={name}><span className="st-recordicon"><Icon n={view === "Suppliers" ? "suppliers" : "file"} s={19} /></span><div><b>{name}</b><span>{detail}</span></div><span className={"st-status " + tone}>{status}</span></div>)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function StudioLanding({ cfg = {}, onScreen }) {
  const [menu, setMenu] = useState(false);
  const canDemo = !!cfg.demoUrl || !!cfg.demoLogin;
  const start = () => cfg.signupUrl ? window.location.assign(cfg.signupUrl.replace(/\/$/, "") + "/?setup=1") : onScreen("setup");
  const demo = () => cfg.demoUrl ? window.location.assign(cfg.demoUrl) : onScreen("demo");
  return (
    <div className="st-page">
      <style>{STUDIO_LANDING_CSS}</style>
      <a className="st-skip" href="#st-main">Skip to content</a>
      <header className="st-nav">
        <div className="st-navinner">
          <a className="st-brand" href="#st-main" aria-label="Docket home"><Mark s={23} /><span>Docket</span></a>
          <nav aria-label="Product" className={menu ? "st-links open" : "st-links"}>
            <a href="#st-overview" onClick={() => setMenu(false)}>Overview</a><a href="#st-workflow" onClick={() => setMenu(false)}>The experience</a><a href="#st-security" onClick={() => setMenu(false)}>Peace of mind</a>
            <button onClick={() => onScreen("signin")}>Sign in</button>
          </nav>
          <button className="st-button compact" onClick={start}>Get started</button>
          <button className="st-menubutton" onClick={() => setMenu(!menu)} aria-expanded={menu} aria-label={menu ? "Close menu" : "Open menu"}><Icon n={menu ? "close" : "menu"} s={21} /></button>
        </div>
      </header>
      <main id="st-main">
        <section className="st-hero" id="st-overview">
          <p className="st-eyebrow">Meet Docket.</p>
          <h1>Everything.<br /><span>In good order.</span></h1>
          <p className="st-hero-sub">A beautifully clear way to manage procurement.<br className="st-desktopbreak" /> From the first invitation to the final decision.</p>
          <div className="st-actions"><button className="st-button" onClick={start}>Get started</button>{canDemo ? <button className="st-textlink" onClick={demo}>Explore the demo <span aria-hidden="true">↗</span></button> : <a className="st-textlink" href="#st-workflow">Take a closer look <span aria-hidden="true">↓</span></a>}</div>
          <div className="st-stage"><WorkspacePreview /></div>
          <p className="st-caption">One workspace. A clearer picture.</p>
        </section>
        <section className="st-experience" id="st-workflow">
          <div className="st-sectionhead"><p className="st-eyebrow">Less to manage. More to see.</p><h2>Make room<br />for the work that matters.</h2><p>Tenders, people and approvals, thoughtfully brought together.<br className="st-desktopbreak" /> So your next step always feels like the natural one.</p></div>
          <div className="st-featuregrid">
            <article className="st-feature st-tenderfeature"><div><p className="st-featurelabel">Tenders</p><h3>From open question.<br />To clear decision.</h3><p>A place for every invitation, proposal and approval.<br className="st-desktopbreak" /> A clear path from beginning to end.</p></div>
              <div className="st-tenderart" aria-label="Tender workflow illustration"><div className="st-floatingdoc"><div className="st-documenticon"><Icon n="tender" s={30} /></div><small>SOURCING / EQUIPMENT</small><b>Something great.<br />Starts here.</b><span className="st-docline" /><span className="st-docline short" /><div className="st-docfoot"><span>Kitchen equipment</span><span className="st-status blue">Published</span></div></div><div className="st-flow"><span><Icon n="check" s={12} /> Invite</span><i /><span><Icon n="check" s={12} /> Evaluate</span><i /><span>Decide</span></div></div>
            </article>
            <article className="st-feature st-peoplefeature"><div><p className="st-featurelabel">Your people</p><h3>Great work.<br />In good company.</h3><p>Bring your suppliers and your team together.<br className="st-desktopbreak" /> Give everyone the right place to contribute.</p></div>
              <div className="st-peopleart" aria-label="Connected team and suppliers illustration"><div className="st-orbit"><span className="st-person p1">AO</span><span className="st-person p2">TB</span><span className="st-person p3">NE</span><span className="st-person p4">DK</span><span className="st-orbitcore"><Mark s={54} /></span></div><span className="st-peoplecaption">One team. Every perspective.</span></div>
            </article>
          </div>
        </section>
        <section className="st-security" id="st-security">
          <div className="st-lockart" aria-hidden="true"><div className="st-shackle" /><div className="st-lockbody"><span /></div></div>
          <p className="st-eyebrow">Confidence, built in.</p><h2>Private until it’s time.<br /><span>Accountable. Every time.</span></h2>
          <p>Sealed bids stay encrypted until their recorded opening.<br className="st-desktopbreak" /> Every decision leaves a trace you can follow.</p>
          <div className="st-securityfacts"><span><Icon n="lock" s={17} /> Sealed bidding</span><span><Icon n="scales" s={17} /> Blind evaluation</span><span><Icon n="audit" s={17} /> Linked audit records</span></div>
        </section>
        <section className="st-start"><Mark s={48} /><h2>A fresh perspective.<br /><span>On everything you do.</span></h2><p>Your next tender starts with a little more clarity.</p><div className="st-actions"><button className="st-button" onClick={start}>Start your workspace</button>{canDemo && <button className="st-textlink" onClick={demo}>Try the demo <span aria-hidden="true">↗</span></button>}</div><button className="st-vendor" onClick={() => onScreen("register")}>Here as a supplier? Register your company <span aria-hidden="true">›</span></button></section>
      </main>
      <footer className="st-footer"><div><span>Docket. A product of EatnGo Africa.</span><nav aria-label="Footer"><button onClick={() => onScreen("signin")}>Sign in</button><button onClick={() => onScreen("register")}>For suppliers</button><a href="#st-security">Security</a></nav></div><p>© {new Date().getFullYear()} EatnGo Africa. All rights reserved.<span>Lagos, Nigeria</span></p></footer>
    </div>
  );
}

export const STUDIO_LANDING_CSS = `
.st-page{--st-bg:#fff;--st-soft:#f5f5f7;--st-ink:#1d1d1f;--st-muted:#65656b;--st-line:#dcdce1;--st-blue:#0066cc;--st-card:#fff;background:var(--st-bg);color:var(--st-ink);font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;font-size:16px;line-height:1.47;overflow-x:clip}
:root[data-theme="dark"] .st-page{--st-bg:#111113;--st-soft:#1c1c1f;--st-ink:#f5f5f7;--st-muted:#a5a5ad;--st-line:#39393f;--st-blue:#82baff;--st-card:#252528}
.st-page button,.st-page a{font:inherit;letter-spacing:inherit;touch-action:manipulation}
.st-page button{cursor:pointer}.st-page a{color:inherit;text-decoration:none}
.st-page button:focus-visible,.st-page a:focus-visible{outline:3px solid var(--st-blue);outline-offset:5px}
.st-page h1,.st-page h2,.st-page h3,.st-page p{margin:0}.st-page h1,.st-page h2,.st-page h3{font-family:inherit;text-wrap:balance}
.st-page section{scroll-margin-top:76px}.st-page button{border:0}
.st-skip{position:fixed;top:10px;left:12px;transform:translateY(-160%);z-index:300;background:var(--st-card);padding:12px 20px;border-radius:8px}.st-skip:focus{transform:none}
.st-nav{position:sticky;top:0;z-index:40;background:color-mix(in srgb,var(--st-bg) 88%,transparent);backdrop-filter:blur(24px);border-bottom:1px solid color-mix(in srgb,var(--st-line) 60%,transparent)}
.st-navinner{max-width:1120px;padding:0 28px;min-height:64px;margin:auto;display:flex;align-items:center;gap:28px}
.st-brand{display:flex;align-items:center;gap:8px;font-weight:650!important;font-size:21px!important;letter-spacing:-.055em!important}
.st-links{margin-left:auto;display:flex;align-items:center;gap:30px;font-size:12px}.st-links button{padding:8px 0;background:none;color:inherit}.st-links a:hover,.st-footer a:hover,.st-footer button:hover{text-decoration:underline}
.st-page .st-button{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;padding:13px 26px;background:#0071e3;color:#fff;font-size:16px;font-weight:400;line-height:1.4;min-height:48px;transition:background .2s}.st-page .st-button:hover{background:#005fca}.st-page .st-button.compact{font-size:12px;padding:7px 17px;min-height:32px}
.st-menubutton{display:none;padding:8px;background:none;color:inherit}.st-eyebrow{font-size:19px;font-weight:600;letter-spacing:-.025em}
.st-hero{text-align:center;padding:77px 24px 52px;background:linear-gradient(var(--st-bg) 60%,var(--st-soft))}
.st-page .st-hero h1{font-size:clamp(64px,7.9vw,112px);font-weight:600;letter-spacing:-.075em;line-height:.99;margin:22px auto 27px}.st-hero h1>span{color:var(--st-muted)}
.st-hero-sub{font-size:22px;line-height:1.4;letter-spacing:-.035em;color:var(--st-muted)}.st-actions{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:28px;margin-top:27px}
.st-page .st-textlink{background:none;color:var(--st-blue);font-size:18px;padding:10px 0;display:inline-flex;align-items:center;gap:9px}.st-textlink:hover{text-decoration:underline}
.st-stage{max-width:1080px;margin:68px auto 0;perspective:1600px;padding:0 10px}.st-device{border:7px solid #303035;border-radius:24px;background:#f5f5f7;box-shadow:0 45px 75px -40px #0006,0 0 0 1px #aaa;overflow:hidden;color:#1d1d1f;text-align:left;transform:rotateX(5deg);transform-origin:center bottom}
.st-devicebar{height:31px;display:flex;align-items:center;justify-content:space-between;padding:0 15px;background:#fafafa;font-size:9px;color:#65656b;border-bottom:1px solid #e4e4e8}.st-devicebar>span:first-child{display:flex;gap:5px}.st-devicebar i{display:block;width:6px;height:6px;border-radius:50%;background:#c7c7cd}
.st-workspace{display:grid;grid-template-columns:172px minmax(0,1fr);min-height:420px}.st-rail{padding:25px 13px 20px;background:#ededf0;border-right:1px solid #dddde3;display:flex;flex-direction:column;gap:6px;font-size:11px}
.st-railbrand{display:flex;gap:5px;align-items:center;margin:0 8px 27px;font-size:17px;letter-spacing:-.05em}.st-raillabel{font-size:8px;color:#777780;margin:0 11px 5px;letter-spacing:.06em}.st-rail button{display:flex;gap:10px;align-items:center;padding:10px 12px;background:none;color:#55555c;border-radius:7px;text-align:left;font-size:11px}.st-rail button[aria-pressed="true"]{background:#d9d9e1;color:#1d1d1f;font-weight:600}.st-railuser{margin-top:auto;display:flex;gap:8px;align-items:center;padding:22px 6px 0;font-size:10px}.st-railuser>span,.st-avatar{display:grid;place-items:center;background:#d8dce7;color:#4a526c;border-radius:50%;width:29px;height:29px;font-size:10px}.st-railuser small{display:block;color:#65656b;font-size:8px}
.st-desk{padding:19px 27px 26px;min-width:0}.st-desktopline{display:flex;justify-content:space-between;font-size:9px;color:#65656b;margin-bottom:27px}.st-previewlabel{color:#65656b}.st-desktitle{display:flex;align-items:center;justify-content:space-between}.st-desktitle small{font-size:8px;letter-spacing:.06em;color:#777780}.st-page .st-desktitle h2{font-size:29px;line-height:1.1;letter-spacing:-.055em;font-weight:600;margin-top:7px}.st-avatar{width:37px;height:37px;font-size:12px}
.st-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:23px 0 20px}.st-metrics>div{background:#fff;padding:14px;border:1px solid #e5e5ea;border-radius:12px}.st-metrics>div>span{font-size:9px;color:#65656b}.st-metrics b{display:flex;align-items:center;justify-content:space-between;font-size:27px;font-weight:500;letter-spacing:-.05em;margin-top:6px;gap:8px}.st-metrics>div:last-child b{font-size:20px}.st-metrics svg{color:#62738e}.st-minichart{font-size:24px;letter-spacing:3px;color:#82a5dc;line-height:1}
.st-register{background:#fff;border:1px solid #e5e5ea;border-radius:13px;overflow:hidden}.st-registerhead{display:flex;align-items:center;justify-content:space-between;padding:13px 16px;font-size:12px}.st-registerhead>span{font-size:9px;color:#777780}.st-record{display:flex;align-items:center;gap:12px;padding:13px 16px;border-top:1px solid #ededf1}.st-recordicon{width:31px;height:33px;border-radius:7px;background:#f2f4f9;color:#717f97;display:grid;place-items:center;flex-shrink:0}.st-record>div{min-width:0}.st-record b{display:block;font-size:11px;font-weight:500}.st-record>div>span{display:block;font-size:9px;color:#777780;margin-top:2px}.st-status{display:inline-block;white-space:nowrap;font-size:9px!important;padding:4px 8px;border-radius:999px;margin-left:auto;font-weight:500}.st-status.blue{background:#e6effe;color:#285e9e}.st-status.amber{background:#fff2db;color:#875b16}.st-status.green{background:#e7f4ed;color:#326d4f}
.st-caption{font-size:12px;color:var(--st-muted);margin-top:25px!important;letter-spacing:-.01em}
.st-experience{background:var(--st-soft);padding:110px 24px 100px}.st-sectionhead{max-width:1050px;margin:0 auto 58px}.st-page .st-sectionhead h2,.st-page .st-start h2{font-size:clamp(38px,4.8vw,66px);font-weight:600;line-height:1.06;letter-spacing:-.06em;margin:17px 0 23px}.st-sectionhead>p:last-child{font-size:20px;color:var(--st-muted);letter-spacing:-.025em}
.st-featuregrid{max-width:1130px;margin:auto;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}.st-feature{border-radius:28px;background:var(--st-card);overflow:hidden;min-height:610px;display:flex;flex-direction:column;text-align:center;padding-top:44px}.st-featurelabel{font-size:14px;font-weight:600;letter-spacing:-.02em}.st-page .st-feature h3{font-size:clamp(28px,3.2vw,43px);line-height:1.08;font-weight:600;letter-spacing:-.05em;margin:13px 0 18px}.st-feature>div:first-child{padding:0 24px}.st-feature>div>p:last-child{font-size:15px;color:var(--st-muted);line-height:1.5;letter-spacing:-.015em}
.st-tenderart{margin-top:auto;padding:40px 45px 0;background:radial-gradient(ellipse at bottom,#dae6f8,transparent 70%)}.st-floatingdoc{transform:rotate(-7deg);width:260px;max-width:100%;margin:auto;background:#fff;color:#1d1d1f;text-align:left;padding:23px;border:1px solid #e6e6ec;border-radius:12px;box-shadow:0 18px 45px #293e5d18}.st-documenticon{color:#527da9;margin-bottom:22px}.st-floatingdoc small{font-size:7px;letter-spacing:.1em;color:#797980}.st-floatingdoc>b{display:block;font-size:28px;line-height:1.07;letter-spacing:-.055em;font-weight:500;margin:12px 0 20px}.st-docline{display:block;width:90%;height:4px;background:#ececf1;margin:7px 0;border-radius:3px}.st-docline.short{width:60%}.st-docfoot{display:flex;align-items:center;gap:8px;font-size:8px;border-top:1px solid #eee;padding-top:15px;margin-top:19px}.st-flow{position:relative;display:flex;align-items:center;justify-content:center;gap:8px;background:#ffffffed;border:1px solid #e2e5ed;border-radius:14px;padding:16px 14px;font-size:10px;box-shadow:0 6px 24px #293e5d12;width:max-content;max-width:100%;margin:0 auto 30px;transform:translateY(-5px);color:#545d6c}.st-flow span{display:flex;gap:4px;align-items:center;white-space:nowrap}.st-flow i{width:17px;height:1px;background:#d1d6de}.st-flow svg{color:#34765a}
.st-peopleart{margin-top:auto;padding:15px 0 35px}.st-orbit{position:relative;width:270px;height:270px;max-width:85%;border:1px solid var(--st-line);border-radius:50%;margin:18px auto 23px;display:grid;place-items:center}.st-orbit:before{content:"";position:absolute;inset:36px;border:1px solid var(--st-line);border-radius:50%}.st-orbitcore{display:grid;place-items:center;width:95px;height:95px;background:var(--st-soft);border-radius:25px;box-shadow:0 15px 30px #00000008}.st-person{position:absolute;display:grid;place-items:center;width:61px;height:61px;border-radius:50%;font-size:17px;letter-spacing:-.05em;font-weight:500;border:5px solid var(--st-card)}.st-person.p1{top:-20px;left:87px;background:#d9e4f5;color:#445e84}.st-person.p2{right:-18px;top:102px;background:#eae0d3;color:#7c6447}.st-person.p3{bottom:-14px;right:51px;background:#e4deef;color:#705b8c}.st-person.p4{left:-15px;top:122px;background:#dbe9e2;color:#4d6f60}.st-peoplecaption{font-size:12px;color:var(--st-muted)}
.st-security{background:#09090b;color:#f5f5f7;text-align:center;padding:88px 24px 94px}.st-lockart{height:160px;width:130px;position:relative;margin:0 auto 35px}.st-shackle{position:absolute;width:68px;height:77px;left:31px;top:0;border:12px solid #999da6;border-bottom:0;border-radius:42px 42px 0 0;box-shadow:inset 4px 1px 4px #fff8,3px 0 5px #000}.st-lockbody{position:absolute;bottom:0;left:0;width:130px;height:100px;border-radius:22px;background:linear-gradient(125deg,#f3f4f6,#828793 53%,#d4d6df);box-shadow:inset 0 1px 2px #fff,0 20px 65px #829bc51c;display:grid;place-items:center}.st-lockbody span{width:12px;height:28px;background:#373a42;border-radius:8px;box-shadow:1px 1px 2px #fff8}.st-security .st-eyebrow{color:#b4b4be;font-size:16px}.st-page .st-security h2{font-size:clamp(36px,4.7vw,66px);font-weight:600;line-height:1.1;letter-spacing:-.06em;margin:20px 0 26px}.st-security h2 span{color:#94949f}.st-security>p:not(.st-eyebrow){font-size:19px;color:#ababba;letter-spacing:-.02em}.st-securityfacts{display:flex;flex-wrap:wrap;justify-content:center;gap:34px;margin-top:42px;font-size:13px;color:#c3c3ce}.st-securityfacts>span{display:flex;align-items:center;gap:9px}
.st-start{padding:106px 24px 100px;text-align:center}.st-start>svg{color:var(--st-ink);margin-inline:auto}.st-page .st-start h2{margin-top:28px}.st-start h2 span{color:var(--st-muted)}.st-start>p{color:var(--st-muted);font-size:20px;letter-spacing:-.025em}.st-vendor{background:none;color:var(--st-muted);font-size:13px!important;margin-top:38px;padding:10px}.st-vendor:hover{color:var(--st-blue)}
.st-footer{padding:29px max(24px,calc((100% - 1050px)/2)) 25px;background:var(--st-soft);font-size:11px;color:var(--st-muted)}.st-footer>div{display:flex;justify-content:space-between;gap:22px;padding-bottom:21px;border-bottom:1px solid var(--st-line)}.st-footer nav{display:flex;gap:24px}.st-footer button{padding:0;background:none;color:inherit}.st-footer>p{display:flex;justify-content:space-between;gap:20px;margin-top:18px}
@media(max-width:760px){.st-navinner{padding:0 20px;gap:15px;min-height:60px}.st-navinner>.st-button{margin-left:auto}.st-menubutton{display:inline-flex}.st-links{display:none;position:absolute;top:60px;left:0;right:0;background:var(--st-card);padding:24px;box-shadow:0 12px 18px #0001;font-size:17px}.st-links.open{display:flex;flex-direction:column;align-items:flex-start;gap:20px}.st-hero{padding:55px 18px 35px}.st-page .st-hero h1{font-size:clamp(58px,10vw,78px);margin-top:20px}.st-eyebrow{font-size:17px}.st-hero-sub{font-size:19px;max-width:440px;margin:auto!important}.st-desktopbreak{display:none}.st-actions{gap:22px}.st-page .st-textlink{font-size:16px}.st-stage{margin-top:48px;padding:0}.st-device{border-width:5px;border-radius:16px;transform:none}.st-devicebar{font-size:8px;height:27px}.st-workspace{grid-template-columns:minmax(0,1fr)}.st-rail{padding:9px 12px;flex-direction:row;border-right:0;border-bottom:1px solid #dddde3;justify-content:center;gap:5px}.st-railbrand,.st-raillabel,.st-railuser{display:none}.st-rail button{font-size:10px;padding:8px;gap:5px}.st-desk{padding:18px 13px}.st-desktopline{font-size:8px;margin-bottom:20px;gap:8px}.st-page .st-desktitle h2{font-size:25px}.st-desktitle small{font-size:7px}.st-metrics{gap:6px;margin:18px 0 15px}.st-metrics>div{padding:9px 8px;border-radius:8px}.st-metrics>div>span{font-size:8px}.st-metrics b{font-size:24px}.st-metrics>div:last-child b{font-size:14px;line-height:1.2;min-height:35px}.st-metrics svg,.st-minichart{display:none}.st-registerhead{padding:12px 10px}.st-registerhead>span{font-size:8px}.st-record{padding:12px 10px;gap:8px}.st-recordicon{width:25px;height:29px}.st-record b{font-size:10px}.st-record>div>span{font-size:8px}.st-status{font-size:8px!important;padding:3px 6px}.st-experience{padding:70px 18px 55px}.st-sectionhead{margin-bottom:32px;padding:0 8px}.st-sectionhead>p:last-child{font-size:18px}.st-featuregrid{grid-template-columns:1fr;gap:18px}.st-feature{min-height:590px;padding-top:36px}.st-page .st-feature h3{font-size:36px}.st-tenderart{padding-inline:30px}.st-security{padding:65px 22px}.st-security>p:not(.st-eyebrow){font-size:17px}.st-securityfacts{gap:18px;font-size:12px}.st-start{padding:70px 22px}.st-start>p{font-size:18px}.st-footer>div,.st-footer>p{flex-direction:column;gap:16px}.st-footer nav{flex-wrap:wrap}}
@media(prefers-reduced-motion:reduce){.st-page *{scroll-behavior:auto;transition:none}}
`;
