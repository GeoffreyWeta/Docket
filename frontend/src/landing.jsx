/* The front door.

   Rewritten to be quieter. The first version had eighteen distinct font sizes,
   nine sections and nine hundred words, and the effect of that is not
   thoroughness — it is the particular flatness of a page assembled from
   everything that could be said rather than the few things worth saying. It
   read as generated. This one holds to four numbers:

     FIVE TYPE SIZES, one family, three weights. Everything on the page is
     display, heading, lead, body or small. A sixth size has to earn itself by
     replacing one of those.

     FIVE SECTIONS. Hero, the three promises, how it works, the ladder, and the
     close. Anything that wants a sixth belongs in the product or the docs.

     ABOUT TWO HUNDRED AND FIFTY WORDS. Short declarative lines. The long
     explanations moved to the guide inside the app, where somebody has already
     decided to care.

     ONE ARGUMENT, ANIMATED. The sealed-bid figure is the whole premise acted
     out — envelopes arrive, stay shut, the clock runs out, somebody named
     breaks the seals. Everything else moves only on arrival, once.

   THE ICONS ARE DRAWN FOR THIS PAGE. The 20px interface set is a 1.6 stroke on
   a 20 box; blown up to 72 it goes spindly and cold. `Spot` is a second set at
   72 with a soft tile behind a chunky glyph — the same vocabulary, warmer, and
   legible at the size a landing page actually wants.

   Mobile first, like the rest: every rule outside a media query is a 360px
   screen. */
import React, { useEffect, useState } from "react";

import { BP } from "./breakpoints";
import { Mark, Wordmark } from "./logo";
import { reducedMotion, useReveal } from "./motion";

/* ------------------------------------------------------------ the big icons
   72×72, two-tone: a soft tile in the brand tint, a 3-weight glyph over it.
   Round caps and joins throughout — that roundness is most of what makes a
   drawing read as friendly rather than as instrumentation. */

const SPOT = {
  seal: <>
    <circle cx="36" cy="36" r="17" className="sp-fill" />
    <circle cx="36" cy="36" r="17" className="sp-line" />
    <circle cx="36" cy="36" r="7" className="sp-line" />
    <path d="M36 12v5M36 55v5M12 36h5M55 36h5M19 19l3.6 3.6M49.4 49.4 53 53M53 19l-3.6 3.6M22.6 49.4 19 53"
          className="sp-line" />
  </>,
  envelope: <>
    <rect x="12" y="20" width="48" height="33" rx="5" className="sp-fill" />
    <rect x="12" y="20" width="48" height="33" rx="5" className="sp-line" />
    <path d="M12 25 36 41l24-16" className="sp-line" />
    <circle cx="52" cy="20" r="6" className="sp-dot" />
  </>,
  scales: <>
    <path d="M36 14v44M23 58h26" className="sp-line" />
    <path d="M14 24h44" className="sp-line" />
    <path d="M36 15 14 24l5 11a8 8 0 0 0 11-11" className="sp-fill" />
    <path d="M36 15 14 24l5 11" className="sp-line" />
    <path d="M36 15l22 9-5 11a8 8 0 0 1-11-11" className="sp-fill" />
    <path d="M36 15l22 9-5 11" className="sp-line" />
  </>,
  steps: <>
    <rect x="11" y="44" width="16" height="15" rx="3" className="sp-fill" />
    <rect x="11" y="44" width="16" height="15" rx="3" className="sp-line" />
    <rect x="28" y="32" width="16" height="27" rx="3" className="sp-fill" />
    <rect x="28" y="32" width="16" height="27" rx="3" className="sp-line" />
    <rect x="45" y="17" width="16" height="42" rx="3" className="sp-fill" />
    <rect x="45" y="17" width="16" height="42" rx="3" className="sp-line" />
  </>,
  chain: <>
    <rect x="9" y="28" width="26" height="17" rx="8.5" className="sp-fill" />
    <rect x="9" y="28" width="26" height="17" rx="8.5" className="sp-line" />
    <rect x="37" y="28" width="26" height="17" rx="8.5" className="sp-fill" />
    <rect x="37" y="28" width="26" height="17" rx="8.5" className="sp-line" />
    <path d="M30 36.5h12" className="sp-line" />
  </>,
  people: <>
    <circle cx="27" cy="26" r="9" className="sp-fill" />
    <circle cx="27" cy="26" r="9" className="sp-line" />
    <path d="M11 57c0-9 7-15 16-15s16 6 16 15" className="sp-line" />
    <circle cx="49" cy="29" r="7" className="sp-line" />
    <path d="M48 43c7 1 13 6 13 14" className="sp-line" />
  </>,
};

