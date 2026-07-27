import React, { useEffect, useRef, useState } from "react";

import { downloadDoc, raw } from "./api";
import { Countdown, Empty, Money, Stat } from "./atoms";
import { effStatus, fmtCompact, fmtDate, fmtDateTime, fmtMoney } from "./helpers";
import { Icon, SealMark } from "./icons";
import { cue, usePrev } from "./motion";
import { ConfirmDialog, LiveCountdown, RollNumber, Sparkline } from "./ui";

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
  const invitations = state.tenders.filter((t) => t.invited.includes(me) && ["published", "closed"].includes(effStatus(t)));
  const outcomes = state.tenders.filter((t) => t.invited.includes(me) && ["evaluation", "awarded"].includes(t.status) && state.bids.some((b) => b.tenderId === t.id && b.supplierId === me));

  return (
    <div>
      <div className="pagehead">
        <div><div className="mono muted" style={{ marginBottom: 3 }}>SUPPLIER PORTAL</div><h1>{supplier.name}</h1></div>
        <div className="grow" />
        {supplier.prequalified
          ? <span className="chip ok">Prequalified supplier</span>
          : <span className="chip warn">Prequalification pending</span>}
      </div>

      {!supplier.prequalified && (
        <div className="notice" style={{ marginBottom: 16, borderLeft: supplier.rejectedReason ? "3px solid var(--wax)" : undefined }}>
          {supplier.rejectedReason
            ? <>The buyer reviewed your registration and needs more before prequalifying you: <b>{supplier.rejectedReason}</b> — update your compliance documents below and they'll take another look.</>
            : <>Your registration is with the buyer's procurement team. Upload your compliance documents below — tax clearance, certifications, insurance — to speed the review up. You'll be notified of the outcome.</>}
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="chead"><h3>Company profile & compliance documents</h3>
          <span className="mono faint" style={{ marginLeft: "auto" }}>{supplier.category} · {supplier.location}</span></div>
        <div className="cbody">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", borderBottom: "1px dashed var(--line)", paddingBottom: 12, marginBottom: 10 }}>
            <div className="frow" style={{ flex: 2, minWidth: 200, marginBottom: 0 }}>
              <label className="lbl">Company name</label>
              <input className="in" value={profileForm.name} onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })} />
            </div>
            <div className="frow" style={{ flex: 1, minWidth: 130, marginBottom: 0 }}>
              <label className="lbl">Category</label>
              <input className="in" value={profileForm.category} onChange={(e) => setProfileForm({ ...profileForm, category: e.target.value })} />
            </div>
            <div className="frow" style={{ flex: 1, minWidth: 120, marginBottom: 0 }}>
              <label className="lbl">Location</label>
              <input className="in" value={profileForm.location} onChange={(e) => setProfileForm({ ...profileForm, location: e.target.value })} />
            </div>
            <button className="btn" disabled={profileForm.name.trim().length < 2}
                    onClick={() => act.rename({ name: profileForm.name, category: profileForm.category, location: profileForm.location })}>Save</button>
          </div>
          {myComplianceDocs.map((x) => (
            <div className="docrow" key={x.id}>
              <button className="doclink" onClick={() => downloadDoc(x.id, x.name)}><Icon n="file" s={13} />{x.name}</button>
              {x.expiry ? <span className="mono faint">expires {fmtDate(x.expiry)}</span> : null}
              <span style={{ flex: 1 }} />
              <button className="btn sm iconly" aria-label="Remove document" onClick={() => act.deleteMyDoc(x.id)}><Icon n="close" s={12} /></button>
            </div>
          ))}
          {myComplianceDocs.length === 0 && (supplier.docs || []).map((d, i) => (
            <div className="docrow" key={"seeded" + i}><span>{d.name}</span><span className="mono faint">{d.expiry ? "expires " + fmtDate(d.expiry) : ""}</span></div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
            <input className="in" style={{ maxWidth: 220 }} placeholder="Document name (e.g. Tax clearance 2026)"
                   value={docForm.label} onChange={(e) => setDocForm({ ...docForm, label: e.target.value })} />
            <input className="in" style={{ maxWidth: 160 }} type="date" aria-label="Expiry date"
                   value={docForm.expiry} onChange={(e) => setDocForm({ ...docForm, expiry: e.target.value })} />
            <label className="btn sm"><Icon n="upload" s={14} />Upload document<input type="file" hidden onChange={uploadCompliance} /></label>
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>The buyer's procurement team sees these when reviewing your prequalification, and DOCKET reminds them before anything expires.</div>
        </div>
      </div>

      {(() => {
        const invited = state.tenders.filter((t) => t.invited.includes(me));
        const bidsMade = state.bids.filter((b) => b.supplierId === me);
        const wins = state.tenders.filter((t) => t.awardedTo === me);
        const decided = state.tenders.filter((t) => t.status === "awarded" && bidsMade.some((b) => b.tenderId === t.id));
        const losses = decided.length - wins.length;
        const value = wins.reduce((s2, t) => s2 + (t.awardedAmount || 0), 0);
        return (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="chead"><h3>Your record here</h3><span className="mono faint" style={{ marginLeft: "auto" }}>with {state.org.name}</span></div>
            <div className="cbody" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
              <Stat k="Invitations" v={invited.length} />
              <Stat k="Bids submitted" v={bidsMade.length} />
              <Stat k="Won" v={wins.length} />
              <Stat k="Lost" v={losses} />
              <Stat k="Win rate" v={decided.length ? Math.round((wins.length / decided.length) * 100) + "%" : "—"} />
              <Stat k="Awarded value" v={fmtCompact(value)} />
            </div>
          </div>
        );
      })()}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="chead"><h3>Open invitations</h3></div>
        <div className="cbody" style={{ paddingTop: 6 }}>
          {invitations.map((t) => {
            const st = effStatus(t);
            const myBid = state.bids.find((b) => b.tenderId === t.id && b.supplierId === me);
            return (
              <div className="rowline" key={t.id}>
                <div style={{ flex: 1 }}>
                  <b>{t.title}</b>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {t.ref} · budget ceiling <Money n={t.budget} />
                    {t.lines && t.lines.length > 0 ? ` · ${t.lines.length} priced lines` : ""}
                    {(t.addenda || []).length > 0 ? ` · ${(t.addenda || []).length} addendum issued` : ""}
                  </div>
                </div>
                {myBid ? <span className="chip ok">Submitted & sealed</span> : st === "published" ? <span className="chip warn">Not started</span> : <span className="chip">Deadline passed</span>}
                <Countdown t={t.deadline} />
                {st === "published" && <button className="btn sm pri" onClick={() => go({ page: "bidroom", id: t.id })}>{myBid ? "View receipt" : "Enter bid room"}</button>}
              </div>
            );
          })}
          {!invitations.length && <Empty>No open invitations right now.</Empty>}
        </div>
      </div>

      <div className="card">
        <div className="chead"><h3>Outcomes</h3></div>
        <div className="cbody" style={{ paddingTop: 6 }}>
          {outcomes.map((t) => {
            const letter = t.letters && t.letters[me];
            const won = t.status === "awarded" && t.awardedTo === me;
            const lost = t.status === "awarded" && t.awardedTo !== me;
            return (
              <div key={t.id} style={{ borderBottom: "1px solid var(--line)", padding: "10px 0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1 }}><b>{t.title}</b><div className="muted" style={{ fontSize: 12 }}>{t.ref}</div></div>
                  {t.status === "evaluation" && <span className="chip">Under evaluation</span>}
                  {won && <span className="chip gold">Awarded to you · {fmtCompact(t.awardedAmount)}</span>}
                  {lost && <span className="chip">Not successful</span>}
                  {letter && <button className="btn sm" onClick={() => setOpenL((o) => ({ ...o, [t.id]: !o[t.id] }))}>{openL[t.id] ? "Hide letter" : "View letter"}</button>}
                </div>
                {letter && openL[t.id] && <div className="letter">{letter.text}</div>}
              </div>
            );
          })}
          {!outcomes.length && <Empty>Nothing decided yet.</Empty>}
        </div>
      </div>
    </div>
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
  const myBid = state.bids.find((b) => b.tenderId === t.id && b.supplierId === me);
  const clar = state.clarifications.filter((c) => c.tenderId === t.id);
  const hasLines = t.lines && t.lines.length > 0;
  const addenda = t.addenda || [];

  const linesTotal = hasLines ? t.lines.reduce((s, l) => s + (Number(prices[l.id]) || 0) * l.qty, 0) : 0;
  const amountValid = hasLines ? t.lines.every((l) => Number(prices[l.id]) > 0) : Number(form.amount) > 0;
  const myDocs = (state.documents || []).filter((x) => x.kind === "bid" && x.tenderId === t.id);
  const tenderDocs = (state.documents || []).filter((x) => x.kind === "tender" && x.tenderId === t.id);
  const hasTechDoc = myDocs.some((x) => x.envelope === "technical");
  const steps = [amountValid, hasTechDoc, form.decl, ...addenda.map((a) => !!acks[a.id])];
  const pct = Math.round((steps.filter(Boolean).length / steps.length) * 100);
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
    const ok = await act.withdrawBid(t.id);
    setAiFb("");
    if (ok) toast.ok("Sealed bid withdrawn", "Your documents are unlocked. Submit a replacement any time before the deadline.");
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
      setAiFb(out || "No response — try again.");
    } catch (e) {
      setAiFb(e.message || "The review service is unreachable right now. Try again in a moment.");
    }
    setBusy(false);
  };

  return (
    <div style={{ maxWidth: 820 }}>
      <button className="btn sm" style={{ marginBottom: 14 }} onClick={() => go({ page: "portal" })}>← My invitations</button>
      <div className="pagehead" style={{ marginBottom: 14 }}>
        <div><div className="mono muted" style={{ marginBottom: 3 }}>{t.ref} · deadline {fmtDate(t.deadline)}</div><h1>{t.title}</h1></div>
        <div className="grow" /><Countdown t={t.deadline} />
      </div>

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
          Your prices stay unread — nothing is revealed by withdrawing. Your documents unlock so you can
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
              Submitted {fmtDateTime(myBid.submittedAt)}. Your bid is cryptographically sealed — the buyer sees only that a bid exists.
              Contents are revealed to everyone at the recorded opening after the deadline.
            </p>
            <div className="mono" style={{ fontSize: 11, color: "var(--faint)" }}>RECEIPT {myBid.id.toUpperCase()} · {t.ref}</div>
            {st === "published" && <div style={{ marginTop: 14 }}><button className="btn sm" onClick={() => setAskWithdraw(true)}>Withdraw & replace before deadline</button></div>}
          </div>
        </div>
      ) : st === "published" ? (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="chead"><h3>Your sealed bid</h3>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
              <span className="mono faint" style={{ fontSize: 11 }}>{pct}% complete</span>
              <div className="meter" style={{ width: 110 }}><div style={{ width: pct + "%" }} /></div>
            </div>
          </div>
          <div className="cbody">
            {hasLines ? (
              <div className="frow">
                <label className="lbl">Unit rates (₦, fixed for the term)</label>
                {t.lines.map((l) => (
                  <div key={l.id} style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
                    <div style={{ flex: 1, fontSize: 13 }}>{l.desc}<div className="mono faint" style={{ fontSize: 11 }}>{l.qty.toLocaleString()} × {l.unit}</div></div>
                    <input className="in" style={{ width: 150 }} type="number" min="0" placeholder={"per " + l.unit} aria-label={"Unit rate for " + l.desc} value={prices[l.id] ?? ""} onChange={(e) => setPrices((p) => ({ ...p, [l.id]: e.target.value }))} />
                    <div className="money" style={{ width: 130, textAlign: "right", fontSize: 12.5, color: "var(--muted)" }}>{prices[l.id] ? fmtMoney(Number(prices[l.id]) * l.qty) : "—"}</div>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, borderTop: "1px solid var(--line)", paddingTop: 10, alignItems: "baseline" }}>
                  <span className="lbl" style={{ margin: 0 }}>Total bid</span>
                  <span className="money" style={{ fontWeight: 600, fontSize: 16 }}>{fmtMoney(linesTotal)}</span>
                </div>
              </div>
            ) : (
              <div className="frow">
                <label className="lbl" htmlFor="bid-amt">Total bid amount (₦)</label>
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
              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
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
            <div className="frow">
              <label className="lbl">Declaration</label>
              <label style={{ display: "flex", gap: 9, alignItems: "center", padding: "6px 0", fontSize: 13, cursor: "pointer" }}>
                <input type="checkbox" checked={form.decl} onChange={(e) => setForm({ ...form, decl: e.target.checked })} />
                No conflict of interest — signed electronically in my name
              </label>
              {addenda.map((a) => (
                <label key={a.id} style={{ display: "flex", gap: 9, alignItems: "center", padding: "6px 0", fontSize: 13, cursor: "pointer" }}>
                  <input type="checkbox" checked={!!acks[a.id]} onChange={(e) => setAcks((x) => ({ ...x, [a.id]: e.target.checked }))} />
                  I have read and priced for <b style={{ margin: "0 4px" }}>{a.title}</b>
                </label>
              ))}
            </div>
            {aiFb && <div className="aihint" style={{ marginBottom: 12 }}>{aiFb}</div>}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn wax" disabled={pct < 100} onClick={submit}><Icon n="stamp" s={15} />Seal & submit bid</button>
              <button className="btn" onClick={reviewAI} disabled={busy}>{busy ? "Reviewing…" : "Review my bid with AI"}</button>
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Once sealed, the buyer cannot see your prices until the recorded opening. You can withdraw and replace your bid any time before the deadline. The AI review is advisory and stays on your side of the wall.</div>
          </div>
        </div>
      ) : (
        <div className="notice" style={{ marginBottom: 14 }}>The deadline has passed — no further bids can be submitted.</div>
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


const POLL_LIVE_MS = 2500;   // a live auction is a market — poll like one
const POLL_IDLE_MS = 10000;

export function AuctionRoom({ api, id }) {
  const { state, user, go, toast } = api;
  const t = state.tenders.find((x) => x.id === id);
  const [a, setA] = useState(null);
  const [amount, setAmount] = useState("");
  const [msg, setMsg] = useState("");
  const [extended, setExtended] = useState(0);
  const [placing, setPlacing] = useState(false);
  const prevRank = usePrev(a?.myRank ?? null);
  const prevMovements = usePrev(a?.movements ?? 0);
  const prevDeadline = useRef(null);

  const poll = async () => {
    try {
      const next = await raw(`/tenders/${id}/auction/`);
      // the buyer never sees this, but the supplier should feel the room move
      if (prevDeadline.current && next.deadline > prevDeadline.current + 1000 && next.live) {
        setExtended(next.deadline);
        toast.info("Close extended by two minutes", "A bid landed inside the final two minutes — anti-sniping pushed the deadline out.");
      }
      prevDeadline.current = next.deadline;
      setA(next);
    } catch (e) { /* keep the last known state rather than blanking the room */ }
  };
  useEffect(() => {
    poll();
    const h = setInterval(poll, a?.live === false ? POLL_IDLE_MS : POLL_LIVE_MS);
    return () => clearInterval(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, a?.live]);

  /* Overtaken or back in front — announced in words, with a glyph, and only
     then in colour (see the CVD note in ui.jsx). */
  useEffect(() => {
    if (prevRank == null || a?.myRank == null || prevRank === a.myRank) return;
    if (a.myRank > prevRank) {
      cue.outbid();
      toast.warn(`▼ Outbid — now position ${a.myRank}`, `You held position ${prevRank}. Undercut your own price by at least ${fmtCompact(a.minDecrement)} to take the lead back.`);
    } else {
      cue.lead();
      toast.ok(`▲ Position ${a.myRank}${a.myRank === 1 ? " — you lead" : ""}`, `Up from position ${prevRank}.`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a?.myRank]);

  if (!t) return null;
  const myBids = a?.myBids || [];
  const myLast = myBids.length ? myBids[myBids.length - 1] : null;
  const floor = myLast ? myLast.amount - (a?.minDecrement || 0) : (a?.ceiling || t.budget);
  const leading = !!a?.leading;
  const stateColor = a?.myRank ? (leading ? "var(--green)" : "var(--wax)") : "var(--muted)";
  const roomMoved = (a?.movements ?? 0) > (prevMovements ?? 0);
  const quick = myLast
    ? [floor, floor - (a?.minDecrement || 0), floor - (a?.minDecrement || 0) * 3].filter((v) => v > 0)
    : [a?.ceiling ?? t.budget, Math.round((a?.ceiling ?? t.budget) * 0.97), Math.round((a?.ceiling ?? t.budget) * 0.94)];

  const place = async () => {
    setMsg("");
    setPlacing(true);
    try {
      const r = await raw(`/tenders/${id}/auction/bids/`, { method: "POST", body: { amount: Number(amount) } });
      setAmount("");
      cue.tick();
      if (r.extended) {
        setExtended(r.deadline);
        toast.info("Your bid extended the close by two minutes", "Bids inside the final two minutes push the deadline out — nobody can snipe this auction.");
      }
      toast.ok(r.myRank === 1 ? "▲ Bid placed — you lead" : `Bid placed — position ${r.myRank}`,
               "Binding until someone undercuts you.");
      prevDeadline.current = r.deadline;
      poll();
    } catch (e) {
      setMsg(e.message);
      toast.warn("Bid rejected", e.message);
    }
    setPlacing(false);
  };

  return (
    <div>
      <button className="btn sm" onClick={() => go({ page: "portal" })} style={{ marginBottom: 16 }}>← All invitations</button>
      <div className="pagehead">
        <div>
          <div className="mono muted" style={{ marginBottom: 3 }}>{t.ref} · REVERSE AUCTION</div>
          <h1>{t.title}</h1>
        </div>
        <div className="grow" />
        {extended === a?.deadline && a?.live && <span className="extbadge">+2:00 anti-snipe</span>}
        {a?.live
          ? <LiveCountdown deadline={a.deadline} />
          : <span className="chip">{a?.recorded ? "Results recorded" : "Auction closed"}</span>}
      </div>

      <div className="grid2" style={{ alignItems: "start" }}>
        <div>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="chead"><h3>Your position</h3><span className="mono faint" style={{ marginLeft: "auto" }}>rank only — competitor prices are never shown</span></div>
            <div className="cbody" style={{ textAlign: "center", padding: "20px 18px" }}>
              {a?.myRank
                ? <>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                      <span aria-hidden="true" style={{ fontSize: 19, color: stateColor, fontWeight: 700 }}>{leading ? "▲" : "▼"}</span>
                      <RollNumber value={a.myRank} size={54} color={stateColor} />
                    </div>
                    <div style={{ marginTop: 6, fontSize: 13, fontWeight: leading ? 600 : 400, color: leading ? "var(--green)" : "var(--ink)" }}>
                      {leading ? "You hold the leading price" : "You are being outbid"}
                    </div>
                    <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                      of {a.bidders} bidder{a.bidders === 1 ? "" : "s"} · your price <Money n={myLast?.amount} />
                    </div>
                  </>
                : <div className="muted" style={{ fontSize: 13.5 }}>No bid placed yet — {a?.bidders || 0} bidder(s) are already in. Your opening bid must be at or under the <b><Money n={a?.ceiling ?? t.budget} /></b> ceiling.</div>}
            </div>
          </div>

          {a?.live && (
            <div className="card" style={{ marginBottom: 14 }}>
              <div className="chead"><h3>Place a bid</h3>
                <span className={"mono faint" + (roomMoved ? " tickbump" : "")} style={{ marginLeft: "auto" }}>
                  {a.movements} movement{a.movements === 1 ? "" : "s"} in the room
                </span>
              </div>
              <div className="cbody">
                <div className="frow" style={{ marginBottom: 9 }}>
                  <label className="lbl" htmlFor="auc-amt">Your lump-sum price (₦) — must be ≤ <Money n={Math.max(0, floor)} /></label>
                  <input id="auc-amt" className="in" type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
                         onKeyDown={(e) => e.key === "Enter" && Number(amount) && place()} placeholder={String(Math.max(0, floor))} />
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 11 }}>
                  {quick.map((v, i) => (
                    <button key={i} className="btn sm" onClick={() => setAmount(String(v))}
                            title={myLast ? "Undercut your own price" : "Open at this price"}>
                      {i === 0 && myLast ? "match floor · " : ""}{fmtCompact(v)}
                    </button>
                  ))}
                </div>
                {myLast && <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>Your current bid: <Money n={myLast.amount} /> · minimum decrement <Money n={a.minDecrement} /></div>}
                {msg && <div className="notice" style={{ borderLeft: "3px solid var(--wax)", marginBottom: 10 }}>{msg}</div>}
                <button className="btn pri" onClick={place} disabled={!Number(amount) || placing}>{placing ? "Placing…" : "Place bid"}</button>
                <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>Bids are binding. A bid inside the final two minutes extends the close by two minutes.</div>
              </div>
            </div>
          )}
          {!a?.live && !a?.recorded && (
            <div className="notice" style={{ marginBottom: 14 }}>The auction has closed. The buyer will record the results and any award follows the standard approval flow — you'll be notified either way.</div>
          )}
        </div>

        <div className="card">
          <div className="chead"><h3>Your price movements</h3>
            <span className="mono faint" style={{ marginLeft: "auto" }}>yours only — never a competitor's</span>
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

      <div className="card" style={{ marginTop: 14 }}>
        <div className="chead"><h3>Scope</h3></div>
        <div className="cbody" style={{ fontSize: 13.5, lineHeight: 1.6 }}>{t.scope}</div>
      </div>
    </div>
  );
}
