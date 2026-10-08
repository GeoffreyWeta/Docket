import React, { useEffect, useRef, useState } from "react";

import { downloadDoc, raw } from "./api";
import { draftKeyFor, readDraft, useDraftStorage } from "./drafts";
import { AuctionGallery } from "./auctions";
import { Countdown, Empty, Money, Stat } from "./atoms";
import { Meter } from "./charts";
import { CategorySelect, DocTypeSelect, LocationSelect, PhoneInput } from "./fields";
import { Figures, Guide, More, Page, Quiet, Row, Rows } from "./page";
import {
  REG_STATUS, VERIFY_STATUS, activeRound, daysLeft, effStatus, fmtCompact, fmtDate,
  fmtDateTime, fmtMoney, nowMs, regStatusOf, roundsOf, verifyStatusOf, wholeAmount,
} from "./helpers";
import { Icon, SealMark } from "./icons";
import { DUR, cue, useCountUp, useFlip, usePrev } from "./motion";
import { ConfirmDialog, CountUp, LiveCountdown, RollNumber, Sparkline, TypeOut, tabKeys } from "./ui";

/* ---------------- supplier portal ---------------- */

/* THE VENDOR'S PAGE.

   It used to be one column: an invitations card, then two collapsed
   disclosures. Everything a vendor might want to know about their standing
   with this buyer was either absent or folded away behind a summary line, and
   the page had a lot of air and very little on it.

   FOUR TABS, because the vendor arrives for one of four reasons and only one
   of them at a time: what is my position, what can I bid on, what happened to
   what I bid, and is my paperwork in order. A single column made them scroll
   past three to reach the fourth.

   WHAT IS NEW IS DERIVED, NOT INVENTED. Every figure on the overview is read
   off the same bootstrap payload the old page already had, plus the auction
   list. The expiry warnings in particular were always computable and never
   shown: a vendor could lose a prequalification to a document that lapsed
   while they were looking at the page that failed to mention it. */
