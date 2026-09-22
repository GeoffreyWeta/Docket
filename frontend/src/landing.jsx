/* The front door.

   Four rules, and they are numbers so the next edit has to argue with them
   rather than drift past them.

     TWO TYPEFACES, FIVE SIZES, THREE WEIGHTS. The sans for everything and the
     mono for money. Source Serif was dropped from the build entirely — 181 KB
     of webfont for two call sites. Sizes are tokens (--t1…--t5) and a sixth
     has to replace one rather than join it.

     ONE SPACING SCALE. Every margin and every padding on this page comes from
     --s1…--s7 — 4 · 8 · 16 · 24 · 40 · 64 · 96. Nothing is 13px because 13
     looked right once. This is the thing that stops the vertical rhythm
     drifting as sections get edited one at a time.

     THE PAGE DOES NOT EXPLAIN ITSELF IN PARAGRAPHS. Each claim is a heading
     and a drawing. The detail behind it sits under a small mark you hover or
     focus, so the page reads in about fifteen seconds and still answers the
     second question for somebody who has one. Prose is what made the first
     version read as generated, and folding it away is better than shortening
     it a third time.

     THE ILLUSTRATIONS CARRY THE SECTIONS. Drawn scenes from illus.jsx — the
     same ones the product's empty states use, so the front page and the thing
     it is selling are visibly the same object.

   Mobile first: every rule outside a media query describes a 360px screen. */
import React, { useEffect, useState } from "react";

import { BP } from "./breakpoints";
import { designOf } from "./designs";
import { Illus } from "./illus";
import { Plate } from "./artwork";
import { Mark, Wordmark } from "./logo";
import { reducedMotion, useReveal } from "./motion";

/* ------------------------------------------------------------------ the mark
   One small glyph, wherever a detail is available. Focusable, because hover
   does not exist on a touch screen and this is the only way to the detail. */
function Note({ children, label = "Why" }) {
  return (
    <span className="note" tabIndex={0} role="note" aria-label={label}>
      <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
        <circle cx="8" cy="8" r="6.6" />
        <path d="M8 7.2v4M8 5.1v.1" />
      </svg>
      <em>{children}</em>
    </span>
  );
}

/* ------------------------------------------------------------- the argument
   The premise acted out: envelopes arrive, stay shut, the clock runs out,
   somebody named breaks the seals. The only motion on this page making a
   point rather than decorating one. */

