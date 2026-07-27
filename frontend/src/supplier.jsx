import React, { useEffect, useState } from "react";

import { downloadDoc, raw } from "./api";
import { Countdown, Empty, Money, Stat } from "./atoms";
import { effStatus, fmtCompact, fmtDate, fmtDateTime, fmtMoney } from "./helpers";

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
              <button className="doclink" onClick={() => downloadDoc(x.id, x.name)}>{x.name}</button>
              {x.expiry ? <span className="mono faint">expires {fmtDate(x.expiry)}</span> : null}
              <span style={{ flex: 1 }} />
              <button className="btn sm" aria-label="Remove document" onClick={() => act.deleteMyDoc(x.id)}>✕</button>
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
            <label className="btn sm">Upload document<input type="file" hidden onChange={uploadCompliance} /></label>
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
  const { state, user, act, ai, go } = api;
  const me = user.supplierId;
  const [form, setForm] = useState({ amount: "", decl: false });
  const [prices, setPrices] = useState({});
  const [acks, setAcks] = useState({});
  const [q, setQ] = useState("");
  const [aiFb, setAiFb] = useState("");
  const [busy, setBusy] = useState(false);
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

  const submit = () => {
    act.submitBid(t.id, {
      amount: hasLines ? undefined : Number(form.amount),
      lines: hasLines ? Object.fromEntries(t.lines.map((l) => [l.id, Number(prices[l.id])])) : undefined,
      acks: addenda.map((a) => a.id).filter((aid) => acks[aid]),
    });
  };
  const withdraw = async () => {
    if (!window.confirm("Withdraw your sealed bid? You can submit a replacement any time before the deadline. The withdrawal is recorded in the audit trail.")) return;
    await act.withdrawBid(t.id);
    setAiFb("");
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
                <button className="doclink" onClick={() => downloadDoc(x.id, x.name)}>{x.name}</button>
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

      {myBid ? (
        <div>
          <div className="receipt" style={{ marginBottom: 14 }}>
            <span className="sealdot" style={{ display: "inline-block", width: 22, height: 22 }} />
            <h3 style={{ fontFamily: "Georgia,'Times New Roman',serif", margin: "10px 0 4px" }}>Bid sealed</h3>
            <p className="muted" style={{ margin: "0 0 12px", fontSize: 13 }}>
              Submitted {fmtDateTime(myBid.submittedAt)}. Your bid is cryptographically sealed — the buyer sees only that a bid exists.
              Contents are revealed to everyone at the recorded opening after the deadline.
            </p>
            <div className="mono" style={{ fontSize: 11, color: "var(--faint)" }}>RECEIPT {myBid.id.toUpperCase()} · {t.ref}</div>
            {st === "published" && <div style={{ marginTop: 14 }}><button className="btn sm" onClick={withdraw}>Withdraw & replace before deadline</button></div>}
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
                  <button className="doclink" onClick={() => downloadDoc(x.id, x.name)}>{x.name}</button>
                  <span className="mono faint">{Math.max(1, Math.round(x.size / 1024))} KB</span>
                  <span style={{ flex: 1 }} />
                  <button className="btn sm" aria-label="Remove document" onClick={() => act.deleteDoc(x.id)}>✕</button>
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
              <button className="btn wax" disabled={pct < 100} onClick={submit}>Seal & submit bid</button>
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
              <button className="btn" onClick={ask} disabled={!q.trim()}>Ask</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


const POLL_MS = 5000;

export function AuctionRoom({ api, id }) {
  const { state, user, go, act } = api;
  const t = state.tenders.find((x) => x.id === id);
  const [a, setA] = useState(null);
  const [amount, setAmount] = useState("");
  const [msg, setMsg] = useState("");
  const [flash, setFlash] = useState("");

  const poll = async () => {
    try { setA(await raw(`/tenders/${id}/auction/`)); } catch (e) { /* keep last state */ }
  };
  useEffect(() => {
    poll();
    const h = setInterval(poll, POLL_MS);
    return () => clearInterval(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!t) return null;
  const myLast = a?.myBids?.length ? a.myBids[a.myBids.length - 1] : null;
  const floor = myLast ? myLast.amount - (a?.minDecrement || 0) : (a?.ceiling || t.budget);

  const place = async () => {
    setMsg(""); setFlash("");
    try {
      const r = await raw(`/tenders/${id}/auction/bids/`, { method: "POST", body: { amount: Number(amount) } });
      setAmount("");
      setFlash(r.extended
        ? `Bid placed — you're position ${r.myRank}. The close was extended 2 minutes (anti-sniping).`
        : `Bid placed — you're position ${r.myRank} of ${a ? Math.max(a.bidders, r.myRank) : r.myRank}.`);
      poll();
    } catch (e) { setMsg(e.message); }
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
        {a?.live ? <Countdown deadline={a.deadline} /> : <span className="chip">{a?.recorded ? "Results recorded" : "Auction closed"}</span>}
      </div>

      <div className="grid2" style={{ alignItems: "start" }}>
        <div>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="chead"><h3>Your position</h3><span className="mono faint" style={{ marginLeft: "auto" }}>rank only — competitor prices are never shown</span></div>
            <div className="cbody" style={{ textAlign: "center", padding: "22px 18px" }}>
              {a?.myRank
                ? <>
                    <div style={{ fontFamily: "Georgia,'Times New Roman',serif", fontSize: 54, lineHeight: 1, color: a.leading ? "var(--green)" : "var(--wax)" }}>
                      #{a.myRank}
                    </div>
                    <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                      of {a.bidders} bidder{a.bidders === 1 ? "" : "s"} · {a.leading ? "you hold the leading price" : "you are being outbid"}
                    </div>
                  </>
                : <div className="muted" style={{ fontSize: 13.5 }}>No bid placed yet — {a?.bidders || 0} bidder(s) are already in. Your opening bid must be at or under the <b><Money n={a?.ceiling ?? t.budget} /></b> ceiling.</div>}
            </div>
          </div>

          {a?.live && (
            <div className="card" style={{ marginBottom: 14 }}>
              <div className="chead"><h3>Place a bid</h3></div>
              <div className="cbody">
                <div className="frow">
                  <label className="lbl">Your lump-sum price (NGN) — must be ≤ <Money n={Math.max(0, floor)} /></label>
                  <input className="in" type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
                         onKeyDown={(e) => e.key === "Enter" && place()} placeholder={String(Math.max(0, floor))} />
                </div>
                {myLast && <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>Your current bid: <Money n={myLast.amount} /> · minimum decrement <Money n={a.minDecrement} /></div>}
                {msg && <div className="notice" style={{ borderLeft: "3px solid var(--wax)", marginBottom: 10 }}>{msg}</div>}
                {flash && <div className="notice" style={{ borderLeft: "3px solid var(--green)", marginBottom: 10 }}>{flash}</div>}
                <button className="btn pri" onClick={place} disabled={!Number(amount)}>Place bid</button>
                <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>Bids are binding. A bid inside the final two minutes extends the close by two minutes.</div>
              </div>
            </div>
          )}
          {!a?.live && !a?.recorded && (
            <div className="notice" style={{ marginBottom: 14 }}>The auction has closed. The buyer will record the results and any award follows the standard approval flow — you'll be notified either way.</div>
          )}
        </div>

        <div className="card">
          <div className="chead"><h3>Your bid history</h3><span className="mono faint" style={{ marginLeft: "auto" }}>{a?.movements ?? 0} total price movements in the room</span></div>
          <div className="cbody" style={{ paddingTop: 6 }}>
            {(a?.myBids || []).slice().reverse().map((b, i) => (
              <div className="rowline" key={i}>
                <span className="mono muted" style={{ fontSize: 12 }}>{fmtDateTime(b.at)}</span>
                <span style={{ flex: 1 }} />
                <Money n={b.amount} strong={i === 0} />
              </div>
            ))}
            {!(a?.myBids || []).length && <span className="muted" style={{ fontSize: 13 }}>Nothing yet.</span>}
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