export function PortalHome({ api }) {
  const { state, user, go, act } = api;
  const me = user.supplierId;
  const supplier = state.suppliers.find((s) => s.id === me);
  const tab = api.route.tab || "overview";
  const setTab = (next) => api.setView({ tab: next });
  const [docForm, setDocForm] = useState({ type: "", label: "", expiry: "" });
  const [profileForm, setProfileForm] = useState({
    name: supplier.name, category: supplier.category, location: supplier.location,
    phone: supplier.phone || "", contactPerson: supplier.contactPerson || "",
  });
  const [dropDoc, setDropDoc] = useState(null);
  const myComplianceDocs = (state.documents || []).filter((x) => x.kind === "supplier" && x.supplierId === me);
  /* The type is chosen from the list, so a buyer filtering the register for a
     tax clearance finds every one of them; "Other" is the only one described
     in the vendor's own words. */
  const docReady = !!docForm.type && (docForm.type !== "Other" || !!docForm.label.trim());
  const uploadCompliance = (e) => {
    const f = e.target.files[0];
    if (f && docReady) {
      const expiryMs = docForm.expiry ? new Date(docForm.expiry).getTime() : "";
      act.upload("/me/docs/", f, {
        type: docForm.type, label: docForm.type === "Other" ? docForm.label.trim() : docForm.type, expiry: expiryMs,
      });
      setDocForm({ type: "", label: "", expiry: "" });
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

  /* A paused event is still an invitation the vendor holds - dropping it off
     the list would tell them nothing, which is exactly the silence pausing an
     event is supposed to replace. Cancelled events move to Outcomes: there is
     nothing left to do about them, but there is something to know. */
  const invitations = state.tenders.filter((t) => t.invited.includes(me)
    && ["published", "closed", "paused"].includes(effStatus(t)));
  const outcomes = state.tenders.filter((t) => t.invited.includes(me)
    && (["evaluation", "awarded"].includes(t.status)
        || (t.status === "cancelled" && state.bids.some((b) => b.tenderId === t.id && b.supplierId === me)))
    && (t.status === "cancelled" || state.bids.some((b) => b.tenderId === t.id && b.supplierId === me)));

  const openNow = invitations.filter((t) => effStatus(t) === "published");
  const notStarted = openNow.filter((t) => {
    const rnd = activeRound(t);
    if (rnd && rnd.mine === false) return false;  // not shortlisted for this round
    return !state.bids.some((b) => b.tenderId === t.id && b.supplierId === me && (rnd && rnd.id ? b.roundId === rnd.id : true));
  });
  const soonest = openNow.length ? openNow.reduce((a, t) => (t.deadline < a.deadline ? t : a)) : null;
  const bidsMade = state.bids.filter((b) => b.supplierId === me);
  const wins = state.tenders.filter((t) => t.awardedTo === me);
  const decided = state.tenders.filter((t) => t.status === "awarded" && bidsMade.some((b) => b.tenderId === t.id));
  const losses = decided.length - wins.length;
  const value = wins.reduce((s2, t) => s2 + (t.awardedAmount || 0), 0);
  const liveAucs = aucs.filter((a) => a.live);
  /* A decided auction used to leave no trace on the winner's page: nothing
     under Outcomes, no alert, only an "Awarded" chip on the invitation that
     did not say to whom. Each lot already carries who it went to. */
  const aucWon = (a) => (a.lots || []).filter((l) => l.awardedTo === me);
  const decidedAucs = aucs.filter((a) => !a.disqualified && ["awarded", "cancelled"].includes(a.status));

  /* THE PAPERWORK CLOCK. A lapsed document is the commonest way a vendor loses
     a prequalification they had already earned, and the old page mentioned it
     nowhere. Sixty days is the window the buyer's own reminder runs on, so the
     two agree about what "soon" means. */
  const SOON_MS = 60 * 86400000;
  const docsWithExpiry = (myComplianceDocs.length ? myComplianceDocs : (supplier.docs || []))
    .filter((d) => d.expiry);
  const expired = docsWithExpiry.filter((d) => d.expiry < nowMs());
  const expiringSoon = docsWithExpiry.filter((d) => d.expiry >= nowMs() && d.expiry - nowMs() < SOON_MS);

  /* Everything with a clock on it, in one list, soonest first. A vendor holding
     a tender closing on Friday and an auction closing in an hour should not
     have to read two cards to work out which one is urgent. */
  const closingNext = [
    ...openNow.map((t) => ({ key: "t" + t.id, at: t.deadline, title: t.title, ref: t.ref,
                             kind: "Tender", onOpen: () => go({ page: "bidroom", id: t.id }) })),
    ...aucs.filter((a) => a.live && a.endsAt)
           .map((a) => ({ key: "a" + a.id, at: a.endsAt, title: a.title, ref: a.ref,
                          kind: "Auction", live: true, onOpen: () => go({ page: "auction", id: a.id }) })),
  ].sort((x, y) => x.at - y.at).slice(0, 4);

  const winRate = decided.length ? Math.round((wins.length / decided.length) * 100) : null;

  /* The vendor opens this page to find out one thing: is there anything to
     bid on, and when does it close. So that is the guide - the open
     invitations as a list you can act on, the nearest deadline as the
     headline. */
  const guide = (
    <Guide art={notStarted.length ? "draft" : openNow.length || liveAucs.length ? "clear" : "tray"}
           headline={liveAucs.length
             ? `${liveAucs.length} auction${liveAucs.length === 1 ? " is" : "s are"} open now`
             : notStarted.length
               ? `${notStarted.length} tender${notStarted.length === 1 ? " is" : "s are"} waiting for your bid`
               : openNow.length
                 ? "Your bids are in"
                 : "Nothing open right now"}
           why={soonest
             ? <>The nearest closes {fmtDate(soonest.deadline)}. Nothing you seal is visible to the buyer before then.</>
             : "When a buyer invites you, it appears here with its closing date."}
           items={[
             ...liveAucs.map((a) => ({ key: a.id, label: a.title, note: "Live auction, prices moving",
                                       onPick: () => go({ page: "auction", id: a.id }) })),
             ...notStarted.map((t) => ({ key: t.id, label: t.title,
                                         note: daysLeft(t.deadline) === 1 ? "1 day left" : `${daysLeft(t.deadline)} days left`,
                                         onPick: () => go({ page: "bidroom", id: t.id }) })),
           ]}>
      <Figures>
        <Quiet n={invitations.length} label="invitations" />
        <Quiet n={wins.length} label="won" tone={wins.length ? "var(--green)" : undefined} />
        {winRate != null && <Quiet n={winRate + "%"} label="win rate" />}
        <Quiet n={<CountUp n={value} format={fmtCompact} />} label="awarded value" />
      </Figures>
    </Guide>
  );

  const TABS = [
    ["overview", "Overview"],
    ["invitations", `Invitations${openNow.length + liveAucs.length ? ` (${openNow.length + liveAucs.length})` : ""}`],
    ["outcomes", "Outcomes"],
    ["company", "Company"],
  ];

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

      {/* NO data-reveal ANYWHERE UNDER THE TABS. useReveal observes what is in
          the document when it runs, which is the first paint. Everything on a
          tab other than the one that opens first mounts later, is never
          observed, never gets .seen, and stays at opacity 0 - present in the
          DOM, invisible on the page. Company and Outcomes were rendering
          completely blank. Reveal-on-scroll is the wrong idea for tab content
          regardless: it arrives because somebody clicked, not because they
          scrolled to it. */}
      <div className="segmented portaltabs" role="tablist" aria-label="Your portal" onKeyDown={tabKeys}>
        {TABS.map(([key, label]) => (
          <button key={key} id={`portal-tab-${key}`} role="tab" aria-controls="portal-panel" tabIndex={tab === key ? 0 : -1} aria-selected={tab === key} className={tab === key ? "on" : ""}
                  onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>
      <section id="portal-panel" role="tabpanel" aria-labelledby={`portal-tab-${tab}`}>
      {!supplier.prequalified && (
        <div className="notice" style={{ marginBottom: 16, borderLeft: supplier.rejectedReason ? "3px solid var(--wax)" : undefined }}>
          {supplier.rejectedReason
            ? <>The buyer reviewed your registration and needs more before prequalifying you: <b>{supplier.rejectedReason}</b>. Update your documents in Company and they will take another look.</>
            : <>Your registration is with the buyer's procurement team. You can already bid. Uploading your compliance documents under Company speeds their review up.</>}
        </div>
      )}

      {tab === "overview" && (
        <>
          <div className="grid g4" style={{ marginBottom: 14 }}>
            {/* No tone on the figure. It is a count of what is open, not a
                warning, and painting it wax red said "something is wrong with
                these two" when the only thing worth flagging is the one that
                has not been started - which the line underneath says. */}
            <Stat k="Open to bid" v={openNow.length + liveAucs.length}
                  d={notStarted.length ? `${notStarted.length} not started` : "all started"}
                  onClick={() => setTab("invitations")} />
            <Stat k="Bids submitted" v={bidsMade.length} d={`across ${invitations.length + outcomes.length} events`} />
            <Stat k="Win rate" v={winRate == null ? "-" : winRate + "%"}
                  d={decided.length ? `${wins.length} of ${decided.length} decided` : "nothing decided yet"}
                  tone={winRate ? "var(--green)" : undefined}
                  onClick={() => setTab("outcomes")} />
            <Stat k="Awarded value" v={<CountUp n={value} format={fmtCompact} />}
                  d={wins.length ? `${wins.length} award${wins.length === 1 ? "" : "s"}` : "no awards yet"} />
          </div>

          {(expired.length > 0 || expiringSoon.length > 0) && (
            <div className="notice" style={{ marginBottom: 14, borderLeft: "3px solid var(--wax)" }}>
              {expired.length > 0
                ? <><b>{expired.length} document{expired.length === 1 ? " has" : "s have"} expired.</b> A lapsed document can cost you a prequalification you already hold. </>
                : <><b>{expiringSoon.length} document{expiringSoon.length === 1 ? "" : "s"} expire{expiringSoon.length === 1 ? "s" : ""} within sixty days.</b> </>}
              {[...expired, ...expiringSoon].slice(0, 3).map((d) => d.label || d.name).join(", ")}
              {". "}
              <button className="doclink" onClick={() => setTab("company")}>Update them under Company</button>
            </div>
          )}

          <div className="card" style={{ marginBottom: 14 }}>
            <div className="chead"><h3>Closing next</h3>
              <span className="mono faint" style={{ marginLeft: "auto" }}>tenders and auctions together</span>
            </div>
            <Rows empty={<Empty art="tray">Nothing with a clock on it. When a buyer invites you, it appears here with its closing date.</Empty>}>
              {closingNext.map((x) => (
                <Row key={x.key} title={x.title}
                     meta={<><span className="mono">{x.ref}</span><span>{x.kind}</span></>}
                     right={x.live ? <LiveCountdown deadline={x.at} /> : <Countdown t={x.at} />}
                     onOpen={x.onOpen} />
              ))}
            </Rows>
          </div>

          {decided.length > 0 && (
            <div className="card">
              <div className="chead"><h3>Your record with {state.org.name}</h3>
                <span className="mono faint" style={{ marginLeft: "auto" }}>decided events only</span>
              </div>
              <div className="cbody">
                <Meter label="Won" value={wins.length} max={decided.length} format={(n) => String(n)} />
                <div style={{ height: 10 }} />
                <Meter label="Not successful" value={losses} max={decided.length} tone="warn" format={(n) => String(n)} />
                <div className="hint" style={{ marginTop: 12 }}>
                  Bids that are still being evaluated are not counted either way.
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {tab === "invitations" && (
        <>
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
                         meta={<>{a.ref}{lot && lot.ceiling ? <> &middot; opening price {fmtCompact(lot.ceiling)}</> : null}
                           {a.disqualified ? <> &middot; you were removed</> : null}</>}
                         right={a.live
                           ? <LiveCountdown deadline={a.endsAt} />
                           : a.status === "awarded" && aucWon(a).length
                             ? <span className="chip gold">Awarded to you</span>
                             : <span className="chip">{a.status === "awarded" ? "Awarded"
                                 : a.status === "scheduled" || a.status === "draft" || (a.status === "live" && (a.startsAt || 0) > Date.now()) ? "Opens soon"
                                 : a.status === "paused" ? "Paused"
                                 : a.status === "cancelled" ? "Cancelled" : "Closed"}</span>}
                         onOpen={a.disqualified ? undefined : () => go({ page: "auction", id: a.id })} />
                  );
                })}
              </Rows>
            </div>
          )}

          <div className="card">
            <div className="chead"><h3>Tenders you can bid on</h3></div>
            <Rows empty={<Empty art="tray">Nothing to bid on right now. When a buyer invites you, it appears here with its closing date.</Empty>}>
              {invitations.map((t) => {
                const st = effStatus(t);
                const rnd = activeRound(t);
                const myBid = state.bids.find((b) => b.tenderId === t.id && b.supplierId === me
                  && (rnd && rnd.id ? b.roundId === rnd.id : true));
                const left = rnd && rnd.mine === false;
                return (
                  <Row key={t.id} title={t.title}
                       onOpen={st === "published" ? () => go({ page: "bidroom", id: t.id }) : undefined}
                       meta={<>
                         <span className="mono">{t.ref}</span>
                         {t.lines && t.lines.length > 0 && <span>{t.lines.length} priced lines</span>}
                         {(t.rounds || []).length > 1 && <span>round {t.currentRound} of {t.rounds.length}</span>}
                         {(t.addenda || []).length > 0 && <span>{(t.addenda || []).length} addendum</span>}
                         {(t.deadlineChanges || []).length > 0 && <span>deadline extended</span>}
                       </>}
                       right={<>
                         <Countdown t={t.deadline} />
                         {st === "paused" ? <span className="chip warn">Paused by the buyer</span>
                           : myBid ? <span className="chip ok">Sealed</span>
                           : left ? <span className="chip">Not shortlisted</span>
                           : st === "published" ? <span className="chip warn">Not started</span>
                           : <span className="chip">Closed</span>}
                         {st === "published" && !left && <button className="btn sm pri" onClick={() => go({ page: "bidroom", id: t.id })}>{myBid ? "View receipt" : "Bid"}</button>}
                       </>} />
                );
              })}
            </Rows>
          </div>
        </>
      )}

      {tab === "outcomes" && (
        <div className="card">
          <div className="chead"><h3>Outcomes</h3>
            <span className="mono faint" style={{ marginLeft: "auto" }}>
              {outcomes.length ? `${wins.length} won · ${losses} not successful · ${outcomes.filter((t) => t.status === "evaluation").length} being evaluated`
                : decidedAucs.length ? `${decidedAucs.length} auction${decidedAucs.length === 1 ? "" : "s"} decided` : "nothing decided yet"}
            </span>
          </div>
          <Rows empty={<Empty art="clear">Nothing decided yet. Awards and outcomes for your bids land here, with the buyer's letter attached.</Empty>}>
            {decidedAucs.map((a) => {
              const mine = aucWon(a);
              return (
                <Row key={"a" + a.id} title={a.title}
                     meta={<span className="mono">{a.ref} &middot; {a.direction === "sale" ? "selling auction" : "reverse auction"}</span>}
                     onOpen={() => go({ page: "auction", id: a.id })}
                     right={a.status === "cancelled" ? <span className="chip">Cancelled</span>
                       : mine.length
                         ? <span className="chip gold">Awarded to you &middot; {fmtCompact(mine.reduce((s2, l) => s2 + (l.awardedAmount || 0), 0))}</span>
                         : <span className="chip">Not successful</span>} />
              );
            })}
            {outcomes.map((t) => {
              const letter = t.letters && t.letters[me];
              const won = t.status === "awarded" && t.awardedTo === me;
              /* Returned at the technical stage: the decision on this vendor is
                 made, even while the event is still being evaluated. */
              const out = t.status === "evaluation" && state.bids.some((b) => b.tenderId === t.id
                && b.supplierId === me && b.disqualified);
              const lost = (t.status === "awarded" && t.awardedTo !== me) || out;
              return (
                <Row key={t.id} title={t.title} meta={<span className="mono">{t.ref}</span>}
                     right={<>
                       {t.status === "evaluation" && !out && <span className="chip">Being evaluated</span>}
                       {won && <span className="chip gold">Awarded to you &middot; {fmtCompact(t.awardedAmount)}</span>}
                       {lost && <span className="chip">Not successful</span>}
                       {letter && <button className="btn sm" onClick={() => setOpenL((o) => ({ ...o, [t.id]: !o[t.id] }))}>{openL[t.id] ? "Hide letter" : "Read the letter"}</button>}
                     </>}>
                  {letter && openL[t.id] && <div className={"letter unfold" + (won ? " sheen" : "")} style={{ marginTop: 10 }}>{letter.text}</div>}
                </Row>
              );
            })}
          </Rows>
        </div>
      )}

      {tab === "company" && (
        <>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="chead"><h3>Your company</h3>
              <span className="mono faint" style={{ marginLeft: "auto" }}>{supplier.category} &middot; {supplier.location}</span>
            </div>
            <div className="cbody">
              <div className="grid g2" style={{ marginBottom: 12 }}>
                <div className="frow"><label className="lbl">Company name</label>
                  <input className="in" value={profileForm.name} onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })} /></div>
                <div className="frow"><label className="lbl">Category</label>
                  <CategorySelect value={profileForm.category} required
                                  onChange={(v) => setProfileForm({ ...profileForm, category: v })} /></div>
                <div className="frow"><label className="lbl">Location</label>
                  <LocationSelect value={profileForm.location} required
                                  onChange={(v) => setProfileForm({ ...profileForm, location: v })} /></div>
                <div className="frow"><label className="lbl" htmlFor="co-contact">Contact person</label>
                  <input id="co-contact" className="in" autoComplete="name" value={profileForm.contactPerson}
                         onChange={(e) => setProfileForm({ ...profileForm, contactPerson: e.target.value })} /></div>
                <div className="frow"><label className="lbl" htmlFor="co-phone">Phone</label>
                  <PhoneInput id="co-phone" value={profileForm.phone}
                              onChange={(v) => setProfileForm({ ...profileForm, phone: v })} /></div>
              </div>
              <div className="gaterow">
                <button className="btn" disabled={profileForm.name.trim().length < 2}
                        onClick={async () => {
                          const ok = await act.rename({
                            name: profileForm.name, category: profileForm.category, location: profileForm.location,
                            phone: profileForm.phone, contactPerson: profileForm.contactPerson.trim(),
                          });
                          if (ok) api.toast.ok("Saved", "Your company details are up to date.");
                        }}>Save details</button>
                {profileForm.name.trim().length < 2 && <span className="hint gatehint">The company name needs at least two characters.</span>}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="chead"><h3>Documents that keep you eligible</h3>
              <span className="mono faint" style={{ marginLeft: "auto" }}>
                {myComplianceDocs.length || (supplier.docs || []).length} on file
                {expired.length ? ` · ${expired.length} expired` : expiringSoon.length ? ` · ${expiringSoon.length} expiring` : ""}
              </span>
            </div>
            <div className="cbody">
              {myComplianceDocs.map((x) => {
                const gone = x.expiry && x.expiry < nowMs();
                const soon = x.expiry && !gone && x.expiry - nowMs() < SOON_MS;
                return (
                  <div className="docrow" key={x.id}>
                    {/* What the document is, and when it lapses: "Tax clearance
                        certificate, expires 12 Jan 2027". The file name is
                        only what the vendor's phone called it. */}
                    <button className="doclink" title={x.name} onClick={() => downloadDoc(x.id, x.name)}>
                      <Icon n="file" s={13} />{x.label || x.name}
                    </button>
                    {x.expiry
                      ? <span className={"hint" + (gone || soon ? " docwarn" : "")} style={{ marginTop: 0 }}>
                          {gone ? "expired " : "expires "}{fmtDate(x.expiry)}
                        </span>
                      : null}
                    <span style={{ flex: 1 }} />
                    <button className="btn sm iconly" aria-label={"Remove " + (x.label || x.name)} onClick={() => setDropDoc(x)}><Icon n="close" s={12} /></button>
                  </div>
                );
              })}
              {myComplianceDocs.length === 0 && (supplier.docs || []).map((d, i) => (
                <div className="docrow" key={"seeded" + i}><span>{d.name}</span><span className="hint" style={{ marginTop: 0 }}>{d.expiry ? "expires " + fmtDate(d.expiry) : ""}</span></div>
              ))}
              {myComplianceDocs.length === 0 && !(supplier.docs || []).length && (
                <Empty art="tray">No documents on file yet. Upload your tax clearance, CAC certificate and anything else the buyer asks for.</Empty>
              )}
              <div className="formrow" style={{ marginTop: 10, alignItems: "center" }}>
                <DocTypeSelect value={docForm.type} ariaLabel="Document type"
                               onChange={(v) => setDocForm({ ...docForm, type: v })} />
                {docForm.type === "Other" && (
                  <input className="in" placeholder="What is this document?" aria-label="Describe the document"
                         value={docForm.label} onChange={(e) => setDocForm({ ...docForm, label: e.target.value })} />
                )}
                <input className="in" type="date" aria-label="Expiry date"
                       value={docForm.expiry} onChange={(e) => setDocForm({ ...docForm, expiry: e.target.value })} />
                <label className="btn sm" aria-disabled={!docReady}>
                  <Icon n="upload" s={14} />Upload
                  <input type="file" hidden disabled={!docReady} onChange={uploadCompliance} />
                </label>
              </div>
              {!docReady && <div className="hint">Choose what the document is, then upload it.</div>}
              <div className="hint">The buyer's procurement team sees these when reviewing your prequalification, and Docket reminds them before anything expires.</div>
            </div>
          </div>
          {dropDoc && (
            <ConfirmDialog title="Remove this document?" confirmLabel="Remove it" tone="wax"
                           onClose={() => setDropDoc(null)}
                           onConfirm={() => act.deleteMyDoc(dropDoc.id)}>
              {dropDoc.label || dropDoc.name} will no longer be on file with {state.org.name}. You can upload it again later.
            </ConfirmDialog>
          )}
        </>
      )}
      </section>
    </Page>
  );
}



/* "Closes Fri 14 Oct 2026, 12:00 WAT". A date alone left a vendor guessing
   whether noon or midnight, and the zone matters to anyone bidding from
   elsewhere. Formatted here rather than in helpers, in the reader's own zone. */
const closesAt = (ms) => {
  let s;
  try {
    s = new Date(ms).toLocaleString("en-NG", {
      weekday: "short", day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: false, timeZoneName: "short",
    });
  } catch (e) {
    s = new Date(ms).toLocaleString();
  }
  return "Closes " + s.replace(/^(\w+),/, "$1");
};

/* The lookup and the room are two components because the room calls hooks
   below the point where it would otherwise return early. A refresh that took
   the tender away (withdrawn from this vendor, cancelled) then rendered fewer
   hooks than the render before it, and React stopped the whole page. */
export function BidRoom({ api, id }) {
  const t = api.state.tenders.find((x) => x.id === id);
  if (!t) return <Empty>Tender not found.</Empty>;
  return <BidRoomFor api={api} t={t} />;
}

function BidRoomFor({ api, t }) {
  const { state, user, act, ai, go, toast } = api;
  const id = t.id;
  const me = user.supplierId;
  const st = effStatus(t);
  const rnd = activeRound(t);
  const rounds = roundsOf(t);
  /* TYPED PRICES SURVIVE A DROPPED CONNECTION. A vendor pricing forty lines on
     a phone loses all of it to a reload or a dead battery, so the draft is
     kept on this device per tender and round, and cleared once it is sealed. */
  const draftKey = draftKeyFor(user, "bid", `${t.id}.${rnd?.id || rounds.at(-1)?.id || "r1"}`);
  const [draft0] = useState(() => {
    return readDraft(draftKey);
  });
  const [form, setForm] = useState({ amount: (draft0 && draft0.amount) || "", decl: false });
  const [prices, setPrices] = useState((draft0 && draft0.prices) || {});
  const [restored, setRestored] = useState(!!draft0);
  const [acks, setAcks] = useState({});
  const [q, setQ] = useState("");
  const [aiFb, setAiFb] = useState("");
  const [busy, setBusy] = useState(false);
  const [askWithdraw, setAskWithdraw] = useState(false);
  const [askSeal, setAskSeal] = useState(false);
  const [sealing, setSealing] = useState(false);
  const typed = !!String(form.amount).trim() || Object.values(prices).some((v) => String(v).trim());
  const draft = useDraftStorage(draftKey, { amount: form.amount, prices }, typed);
  /* The clock by the submit button, refreshed so "closes in 12 min" counts. */
  const [, setTick] = useState(0);
  useEffect(() => {
    const h = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(h);
  }, []);
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

  /* "540,000,000" is how people write money, so commas and spaces are fine. */
  const num = wholeAmount;
  const linesTotal = hasLines ? t.lines.reduce((s, l) => s + (num(prices[l.id]) || 0) * l.qty, 0) : 0;
  const amountValid = hasLines ? t.lines.every((l) => num(prices[l.id]) > 0) && Number.isSafeInteger(linesTotal) : num(form.amount) > 0;
  const sealTotal = hasLines ? linesTotal : num(form.amount) || 0;
  const notShortlisted = !myBid && rnd && rnd.mine === false;
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
  const orderedSteps = steps;
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

  /* Typed but not sealed: the browser asks before the tab closes. */
  const unsent = typed && !myBid && st === "published";
  useEffect(() => {
    if (!unsent) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsent]);

  /* Locked from the first tap until the server answers: a double tap used to
     seal once and then report the second attempt as an error. */
  const submit = async () => {
    if (sealing || !amountValid || pct < 100) return false;
    setSealing(true);
    let ok = false;
    try {
      ok = await act.submitBid(t.id, {
        amount: hasLines ? undefined : num(form.amount),
        lines: hasLines ? Object.fromEntries(t.lines.map((l) => [l.id, num(prices[l.id])])) : undefined,
        acks: addenda.map((a) => a.id).filter((aid) => acks[aid]),
        decl: form.decl === true,
      });
    } finally {
      setSealing(false);
    }
    if (ok) {
      draft.clear();
      setPrices({});
      setForm({ amount: "", decl: false });
      setRestored(false);
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
      /* "Withdraw & replace" starts from the bid that was there, so changing
         one rate does not mean typing forty again. */
      if (was) {
        setPrices(Object.fromEntries(Object.entries(was.lines).map(([k, v]) => [k, String(v)])));
        setForm((f) => ({ ...f, amount: was.amount != null && !hasLines ? String(was.amount) : "" }));
      }
      toast.undo("Sealed bid withdrawn", "Your documents are unlocked. Submit a replacement any time before the deadline.",
                 async () => {
                   const back = await act.submitBid(t.id, {
                     amount: hasLines ? undefined : was?.amount,
                     lines: hasLines ? was?.lines : undefined,
                     acks: acksWere,
                     decl: true,  // re-sealing the bid they signed, unchanged
                   });
                   if (back) {
                     setPrices({});
                     setForm({ amount: "", decl: false });
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
          {t.ref} · {closesAt(t.deadline)}
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
          <b>{rnd.name} of {rounds.length}.</b> This is a fresh submission against the same scope -
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
      {askSeal && !myBid && (
        <ConfirmDialog title="Seal and submit your bid?" confirmLabel="Seal & submit" tone="wax"
                       onClose={() => setAskSeal(false)}
                       onConfirm={async () => { await submit(); }}>
          You are submitting <b>{fmtMoney(sealTotal)}</b> for <b>{t.title}</b> with {myDocs.length} document{myDocs.length === 1 ? "" : "s"}.
          {" "}You can withdraw and replace it any time before the deadline.
        </ConfirmDialog>
      )}
      {myBid ? (
        <div>
          <div className="receipt" style={{ marginBottom: 14 }}>
            <SealMark s={26} className="stamped" />
            <h3 style={{ fontFamily: "Georgia,'Times New Roman',serif", margin: "10px 0 4px" }}>Bid sealed</h3>
            <p className="muted" style={{ margin: "0 0 12px", fontSize: 13 }}>
              Submitted {fmtDateTime(myBid.submittedAt)}. Your bid is cryptographically sealed: the buyer sees only that a bid exists.
              Only the buyer sees the contents, at the recorded opening after the deadline. Other vendors never do.
            </p>
            {/* What was sealed, so the vendor's own copy of the receipt says it:
                the figure, each rate, and the documents that went with it. */}
            {myBid.amount != null && (
              <div style={{ margin: "0 0 10px", fontSize: 13.5 }}>
                Your bid: <span className="money" style={{ fontWeight: 600 }}>{fmtMoney(myBid.amount)}</span>
              </div>
            )}
            {hasLines && myBid.lines && Object.keys(myBid.lines).length > 0 && (
              <div style={{ margin: "0 0 10px", fontSize: 12.5 }}>
                {t.lines.map((l) => (
                  <div key={l.id} style={{ display: "flex", gap: 10, justifyContent: "space-between" }}>
                    <span>{l.desc}</span>
                    <span className="money">{fmtMoney(myBid.lines[l.id] || 0)} per {l.unit}</span>
                  </div>
                ))}
              </div>
            )}
            {myDocs.length > 0 && (
              <div style={{ margin: "0 0 10px", fontSize: 12.5 }}>
                {myDocs.map((x) => (
                  <div key={x.id} className="docrow">
                    <span className="chip" style={{ textTransform: "capitalize" }}>{x.envelope}</span>
                    <button className="doclink" onClick={() => downloadDoc(x.id, x.name)}><Icon n="file" s={13} />{x.name}</button>
                  </div>
                ))}
              </div>
            )}
            <div className="mono" style={{ fontSize: 11, color: "var(--faint)" }}>
              RECEIPT <TypeOut text={myBid.id.toUpperCase()} /> · {t.ref}
            </div>
            {st === "published" && <div style={{ marginTop: 14 }}><button className="btn sm" onClick={() => setAskWithdraw(true)}>Withdraw & replace before deadline</button></div>}
          </div>
        </div>
      ) : st === "published" && notShortlisted ? (
        <div className="notice" style={{ marginBottom: 14 }}>
          You were not shortlisted for round {rnd.number}.{priorBids.length > 0 ? " Your earlier bid stands." : ""}
        </div>
      ) : st === "published" ? (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="chead"><h3>Your sealed bid</h3>
            <span className="hint" style={{ marginLeft: "auto", marginTop: 0 }}>
              {outstanding.length === 0 ? "ready to seal" : outstanding.length + " left"}
            </span>
          </div>
          <div className="cbody">
            {typed && <p className="hint" role="status">{draft.status || "Saving on this device..."}</p>}
            {restored && typed && (
              <div className="notice" role="status" style={{ marginBottom: 12 }}>
                Draft restored. These are the prices you typed last time on this device. Nothing is sent until you seal.
              </div>
            )}
            {hasLines ? (
              <div className="frow" id="sb-price">
                <label className="lbl">Your rate for each line</label>
                <div className="hint" style={{ marginTop: 0, marginBottom: 8 }}>
                  In naira, per unit, fixed for the contract term. The total works itself out below. The buyer
                  has set the most it will pay for each line: a rate above that scores nothing on that line.
                </div>
                {t.lines.map((l) => (
                  /* .priceline stacks the line above its rate and running total
                     on a phone, and lays all three out in a row from 600px up */
                  <div key={l.id} className="priceline">
                    <div className="pdesc">{l.desc}<div className="mono faint" style={{ fontSize: 11 }}>{l.qty.toLocaleString()} × {l.unit}</div></div>
                    <input className="in" type="text" inputMode="numeric" placeholder={"per " + l.unit} aria-label={"Unit rate for " + l.desc}
                           aria-invalid={!!String(prices[l.id] || "").trim() && !Number.isFinite(num(prices[l.id]))}
                           aria-describedby={`rate-help-${l.id}`} value={prices[l.id] ?? ""} onChange={(e) => setPrices((p) => ({ ...p, [l.id]: e.target.value }))} />
                    <div className="money ptotal">{num(prices[l.id]) > 0 ? fmtMoney(num(prices[l.id]) * l.qty) : "-"}</div>
                    <div id={`rate-help-${l.id}`} className="hint" style={{ gridColumn: "1 / -1" }}>
                      {String(prices[l.id] || "").trim() && !Number.isFinite(num(prices[l.id])) ? "Enter a positive whole amount, for example 1,250. Fractions and negative amounts are not supported." : "Whole naira only. Commas are optional."}
                    </div>
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
                <input id="bid-amt" className="in" type="text" inputMode="numeric" placeholder="e.g. 540,000,000"
                       aria-describedby="bid-amt-says" value={form.amount}
                       aria-invalid={!!form.amount.trim() && !Number.isFinite(num(form.amount))}
                       onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                {/* Read back as money, so a missing zero shows before it is sealed. */}
                <div id="bid-amt-says" className="money" style={{ marginTop: 6, fontWeight: 600 }} aria-live="polite">
                  {num(form.amount) > 0 ? fmtMoney(num(form.amount)) : form.amount.trim() ? "Enter a positive whole amount. Fractions and negative amounts are not supported." : "Whole naira only. Commas are optional."}
                </div>
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
              <button className="btn wax" disabled={pct < 100 || sealing} onClick={() => setAskSeal(true)}>
                <Icon n="stamp" s={15} />{sealing ? "Sealing…" : "Seal & submit bid"}
              </button>
              {t.deadline - nowMs() > 0 && t.deadline - nowMs() <= 3600000 && (
                <span className="hint docwarn" style={{ alignSelf: "center", marginTop: 0 }} role="status">
                  Closes in {Math.max(1, Math.ceil((t.deadline - nowMs()) / 60000))} min, submit now
                </span>
              )}
              {/* AI OFF (no ANTHROPIC_API_KEY): supplier bid review button.
              <button className="btn" onClick={reviewAI} disabled={busy}>{busy ? "Reviewing…" : "Review my bid with AI"}</button>
              */}
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
/* "2 minutes", "30 seconds", "1 hour 30 minutes": a span of time in words. */
function plainSpan(ms) {
  const s = Math.round((ms || 0) / 1000);
  const part = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  if (s < 60) return part(s, "second");
  const m = Math.round(s / 60);
  if (m < 60) return part(m, "minute");
  const h = Math.floor(m / 60);
  return part(h, "hour") + (m % 60 ? " " + part(m % 60, "minute") : "");
}

/* How far below the best price a new bid must be, in naira, at `from`. The
   same rule as the server's step_to_beat, so the buttons offer prices it takes. */
function stepAt(lot, from) {
  if (!lot || !(lot.minDecrement > 0)) return 1;
  return lot.decrementIsPct ? Math.max(1, Math.floor((from * lot.minDecrement) / 100)) : lot.minDecrement;
}

export function AuctionRoom({ api, id }) {
  const { go, toast, user } = api;
  const me = user && user.supplierId;
  const [a, setA] = useState(null);
  const [lotId, setLotId] = useState(null);   // the lot on screen; the first until the vendor picks another
  const [amount, setAmount] = useState("");
  const [msg, setMsg] = useState("");
  const [extended, setExtended] = useState(0);
  const [placing, setPlacing] = useState(false);
  const [confirmLow, setConfirmLow] = useState(false);
  const [offset, setOffset] = useState(0);     // server clock minus this phone's clock
  const [failures, setFailures] = useState(0); // refreshes in a row that did not get through
  const [nonce, setNonce] = useState(0);   // bumped to re-read the room after an action
  const busy = useRef(false);   // the button and the Enter key share one guard, so one press is one bid

  const lots = (a && a.lots) || [];
  const lot = lots.find((l) => l.id === lotId) || lots[0] || null;
  const st = (((a && a.lotState) || []).find((x) => lot && x.lotId === lot.id)) || {};
  const prevMovements = usePrev(st.movements || 0);
  const prevLot = usePrev(lot ? lot.id : null);
  const prevEnds = useRef(null);
  const ranks = useRef(null);
  const live = a ? a.live : null;

  useEffect(() => {
    let stop = false;
    const poll = async () => {
      const sent = Date.now();
      try {
        const next = await raw(`/auctions/${id}/room/`);
        if (stop) return;
        /* The clock runs on the server's time, not the phone's. Measured at
           the middle of the round trip so a slow network is not read as a
           slow clock. */
        if (next.serverNow) setOffset(next.serverNow - Math.round((sent + Date.now()) / 2));
        if (prevEnds.current && next.endsAt > prevEnds.current + 1000 && next.live) {
          setExtended(next.endsAt);
          toast.info("Time added", `A bid came in near the end, so the auction now ends at ${fmtDateTime(next.endsAt)}.`);
        }
        prevEnds.current = next.endsAt;
        setFailures(0);
        setA(next);
      } catch (e) {
        /* Keep the last known room rather than blanking it, but count the
           misses so the page can say it is out of date. */
        if (!stop) setFailures((n) => n + 1);
      }
    };
    poll();
    const h = setInterval(poll, live === false ? POLL_IDLE_MS : POLL_LIVE_MS);
    // A phone that was asleep or offline re-reads at once instead of at the next tick.
    const wake = () => { if (document.visibilityState === "visible") poll(); };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", poll);
    return () => {
      stop = true; clearInterval(h);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, live, nonce]);

  /* Overtaken or back in front, announced in words, with a glyph, and only
     then in colour (see the CVD note in ui.jsx). Watched on every lot, not
     just the one on screen, so being outbid on another lot is not missed. */
  useEffect(() => {
    if (!a) return;
    const now = {};
    (a.lotState || []).forEach((s) => { now[s.lotId] = s.myRank == null ? null : s.myRank; });
    const before = ranks.current;
    ranks.current = now;
    if (!before) return;
    const many = (a.lots || []).length > 1;
    (a.lotState || []).forEach((s) => {
      const was = before[s.lotId], is = now[s.lotId];
      if (was == null || is == null || was === is) return;
      const l = (a.lots || []).find((x) => x.id === s.lotId);
      const where = many && l ? `Lot ${l.number}: ` : "";
      if (is > was) {
        cue.outbid();
        toast.warn(`▼ ${where}Outbid, now position ${is}`,
                   `You held position ${was}.${s.toLead ? ` Bid ${fmtMoney(s.toLead)} or ${a.direction === "sale" ? "more" : "less"} to take the lead back.` : ""}`);
      } else {
        cue.lead();
        toast.ok(`▲ ${where}Position ${is}${is === 1 ? ", you lead" : ""}`, `Up from position ${was}.`);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a]);

  // A price typed for one lot is not carried over to another.
  useEffect(() => { setAmount(""); setMsg(""); setConfirmLow(false); }, [lot && lot.id]);

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
  const selling = a.direction === "sale";
  const myLast = myBids.length ? myBids[myBids.length - 1] : null;
  const leading = !!st.leading;
  /* The server only leaves toLead empty for a vendor who has bid when that
     vendor already holds the best price, and it refuses a leader who bids
     again. So the leader gets a sentence, not a form. */
  const iLead = leading || (!!myLast && st.toLead == null);
  const blind = a.visibility === "blind";
  const stateColor = st.myRank ? (leading ? "var(--green)" : "var(--wax)") : "var(--muted)";
  const roomMoved = prevLot === (lot && lot.id) && (st.movements || 0) > (prevMovements || 0);
  const ceiling = lot ? lot.ceiling : null;
  const stepWords = !lot || !(lot.minDecrement > 0) ? null
    : lot.decrementIsPct ? `${lot.minDecrement}%` : fmtMoney(lot.minDecrement);
  const qtyWords = lot && lot.qty > 1 ? `${lot.qty.toLocaleString()} ${lot.uom || "units"}` : null;

  /* Built from the server's own toLead, because in rank mode the browser is
     never told the standing best and cannot work it out. If nobody has bid,
     toLead is the opening price. The leader gets no ladder at all: the server
     refuses a vendor who tries to beat their own leading price. */
  const from = iLead ? null : st.toLead;
  const quick = (from ? [from, from + (selling ? 1 : -1) * stepAt(lot, from), from + (selling ? 1 : -1) * stepAt(lot, from) * 3] : [])
    .filter((v) => v && v > 0);

  /* What the room is doing, in one word, for the header chip and the notice
     under the standing card. The server's `live` is checked first because a
     row can say "live" after its clock has run out. */
  const serverNow = Date.now() + offset;
  const phase = a.live ? "live"
    : a.status === "cancelled" ? "cancelled"
    : a.status === "paused" ? "paused"
    : a.status === "awarded" ? "awarded"
    : a.status === "draft" || a.status === "scheduled" || (a.status === "live" && (a.startsAt || 0) > serverNow) ? "notyet"
    : "ended";
  const won = lots.filter((l) => me && l.awardedTo === me);

  const typed = Number(amount) || 0;
  // More than a tenth under what would lead is usually a slipped zero, so ask once.
  const tooLow = !selling && !!(st.toLead && typed > 0 && typed < st.toLead * 0.9);

  const place = async () => {
    if (busy.current || !typed || !lot) return;
    if (tooLow && !confirmLow) { setConfirmLow(true); return; }
    busy.current = true;
    setMsg("");
    setConfirmLow(false);
    setPlacing(true);
    const seen = new Set(myBids.map((b) => b.at));
    try {
      const r = await raw(`/auctions/${a.id}/lots/${lot.id}/bid/`, {
        method: "POST", body: { amount: typed },
      });
      setAmount("");
      cue.tick();
      if (r.extended) {
        setExtended(r.endsAt);
        toast.info("Your bid added time", `It came in near the end, so the auction now ends at ${fmtDateTime(r.endsAt)}.`);
      }
      toast.ok(blind ? `Bid placed: ${fmtMoney(typed)}`
                 : r.myRank === 1 ? `▲ Bid placed, you lead at ${fmtMoney(typed)}` : `Bid placed, position ${r.myRank}`,
               "Your price stands, and you are held to it, until the auction ends.");
      prevEnds.current = r.endsAt;
      setNonce((n) => n + 1);   // "your current bid" and the quick prices, now, not at the next tick
    } catch (e) {
      if (e.status) {
        setMsg(e.message);
        toast.warn("Bid not accepted", e.message);
      } else {
        /* No answer at all: the bid may or may not have reached the server.
           Saying "rejected" here would invite a second, lower bid by mistake,
           so ask the server what it holds and report that instead. */
        setMsg("Checking whether your bid arrived…");
        try {
          const next = await raw(`/auctions/${a.id}/room/`);
          setA(next);
          setFailures(0);
          const s2 = (next.lotState || []).find((x) => x.lotId === lot.id) || {};
          const arrived = (s2.myBids || []).some((b) => b.amount === typed && !seen.has(b.at));
          if (arrived) {
            setAmount("");
            setMsg("");
            toast.ok("Your bid arrived", `${fmtMoney(typed)} is in.`);
          } else {
            setMsg(`Your bid of ${fmtMoney(typed)} did not arrive. Check your connection and press Place bid again.`);
          }
        } catch (e2) {
          setFailures((n) => n + 1);
          setMsg("We cannot reach the server to check. Your bid may not have arrived. When you are back online, look at your price history below before you bid again.");
        }
      }
    }
    busy.current = false;
    setPlacing(false);
  };

  const accept = async () => {
    try {
      await raw(`/auctions/${a.id}/accept/`, { method: "POST", body: {} });
      toast.ok("Terms accepted", "You can bid now.");
      setNonce((n) => n + 1);
    } catch (e) { toast.warn("Could not accept the terms", e.message); }
  };

  const needsAccept = a.requireAcceptance && !a.accepted;

  const many = lots.length > 1;
  const extsLeft = Math.max(0, (a.maxExtensions || 0) - (a.extensions || 0));
  const anyAward = lots.some((l) => l.awardedTo);
  const chipText = phase === "notyet" ? "Not open yet"
    : phase === "paused" ? "Paused"
    : phase === "cancelled" ? "Cancelled"
    : phase === "awarded" ? (won.length ? "You won" : anyAward ? "Not won" : "Not awarded")
    : "Time is up";
  // After the award, each lot says whether THIS vendor won it, not just that someone did.
  const awardLine = (l) => (me && l.awardedTo === me
    ? `You won${many ? ` lot ${l.number} (${l.title})` : ""} at ${fmtMoney(l.awardedAmount)}. The buyer will contact you about next steps.`
    : l.awardedTo ? `${many ? `Lot ${l.number} (${l.title})` : "This auction"} went to another vendor.`
    : `${many ? `Lot ${l.number} (${l.title})` : "This auction"} was not awarded.`);

  return (
    <div>
      <button className="btn sm" onClick={() => go({ page: "portal" })} style={{ marginBottom: 16 }}>&larr; All invitations</button>
      <div className="pagehead">
        <div>
          <div className="mono muted" style={{ marginBottom: 3 }}>{a.ref} &middot; {selling ? "SELLING AUCTION, HIGHEST BID WINS" : "REVERSE AUCTION, LOWEST PRICE WINS"}</div>
          <h1>{a.title}</h1>
        </div>
        <div className="grow" />
        {extended === a.endsAt && live && <span className="extbadge">time added</span>}
        <div style={{ textAlign: "right" }}>
          {/* The deadline is moved onto this phone's clock, so a phone set a
              few minutes wrong still counts down to the real end. */}
          {live ? <LiveCountdown deadline={a.endsAt - offset} />
                : <span className={"chip" + (phase === "awarded" && won.length ? " gold" : "")}>{chipText}</span>}
          {live && a.endsAt && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Ends {fmtDateTime(a.endsAt)}</div>}
        </div>
      </div>

      {failures >= 2 && (
        <div className="notice" role="status" style={{ marginBottom: 14, fontSize: 12.5 }}>
          Reconnecting&hellip; The figures below may be out of date until the connection is back.
        </div>
      )}

      {many && (
        <div role="group" aria-label="Lots in this auction" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          {lots.map((l) => {
            const s = ((a.lotState || []).find((x) => x.lotId === l.id)) || {};
            const tag = s.leading ? "you lead" : s.myRank ? `position ${s.myRank}`
              : (s.myBids || []).length ? "bid in" : "no bid yet";
            const on = lot && l.id === lot.id;
            return (
              <button key={l.id} className={"btn sm" + (on ? " pri" : "")} aria-pressed={on}
                      onClick={() => setLotId(l.id)}>
                Lot {l.number}: {l.title} &middot; {tag}
              </button>
            );
          })}
        </div>
      )}

      {lot && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="chead"><h3>What you&rsquo;re pricing</h3>
            {many && <span className="mono faint" style={{ marginLeft: "auto" }}>lot {lot.number} of {lots.length}</span>}
          </div>
          <div className="cbody" style={{ fontSize: 13.5, lineHeight: 1.6 }}>
            <div style={{ fontWeight: 600 }}>{lot.title}</div>
            <div className="muted">Quantity: {(lot.qty || 1).toLocaleString()} {lot.uom || ""}</div>
            {lot.description && <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{lot.description}</div>}
            <div className="notice" style={{ marginTop: 10 }}>
              {qtyWords ? <>Your price is the total for all {qtyWords}, not the price of one.</>
                        : <>Your price is the total for this lot.</>}
              {ceiling ? <> {selling ? "Bidding starts at" : "The buyer will pay at most"} <b>{fmtMoney(ceiling)}</b>, so your first bid must be that or {selling ? "more" : "less"}.</> : null}
            </div>
          </div>
        </div>
      )}
      {!lot && <div className="notice" style={{ marginBottom: 14 }}>The buyer has not added anything to price yet.</div>}

      {needsAccept && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="chead"><h3>Terms of this auction</h3></div>
          <div className="cbody" style={{ fontSize: 13.5, lineHeight: 1.6 }}>
            {a.terms
              ? <div style={{ whiteSpace: "pre-wrap", maxHeight: 320, overflowY: "auto", marginBottom: 12 }}>{a.terms}</div>
              : <div className="muted" style={{ marginBottom: 12 }}>The buyer did not write any extra terms. Accepting means you agree to the rules on this page and that every bid you place is binding.</div>}
            <div className="muted" style={{ marginBottom: 10 }}>You have to accept these terms before you can bid.</div>
            <button className="btn pri" onClick={accept}>Accept the terms</button>
          </div>
        </div>
      )}

      <div className="grid2" style={{ alignItems: "start" }}>
        <div>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="chead"><h3>Where you stand</h3>
              <span className="mono faint" style={{ marginLeft: "auto" }}>
                {a.visibility === "rank" ? "you see your position, not other prices"
                  : a.visibility === "price" ? "you see your position and the best price" : "sealed, positions are hidden"}
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
                      {leading ? (selling ? "You have the highest bid" : "You have the lowest price") : (selling ? "Someone has a higher bid" : "Someone has a lower price")}
                    </div>
                    <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                      {st.bidders ? `of ${st.bidders} vendor${st.bidders === 1 ? "" : "s"} · ` : ""}
                      your price <Money n={myLast ? myLast.amount : null} />
                      {st.best ? <> &middot; best price <Money n={st.best} /></> : null}
                    </div>
                  </>
                : <div className="muted" style={{ fontSize: 13.5 }}>
                    {myLast
                      ? <>Your bid is in: <b>{fmtMoney(myLast.amount)}</b> at {fmtDateTime(myLast.at)}.{blind ? " Positions are hidden in this auction." : ""}</>
                      : <>No bid placed yet.{st.bidders ? ` ${st.bidders} other vendor${st.bidders === 1 ? " has" : "s have"} bid.` : ""}</>}
                  </div>}
            </div>
          </div>

          {live && !needsAccept && lot && lot.status === "open" && (
            <div className="card" style={{ marginBottom: 14 }}>
              <div className="chead"><h3>Place a bid</h3>
                <span className={"mono faint" + (roomMoved ? " tickbump" : "")} style={{ marginLeft: "auto" }}>
                  {st.movements || 0} bid{st.movements === 1 ? "" : "s"} on this lot so far
                </span>
              </div>
              <div className="cbody">
                {iLead ? (
                  <div className="notice" style={{ marginBottom: 10 }}>
                    <b>You lead.</b> Nothing to do unless someone beats you. If they do, this page tells you what to bid.
                  </div>
                ) : (
                  <>
                    <div className="frow" style={{ marginBottom: 9 }}>
                      <label className="lbl" htmlFor="auc-amt">Your price{qtyWords ? ` for all ${qtyWords}` : ""}</label>
                      <div className="hint" style={{ marginTop: 0, marginBottom: 6 }}>
                        In naira.{st.toLead ? <> To take the lead, bid <b>{fmtMoney(st.toLead)}</b> or {selling ? "more" : "less"}.</> : null}
                      </div>
                      <input id="auc-amt" className="in" type="number" inputMode="numeric" value={amount}
                             onChange={(e) => { setAmount(e.target.value); setConfirmLow(false); }}
                             onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); place(); } }}
                             placeholder={String(from || "")} />
                      {typed > 0 && <div className="hint" aria-live="polite" style={{ fontWeight: 600 }}>{fmtMoney(typed)}</div>}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 11 }}>
                      {quick.map((v, i) => (
                        <button key={i} className="btn sm" onClick={() => { setAmount(String(v)); setConfirmLow(false); }}>
                          {i === 0 ? "Take the lead: " : ""}{fmtMoney(v)}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {myLast && <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
                  Your current bid: <Money n={myLast.amount} />
                </div>}
                {st.myLimit && <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
                  Automatic bidding is on: we keep you in the lead down to <Money n={st.myLimit} /> and no lower.
                </div>}
                {msg && <div className="notice" role="status" style={{ borderLeft: "3px solid var(--wax)", marginBottom: 10 }}>{msg}</div>}
                {confirmLow && tooLow && !iLead && (
                  <div className="notice" role="alert" style={{ borderLeft: "3px solid var(--wax)", marginBottom: 10 }}>
                    <b>Are you sure?</b> {fmtMoney(typed)} is {Math.round((1 - typed / st.toLead) * 100)}% below
                    the {fmtMoney(st.toLead)} you need to lead. If it wins, you are held to it.
                    <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                      <button className="btn sm pri" onClick={place} disabled={placing}>{placing ? "Placing…" : `Yes, bid ${fmtMoney(typed)}`}</button>
                      <button className="btn sm" onClick={() => setConfirmLow(false)}>Change my price</button>
                    </div>
                  </div>
                )}
                {!iLead && !(confirmLow && tooLow) && (
                  <button className="btn pri" onClick={place} disabled={!typed || placing}>{placing ? "Placing…" : "Place bid"}</button>
                )}
                <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>Every bid is binding: if it wins, you must {selling ? "buy" : "supply"} at that price.</div>
              </div>
            </div>
          )}
          {!live && (
            <div className="notice" style={{ marginBottom: 14 }}>
              {phase === "notyet"
                ? <>Not open yet.{a.startsAt ? <> Bidding opens {fmtDateTime(a.startsAt)}.</> : " The buyer has not set the opening time yet."} You can read everything here now and come back then.</>
                : phase === "paused" ? <>Paused{a.pausedReason ? `: ${a.pausedReason}` : ""}. The clock is stopped and you lose no time.</>
                : phase === "cancelled" ? <>Cancelled{a.cancelReason ? `: ${a.cancelReason}` : ""}. Nobody will be awarded from this auction.</>
                : phase === "awarded" ? lots.map((l) => <div key={l.id}>{awardLine(l)}</div>)
                : <>Time is up, waiting for the buyer to settle. You will be told the result either way.</>}
            </div>
          )}

          <div className="card" style={{ marginBottom: 14 }}>
            <div className="chead"><h3>Rules in plain words</h3></div>
            <div className="cbody" style={{ fontSize: 13, lineHeight: 1.6 }}>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                <li>The {selling ? "highest bid" : "lowest price"} leads.</li>
                <li>{stepWords ? <>Each new bid must be at least {stepWords} {selling ? "higher" : "lower"} than the best price.</>
                               : <>Each new bid just has to be {selling ? "higher" : "lower"} than the best price.</>}</li>
                {ceiling ? <li>The first bid{many ? " on this lot" : ""} can be at most {fmtMoney(ceiling)}.</li> : null}
                <li>{a.endsAt
                  ? <>Bidding ends {fmtDateTime(a.endsAt)}{a.scheduledEndsAt && a.scheduledEndsAt !== a.endsAt ? ` (it was first set for ${fmtDateTime(a.scheduledEndsAt)})` : ""}.</>
                  : <>The end time is not set yet.</>}</li>
                {a.snipeWindowMs > 0 && a.extendByMs > 0 && a.maxExtensions > 0
                  ? <li>If anyone bids in the last {plainSpan(a.snipeWindowMs)}, the end moves {plainSpan(a.extendByMs)} later so everyone can answer.{" "}
                      {extsLeft > 0 ? `This can happen ${extsLeft} more time${extsLeft === 1 ? "" : "s"}.`
                                    : "It has already moved as many times as allowed, so the end time is now fixed."}</li>
                  : <li>The end time does not move, even if someone bids at the last second.</li>}
                <li>{a.visibility === "rank" ? "You see your position, never other vendors' prices or names."
                  : a.visibility === "price" ? "You see your position and the best price, never other vendors' names."
                  : "Positions and other prices stay hidden until the end."}</li>
                <li>Every bid is binding: if it wins, you must supply at that price.</li>
              </ul>
              {a.terms && !needsAccept && (
                <details style={{ marginTop: 10 }}>
                  <summary>Read the full terms</summary>
                  <div style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>{a.terms}</div>
                </details>
              )}
            </div>
          </div>
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

      {(a.scope || (a.images || []).length > 0) && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="chead"><h3>What you are bidding on</h3>
            {(a.images || []).length > 1 && (
              <span className="mono faint" style={{ marginLeft: "auto" }}>swipe for more photos</span>
            )}
          </div>
          <div className="cbody" style={{ fontSize: 13.5, lineHeight: 1.6 }}>
            <AuctionGallery a={a} />
            {a.scope && <div style={{ marginTop: (a.images || []).length ? 12 : 0 }}>{a.scope}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