const PHASES = [
  { k: "in",   label: "Bids arrive", note: "Encrypted on arrival" },
  { k: "shut", label: "Sealed",      note: "Unreadable. Including by you" },
  { k: "time", label: "Deadline",    note: "Closed by the clock" },
  { k: "open", label: "Opened",      note: "Amara broke the seals" },
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
    <figure className={"fig ph-" + p.k}
            aria-label="Bids arrive encrypted, stay sealed until the deadline, then are opened on the record.">
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
        <b>{p.label}</b><span>{p.note}</span>
        <em aria-hidden="true">{PHASES.map((x, n) => <i key={x.k} className={n === i ? "on" : ""} />)}</em>
      </figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------------ content
   A heading, a drawing, and the detail folded behind the mark. */

const PROMISES = [
  ["sealed", "Sealed until the deadline",
   "Amounts and documents are encrypted the moment they arrive. No capability in the system opens an envelope early — not a buyer's, not a panel's, not an administrator's."],
  ["search", "Scored blind",
   "Evaluators mark on their own and cannot see another member's numbers until consensus. Conflicts of interest are declared before scoring opens, not explained afterwards."],
  ["clear", "Provable afterwards",
   "Every event is hash-chained to the one before it, so an altered record breaks the chain and the integrity report names the first break."],
];

const STEPS = [
  ["Draft", "Scope, criteria and weights, with line items where you price them."],
  ["Sign off", "The value decides the chain. It climbs your reporting line until somebody's limit covers it."],
  ["Receive", "Sealed bids, encrypted at rest, opened only once the deadline has passed."],
  ["Award", "The panel recommends and somebody else signs. Letters go to every bidder at once."],
];

const RUNGS = [
  ["Buyer raises", "₦240m", "from"],
  ["Category Manager", "to ₦10m", ""],
  ["Head of Procurement", "to ₦50m", ""],
  ["Finance Director", "to ₦500m", "done"],
];

const FAQ = [
  ["Can an administrator read a sealed bid?",
   "No. Sealing is time-based, not permission-based, so there is no capability that opens an envelope early — and a superuser holds every capability there is."],
  ["We have four layers of management.",
   "Then it collects four signatures. You set each level's limit; it walks your own reporting lines to find them."],
  ["Can we bring our vendor list?",
   "Paste it or upload it during setup. Columns are matched for you, duplicates are reported, and everyone with an address is invited to register."],
  ["Do we need a code to set up?",
   "Yes, issued to your organisation. Otherwise the first stranger to find the address owns the workspace."],
];

/* ------------------------------------------------------- the switched bands
   Three pieces only some designs ask for. They are declared here rather than
   inline so the page below still reads as one argument in seven sections, and
   so the content is written once whichever design is wearing it. */

/* The vocabulary, scrolling. The list is the real lifecycle in order, which is
   why it can be a decoration and still be true — it names the seven states a
   tender actually moves through in the product. Rendered twice so the loop has
   something to run into; the second copy is hidden from screen readers, which
   get the sentence once. */
const LIFECYCLE = ["Drafted", "Approved", "Published", "Sealed",
                   "Opened", "Scored", "Awarded"];

function Marquee() {
  const strip = (hidden) => (
    <ul aria-hidden={hidden || undefined}>
      {LIFECYCLE.map((w) => <li key={w}>{w}</li>)}
    </ul>
  );
  return (
    <div className="lpmarq" role="img"
         aria-label={"The tender lifecycle: " + LIFECYCLE.join(", ") + "."}>
      {strip(true)}
      {strip(true)}
    </div>
  );
}

/* Four figures, and every one is a fact about the software rather than a claim
   about a customer. The template these come from showed "3k+ successful
   projects" beside a slider labelled 85%; inventing either on the front of a
   product whose entire pitch is that it does not fake records would be the
   page arguing against itself. */
const FIGURES = [
  ["0", "capabilities that can open a sealed bid early — including an administrator's"],
  ["100%", "of events hash-chained to the one before"],
  ["4", "roles built in, plus as many of your own as you need"],
  ["1", "signature per level, and never on your own request"],
];

function Figures() {
  return (
    <div className="lpfigs">
      {FIGURES.map(([n, what]) => (
        <div key={what} data-reveal><b>{n}</b><span>{what}</span></div>
      ))}
    </div>
  );
}

/* Hard facts under the hero, in the order they happen to a bid. No headings,
   no cards, nothing to open — the point is that it answers "is this real"
   without asking anybody to scroll. */
const RAIL = [
  ["Sealed", "Encrypted the moment it arrives"],
  ["Opened", "By the clock, not by a person"],
  ["Scored", "Blind, then reconciled on the record"],
  ["Signed", "Hash-chained end to end"],
];

function Rail() {
  return (
    <div className="lprail" data-reveal>
      {RAIL.map(([k, what]) => (
        <div key={k}><b>{k}</b><span>{what}</span></div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- the page */

/* A plate in its frame, with the caption that rides on its vignette. */
function PlateFrame({ n, tall, wide, cap, meta, className = "" }) {
  return (
    <div className={"plateframe" + (tall ? " tall" : "") + (wide ? " wide" : "")
                    + (className ? " " + className : "")}>
      <Plate n={n} tall={tall} />
      {cap && <div className="platecap">{cap}{meta && <i>{meta}</i>}</div>}
    </div>
  );
}

/* ====================================================================
   THE FOUR PAGES

   One argument, four ways of making it. They share the content constants
   above — the same three promises, the same four steps, the same ladder, the
   same four questions — and disagree about the shape those take. That is the
   line: a design may reorder, regroup, drop a section or invent one, and may
   not invent a CLAIM. Anything a visitor could act on is in all four.

   Each page is handed the same props and renders between the shared bar and
   the shared footer. Adding a fifth design means a key in views.py, a token
   block in designs.js, and a function here — in that order, because the first
   is the allow-list and the other two are what it allows.
   ==================================================================== */

/* ------------------------------------------------------------------ drawn
   The house page, unchanged: the argument acted out by the seal figure, three
   drawn promises, the steps, the ladder, the questions. */
function DrawnPage({ goSetup, goDemo, canDemo, ask, setAsk }) {
  return (
    <>
      <section className="lphero">
        <div className="lpwrap">
          <div className="lpherogrid">
            <div>
              <h1 data-reveal>Tenders you can<br /><em>prove</em> were fair.</h1>
              <p className="lead" data-reveal>
                Sealed bids. Blind scoring. Every signature on a chain an auditor can check.
              </p>
              <div className="lpacts" data-reveal>
                <button className="btn pri lpbtn" onClick={goSetup}>Set up your company</button>
                {canDemo && <button className="btn lpbtn" onClick={goDemo}>See it working</button>}
              </div>
            </div>
            <div data-reveal><SealFigure /></div>
          </div>
        </div>
      </section>

      <section className="lpsec">
        <div className="lpwrap lptrio">
          {PROMISES.map(([art, title, why], n) => (
            <article key={title} data-reveal style={{ transitionDelay: n * 80 + "ms" }}>
              <Illus n={art} w={168} />
              <h3>{title}<Note>{why}</Note></h3>
            </article>
          ))}
        </div>
      </section>

      <StepsSection />
      <LadderSection />
      <FaqSection ask={ask} setAsk={setAsk} />
      <CtaSection goSetup={goSetup} />
    </>
  );
}

/* ------------------------------------------------------------------- bold
   A brochure. The most sections of the four and the densest rhythm: a collage
   hero, the marquee, an about split, the figures, a dark services band, the
   steps, the questions. The plates are greyscale with a single lime spot,
   which is the one thing the reference did that was worth taking whole. */
function BoldPage({ goSetup, goDemo, canDemo, ask, setAsk }) {
  return (
    <>
      <section className="lphero">
        <div className="lpwrap lpherogrid">
          <div>
            <p className="lpeyebrow" data-reveal>Sealed tendering for people who get audited</p>
            <h1 data-reveal>Tenders you can<br /><em>prove</em> were fair.</h1>
            <p className="lead" data-reveal>
              Sealed bids. Blind scoring. Every signature on a chain an auditor can check.
            </p>
            <div className="lpacts" data-reveal>
              <button className="btn pri lpbtn" onClick={goSetup}>Set up your company</button>
              {canDemo && <button className="btn lpbtn" onClick={goDemo}>See it working</button>}
            </div>
          </div>
          {/* the collage: one tall plate, one wide one overlapping its corner */}
          <div className="lpcollage" data-reveal>
            <PlateFrame n="vault" tall cap="Sealed" meta="4 of 27" />
            <PlateFrame n="chain" wide cap="Chained" />
          </div>
        </div>
      </section>

      <Marquee />

      <section className="lpsec">
        <div className="lpwrap lpsplit">
          <div data-reveal><PlateFrame n="ladder" cap="Approved" meta="₦240m" /></div>
          <div data-reveal>
            <p className="lpeyebrow">However many layers you have</p>
            <h2>A request climbs until somebody&rsquo;s limit covers it.</h2>
            <p className="lead">
              You set what each level may commit and who reports to whom.
              <Note label="How the chain is built">
                Nobody signs their own request, a rejection anywhere ends the chain, and the
                route is frozen when raised — so a reorganisation next quarter cannot rewrite
                who was meant to sign last quarter.
              </Note>
            </p>
            <div className="lpladder lpladdertight" aria-hidden="true">
              {RUNGS.map(([who, what, tone], n) => (
                <div className={"rung " + tone} key={who} style={{ "--n": n }}>
                  <span>{who}</span><i>{what}</i>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <Figures />

      {/* the services band: the three promises as cards on the dark field,
          with the middle one filled, which is the shape the reference used */}
      <section className="lpband">
        <div className="lpwrap">
          <p className="lpeyebrow" data-reveal>What it guarantees</p>
          <h2 data-reveal>Three things it will not let you do.</h2>
          <div className="lpcards">
            {PROMISES.map(([art, title, why], n) => (
              <article key={title} className={n === 1 ? "on" : ""} data-reveal
                       style={{ transitionDelay: n * 80 + "ms" }}>
                <Illus n={art} w={104} />
                <h3>{title}</h3>
                <p>{why}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <StepsSection />
      <FaqSection ask={ask} setAsk={setAsk} />
      <CtaSection goSetup={goSetup} />
    </>
  );
}

/* ------------------------------------------------------------------ night
   One held frame, then as little as the argument can survive on. The hero is
   a dark field in either mode with a tall plate in it and the rail beneath;
   the three promises are full-bleed plates with the claim set over them; the
   questions are not an accordion, because this design's whole move is that
   nothing is hidden and there is simply less on screen at once. */
function NightPage({ goSetup, goDemo, canDemo }) {
  return (
    <>
      <section className="lphero onband">
        <div className="lpwrap">
          <div className="lpherogrid">
            <div>
              <h1 data-reveal>Tenders you can<br /><em>prove</em> were fair.</h1>
              <p className="lead" data-reveal>
                Sealed bids. Blind scoring. Every signature on a chain an auditor can check.
              </p>
              <div className="lpacts" data-reveal>
                <button className="btn pri lpbtn" onClick={goSetup}>Set up your company</button>
                {canDemo && <button className="btn lpbtn" onClick={goDemo}>See it working</button>}
              </div>
            </div>
            <div data-reveal><PlateFrame n="vault" tall cap="Sealed until the deadline" /></div>
          </div>
          <Rail />
        </div>
      </section>

      {/* each claim is its own frame, the plate behind the type */}
      {PROMISES.map(([art, title, why], n) => (
        <section className="lpframe" key={title} data-reveal>
          <PlateFrame n={["vault", "chain", "stack"][n]} wide />
          <div className="lpframein">
            <div className="lpwrap">
              <b>{String(n + 1).padStart(2, "0")}</b>
              <h2>{title}</h2>
              <p>{why}</p>
            </div>
          </div>
        </section>
      ))}

      <section className="lpsec">
        <div className="lpwrap lpnarrow">
          <h2 data-reveal>How it goes</h2>
          <ol className="lpsteps lpstepsrow">
            {STEPS.map(([title, why], n) => (
              <li key={title} data-reveal style={{ transitionDelay: n * 70 + "ms" }}>
                <b>{String(n + 1).padStart(2, "0")}</b>
                <h3>{title}</h3>
                <p>{why}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* no accordion: the answers are simply on the page */}
      <section className="lpsec">
        <div className="lpwrap lpnarrow">
          <h2 data-reveal>Questions</h2>
          <div className="lpqlist" data-reveal>
            {FAQ.map(([q, a]) => (
              <div key={q}><h3>{q}</h3><p>{a}</p></div>
            ))}
          </div>
        </div>
      </section>

      <CtaSection goSetup={goSetup} />
    </>
  );
}

/* ------------------------------------------------------------------ paper
   Stationery. The hero is one document with a torn edge across it: the claim
   on the counterfoil, the four facts on the stub. Everything below is another
   piece of paper, and the plates are sepia so they read as things kept in a
   file rather than photographs of an office. */
function PaperPage({ goSetup, goDemo, canDemo, ask, setAsk }) {
  return (
    <>
      <section className="lphero">
        <div className="lpwrap">
          <div className="lpticket" data-reveal>
            <div className="lpticketmain">
              <p className="lpeyebrow">Docket &middot; sealed tendering</p>
              <h1>Tenders you can<br /><em>prove</em> were fair.</h1>
              <p className="lead">
                Sealed bids. Blind scoring. Every signature on a chain an auditor can check.
              </p>
              <div className="lpacts">
                <button className="btn pri lpbtn" onClick={goSetup}>Set up your company</button>
                {canDemo && <button className="btn lpbtn" onClick={goDemo}>See it working</button>}
              </div>
            </div>
            <div className="lpticketstub">
              {RAIL.map(([k, what]) => (
                <div key={k}><b>{k}</b><span>{what}</span></div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="lpsec">
        <div className="lpwrap">
          <PlateFrame n="stack" wide cap="Held, unread" meta="until 14:00" />
        </div>
      </section>

      <section className="lpsec">
        <div className="lpwrap">
          <p className="lpeyebrow" data-reveal>What it guarantees</p>
          <div className="lpdocs">
            {PROMISES.map(([art, title, why], n) => (
              <article key={title} data-reveal style={{ transitionDelay: n * 80 + "ms" }}>
                <div className="lpdochead"><Illus n={art} w={84} /></div>
                <div className="lpdocbody">
                  <b>{String(n + 1).padStart(2, "0")}</b>
                  <h3>{title}</h3>
                  <p>{why}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <StepsSection />
      <LadderSection plate="ladder" />
      <FaqSection ask={ask} setAsk={setAsk} />
      <CtaSection goSetup={goSetup} />
    </>
  );
}

/* ------------------------------------------------- sections more than one
   page uses, kept here rather than copied into each so a wording change lands
   everywhere it appears. */

function StepsSection() {
  return (
    <section className="lpsec tint">
      <div className="lpwrap">
        <h2 data-reveal>How it goes</h2>
        <ol className="lpsteps">
          {STEPS.map(([title, why], n) => (
            <li key={title} data-reveal style={{ transitionDelay: n * 70 + "ms" }}>
              <b>{n + 1}</b>
              <h3>{title}<Note>{why}</Note></h3>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function LadderSection({ plate }) {
  return (
    <section className="lpsec">
      <div className="lpwrap lpsplit">
        <div data-reveal>
          {plate ? <PlateFrame n={plate} cap="The chain" /> : <Illus n="desk" w={184} />}
          <h2>However many layers you have.</h2>
          <p className="lead">
            A request climbs your reporting line until somebody&rsquo;s limit covers it.
            <Note label="How the chain is built">
              You set what each level may commit and who reports to whom. Nobody signs
              their own request, a rejection anywhere ends the chain, and the route is
              frozen when raised — so a reorganisation next quarter cannot rewrite who
              was meant to sign last quarter.
            </Note>
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
  );
}

function FaqSection({ ask, setAsk }) {
  return (
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
  );
}

function CtaSection({ goSetup }) {
  return (
    <section className="lpcta">
      <div className="lpwrap" data-reveal>
        <Mark s={56} animate />
        <h2>Start with the one you&rsquo;re dreading.</h2>
        <button className="btn pri lpbtn" onClick={goSetup}>Set up your company</button>
      </div>
    </section>
  );
}

const PAGES = { drawn: DrawnPage, bold: BoldPage, night: NightPage, paper: PaperPage };

/* ------------------------------------------------------------- the shell
   The bar and the footer are the same object on all four; only the page
   between them changes. Keeping them out here is what stops four copies of
   the sign-in button drifting apart. */

export function Landing({ cfg, onScreen }) {
  const demo = (cfg && cfg.demoUrl) || "";
  const canDemo = !!demo || !!(cfg && cfg.demoLogin);
  const [ask, setAsk] = useState(-1);
  /* Which of the four the deployment wears. It comes from the server with the
     rest of the config and there is no override here — not a prop, not a query
     parameter, not a stored preference. A front page that different visitors
     see differently is not a front page, and the one place it changes is the
     administration console. `designOf` guarantees a real design even on the
     first paint, before the config lands. */
  const design = designOf(cfg && cfg.landing);
  const Page = PAGES[design.key] || DrawnPage;
  useReveal([design.key]);

  const goDemo = () => { if (demo) window.location.href = demo; else onScreen("demo"); };
  const goSetup = () => {
    if (cfg && cfg.signupUrl) window.location.href = cfg.signupUrl + "/?setup=1";
    else onScreen("setup");
  };

  return (
    <div className="lp" data-design={design.key}>
      <header className="lpbar">
        <div className="lpwrap lpbarin">
          <Wordmark s={26} animate />
          <button className="lplink" onClick={() => onScreen("signin")}>Sign in</button>
          <button className="btn pri sm" onClick={goSetup}>Get started</button>
        </div>
      </header>

      <Page goSetup={goSetup} goDemo={goDemo} canDemo={canDemo}
            onScreen={onScreen} ask={ask} setAsk={setAsk} />

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
/* ONE SPACING SCALE, FIVE TYPE SIZES. Every margin and padding below is one of
   --s1…--s7; nothing is a number somebody eyeballed. That is what keeps the
   vertical rhythm from drifting as sections get edited one at a time. */
.lp{
  --t1:clamp(38px,8.5vw,68px);   /* display */
  --t2:clamp(25px,4.4vw,38px);   /* heading */
  --t3:17px;                     /* lead    */
  --t4:15px;                     /* body    */
  --t5:13px;                     /* small   */
  --s1:4px; --s2:8px; --s3:16px; --s4:24px; --s5:40px; --s6:64px; --s7:96px;
  --settle:cubic-bezier(.16,1,.3,1);
  background:var(--lp-bg);color:var(--lp-ink);min-height:100dvh;overflow-x:clip;
  font-size:var(--t4);line-height:1.6}

/* The gutter is a token too, so the bar, the sections and the footer cannot
   disagree about where the edge of the page is. */
.lpwrap{max-width:1080px;margin-inline:auto;padding-inline:var(--s4);width:100%}
.lpnarrow{max-width:720px}
.lp h1,.lp h2,.lp h3{letter-spacing:-.032em;margin:0;text-wrap:balance}
.lp h1{font-size:var(--t1);line-height:1.02;font-weight:700}
.lp h2{font-size:var(--t2);line-height:1.1;font-weight:700}
.lp h3{font-size:var(--t4);line-height:1.35;font-weight:600;letter-spacing:-.015em}
.lp p{margin:0;color:var(--lp-muted);text-wrap:pretty}
.lp .lead{font-size:var(--t3);line-height:1.55;max-width:36ch}
.lplink{background:none;border:0;font:inherit;font-size:var(--t5);color:var(--lp-muted);
  cursor:pointer;padding:var(--s1) 2px}
.lplink:hover{color:var(--lp-ink)}

/* --------------------------------------------------------------- the detail
   Hover or focus. Capped in width so a long note cannot quietly become a
   paragraph again, and under 600px it drops to a static block on tap, because
   a floating bubble on a phone has nowhere to go. */
.note{display:inline-flex;vertical-align:-2px;margin-left:var(--s2);position:relative;
  color:var(--lp-faint);cursor:help;border-radius:50%}
.note:focus-visible{outline:2px solid var(--lp-accent-2);outline-offset:2px}
.note svg{fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round}
.note:hover,.note:focus{color:var(--lp-accent)}
.note em{position:absolute;left:50%;bottom:calc(100% + var(--s2));
  width:max-content;max-width:min(300px,72vw);padding:var(--s3);border-radius:12px;
  background:var(--tip-bg);color:var(--tip-ink);font-style:normal;font-size:var(--t5);
  font-weight:400;line-height:1.5;letter-spacing:0;text-align:left;z-index:20;
  opacity:0;visibility:hidden;translate:-50% var(--s1);
  transition:opacity 180ms var(--settle),translate 180ms var(--settle),visibility 180ms;
  box-shadow:0 12px 32px -12px rgba(0,0,0,.4)}
.note:hover em,.note:focus em,.note:focus-within em{opacity:1;visibility:visible;
  translate:-50% 0}
@media(max-width:599px){
  .note em{position:static;translate:none;visibility:visible;opacity:1;display:none;
    max-width:100%;margin-top:var(--s2);box-shadow:none}
  .note:focus em{display:block}
}

/* --------------------------------------------------------------------- bar */
.lpbar{position:sticky;top:0;z-index:40;
  background:color-mix(in srgb,var(--lp-bg) 88%,transparent);
  backdrop-filter:blur(10px);border-bottom:1px solid var(--lp-line)}
.lpbarin{display:flex;align-items:center;gap:var(--s3);padding-block:var(--s2)}
.lpbarin .lplink{margin-left:auto}

/* -------------------------------------------------------------------- hero */
.lphero{padding-block:var(--s6) var(--s2)}
.lpherogrid{display:grid;gap:var(--s5)}
.lp h1 em{font-style:normal;color:var(--lp-accent)}
.lphero .lead{margin-block:var(--s4)}
.lpacts{display:flex;flex-wrap:wrap;gap:var(--s2)}
.lpbtn{min-width:190px;justify-content:center;padding:var(--s3) var(--s4);font-size:var(--t4)}

/* ------------------------------------------------------------- the figure */
.fig{margin:0;border:1px solid var(--lp-line);border-radius:var(--lp-radius);overflow:hidden;
  background:var(--lp-surface);max-width:400px}
.figstage{display:flex;align-items:center;justify-content:center;gap:var(--s3);
  height:176px;background:var(--lp-sunk)}
.fenv{position:relative;display:grid;justify-items:center;gap:var(--s2);color:var(--lp-accent)}
.fenv svg{overflow:visible}
.fe-body{fill:var(--lp-surface);stroke:currentColor;stroke-width:2.4;stroke-linejoin:round}
.fe-flap{fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round;
  stroke-linejoin:round}
.fenv i{font-style:normal;font-family:var(--font-mono);font-size:var(--t5);color:var(--lp-faint)}
.fwax{position:absolute;top:11px;width:11px;height:11px;border-radius:50%;
  background:var(--wax);box-shadow:0 0 0 2.5px var(--lp-surface);
  transition:opacity 300ms var(--settle),transform 300ms var(--settle)}
.fig figcaption{border-top:1px solid var(--lp-line);padding:var(--s3) var(--s4);
  display:grid;gap:var(--s1);min-height:78px;align-content:start}
.fig figcaption b{font-size:var(--t4);font-weight:600;letter-spacing:-.015em}
.fig figcaption span{font-size:var(--t5);color:var(--lp-muted)}
.fig figcaption em{display:flex;gap:5px;margin-top:var(--s2)}
.fig figcaption em i{width:18px;height:3px;border-radius:2px;background:var(--lp-line2);
  transition:background 300ms var(--settle)}
.fig figcaption em i.on{background:var(--lp-accent-2)}
.ph-open .fwax{opacity:0;transform:scale(.4) translateY(8px)}
@media(prefers-reduced-motion:no-preference){
  .ph-in .fenv{animation:envin 700ms var(--settle) both;animation-delay:calc(var(--n)*110ms)}
  .fenv{transition:transform 520ms var(--settle)}
  .ph-time .fenv{transform:translateY(-5px)}
}
@keyframes envin{from{opacity:0;transform:translateY(18px) rotate(-6deg)}to{opacity:1;transform:none}}

/* ---------------------------------------------------------------- sections */
.lpsec{padding-block:var(--s6)}
.lpsec.tint{background:var(--lp-bg2)}
.lpsec > .lpwrap > h2{margin-bottom:var(--s5)}

.lptrio{display:grid;gap:var(--s5)}
.lptrio article{display:grid;justify-items:center;text-align:center;gap:var(--s3)}
.lptrio .illus{margin:0}
@media(prefers-reduced-motion:no-preference){
  .lptrio .illus{transition:transform 460ms var(--settle)}
  .lptrio article:hover .illus{transform:translateY(-4px)}
}

.lpsteps{list-style:none;margin:0;padding:0;display:grid;gap:var(--s4)}
.lpsteps li{display:grid;grid-template-columns:auto minmax(0,1fr);gap:var(--s3);
  align-items:baseline}
.lpsteps b{font-size:var(--t2);font-weight:700;color:var(--lp-line2);line-height:.9;
  letter-spacing:-.04em;font-variant-numeric:tabular-nums}

.lpsplit{display:grid;gap:var(--s5);align-items:center}
.lpsplit .illus{margin:0 0 var(--s4)}
.lpsplit h2{margin-bottom:var(--s3)}
.lpladder{display:grid;gap:var(--s2)}
.rung{display:flex;gap:var(--s3);align-items:center;justify-content:space-between;
  background:var(--lp-surface);border:1px solid var(--lp-line);border-radius:var(--lp-radius-sm);
  padding:var(--s3) var(--s4);margin-left:calc(var(--n) * var(--s3));font-size:var(--t4)}
.rung span{font-weight:600;letter-spacing:-.015em}
.rung i{font-style:normal;font-size:var(--t5);color:var(--lp-muted);
  font-family:var(--font-mono);white-space:nowrap}
.rung.from{border-style:dashed;background:var(--lp-sunk)}
.rung.done{border-color:var(--lp-accent);background:var(--lp-accent-tint)}
@media(prefers-reduced-motion:no-preference){
  [data-reveal].seen .rung{animation:rungin 520ms var(--settle) both;
    animation-delay:calc(var(--n) * 110ms)}
}
@keyframes rungin{from{opacity:0;transform:translateX(-14px)}to{opacity:1;transform:none}}

/* --------------------------------------------------------------------- Q&A */
.lpfaq{border-top:1px solid var(--lp-line)}
.qa{border-bottom:1px solid var(--lp-line)}
.qa > button{width:100%;display:flex;align-items:center;gap:var(--s3);text-align:left;
  background:none;border:0;font:inherit;font-size:var(--t4);font-weight:600;
  letter-spacing:-.015em;color:inherit;padding-block:var(--s3);cursor:pointer}
.qa > button i{margin-left:auto;flex-shrink:0;width:13px;height:13px;position:relative}
.qa > button i::before,.qa > button i::after{content:"";position:absolute;inset:50% 0 auto;
  height:2px;border-radius:2px;background:var(--lp-faint);transition:transform 260ms var(--settle)}
.qa > button i::after{transform:rotate(90deg)}
.qa.on > button i::after{transform:rotate(0)}
.qa.on > button i::before,.qa.on > button i::after{background:var(--lp-accent)}
.qaa{display:grid;grid-template-rows:0fr;transition:grid-template-rows 280ms var(--settle)}
.qa.on .qaa{grid-template-rows:1fr}
.qaa > p{overflow:hidden;font-size:var(--t4);max-width:60ch}
.qa.on .qaa > p{padding-bottom:var(--s3)}

/* --------------------------------------------------------------------- CTA */
.lpcta{padding-block:var(--s7);text-align:center;border-top:1px solid var(--lp-line)}
.lpcta .dkmark{margin:0 auto var(--s4)}
.lpcta h2{margin-bottom:var(--s5)}
.lpfoot{padding-block:var(--s4) var(--s5);border-top:1px solid var(--lp-line);
  background:var(--lp-bg2)}
.lpfootin{display:flex;flex-wrap:wrap;gap:var(--s3);align-items:center;
  justify-content:space-between}
.lpfootin > div{display:flex;flex-wrap:wrap;gap:var(--s4)}

/* --------------------------------------------------------------- the demo
   A strip, not a banner. It was a full-width block taking a real slice of the
   viewport — on a phone, most of the first screen, so the reminder mattered
   more than anything it sat above. 26px, sticky, says the same thing. */
.demobar{position:sticky;top:0;z-index:60;display:flex;gap:var(--s2);
  align-items:center;justify-content:center;height:26px;padding-inline:var(--s3);
  font-size:11.5px;letter-spacing:.01em;background:var(--brass-tint);
  color:var(--gold-ink);border-bottom:1px solid var(--brass);
  white-space:nowrap;overflow:hidden}
.demobar .doclink{color:inherit;text-decoration:underline;font-size:inherit;opacity:.85}
.demobar .doclink:hover{opacity:1}
.isdemo .side,.isdemo .topbar{top:26px}

@media(min-width:${BP.sm}px){
  .lpsteps{grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--s5) var(--s4)}
  .lptrio{grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--s4)}
}
@media(min-width:${BP.desk}px){
  .lphero{padding-block:var(--s7) var(--s2)}
  .lpherogrid{grid-template-columns:minmax(0,1fr) minmax(0,420px);gap:var(--s6);
    align-items:center}
  .lptrio{gap:var(--s5)}
  .lpsteps{grid-template-columns:repeat(4,minmax(0,1fr));gap:var(--s4)}
  .lpsplit{grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--s6)}
  .lpsec{padding-block:var(--s7)}
}

/* ==================================================================
   THE SECTIONS THE FOUR PAGES BUILD FROM

   Structure only. Every colour below is a --lp-* token and every design sets
   those, so nothing here knows which page it is drawing. The handful of rules
   that genuinely differ by design live in designs.js with that design's
   tokens, not here.
   ================================================================== */

/* The display size and tracking are per design now, so a page can be a
   brochure or a held frame without arguing with the shared scale. */
.lp h1{letter-spacing:var(--lp-h1-track,-.032em)}
.lpsec{padding-block:var(--lp-sec,var(--s6))}

/* A small label over a heading. Uppercase and letter-spaced, and the tracking
   is a design token because it is the one type move that separates stationery
   from a brochure. */
.lpeyebrow{font-size:var(--t5);font-weight:700;letter-spacing:var(--lp-cap-track,.1em);
  text-transform:uppercase;color:var(--lp-accent);margin-bottom:var(--s3)}

/* ---------------------------------------------------------- bold: collage
   Two plates, the wide one lifted onto the tall one's bottom corner. On a
   phone they stack and the overlap is dropped: an overlapping collage in a
   360px column is two pictures fighting over the same 40 pixels. */
.lpcollage{display:grid;gap:var(--s3)}
.lpcollage .plateframe{box-shadow:var(--sh-3)}

/* ------------------------------------------------------------- bold: band
   The dark services field. Its own block rather than .lpsec.tint because the
   type inside is written against the band, not against the page. */
.lpband{background:var(--lp-band);color:var(--lp-on-band);
  padding-block:var(--lp-sec,var(--s6))}
.lpband .lpeyebrow{color:var(--lp-accent-2)}
.lpband h2{margin-bottom:var(--s5)}
.lpcards{display:grid;gap:var(--s3)}
.lpcards article{background:color-mix(in srgb,var(--lp-on-band) 8%,transparent);
  border:1px solid color-mix(in srgb,var(--lp-on-band) 16%,transparent);
  border-radius:var(--lp-radius);padding:var(--s4);display:grid;gap:var(--s3);
  align-content:start}
.lpcards article h3{color:var(--lp-on-band)}
.lpcards article p{color:var(--lp-on-band-muted);font-size:var(--t5);line-height:1.55}
/* One card filled, which is the reference's move and the only place the loud
   accent covers this much area. The label on it is --lp-on-accent, so it is
   the dark step and not the band's near-white. */
.lpcards article.on{background:var(--lp-accent-2);border-color:var(--lp-accent-2)}
.lpcards article.on h3{color:var(--lp-on-accent)}
.lpcards article.on p{color:color-mix(in srgb,var(--lp-on-accent) 82%,transparent)}
.lpcards article.on .illus{--il-ink:var(--lp-on-accent);--il-ink-2:var(--lp-on-accent);
  --il-cool:var(--lp-on-accent);--il-warm:var(--lp-on-accent);
  --il-paper:var(--lp-accent-2);--il-line:color-mix(in srgb,var(--lp-on-accent) 40%,transparent);
  --il-tint:color-mix(in srgb,var(--lp-on-accent) 12%,transparent)}
.lpcards article:not(.on) .illus{--il-ink:var(--lp-on-band);--il-ink-2:var(--lp-on-band-muted);
  --il-cool:var(--lp-accent-2);--il-warm:var(--lp-accent-2);
  --il-paper:var(--lp-band);--il-line:var(--lp-on-band-muted);
  --il-tint:color-mix(in srgb,var(--lp-accent-2) 16%,transparent)}
.lpladdertight{margin-top:var(--s4)}

/* -------------------------------------------------------- night: a frame
   A full-bleed plate with the claim set over it. The plate already carries a
   vignette top and bottom, which is what lets the type sit straight on the
   picture with no panel behind it. */
.lpframe{position:relative;isolation:isolate}
.lpframe .plateframe{border-radius:0;aspect-ratio:4 / 5}
.lpframein{position:absolute;inset:auto 0 0;padding-block:var(--s5)}
.lpframein b{display:block;font-family:var(--font-mono);font-size:var(--t5);
  letter-spacing:.1em;color:var(--lp-accent-2);margin-bottom:var(--s2)}
.lpframein h2{color:var(--pl-cap,#fff);margin-bottom:var(--s3);max-width:16ch}
.lpframein p{color:color-mix(in srgb,var(--pl-cap,#fff) 78%,transparent);
  max-width:52ch;font-size:var(--t4)}

/* night: the steps as a row of numbered blocks rather than a labelled list,
   and the questions simply answered rather than folded away. */
.lpstepsrow li{display:block}
.lpstepsrow b{display:block;font-size:var(--t5);font-family:var(--font-mono);
  letter-spacing:.1em;color:var(--lp-accent);margin-bottom:var(--s2)}
.lpstepsrow h3{margin-bottom:var(--s2)}
.lpstepsrow p{font-size:var(--t5);color:var(--lp-muted);line-height:1.55}
.lpqlist{display:grid;gap:var(--s5)}
.lpqlist h3{margin-bottom:var(--s2)}
.lpqlist p{font-size:var(--t4);max-width:62ch}

/* -------------------------------------------------------- paper: the ticket
   The hero as one document torn across: the claim on the counterfoil, the
   four facts on the stub. The perforation is a dashed border with two notches
   punched out of the edges, the same construction the seal figure uses. */
/* No overflow:hidden. The notches are drawn outside the stub's box on
   purpose — they are holes punched through the card's edge — and clipping the
   card to its own radius ate both of them. The stub carries the matching
   radius itself instead, so the corners still round without a clip. */
.lpticket{background:var(--lp-surface);border:1px solid var(--lp-line);
  border-radius:var(--lp-radius);box-shadow:var(--sh-3)}
.lpticketmain{padding:var(--s5) var(--s4)}
.lpticketmain .lead{margin-block:var(--s4)}
.lpticketstub{position:relative;padding:var(--s4);display:grid;gap:var(--s3);
  border-top:2px dashed var(--lp-line2);background:var(--lp-sunk);
  border-radius:0 0 var(--lp-radius) var(--lp-radius)}
.lpticketstub::before,.lpticketstub::after{content:"";position:absolute;top:-11px;
  width:20px;height:20px;border-radius:50%;background:var(--lp-bg)}
.lpticketstub::before{left:-11px}
.lpticketstub::after{right:-11px}
.lpticketstub b{display:block;font-size:var(--t5);font-weight:700;
  letter-spacing:var(--lp-cap-track,.14em);text-transform:uppercase;color:var(--lp-accent)}
.lpticketstub span{display:block;font-size:var(--t5);color:var(--lp-muted);
  line-height:1.45;margin-top:2px}

/* paper: the promises as filed documents, each with its own torn head */
.lpdocs{display:grid;gap:var(--s4)}
.lpdocs article{background:var(--lp-surface);border:1px solid var(--lp-line);
  border-radius:var(--lp-radius);overflow:hidden}
.lpdochead{background:var(--lp-band);padding:var(--s4);display:grid;place-items:center;
  border-bottom:2px dashed var(--lp-line2)}
.lpdochead .illus{--il-ink:var(--lp-on-band);--il-ink-2:var(--lp-on-band-muted);
  --il-cool:var(--lp-accent-2);--il-warm:var(--lp-accent-2);
  --il-paper:var(--lp-band);--il-line:var(--lp-on-band-muted);
  --il-tint:color-mix(in srgb,var(--lp-accent-2) 18%,transparent)}
.lpdocbody{padding:var(--s4)}
.lpdocbody b{display:block;font-family:var(--font-mono);font-size:var(--t5);
  letter-spacing:.08em;color:var(--lp-accent);margin-bottom:var(--s2)}
.lpdocbody h3{margin-bottom:var(--s2)}
.lpdocbody p{font-size:var(--t5);color:var(--lp-muted);line-height:1.55}

@media(min-width:600px){
  .lpcards{grid-template-columns:repeat(3,minmax(0,1fr))}
  .lpdocs{grid-template-columns:repeat(3,minmax(0,1fr))}
  .lpticketstub{grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--s3) var(--s4)}
  .lpqlist{grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--s5) var(--s4)}
}
@media(min-width:900px){
  .lpframe .plateframe{aspect-ratio:21 / 9}
  .lpframein{padding-block:var(--s6)}
  .lpticket{display:grid;grid-template-columns:minmax(0,1fr) 300px}
  .lpticketmain{padding:var(--s6) var(--s5)}
  /* On the wide ticket the tear runs down the side, not across it. */
  .lpticketstub{border-top:0;border-left:2px dashed var(--lp-line2);
    align-content:center;padding:var(--s5) var(--s4);
    border-radius:0 var(--lp-radius) var(--lp-radius) 0}
  .lpticketstub::before,.lpticketstub::after{top:auto;left:-11px;right:auto}
  .lpticketstub::before{top:-11px}
  .lpticketstub::after{bottom:-11px}
  /* the collage overlaps only where there is room for it to */
  .lpcollage{position:relative;padding-bottom:var(--s6)}
  .lpcollage .plateframe.wide{position:absolute;right:calc(var(--s5) * -1);bottom:0;
    width:62%;border:3px solid var(--lp-bg)}
}
`;