function Spot({ n, s = 72 }) {
  const art = SPOT[n];
  if (!art) return null;
  return (
    <svg className="spot" width={s} height={s} viewBox="0 0 72 72"
         role="presentation" aria-hidden="true" focusable="false">{art}</svg>
  );
}

/* -------------------------------------------------------------- the figure */

const PHASES = [
  { k: "in",   label: "Bids arrive",   note: "Encrypted the moment they land" },
  { k: "shut", label: "Sealed",        note: "Nobody can read them. Including you" },
  { k: "time", label: "Deadline",      note: "The clock closes it, not a person" },
  { k: "open", label: "Opened",        note: "Amara broke the seals. On the record" },
];

function SealFigure() {
  const [i, setI] = useState(0);
  const still = reducedMotion();
  useEffect(() => {
    if (still) { setI(3); return undefined; }
    const h = setInterval(() => setI((n) => (n + 1) % PHASES.length), 2600);
    return () => clearInterval(h);
  }, [still]);

  const p = PHASES[i];
  const open = i === 3;
  return (
    <figure className={"fig ph-" + p.k} aria-label="Bids arrive encrypted, stay sealed until the deadline, and are opened on the record.">
      <div className="figstage">
        {[0, 1, 2, 3].map((n) => (
          <span className="fenv" key={n} style={{ "--n": n }}>
            <svg viewBox="0 0 44 34" width="44" height="34" aria-hidden="true">
              <rect x="1.5" y="1.5" width="41" height="31" rx="4" className="fe-body" />
              <path d={open ? "M1.5 5 22 20 42.5 5" : "M1.5 5 22 18 42.5 5"} className="fe-flap" />
            </svg>
            <i>{open ? ["182", "194", "201", "217"][n] : "•••"}</i>
            <b className="fwax" />
          </span>
        ))}
      </div>
      <figcaption>
        <b>{p.label}</b>
        <span>{p.note}</span>
        <em aria-hidden="true">{PHASES.map((x, n) => <i key={x.k} className={n === i ? "on" : ""} />)}</em>
      </figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------------ content */

const PROMISES = [
  ["envelope", "Sealed until the deadline",
   "Nobody on your side can open a bid early. Not even an administrator."],
  ["scales", "Scored blind",
   "Panels mark on their own. No one sees another's numbers until consensus."],
  ["chain", "Provable afterwards",
   "Every decision hash-chained. Edit a record and the chain says so."],
];

const STEPS = [
  ["Draft it", "Scope, criteria, weights."],
  ["Sign it off", "Up your reporting line, as far as the money needs."],
  ["Receive sealed bids", "Encrypted. Opened only after the deadline."],
  ["Award it", "The panel recommends. Someone else signs."],
];

const RUNGS = [
  ["Buyer raises", "₦240m", "from"],
  ["Category Manager", "signs to ₦10m", ""],
  ["Head of Procurement", "signs to ₦50m", ""],
  ["Finance Director", "signs to ₦500m", "done"],
];

const FAQ = [
  ["Can an admin read a sealed bid?",
   "No. Sealing is time-based, not permission-based. There is no capability that opens an envelope early."],
  ["We have four layers of management.",
   "Then it collects four signatures. You set the limits; it walks your own reporting lines."],
  ["Can we bring our vendor list?",
   "Paste it or upload it during setup. They get invited to register."],
  ["Do we need a code to set up?",
   "Yes, issued to your organisation. Otherwise the first stranger to find the URL owns the workspace."],
];

/* --------------------------------------------------------------- the page */

export function Landing({ cfg, onScreen }) {
  const demo = (cfg && cfg.demoUrl) || "";
  const canDemo = !!demo || !!(cfg && cfg.demoLogin);
  const [ask, setAsk] = useState(-1);
  useReveal([]);

  const goDemo = () => { if (demo) window.location.href = demo; else onScreen("demo"); };
  const goSetup = () => {
    if (cfg && cfg.signupUrl) window.location.href = cfg.signupUrl + "/?setup=1";
    else onScreen("setup");
  };

  return (
    <div className="lp">
      <header className="lpbar">
        <div className="lpwrap lpbarin">
          <Wordmark s={26} animate />
          <button className="lplink" onClick={() => onScreen("signin")}>Sign in</button>
          <button className="btn pri sm" onClick={goSetup}>Get started</button>
        </div>
      </header>

      {/* ------------------------------------------------------------ hero */}
      <section className="lphero">
        <div className="lpwrap lpherogrid">
          <div>
            <h1 data-reveal>Tenders you can<br /><em>prove</em> were fair.</h1>
            <p className="lead" data-reveal>
              Bids stay sealed until the deadline. Panels score blind.
              Every signature lands on a chain an auditor can check.
            </p>
            <div className="lpacts" data-reveal>
              <button className="btn pri lpbtn" onClick={goSetup}>Set up your company</button>
              {canDemo && <button className="btn lpbtn" onClick={goDemo}>See it working</button>}
            </div>
          </div>
          <div data-reveal><SealFigure /></div>
        </div>
      </section>

      {/* -------------------------------------------------------- promises */}
      <section className="lpsec">
        <div className="lpwrap lptrio">
          {PROMISES.map(([icon, title, body], n) => (
            <div key={title} data-reveal style={{ transitionDelay: `${n * 80}ms` }}>
              <Spot n={icon} />
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------ steps */}
      <section className="lpsec tint">
        <div className="lpwrap">
          <h2 data-reveal>How it goes</h2>
          <ol className="lpsteps">
            {STEPS.map(([title, body], n) => (
              <li key={title} data-reveal style={{ transitionDelay: `${n * 70}ms` }}>
                <b>{n + 1}</b>
                <div><h3>{title}</h3><p>{body}</p></div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ----------------------------------------------------------- ladder */}
      <section className="lpsec">
        <div className="lpwrap lpsplit">
          <div data-reveal>
            <Spot n="steps" />
            <h2>However many layers you have.</h2>
            <p className="lead">
              Set what each level may commit. Draw who reports to whom.
              A request climbs until someone's limit covers it.
            </p>
          </div>
          <div className="lpladder" data-reveal aria-hidden="true">
            {RUNGS.map(([who, what, tone], n) => (
              <div className={"rung " + tone} key={who} style={{ "--n": n }}>
                <span>{who}</span><i>{what}</i>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- the close */}
      <section className="lpsec tint">
        <div className="lpwrap lpnarrow">
          <h2 data-reveal>Questions</h2>
          <div className="lpfaq" data-reveal>
            {FAQ.map(([q, a], n) => (
              <div className={"qa" + (ask === n ? " on" : "")} key={q}>
                <button aria-expanded={ask === n} onClick={() => setAsk(ask === n ? -1 : n)}>
                  {q}<i aria-hidden="true" />
                </button>
                <div className="qaa"><p>{a}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="lpcta">
        <div className="lpwrap" data-reveal>
          <Mark s={56} animate />
          <h2>Start with the one you&rsquo;re dreading.</h2>
          <p className="lead">The tender someone will ask questions about later.</p>
          <button className="btn pri lpbtn" onClick={goSetup}>Set up your company</button>
        </div>
      </section>

      <footer className="lpfoot">
        <div className="lpwrap lpfootin">
          <Wordmark s={20} />
          <div>
            <button className="lplink" onClick={() => onScreen("signin")}>Sign in</button>
            <button className="lplink" onClick={() => onScreen("register")}>Vendor registration</button>
            {canDemo && <button className="lplink" onClick={goDemo}>Demo</button>}
          </div>
        </div>
      </footer>
    </div>
  );
}

export const LANDING_CSS = `
/* FIVE SIZES. Everything on this page is one of them. A sixth replaces one. */
.lp{
  --d1:clamp(38px,8.5vw,68px);   /* display  */
  --d2:clamp(25px,4.4vw,38px);   /* heading  */
  --d3:18px;                     /* lead     */
  --d4:15px;                     /* body     */
  --d5:13px;                     /* small    */
  --settle:cubic-bezier(.16,1,.3,1);
  background:var(--card);color:var(--ink);min-height:100dvh;overflow-x:clip;
  font-size:var(--d4);line-height:1.6}
.lpwrap{max-width:1080px;margin:0 auto;padding:0 20px;width:100%}
.lpnarrow{max-width:700px}
.lp h1,.lp h2,.lp h3{letter-spacing:-.032em;margin:0;text-wrap:balance}
.lp h1{font-size:var(--d1);line-height:1.02;font-weight:700}
.lp h2{font-size:var(--d2);line-height:1.1;font-weight:700}
.lp h3{font-size:var(--d4);line-height:1.35;font-weight:600;letter-spacing:-.015em}
.lp p{margin:0;color:var(--muted);text-wrap:pretty}
.lp .lead{font-size:var(--d3);line-height:1.55;max-width:34ch}

.lplink{background:none;border:0;font:inherit;font-size:var(--d5);color:var(--muted);
  cursor:pointer;padding:6px 2px}
.lplink:hover{color:var(--ink)}

/* ------------------------------------------------------------------- bar */
.lpbar{position:sticky;top:0;z-index:40;background:color-mix(in srgb,var(--card) 88%,transparent);
  backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}
.lpbarin{display:flex;align-items:center;gap:14px;padding-block:13px}
.lpbarin .lplink{margin-left:auto}

/* ------------------------------------------------------------------ hero */
.lphero{padding:56px 0 8px}
.lpherogrid{display:grid;gap:40px}
.lp h1 em{font-style:normal;color:var(--brand)}
.lphero .lead{margin:20px 0 28px}
.lpacts{display:flex;flex-wrap:wrap;gap:10px}
.lpbtn{min-width:190px;justify-content:center;padding:14px 24px;font-size:var(--d4)}

/* --------------------------------------------------------------- the icons
   The tile is a fill of the brand at low alpha and the glyph is a 3-weight
   stroke over it. Both scale with the box, so one component serves 56 and 72. */
.spot{display:block;overflow:visible}
.spot .sp-fill{fill:color-mix(in srgb,var(--brand-2) 15%,transparent);stroke:none}
.spot .sp-line{fill:none;stroke:var(--brand);stroke-width:3;
  stroke-linecap:round;stroke-linejoin:round}
.spot .sp-dot{fill:var(--wax)}
@media(prefers-reduced-motion:no-preference){
  .spot{transition:transform 420ms var(--settle)}
  .lptrio > div:hover .spot,.lpsplit .spot:hover{transform:translateY(-3px) rotate(-3deg)}
}

/* ----------------------------------------------------------- the figure */
.fig{margin:0;border:1px solid var(--line);border-radius:18px;overflow:hidden;
  background:var(--card);max-width:400px}
.figstage{display:flex;align-items:center;justify-content:center;gap:12px;
  height:176px;background:var(--sunk);position:relative}
.fenv{position:relative;display:grid;justify-items:center;gap:8px;color:var(--brand)}
.fenv svg{overflow:visible}
.fe-body{fill:var(--card);stroke:currentColor;stroke-width:2.4;stroke-linejoin:round}
.fe-flap{fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round;
  stroke-linejoin:round;transition:d 420ms var(--settle)}
.fenv i{font-style:normal;font-family:var(--font-mono);font-size:var(--d5);color:var(--faint)}
.fwax{position:absolute;top:11px;width:11px;height:11px;border-radius:50%;
  background:var(--wax);box-shadow:0 0 0 2.5px var(--card);
  transition:opacity 300ms var(--settle),transform 300ms var(--settle)}
.fig figcaption{border-top:1px solid var(--line);padding:14px 18px;display:grid;
  gap:3px;min-height:82px;align-content:start}
.fig figcaption b{font-size:var(--d4);font-weight:600;letter-spacing:-.015em}
.fig figcaption span{font-size:var(--d5);color:var(--muted)}
.fig figcaption em{display:flex;gap:5px;margin-top:8px}
.fig figcaption em i{width:18px;height:3px;border-radius:2px;background:var(--line2);
  transition:background 300ms var(--settle)}
.fig figcaption em i.on{background:var(--brand-2)}
.ph-open .fwax{opacity:0;transform:scale(.4) translateY(8px)}
@media(prefers-reduced-motion:no-preference){
  .ph-in .fenv{animation:envin 700ms var(--settle) both;animation-delay:calc(var(--n)*110ms)}
  .fenv{transition:transform 520ms var(--settle)}
  .ph-time .fenv{transform:translateY(-5px)}
}
@keyframes envin{from{opacity:0;transform:translateY(18px) rotate(-6deg)}to{opacity:1;transform:none}}

/* --------------------------------------------------------------- sections */
.lpsec{padding:64px 0}
.lpsec.tint{background:var(--paper)}
.lpsec h2{margin-bottom:32px}
.lptrio{display:grid;gap:36px}
.lptrio h3{margin:18px 0 6px}
.lptrio p{font-size:var(--d4)}

.lpsteps{list-style:none;margin:0;padding:0;display:grid;gap:26px}
.lpsteps li{display:grid;grid-template-columns:auto minmax(0,1fr);gap:16px;align-items:start}
.lpsteps b{font-size:var(--d2);font-weight:700;color:var(--line2);line-height:.9;
  letter-spacing:-.04em;font-variant-numeric:tabular-nums}
.lpsteps h3{margin-bottom:4px}
.lpsteps p{font-size:var(--d4)}

.lpsplit{display:grid;gap:40px;align-items:center}
.lpsplit h2{margin:20px 0 14px}
.lpladder{display:grid;gap:10px}
.rung{display:flex;gap:12px;align-items:center;justify-content:space-between;
  background:var(--card);border:1px solid var(--line);border-radius:14px;
  padding:16px 18px;margin-left:calc(var(--n) * 16px);font-size:var(--d4)}
.rung span{font-weight:600;letter-spacing:-.015em}
.rung i{font-style:normal;font-size:var(--d5);color:var(--muted);
  font-family:var(--font-mono);white-space:nowrap}
.rung.from{border-style:dashed;background:var(--sunk)}
.rung.done{border-color:var(--green-2);background:var(--green-tint)}
@media(prefers-reduced-motion:no-preference){
  [data-reveal].seen .rung{animation:rungin 520ms var(--settle) both;
    animation-delay:calc(var(--n) * 110ms)}
}
@keyframes rungin{from{opacity:0;transform:translateX(-14px)}to{opacity:1;transform:none}}

/* -------------------------------------------------------------------- FAQ */
.lpfaq{border-top:1px solid var(--line)}
.qa{border-bottom:1px solid var(--line)}
.qa > button{width:100%;display:flex;align-items:center;gap:16px;text-align:left;
  background:none;border:0;font:inherit;font-size:var(--d4);font-weight:600;
  letter-spacing:-.015em;color:inherit;padding:18px 0;cursor:pointer}
.qa > button i{margin-left:auto;flex-shrink:0;width:13px;height:13px;position:relative}
.qa > button i::before,.qa > button i::after{content:"";position:absolute;inset:50% 0 auto;
  height:2px;border-radius:2px;background:var(--faint);transition:transform 260ms var(--settle)}
.qa > button i::after{transform:rotate(90deg)}
.qa.on > button i::after{transform:rotate(0)}
.qa.on > button i::before,.qa.on > button i::after{background:var(--brand)}
.qaa{display:grid;grid-template-rows:0fr;transition:grid-template-rows 280ms var(--settle)}
.qa.on .qaa{grid-template-rows:1fr}
.qaa > p{overflow:hidden;font-size:var(--d4);max-width:56ch}
.qa.on .qaa > p{padding-bottom:18px}

/* -------------------------------------------------------------------- CTA */
.lpcta{padding:84px 0;text-align:center;border-top:1px solid var(--line)}
.lpcta .dkmark{margin:0 auto 22px}
.lpcta .lead{margin:14px auto 28px}
.lpfoot{padding:26px 0 36px;border-top:1px solid var(--line);background:var(--paper)}
.lpfootin{display:flex;flex-wrap:wrap;gap:14px;align-items:center;justify-content:space-between}
.lpfootin > div{display:flex;flex-wrap:wrap;gap:18px}

/* The demo banner. Lives in this file because it is the only other thing that
   spans the whole viewport above the app shell, and it follows the landing
   page's type scale rather than inventing a sixth size. */
.demobar{position:sticky;top:0;z-index:60;display:flex;flex-wrap:wrap;gap:10px;
  align-items:center;justify-content:center;padding:8px 16px;font-size:13px;
  background:var(--brass-tint);color:var(--gold-ink);
  border-bottom:1px solid var(--brass)}
.demobar .doclink{color:inherit;text-decoration:underline;font-size:inherit}
.isdemo .side,.isdemo .topbar{top:33px}

@media(min-width:${BP.sm}px){
  .lpsteps{grid-template-columns:repeat(2,minmax(0,1fr));gap:32px 28px}
}
@media(min-width:${BP.desk}px){
  .lphero{padding-top:76px}
  .lpherogrid{grid-template-columns:minmax(0,1fr) minmax(0,420px);gap:56px;align-items:center}
  .lptrio{grid-template-columns:repeat(3,minmax(0,1fr));gap:40px}
  .lpsteps{grid-template-columns:repeat(4,minmax(0,1fr));gap:30px}
  .lpsplit{grid-template-columns:repeat(2,minmax(0,1fr));gap:64px}
  .lpsec{padding:88px 0}
}
`;
