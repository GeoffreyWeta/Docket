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

   FOUR RULES.

     THE PRODUCT IS THE IMAGERY. No stock photography, no plates, no abstract
     art. Every panel on this page is a real screen or a real chart, drawn with
     the same components the signed-in app uses — Columns, Meter and Spark come
     straight out of charts.jsx. A marketing page that invents its own visual
     language is a page that will not survive contact with the product.

     THE FIGURES ARE THE PRODUCT'S OWN. The charts run on the demo workspace's
     numbers, the ones a visitor will meet ten seconds later if they click
     through. Nothing here is a number invented to look good.

     PLACEHOLDERS STAY VISIBLE. Customer logos, the outside quote and one
     metric are in square brackets, because roughly half of what sells
     enterprise software is proof and this page has none yet. Inventing a
     customer would be the front page lying on behalf of a product whose whole
     claim is that it does not.

     COLOUR COMES FROM designs.js. Nothing here names a colour; every value is
     a --lp-* token, so the palette can change from the administration console
     without touching this file.

   Mobile first: every rule outside a media query describes a 360px screen. */
import React, { useState } from "react";

import { BP } from "./breakpoints";
import { Columns, Meter, Spark } from "./charts";
import { fmtCompact } from "./helpers";
import { Mark, Wordmark } from "./logo";
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

