/* The front door.

   What a visitor needs, in this order: what this is, proof it is not a claim,
   how it works, who it is for, and a way in. Everything below is arranged to
   that sequence and nothing else is on the page.

   Three rules held throughout:

   THE ANIMATION IS THE ARGUMENT. The sealed-bid diagram in the hero is not
   decoration — it is the product's whole premise acted out in nine seconds:
   envelopes arrive, they stay shut, the clock runs out, and only then does
   somebody named break the seals. A static screenshot could not make that
   point, and a paragraph takes longer to read than the loop takes to run.
   Every motion here is `prefers-reduced-motion` aware and the diagram freezes
   on its final, legible frame rather than disappearing.

   IT IS THE SAME DESIGN SYSTEM. No landing-page palette, no marketing
   typeface, no shadow vocabulary that appears nowhere else. A visitor who
   signs up should recognise the product they were shown, and the fastest way
   to break that is a front page built out of different parts.

   MOBILE FIRST, LIKE THE REST. Every rule outside a media query describes a
   360px screen; the wide layouts only add. */
import React, { useEffect, useRef, useState } from "react";

import { BP } from "./breakpoints";
import { Icon } from "./icons";
import { Mark, Wordmark } from "./logo";
import { reducedMotion, useReveal } from "./motion";

/* ------------------------------------------------------------------ content
   Copy lives up here as data so the layout below stays readable and so a
   wording change is a one-line edit rather than a hunt through JSX. */

const PILLARS = [
  ["seal", "Sealed until the deadline",
   "Bid amounts and documents are encrypted the moment they arrive. Nobody on the buying side can read an envelope early — not the buyer, not the panel, not an administrator. Opening is a deliberate, recorded act with a name against it."],
  ["scales", "Scored blind, then together",
   "Evaluators score on their own and never see another member's marks until consensus. Conflicts of interest are declared before scoring opens, not explained afterwards."],
  ["stamp", "Separation of duties, enforced",
   "Whoever recommends an award cannot approve it. Who signs is decided by a delegation-of-authority ladder and your own reporting lines, not by whoever happens to be logged in."],
  ["audit", "An audit trail that verifies",
   "Every event is hash-chained to the one before it. A quietly edited record is a broken one, and the integrity report says which link broke and when."],
  ["finance", "Savings you can defend",
   "Measured against a real baseline — last year's contract, the incumbent's renewal — not against a budget somebody set optimistically. Where there is no baseline, it says so instead of inflating the number."],
  ["suppliers", "A vendor register that is a register",
   "Categories, classifications, compliance documents with expiry dates, verification and suspension as separate states. Bulk-load the spreadsheet you already have and invite every vendor on it to register."],
];

const STEPS = [
  ["tender", "Draft the tender",
   "Scope, criteria, weights and line items. The drafting assistant can propose a first pass; the numbers stay yours."],
  ["stamp", "Route it for signature",
   "The value decides the chain. It walks your reporting line upward until it reaches somebody whose authority covers the amount."],
  ["mail", "Invite your vendors",
   "From the register, by category. Vendors who have no account yet get a link that both invites them and lets them claim it."],
  ["envelope", "Receive sealed bids",
   "Encrypted at rest, technical and commercial envelopes kept separate where you run two stages. Clarifications are answered to everybody at once."],
  ["envelopeOpen", "Open on the record",
   "After the deadline, and never before it. The opening names who broke the seals and when."],
  ["scales", "Score blind",
   "Panel members mark independently against the published criteria. Variance between scorers is flagged rather than averaged away."],
  ["gavel", "Recommend, then approve",
   "The panel recommends. Somebody else signs, up the same ladder. Award and regret letters are issued together."],
  ["audit", "Hand the file to an auditor",
   "Every decision, every document, every signature, in one verifiable chain."],
];

const ROLES = [
  ["suppliers", "Procurement", "Drafts tenders, runs the register, invites vendors, breaks the seals. Cannot approve their own work."],
  ["scales", "Evaluators", "Score bids blind against published criteria. Never see the panel's other marks, never see the commercial envelope before the technical stage closes."],
  ["stamp", "Approvers", "Sit on the authority ladder. Sign publications and awards within their limit and pass the rest upward."],
  ["audit", "Internal audit", "Reads everything, changes nothing, and can verify the chain for themselves rather than taking a report's word for it."],
  ["portal", "Vendors", "See only their own invitations, their own bid and their own letter. A vendor cannot learn that another vendor bid at all."],
];

