/* The front door.

   ONE PAGE, ON THE SPINE ENTERPRISE BUYERS ALREADY KNOW. The earlier versions
   were posters: a claim, a drawing, a lot of air. They read as design rather
   than as a vendor, and the people who sign a procurement contract are not
   moved by a poster — they are moved by a page that answers, in order, the
   questions they were going to ask anyway. So the section order below is the
   one SAP, Coupa, Ivalua and Jaggaer all use, because it is the order the
   evaluation happens in:

     what it is · what it guarantees · how each guarantee works ·
     what the numbers look like · what you buy · who else uses it ·
     what an outsider says · what to read · what to do next · objections

   THE MOTIF IS THE RECORD. Hairline rules, mono indices, tabular figures and
   almost no rounding: the page is laid out like the document it promises to
   produce. The page now has PICTURES as well as panels — see the rule below —
   but they are drawn in the product's own vocabulary and they never take the
   place of a real screen. There is one jump in scale, the headline and the
   dark band, and one warm ground, the hero; everything else stays quiet so
   those read.

   SIX RULES.

     THE PRODUCT IS THE IMAGERY, AND WHERE THE PRODUCT CANNOT BE SHOWN THE
     DRAWING IS OURS. No stock photography, no plates, no abstract art. Every
     panel on this page is a real screen or a real chart, drawn with the same
     components the signed-in app uses — Columns, Meter and Spark come straight
     out of charts.jsx. Where a section is an argument rather than a screen —
     what the chain is, what blind scoring means, what a register holds — it
     carries a drawn scene from lpart.jsx instead: same tokens, same theme
     switch, no asset files and no CDN. A marketing page that invents its own
     visual language is a page that will not survive contact with the product,
     and a page illustrated out of a stock library is a page illustrated by
     somebody who has never seen the product at all.

     THE FIGURES ARE THE PRODUCT'S OWN. The charts run on the demo workspace's
     numbers, the ones a visitor will meet ten seconds later if they click
     through. Nothing here is a number invented to look good.

     PLACEHOLDERS STAY VISIBLE, AND LOOK DELIBERATE. Customer logos, the
     outside quote and one metric are empty, because roughly half of what sells
     enterprise software is proof and this page has none yet. Inventing a
     customer would be the front page lying on behalf of a product whose whole
     claim is that it does not. So the empty ones are drawn the way a drawing
     office marks a reserved area — hatched, ruled, labelled — rather than left
     as square brackets, which read as a page that was shipped unfinished
     rather than as a page holding a space open.

     COLOUR COMES FROM designs.js. Nothing here names a colour; every value is
     a --lp-* token, so the palette can change from the administration console
     without touching this file.

     TWO TYPEFACES, AND THE SECOND ONE IS THE MONO. main.jsx dropped the serif
     on purpose, so the typographic contrast here is sans against mono rather
     than sans against a display face. That is the right accident: the mono
     carries indices, references, timestamps and money — exactly what this
     product is about — so the page's second voice is the voice of the record
     itself. Nothing here loads or names a third family.

   Mobile first: every rule outside a media query describes a 360px screen. */
import React, { useEffect, useRef, useState } from "react";

import { BP } from "./breakpoints";
import { Columns, Meter, Spark } from "./charts";
import { DUR, reducedMotion, useCountUp, useReveal } from "./motion";
import { fmtCompact } from "./helpers";
import { Icon } from "./icons";
import { Mark, Wordmark } from "./logo";
import { Art } from "./lpart";
import { designOf } from "./designs";

/* ------------------------------------------------------------------- data
   The demo workspace's own figures. Kestrel Hospitality Group is the seeded
   organisation, so a visitor who clicks "See a live workspace" lands on these
   exact numbers rather than on something that resembles them. */

/* `key` is what the axis prints and `label` is what the tooltip says, so the
   keys are short words rather than slugs — an axis reading "eqpt" is a
   developer's variable name leaking onto the front page. */
const SPEND = [
  { key: "Food", label: "Food & beverage", value: 482_000_000 },
  { key: "Logistics", label: "Logistics & cold chain", value: 241_000_000 },
  { key: "Equipment", label: "Equipment", value: 186_000_000 },
  { key: "Facilities", label: "Facilities & maintenance", value: 120_000_000 },
  { key: "Uniforms", label: "Uniforms & PPE", value: 64_000_000 },
  { key: "Utilities", label: "Utilities", value: 42_000_000 },
];

/* One of these is deliberately over its limit. A budget chart in which every
   bar is comfortably inside its ceiling is a chart nobody needs. */
const BUDGETS = [
  { label: "Food & beverage", value: 482_000_000, max: 620_000_000 },
  { label: "Logistics & cold chain", value: 241_000_000, max: 300_000_000 },
  { label: "Equipment", value: 186_000_000, max: 250_000_000 },
  { label: "Facilities & maintenance", value: 120_000_000, max: 110_000_000 },
];

/* Counted rather than printed, so `to` is a number and `fmt` turns it back
   into the thing a reader recognises.

   useCountUp rounds to whole numbers, so the billion figure counts in millions
   and is divided back down on the way out: a tile ticking 0.00 → 1.13 needs
   two decimals, and a counter that only ever holds integers would sit at 0.00
   the entire way up.

   The nought is a real nought and is left alone — `to` and the mount value are
   both 0, so useCountUp returns it immediately. A zero that animates is a zero
   presenting itself as an achievement. */
const TILES = [
  { to: 18, fmt: (n) => String(n), label: "tenders run this year",
    points: [4, 6, 5, 9, 7, 11, 10, 14] },
  { to: 1130, fmt: (n) => "₦" + (n / 1000).toFixed(2) + "bn", label: "committed value governed",
    points: [3, 5, 6, 6, 9, 12, 13, 17] },
  { to: 1284, fmt: (n) => n.toLocaleString("en-NG"), label: "events on the chain",
    points: [2, 4, 7, 9, 12, 14, 18, 22] },
  { to: 0, fmt: (n) => String(n), label: "integrity breaks found",
    points: [0, 0, 0, 0, 0, 0, 0, 0] },
];

const LIVE = [
  ["KST-2026-014", "Kitchen equipment, Lekki commissary", "₦240,000,000", "7", "sealed", "14 Oct 14:00"],
  ["KST-AUC-030", "Cooking oil, 12-month supply", "₦64,000,000", "5", "live", "Today 17:30"],
  ["KST-2026-011", "Cold-chain logistics, Lagos–Abuja", "₦86,000,000", "4", "scoring", "Closed 18 Sep"],
  ["KST-2026-017", "Generator maintenance, 6 sites", "₦42,000,000", "2", "sealed", "21 Oct 12:00"],
  ["KST-2026-009", "Uniforms & PPE, all sites", "₦18,000,000", "6", "awarded", "—"],
];

const SEALED = [
  ["Delta Kitchen Systems", "19 Sep 09:12", "6 of 6"],
  ["Lagos Cold Chain Ltd", "19 Sep 16:40", "5 of 6"],
  ["Sahara Foods Equipment", "20 Sep 11:05", "6 of 6"],
  ["Ibadan Steelworks", "21 Sep 08:31", "4 of 6"],
  ["Port Harcourt Catering Supply", "21 Sep 17:58", "6 of 6"],
];

const CHAIN = [
  ["Tunde Bello", "Category Manager", "Signed 3 Sep 10:14 · authority to ₦10,000,000", "done"],
  ["Ngozi Eze", "Head of Procurement", "Signed 5 Sep 16:02 · authority to ₦50,000,000", "done"],
  ["Finance Director", "", "Awaiting signature · authority to ₦500,000,000 · reminded 21 Sep", "wait"],
];

/* Numbered on the page, so the order is part of the content: this is the list
   a buyer pastes into an evaluation matrix, and 01–06 is how it comes back to
   us. The previous version of this section was six outline icons above six
   paragraphs — the single most template-looking arrangement a software page
   can adopt, and one that said nothing an index does not say better. The icons
   are gone with it; a shield glyph beside the words "reduce dispute risk"
   carried no information the words did not already carry. */
const BENEFITS = [
  ["Increase control",
   "Every tender runs the same route — scope, criteria, approval, publication, sealing, opening, scoring, award. Nothing skips a step because somebody was in a hurry."],
  ["Turn savings into value",
   "Bids are compared against budget, against what you last paid, and against a computed baseline, so a saving is measured against the real cost of the item rather than against the highest quote that arrived."],
  ["Reduce dispute risk",
   "Bids are encrypted on arrival and sealing is time-based, not permission-based. No role in the system opens an envelope early, and an administrator holds every role there is."],
  ["Improve visibility",
   "One register of live events, committed value, approvals in flight and vendor paperwork about to lapse — readable by finance without asking procurement for a spreadsheet."],
  ["Bring vendors on board",
   "Vendors register once — bank details, TIN, CAC documents, categories — and carry that record into every tender they are invited to. Import an existing list and duplicates are reported, never merged silently."],
  ["Automate oversight",
   "Approval limits, conflict-of-interest declarations and document checks run as rules in real time. A request above a limit climbs until somebody's authority covers it."],
];

/* THE FOUR ARGUMENTS THE PAGE HAS TO MAKE IN PICTURES. Each one is a claim a
   screenshot cannot carry: a hash chain is invisible on screen, a blind panel
   looks exactly like a panel that is not blind, a falling price is a shape
   rather than a number, and a register is a list until you show what is on
   each row. So these four get a drawn scene from lpart.jsx. The remaining
   claims on the page get a real product panel instead, because they can. */
const FEATURES = [
  ["chain", "Tamper-evident by construction",
   "Every event carries the fingerprint of the one before it. Change a line after the fact and the chain stops verifying — which is a thing you can check, not a thing you have to believe.",
   "One hash chain per workspace"],
  ["score", "Nobody scores a name",
   "Evaluators see the offer and not the vendor behind it until the panel reconciles. Weights are fixed before bids open, so nobody can rebalance the criteria once they know who is winning.",
   "Weights frozen before opening"],
  ["auction", "Watch the price come down",
   "Run a category as a live reverse auction: rank-visible, minimum decrements, automatic extension when a bid lands in the closing minutes. The whole descent stays on the record.",
   "Rank visible, identity not"],
  ["register", "One registration, every tender",
   "Vendors file bank details, TIN and CAC documents once and carry that record into every buyer who invites them. Expiries are tracked and chased before they lapse, not after.",
   "1,400 vendors on the register"],
];