const TILES = [
  { n: "18", label: "tenders run this year", points: [4, 6, 5, 9, 7, 11, 10, 14] },
  { n: "₦1.13bn", label: "committed value governed", points: [3, 5, 6, 6, 9, 12, 13, 17] },
  { n: "1,284", label: "events on the chain", points: [2, 4, 7, 9, 12, 14, 18, 22] },
  { n: "0", label: "integrity breaks found", points: [0, 0, 0, 0, 0, 0, 0, 0] },
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

const BENEFITS = [
  ["control", "Increase control",
   "Every tender runs the same route — scope, criteria, approval, publication, sealing, opening, scoring, award. Nothing skips a step because somebody was in a hurry."],
  ["value", "Turn savings into value",
   "Bids are compared against budget, against what you last paid, and against a computed baseline, so a saving is measured against the real cost of the item rather than against the highest quote that arrived."],
  ["risk", "Reduce dispute risk",
   "Bids are encrypted on arrival and sealing is time-based, not permission-based. No role in the system opens an envelope early, and an administrator holds every role there is."],
  ["sight", "Improve visibility",
   "One register of live events, committed value, approvals in flight and vendor paperwork about to lapse — readable by finance without asking procurement for a spreadsheet."],
  ["vendor", "Bring vendors on board",
   "Vendors register once — bank details, TIN, CAC documents, categories — and carry that record into every tender they are invited to. Import an existing list and duplicates are reported, never merged silently."],
  ["auto", "Automate oversight",
   "Approval limits, conflict-of-interest declarations and document checks run as rules in real time. A request above a limit climbs until somebody's authority covers it."],
];

const MODULES = [
  ["Sourcing & tenders", "Open, restricted and framework tenders, plus live reverse auctions with rank-visible bidding."],
  ["Vendor register", "Self-service registration, document expiry tracking, prequalification and category management."],
  ["Evaluation & scoring", "Weighted criteria, blind panel scoring, consensus reconciliation and recommendation memos."],
  ["Audit & reporting", "Hash-chained event log, integrity verification, compliance exports and a read-only auditor role."],
];

const RESOURCES = [
  ["Guide", "Running your first sealed tender", "Scope to award in fourteen steps, with the documents you need at each one."],
  ["Template", "A delegation-of-authority matrix that works", "Limits by level and category, with the questions to settle before you set them."],
  ["Briefing", "What an auditor actually asks for", "The eleven artefacts a procurement audit requests, and where each one lives."],
  ["Report", "Procurement practice in Nigerian mid-market firms", "[Commission or cite a real study — do not publish invented research.]"],
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

/* --------------------------------------------------------------- pieces */

function Chip({ state }) {
  return <span className={"lpchip " + state}>{state}</span>;
}

/* The compact product panel that stands in for a screenshot. It is real
   markup rather than an image so it stays sharp, restyles with the palette,
   and can never go out of date against the product. */
function LivePanel() {
  return (
    <div className="lppanel">
      <div className="lppanelbar">
        <b>DOCKET</b><span>Kestrel Hospitality Group · Tenders</span><i>15:42</i>
      </div>
      <table className="lptable">
        <thead>
          <tr><th>Reference</th><th>Title</th><th className="num">Budget</th><th className="num">Bids</th><th>Status</th><th>Closes</th></tr>
        </thead>
        <tbody>
          {LIVE.map(([ref, title, budget, bids, state, closes]) => (
            <tr key={ref}>
              <td className="mono">{ref}</td>
              <td>{title}</td>
              <td className="num mono">{budget}</td>
              <td className="num">{bids}</td>
              <td><Chip state={state} /></td>
              <td className="wrapnone">{closes}</td>
            </tr>
          ))}
        </tbody>
      </table>
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

function Icon6({ n }) {
  const p = {
    control: <><rect x="3" y="4" width="18" height="16" rx="1.5" /><path d="M7 9h10M7 13h6" /></>,
    value: <><circle cx="12" cy="12" r="9" /><path d="M12 7v10M9.5 9.5h5M9.5 14.5h5" /></>,
    risk: <><path d="M12 3l8 4v6c0 4.4-3.3 7.4-8 8-4.7-.6-8-3.6-8-8V7z" /><path d="M9 12l2 2 4-4" /></>,
    sight: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" /><circle cx="12" cy="12" r="2.6" /></>,
    vendor: <><circle cx="9" cy="8" r="3.2" /><circle cx="17" cy="9" r="2.4" /><path d="M3 19c0-3.3 2.7-5.6 6-5.6s6 2.3 6 5.6M15 19c0-2.1 1.3-3.8 3-3.8s3 1.7 3 3.8" /></>,
    auto: <><rect x="4" y="4" width="16" height="16" rx="1.5" /><path d="M8 12l2.5 2.5L16 9" /></>,
  }[n];
  return <svg className="lpico" viewBox="0 0 24 24" width="26" height="26" fill="none"
               stroke="currentColor" strokeWidth="1.6" aria-hidden="true">{p}</svg>;
}

/* ---------------------------------------------------------------- the page */

export function Landing({ cfg, onScreen }) {
  const demo = (cfg && cfg.demoUrl) || "";
  const canDemo = !!demo || !!(cfg && cfg.demoLogin);
  const [ask, setAsk] = useState(0);
  /* The palette comes from the server with the rest of the config. There is no
     override here — not a prop, not a query parameter, not a stored
     preference. A front page that different visitors see differently is not a
     front page, and the one place it changes is the administration console. */
  const design = designOf(cfg && cfg.landing);

  const goDemo = () => { if (demo) window.location.href = demo; else onScreen("demo"); };
  const goSetup = () => {
    if (cfg && cfg.signupUrl) window.location.href = cfg.signupUrl + "/?setup=1";
    else onScreen("setup");
  };

  return (
    <div className="lp" data-design={design.key}>

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

      <header className="lpbar">
        <div className="lpwrap lpbarin">
          <Wordmark s={26} />
          <nav className="lpnav" aria-label="Main">
            <a href="#guarantees">Product</a>
            <a href="#analytics">Analytics</a>
            <a href="#modules">Modules</a>
            <a href="#resources">Resources</a>
          </nav>
          <span className="lpbaracts">
            <button className="lplink" onClick={() => onScreen("signin")}>Sign in</button>
            <button className="btn pri sm" onClick={goSetup}>Contact us</button>
          </span>
        </div>
      </header>

      <div className="lpevent">
        <div className="lpwrap lpeventin">
          <b>EVENT</b>
          <span>Nigerian Procurement Forum, Lagos — 5–7 October 2026. Two days on sealed tendering, evaluation practice and audit defence.</span>
          <a href="#resources" className="lpmore">Explore the event</a>
        </div>
      </div>

      <section className="lphero">
        <div className="lpwrap lpherogrid">
          <div className="lpherocopy">
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
          </div>
          <div className="lpheropanel"><LivePanel /></div>
        </div>
      </section>

      <div className="lptrust">
        <div className="lpwrap lptrustin">
          <b>Built for organisations that get audited</b>
          <span>Hospitality groups</span><span>Manufacturers</span><span>Hospitals</span>
          <span>Schools &amp; universities</span><span>State agencies</span>
        </div>
      </div>

      <Section id="guarantees" tint>
        <h2>Control spend without slowing the business down</h2>
        <p className="lpsub">Six outcomes procurement and finance teams report after moving their tendering onto one governed process.</p>
        <div className="lpsix">
          {BENEFITS.map(([icon, title, body]) => (
            <article key={title}>
              <Icon6 n={icon} />
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </Section>

      <Section>
        <div className="lpsplit">
          <div>
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
          <div className="lppanel">
            <div className="lppanelbar">
              <b className="mono">KST-2026-014</b><span>Bids · 7 received</span><i className="lpwarn">Opens 14 Oct 14:00</i>
            </div>
            <table className="lptable">
              <thead><tr><th>Supplier</th><th>Received</th><th className="num">Amount</th><th className="num">Docs</th></tr></thead>
              <tbody>
                {SEALED.map(([who, when, docs]) => (
                  <tr key={who}>
                    <td>{who}</td>
                    <td className="mono wrapnone">{when}</td>
                    <td className="num mono lpmask">••••••</td>
                    <td className={"num" + (docs.startsWith("4") ? " lpwarn" : "")}>{docs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="lppanelnote">Amounts are ciphertext until the deadline. Two more bids not shown.</p>
          </div>
        </div>
      </Section>

      <Section id="analytics" tint>
        <p className="lpkick">Analytics</p>
        <h2>Where the money went, and who agreed to it</h2>
        <p className="lpsub">
          These are the product's own charts, running on the demo workspace you can open from this
          page. Committed value is read off awarded tenders, so the figures move as awards land
          rather than being typed into a report at quarter end.
        </p>

        <div className="lptiles">
          {TILES.map((t) => (
            <div className="lptile" key={t.label}>
              <b>{t.n}</b>
              <span>{t.label}</span>
              <Spark points={t.points} w={104} h={24} color="var(--lp-pri)" />
            </div>
          ))}
        </div>

        <div className="lpcharts">
          <figure className="lpchart">
            <figcaption>
              <b>Committed value by category</b>
              <span>Awarded tenders, this financial year</span>
            </figcaption>
            <Columns data={SPEND} format={fmtCompact} height={210} />
          </figure>
          <figure className="lpchart">
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
          <div className="lppanel lpchainpanel">
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
          <div>
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
        <h2>Explore DOCKET modules</h2>
        <p className="lpsub">Licensed together or separately. Every module writes to the same record.</p>
        <div className="lpmods">
          {MODULES.map(([title, body]) => (
            <article key={title}>
              <h3>{title}</h3>
              <p>{body}</p>
              <a className="lpmore" href="#next">Learn more</a>
            </article>
          ))}
        </div>
      </Section>

      <Section>
        <h2>See how organisations are using DOCKET</h2>
        <p className="lpsub">
          Replace these with real customers before launch — this is the section enterprise buyers
          read first, and it is the one part of the page nobody can write for you.
        </p>
        <div className="lpstories">
          {[0, 1, 2].map((n) => (
            <article key={n}>
              <div className="lplogo">[CUSTOMER LOGO]</div>
              <h3>[Headline — the result, in their words]</h3>
              <p>[Two sentences: what they ran before, what changed, and the number that proves it.]</p>
              <a className="lpmore" href="#next">Read the story</a>
            </article>
          ))}
        </div>
      </Section>

      <Section dark>
        <div className="lpproof">
          <div>
            <p className="lpkick">Independent assessment</p>
            <blockquote>
              [Pull quote from an analyst, auditor or industry body — the sentence a sceptical
              finance director needs to read before taking the meeting.]
            </blockquote>
            <p className="lpattr">[Name, title, organisation]</p>
          </div>
          <div className="lpfigs">
            <div><b>0</b><span>capabilities that open a sealed bid before its deadline</span></div>
            <div><b>100%</b><span>of events hash-chained to the one before them</span></div>
            <div><b>1,400</b><span>vendors on the register, verified once and reused</span></div>
            <div><b>[N]</b><span>[your own metric — tenders run, value governed, days saved]</span></div>
          </div>
        </div>
      </Section>

      <Section id="resources" tint>
        <h2>Featured resources</h2>
        <div className="lpres">
          {RESOURCES.map(([kind, title, body]) => (
            <article key={title}>
              <p className="lpkind">{kind}</p>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </Section>

      <Section id="next">
        <h2>Next steps</h2>
        <div className="lpnext">
          <article>
            <h3>Request a demonstration</h3>
            <p>Forty minutes against your own categories and approval structure, not a canned script.</p>
            <button className="btn pri" onClick={goSetup}>Book a session</button>
          </article>
          <article>
            <h3>Start a workspace</h3>
            <p>Set your company up with a code issued to your organisation. Free while you run your first tender.</p>
            <button className="btn" onClick={goSetup}>Create an account</button>
          </article>
          <article>
            <h3>Register as a vendor</h3>
            <p>Free, permanent, and reused across every buyer who invites you to tender.</p>
            <button className="btn" onClick={() => onScreen("register")}>Join the register</button>
          </article>
        </div>
      </Section>

      <Section tint>
        <h2>Frequently asked questions</h2>
        <div className="lpfaq">
          {FAQ.map(([q, a], n) => (
            <div className={"qa" + (ask === n ? " on" : "")} key={q}>
              <button aria-expanded={ask === n} onClick={() => setAsk(ask === n ? -1 : n)}>
                {q}<i aria-hidden="true" />
              </button>
              <div className="qaa"><p>{a}</p></div>
            </div>
          ))}
        </div>
      </Section>

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
      </footer>
    </div>
  );
}

export const LANDING_CSS = `
/* ONE SPACING SCALE. Every margin and padding below is one of --s1…--s7 —
   4 · 8 · 16 · 24 · 40 · 64 · 96. Nothing is 13px because 13 looked right
   once; that is what stops the vertical rhythm drifting as sections get
   edited one at a time. Colour is never named here: every value is a --lp-*
   token set in designs.js. */
.lp{
  --t1:clamp(30px,4.6vw,46px);   /* page heading   */
  --t2:clamp(23px,2.7vw,30px);   /* section heading*/
  --t3:17px;                     /* lead           */
  --t4:15px;                     /* body           */
  --t5:13px;                     /* small          */
  --s1:4px; --s2:8px; --s3:16px; --s4:24px; --s5:40px; --s6:64px; --s7:96px;
  --lp-gutter:20px;
  background:var(--lp-bg);color:var(--lp-ink);min-height:100dvh;overflow-x:clip;
  font-size:var(--t4);line-height:1.6}
.lpwrap{max-width:1240px;margin-inline:auto;padding-inline:var(--lp-gutter);width:100%}
.lp h1,.lp h2,.lp h3{margin:0;letter-spacing:-.02em;text-wrap:balance}
.lp h1{font-size:var(--t1);line-height:1.1;font-weight:700}
.lp h2{font-size:var(--t2);line-height:1.18;font-weight:700}
.lp h3{font-size:17px;line-height:1.3;font-weight:600;letter-spacing:-.012em}
.lp p{margin:0;color:var(--lp-muted);text-wrap:pretty}
.lp .mono{font-family:var(--font-mono);font-size:.94em}
.lp .num{text-align:right;font-variant-numeric:tabular-nums}
.lp .wrapnone{white-space:nowrap}
.lpkick{font-size:var(--t5);font-weight:700;letter-spacing:.09em;text-transform:uppercase;
  color:var(--lp-pri);margin-bottom:var(--s2)}
.lplead{font-size:var(--t3);line-height:1.55;max-width:56ch}
.lpsub{font-size:16px;line-height:1.6;max-width:74ch;margin-top:var(--s2)}
.lpwarn{color:var(--lp-warn)}
.lpmask{color:var(--lp-faint);letter-spacing:.14em}
.lplink{background:none;border:0;font:inherit;font-size:var(--t5);color:inherit;
  cursor:pointer;padding:var(--s1) 2px}
.lplink:hover{color:var(--lp-pri)}
/* A link that leads somewhere, with the chevron drawn rather than typed so it
   cannot inherit a font that lacks it. */
.lpmore{display:inline-flex;align-items:center;gap:6px;font-size:var(--t4);font-weight:600;
  color:var(--lp-pri);text-decoration:none;margin-top:var(--s3)}
.lpmore::after{content:"";width:6px;height:6px;border-right:1.8px solid currentColor;
  border-top:1.8px solid currentColor;transform:rotate(45deg);transition:translate var(--t) var(--ease)}
.lpmore:hover{color:var(--lp-pri-deep)}
.lpmore:hover::after{translate:3px 0}

/* -------------------------------------------------------- utility + nav */
.lputil{background:var(--lp-paper);border-bottom:1px solid var(--lp-line);font-size:12px;
  color:var(--lp-muted)}
.lputilin{display:flex;align-items:center;justify-content:space-between;gap:var(--s3);
  min-height:34px;flex-wrap:wrap}
.lputillinks{display:flex;align-items:center;gap:var(--s2)}
.lpbar{position:sticky;top:0;z-index:40;background:var(--lp-bg);
  border-bottom:1px solid var(--lp-line)}
.lpbarin{display:flex;align-items:center;gap:var(--s4);min-height:64px;flex-wrap:wrap}
.lpnav{display:none;gap:var(--s4)}
.lpnav a{font-size:14.5px;font-weight:500;color:var(--lp-ink);text-decoration:none}
.lpnav a:hover{color:var(--lp-pri)}
.lpbaracts{margin-left:auto;display:flex;align-items:center;gap:var(--s3)}

/* the event strip — a band, not a banner */
.lpevent{background:var(--lp-pri-tint);border-bottom:1px solid var(--lp-line)}
.lpeventin{display:flex;align-items:center;gap:var(--s3);padding-block:10px;
  font-size:var(--t5);flex-wrap:wrap}
.lpeventin b{background:var(--lp-pri);color:var(--lp-on-pri);font-size:10.5px;font-weight:700;
  letter-spacing:.08em;padding:3px 8px;border-radius:var(--lp-radius)}
.lpeventin span{color:var(--lp-ink-2);flex:1 1 320px}
.lpeventin .lpmore{margin-top:0;font-size:var(--t5)}

/* ------------------------------------------------------------------ hero */
.lphero{padding-block:var(--s5)}
.lpherogrid{display:grid;gap:var(--s5)}
.lphero .lpacts{display:flex;flex-wrap:wrap;gap:var(--s2);margin-top:var(--s4)}
.lpbtn{min-width:200px;justify-content:center;padding:var(--s3) var(--s4);font-size:var(--t4)}
.lphero .lplead{margin-top:var(--s3)}

/* the trust strip */
.lptrust{background:var(--lp-paper);border-block:1px solid var(--lp-line)}
.lptrustin{display:flex;align-items:center;gap:var(--s3) var(--s4);padding-block:var(--s3);
  font-size:var(--t5);color:var(--lp-muted);flex-wrap:wrap}
.lptrustin b{color:var(--lp-ink);font-weight:600}

/* -------------------------------------------------------------- sections */
.lpsec{padding-block:var(--s6)}
.lpsec.tint{background:var(--lp-paper);border-block:1px solid var(--lp-line)}
.lpsec.dark{background:var(--lp-pri-dark);color:var(--lp-on-band)}
.lpsec.dark h2,.lpsec.dark b{color:var(--lp-on-band)}
.lpsec.dark p{color:var(--lp-on-band-muted)}
.lpsec.dark .lpkick{color:var(--lp-on-band-accent)}
.lpsec > .lpwrap > h2 + .lpsub{margin-bottom:var(--s5)}
.lpsec > .lpwrap > h2:only-child,
.lpsec > .lpwrap > h2:last-of-type{margin-bottom:var(--s5)}

/* six benefits */
.lpsix{display:grid;gap:var(--s5) var(--s4);margin-top:var(--s5)}
.lpsix h3{margin:var(--s3) 0 var(--s2)}
.lpsix p{font-size:14.5px;line-height:1.55}
.lpico{color:var(--lp-pri);display:block}

/* a split: copy one side, a panel the other */
.lpsplit{display:grid;gap:var(--s5)}
.lpsplit > div > p{margin-top:var(--s3);max-width:58ch}
.lplist{margin:var(--s3) 0 0;padding-left:18px;font-size:var(--t4);color:var(--lp-muted);
  line-height:1.85}

/* ----------------------------------------------------------- the panels
   Real markup rather than a screenshot, so it stays sharp at any zoom,
   restyles with the palette, and cannot go stale against the product. */
.lppanel{background:var(--lp-card);border:1px solid var(--lp-line);border-radius:var(--lp-radius);
  overflow:hidden}
.lppanelbar{display:flex;align-items:center;gap:var(--s3);padding:9px 14px;
  background:var(--lp-paper);border-bottom:1px solid var(--lp-line);
  font-size:11.5px;color:var(--lp-muted);flex-wrap:wrap}
.lppanelbar b{color:var(--lp-ink);font-weight:700}
.lppanelbar i{margin-left:auto;font-style:normal}
.lppanelnote{font-size:11.5px;color:var(--lp-muted);padding:10px 14px;
  border-top:1px solid var(--lp-line);line-height:1.5}
.lptable{width:100%;border-collapse:collapse;font-size:11.5px}
.lptable th{font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:var(--lp-muted);
  font-weight:600;text-align:left;padding:8px 14px;border-bottom:1px solid var(--lp-line-2)}
.lptable th.num{text-align:right}
.lptable td{padding:8px 14px;border-bottom:1px solid var(--lp-line);vertical-align:top}
.lptable tr:last-child td{border-bottom:0}
.lpchip{display:inline-block;font-size:10px;font-weight:600;letter-spacing:.04em;
  padding:2px 7px;border-radius:var(--lp-radius);text-transform:capitalize;
  background:var(--lp-line);color:var(--lp-ink-2)}
.lpchip.sealed{background:var(--lp-pri-tint);color:var(--lp-pri-deep)}
.lpchip.live{background:var(--lp-pri);color:var(--lp-on-pri)}
.lpchip.awarded{background:transparent;color:var(--lp-ok);box-shadow:inset 0 0 0 1px currentColor}

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
.lptiles{display:grid;gap:1px;background:var(--lp-line);border:1px solid var(--lp-line);
  margin-top:var(--s5)}
.lptile{background:var(--lp-bg);padding:var(--s4) var(--s3);display:grid;gap:var(--s1);
  align-content:start}
.lptile b{font-size:30px;font-weight:700;letter-spacing:-.025em;line-height:1;
  color:var(--lp-ink);font-variant-numeric:tabular-nums}
.lptile span{font-size:12.5px;color:var(--lp-muted);line-height:1.4}
.lptile .spark2{margin-top:var(--s2)}
.lpcharts{display:grid;gap:var(--s4);margin-top:var(--s4)}
.lpchart{margin:0;background:var(--lp-bg);border:1px solid var(--lp-line);
  border-radius:var(--lp-radius);padding:var(--s4)}
.lpchart figcaption{margin-bottom:var(--s4)}
.lpchart figcaption b{display:block;font-size:15px;font-weight:600;letter-spacing:-.012em}
.lpchart figcaption span{display:block;font-size:12.5px;color:var(--lp-muted);margin-top:2px}
.lpmeters{display:grid;gap:var(--s4)}

/* ------------------------------------------------- modules, stories, more */
.lpmods,.lpres,.lpnext{display:grid;gap:var(--s4);margin-top:var(--s5)}
.lpmods article,.lpnext article{background:var(--lp-bg);border:1px solid var(--lp-line);
  border-radius:var(--lp-radius);padding:var(--s4);display:flex;flex-direction:column}
.lpmods p,.lpnext p{font-size:14px;line-height:1.55;margin-top:var(--s2);flex-grow:1}
.lpnext .btn{margin-top:var(--s4);align-self:flex-start}
.lpres article{border-top:3px solid var(--lp-pri);padding-top:var(--s3)}
.lpres h3{margin:var(--s2) 0 var(--s1)}
.lpres p{font-size:13.5px;line-height:1.55}
.lpkind{font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;
  color:var(--lp-muted)}
.lpstories{display:grid;gap:var(--s4);margin-top:var(--s5)}
.lpstories article{border:1px solid var(--lp-line);border-radius:var(--lp-radius);overflow:hidden}
.lplogo{height:104px;display:grid;place-items:center;background:var(--lp-pri-dark);
  color:var(--lp-on-band);font-size:14px;font-weight:600;letter-spacing:.04em}
.lpstories h3{padding:var(--s4) var(--s4) 0}
.lpstories p{padding:var(--s2) var(--s4) 0;font-size:14px;line-height:1.55}
.lpstories .lpmore{margin:var(--s3) var(--s4) var(--s4)}

/* the dark proof band */
.lpproof{display:grid;gap:var(--s5)}
.lpproof blockquote{margin:0;font-size:22px;line-height:1.4;font-weight:600;
  letter-spacing:-.015em;color:var(--lp-on-band)}
.lpattr{font-size:var(--t5);margin-top:var(--s3)}
.lpfigs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--s4) var(--s5)}
.lpfigs b{display:block;font-size:34px;font-weight:700;letter-spacing:-.025em;line-height:1;
  font-variant-numeric:tabular-nums}
.lpfigs span{display:block;font-size:13.5px;line-height:1.5;margin-top:var(--s2);
  color:var(--lp-on-band-muted)}

/* --------------------------------------------------------------------- Q&A */
.lpfaq{border-top:1px solid var(--lp-line-2);margin-top:var(--s5);max-width:900px}
.qa{border-bottom:1px solid var(--lp-line-2)}
.qa > button{width:100%;display:flex;align-items:center;gap:var(--s3);text-align:left;
  background:none;border:0;font:inherit;font-size:16.5px;font-weight:600;letter-spacing:-.012em;
  color:inherit;padding-block:var(--s3);cursor:pointer}
.qa > button i{margin-left:auto;flex-shrink:0;width:13px;height:13px;position:relative}
.qa > button i::before,.qa > button i::after{content:"";position:absolute;inset:50% 0 auto;
  height:2px;border-radius:2px;background:var(--lp-pri);transition:transform 260ms var(--ease)}
.qa > button i::after{transform:rotate(90deg)}
.qa.on > button i::after{transform:rotate(0)}
.qaa{display:grid;grid-template-rows:0fr;transition:grid-template-rows 280ms var(--ease)}
.qa.on .qaa{grid-template-rows:1fr}
.qaa > p{overflow:hidden;font-size:var(--t4);max-width:76ch;line-height:1.6}
.qa.on .qaa > p{padding-bottom:var(--s4)}

/* ------------------------------------------------------------------ footer */
.lpfoot{background:var(--lp-pri-dark);color:var(--lp-on-band);padding-block:var(--s5)}
.lpfootin{display:grid;gap:var(--s4)}
.lpfootbrand p{font-size:13.5px;color:var(--lp-on-band-muted);line-height:1.6;margin-top:var(--s3);
  max-width:34ch}
.lpfootin > div > b{display:block;font-size:14px;font-weight:600;margin-bottom:var(--s2)}
.lpfootin > div > a,.lpfootin > div > .lplink{display:block;font-size:13.5px;
  color:var(--lp-on-band-muted);text-decoration:none;padding-block:4px;text-align:left}
.lpfootin > div > a:hover,.lpfootin > div > .lplink:hover{color:var(--lp-on-band)}

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
  .lpsix{grid-template-columns:repeat(2,minmax(0,1fr))}
  .lptiles{grid-template-columns:repeat(2,minmax(0,1fr))}
  .lpmods,.lpres{grid-template-columns:repeat(2,minmax(0,1fr))}
  .lpstories,.lpnext{grid-template-columns:repeat(3,minmax(0,1fr))}
}
@media(min-width:${BP.tab}px){
  .lpnav{display:flex}
  .lpsix{grid-template-columns:repeat(3,minmax(0,1fr))}
  .lptiles{grid-template-columns:repeat(4,minmax(0,1fr))}
  .lpmods,.lpres{grid-template-columns:repeat(4,minmax(0,1fr))}
  .lpcharts{grid-template-columns:repeat(2,minmax(0,1fr))}
  .lpherogrid{grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:center;gap:var(--s5)}
  .lpsplit{grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--s6);align-items:center}
  .lpsplit.rev > div:first-child{order:-1}
  .lpproof{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:var(--s6);align-items:center}
  .lpfootin{grid-template-columns:1.6fr 1fr 1fr 1fr;gap:var(--s5)}
  .lphero{padding-block:var(--s6)}
}
`;