const FAQ = [
  ["Can an administrator read a sealed bid?",
   "No. Sealing is time-based, not permission-based: there is no capability in the system that opens an envelope before its recorded opening, and a superuser holds every capability there is. The ciphertext is in the database and the decision to open it is an event on the chain."],
  ["What happens if somebody edits the database directly?",
   "The audit chain notices. Each event carries a hash of the one before it, so an altered or removed record breaks every link after it. The integrity report names the first break rather than reporting a general failure."],
  ["We have four layers of management. Does that work?",
   "That is what the delegation-of-authority ladder is for. You define the rungs and their limits, you place people on them, and a request walks the raiser's reporting line upward collecting signatures until it reaches somebody whose authority covers the amount. Four layers means four signatures where the number needs them."],
  ["Can we load the vendor register we already have?",
   "Yes, during setup or at any time afterwards. Names, categories and contact addresses come across, duplicates are reported rather than silently merged, and you can email the whole register an invitation to register properly — in batches, once each, with failures recorded as failures."],
  ["Does it need a code to set up?",
   "Yes. An empty deployment on a public address would otherwise belong to whoever found the URL first. Setup asks for a code issued out of band, checked with the same lockout as the sign-in page."],
  ["Is the AI drafting assistant compulsory?",
   "No, and it is never in the decision path. It can draft scope and criteria and summarise a bid; it cannot score, recommend, approve, or see anything a person in that seat could not see. With no API key configured those endpoints simply return unavailable."],
];

const NUMBERS = [
  ["100%", "of decisions on the chain", "Publication, opening, every score, every signature."],
  ["0", "bids readable before the deadline", "Enforced at serialization, not in the browser."],
  ["8", "levels of signing authority", "More rungs than any delegation policy we have been handed."],
];

/* --------------------------------------------------------------- the diagram
   Four states on a loop: envelopes arriving, sealed and waiting, the deadline
   passing, the recorded opening. It is the product's premise, acted out. */

const PHASES = [
  { key: "arrive", label: "Bids arrive", note: "Encrypted on receipt" },
  { key: "sealed", label: "Sealed", note: "Nobody can read them — including you" },
  { key: "deadline", label: "Deadline passes", note: "The window closes on the clock, not on a click" },
  { key: "open", label: "Opened on the record", note: "Amara Ede broke the seals · named, timed, chained" },
];