/* The route every tender takes, which is the same route every time — that is
   the product. Drawn as a numbered rail rather than eight cards, because the
   sequence IS the information and cards in a grid throw the sequence away.
   The marks are icons.jsx glyphs at 22px: at this size an outline glyph is
   exactly right, and the argument against icons in BENEFITS below — that a
   shield beside "reduce dispute risk" carries nothing the words do not — does
   not apply to a step whose name is a verb. */
const STEPS = [
  ["tender", "Scope", "Requirement, lots, budget"],
  ["scales", "Criteria", "Weights fixed and published"],
  ["check", "Approve", "Climbs your reporting line"],
  ["upload", "Publish", "Invited vendors notified at once"],
  ["lock", "Seal", "Encrypted on arrival"],
  ["envelopeOpen", "Open", "At the deadline, with witnesses"],
  ["analytics", "Score", "Blind, then reconciled"],
  ["trophy", "Award", "Memo, contract, chain entry"],
];

/* The sectors strip. It scrolls, so it is written twice in the markup — see
   .lpticker. These are the kinds of organisation the product is built for,
   not a claim about who is already using it; the customer proof stays in the
   reserved frames further down where it cannot be mistaken for a logo wall. */
const SECTORS = [
  ["portal", "Hospitality groups"],
  ["dashboard", "Manufacturers"],
  ["shield", "Hospitals"],
  ["audit", "Schools & universities"],
  ["stamp", "State agencies"],
  ["finance", "Financial services"],
  ["suppliers", "Logistics operators"],
];

const MODULES = [
  ["tender", "Sourcing & tenders", "Open, restricted and framework tenders, plus live reverse auctions with rank-visible bidding."],
  ["suppliers", "Vendor register", "Self-service registration, document expiry tracking, prequalification and category management."],
  ["scales", "Evaluation & scoring", "Weighted criteria, blind panel scoring, consensus reconciliation and recommendation memos."],
  ["audit", "Audit & reporting", "Hash-chained event log, integrity verification, compliance exports and a read-only auditor role."],
];

/* The fourth cover is `reserved` on purpose and matches the customer frames,
   because the fourth resource is reserved too. One drawing for "this space is
   being held open" is how a reader learns to read it. */
const RESOURCES = [
  ["book", "Guide", "Running your first sealed tender", "Scope to award in fourteen steps, with the documents you need at each one."],
  ["grid", "Template", "A delegation-of-authority matrix that works", "Limits by level and category, with the questions to settle before you set them."],
  ["audit", "Briefing", "What an auditor actually asks for", "The eleven artefacts a procurement audit requests, and where each one lives."],
  ["reserved", "Report", "Procurement practice in Nigerian mid-market firms", "Reserved for commissioned or cited research. Nothing invented goes in this slot."],
];

const FAQ = [
  ["Can an administrator read a sealed bid?",
   "No. Sealing is time-based, not permission-based, so there is no capability anywhere in the system that opens an envelope early — and a superuser holds every capability there is. Opening is a recorded event that names who was present."],
  ["We have four layers of management. Does it handle that?",
   "Then it collects four signatures. You set what each level may commit and who reports to whom, and a request climbs your own reporting line until somebody's limit covers the value. Nobody signs their own request, and a rejection anywhere ends the chain."],
  ["Can we bring our existing vendor list?",
   "Paste it or upload it during setup. Columns are matched for you, duplicates are reported rather than merged, and everyone with an address is invited to complete their own registration."],
  ["How does DOCKET fit with our finance system?",
   "Committed value, awards and supplier records are exported over a versioned, read-only data feed authenticated by its own service keys, so your warehouse or ERP pulls on a schedule without anyone holding a login."],
];

/* Module scope, so the scrollspy's target list is a constant: the observer
   below needs no dependency array and can never be rebuilt on a re-render. */
const NAV = [
  ["guarantees", "Product"],
  ["how", "Process"],
  ["analytics", "Analytics"],
  ["modules", "Modules"],
  ["resources", "Resources"],
];

/* ------------------------------------------------------------------ hooks */

/* The header's three pieces of scroll state, read once per animation frame off
   one passive listener. Three separate listeners for "am I stuck", "how far
   down" and "which section" is three layout reads a frame for one bar. */
