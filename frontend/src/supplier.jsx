import React, { useEffect, useRef, useState } from "react";

import { downloadDoc, raw } from "./api";
import { Countdown, Empty, Money, Stat } from "./atoms";
import { Figures, Guide, More, Page, Quiet, Row, Rows } from "./page";
import {
  REG_STATUS, VERIFY_STATUS, activeRound, effStatus, fmtCompact, fmtDate,
  fmtDateTime, fmtMoney, regStatusOf, roundsOf, verifyStatusOf,
} from "./helpers";
import { Icon, SealMark } from "./icons";
import { DUR, cue, useCountUp, useFlip, usePrev } from "./motion";
import { ConfirmDialog, CountUp, LiveCountdown, RollNumber, Sparkline, TypeOut } from "./ui";

/* ---------------- supplier portal ---------------- */

export function PortalHome({ api }) {
  const { state, user, go, act } = api;
  const me = user.supplierId;
  const supplier = state.suppliers.find((s) => s.id === me);
  const [docForm, setDocForm] = useState({ label: "", expiry: "" });
  const [profileForm, setProfileForm] = useState({ name: supplier.name, category: supplier.category, location: supplier.location });
  const myComplianceDocs = (state.documents || []).filter((x) => x.kind === "supplier" && x.supplierId === me);
  const uploadCompliance = (e) => {
    const f = e.target.files[0];
    if (f) {
      const expiryMs = docForm.expiry ? new Date(docForm.expiry).getTime() : "";
      act.upload("/me/docs/", f, { label: docForm.label || f.name, expiry: expiryMs });
      setDocForm({ label: "", expiry: "" });
    }
    e.target.value = "";
  };
  const [openL, setOpenL] = useState({});
  /* Auctions come from their own endpoint. They are not in the bootstrap
     payload and they are not tenders, so there is nothing in `state` to filter
     - /auctions/mine/ is the vendor's own invitation list and the server
     already drops drafts from it. */
  const [aucs, setAucs] = useState([]);
  useEffect(() => {
    let active = true;
    const load = () => raw("/auctions/mine/")
      .then((d) => { if (active) setAucs(d.auctions || []); })
      .catch(() => { /* the rest of the portal still works without them */ });
    load();
    /* A live room's clock is the thing a bidder came to see, so the list
       refreshes while one is open rather than going stale behind them. */
    const h = setInterval(load, 15000);
    return () => { active = false; clearInterval(h); };
  }, []);
  /* A paused event is still an invitation the vendor holds — dropping it off
     the list would tell them nothing, which is exactly the silence pausing an
     event is supposed to replace. Cancelled events move to Outcomes below:
     there is nothing left to do about them, but there is something to know. */
  const invitations = state.tenders.filter((t) => t.invited.includes(me)
    && ["published", "closed", "paused"].includes(effStatus(t)));
  const outcomes = state.tenders.filter((t) => t.invited.includes(me)
    && (["evaluation", "awarded"].includes(t.status)
        || (t.status === "cancelled" && state.bids.some((b) => b.tenderId === t.id && b.supplierId === me)))
    && (t.status === "cancelled" || state.bids.some((b) => b.tenderId === t.id && b.supplierId === me)));

  /* The vendor opens this page to find out one thing: is there anything to
     bid on, and when does it close. So that is the guide - the open
     invitations as a list you can act on, the nearest deadline as the
     headline - and the company profile, the documents and the win/loss record
     are behind disclosures. They used to be the first two cards on the page. */
  const openNow = invitations.filter((t) => effStatus(t) === "published");
  const notStarted = openNow.filter((t) => {
    const rnd = activeRound(t);
    return !state.bids.some((b) => b.tenderId === t.id && b.supplierId === me && (rnd && rnd.id ? b.roundId === rnd.id : true));
  });
  const soonest = openNow.length ? openNow.reduce((a, t) => (t.deadline < a.deadline ? t : a)) : null;
  const invited = state.tenders.filter((t) => t.invited.includes(me));
  const bidsMade = state.bids.filter((b) => b.supplierId === me);
  const wins = state.tenders.filter((t) => t.awardedTo === me);
  const decided = state.tenders.filter((t) => t.status === "awarded" && bidsMade.some((b) => b.tenderId === t.id));
  const losses = decided.length - wins.length;
  const value = wins.reduce((s2, t) => s2 + (t.awardedAmount || 0), 0);

  const guide = (
    <Guide art={notStarted.length ? "draft" : openNow.length ? "clear" : "tray"}
           tone={openNow.length && !notStarted.length ? "good" : undefined}
           headline={notStarted.length
             ? `${notStarted.length} ${notStarted.length === 1 ? "tender is" : "tenders are"} waiting for your bid`
             : openNow.length ? "Every open bid is sealed" : "Nothing to bid on right now"}
           why={soonest
             ? <>The nearest closes {fmtDate(soonest.deadline)}. Nothing you seal is visible to the buyer before then.</>
             : "When a buyer invites you, it appears here with its closing date."}
           items={notStarted.map((t) => ({ key: t.id, label: t.title, note: <Countdown t={t.deadline} />,
                                           onPick: () => go({ page: "bidroom", id: t.id }) }))}>
      <Figures>
        <Quiet n={<CountUp n={invited.length} />} label="invitations" />
        <Quiet n={<CountUp n={wins.length} />} label="won" tone={wins.length ? "var(--green)" : undefined} />
        <Quiet n={decided.length ? Math.round((wins.length / decided.length) * 100) + "%" : "-"} label="win rate" />
        <Quiet n={<CountUp n={value} format={fmtCompact} />} label="awarded value" />
      </Figures>
    </Guide>
  );

  return (
    <Page guide={guide}>
      <div className="pagehead">
        <div>
          <h1>{supplier.name}</h1>
          <span className="sub">Supplier portal with {state.org.name}.</span>
        </div>
        <div className="grow" />
        <span className={"chip " + (REG_STATUS[regStatusOf(supplier)] || {}).tone}>
          {(REG_STATUS[regStatusOf(supplier)] || {}).label || "Registered"}
        </span>
        <span className={"chip " + (VERIFY_STATUS[verifyStatusOf(supplier)] || {}).tone}
              title={supplier.suspended ? supplier.suspendedReason : supplier.rejectedReason || undefined}
              style={{ marginLeft: 6 }}>
          {(VERIFY_STATUS[verifyStatusOf(supplier)] || {}).label || "Unverified"}
        </span>
      </div>

      {!supplier.prequalified && (
        <div className="notice" style={{ marginBottom: 16, borderLeft: supplier.rejectedReason ? "3px solid var(--wax)" : undefined }}>
          {supplier.rejectedReason
            ? <>The buyer reviewed your registration and needs more before prequalifying you: <b>{supplier.rejectedReason}</b>. Update your documents below and they will take another look.</>
            : <>Your registration is with the buyer's procurement team. You can already bid. Uploading your compliance documents below speeds their review up.</>}
        </div>
      )}

      {/* No data-reveal on this one. useReveal observes what is in the document
          when it runs, and this card mounts later, when /auctions/mine/ comes
          back - so it would never be observed, never get .seen, and sit at
          opacity 0 for ever. It was doing exactly that. */}
      {aucs.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="chead"><h3>Auctions you can bid in</h3>
            <span className="mono faint" style={{ marginLeft: "auto" }}>prices move live</span>
          </div>
          <Rows>
            {aucs.map((a) => {
              const lot = (a.lots || [])[0];
              return (
                <Row key={a.id}
                     title={a.title}
                     meta={<>{a.ref}{lot && lot.ceiling ? <> &middot; ceiling {fmtCompact(lot.ceiling)}</> : null}
                       {a.disqualified ? <> &middot; you were removed</> : null}</>}
                     right={a.live
                       ? <LiveCountdown deadline={a.endsAt} />
                       : <span className="chip">{a.status === "awarded" ? "Awarded" : a.status === "scheduled" ? "Opens soon" : "Closed"}</span>}
                     onOpen={a.disqualified ? undefined : () => go({ page: "auction", id: a.id })} />
              );
            })}
          </Rows>
        </div>
      )}

      <div className="card" data-reveal style={{ marginBottom: 14 }}>
        <div className="chead"><h3>Tenders you can bid on</h3></div>
        <Rows empty={<Empty art="tray">Nothing to bid on right now. When a buyer invites you, it appears here with its closing date.</Empty>}>
          {invitations.map((t) => {
            const st = effStatus(t);
            const rnd = activeRound(t);
            const myBid = state.bids.find((b) => b.tenderId === t.id && b.supplierId === me
              && (rnd && rnd.id ? b.roundId === rnd.id : true));
            return (
              <Row key={t.id} title={t.title}
                   onOpen={st === "published" ? () => go({ page: "bidroom", id: t.id }) : undefined}
                   meta={<>
                     <span className="mono">{t.ref}</span>
                     <span>ceiling <Money n={t.budget} /></span>
                     {t.lines && t.lines.length > 0 && <span>{t.lines.length} priced lines</span>}
                     {(t.rounds || []).length > 1 && <span>round {t.currentRound} of {t.rounds.length}</span>}
                     {(t.addenda || []).length > 0 && <span>{(t.addenda || []).length} addendum</span>}
                     {(t.deadlineChanges || []).length > 0 && <span>deadline extended</span>}
                   </>}
                   right={<>
                     <Countdown t={t.deadline} />
                     {st === "paused" ? <span className="chip warn">Paused by the buyer</span>
                       : myBid ? <span className="chip ok">Sealed</span>
                       : st === "published" ? <span className="chip warn">Not started</span>
                       : <span className="chip">Closed</span>}
                     {st === "published" && <button className="btn sm pri" onClick={() => go({ page: "bidroom", id: t.id })}>{myBid ? "View receipt" : "Bid"}</button>}
                   </>} />
            );
          })}
        </Rows>
      </div>

      <More title="Outcomes" summary={outcomes.length ? `${wins.length} won · ${losses} not successful · ${outcomes.filter((t) => t.status === "evaluation").length} being evaluated` : "nothing decided yet"}>
        <Rows empty={<Empty>Nothing decided yet. Awards and outcomes for your bids land here.</Empty>}>
          {outcomes.map((t) => {
            const letter = t.letters && t.letters[me];
            const won = t.status === "awarded" && t.awardedTo === me;
            const lost = t.status === "awarded" && t.awardedTo !== me;
            return (
              <Row key={t.id} title={t.title} meta={<span className="mono">{t.ref}</span>}
                   right={<>
                     {t.status === "evaluation" && <span className="chip">Being evaluated</span>}
                     {won && <span className="chip gold">Awarded to you · {fmtCompact(t.awardedAmount)}</span>}
                     {lost && <span className="chip">Not successful</span>}
                     {letter && <button className="btn sm" onClick={() => setOpenL((o) => ({ ...o, [t.id]: !o[t.id] }))}>{openL[t.id] ? "Hide letter" : "Read the letter"}</button>}
                   </>}>
                {letter && openL[t.id] && <div className={"letter unfold" + (won ? " sheen" : "")} style={{ marginTop: 10 }}>{letter.text}</div>}
              </Row>
            );
          })}
        </Rows>
      </More>

      <More title="Your company, and the documents that keep you eligible"
            summary={`${supplier.category} · ${supplier.location} · ${myComplianceDocs.length || (supplier.docs || []).length} ${(myComplianceDocs.length || (supplier.docs || []).length) === 1 ? "document" : "documents"} on file`}>
        <div className="grid g2" style={{ marginBottom: 12 }}>
          <div className="frow"><label className="lbl">Company name</label>
            <input className="in" value={profileForm.name} onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })} /></div>
          <div className="frow"><label className="lbl">Category</label>
            <input className="in" value={profileForm.category} onChange={(e) => setProfileForm({ ...profileForm, category: e.target.value })} /></div>
          <div className="frow"><label className="lbl">Location</label>
            <input className="in" value={profileForm.location} onChange={(e) => setProfileForm({ ...profileForm, location: e.target.value })} /></div>
        </div>
        <div className="gaterow" style={{ marginBottom: 14 }}>
          <button className="btn" disabled={profileForm.name.trim().length < 2}
                  onClick={() => act.rename({ name: profileForm.name, category: profileForm.category, location: profileForm.location })}>Save details</button>
          {profileForm.name.trim().length < 2 && <span className="hint gatehint">The company name needs at least two characters.</span>}
        </div>
        {myComplianceDocs.map((x) => (
          <div className="docrow" key={x.id}>
            <button className="doclink" onClick={() => downloadDoc(x.id, x.name)}><Icon n="file" s={13} />{x.name}</button>
            {x.expiry ? <span className="hint" style={{ marginTop: 0 }}>expires {fmtDate(x.expiry)}</span> : null}
            <span style={{ flex: 1 }} />
            <button className="btn sm iconly" aria-label="Remove document" onClick={() => act.deleteMyDoc(x.id)}><Icon n="close" s={12} /></button>
          </div>
        ))}
        {myComplianceDocs.length === 0 && (supplier.docs || []).map((d, i) => (
          <div className="docrow" key={"seeded" + i}><span>{d.name}</span><span className="hint" style={{ marginTop: 0 }}>{d.expiry ? "expires " + fmtDate(d.expiry) : ""}</span></div>
        ))}
        <div className="formrow" style={{ marginTop: 10, alignItems: "center" }}>
          <input className="in" placeholder="What is this document? e.g. Tax clearance 2026"
                 value={docForm.label} onChange={(e) => setDocForm({ ...docForm, label: e.target.value })} />
          <input className="in" type="date" aria-label="Expiry date"
                 value={docForm.expiry} onChange={(e) => setDocForm({ ...docForm, expiry: e.target.value })} />
          <label className="btn sm"><Icon n="upload" s={14} />Upload<input type="file" hidden onChange={uploadCompliance} /></label>
        </div>
        <div className="hint">The buyer's procurement team sees these when reviewing your prequalification, and Docket reminds them before anything expires.</div>
      </More>
    </Page>
  );
}