function SealDiagram() {
  const [phase, setPhase] = useState(0);
  const still = reducedMotion();

  useEffect(() => {
    if (still) { setPhase(3); return undefined; }   // the legible final frame
    const h = setInterval(() => setPhase((n) => (n + 1) % PHASES.length), 2400);
    return () => clearInterval(h);
  }, [still]);

  const p = PHASES[phase];
  const open = phase === 3;

  return (
    <figure className="sealfig" aria-label="How a sealed bid is handled: bids arrive encrypted, stay sealed until the deadline, and are opened on the record.">
      <div className={"sealstage ph-" + p.key}>
        {[0, 1, 2, 3].map((i) => (
          <span className="env" key={i} style={{ "--i": i }}>
            <Icon n={open ? "envelopeOpen" : "envelope"} s={22} />
            <i className="envamt">{open ? ["₦182m", "₦194m", "₦201m", "₦217m"][i] : "••••••"}</i>
            {!open && <span className="wax" aria-hidden="true" />}
          </span>
        ))}
        <span className="sealclock" aria-hidden="true"><Icon n={open ? "check" : "clock"} s={15} /></span>
      </div>
      <figcaption>
        <b>{p.label}</b>
        <span>{p.note}</span>
        <span className="sealdots" aria-hidden="true">
          {PHASES.map((x, i) => <i key={x.key} className={i === phase ? "on" : ""} />)}
        </span>
      </figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------------ the page */

export function Landing({ cfg, onScreen }) {
  const demo = (cfg && cfg.demoUrl) || "";
  const canDemo = !!demo || !!(cfg && cfg.demoLogin);
  const [open, setOpen] = useState(-1);
  const topRef = useRef(null);
  useReveal([]);

  const goDemo = () => { if (demo) window.location.href = demo; else onScreen("demo"); };
  const goSetup = () => {
    if (cfg && cfg.signupUrl) window.location.href = cfg.signupUrl + "/?setup=1";
    else onScreen("setup");
  };

  return (
    <div className="lp" ref={topRef}>
      <header className="lpbar">
        <div className="lpbarin">
          <Wordmark s={26} animate />
          <nav className="lpnav">
            <a href="#how">How it works</a>
            <a href="#control">Controls</a>
            <a href="#roles">Who uses it</a>
            <a href="#faq">Questions</a>
          </nav>
          <div className="lpbaracts">
            <button className="btn sm" onClick={() => onScreen("signin")}>Sign in</button>
            <button className="btn pri sm" onClick={goSetup}>Set up your company</button>
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------------ hero */}
      <section className="lphero">
        <div className="lpin lpherogrid">
          <div className="lpherocopy">
            <span className="lpeyebrow" data-reveal>
              <Icon n="lock" s={13} /> Sealed-bid tendering
            </span>
            <h1 data-reveal>
              Run a tender you can <em>prove</em> was fair.
            </h1>
            <p className="lplede" data-reveal>
              DOCKET keeps every bid encrypted until the deadline passes, makes the opening
              a recorded act, scores panels blind, routes signatures up your own reporting
              line, and writes the whole thing to a hash-chained audit trail you can hand
              to an auditor without a covering note.
            </p>
            <div className="lpacts" data-reveal>
              <button className="btn pri lpbtn" onClick={goSetup}>
                Set up your company <Icon n="chev" s={15} />
              </button>
              {canDemo && (
                <button className="btn lpbtn" onClick={goDemo}>See it working first</button>
              )}
            </div>
            <p className="lpfine" data-reveal>
              Setting up takes a few minutes and you land signed in. You will need the
              access code issued to your organisation.
            </p>
          </div>
          <div className="lpherofig" data-reveal><SealDiagram /></div>
        </div>
        <div className="lpnums lpin">
          {NUMBERS.map(([fig, label, note]) => (
            <div className="lpnum" key={label} data-reveal>
              <b>{fig}</b><span>{label}</span><i>{note}</i>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------- the problem */}
      <section className="lpband">
        <div className="lpin lpsplit">
          <div data-reveal>
            <h2 className="lph2">A procurement file is only worth what it can survive.</h2>
            <p className="lpbody">
              Most tendering runs on shared drives and email. Amounts sit readable in an
              inbox before the deadline. Scores get "aligned" in a meeting. The approval
              was a forwarded message from somebody who was in a hurry. None of it is
              necessarily dishonest — and none of it can be shown to be honest six months
              later when somebody asks.
            </p>
            <p className="lpbody">
              This is the software for the version of that process that holds up. Not
              because people are watched, but because the sequence is enforced: you cannot
              read a bid early, you cannot see another scorer's marks, you cannot approve
              the thing you recommended, and you cannot change a record without the chain
              saying so.
            </p>
          </div>
          <ul className="lpcontrast" data-reveal>
            {[
              ["Amounts visible before the deadline", "Encrypted at rest; unreadable until the recorded opening"],
              ["Scores compared in the room", "Blind until consensus, with variance flagged"],
              ["Approval by forwarded email", "A signature chain up your own reporting line"],
              ["“Trust me, nothing was changed”", "A hash chain that can be recomputed on demand"],
              ["Savings measured against a hopeful budget", "Measured against a real prior price, or reported as unmeasured"],
            ].map(([was, now]) => (
              <li key={was}>
                <span className="lpwas"><Icon n="close" s={13} />{was}</span>
                <span className="lpnow"><Icon n="check" s={13} />{now}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* --------------------------------------------------------- the steps */}
      <section id="how" className="lpsection">
        <div className="lpin">
          <div className="lphead" data-reveal>
            <span className="lpkicker">How it works</span>
            <h2 className="lph2">Eight steps, and the order is not optional.</h2>
            <p className="lpsub">
              Each one is a state the tender is genuinely in — not a checkbox somebody
              ticks. The system refuses the next step until the current one is real.
            </p>
          </div>
          <ol className="lpsteps">
            {STEPS.map(([icon, title, body], i) => (
              <li key={title} data-reveal style={{ transitionDelay: `${Math.min(i, 5) * 45}ms` }}>
                <span className="lpstepn">{String(i + 1).padStart(2, "0")}</span>
                <span className="lpstepi" aria-hidden="true"><Icon n={icon} s={17} /></span>
                <div><b>{title}</b><p>{body}</p></div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ------------------------------------------------------ the authority */}
      <section className="lpband">
        <div className="lpin lpsplit rev">
          <div className="lpladder" data-reveal aria-hidden="true">
            {[
              ["Buyer raises it", "₦240,000,000", "raiser"],
              ["Category Manager", "up to ₦10m · signs, passes up", ""],
              ["Head of Procurement", "up to ₦50m · signs, passes up", ""],
              ["Finance Director", "up to ₦500m · signs — covered", "last"],
            ].map(([who, what, tone], i) => (
              <div className={"lprung " + tone} key={who} style={{ "--i": i }}>
                <span className="lprungi">
                  <Icon n={tone === "raiser" ? "tender" : tone === "last" ? "check" : "stamp"} s={15} />
                </span>
                <div><b>{who}</b><i>{what}</i></div>
              </div>
            ))}
          </div>
          <div data-reveal>
            <span className="lpkicker">Delegation of authority</span>
            <h2 className="lph2">However many layers you have, it fits.</h2>
            <p className="lpbody">
              Define the rungs and what each may commit. Place your people on them. Draw
              the reporting lines — whoever reports to whoever, as deep as it actually
              goes.
            </p>
            <p className="lpbody">
              After that nobody chooses an approver. A request walks upward from the
              person who raised it, collecting a signature at every rung it passes, and
              stops at the first person whose authority covers the amount. Four layers of
              management is four signatures. Nobody signs their own request, and a gap in
              the chart falls back to the ladder rather than becoming a way out of it.
            </p>
            <ul className="lpticks">
              {["Up to eight levels", "Limits per level, unlimited at the top",
                "Named signatories or anyone on the role",
                "The chain is frozen when raised — a reorganisation next quarter cannot rewrite who was meant to sign last quarter"]
                .map((t) => <li key={t}><Icon n="check" s={13} />{t}</li>)}
            </ul>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- the controls */}
      <section id="control" className="lpsection">
        <div className="lpin">
          <div className="lphead" data-reveal>
            <span className="lpkicker">The controls</span>
            <h2 className="lph2">Six things that are true whether or not anyone is watching.</h2>
          </div>
          <div className="lpgrid">
            {PILLARS.map(([icon, title, body], i) => (
              <article className="lpcard" key={title} data-reveal
                       style={{ transitionDelay: `${Math.min(i, 5) * 50}ms` }}>
                <span className="lpcardi" aria-hidden="true"><Icon n={icon} s={19} /></span>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- the roles */}
      <section id="roles" className="lpband">
        <div className="lpin">
          <div className="lphead" data-reveal>
            <span className="lpkicker">Who uses it</span>
            <h2 className="lph2">Five seats, and they genuinely cannot do each other's work.</h2>
            <p className="lpsub">
              Separation of duties is not a policy document here. It is what the server
              will and will not serve.
            </p>
          </div>
          <div className="lproles">
            {ROLES.map(([icon, title, body], i) => (
              <div className="lprole" key={title} data-reveal
                   style={{ transitionDelay: `${Math.min(i, 4) * 45}ms` }}>
                <span className="lproleicon" aria-hidden="true"><Icon n={icon} s={18} /></span>
                <b>{title}</b>
                <p>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- setup */}
      <section className="lpsection">
        <div className="lpin lpsplit">
          <div data-reveal>
            <span className="lpkicker">Setting up</span>
            <h2 className="lph2">Your company, your chart, your vendors — in one sitting.</h2>
            <p className="lpbody">
              No console, no command line, no implementation call. The wizard asks for the
              access code, who you are, everything about the company that belongs on a
              letter, your authority ladder, your people and their reporting lines, and
              the vendor list you already have in a spreadsheet.
            </p>
            <p className="lpbody">
              Your team is placed on the chart before anybody accepts, so reporting lines
              and signing authority work from the first minute rather than from whenever
              the last invitation gets clicked. Your vendors are emailed an invitation to
              register, in batches, once each.
            </p>
            <div className="lpacts">
              <button className="btn pri lpbtn" onClick={goSetup}>Set up your company</button>
            </div>
          </div>
          <ol className="lpwizard" data-reveal>
            {[
              ["lock", "Access code", "Issued to your organisation. Rate-limited, and the only thing between a fresh deployment and a stranger."],
              ["team", "You", "Name, work email, password. You become procurement — you draft and configure, you do not sign your own work."],
              ["file", "Your company", "Trading and registered name, RC number, TIN, address, contacts, currency, financial year, and your logo."],
              ["stamp", "Authority ladder", "The rungs, their limits, and who holds them."],
              ["suppliers", "Your team", "Roles, job titles, reporting lines and signing authority, to any depth."],
              ["upload", "Your vendors", "Paste or upload the register. Names, categories, emails. They get invited."],
            ].map(([icon, title, body], i) => (
              <li key={title}>
                <span className="lpwizn">{i + 1}</span>
                <span className="lpwizi" aria-hidden="true"><Icon n={icon} s={15} /></span>
                <div><b>{title}</b><i>{body}</i></div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* -------------------------------------------------------------- FAQ */}
      <section id="faq" className="lpband">
        <div className="lpin lpnarrow">
          <div className="lphead" data-reveal>
            <span className="lpkicker">Questions</span>
            <h2 className="lph2">The ones worth asking first.</h2>
          </div>
          <div className="lpfaq" data-reveal>
            {FAQ.map(([q, a], i) => (
              <div className={"lpq" + (open === i ? " on" : "")} key={q}>
                <button type="button" aria-expanded={open === i}
                        onClick={() => setOpen(open === i ? -1 : i)}>
                  <span>{q}</span>
                  <i aria-hidden="true"><Icon n="chev" s={15} /></i>
                </button>
                <div className="lpqa"><p>{a}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------- CTA */}
      <section className="lpcta">
        <div className="lpin" data-reveal>
          <Mark s={52} animate />
          <h2>Start with the tender you are dreading.</h2>
          <p>
            The one where somebody is going to ask, afterwards, how the winner was chosen.
            That is the one this was built for.
          </p>
          <div className="lpacts">
            <button className="btn pri lpbtn" onClick={goSetup}>Set up your company</button>
            {canDemo && <button className="btn lpbtn ghost" onClick={goDemo}>Open the demo</button>}
          </div>
        </div>
      </section>

      <footer className="lpfoot">
        <div className="lpin lpfootin">
          <Wordmark s={22} />
          <div className="lpfootlinks">
            <button className="doclink" onClick={() => onScreen("signin")}>Sign in</button>
            <span aria-hidden="true">&middot;</span>
            <button className="doclink" onClick={() => onScreen("register")}>Register as a vendor</button>
            <span aria-hidden="true">&middot;</span>
            <button className="doclink" onClick={goSetup}>Set up your company</button>
            {canDemo && <><span aria-hidden="true">&middot;</span>
              <button className="doclink" onClick={goDemo}>Demo</button></>}
          </div>
          <span className="lpfootnote">
            Sealed-bid tendering, evaluation and award. Every decision on a verifiable chain.
          </span>
        </div>
      </footer>
    </div>
  );
}

export const LANDING_CSS = `
.lp{background:var(--paper);color:var(--ink);min-height:100dvh;
  overflow-x:clip;scroll-behavior:smooth;
  /* The arriving-and-settling easing. styles.js declares only --ease (the
     standard one); this page leans on the settle curve often enough that
     repeating the literal eight times would be worse than naming it here. */
  --ease-out:cubic-bezier(.16,1,.3,1)}
@media(prefers-reduced-motion:reduce){.lp{scroll-behavior:auto}}
.lpin{max-width:1140px;margin:0 auto;padding:0 16px;width:100%}
.lpnarrow{max-width:820px}

/* ---------------------------------------------------------------- top bar */
.lpbar{position:sticky;top:0;z-index:40;background:var(--topbar-bg);
  backdrop-filter:saturate(1.4) blur(12px);border-bottom:1px solid var(--line)}
.lpbarin{max-width:1140px;margin:0 auto;padding:11px 16px;display:flex;
  align-items:center;gap:14px}
.lpnav{display:none;gap:22px;margin-left:auto;font-size:13.5px}
.lpnav a{color:var(--muted);text-decoration:none;position:relative;padding:3px 0}
.lpnav a:hover{color:var(--ink)}
.lpnav a::after{content:"";position:absolute;left:0;right:100%;bottom:0;height:1.5px;
  background:var(--brand-2);transition:right 220ms var(--ease)}
.lpnav a:hover::after{right:0}
.lpbaracts{display:flex;gap:8px;margin-left:auto;align-items:center}
.lpbaracts .btn:first-child{display:none}

/* ------------------------------------------------------------------- hero */
.lphero{padding:44px 0 8px;position:relative}
.lphero::before{content:"";position:absolute;inset:-120px 0 auto;height:420px;
  background:radial-gradient(60% 100% at 50% 0,var(--brand-ring),transparent 70%);
  pointer-events:none}
.lpherogrid{display:grid;gap:34px;position:relative}
.lpeyebrow{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;
  letter-spacing:.1em;text-transform:uppercase;font-weight:650;color:var(--brand);
  background:var(--brand-tint);border:1px solid var(--green-2);border-radius:999px;
  padding:5px 11px;margin-bottom:16px}
.lpherocopy h1{font-size:clamp(32px,8.2vw,58px);line-height:1.04;letter-spacing:-.035em;
  font-weight:700;margin:0 0 16px;text-wrap:balance}
.lpherocopy h1 em{font-style:normal;color:var(--brand);position:relative;
  white-space:nowrap}
.lpherocopy h1 em::after{content:"";position:absolute;left:0;right:0;bottom:.06em;
  height:.1em;border-radius:2px;background:var(--green-2);opacity:.32}
.lplede{font-size:15.5px;line-height:1.66;color:var(--muted);margin:0 0 24px;
  max-width:58ch;text-wrap:pretty}
.lpacts{display:flex;flex-wrap:wrap;gap:10px}
.lpbtn{min-width:200px;justify-content:center;padding:13px 22px;font-size:14.5px}
.lpbtn.ghost{background:transparent;border-color:var(--line2)}
.lpfine{font-size:12.5px;color:var(--faint);margin:14px 0 0;line-height:1.55;
  max-width:46ch}

/* -------------------------------------------------------------- the figure */
.lpherofig{display:flex;justify-content:center}
.sealfig{margin:0;width:100%;max-width:420px;border:1px solid var(--line);
  border-radius:var(--r-lg);background:var(--card);overflow:hidden;
  box-shadow:0 18px 40px -28px var(--pri-glow)}
.sealstage{position:relative;height:184px;display:flex;align-items:center;
  justify-content:center;gap:10px;background:
    linear-gradient(180deg,var(--sunk),var(--card));padding:0 18px}
.sealstage::after{content:"";position:absolute;left:18px;right:18px;bottom:30px;
  height:1px;background:var(--line2)}
.env{position:relative;display:flex;flex-direction:column;align-items:center;gap:7px;
  color:var(--brand);transition:transform 520ms var(--ease-out),opacity 380ms var(--ease)}
.envamt{font-family:var(--font-mono);font-size:10.5px;font-style:normal;
  letter-spacing:.04em;color:var(--faint)}
.wax{position:absolute;top:13px;width:10px;height:10px;border-radius:50%;
  background:var(--wax);box-shadow:0 0 0 2px var(--card);
  transition:opacity 280ms var(--ease),transform 280ms var(--ease)}
.sealclock{position:absolute;right:16px;bottom:14px;display:inline-flex;
  align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;
  background:var(--card);border:1px solid var(--line2);color:var(--faint);
  transition:color 260ms var(--ease),border-color 260ms var(--ease)}
.sealfig figcaption{border-top:1px solid var(--line);padding:12px 16px;
  display:flex;flex-direction:column;gap:3px;min-height:74px}
.sealfig figcaption b{font-size:13.5px;letter-spacing:-.01em}
.sealfig figcaption span{font-size:12px;color:var(--muted);line-height:1.45}
.sealdots{display:flex!important;gap:5px;margin-top:6px}
.sealdots i{width:16px;height:3px;border-radius:2px;background:var(--line2);
  transition:background 260ms var(--ease)}
.sealdots i.on{background:var(--brand-2)}

@media(prefers-reduced-motion:no-preference){
  .ph-arrive .env{animation:envin 620ms var(--ease-out) both;
    animation-delay:calc(var(--i) * 110ms)}
  .ph-deadline .env{transform:translateY(-4px)}
  .ph-deadline .sealclock{color:var(--wax);border-color:var(--wax)}
  .ph-open .env{transform:translateY(-2px)}
  .ph-open .sealclock{color:var(--green);border-color:var(--green-2)}
}
.ph-open .wax{opacity:0;transform:scale(.4) translateY(6px)}
.ph-deadline .sealclock{color:var(--wax);border-color:var(--wax)}
.ph-open .sealclock{color:var(--green);border-color:var(--green-2)}
@keyframes envin{from{opacity:0;transform:translateY(14px) rotate(-5deg)}
  to{opacity:1;transform:none}}

/* ------------------------------------------------------------- the numbers */
.lpnums{display:grid;gap:1px;background:var(--line);border:1px solid var(--line);
  border-radius:var(--r-lg);overflow:hidden;margin-top:40px}
.lpnum{background:var(--card);padding:18px 18px 16px;display:flex;
  flex-direction:column;gap:2px}
.lpnum b{font-size:30px;font-weight:700;letter-spacing:-.035em;color:var(--brand);
  line-height:1.05;font-variant-numeric:tabular-nums}
.lpnum span{font-size:13px;font-weight:600;letter-spacing:-.01em}
.lpnum i{font-style:normal;font-size:12px;color:var(--muted);line-height:1.45}

/* ------------------------------------------------------------- the sections */
.lpsection{padding:62px 0}
.lpband{padding:62px 0;background:var(--paper-2);
  border-block:1px solid var(--line);margin-top:56px}
.lpsection + .lpband{margin-top:0}
.lphead{max-width:64ch;margin-bottom:30px}
.lpkicker{display:block;font-size:11.5px;letter-spacing:.11em;text-transform:uppercase;
  font-weight:650;color:var(--brand);margin-bottom:9px}
.lph2{font-size:clamp(23px,4.6vw,34px);line-height:1.14;letter-spacing:-.03em;
  font-weight:700;margin:0 0 12px;text-wrap:balance}
.lpsub{font-size:14.5px;line-height:1.62;color:var(--muted);margin:0;max-width:60ch;
  text-wrap:pretty}
.lpbody{font-size:14.5px;line-height:1.68;color:var(--muted);margin:0 0 14px;
  max-width:60ch;text-wrap:pretty}
.lpsplit{display:grid;gap:32px;align-items:center}

/* ------------------------------------------------------------- the contrast */
.lpcontrast{list-style:none;margin:0;padding:0;display:grid;gap:1px;
  background:var(--line);border:1px solid var(--line);border-radius:var(--r-lg);
  overflow:hidden}
.lpcontrast li{background:var(--card);padding:13px 15px;display:grid;gap:6px}
.lpcontrast span{display:flex;gap:8px;align-items:flex-start;font-size:13px;
  line-height:1.5}
.lpcontrast svg{flex-shrink:0;margin-top:2px}
.lpwas{color:var(--faint);text-decoration:line-through;text-decoration-color:var(--line2)}
.lpwas svg{color:var(--wax);text-decoration:none}
.lpnow{color:var(--ink)}
.lpnow svg{color:var(--green)}

/* ---------------------------------------------------------------- the steps */
.lpsteps{list-style:none;margin:0;padding:0;display:grid;gap:1px;
  background:var(--line);border:1px solid var(--line);border-radius:var(--r-lg);
  overflow:hidden;counter-reset:s}
.lpsteps li{background:var(--card);padding:16px 16px 17px;display:grid;
  grid-template-columns:auto auto minmax(0,1fr);gap:12px;align-items:start}
.lpstepn{font-family:var(--font-mono);font-size:11px;color:var(--faint);
  padding-top:7px;letter-spacing:.04em}
.lpstepi{width:32px;height:32px;border-radius:9px;display:inline-flex;
  align-items:center;justify-content:center;background:var(--brand-tint);
  color:var(--brand);border:1px solid var(--green-2);flex-shrink:0}
.lpsteps b{font-size:14px;font-weight:650;letter-spacing:-.012em;display:block}
.lpsteps p{margin:4px 0 0;font-size:12.8px;line-height:1.55;color:var(--muted);
  text-wrap:pretty}

/* --------------------------------------------------------------- the ladder */
.lpladder{display:grid;gap:8px}
.lprung{display:flex;gap:11px;align-items:center;background:var(--card);
  border:1px solid var(--line);border-radius:12px;padding:12px 14px;
  margin-left:calc(var(--i) * 14px)}
.lprung.raiser{border-style:dashed;background:var(--sunk)}
.lprung.last{border-color:var(--green-2);background:var(--green-tint)}
.lprungi{width:28px;height:28px;border-radius:8px;display:inline-flex;flex-shrink:0;
  align-items:center;justify-content:center;background:var(--sunk);color:var(--muted);
  border:1px solid var(--line)}
.lprung.last .lprungi{background:var(--card);color:var(--green);border-color:var(--green-2)}
.lprung b{display:block;font-size:13.5px;letter-spacing:-.012em}
.lprung i{font-style:normal;font-size:12px;color:var(--muted);
  font-family:var(--font-mono);letter-spacing:.01em}
.lpticks{list-style:none;margin:16px 0 0;padding:0;display:grid;gap:8px}
.lpticks li{display:flex;gap:9px;align-items:flex-start;font-size:13.2px;
  line-height:1.52;color:var(--muted)}
.lpticks svg{color:var(--green);flex-shrink:0;margin-top:3px}

/* ---------------------------------------------------------------- the cards */
.lpgrid{display:grid;gap:14px}
.lpcard{background:var(--card);border:1px solid var(--line);border-radius:var(--r-lg);
  padding:20px 18px;transition:border-color 200ms var(--ease),transform 240ms var(--ease-out),
    box-shadow 240ms var(--ease)}
.lpcard:hover{border-color:var(--green-2);transform:translateY(-2px);
  box-shadow:0 14px 34px -26px var(--pri-glow)}
.lpcardi{width:38px;height:38px;border-radius:11px;display:inline-flex;
  align-items:center;justify-content:center;background:var(--brand-tint);
  color:var(--brand);border:1px solid var(--green-2);margin-bottom:13px}
.lpcard h3{margin:0 0 6px;font-size:15px;font-weight:650;letter-spacing:-.018em}
.lpcard p{margin:0;font-size:13px;line-height:1.6;color:var(--muted);text-wrap:pretty}

/* ---------------------------------------------------------------- the roles */
.lproles{display:grid;gap:12px}
.lprole{background:var(--card);border:1px solid var(--line);border-radius:var(--r-lg);
  padding:17px 16px}
.lproleicon{width:32px;height:32px;border-radius:9px;display:inline-flex;
  align-items:center;justify-content:center;background:var(--sunk);color:var(--brand);
  border:1px solid var(--line);margin-bottom:11px}
.lprole b{display:block;font-size:14px;letter-spacing:-.015em;margin-bottom:5px}
.lprole p{margin:0;font-size:12.8px;line-height:1.58;color:var(--muted);text-wrap:pretty}

/* --------------------------------------------------------------- the wizard */
.lpwizard{list-style:none;margin:0;padding:0;display:grid;gap:1px;
  background:var(--line);border:1px solid var(--line);border-radius:var(--r-lg);
  overflow:hidden}
.lpwizard li{background:var(--card);padding:14px 15px;display:grid;
  grid-template-columns:auto auto minmax(0,1fr);gap:11px;align-items:center}
.lpwizn{width:21px;height:21px;border-radius:50%;background:var(--brand);
  color:var(--on-brand);font-size:11px;font-weight:700;display:inline-flex;
  align-items:center;justify-content:center;flex-shrink:0}
.lpwizi{color:var(--brand);display:inline-flex;flex-shrink:0}
.lpwizard b{display:block;font-size:13.5px;letter-spacing:-.012em}
.lpwizard i{font-style:normal;font-size:12.2px;line-height:1.5;color:var(--muted);
  display:block;margin-top:2px;text-wrap:pretty}

/* ------------------------------------------------------------------- FAQ */
.lpfaq{border:1px solid var(--line);border-radius:var(--r-lg);overflow:hidden;
  background:var(--card)}
.lpq + .lpq{border-top:1px solid var(--line)}
.lpq > button{width:100%;display:flex;gap:12px;align-items:center;text-align:left;
  background:none;border:0;font:inherit;color:inherit;padding:15px 16px;cursor:pointer;
  font-size:14px;font-weight:600;letter-spacing:-.012em}
.lpq > button:hover{background:var(--sunk)}
.lpq > button i{margin-left:auto;color:var(--faint);display:inline-flex;flex-shrink:0;
  transform:rotate(90deg);transition:transform 220ms var(--ease)}
.lpq.on > button i{transform:rotate(270deg);color:var(--brand)}
.lpqa{display:grid;grid-template-rows:0fr;transition:grid-template-rows 260ms var(--ease)}
.lpq.on .lpqa{grid-template-rows:1fr}
.lpqa > p{overflow:hidden;margin:0;font-size:13.2px;line-height:1.66;color:var(--muted);
  padding:0 16px;text-wrap:pretty}
.lpq.on .lpqa > p{padding:0 16px 16px}

/* -------------------------------------------------------------------- CTA */
.lpcta{padding:70px 0;text-align:center;background:var(--paper-2);
  border-top:1px solid var(--line)}
.lpcta .dkmark{margin:0 auto 18px}
.lpcta h2{font-size:clamp(24px,5vw,36px);line-height:1.12;letter-spacing:-.03em;
  margin:0 0 12px;font-weight:700;text-wrap:balance}
.lpcta p{margin:0 auto 22px;max-width:50ch;font-size:14.5px;line-height:1.62;
  color:var(--muted);text-wrap:pretty}
.lpcta .lpacts{justify-content:center}

/* ----------------------------------------------------------------- footer */
.lpfoot{padding:26px 0 34px;background:var(--paper);border-top:1px solid var(--line)}
.lpfootin{display:flex;flex-direction:column;gap:12px;align-items:center;
  text-align:center}
.lpfootlinks{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:center;
  font-size:13px;color:var(--faint)}
.lpfootnote{font-size:12px;color:var(--faint);line-height:1.5;max-width:52ch}

/* ------------------------------------------------------------ wider screens */
@media(min-width:${BP.tab}px){
  .lpnums{grid-template-columns:repeat(3,minmax(0,1fr))}
  .lpgrid{grid-template-columns:repeat(2,minmax(0,1fr))}
  .lproles{grid-template-columns:repeat(2,minmax(0,1fr))}
  .lpsteps{grid-template-columns:repeat(2,minmax(0,1fr))}
  .lpbaracts .btn:first-child{display:inline-flex}
  .lphero{padding-top:60px}
}
@media(min-width:${BP.desk}px){
  .lpnav{display:flex}
  .lpherogrid{grid-template-columns:minmax(0,1.08fr) minmax(0,.92fr);gap:46px;
    align-items:center}
  .lpsplit{grid-template-columns:repeat(2,minmax(0,1fr));gap:46px}
  .lpsplit.rev > :first-child{order:2}
  .lpgrid{grid-template-columns:repeat(3,minmax(0,1fr))}
  .lproles{grid-template-columns:repeat(3,minmax(0,1fr))}
  .lpsection,.lpband{padding:80px 0}
  .lpcta{padding:92px 0}
  .lphero{padding-top:74px}
}
`;