function useChrome() {
  const [scroll, setScroll] = useState({ stuck: false, prog: 0 });
  const [here, setHere] = useState("");

  useEffect(() => {
    let raf = 0;
    const read = () => {
      raf = 0;
      const y = window.scrollY || 0;
      const room = document.documentElement.scrollHeight - window.innerHeight;
      setScroll({ stuck: y > 8, prog: room > 0 ? Math.min(1, y / room) : 0 });
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(read); };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  /* "You are here" is decided by a band across the middle of the viewport,
     which is why the root margin is negative on both edges: a section becomes
     current once it owns the reader's eyeline, not once its first pixel
     appears at the bottom of the screen. */
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return undefined;
    const els = NAV.map(([id]) => document.getElementById(id)).filter(Boolean);
    if (!els.length) return undefined;
    const io = new IntersectionObserver((entries) => {
      const shown = entries.filter((e) => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (shown.length) setHere(shown[0].target.id);
    }, { rootMargin: "-45% 0px -50% 0px" });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return { ...scroll, here };
}

/** True once the element has been on screen, and true immediately for a reader
    who has asked for less motion. Counters that run behind the fold have
    already finished by the time anybody scrolls down to look at them. */
function useSeen() {
  const ref = useRef(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (reducedMotion() || typeof IntersectionObserver === "undefined") { setSeen(true); return undefined; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); }
    }, { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, seen];
}

/* --------------------------------------------------------------- pieces */

function Chip({ state }) {
  return <span className={"lpchip " + state}>{state}</span>;
}

/* The compact product panel that stands in for a screenshot. It is real
   markup rather than an image so it stays sharp, restyles with the palette,
   and can never go out of date against the product. */
function LivePanel() {
  return (
    <div className="lppanel lplive">
      <div className="lppanelbar">
        <b>DOCKET</b><span>Kestrel Hospitality Group · Tenders</span><i>15:42</i>
      </div>
      {/* Six columns do not fit a 360px screen, so the two that carry least on
          a first look drop out of the markup's flow below `sm` and the rest
          scrolls if it still needs to. Clipping was the old behaviour and it
          hid the status column — the one thing this panel exists to show. */}
      <div className="lptwrap">
        <table className="lptable">
          <thead>
            <tr>
              <th>Reference</th><th>Title</th><th className="num">Budget</th>
              <th className="num lpopt">Bids</th><th>Status</th><th className="lpopt">Closes</th>
            </tr>
          </thead>
          <tbody>
            {LIVE.map(([ref, title, budget, bids, state, closes]) => (
              <tr key={ref}>
                <td className="mono">{ref}</td>
                <td>{title}</td>
                <td className="num mono">{budget}</td>
                <td className="num lpopt">{bids}</td>
                <td><Chip state={state} /></td>
                <td className="wrapnone lpopt">{closes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Tile({ t }) {
  const [ref, seen] = useSeen();
  const v = useCountUp(seen ? t.to : 0, DUR.ceremony, 0);
  return (
    <div className="lptile" ref={ref}>
      <b>{t.fmt(v)}</b>
      <span>{t.label}</span>
      <Spark points={t.points} w={110} h={26} color="var(--lp-pri)" />
    </div>
  );
}

function Section({ id, tint, dark, children, className = "" }) {
  return (
    <section id={id}
             className={"lpsec" + (tint ? " tint" : "") + (dark ? " dark" : "") + (className ? " " + className : "")}>
      <div className="lpwrap">{children}</div>
    </section>
  );
}

/* Every section opens at the same rhythm — label, heading, standfirst — so it
   is one component rather than three elements repeated nine times. Repeating
   them by hand is how the vertical spacing drifts as sections are edited one
   at a time. */
function Head({ label, title, sub }) {
  return (
    <div className="lphead" data-reveal>
      {label && <p className="lpkick">{label}</p>}
      <h2>{title}</h2>
      {sub && <p className="lpsub">{sub}</p>}
    </div>
  );
}

/* ---------------------------------------------------------------- the page */

export function Landing({ cfg, onScreen }) {
  const demo = (cfg && cfg.demoUrl) || "";
  const canDemo = !!demo || !!(cfg && cfg.demoLogin);
  const [ask, setAsk] = useState(0);
  const [menu, setMenu] = useState(false);
  const { stuck, prog, here } = useChrome();
  /* The palette comes from the server with the rest of the config. There is no
     override here — not a prop, not a query parameter, not a stored
     preference. A front page that different visitors see differently is not a
     front page, and the one place it changes is the administration console. */
  const design = designOf(cfg && cfg.landing);

  /* Re-run once the config lands: the first paint happens before the fetch
     returns, and useReveal only observes elements that are not already seen,
     so a second pass costs nothing and catches anything that mounted late. */
  useReveal([design.key]);

  const goDemo = () => { if (demo) window.location.href = demo; else onScreen("demo"); };
  const goSetup = () => {
    if (cfg && cfg.signupUrl) window.location.href = cfg.signupUrl + "/?setup=1";
    else onScreen("setup");
  };
  const jump = (id) => () => {
    setMenu(false);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
  };

  return (
    <div className="lp" data-design={design.key}>
      <a className="lpskip" href="#main">Skip to content</a>

      <div className="lputil">
        <div className="lpwrap lputilin">
          <span>DOCKET is a product of EatnGo Africa</span>
          <span className="lputillinks">
            <button className="lplink" onClick={() => onScreen("register")}>Vendor registration</button>
            <span aria-hidden="true">·</span>
            <span>Nigeria — English</span>
          </span>
        </div>
      </div>

      <header className={"lpbar" + (stuck ? " stuck" : "")}>
        <div className="lpwrap lpbarin">
          <Wordmark s={26} />
          <nav className="lpnav" aria-label="Main">
            {NAV.map(([id, label]) => (
              <a key={id} href={"#" + id} className={here === id ? "on" : ""}
                 aria-current={here === id ? "true" : undefined}>{label}</a>
            ))}
          </nav>
          <span className="lpbaracts">
            <button className="lplink lpdesk" onClick={() => onScreen("signin")}>Sign in</button>
            <button className="btn pri sm" onClick={goSetup}>Contact us</button>
            <button className={"lpburger" + (menu ? " on" : "")} onClick={() => setMenu(!menu)}
                    aria-expanded={menu} aria-label={menu ? "Close menu" : "Open menu"}>
              <i aria-hidden="true" />
            </button>
          </span>
        </div>
        {/* How far through the page you are, drawn on the bar's own bottom edge
            rather than as a separate element floating above it. */}
        <i className="lpprog" style={{ transform: `scaleX(${prog})` }} aria-hidden="true" />
        {menu && (
          <div className="lpsheet">
            <div className="lpwrap">
              {NAV.map(([id, label]) => <button key={id} onClick={jump(id)}>{label}</button>)}
              <button onClick={() => { setMenu(false); onScreen("signin"); }}>Sign in</button>
              <button onClick={() => { setMenu(false); onScreen("register"); }}>Vendor registration</button>
            </div>
          </div>
        )}
      </header>

      <div className="lpevent">
        <div className="lpwrap lpeventin">
          <b>EVENT</b>
          <span>Nigerian Procurement Forum, Lagos — 5–7 October 2026. Two days on sealed tendering, evaluation practice and audit defence.</span>
          <a href="#resources" className="lpmore">Explore the event</a>
        </div>
      </div>

      <main id="main">

        <section className="lphero">
          {/* Two washes and a grid, all of them behind z-index 0 and none of
              them reaching the text: the aurora is mixed out of --lp-pri at
              single digits, so it reads as the paper being warm rather than
              as a coloured shape somebody put there. It is the one place on
              the page where colour is atmosphere rather than meaning, and it
              is allowed exactly here because it is what makes the fold look
              like something rather than like a document template. */}
          <span className="lpglow a" aria-hidden="true" />
          <span className="lpglow b" aria-hidden="true" />
          {/* The seal, hung off the top right corner and cropped by the
              panel and by the edge of the section. It is `ring` rather than
              one of the still lifes for the reason that scene's comment
              gives: the still lifes need their whole frame, and an envelope
              with its middle covered by a product screen reads as three grey
              pipes. A seal cropped anywhere is still a seal. */}
          <Art n="ring" className="lpheroart" />
          <div className="lpwrap lpherogrid">
            <div className="lpherocopy" data-reveal>
              <p className="lpkick">Tender &amp; spend management</p>
              <h1>Turn every tender into a record you can defend.</h1>
              <p className="lplead">
                DOCKET unifies sourcing, vendor qualification, sealed bidding, blind evaluation and
                delegated approval into one auditable process — encrypted end to end, governed by your
                own reporting lines, and hash-chained so every decision stands up to review.
              </p>
              <div className="lpacts">
                <button className="btn pri lpbtn" onClick={goSetup}>Request a demonstration</button>
                {canDemo && <button className="btn lpbtn" onClick={goDemo}>See a live workspace</button>}
              </div>
              <p className="lpticks">
                <span>Encrypted on arrival</span>
                <span>Hash-chained end to end</span>
                <span>No administrator override</span>
              </p>
            </div>
            {/* The drawing sits BEHIND the product panel and is cropped by
                it, which is the arrangement that keeps the hierarchy right:
                the screen is the evidence and the picture is the mood, so the
                picture is the thing that gets covered up. It is hidden below
                `tab`, where there is no room to crop anything. */}
            <div className="lpheropanel" data-reveal style={{ transitionDelay: "120ms" }}>
              <LivePanel />
              {/* Two readings lifted off the panel and floated over its
                  corners. Both are figures the panel itself is showing, said
                  once more in a size that carries across a room. */}
              <div className="lpfloat a">
                <b className="mono">₦1.13bn</b>
                <span>committed and governed</span>
              </div>
              <div className="lpfloat b">
                <b className="mono">0</b>
                <span>integrity breaks, 1,284 events</span>
              </div>
            </div>
          </div>
        </section>

        {/* The sectors strip, moving. A row of static grey words is the most
            skippable thing a front page can put under its fold; a strip that
            travels is read, and it travels slowly enough to be read. It stops
            on hover and stands still entirely for a reader who has asked for
            less motion — see .lpticker. */}
        <div className="lptrust">
          <div className="lpwrap lptrustin">
            <b>Built for organisations that get audited</b>
          </div>
          <div className="lptickwrap">
            <div className="lpticker">
              {[0, 1].map((copy) => (
                <ul key={copy} aria-hidden={copy === 1 ? "true" : undefined}>
                  {SECTORS.map(([icon, label]) => (
                    <li key={label}><Icon n={icon} s={16} />{label}</li>
                  ))}
                </ul>
              ))}
            </div>
          </div>
        </div>

        <Section id="guarantees" tint>
          <Head label="What it guarantees"
                title="Control spend without slowing the business down"
                sub="Six outcomes procurement and finance teams report after moving their tendering onto one governed process." />
          {/* The reveal is on the list, not on its cells. The hairlines between
              cells are the container's background showing through a 1px gap, so
              fading the cells in one at a time shows that background as a grey
              slab for as long as the stagger lasts. One index, arriving once. */}
          <ol className="lpindex" data-reveal>
            {BENEFITS.map(([title, body], n) => (
              <li key={title}>
                <span className="lpnum">{String(n + 1).padStart(2, "0")}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </li>
            ))}
          </ol>
        </Section>

        {/* THE ROUTE, as a rail. Eight stops on one rule — vertical on a
            phone, horizontal from `tab` — because what is being claimed here
            is that the order never changes, and a rule with stops on it is
            the only arrangement that says "in this order" without writing it
            out. The rule itself is drawn on the list, not on the items, so it
            is one continuous line rather than eight butted segments. */}
        <Section id="how">
          <Head label="How it works"
                title="One route, every time, whoever is in a hurry"
                sub="A tender cannot skip a stop. The route is the same for a ₦2m stationery order and a ₦2bn build, and every stop writes an entry nobody can edit afterwards." />
          <ol className="lprail" data-reveal>
            {STEPS.map(([icon, title, body], n) => (
              <li key={title}>
                <span className="lprailmark"><Icon n={icon} s={22} /></span>
                <span className="lpnum">{String(n + 1).padStart(2, "0")}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </li>
            ))}
          </ol>
        </Section>

        <Section tint>
          <div className="lpsplit">
            <div data-reveal>
              <p className="lpkick">Sealed bidding</p>
              <h2>Bids nobody can open early — including you</h2>
              <p>
                Amounts, line prices and attachments are encrypted the moment a vendor submits, with a
                key derived from the published deadline. Sealing is a property of time rather than a
                permission somebody holds, so there is no role that can break an envelope early.
                Opening is a recorded ceremony that names who was present.
              </p>
              <ul className="lplist">
                <li>Encrypted at rest, keyed to the published deadline</li>
                <li>Opening recorded on the chain with named witnesses</li>
                <li>Deadline extensions are forward-only and carry a reason</li>
                <li>Addenda reach every invited vendor at the same moment</li>
              </ul>
              <a className="lpmore" href="#analytics">See what it records</a>
            </div>
            <div className="lppanel" data-reveal style={{ transitionDelay: "100ms" }}>
              <div className="lppanelbar">
                <b className="mono">KST-2026-014</b><span>Bids · 7 received</span><i className="lpwarn">Opens 14 Oct 14:00</i>
              </div>
              <div className="lptwrap">
                <table className="lptable">
                  <thead><tr><th>Supplier</th><th className="lpopt">Received</th><th className="num">Amount</th><th className="num">Docs</th></tr></thead>
                  <tbody>
                    {SEALED.map(([who, when, docs]) => (
                      <tr key={who}>
                        <td>{who}</td>
                        <td className="mono wrapnone lpopt">{when}</td>
                        <td className="num mono lpmask">••••••</td>
                        <td className={"num" + (docs.startsWith("4") ? " lpwarn" : "")}>{docs}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="lppanelnote">Amounts are ciphertext until the deadline. Two more bids not shown.</p>
            </div>
          </div>
        </Section>

        {/* The four claims that have no screenshot — see FEATURES. Each card
            is a drawing over a tinted plate, a heading, a paragraph and one
            line of specification in the mono. The plate is what stops four
            scenes in a row reading as clip art: it gives every picture the
            same ground, the same crop and the same weight. */}
        <Section id="features">
          <Head label="How each guarantee works"
                title="The four things a screenshot cannot show you"
                sub="A hash chain is invisible on screen. A blind panel looks exactly like a panel that is not blind. So these four are drawn — in the product's own vocabulary, with the product's own colours." />
          <div className="lpfeat">
            {FEATURES.map(([art, title, body, spec], n) => (
              <article key={title} data-reveal style={{ transitionDelay: n * 70 + "ms" }}>
                <div className="lpfeatart"><Art n={art} /></div>
                <div className="lpfeattext">
                  <h3>{title}</h3>
                  <p>{body}</p>
                  <p className="lpspec"><span aria-hidden="true" />{spec}</p>
                </div>
              </article>
            ))}
          </div>
        </Section>

        <Section id="analytics" tint>
          <Head label="Analytics"
                title="Where the money went, and who agreed to it"
                sub="These are the product's own charts, running on the demo workspace you can open from this page. Committed value is read off awarded tenders, so the figures move as awards land rather than being typed into a report at quarter end." />

          {/* Same as .lpindex: the row arrives whole, and each tile's counter
              starts on its own when the tile reaches the screen. */}
          <div className="lptiles" data-reveal>
            {TILES.map((t) => <Tile key={t.label} t={t} />)}
          </div>

          <div className="lpcharts">
            <figure className="lpchart" data-reveal>
              <figcaption>
                <b>Committed value by category</b>
                <span>Awarded tenders, this financial year</span>
              </figcaption>
              <Columns data={SPEND} format={fmtCompact} height={210} />
            </figure>
            <figure className="lpchart" data-reveal style={{ transitionDelay: "90ms" }}>
              <figcaption>
                <b>Committed against budget</b>
                <span>One category is over its ceiling and says so</span>
              </figcaption>
              <div className="lpmeters">
                {BUDGETS.map((b) => (
                  <Meter key={b.label} label={b.label} value={b.value} max={b.max} format={fmtCompact} />
                ))}
              </div>
            </figure>
          </div>
        </Section>

        <Section>
          <div className="lpsplit rev">
            <div className="lppanel lpchainpanel" data-reveal>
              <div className="lppanelbar">
                <b>Approval chain</b><span className="mono">₦240,000,000</span><i>2 of 3 signed</i>
              </div>
              <ol className="lpchain">
                {CHAIN.map(([who, role, detail, state]) => (
                  <li key={who} className={state}>
                    <div className="lpchainwho">{who}{role && <span> — {role}</span>}</div>
                    <div className="lpchaindetail">{detail}</div>
                  </li>
                ))}
              </ol>
              <p className="lppanelnote">
                The route was frozen when the request was raised. A reorganisation next quarter cannot
                rewrite who was meant to sign this quarter.
              </p>
            </div>
            <div data-reveal style={{ transitionDelay: "100ms" }}>
              <p className="lpkick">Delegation of authority</p>
              <h2>An approval chain that walks your real organisation</h2>
              <p>
                You set what each level may commit and who reports to whom. A request climbs that line
                until somebody's limit covers the value. Nobody signs their own request, a rejection
                anywhere ends the chain, and every signature is mirrored into the tamper-evident record.
              </p>
              <ul className="lplist">
                <li>Unlimited levels, with limits set per level and per category</li>
                <li>Conflict of interest declared before evaluation opens</li>
                <li>Reminders and escalation when a signature stalls</li>
                <li>The route frozen at the moment the request is raised</li>
              </ul>
              <a className="lpmore" href="#modules">See how approvals are configured</a>
            </div>
          </div>
        </Section>

        <Section id="modules" tint>
          <Head label="What you buy" title="Explore DOCKET modules"
                sub="Licensed together or separately. Every module writes to the same record." />
          <ol className="lprows">
            {MODULES.map(([icon, title, body], n) => (
              <li key={title} data-reveal style={{ transitionDelay: n * 60 + "ms" }}>
                {/* A plate rather than a scene: at 44px a drawing is mud and
                    a glyph is legible, and these four rows want a marker they
                    can be told apart by at a glance, not a picture. */}
                <span className="lpplate"><Icon n={icon} s={22} /></span>
                <span className="lpnum">M{n + 1}</span>
                <div className="lprowtext">
                  <h3>{title}</h3>
                  <p>{body}</p>
                </div>
                <a className="lpmore" href="#next">Learn more</a>
              </li>
            ))}
          </ol>
        </Section>

        <Section>
          <Head label="Who else uses it" title="See how organisations are using DOCKET"
                sub="These three frames are reserved, not decorative. Customer proof is the section enterprise buyers read first and the one part of this page nobody can write for us, so it stays visibly held open until a customer has agreed to what it says." />
          <div className="lpstories">
            {[0, 1, 2].map((n) => (
              <article key={n} className="lpslot" data-reveal style={{ transitionDelay: n * 70 + "ms" }}>
                {/* The hatch stays — it is what says "held open" — but the
                    frame now carries the drawn reserved mark over it, so the
                    slot reads as a composed empty frame rather than as a
                    patch of texture with a word on it. */}
                <div className="lpslotart">
                  <Art n="reserved" />
                  <span className="mono">RESERVED</span>
                </div>
                <h3>Customer story {n + 1}</h3>
                <p>The result in their own words, what they ran before, and the one number that proves the change.</p>
              </article>
            ))}
          </div>
        </Section>

        <Section dark className="lpband">
          {/* The chain, drawn once at scale and set into the band's own
              corner at low contrast. It is a watermark, not an illustration:
              it is the only decorative thing on the page that carries no
              caption, and it earns the place because the band's whole subject
              is the record the chain is made of. */}
          <Art n="chain" className="lpwatermark" />
          <div className="lpproof">
            <div data-reveal>
              <p className="lpkick">Independent assessment</p>
              <blockquote>
                Reserved for an analyst, an auditor or an industry body — the sentence a sceptical
                finance director needs to read before taking the meeting.
              </blockquote>
              <p className="lpattr">Awaiting an outside name. We are not going to write one for them.</p>
            </div>
            <div className="lpfigs" data-reveal style={{ transitionDelay: "100ms" }}>
              <div><b>0</b><span>capabilities that open a sealed bid before its deadline</span></div>
              <div><b>100%</b><span>of events hash-chained to the one before them</span></div>
              <div><b>1,400</b><span>vendors on the register, verified once and reused</span></div>
              <div className="pend"><b>—</b><span>your own metric: tenders run, value governed, days saved</span></div>
            </div>
          </div>
        </Section>

        <Section id="resources" tint>
          <Head label="What to read" title="Featured resources"
                sub="Written here, not licensed from anywhere. Each one is the thing we were asked for often enough to be worth writing down." />
          <div className="lpres">
            {RESOURCES.map(([art, kind, title, body], n) => (
              <article key={title} data-reveal style={{ transitionDelay: n * 60 + "ms" }}>
                <div className="lprescover"><Art n={art} /></div>
                <p className="lpkind">{kind}</p>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </Section>

        <Section id="next">
          <Head label="What to do next" title="Three ways to start" />
          <div className="lpnext">
            <article data-reveal>
              <span className="lpplate"><Icon n="clock" s={22} /></span>
              <h3>Request a demonstration</h3>
              <p>Forty minutes against your own categories and approval structure, not a canned script.</p>
              <button className="btn pri" onClick={goSetup}>Book a session</button>
            </article>
            <article data-reveal style={{ transitionDelay: "70ms" }}>
              <span className="lpplate"><Icon n="seal" s={22} /></span>
              <h3>Start a workspace</h3>
              <p>Set your company up with a code issued to your organisation. Free while you run your first tender.</p>
              <button className="btn" onClick={goSetup}>Create an account</button>
            </article>
            <article data-reveal style={{ transitionDelay: "140ms" }}>
              <span className="lpplate"><Icon n="suppliers" s={22} /></span>
              <h3>Register as a vendor</h3>
              <p>Free, permanent, and reused across every buyer who invites you to tender.</p>
              <button className="btn" onClick={() => onScreen("register")}>Join the register</button>
            </article>
          </div>
        </Section>

        <Section tint>
          <Head label="Objections" title="Frequently asked questions" />
          <div className="lpfaq">
            {FAQ.map(([q, a], n) => (
              <div className={"lpqa" + (ask === n ? " on" : "")} key={q}>
                <button aria-expanded={ask === n} onClick={() => setAsk(ask === n ? -1 : n)}>
                  <span className="lpnum">{String(n + 1).padStart(2, "0")}</span>
                  <span className="lpqat">{q}</span>
                  <i aria-hidden="true" />
                </button>
                <div className="lpqaa"><p>{a}</p></div>
              </div>
            ))}
          </div>
        </Section>

      </main>

      <footer className="lpfoot">
        <div className="lpwrap lpfootin">
          <div className="lpfootbrand">
            <Mark s={30} />
            <p>Sealed tendering and spend management for organisations that get audited. A product of EatnGo Africa, Lagos.</p>
          </div>
          <div><b>Product</b>
            <a href="#modules">Sourcing &amp; tenders</a><a href="#modules">Vendor register</a>
            <a href="#modules">Evaluation</a><a href="#analytics">Audit &amp; reporting</a>
          </div>
          <div><b>Company</b>
            <a href="#next">About EatnGo Africa</a><a href="#guarantees">Security</a>
            <a href="#guarantees">Data protection</a><a href="#next">Contact</a>
          </div>
          <div><b>For vendors</b>
            <button className="lplink" onClick={() => onScreen("register")}>Register free</button>
            <button className="lplink" onClick={() => onScreen("signin")}>Vendor sign-in</button>
            {canDemo && <button className="lplink" onClick={goDemo}>Open the demo</button>}
          </div>
        </div>
        <div className="lpwrap lpfootrule">
          <span>© {new Date().getFullYear()} EatnGo Africa</span>
          <span className="mono">Lagos · Nigeria</span>
        </div>
      </footer>
    </div>
  );
}

export const LANDING_CSS = `
/* ONE SPACING SCALE. Every margin and padding below is one of --s1…--s7 —
   4 · 8 · 16 · 24 · 40 · 64 · 96. Nothing is 13px because 13 looked right
   once; that is what stops the vertical rhythm drifting as sections get
   edited one at a time. Colour is never named here: every value is a --lp-*
   token set in designs.js, and where a value needs to be translucent it is
   mixed out of one of those tokens rather than written as an rgba(). */
.lp{
  --t1:clamp(34px,5.4vw,58px);   /* page heading   */
  --t2:clamp(24px,2.9vw,34px);   /* section heading*/
  --t3:17px;                     /* lead           */
  --t4:15px;                     /* body           */
  --t5:13px;                     /* small          */
  --s1:4px; --s2:8px; --s3:16px; --s4:24px; --s5:40px; --s6:64px; --s7:96px;
  --lp-gutter:20px;
  /* One hairline, one lift. Both are derived from --lp-pri-dark because that
     token is the only one that stays dark in BOTH themes — a shadow mixed out
     of --lp-ink turns into a halo the moment the reader switches to dark. */
  --lp-hair:1px solid var(--lp-line);
  --lp-lift:0 1px 2px color-mix(in srgb,var(--lp-pri-dark) 12%,transparent),
            0 18px 40px -24px color-mix(in srgb,var(--lp-pri-dark) 46%,transparent);
  background:var(--lp-bg);color:var(--lp-ink);min-height:100dvh;overflow-x:clip;
  font-size:var(--t4);line-height:1.6}
.lpwrap{max-width:1240px;margin-inline:auto;padding-inline:var(--lp-gutter);width:100%}
.lp h1,.lp h2,.lp h3{margin:0;letter-spacing:-.02em;text-wrap:balance}
.lp h1{font-size:var(--t1);line-height:1.05;font-weight:700;letter-spacing:-.032em}
.lp h2{font-size:var(--t2);line-height:1.14;font-weight:700;letter-spacing:-.026em}
.lp h3{font-size:17px;line-height:1.3;font-weight:600;letter-spacing:-.012em}
.lp p{margin:0;color:var(--lp-muted);text-wrap:pretty}
.lp .mono{font-family:var(--font-mono);font-size:.94em}
.lp .num{text-align:right;font-variant-numeric:tabular-nums}
.lp .wrapnone{white-space:nowrap}
/* One visible focus treatment for the whole page. Buttons here are a mix of
   .btn, .lplink and bare <button>, and without this each one inherits whatever
   the app stylesheet last said about it. */
.lp :focus-visible{outline:2px solid var(--lp-pri);outline-offset:2px}
/* Every anchor target stops clear of the sticky bar. Without this the heading
   a visitor just clicked arrives underneath the header that took them there. */
.lpsec,.lphero,#main{scroll-margin-top:var(--s6)}
/* Smooth scrolling has to be declared on the scrolling element, not on .lp, so
   it is scoped by asking whether the document currently holds a landing page —
   the signed-in app keeps its instant jumps. */
@media(prefers-reduced-motion:no-preference){
  :root:has(.lp){scroll-behavior:smooth}
}
.lpskip{position:absolute;left:-9999px;top:0}
.lpskip:focus{position:fixed;left:var(--s3);top:var(--s3);z-index:80;background:var(--lp-pri);
  color:var(--lp-on-pri);padding:10px 14px;font-size:var(--t5);font-weight:600;
  text-decoration:none;border-radius:var(--lp-radius)}

/* THE SECOND VOICE. Indices, references and reserved labels are set in the
   mono, which is the page's whole typographic contrast — there is no third
   family and main.jsx explains why there is not. */
.lpnum{font-family:var(--font-mono);font-size:11px;font-weight:500;letter-spacing:.12em;
  color:var(--lp-faint);font-variant-numeric:tabular-nums;display:block}
.lpkick{font-size:11.5px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;
  font-family:var(--font-mono);color:var(--lp-pri);margin-bottom:var(--s3)}
.lplead{font-size:var(--t3);line-height:1.55;max-width:56ch}
.lpsub{font-size:16px;line-height:1.6;max-width:70ch;margin-top:var(--s3)}
.lpwarn{color:var(--lp-warn)}
.lpmask{color:var(--lp-faint);letter-spacing:.14em}
.lplink{background:none;border:0;font:inherit;font-size:var(--t5);color:inherit;
  cursor:pointer;padding:var(--s1) 2px}
.lplink:hover{color:var(--lp-pri)}
/* A link that leads somewhere, with the chevron drawn rather than typed so it
   cannot inherit a font that lacks it. */
.lpmore{display:inline-flex;align-items:center;gap:6px;font-size:var(--t4);font-weight:600;
  color:var(--lp-pri);text-decoration:none;margin-top:var(--s3);white-space:nowrap}
.lpmore::after{content:"";width:6px;height:6px;border-right:1.8px solid currentColor;
  border-top:1.8px solid currentColor;transform:rotate(45deg);transition:translate var(--t) var(--ease)}
.lpmore:hover{color:var(--lp-pri-deep)}
.lpmore:hover::after{translate:3px 0}

/* -------------------------------------------------------- utility + nav */
.lputil{background:var(--lp-paper);border-bottom:var(--lp-hair);font-size:12px;
  color:var(--lp-muted)}
.lputilin{display:flex;align-items:center;justify-content:space-between;gap:var(--s3);
  min-height:34px;flex-wrap:wrap}
/* On a phone this line wraps and puts two rows of small grey type above the
   logo, which is a poor first thing to meet. The ownership is in the footer
   too, so it waits there until there is a line to spare. */
.lputilin > span:first-child{display:none}
.lputillinks{display:flex;align-items:center;gap:var(--s2)}

/* The bar is sticky from the first pixel but only LOOKS attached once the page
   has moved under it: flat while the utility strip is still visible, lifted
   and translucent after that. A header that carries a shadow at rest is a
   header shadowing nothing. */
.lpbar{position:sticky;top:0;z-index:40;background:var(--lp-bg);border-bottom:var(--lp-hair);
  transition:background var(--t) var(--ease),box-shadow var(--t) var(--ease)}
.lpbar.stuck{background:color-mix(in srgb,var(--lp-bg) 86%,transparent);
  -webkit-backdrop-filter:saturate(1.6) blur(12px);backdrop-filter:saturate(1.6) blur(12px);
  box-shadow:0 10px 26px -24px color-mix(in srgb,var(--lp-pri-dark) 70%,transparent)}
.lpbarin{display:flex;align-items:center;gap:var(--s4);min-height:62px}
/* Five items now rather than four, so the gap at tab closes to --s4 and
   only opens back to --s5 once there is a wide page to spend it on. */
.lpnav{display:none;gap:var(--s4)}
.lpnav a{position:relative;font-size:14.5px;font-weight:500;color:var(--lp-ink);
  text-decoration:none;padding-block:2px}
/* The underline is the same element in both states, so moving between sections
   slides rather than blinks. */
.lpnav a::after{content:"";position:absolute;left:0;right:0;bottom:-5px;height:2px;
  background:var(--lp-pri);transform:scaleX(0);transform-origin:left center;
  transition:transform 280ms var(--ease)}
.lpnav a:hover,.lpnav a.on{color:var(--lp-pri)}
.lpnav a:hover::after,.lpnav a.on::after{transform:scaleX(1)}
.lpbaracts{margin-left:auto;display:flex;align-items:center;gap:var(--s3)}
.lpdesk{display:none}
/* How far down the page you are. It lives on the bar's bottom edge, so it
   reads as the bar's own rule filling in rather than as a second element. */
.lpprog{position:absolute;left:0;right:0;bottom:-1px;height:2px;background:var(--lp-pri);
  transform-origin:left center;transform:scaleX(0);will-change:transform}

.lpburger{position:relative;width:38px;height:38px;padding:0;display:grid;place-items:center;
  background:none;border:var(--lp-hair);border-radius:var(--lp-radius);color:inherit;cursor:pointer}
.lpburger i{position:relative;display:block;width:16px;height:1.5px;background:currentColor;
  border-radius:2px;transition:background 140ms var(--ease)}
.lpburger i::before,.lpburger i::after{content:"";position:absolute;left:0;width:16px;height:1.5px;
  background:currentColor;border-radius:2px;transition:transform 240ms var(--ease)}
.lpburger i::before{transform:translateY(-5px)}
.lpburger i::after{transform:translateY(5px)}
.lpburger.on i{background:transparent}
.lpburger.on i::before{transform:rotate(45deg)}
.lpburger.on i::after{transform:rotate(-45deg)}
.lpsheet{position:absolute;left:0;right:0;top:100%;background:var(--lp-bg);
  border-bottom:var(--lp-hair);box-shadow:var(--lp-lift);animation:lp-sheet 200ms var(--ease) both}
.lpsheet .lpwrap{display:grid;padding-block:var(--s2)}
.lpsheet button{text-align:left;background:none;border:0;border-bottom:var(--lp-hair);font:inherit;
  font-size:15.5px;font-weight:500;color:inherit;padding-block:13px;cursor:pointer}
.lpsheet button:last-child{border-bottom:0}
@keyframes lp-sheet{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}

/* the event strip — a band, not a banner */
.lpevent{background:var(--lp-pri-tint);border-bottom:var(--lp-hair)}
.lpeventin{display:flex;align-items:center;gap:var(--s3);padding-block:10px;
  font-size:var(--t5);flex-wrap:wrap}
.lpeventin b{background:var(--lp-pri);color:var(--lp-on-pri);font-size:10.5px;font-weight:700;
  letter-spacing:.08em;padding:3px 8px;border-radius:var(--lp-radius)}
.lpeventin span{color:var(--lp-ink-2);flex:1 1 320px}
.lpeventin .lpmore{margin-top:0;font-size:var(--t5)}

/* ------------------------------------------------------------------ hero
   The only background image on the page: a drafting grid, masked to nothing
   before it reaches the copy. It is squared paper rather than atmosphere —
   the page is about a document, so the ground under it is a document's. */
.lphero{position:relative;isolation:isolate;overflow:clip;padding-block:var(--s5) var(--s6)}
/* THE TWO WASHES. Radial, mixed out of the palette's own primary, and soft
   enough at the edge that there is no visible boundary anywhere — a gradient
   you can find the edge of is a shape, and a shape on the ground behind a
   headline is a distraction. clip on the hero is what keeps them off the
   sections below; without it the lower wash bleeds into the sectors strip and
   turns its hairline into a smudge. */
.lpglow{position:absolute;z-index:-1;pointer-events:none;border-radius:50%;aspect-ratio:1}
.lpglow.a{width:min(74vw,560px);top:-24%;right:-16%;
  background:radial-gradient(circle,color-mix(in srgb,var(--lp-pri) 22%,transparent) 0%,transparent 68%)}
.lpglow.b{width:min(62vw,440px);bottom:-34%;left:-22%;
  background:radial-gradient(circle,color-mix(in srgb,var(--lp-pri-dark) 14%,transparent) 0%,transparent 68%)}
.lphero::before{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;
  background-image:
    linear-gradient(to right,color-mix(in srgb,var(--lp-line) 72%,transparent) 1px,transparent 1px),
    linear-gradient(to bottom,color-mix(in srgb,var(--lp-line) 72%,transparent) 1px,transparent 1px);
  background-size:72px 72px;
  -webkit-mask-image:radial-gradient(130% 92% at 50% 0%,#000 0%,transparent 70%);
  mask-image:radial-gradient(130% 92% at 50% 0%,#000 0%,transparent 70%)}
/* minmax(0,1fr) rather than the default auto: an auto track is floored at its
   content's min-content width, so the product table inside would push this
   grid — and the page with it — wider than the phone holding it. */
.lpherogrid{display:grid;grid-template-columns:minmax(0,1fr);gap:var(--s5)}
.lphero .lpacts{display:flex;flex-wrap:wrap;gap:var(--s2);margin-top:var(--s5)}
.lpbtn{min-width:200px;justify-content:center;padding:var(--s3) var(--s4);font-size:var(--t4)}
.lphero .lplead{margin-top:var(--s4)}
/* Three claims under the buttons, in the mono, so the eye reads them as a
   specification line rather than as more prose. */
.lpticks{display:flex;flex-wrap:wrap;gap:var(--s2) var(--s4);margin-top:var(--s4);
  font-family:var(--font-mono);font-size:11.5px;letter-spacing:.03em;color:var(--lp-muted)}
.lpticks span{display:inline-flex;align-items:center;gap:7px}
.lpticks span::before{content:"";flex:none;width:5px;height:5px;border-radius:50%;
  background:var(--lp-pri)}

/* THE PANEL AND WHAT IS AROUND IT. The drawing is behind the product screen
   and cropped by it, which is the arrangement that keeps the hierarchy the
   right way up: the screen is the evidence, the picture is the mood, so the
   picture is what gets covered. Both the drawing and the floated readings
   wait for tab — on a phone the panel is already the full width of the
   page and there is nothing to float over.

   The drawing is a child of .lphero, not of the panel, and z-index -1 puts it
   under everything in the hero's stacking context. It CAN therefore run under
   the headline, which would be unreadable, so its left edge is kept right of
   where the copy column ends: at min(48%,560px) wide and right:-8% it starts
   at about 60% across, and the copy stops near 46%. */
.lpheropanel{position:relative}
.lpheroart{position:absolute;z-index:-1;display:none;top:-30%;right:-9%;
  width:min(42%,470px);opacity:.5;pointer-events:none}
/* The readings sit CLEAR of the panel rather than over it. Over it they
   covered the panel's own title bar and its last row — the two pieces of
   chrome that say what the screen is and that an award has landed. Clear of
   it, aligned to its corners and overlapping only the hero's whitespace,
   they read as annotations on the screen without hiding any of it. */
.lpfloat{position:absolute;z-index:2;display:none;padding:10px 14px;max-width:196px;
  background:var(--lp-card);border:var(--lp-hair);border-radius:var(--lp-radius);
  box-shadow:var(--lp-lift)}
.lpfloat b{display:block;font-size:21px;font-weight:700;letter-spacing:-.025em;line-height:1;
  color:var(--lp-pri);font-variant-numeric:tabular-nums}
.lpfloat span{display:block;font-size:11px;line-height:1.35;color:var(--lp-muted);margin-top:4px}
/* Two cards drifting at different speeds and out of phase, which is the whole
   reason there are two: one card bobbing on its own reads as a glitch. */
.lpfloat.a{left:-26px;bottom:calc(100% + 14px);animation:lp-bob 7s var(--ease) infinite}
.lpfloat.b{right:-22px;top:calc(100% + 14px);animation:lp-bob 9s var(--ease) -3s infinite}
@keyframes lp-bob{0%,100%{transform:none}50%{transform:translateY(-7px)}}
@media(prefers-reduced-motion:reduce){.lpfloat{animation:none}}

/* THE SECTORS STRIP, MOVING. A row of grey words under the fold is the most
   skippable thing a front page owns; a strip that travels gets read. The list
   is in the markup twice and each copy translates by its own full width, so
   the second arrives exactly where the first left — the seam is invisible
   because the two are identical, including the trailing gap. The duplicate is
   aria-hidden, so a screen reader hears the sectors once. */
.lptrust{background:var(--lp-paper);border-block:var(--lp-hair);padding-block:var(--s3)}
.lptrustin{display:flex;align-items:center;gap:var(--s3) var(--s4);
  font-size:var(--t5);color:var(--lp-muted);flex-wrap:wrap}
.lptrustin b{color:var(--lp-ink);font-weight:600}
.lptickwrap{margin-top:var(--s3);overflow:hidden;
  -webkit-mask-image:linear-gradient(to right,transparent,#000 6%,#000 94%,transparent);
  mask-image:linear-gradient(to right,transparent,#000 6%,#000 94%,transparent)}
.lpticker{display:flex;width:max-content}
.lpticker ul{display:flex;align-items:center;gap:var(--s5);list-style:none;margin:0;
  padding:0 calc(var(--s5) / 2) 0 0;animation:lp-ticker 52s linear infinite}
.lpticker li{display:inline-flex;align-items:center;gap:8px;white-space:nowrap;
  font-size:13.5px;font-weight:500;color:var(--lp-ink-2)}
.lpticker li .ic{flex:none;color:var(--lp-pri)}
/* Stopping on hover is not decoration: it is how somebody reads the one they
   were half way through when it went past. */
.lptickwrap:hover .lpticker ul{animation-play-state:paused}
@keyframes lp-ticker{to{transform:translateX(-100%)}}
@media(prefers-reduced-motion:reduce){
  .lpticker ul{animation:none}
  /* Standing still, the second copy is just the list printed twice. */
  .lpticker ul + ul{display:none}
}

/* -------------------------------------------------------------- sections */
/* Positioned and clipped so a watermark can hang off the edge of one without
   widening the page or bleeding into the next. */
.lpsec{position:relative;overflow:clip;padding-block:var(--s6)}
.lpsec.tint{background:var(--lp-paper);border-block:var(--lp-hair)}
.lpsec.dark{background:var(--lp-pri-dark);color:var(--lp-on-band)}
.lpsec.dark h2,.lpsec.dark b{color:var(--lp-on-band)}
.lpsec.dark p{color:var(--lp-on-band-muted)}
.lpsec.dark .lpkick{color:var(--lp-on-band-accent)}
.lphead{max-width:72ch;margin-bottom:var(--s5)}

/* THE SIX GUARANTEES, AS AN INDEX. Cells sit on a 1px grid background, so
   every rule between them is the same single hairline no matter how the
   columns wrap — borders on the cells themselves double up wherever two meet.
   The accent on hover is drawn inside the cell rather than on its edge, for
   the same reason. */
.lpindex{list-style:none;margin:0;padding:0;display:grid;gap:1px;
  background:var(--lp-line);border:var(--lp-hair)}
.lpindex li{position:relative;background:var(--lp-paper);padding:var(--s4) var(--s4) var(--s5)}
.lpindex li::before{content:"";position:absolute;left:0;top:0;width:100%;height:2px;
  background:var(--lp-pri);transform:scaleX(0);transform-origin:left center;
  transition:transform 420ms var(--ease)}
.lpindex li:hover::before{transform:scaleX(1)}
.lpindex h3{margin:var(--s3) 0 var(--s2)}
.lpindex p{font-size:14.5px;line-height:1.6}

/* a split: copy one side, a panel the other. Same floor as .lpherogrid. */
.lpsplit{display:grid;grid-template-columns:minmax(0,1fr);gap:var(--s5)}
.lpsplit > div > p{margin-top:var(--s4);max-width:58ch}
.lplist{margin:var(--s4) 0 0;padding-left:0;list-style:none;font-size:var(--t4);
  color:var(--lp-muted)}
.lplist li{position:relative;padding:9px 0 9px var(--s4);border-top:var(--lp-hair);line-height:1.5}
.lplist li::before{content:"";position:absolute;left:0;top:17px;width:8px;height:1.5px;
  background:var(--lp-pri)}

/* A PLATE. One 44px square, used for the module rows and the three next
   steps: a tinted ground, a hairline in the primary and an icons.jsx glyph
   inside. At this size a drawing is mud and a glyph is legible, which is the
   whole reason the plate exists rather than a scene. */
.lpplate{width:44px;height:44px;flex:none;display:inline-grid;place-items:center;
  color:var(--lp-pri);background:var(--lp-pri-tint);border-radius:var(--lp-radius);
  border:1px solid color-mix(in srgb,var(--lp-pri) 26%,transparent)}

/* ------------------------------------------------------------- the rail
   Eight stops on one rule. The rule is drawn as a SEGMENT UNDER EACH STOP
   rather than as one line behind the list, because the list rewraps from one
   column to two to four to eight and a single background line cannot follow
   it. The last stop in every row drops its segment — which row that is
   depends on the breakpoint, so the nth-child rules live in the media
   queries and are switched on and off there rather than guessed at here. */
.lprail{list-style:none;margin:0;padding:0;display:grid;gap:var(--s3)}
.lprail li{position:relative;padding:0 0 var(--s4) 60px}
.lprail li:last-child{padding-bottom:0}
.lprail li::before{content:"";position:absolute;left:21px;top:52px;bottom:2px;width:2px;
  background:var(--lp-line)}
.lprail li:last-child::before{display:none}
.lprailmark{position:absolute;left:0;top:0;width:44px;height:44px;display:grid;place-items:center;
  color:var(--lp-pri);background:var(--lp-card);border:var(--lp-hair);border-radius:50%;
  box-shadow:0 0 0 5px var(--lp-bg)}
.lprail .lpnum{margin-bottom:2px}
.lprail p{font-size:13.5px;line-height:1.5;margin-top:3px}

/* ----------------------------------------------------- the drawn features
   Four cards, each a scene over a tinted plate and a paragraph under it. The
   plate is what stops four drawings in a row reading as clip art: same
   ground, same crop, same weight, so they are four panels of one argument
   rather than four pictures somebody found. */
.lpfeat{display:grid;gap:var(--s4)}
.lpfeat article{display:flex;flex-direction:column;overflow:hidden;
  background:var(--lp-card);border:var(--lp-hair);border-radius:var(--lp-radius);
  transition:transform 320ms var(--ease),box-shadow 320ms var(--ease),border-color 320ms var(--ease)}
.lpfeatart{display:grid;place-items:end center;padding:var(--s4) var(--s4) 0;
  border-bottom:var(--lp-hair);
  background:radial-gradient(110% 80% at 50% 0%,color-mix(in srgb,var(--lp-pri) 12%,transparent),
    transparent 72%),var(--lp-paper)}
.lpfeatart .lpart{max-width:270px}
.lpfeattext{flex:1 1 auto;display:flex;flex-direction:column;padding:var(--s4)}
.lpfeat p{font-size:14px;line-height:1.6;margin-top:var(--s2)}
/* The specification line is pinned to the foot of the card, so four cards of
   different paragraph lengths still line their last line up. */
.lpspec{display:flex;align-items:center;gap:9px;margin-top:auto;padding-top:var(--s4);
  font-family:var(--font-mono);font-size:11.5px;letter-spacing:.02em;color:var(--lp-muted)}
.lpspec span{flex:none;width:5px;height:5px;border-radius:50%;background:var(--lp-pri)}
@media(hover:hover){
  .lpfeat article:hover{transform:translateY(-3px);border-color:var(--lp-line-2);
    box-shadow:var(--lp-lift)}
}

/* The watermark on the dark band: one scene at scale, low contrast, no
   caption. It is allowed to be decorative because the band's subject IS the
   chain it draws, and it is hidden on a phone where it would sit under the
   text rather than beside it. */
.lpwatermark{position:absolute;display:none;right:-4%;bottom:-10%;width:min(44%,400px);
  opacity:.16;pointer-events:none}

/* ----------------------------------------------------------- the panels
   Real markup rather than a screenshot, so it stays sharp at any zoom,
   restyles with the palette, and cannot go stale against the product. The
   lift is what separates a product screen from the page it is sitting on;
   without it the panel reads as one more bordered box in a column of them. */
.lppanel{background:var(--lp-card);border:var(--lp-hair);border-radius:var(--lp-radius);
  overflow:hidden;box-shadow:var(--lp-lift)}
.lppanelbar{display:flex;align-items:center;gap:var(--s3);padding:9px 14px;
  background:var(--lp-paper);border-bottom:var(--lp-hair);
  font-size:11.5px;color:var(--lp-muted);flex-wrap:wrap}
.lppanelbar b{color:var(--lp-ink);font-weight:700}
.lppanelbar i{margin-left:auto;font-style:normal}
.lppanelnote{font-size:11.5px;color:var(--lp-muted);padding:10px 14px;
  border-top:var(--lp-hair);line-height:1.5}
/* A table is the one thing on this page with a hard minimum width, so it gets
   its own scroll box. Without it the table pushes the panel wider than the
   phone, and overflow-x:clip on .lp then hides the overflow rather than
   letting anyone reach it. */
.lptwrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
/* .lpopt is a column that appears only where there is room for it, and the
   room is not a straight function of the viewport: these panels sit in a
   split that is ONE column on a phone and on a wide tablet, and TWO from the
   tab breakpoint up. So the widest the panel ever gets is just below tab, and
   the narrowest it gets after a phone is just above it. The three flips in
   the media queries below follow the panel, not the window. */
.lpopt{display:none}
.lptable{width:100%;border-collapse:collapse;font-size:11.5px}
.lptable th{font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:var(--lp-muted);
  font-weight:600;text-align:left;padding:8px 8px;border-bottom:1px solid var(--lp-line-2)}
.lptable th.num{text-align:right}
.lptable td{padding:9px 8px;border-bottom:var(--lp-hair);vertical-align:top}
.lptable tbody tr{transition:background var(--t) var(--ease)}
.lptable tbody tr:hover{background:var(--lp-paper)}
.lptable tr:last-child td{border-bottom:0}
.lpchip{display:inline-flex;align-items:center;gap:5px;font-size:10px;font-weight:600;
  letter-spacing:.04em;padding:2px 7px;border-radius:var(--lp-radius);text-transform:capitalize;
  background:var(--lp-line);color:var(--lp-ink-2)}
.lpchip.sealed{background:var(--lp-pri-tint);color:var(--lp-pri-deep)}
.lpchip.live{background:var(--lp-pri);color:var(--lp-on-pri)}
/* The one thing on the page that moves by itself, and it is the one thing on
   the page that is actually moving: an auction still taking bids. */
.lpchip.live::before{content:"";width:5px;height:5px;border-radius:50%;background:currentColor;
  animation:lp-pulse 1.9s var(--ease) infinite}
.lpchip.awarded{background:transparent;color:var(--lp-ok);box-shadow:inset 0 0 0 1px currentColor}
@keyframes lp-pulse{0%,100%{opacity:1}50%{opacity:.3}}
@media(prefers-reduced-motion:reduce){.lpchip.live::before{animation:none}}

/* the approval chain, drawn as a rule with stops on it */
.lpchain{list-style:none;margin:0;padding:var(--s4) var(--s4) var(--s3)}
.lpchain li{position:relative;padding:0 0 var(--s4) var(--s4);border-left:2px solid var(--lp-pri)}
.lpchain li:last-child{padding-bottom:0;border-left-color:transparent}
.lpchain li::before{content:"";position:absolute;left:-7px;top:3px;width:12px;height:12px;
  border-radius:50%;background:var(--lp-pri)}
.lpchain li.wait{border-left-style:dashed;border-left-color:var(--lp-line-2)}
.lpchain li.wait::before{background:var(--lp-card);box-shadow:inset 0 0 0 2px var(--lp-line-2)}
.lpchainwho{font-weight:600;font-size:14px}
.lpchainwho span{font-weight:400;color:var(--lp-muted)}
.lpchaindetail{font-size:12.5px;color:var(--lp-muted);margin-top:2px}
.lpchain li.wait .lpchaindetail{color:var(--lp-warn)}

/* ------------------------------------------------------------ analytics
   The tiles and both figures are the product's own components. Only the
   frame around them belongs to this page. */
.lptiles{display:grid;gap:1px;background:var(--lp-line);border:var(--lp-hair)}
.lptile{background:var(--lp-paper);padding:var(--s4);display:grid;gap:var(--s1);
  align-content:start}
.lptile b{font-size:clamp(28px,3.4vw,36px);font-weight:700;letter-spacing:-.03em;line-height:1;
  color:var(--lp-ink);font-variant-numeric:tabular-nums}
.lptile span{font-size:12.5px;color:var(--lp-muted);line-height:1.4}
.lptile .spark2{margin-top:var(--s3)}
.lpcharts{display:grid;gap:var(--s4);margin-top:var(--s4)}
.lpchart{margin:0;background:var(--lp-bg);border:var(--lp-hair);
  border-radius:var(--lp-radius);padding:var(--s4)}
.lpchart figcaption{margin-bottom:var(--s4);padding-bottom:var(--s3);border-bottom:var(--lp-hair)}
.lpchart figcaption b{display:block;font-size:15px;font-weight:600;letter-spacing:-.012em}
.lpchart figcaption span{display:block;font-size:12.5px;color:var(--lp-muted);margin-top:2px}
.lpmeters{display:grid;gap:var(--s4)}

/* ---------------------------------------------------------- the modules
   Four rows on a ruled sheet rather than four cards. Cards imply four things
   you choose between; rows imply four parts of one system, which is what they
   are — the copy above says every module writes to the same record. */
.lprows{list-style:none;margin:0;padding:0;border-top:1px solid var(--lp-line-2)}
.lprows li{position:relative;display:grid;gap:var(--s2);padding:var(--s4) 0;
  border-bottom:var(--lp-hair)}
.lprows li::after{content:"";position:absolute;left:0;bottom:-1px;width:100%;height:1px;
  background:var(--lp-pri);transform:scaleX(0);transform-origin:left center;
  transition:transform 420ms var(--ease)}
.lprows li:hover::after{transform:scaleX(1)}
.lprows p{font-size:14px;line-height:1.55;margin-top:var(--s1);max-width:62ch}
/* The row's own gap already separates the link from the copy; the margin
   .lpmore carries by default would add a second one on top of it. */
.lprows .lpmore{margin-top:0}

/* ------------------------------------------------------- reserved frames
   Hatched, ruled and labelled: the drawing-office convention for an area held
   open on purpose. The previous version put "[CUSTOMER LOGO]" in a solid dark
   block, which looked like a page that had shipped before its images did. */
.lpstories{display:grid;gap:var(--s4)}
.lpslot{border:1px dashed var(--lp-line-2);background:var(--lp-bg);padding:var(--s4)}
.lpslotart{position:relative;display:grid;place-items:center;padding:var(--s3) var(--s4) var(--s5);
  margin:calc(var(--s4) * -1) calc(var(--s4) * -1) var(--s4);
  border-bottom:1px dashed var(--lp-line-2);
  background-image:repeating-linear-gradient(45deg,transparent 0 9px,
    color-mix(in srgb,var(--lp-line) 65%,transparent) 9px 10px)}
.lpslotart .lpart{max-width:200px}
.lpslotart span{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);
  background:var(--lp-bg);border:var(--lp-hair);padding:4px 10px;
  font-size:10px;letter-spacing:.18em;color:var(--lp-faint)}
.lpslot h3{color:var(--lp-ink-2)}
.lpslot p{font-size:14px;line-height:1.55;margin-top:var(--s2)}

/* --------------------------------------------------------- the dark band
   The page's one loud moment. The figures are ruled like a statement of
   account, and the rules are mixed out of the band's own text colour so they
   hold in every palette without a token of their own. */
.lpproof{display:grid;gap:var(--s5)}
.lpproof blockquote{margin:0;font-size:clamp(21px,2.4vw,27px);line-height:1.35;font-weight:600;
  letter-spacing:-.022em;color:var(--lp-on-band);text-wrap:balance}
.lpattr{font-size:var(--t5);margin-top:var(--s4)}
.lpfigs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));
  border-top:1px solid color-mix(in srgb,var(--lp-on-band) 26%,transparent)}
.lpfigs > div{padding:var(--s4) var(--s4) var(--s4) 0;
  border-bottom:1px solid color-mix(in srgb,var(--lp-on-band) 16%,transparent)}
.lpfigs b{display:block;font-size:clamp(32px,4vw,42px);font-weight:700;letter-spacing:-.032em;
  line-height:1;font-variant-numeric:tabular-nums}
.lpfigs span{display:block;font-size:13px;line-height:1.5;margin-top:var(--s3);
  color:var(--lp-on-band-muted)}
/* The metric nobody has filled in yet says so with an em dash rather than a
   bracketed instruction to ourselves. */
.lpfigs .pend b{color:var(--lp-on-band-accent)}

/* ------------------------------------------------- resources, next steps */
.lpres,.lpnext{display:grid;gap:var(--s4)}
.lpnext article{background:var(--lp-bg);border:var(--lp-hair);border-radius:var(--lp-radius);
  padding:var(--s4);display:flex;flex-direction:column;
  transition:transform 320ms var(--ease),box-shadow 320ms var(--ease),border-color 320ms var(--ease)}
.lpnext .lpplate{margin-bottom:var(--s3)}
.lpnext p{font-size:14px;line-height:1.55;margin-top:var(--s2);flex-grow:1}
.lpnext .btn{margin-top:var(--s4);align-self:flex-start}
@media(hover:hover){
  .lpnext article:hover{transform:translateY(-3px);border-color:var(--lp-line-2);
    box-shadow:var(--lp-lift)}
}
/* A COVER, not a photograph of a laptop. Each resource gets the drawing of
   the thing it actually is — a book, a matrix, a ledger under a glass — and
   the fourth gets the reserved frame, because the fourth resource is
   reserved. One drawing for "held open" is how a reader learns to read it. */
.lprescover{display:grid;place-items:end center;overflow:hidden;
  padding:var(--s3) var(--s3) 0;margin-bottom:var(--s3);
  background:var(--lp-bg);border:var(--lp-hair);border-radius:var(--lp-radius)}
.lprescover .lpart{max-width:200px;transition:transform 420ms var(--ease)}
.lpres article{border-top:2px solid var(--lp-pri);padding-top:var(--s3)}
.lpres h3{margin:var(--s2) 0 var(--s1)}
.lpres p{font-size:13.5px;line-height:1.55}
@media(hover:hover){
  .lpres article:hover .lpart{transform:translateY(-4px)}
}
.lpkind{font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;
  font-family:var(--font-mono);color:var(--lp-muted)}

/* --------------------------------------------------------------------- Q&A */
.lpfaq{border-top:1px solid var(--lp-line-2);max-width:900px}
.lpqa{border-bottom:1px solid var(--lp-line-2)}
.lpqa > button{width:100%;display:flex;align-items:baseline;gap:var(--s3);text-align:left;
  background:none;border:0;font:inherit;font-size:16.5px;font-weight:600;letter-spacing:-.012em;
  color:inherit;padding-block:var(--s4);cursor:pointer}
.lpqa > button .lpnum{flex:none;transform:translateY(-1px)}
.lpqat{flex:1 1 auto}
.lpqa > button i{align-self:center;flex-shrink:0;width:13px;height:13px;position:relative}
.lpqa > button i::before,.lpqa > button i::after{content:"";position:absolute;inset:50% 0 auto;
  height:2px;border-radius:2px;background:var(--lp-pri);transition:transform 260ms var(--ease)}
.lpqa > button i::after{transform:rotate(90deg)}
.lpqa.on > button i::after{transform:rotate(0)}
.lpqa.on > button .lpnum{color:var(--lp-pri)}
.lpqaa{display:grid;grid-template-rows:0fr;transition:grid-template-rows 280ms var(--ease)}
.lpqa.on .lpqaa{grid-template-rows:1fr}
.lpqaa > p{overflow:hidden;font-size:var(--t4);max-width:76ch;line-height:1.6}
.lpqa.on .lpqaa > p{padding-bottom:var(--s4)}

/* ------------------------------------------------------------------ footer */
.lpfoot{background:var(--lp-pri-dark);color:var(--lp-on-band);padding-block:var(--s5)}
.lpfootin{display:grid;gap:var(--s4)}
.lpfootbrand p{font-size:13.5px;color:var(--lp-on-band-muted);line-height:1.6;margin-top:var(--s3);
  max-width:34ch}
.lpfootin > div > b{display:block;font-size:14px;font-weight:600;margin-bottom:var(--s2)}
.lpfootin > div > a,.lpfootin > div > .lplink{display:block;font-size:13.5px;
  color:var(--lp-on-band-muted);text-decoration:none;padding-block:4px;text-align:left}
.lpfootin > div > a:hover,.lpfootin > div > .lplink:hover{color:var(--lp-on-band)}
.lpfootrule{display:flex;align-items:center;justify-content:space-between;gap:var(--s3);
  flex-wrap:wrap;margin-top:var(--s5);padding-top:var(--s4);font-size:12px;
  color:var(--lp-on-band-muted);
  border-top:1px solid color-mix(in srgb,var(--lp-on-band) 18%,transparent)}

/* --------------------------------------------------------------- the demo
   A strip, not a banner. 26px, sticky, says the same thing. */
.demobar{position:sticky;top:0;z-index:60;display:flex;gap:var(--s2);
  align-items:center;justify-content:center;height:26px;padding-inline:var(--s3);
  font-size:11.5px;letter-spacing:.01em;background:var(--brass-tint);
  color:var(--gold-ink);border-bottom:1px solid var(--brass);
  white-space:nowrap;overflow:hidden}
.demobar .doclink{color:inherit;text-decoration:underline;font-size:inherit;opacity:.85}
.demobar .doclink:hover{opacity:1}
.isdemo .side,.isdemo .topbar{top:26px}

@media(min-width:${BP.sm}px){
  .lputilin > span:first-child{display:block}
  .lpopt{display:table-cell}
  .lptable th{padding:8px 14px}
  .lptable td{padding:9px 14px}
  .lpindex{grid-template-columns:repeat(2,minmax(0,1fr))}
  .lptiles{grid-template-columns:repeat(2,minmax(0,1fr))}
  .lpres{grid-template-columns:repeat(2,minmax(0,1fr))}
  .lpfeat{grid-template-columns:repeat(2,minmax(0,1fr))}
  .lpstories,.lpnext{grid-template-columns:repeat(3,minmax(0,1fr))}
  /* The rail turns the corner: the mark goes above the words and its
     connector goes across to the next stop instead of down to it. The stop
     at the end of a row has nothing to reach, so it loses its segment —
     which stop that is changes with the column count, hence the nth-child
     rule here and its two revisions below. */
  .lprail{grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--s5) var(--s4)}
  .lprail li,.lprail li:last-child{padding:0}
  .lprail li::before{left:52px;right:calc(var(--s4) * -1);top:21px;bottom:auto;
    width:auto;height:2px;display:block}
  .lprail li:nth-child(2n)::before,.lprail li:last-child::before{display:none}
  .lprailmark{position:static;margin-bottom:var(--s3);box-shadow:none}
}
@media(min-width:${BP.tab}px){
  .lpnav{display:flex}
  .lpburger{display:none}
  .lpdesk{display:inline-flex}
  .lpindex{grid-template-columns:repeat(3,minmax(0,1fr))}
  .lptiles{grid-template-columns:repeat(4,minmax(0,1fr))}
  .lpres{grid-template-columns:repeat(4,minmax(0,1fr))}
  .lpcharts{grid-template-columns:repeat(2,minmax(0,1fr))}
  /* The copy column is the narrower one: a headline this size needs a measure,
     and the product panel is the thing that wants the extra width. */
  .lpherogrid{grid-template-columns:minmax(0,.92fr) minmax(0,1.08fr);align-items:center;
    gap:var(--s6)}
  /* The split just opened, so the panels are at their narrowest since the
     phone. The two least useful columns stand down again until wide. */
  .lpopt{display:none}
  /* Four columns on a wide screen — index, name, what it does, where to go.
     .lprowtext stops being a box and lets its two children become columns of
     the row itself, which is what turns this from four headings with a link
     stranded a thousand pixels away into a specification table. */
  .lprows li{grid-template-columns:44px 52px 230px minmax(0,1fr) auto;padding:var(--s4) var(--s2);
    align-items:center;gap:var(--s3)}
  .lprowtext{display:contents}
  .lprows p{margin-top:0;max-width:none}
  .lprows .lpnum{padding-top:3px}
  .lpsplit{grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--s6);align-items:center}
  .lpsplit.rev > div:first-child{order:-1}
  .lpproof{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:var(--s6);align-items:center}
  .lpfootin{grid-template-columns:1.6fr 1fr 1fr 1fr;gap:var(--s5)}
  .lphero{padding-block:var(--s6) var(--s7)}
  .lpsec{padding-block:var(--s7)}
  /* Four stops a row, so the segment now drops on every fourth. */
  .lprail{grid-template-columns:repeat(4,minmax(0,1fr))}
  .lprail li:nth-child(2n)::before{display:block}
  .lprail li:nth-child(4n)::before,.lprail li:last-child::before{display:none}
  /* There is finally something to float over and something to crop. */
  .lpheroart{display:block;width:58%;top:-18%;right:-9%;opacity:.5}
  .lpfloat{display:block}
  .lpwatermark{display:block}
}
@media(min-width:${BP.wide}px){
  /* Half of a 1240px page is finally wider than the whole table. */
  .lpopt{display:table-cell}
  /* The full route on one line, which is the only arrangement in which the
     rail says what it is for at a glance. */
  .lprail{grid-template-columns:repeat(8,minmax(0,1fr));gap:var(--s4) var(--s3)}
  .lprail li::before{right:calc(var(--s3) * -1)}
  .lprail li:nth-child(4n)::before{display:block}
  .lprail li:nth-child(8n)::before,.lprail li:last-child::before{display:none}
  .lprail h3{font-size:15.5px}
  .lprail p{font-size:12.5px}
  .lpfeat{grid-template-columns:repeat(4,minmax(0,1fr))}
  .lpnav{gap:var(--s5)}
}
`;