export function BidRoom({ api, id }) {
  const { state, user, act, ai, go, toast } = api;
  const me = user.supplierId;
  const [form, setForm] = useState({ amount: "", decl: false });
  const [prices, setPrices] = useState({});
  const [acks, setAcks] = useState({});
  const [q, setQ] = useState("");
  const [aiFb, setAiFb] = useState("");
  const [busy, setBusy] = useState(false);
  const [askWithdraw, setAskWithdraw] = useState(false);
  const t = state.tenders.find((x) => x.id === id);
  if (!t) return <Empty>Tender not found.</Empty>;
  const st = effStatus(t);
  const rnd = activeRound(t);
  const rounds = roundsOf(t);
  /* Scoped to the open round: an event running a best-and-final has this
     vendor's first-round bid on file too, and that one is not the bid the room
     is asking them to make. */
  const myBid = state.bids.find((b) => b.tenderId === t.id && b.supplierId === me
    && (rnd && rnd.id ? b.roundId === rnd.id : true));
  const priorBids = state.bids.filter((b) => b.tenderId === t.id && b.supplierId === me
    && b !== myBid);
  const clar = state.clarifications.filter((c) => c.tenderId === t.id);
  const hasLines = t.lines && t.lines.length > 0;
  const addenda = t.addenda || [];

  const linesTotal = hasLines ? t.lines.reduce((s, l) => s + (Number(prices[l.id]) || 0) * l.qty, 0) : 0;
  const amountValid = hasLines ? t.lines.every((l) => Number(prices[l.id]) > 0) : Number(form.amount) > 0;
  const myDocs = (state.documents || []).filter((x) => x.kind === "bid" && x.tenderId === t.id);
  const tenderDocs = (state.documents || []).filter((x) => x.kind === "tender" && x.tenderId === t.id);
  const hasTechDoc = myDocs.some((x) => x.envelope === "technical");
  /* The same conditions the submit button is gated on, each able to name
     itself. The button used to be disabled behind a bare "62% complete" meter,
     which tells a vendor that something is missing and not what, on the one
     form in the product where getting it wrong means missing a deadline. */
  const steps = [
    { ok: amountValid, to: "sb-price",
      todo: hasLines ? "Price every line" : "Enter your bid amount",
      done: hasLines ? "Every line priced" : "Amount entered" },
    { ok: hasTechDoc, to: "sb-docs",
      todo: "Upload your technical proposal", done: "Technical proposal attached",
      note: "PDF, Office or image, up to 10 MB." },
    { ok: form.decl, to: "sb-decl",
      todo: "Sign the conflict-of-interest declaration", done: "Declaration signed" },
    ...addenda.map((a) => ({
      ok: !!acks[a.id], to: "sb-ack-" + a.id,
      todo: "Acknowledge " + a.title, done: "Acknowledged " + a.title,
      note: "The buyer changed the tender after it opened.",
    })),
  ];
  const outstanding = steps.filter((x) => !x.ok);
  const pct = Math.round(((steps.length - outstanding.length) / steps.length) * 100);
  /* Same reordering as the buyer's draft panel: what is left rises, what is
     done sinks, and the rows travel rather than blink. */
  const orderedSteps = [...outstanding, ...steps.filter((x) => x.ok)];
  const stepsRef = useRef(null);
  useFlip(stepsRef, orderedSteps.map((x) => x.to).join("|"));
  const shownPct = useCountUp(pct, DUR.ceremony, pct);
  const jumpTo = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.remove("jumped");
    void el.offsetWidth;
    el.classList.add("jumped");
    const f = el.matches("input,textarea") ? el : el.querySelector("input,textarea,button,label");
    if (f && f.focus) f.focus({ preventScroll: true });
  };
  const uploadDoc = (envelope) => (e) => {
    const f = e.target.files[0];
    if (f) act.upload(`/tenders/${t.id}/bid_docs/`, f, { envelope });
    e.target.value = "";
  };

  const submit = async () => {
    const ok = await act.submitBid(t.id, {
      amount: hasLines ? undefined : Number(form.amount),
      lines: hasLines ? Object.fromEntries(t.lines.map((l) => [l.id, Number(prices[l.id])])) : undefined,
      acks: addenda.map((a) => a.id).filter((aid) => acks[aid]),
    });
    if (ok) {
      cue.stamp();
      toast.ok("Bid sealed", "Encrypted at rest. The buyer sees only that a bid exists until the recorded opening.");
    }
  };
  const withdraw = async () => {
    /* Capture the figures before the bid goes: the server deletes it, and this
       is the only copy the client has to re-seal from. */
    const was = myBid ? { amount: myBid.amount, lines: { ...(myBid.lines || {}) } } : null;
    const acksWere = addenda.map((a) => a.id);
    const ok = await act.withdrawBid(t.id);
    setAiFb("");
    if (ok) {
      toast.undo("Sealed bid withdrawn", "Your documents are unlocked. Submit a replacement any time before the deadline.",
                 async () => {
                   const back = await act.submitBid(t.id, {
                     amount: hasLines ? undefined : was?.amount,
                     lines: hasLines ? was?.lines : undefined,
                     acks: acksWere,
                   });
                   if (back) {
                     cue.stamp();
                     toast.ok("Bid re-sealed at the same figures", "Same prices, same documents, a new receipt.");
                   }
                 });
    }
  };
  const ask = async () => {
    if (!q.trim()) return;
    const ok = await act.askClar(t.id, q.trim());
    if (ok) setQ("");
  };
  const reviewAI = async () => {
    setBusy(true); setAiFb("");
    try {
      const missing = [
        !hasTechDoc && "technical proposal not uploaded",
        !form.decl && "conflict declaration not signed",
        ...addenda.filter((a) => !acks[a.id]).map((a) => `"${a.title}" not acknowledged`),
      ].filter(Boolean);
      const out = await ai.bidReview(t.id, {
        amount: hasLines ? undefined : Number(form.amount) || 0,
        lines: hasLines ? prices : undefined,
        missing,
      });
      setAiFb(out || "No response, try again.");
    } catch (e) {
      setAiFb(e.message || "The review service is unreachable right now. Try again in a moment.");
    }
    setBusy(false);
  };

  return (
    <div style={{ maxWidth: 820 }}>
      <button className="btn sm" style={{ marginBottom: 14 }} onClick={() => go({ page: "portal" })}>← My invitations</button>
      <div className="pagehead" style={{ marginBottom: 14 }}>
        <div><div className="mono muted" style={{ marginBottom: 3 }}>
          {t.ref} · deadline {fmtDate(t.deadline)}
          {rounds.length > 1 && rnd ? ` · ${rnd.name}` : ""}
        </div><h1>{t.title}</h1></div>
        <div className="grow" /><Countdown t={t.deadline} />
      </div>

      {/* Everything the buyer changed that this vendor is owed. Stated before
          the scope, because a paused event or a moved deadline changes what
          they should do next and the scope does not. */}
      {st === "paused" && (
        <div className="notice wax" style={{ marginBottom: 14 }}>
          <b>This event is paused.</b> The buyer has suspended submissions. You will be told when it
          resumes, and nothing you have already sealed is affected.
        </div>
      )}
      {t.cancelledAt && (
        <div className="notice wax" style={{ marginBottom: 14 }}>
          <b>This event was cancelled on {fmtDate(t.cancelledAt)}.</b> {t.cancelReason}
          {" "}No award will be made. Any sealed bid you submitted was never opened.
        </div>
      )}
      {(t.deadlineChanges || []).length > 0 && st !== "cancelled" && (
        <div className="notice" style={{ marginBottom: 14 }}>
          <b>The deadline has moved.</b>{" "}
          {t.deadlineChanges.map((c, i) => (
            <span key={i}>{i > 0 ? ", then " : ""}{fmtDate(c.from)} → {fmtDate(c.to)}</span>
          ))}. Submissions now close {fmtDateTime(t.deadline)}.
        </div>
      )}
      {rounds.length > 1 && rnd && (
        <div className="notice" style={{ marginBottom: 14 }}>
          <b>{rnd.name} of {rounds.length}.</b> This is a fresh submission against the same scope —
          your earlier bid stands as the record of that round and is not replaced by this one.
          {rnd.instructions ? <div style={{ marginTop: 6 }}>{rnd.instructions}</div> : null}
          {priorBids.length > 0 && (
            <div style={{ marginTop: 6 }} className="muted">
              You submitted in {priorBids.length === 1 ? "the earlier round" : `${priorBids.length} earlier rounds`}.
            </div>
          )}
        </div>
      )}

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="chead"><h3>Scope of work</h3></div>
        <div className="cbody" style={{ fontSize: 13.5, lineHeight: 1.6 }}>{t.scope}</div>
      </div>

      {tenderDocs.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="chead"><h3>Tender documents</h3></div>
          <div className="cbody">
            {tenderDocs.map((x) => (
              <div className="docrow" key={x.id}>
                <button className="doclink" onClick={() => downloadDoc(x.id, x.name)}><Icon n="file" s={13} />{x.name}</button>
                <span className="mono faint">{Math.max(1, Math.round(x.size / 1024))} KB</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {addenda.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="chead"><h3>Addenda</h3><span className="mono faint" style={{ marginLeft: "auto" }}>changes to the tender after publication</span></div>
          <div className="cbody">
            {addenda.map((a) => (
              <div className="addm" key={a.id}>
                <b>{a.title}</b> <span className="mono faint">· {fmtDateTime(a.at)}</span>
                {a.note && <div className="muted" style={{ marginTop: 4, fontSize: 12.5 }}>{a.note}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {askWithdraw && (
        <ConfirmDialog title="Withdraw your sealed bid?" confirmLabel="Withdraw the bid" tone="wax"
                       onClose={() => setAskWithdraw(false)}
                       onConfirm={withdraw}>
          Your prices stay unread: nothing is revealed by withdrawing. Your documents unlock so you can
          swap them, and you can submit a replacement any time before the deadline.
          <b> The withdrawal is recorded in the audit trail under your company's name.</b>
        </ConfirmDialog>
      )}
      {myBid ? (
        <div>
          <div className="receipt" style={{ marginBottom: 14 }}>
            <SealMark s={26} className="stamped" />
            <h3 style={{ fontFamily: "Georgia,'Times New Roman',serif", margin: "10px 0 4px" }}>Bid sealed</h3>
            <p className="muted" style={{ margin: "0 0 12px", fontSize: 13 }}>
              Submitted {fmtDateTime(myBid.submittedAt)}. Your bid is cryptographically sealed: the buyer sees only that a bid exists.
              Contents are revealed to everyone at the recorded opening after the deadline.
            </p>
            <div className="mono" style={{ fontSize: 11, color: "var(--faint)" }}>
              RECEIPT <TypeOut text={myBid.id.toUpperCase()} /> · {t.ref}
            </div>
            {st === "published" && <div style={{ marginTop: 14 }}><button className="btn sm" onClick={() => setAskWithdraw(true)}>Withdraw & replace before deadline</button></div>}
          </div>
        </div>
      ) : st === "published" ? (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="chead"><h3>Your sealed bid</h3>
            <span className="hint" style={{ marginLeft: "auto", marginTop: 0 }}>
              {outstanding.length === 0 ? "ready to seal" : outstanding.length + " left"}
            </span>
          </div>
          <div className="cbody">
            {hasLines ? (
              <div className="frow" id="sb-price">
                <label className="lbl">Your rate for each line</label>
                <div className="hint" style={{ marginTop: 0, marginBottom: 8 }}>In naira, per unit, fixed for the contract term. The total works itself out below.</div>
                {t.lines.map((l) => (
                  /* .priceline stacks the line above its rate and running total
                     on a phone, and lays all three out in a row from 600px up */
                  <div key={l.id} className="priceline">
                    <div className="pdesc">{l.desc}<div className="mono faint" style={{ fontSize: 11 }}>{l.qty.toLocaleString()} × {l.unit}</div></div>
                    <input className="in" type="number" min="0" placeholder={"per " + l.unit} aria-label={"Unit rate for " + l.desc} value={prices[l.id] ?? ""} onChange={(e) => setPrices((p) => ({ ...p, [l.id]: e.target.value }))} />
                    <div className="money ptotal">{prices[l.id] ? fmtMoney(Number(prices[l.id]) * l.qty) : "-"}</div>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, borderTop: "1px solid var(--line)", paddingTop: 10, alignItems: "baseline" }}>
                  <span className="lbl" style={{ margin: 0 }}>Total bid</span>
                  <span className="money" style={{ fontWeight: 600, fontSize: 16 }}>{fmtMoney(linesTotal)}</span>
                </div>
              </div>
            ) : (
              <div className="frow">
                <label className="lbl" htmlFor="bid-amt">Your total bid</label>
                <div className="hint" style={{ marginTop: 0, marginBottom: 6 }}>In naira. This is the figure that gets sealed.</div>
                <input id="bid-amt" className="in" type="number" min="0" placeholder="e.g. 540000000" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </div>
            )}
            <div className="frow">
              <label className="lbl">Submission documents</label>
              {myDocs.map((x) => (
                <div className="docrow" key={x.id}>
                  <span className="chip" style={{ textTransform: "capitalize" }}>{x.envelope}</span>
                  <button className="doclink" onClick={() => downloadDoc(x.id, x.name)}><Icon n="file" s={13} />{x.name}</button>
                  <span className="mono faint">{Math.max(1, Math.round(x.size / 1024))} KB</span>
                  <span style={{ flex: 1 }} />
                  <button className="btn sm iconly" aria-label="Remove document" onClick={() => act.deleteDoc(x.id)}><Icon n="close" s={12} /></button>
                </div>
              ))}
              <div id="sb-docs" style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <label className="btn sm">
                  {hasTechDoc ? "Add technical document" : "Upload technical proposal (required)"}
                  <input type="file" hidden onChange={uploadDoc("technical")} />
                </label>
                <label className="btn sm">
                  Add commercial document (optional)
                  <input type="file" hidden onChange={uploadDoc("commercial")} />
                </label>
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>PDF, Office or image files up to 10 MB. Documents are sealed with your bid and cannot be seen by the buyer until the recorded opening.</div>
            </div>
            <div className="frow" id="sb-decl">
              <label className="lbl">Declaration</label>
              <label style={{ display: "flex", gap: 9, alignItems: "center", padding: "6px 0", fontSize: 13, cursor: "pointer" }}>
                <input type="checkbox" checked={form.decl} onChange={(e) => setForm({ ...form, decl: e.target.checked })} />
                No conflict of interest, signed electronically in my name
              </label>
              {addenda.map((a) => (
                <label key={a.id} id={"sb-ack-" + a.id} style={{ display: "flex", gap: 9, alignItems: "center", padding: "6px 0", fontSize: 13, cursor: "pointer" }}>
                  <input type="checkbox" checked={!!acks[a.id]} onChange={(e) => setAcks((x) => ({ ...x, [a.id]: e.target.checked }))} />
                  I have read and priced for <b style={{ margin: "0 4px" }}>{a.title}</b>
                </label>
              ))}
            </div>
            {aiFb && <div className="aihint" style={{ marginBottom: 12 }}>{aiFb}</div>}
            <div className={"ready bidready" + (outstanding.length ? "" : " done")} aria-live="polite">
              <div className="readytop">
                <div className="readyhl">
                  {outstanding.length === 0 ? "Ready to seal"
                    : outstanding.length === 1 ? "One thing left"
                    : outstanding.length + " things left"}
                </div>
                <div className="readywhy">
                  {outstanding.length === 0
                    ? "Sealing encrypts your prices and documents until the recorded opening."
                    : "Pick any line to jump straight to it."}
                </div>
                <div className="readybarrow">
                  <div className="readybar"><i style={{ width: pct + "%" }} /></div>
                  <span className="readypct">{shownPct}%</span>
                </div>
              </div>
              <ul className="readylist" ref={stepsRef}>
                {orderedSteps.map((x) => (
                  <li key={x.to} data-flip={x.to} className={x.ok ? "ok" : "todo"}>
                    <button type="button" tabIndex={x.ok ? -1 : 0}
                            onClick={() => { if (!x.ok) jumpTo(x.to); }}>
                      <span className="readytick" aria-hidden="true"><Icon n="check" s={11} /></span>
                      <span>{x.ok ? x.done : x.todo}{!x.ok && x.note && <em>{x.note}</em>}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn wax" disabled={pct < 100} onClick={submit}><Icon n="stamp" s={15} />Seal & submit bid</button>
              <button className="btn" onClick={reviewAI} disabled={busy}>{busy ? "Reviewing…" : "Review my bid with AI"}</button>
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Once sealed, the buyer cannot see your prices until the recorded opening. You can withdraw and replace your bid any time before the deadline. The AI review is advisory and stays on your side of the wall.</div>
          </div>
        </div>
      ) : (
        <div className="notice" style={{ marginBottom: 14 }}>
          {st === "paused" ? "This event is paused: no submissions are being taken until the buyer resumes it."
            : st === "cancelled" ? "This event was cancelled: no submissions are being taken."
            : "The deadline has passed: no further bids can be submitted."}
        </div>
      )}

      <div className="card">
        <div className="chead"><h3>Clarifications</h3><span className="mono faint" style={{ marginLeft: "auto" }}>answers are published to all invited suppliers</span></div>
        <div className="cbody">
          {clar.map((c) => (
            <div className="qa" key={c.id}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>{c.q}</div>
              {c.a
                ? <div style={{ borderLeft: "3px solid var(--green)", paddingLeft: 10, fontSize: 13 }}>{c.a}</div>
                : <span className="chip warn">Awaiting buyer's answer</span>}
            </div>
          ))}
          {st === "published" && (
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <input className="in" placeholder="Ask the buyer a question…" aria-label="Ask a clarification" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()} />
              <button className="btn" onClick={ask} disabled={!q.trim()}><Icon n="question" s={14} />Ask</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


const POLL_LIVE_MS = 2500;   // a live auction is a market, so poll like one
const POLL_IDLE_MS = 10000;

/* THE BIDDER'S ROOM.

   Rewritten onto /api/auctions/. It used to look its auction up in
   state.tenders and poll /tenders/<id>/auction/, and both of those stopped
   existing when auctions left tenders - as did `usePrev` and `cue`, which this
   function called without ever importing. It could not have run.

   WHAT THE SERVER DECIDES. `toLead` is the price that would take the lead, and
   it is computed on the server on purpose: in rank mode the browser is never
   told the standing best, so it cannot work that number out for itself. Every
   quick-bid button below is built from it rather than from arithmetic here. */
export function AuctionRoom({ api, id }) {
  const { go, toast } = api;
  const [a, setA] = useState(null);
  const [amount, setAmount] = useState("");
  const [msg, setMsg] = useState("");
  const [extended, setExtended] = useState(0);
  const [placing, setPlacing] = useState(false);

  const lot = ((a && a.lots) || [])[0] || null;
  const st = (((a && a.lotState) || []).find((x) => lot && x.lotId === lot.id)) || {};
  const prevRank = usePrev(st.myRank == null ? null : st.myRank);
  const prevMovements = usePrev(st.movements || 0);
  const prevEnds = useRef(null);
  const live = a ? a.live : null;

  useEffect(() => {
    let stop = false;
    const poll = async () => {
      try {
        const next = await raw(`/auctions/${id}/room/`);
        if (stop) return;
        if (prevEnds.current && next.endsAt > prevEnds.current + 1000 && next.live) {
          setExtended(next.endsAt);
          toast.info("Close extended", "A bid landed inside the closing window, so anti-sniping pushed the deadline out.");
        }
        prevEnds.current = next.endsAt;
        setA(next);
      } catch (e) { /* keep the last known room rather than blanking it */ }
    };
    poll();
    const h = setInterval(poll, live === false ? POLL_IDLE_MS : POLL_LIVE_MS);
    return () => { stop = true; clearInterval(h); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, live]);

  /* Overtaken or back in front, announced in words, with a glyph, and only
     then in colour (see the CVD note in ui.jsx). */
  useEffect(() => {
    if (prevRank == null || st.myRank == null || prevRank === st.myRank) return;
    if (st.myRank > prevRank) {
      cue.outbid();
      toast.warn(`▼ Outbid, now position ${st.myRank}`,
                 `You held position ${prevRank}. ${st.toLead ? `Bid ${fmtCompact(st.toLead)} or less to take the lead back.` : ""}`);
    } else {
      cue.lead();
      toast.ok(`▲ Position ${st.myRank}${st.myRank === 1 ? ", you lead" : ""}`, `Up from position ${prevRank}.`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.myRank]);

  if (!a) return <Empty art="chart">Opening the room&hellip;</Empty>;
  if (a.disqualified) {
    return (
      <div>
        <button className="btn sm" onClick={() => go({ page: "portal" })} style={{ marginBottom: 16 }}>&larr; All invitations</button>
        <Empty art="sealed">You were removed from this auction{a.disqualifiedReason ? `: ${a.disqualifiedReason}` : "."}</Empty>
      </div>
    );
  }

  const myBids = st.myBids || [];
  const myLast = myBids.length ? myBids[myBids.length - 1] : null;
  const leading = !!st.leading;
  const stateColor = st.myRank ? (leading ? "var(--green)" : "var(--wax)") : "var(--muted)";
  const roomMoved = (st.movements || 0) > (prevMovements || 0);
  const ceiling = lot ? lot.ceiling : null;
  const step = lot ? lot.minDecrement : 0;

  /* Built from the server's own toLead, because in rank mode the browser is
     never told the standing best and cannot work it out.

     toLead is absent in two opposite situations and they need opposite
     ladders. If nobody has bid, the ceiling is the opening price. If the
     bidder is ALREADY LEADING there is nobody to beat, and offering the
     ceiling then would hand the leader a ladder of prices worse than their own
     bid - every rung of it rejected by the server. They improve on themselves
     instead, a step at a time. */
  const from = st.toLead || (myLast ? myLast.amount - step : ceiling);
  const quick = (from ? [from, from - step, from - step * 3] : [])
    .filter((v) => v && v > 0);

  const place = async () => {
    setMsg("");
    setPlacing(true);
    try {
      const r = await raw(`/auctions/${a.id}/lots/${lot.id}/bid/`, {
        method: "POST", body: { amount: Number(amount) },
      });
      setAmount("");
      cue.tick();
      if (r.extended) {
        setExtended(r.endsAt);
        toast.info("Your bid extended the close", "Bids inside the closing window push the deadline out, so nobody can snipe this auction.");
      }
      toast.ok(r.myRank === 1 ? "▲ Bid placed, you lead" : `Bid placed, position ${r.myRank}`,
               "Binding until someone undercuts you.");
      prevEnds.current = r.endsAt;
    } catch (e) {
      setMsg(e.message);
      toast.warn("Bid rejected", e.message);
    }
    setPlacing(false);
  };

  const accept = async () => {
    try {
      await raw(`/auctions/${a.id}/accept/`, { method: "POST", body: {} });
      toast.ok("Terms accepted", "You can bid now.");
    } catch (e) { toast.warn("Could not accept the terms", e.message); }
  };

  const needsAccept = a.requireAcceptance && !a.accepted;

  return (
    <div>
      <button className="btn sm" onClick={() => go({ page: "portal" })} style={{ marginBottom: 16 }}>&larr; All invitations</button>
      <div className="pagehead">
        <div>
          <div className="mono muted" style={{ marginBottom: 3 }}>{a.ref} &middot; REVERSE AUCTION</div>
          <h1>{a.title}</h1>
        </div>
        <div className="grow" />
        {extended === a.endsAt && live && <span className="extbadge">anti-snipe</span>}
        {live ? <LiveCountdown deadline={a.endsAt} />
              : <span className="chip">{a.status === "awarded" ? "Awarded" : "Auction closed"}</span>}
      </div>

      {needsAccept && (
        <div className="notice" style={{ marginBottom: 14 }}>
          You have to accept this auction&rsquo;s terms before you can bid.{" "}
          <button className="btn sm pri" style={{ marginLeft: 8 }} onClick={accept}>Accept the terms</button>
        </div>
      )}

      <div className="grid2" style={{ alignItems: "start" }}>
        <div>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="chead"><h3>Where you stand</h3>
              <span className="mono faint" style={{ marginLeft: "auto" }}>
                {a.visibility === "rank" ? "rank only, competitor prices are never shown"
                  : a.visibility === "price" ? "rank and the standing best" : "blind, no rank shown"}
              </span>
            </div>
            <div className="cbody" style={{ textAlign: "center", padding: "20px 18px" }}>
              {st.myRank
                ? <>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                      <span aria-hidden="true" style={{ fontSize: 19, color: stateColor, fontWeight: 700 }}>{leading ? "▲" : "▼"}</span>
                      <RollNumber value={st.myRank} size={54} color={stateColor} />
                    </div>
                    <div style={{ marginTop: 6, fontSize: 13, fontWeight: leading ? 600 : 400, color: leading ? "var(--green)" : "var(--ink)" }}>
                      {leading ? "You hold the leading price" : "You are being outbid"}
                    </div>
                    <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                      {st.bidders ? `of ${st.bidders} bidder${st.bidders === 1 ? "" : "s"} · ` : ""}
                      your price <Money n={myLast ? myLast.amount : null} />
                      {st.best ? <> &middot; best <Money n={st.best} /></> : null}
                    </div>
                  </>
                : <div className="muted" style={{ fontSize: 13.5 }}>
                    No bid placed yet.{st.bidders ? ` ${st.bidders} bidder(s) are already in.` : ""}
                    {ceiling ? <> Your opening bid must be at or under the <b><Money n={ceiling} /></b> ceiling.</> : null}
                  </div>}
            </div>
          </div>

          {live && !needsAccept && lot && (
            <div className="card" style={{ marginBottom: 14 }}>
              <div className="chead"><h3>Place a bid</h3>
                <span className={"mono faint" + (roomMoved ? " tickbump" : "")} style={{ marginLeft: "auto" }}>
                  {st.movements || 0} movement{st.movements === 1 ? "" : "s"} in the room
                </span>
              </div>
              <div className="cbody">
                <div className="frow" style={{ marginBottom: 9 }}>
                  <label className="lbl" htmlFor="auc-amt">Your price</label>
                  <div className="hint" style={{ marginTop: 0, marginBottom: 6 }}>
                    In naira.{st.toLead
                      ? <> It has to come in at or under <Money n={st.toLead} /> to take the lead.</>
                      : leading ? <> You already lead. A new bid has to beat your own by at least <Money n={step} />.</>
                      : null}
                  </div>
                  <input id="auc-amt" className="in" type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
                         onKeyDown={(e) => e.key === "Enter" && Number(amount) && place()}
                         placeholder={String(from || "")} />
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 11 }}>
                  {quick.map((v, i) => (
                    <button key={i} className="btn sm" onClick={() => setAmount(String(v))}
                            title={i === 0 && st.toLead ? "Take the lead" : "Bid this price"}>
                      {i === 0 ? (st.toLead ? "take the lead · " : leading ? "improve on yours · " : "") : ""}{fmtCompact(v)}
                    </button>
                  ))}
                </div>
                {myLast && <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
                  Your current bid: <Money n={myLast.amount} /> &middot; minimum decrement <Money n={step} />
                </div>}
                {st.myLimit && <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
                  Standing limit: keep me leading down to <Money n={st.myLimit} />.
                </div>}
                {msg && <div className="notice" style={{ borderLeft: "3px solid var(--wax)", marginBottom: 10 }}>{msg}</div>}
                <button className="btn pri" onClick={place} disabled={!Number(amount) || placing}>{placing ? "Placing…" : "Place bid"}</button>
                <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>Bids are binding. A bid inside the closing window extends the close.</div>
              </div>
            </div>
          )}
          {!live && (
            <div className="notice" style={{ marginBottom: 14 }}>
              The auction has closed. The buyer settles the standings, any award follows the standard approval flow, and you&rsquo;ll be notified either way.
            </div>
          )}
        </div>

        <div className="card">
          <div className="chead"><h3>How your price has moved</h3>
            <span className="mono faint" style={{ marginLeft: "auto" }}>yours only, never a competitor&rsquo;s</span>
          </div>
          <div className="cbody" style={{ paddingTop: 12 }}>
            {myBids.length > 0 && (
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
                <Sparkline points={myBids.map((b) => ({ value: b.amount, at: b.at }))} w={260} h={52}
                           color={stateColor}
                           label={`Your ${myBids.length} price movement(s), latest ${fmtMoney(myLast.amount)}`} />
              </div>
            )}
            {myBids.slice().reverse().map((b, i) => (
              <div className="rowline" key={i}>
                <span className="mono muted" style={{ fontSize: 12 }}>{fmtDateTime(b.at)}</span>
                <span style={{ flex: 1 }} />
                {i === 0 && <span className="chip ok" style={{ fontSize: 10.5 }}>current</span>}
                <Money n={b.amount} strong={i === 0} />
              </div>
            ))}
            {!myBids.length && <span className="muted" style={{ fontSize: 13 }}>Nothing yet.</span>}
          </div>
        </div>
      </div>

      {a.scope && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="chead"><h3>Scope</h3></div>
          <div className="cbody" style={{ fontSize: 13.5, lineHeight: 1.6 }}>{a.scope}</div>
        </div>
      )}
    </div>
  );
}
