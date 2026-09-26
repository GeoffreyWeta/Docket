/* Reverse auctions, buyer side.

   WHY THIS IS ITS OWN FILE AND NOT MORE OF buyer.jsx. An auction stopped being
   a kind of tender when it got its own models, its own endpoints and its own
   capabilities. The screens were the last part of the product still pretending
   otherwise: AuctionPage lived in buyer.jsx, was reached only from a tender
   flagged as an auction, and polled /tenders/<id>/auction/ — a route that was
   deleted in the same change that created /api/auctions/. So the whole feature
   was unreachable. Not hidden by a permission, not missing from the demo:
   there was no screen attached to the API at all, for anybody.

   This file is the screen. It reads the auction tree and nothing else, and it
   never looks a tender up.

   WHAT THE SERVER DECIDES AND THIS FILE DOES NOT. Visibility is the whole
   design of an auction and all of it is enforced at serialization:

     rank   a bidder is told their position and nothing about anyone's price
     price  a bidder also sees the standing best
     blind  a bidder sees neither

   A buyer with auction.monitor gets names and amounts; a buyer without gets
   the shape of the competition and none of its content. So this file renders
   whatever arrived and never decides what may be shown — if `leaderboard` is
   absent the reader was not entitled to it, and the correct response is to
   draw the room without it rather than to ask again.

   Mobile first, like the rest of the app: every rule outside a media query
   describes a phone. */
import React, { useEffect, useRef, useState } from "react";

import { raw } from "./api";
import { BP } from "./breakpoints";
import { Empty } from "./atoms";
import { Figures, Guide, Page, Quiet } from "./page";
import { Icon } from "./icons";
import { can } from "./perms";
import { DUR, cue, useFlip } from "./motion";
import { ConfirmDialog, Dialog, LiveCountdown } from "./ui";
import { fmtCompact, fmtDateTime, fmtMoney } from "./helpers";

/* An auction's statuses are not a tender's, so they do not borrow a tender's
   words: `closed` here means the clock ran out, not that envelopes are sealed,
   and STATUS in helpers.js would have printed exactly that. The stamp CLASSES
   are reused on purpose — those nine colours are the ones palette-check
   measures for contrast and colour-blind separation, and inventing a tenth
   would ship an unmeasured pair. */
const AUC_STATUS = {
  draft:     ["draft", "Draft"],
  scheduled: ["approval", "Scheduled"],
  live:      ["published", "Live"],
  paused:    ["paused", "Paused"],
  closed:    ["closed", "Closed"],
  awarded:   ["awarded", "Awarded"],
  cancelled: ["cancelled", "Cancelled"],
};

function AucStamp({ s }) {
  const [cls, label] = AUC_STATUS[s] || AUC_STATUS.draft;
  return <span className={"stamp st-" + cls}>{label}</span>;
}

const lotsOf = (a) => (a && a.lots) || [];
const stateOf = (a, lotId) => ((a && a.lotState) || []).find((s) => s.lotId === lotId) || {};

/* ------------------------------------------------------------------ the poll

   One request per tick for the whole room: the head, the figures and the
   standings all read the same object, so they can never disagree with each
   other the way three separate fetches would. */
function useRoom(api, id) {
  const { toast } = api;
  const [a, setA] = useState(null);
  const [err, setErr] = useState("");
  const [moved, setMoved] = useState(new Set());
  const [extended, setExtended] = useState(0);
  const prevAmounts = useRef(new Map());
  const prevLeader = useRef(null);
  const prevEnds = useRef(null);
  const [nonce, setNonce] = useState(0);
  const live = a ? a.live : null;
  const status = a ? a.status : null;

  useEffect(() => {
    if (!id) return undefined;
    let stop = false;

    const poll = async () => {
      try {
        const next = await raw(`/auctions/${id}/room/`);
        if (stop) return;
        /* The board is per lot now. Leader and movement cues are drawn from
           every lot at once, so a room with three lots announces a new leader
           on any of them rather than only on whichever one is on screen. */
        const board = (next.lotState || []).flatMap((s) => s.leaderboard || []);
        const changed = new Set(board
          .filter((x) => prevAmounts.current.size > 0 &&
                         prevAmounts.current.get(x.supplierId) !== x.amount)
          .map((x) => x.supplierId));
        if (changed.size) {
          setMoved(changed);
          setTimeout(() => setMoved(new Set()), DUR.ceremony);
        }
        const top = board.filter((x) => x.rank === 1)[0] || null;
        const leader = top ? top.supplierId : null;
        if (prevLeader.current && leader && leader !== prevLeader.current) {
          cue.tick();
          toast.info("New leader in the auction",
                     `${top.supplier} now holds the best price at ${fmtCompact(top.amount)}.`);
        }
        /* An extension is the clock moving forward while the room is open. A
           second of slack, because the server's clock and ours are not the
           same clock and a 3ms drift is not an anti-snipe event. */
        if (prevEnds.current && next.endsAt > prevEnds.current + 1000 && next.live) {
          setExtended(next.endsAt);
          toast.info("Close extended", "A bid landed inside the closing window, so the deadline moved out.");
        }
        prevAmounts.current = new Map(board.map((x) => [x.supplierId, x.amount]));
        prevLeader.current = leader;
        prevEnds.current = next.endsAt;
        setErr("");
        setA(next);
      } catch (e) {
        /* Keep the last good room on screen through a blip: a live auction
           that blanks itself because one poll timed out is worse than one
           showing prices two seconds stale. Only say so if nothing arrived. */
        if (!stop && !a) setErr(e.message || "Could not load the auction.");
      }
    };

    poll();
    /* A DRAFT IS NOT POLLED. The other states are a market and are read like
       one, but a draft is a form somebody is typing into, and a poll that
       replaces the auction object under them takes the cursor with it. Drafts
       refresh when a mutation says something changed, and not otherwise. */
    const idle = status === "draft" || status === "scheduled";
    const h = idle ? 0 : setInterval(poll, live === false ? 10000 : 2500);
    return () => { stop = true; if (h) clearInterval(h); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, live, status, nonce]);

  return { a, err, moved, extended, refresh: () => setNonce((n) => n + 1) };
}

/* ------------------------------------------------------------------ the list */

export function AuctionsPage({ api }) {
  const { user, go, toast } = api;
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [draft, setDraft] = useState(null);      // the new-auction dialog
  const [making, setMaking] = useState(false);

  useEffect(() => {
    let active = true;
    raw("/auctions/")
      .then((d) => { if (active) setRows(d.auctions || []); })
      .catch((e) => { if (active) setErr(e.message || "Could not load auctions."); });
    return () => { active = false; };
  }, []);


  /* Create takes a title and nothing else. Everything that shapes an auction
     needs somewhere with room to explain itself, and a modal that asks for
     eleven fields before it will give you an object is a modal people abandon.
     The draft page is that somewhere. */
  const newDialog = draft && (
    <Dialog title="Draft an auction" onClose={() => setDraft(null)} footer={
      <>
        <button className="btn" onClick={() => setDraft(null)}>Cancel</button>
        <button className="btn pri" disabled={!draft.title.trim() || making}
                onClick={async () => {
                  setMaking(true);
                  try {
                    const made = await raw("/auctions/new/", { method: "POST", body: { title: draft.title.trim() } });
                    setDraft(null);
                    go({ page: "auction", id: made.id });
                  } catch (e) {
                    toast.warn("Could not create the auction", e.message || "");
                  } finally { setMaking(false); }
                }}>{making ? "Creating\u2026" : "Create the draft"}</button>
      </>
    }>
      <div className="frow">
        <label className="lbl" htmlFor="ac-new">What is being bought</label>
        <input id="ac-new" className="in" autoFocus value={draft.title}
               onChange={(e) => setDraft({ title: e.target.value })}
               placeholder="e.g. Diesel supply for store generators" />
        <div className="hint">You add the lots, the clock and the vendors next. Nothing is published yet.</div>
      </div>
    </Dialog>
  );

  const open = (a) => go({ page: "auction", id: a.id });
  const liveOnes = (rows || []).filter((a) => a.status === "live").length;
  const monitor = can(user, "auction.monitor");

  const guide = (
    <Guide art="chart"
           headline={liveOnes ? "A room is open" : "Reverse auctions"}
           why={monitor
             ? "Prices move live and every movement is on the record. You see names and amounts; bidders see only their own rank."
             : "You can see that a competition is running. Watching the prices and the names needs the monitor capability."}
           items={can(user, "auction.create")
             ? [{ key: "new", label: "Draft an auction",
                  note: "Lots, ceiling, decrement and the clock, then invite the room.",
                  onPick: () => setDraft({ title: "" }) }]
             : []}>
      <Figures>
        <Quiet n={rows ? rows.length : "—"} label="auctions" />
        <Quiet n={rows ? liveOnes : "—"} label="open now"
               tone={liveOnes ? "var(--green)" : undefined} />
      </Figures>
    </Guide>
  );

  if (err) return <Page guide={guide}>{newDialog}<Empty art="chart">{err}</Empty></Page>;
  if (!rows) return <Page guide={guide}>{newDialog}<Empty art="chart">Loading auctions…</Empty></Page>;
  if (!rows.length) {
    return (
      <Page guide={guide}>
        {newDialog}
        <Empty art="chart">
          No reverse auctions yet.
          {can(user, "auction.create") && " An auction is for a price-only requirement where several vendors can quote the same thing."}
        </Empty>
      </Page>
    );
  }

  return (
    <Page guide={guide} wide>
      {newDialog}
      <div className="pagehead">
        <div><h1>Auctions</h1></div>
        <div className="grow" />
        {can(user, "auction.create") &&
          <button className="btn pri" onClick={() => setDraft({ title: "" })}>Draft an auction</button>}
      </div>
      <ul className="auclist">
        {rows.map((a) => {
          const lots = lotsOf(a);
          const ceiling = lots.reduce((n, l) => n + (l.ceiling || 0), 0);
          return (
            <li key={a.id}>
              <button className="aucrow" onClick={() => open(a)}>
                <span className="aucref mono">{a.ref}</span>
                <span className="auctitle">
                  <b>{a.title}</b>
                  <small>{lots.length} {lots.length === 1 ? "lot" : "lots"}
                    {ceiling ? ` · ceiling ${fmtCompact(ceiling)}` : ""}
                    {a.participants != null ? ` · ${a.participants} invited` : ""}</small>
                </span>
                <span className="aucstate">
                  <AucStamp s={a.status} />
                  {a.status === "live" && a.endsAt
                    ? <LiveCountdown deadline={a.endsAt} className="mono" />
                    : <span className="mono faint">{a.movements != null ? `${a.movements} movements` : ""}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Page>
  );
}

/* ------------------------------------------------------------------ the room */

/** The standings for one lot. Absent when the reader has no auction.monitor,
    which is a permission answer rather than an empty state. */
function Standings({ st, moved, monitor }) {
  const body = useRef(null);
  const board = st.leaderboard || [];
  useFlip(body, board.map((x) => x.supplierId).join("|"));

  if (!monitor) {
    return (
      <Empty art="sealed">
        {st.bidders ? `${st.bidders} bidders are in this lot.` : "Nobody has bid in this lot yet."}
        {" "}Seeing who they are and what they bid needs the monitor capability.
      </Empty>
    );
  }
  if (!board.length) return <Empty art="chart">No bids in this lot yet.</Empty>;

  return (
    <table className="tbl wide aucboard">
      <thead>
        <tr><th className="num">#</th><th>Supplier</th><th className="num">Price</th><th>Placed</th></tr>
      </thead>
      <tbody ref={body}>
        {board.map((r) => (
          <tr key={r.supplierId} className={moved.has(r.supplierId) ? "aucmoved" : ""}>
            <td className="num mono">{r.rank}</td>
            <td>{r.supplier}{r.rank === 1 && <span className="aucbest">best</span>}</td>
            <td className="num money">{fmtMoney(r.amount)}</td>
            <td className="mono faint aucwhen">
              {r.at ? fmtDateTime(r.at) : ""}
              {r.kind && r.kind !== "manual" && <span className="aucauto" title="Placed by a standing limit">auto</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ------------------------------------------------------------ the draft

   THE SHAPING PAGE. An auction is created empty and then made ready, which is
   the order the server enforces: engine.open_auction refuses a room with no
   lot, no vendor, or no closing time. So the page is those four things and a
   checklist that reads exactly like that function, in the same order, saying
   which of them is still missing.

   That mirroring is deliberate and it is the same pattern the sealed-bid room
   uses. A button that is merely disabled tells a buyer something is wrong and
   not what, on the one screen where getting it wrong means a room nobody can
   bid in. */

const HOUR = 3600000;

/** datetime-local wants "YYYY-MM-DDTHH:mm" in LOCAL time, and an ISO string is
    UTC, so a naive toISOString().slice() silently shifts a Lagos deadline by an
    hour. Subtract the offset first. */
const toLocalInput = (ms) => {
  if (!ms) return "";
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
};

function Ready({ ok, children }) {
  return (
    <div className={"aucready" + (ok ? " on" : "")}>
      <span aria-hidden="true">{ok ? <Icon n="check" s={13} /> : <i />}</span>
      <span>{children}</span>
    </div>
  );
}

function DraftAuction({ api, a, refresh }) {
  const { state, user, go, toast } = api;
  const [f, setF] = useState({
    title: a.title, ref: a.ref, scope: a.scope || "", terms: a.terms || "",
    visibility: a.visibility, ceilingVisible: !!a.ceilingVisible,
    requireAcceptance: !!a.requireAcceptance,
    endsAt: toLocalInput(a.endsAt),
    snipeWindowMs: a.snipeWindowMs || 120000,
    extendByMs: a.extendByMs || 120000,
    maxExtensions: a.maxExtensions == null ? 20 : a.maxExtensions,
  });
  const [lot, setLot] = useState({ title: "", qty: 1, uom: "", ceiling: "", reserve: "", minDecrement: "" });
  const [parts, setParts] = useState([]);
  const [pick, setPick] = useState([]);
  const [busy, setBusy] = useState("");
  const [askOpen, setAskOpen] = useState(false);

  const canEdit = can(user, "auction.edit");
  const canInvite = can(user, "auction.invite");
  const lots = lotsOf(a);

  const loadParts = () => raw(`/auctions/${a.id}/participants/`)
    .then((d) => setParts(d.participants || []))
    .catch(() => { /* the picker still works, it just cannot show who is in */ });
  useEffect(() => { if (canInvite) loadParts(); /* eslint-disable-next-line */ }, [a.id, canInvite]);

  const call = async (path, body, done, opts) => {
    setBusy(path);
    try {
      await raw(`/auctions/${a.id}${path}`, { method: (opts && opts.method) || "POST", body: body || {} });
      if (done) toast.ok(done);
      refresh();
      if (canInvite) loadParts();
      return true;
    } catch (e) {
      toast.warn("That did not go through", e.message || "");
      return false;
    } finally { setBusy(""); }
  };

  const saveDetails = () => call("/", {
    title: f.title, ref: f.ref, scope: f.scope, terms: f.terms,
    visibility: f.visibility, ceilingVisible: f.ceilingVisible,
    requireAcceptance: f.requireAcceptance,
    endsAt: f.endsAt ? new Date(f.endsAt).getTime() : 0,
    snipeWindowMs: Number(f.snipeWindowMs) || 0,
    extendByMs: Number(f.extendByMs) || 0,
    maxExtensions: Number(f.maxExtensions) || 0,
  }, "Saved.", { method: "PATCH" });

  const addLot = async () => {
    const ok = await call("/lots/", {
      title: lot.title, qty: Number(lot.qty) || 1, uom: lot.uom,
      ceiling: Number(lot.ceiling) || 0,
      reserve: lot.reserve === "" ? "" : Number(lot.reserve),
      minDecrement: Number(lot.minDecrement) || 0,
    }, "Lot added.");
    if (ok) setLot({ title: "", qty: 1, uom: "", ceiling: "", reserve: "", minDecrement: "" });
  };

  const invite = async () => {
    if (!pick.length) return;
    const ok = await call("/participants/", { supplierIds: pick },
                          `${pick.length} vendor${pick.length === 1 ? "" : "s"} invited.`);
    if (ok) setPick([]);
  };

  const invited = new Set(parts.map((x) => x.supplierId));
  const available = (state.suppliers || []).filter((x) => !invited.has(x.id));

  /* The same four conditions engine.open_auction checks, in its order. */
  const hasLot = lots.length > 0;
  const hasVendor = parts.length > 0 || (a.participants || 0) > 0;
  const hasClock = !!f.endsAt;
  const ready = hasLot && hasVendor && hasClock;

  const guide = (
    <Guide art="draft"
           headline={ready ? "Ready to open" : "Not ready yet"}
           why={ready
             ? "Opening starts the clock and invites cannot be taken back. Bidders price against what you publish here."
             : "A room with no lot, no vendor or no closing time is a room nobody can bid in, and the server will refuse to open it."}
           items={ready && can(user, "auction.open")
             ? [{ key: "open", label: "Open the room", note: "Starts the clock now.", onPick: () => setAskOpen(true) }]
             : []}>
      <div className="aucchecks">
        <Ready ok={!!f.title}>A title</Ready>
        <Ready ok={hasLot}>At least one lot</Ready>
        <Ready ok={hasVendor}>At least one vendor invited</Ready>
        <Ready ok={hasClock}>A closing time</Ready>
      </div>
    </Guide>
  );

  return (
    <Page guide={guide} wide>
      <button className="btn sm" style={{ marginBottom: 14 }}
              onClick={() => go({ page: "auctions" })}>&larr; All auctions</button>
      <div className="pagehead" style={{ marginBottom: 12 }}>
        <div>
          <h1>{a.title}</h1>
          <p className="mono faint">{a.ref} &middot; draft</p>
        </div>
        <div className="grow" />
        <AucStamp s={a.status} />
      </div>

      {!canEdit && (
        <div className="notice" style={{ marginBottom: 14 }}>
          You can see this draft but not change it. Shaping an auction needs the edit capability.
        </div>
      )}

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="chead"><h3>What is being bought</h3></div>
        <div className="cbody">
          <div className="grid g2" style={{ marginBottom: 12 }}>
            <div className="frow"><label className="lbl" htmlFor="ac-title">Title</label>
              <input id="ac-title" className="in" value={f.title} disabled={!canEdit}
                     onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
            <div className="frow"><label className="lbl" htmlFor="ac-ref">Reference</label>
              <input id="ac-ref" className="in mono" value={f.ref} disabled={!canEdit}
                     onChange={(e) => setF({ ...f, ref: e.target.value })} /></div>
          </div>
          <div className="frow" style={{ marginBottom: 12 }}>
            <label className="lbl" htmlFor="ac-scope">Scope</label>
            <textarea id="ac-scope" className="in" rows={3} value={f.scope} disabled={!canEdit}
                      onChange={(e) => setF({ ...f, scope: e.target.value })} />
            <div className="hint">What the winner will actually have to deliver.</div>
          </div>
          <div className="frow">
            <label className="lbl" htmlFor="ac-terms">Terms</label>
            <textarea id="ac-terms" className="in" rows={3} value={f.terms} disabled={!canEdit}
                      onChange={(e) => setF({ ...f, terms: e.target.value })} />
            <div className="hint">Bidders read this before their first bid. Say what they see of each other.</div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="chead"><h3>The rules of the room</h3></div>
        <div className="cbody">
          <div className="grid g2" style={{ marginBottom: 12 }}>
            <div className="frow"><label className="lbl" htmlFor="ac-vis">What a bidder sees</label>
              <select id="ac-vis" className="in" value={f.visibility} disabled={!canEdit}
                      onChange={(e) => setF({ ...f, visibility: e.target.value })}>
                <option value="rank">Their rank, and no prices</option>
                <option value="price">Their rank and the best price</option>
                <option value="blind">Neither</option>
              </select>
              <div className="hint">
                {f.visibility === "rank"
                  ? "The default, and the safest. Rank drives the price down without teaching your vendors each other's cost base."
                  : f.visibility === "price"
                    ? "Faster, but every bidder leaves knowing what the winner charges."
                    : "Nobody learns anything, including whether bidding again is worth it."}
              </div></div>
            <div className="frow"><label className="lbl" htmlFor="ac-ends">Closes at</label>
              <input id="ac-ends" className="in" type="datetime-local" value={f.endsAt} disabled={!canEdit}
                     onChange={(e) => setF({ ...f, endsAt: e.target.value })} />
              <div className="hint">Anti-sniping can push this out. It never pulls it in.</div></div>
          </div>
          <div className="grid g3" style={{ marginBottom: 12 }}>
            <div className="frow"><label className="lbl" htmlFor="ac-snipe">Closing window (minutes)</label>
              <input id="ac-snipe" className="in" type="number" min="0" disabled={!canEdit}
                     value={Math.round((f.snipeWindowMs || 0) / 60000)}
                     onChange={(e) => setF({ ...f, snipeWindowMs: Number(e.target.value) * 60000 })} /></div>
            <div className="frow"><label className="lbl" htmlFor="ac-ext">Extend by (minutes)</label>
              <input id="ac-ext" className="in" type="number" min="0" disabled={!canEdit}
                     value={Math.round((f.extendByMs || 0) / 60000)}
                     onChange={(e) => setF({ ...f, extendByMs: Number(e.target.value) * 60000 })} /></div>
            <div className="frow"><label className="lbl" htmlFor="ac-max">At most</label>
              <input id="ac-max" className="in" type="number" min="0" disabled={!canEdit}
                     value={f.maxExtensions}
                     onChange={(e) => setF({ ...f, maxExtensions: e.target.value })} />
              <div className="hint">extensions</div></div>
          </div>
          <div className="hint" style={{ marginBottom: 12 }}>
            A bid inside the closing window pushes the close out, so the auction ends when
            bidding stops rather than when the clock runs out. Set the window to zero to turn it off.
          </div>
          {/* .checkline is the app's checkbox row and it is inline-flex, so two
              of them in a row run together on one line. The wrapper stacks
              them; the class itself is left alone because every other form in
              the product puts one checkbox in a .frow of its own. */}
          <div className="aucopts">
            <label className="checkline"><input type="checkbox" checked={f.ceilingVisible} disabled={!canEdit}
                   onChange={(e) => setF({ ...f, ceilingVisible: e.target.checked })} />
              <span>Show the opening price to bidders before the room opens</span></label>
            <label className="checkline"><input type="checkbox" checked={f.requireAcceptance} disabled={!canEdit}
                   onChange={(e) => setF({ ...f, requireAcceptance: e.target.checked })} />
              <span>Make bidders accept the terms before they can bid</span></label>
          </div>
          {canEdit && (
            <div style={{ marginTop: 14 }}>
              <button className="btn" onClick={saveDetails} disabled={!!busy}>
                {busy === "/" ? "Saving…" : "Save"}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="chead"><h3>Lots</h3>
          <span className="mono faint" style={{ marginLeft: "auto" }}>{lots.length} on this auction</span>
        </div>
        <div className="cbody">
          {lots.length > 0 && (
            <table className="tbl wide" style={{ marginBottom: 14 }}>
              <thead><tr><th className="num">#</th><th>Lot</th><th className="num">Opening price</th>
                <th className="num">Reserve</th><th className="num">Step</th><th /></tr></thead>
              <tbody>
                {lots.map((l) => (
                  <tr key={l.id}>
                    <td className="num mono">{l.number}</td>
                    <td>{l.title}<div className="hint" style={{ marginTop: 2 }}>{l.qty} {l.uom}</div></td>
                    <td className="num money">{fmtMoney(l.ceiling)}</td>
                    <td className="num money">{l.reserve ? fmtMoney(l.reserve) : <span className="faint">none</span>}</td>
                    <td className="num money">{l.minDecrement ? fmtMoney(l.minDecrement) : <span className="faint">none</span>}</td>
                    <td className="num">{canEdit && (
                      <button className="btn sm iconly" aria-label={"Remove lot " + l.number}
                              onClick={() => call(`/lots/${l.id}/delete/`, {}, "Lot removed.")}>
                        <Icon n="close" s={12} />
                      </button>)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!lots.length && <Empty art="clear">No lots yet. One lot is one thing being priced, with its own opening price and its own winner.</Empty>}

          {canEdit && (
            <>
              <div className="grid g2" style={{ marginTop: 12 }}>
                <div className="frow"><label className="lbl" htmlFor="ac-lt">What is this lot</label>
                  <input id="ac-lt" className="in" value={lot.title}
                         onChange={(e) => setLot({ ...lot, title: e.target.value })}
                         placeholder="e.g. AGO (diesel), 128 sites, 12 months" /></div>
                <div className="frow"><label className="lbl" htmlFor="ac-lc">Opening price</label>
                  <input id="ac-lc" className="in" type="number" value={lot.ceiling}
                         onChange={(e) => setLot({ ...lot, ceiling: e.target.value })}
                         placeholder="the most you will pay" /></div>
              </div>
              <div className="grid g3">
                <div className="frow"><label className="lbl" htmlFor="ac-lr">Reserve (optional)</label>
                  <input id="ac-lr" className="in" type="number" value={lot.reserve}
                         onChange={(e) => setLot({ ...lot, reserve: e.target.value })} />
                  <div className="hint">Never shown to bidders.</div></div>
                <div className="frow"><label className="lbl" htmlFor="ac-ld">Minimum step</label>
                  <input id="ac-ld" className="in" type="number" value={lot.minDecrement}
                         onChange={(e) => setLot({ ...lot, minDecrement: e.target.value })} />
                  <div className="hint">How much a bid must beat the best by.</div></div>
                <div className="frow"><label className="lbl" htmlFor="ac-lq">Quantity and unit</label>
                  <div className="formrow">
                    <input id="ac-lq" className="in" type="number" min="1" style={{ maxWidth: 90 }} value={lot.qty}
                           onChange={(e) => setLot({ ...lot, qty: e.target.value })} />
                    <input className="in" value={lot.uom} aria-label="Unit"
                           onChange={(e) => setLot({ ...lot, uom: e.target.value })} placeholder="year, tonne, each" />
                  </div></div>
              </div>
              <div className="gaterow" style={{ marginTop: 12 }}>
                <button className="btn" onClick={addLot}
                        disabled={!lot.title.trim() || !(Number(lot.ceiling) > 0) || !!busy}>
                  {busy === "/lots/" ? "Adding…" : "Add lot"}
                </button>
                {!lot.title.trim() ? <span className="hint gatehint">The lot needs a title.</span>
                  : !(Number(lot.ceiling) > 0) ? <span className="hint gatehint">An opening price above zero. A reverse auction with no ceiling is an invitation to bid anything and negotiate afterwards.</span>
                  : null}
              </div>
            </>
          )}
        </div>
      </div>

      {canInvite && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="chead"><h3>Who may bid</h3>
            <span className="mono faint" style={{ marginLeft: "auto" }}>{parts.length} invited</span>
          </div>
          <div className="cbody">
            {parts.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                {parts.map((x) => (
                  <div className="docrow" key={x.id}>
                    <span>{x.supplier}</span>
                    {x.disqualified && <span className="chip warn">removed{x.reason ? ` · ${x.reason}` : ""}</span>}
                    <span style={{ flex: 1 }} />
                    {!x.disqualified && (
                      <button className="btn sm" onClick={() => call(`/participants/${x.id}/disqualify/`,
                              { reason: "Removed before the room opened" }, "Vendor removed.")}>Remove</button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {!parts.length && <Empty art="tray">Nobody invited yet. A reverse auction needs enough vendors that the price actually has somewhere to go.</Empty>}

            <label className="lbl" htmlFor="ac-pick" style={{ marginTop: 12 }}>Invite from your register</label>
            <select id="ac-pick" className="in" multiple size={Math.min(8, Math.max(3, available.length))}
                    value={pick} onChange={(e) => setPick([...e.target.selectedOptions].map((o) => o.value))}>
              {available.map((x) => <option key={x.id} value={x.id}>{x.name}{x.category ? ` — ${x.category}` : ""}</option>)}
            </select>
            <div className="hint">Hold Ctrl or Cmd to pick several. {available.length} vendor(s) not yet invited.</div>
            <div style={{ marginTop: 12 }}>
              <button className="btn" onClick={invite} disabled={!pick.length || !!busy}>
                {busy === "/participants/" ? "Inviting…" : pick.length ? `Invite ${pick.length}` : "Invite"}
              </button>
            </div>
          </div>
        </div>
      )}

      {can(user, "auction.open") && (
        <div className="card">
          <div className="chead"><h3>Open the room</h3></div>
          <div className="cbody">
            <div className="aucchecks" style={{ marginBottom: 12 }}>
              <Ready ok={hasLot}>{lots.length || "No"} lot{lots.length === 1 ? "" : "s"}</Ready>
              <Ready ok={hasVendor}>{parts.length || "No"} vendor{parts.length === 1 ? "" : "s"} invited</Ready>
              <Ready ok={hasClock}>{hasClock ? "Closes " + new Date(f.endsAt).toLocaleString("en-GB") : "No closing time"}</Ready>
            </div>
            <button className="btn pri" disabled={!ready || !!busy} onClick={() => setAskOpen(true)}>Open the room</button>
            {!ready && <div className="hint" style={{ marginTop: 8 }}>
              Everything above has to be ticked. The server checks the same three things and will refuse otherwise.
            </div>}
            {hasClock && f.endsAt && new Date(f.endsAt).getTime() < Date.now() + HOUR && (
              <div className="hint" style={{ marginTop: 8, color: "var(--wax)" }}>
                That closing time is less than an hour away. Vendors need time to see the invitation.
              </div>
            )}
          </div>
        </div>
      )}

      {askOpen && (
        <ConfirmDialog title="Open the room?" confirmLabel="Open it" tone="pri"
                       onClose={() => setAskOpen(false)}
                       onConfirm={async () => {
                         const ok = await call("/open/", {}, "The room is open.");
                         if (ok) refresh();
                       }}>
          The clock starts now and invited vendors can bid. The rules stop being editable:
          bidders price against what you published, so changing them afterwards would mean
          pausing and cancelling instead.
        </ConfirmDialog>
      )}
    </Page>
  );
}

export function AuctionPage({ api, id }) {
  const { user, go, toast } = api;
  const { a, err, moved, extended, refresh } = useRoom(api, id);
  const [lotId, setLotId] = useState(null);
  const [ask, setAsk] = useState(null);

  const lots = lotsOf(a);
  const lot = lots.find((l) => l.id === lotId) || lots[0] || null;
  const st = lot ? stateOf(a, lot.id) : {};
  const monitor = can(user, "auction.monitor");

  if (err && !a) return <Empty art="chart">{err}</Empty>;
  if (!a) return <Empty art="chart">Opening the room…</Empty>;
  /* A draft is a form, not a room. Same route, because it is the same auction
     and the reader should not have to know which stage it is at to find it. */
  if (a.status === "draft" || a.status === "scheduled") {
    return <DraftAuction api={api} a={a} refresh={refresh} />;
  }

  const live = a.live;
  const best = (st.leaderboard || [])[0];

  /* Lifecycle. Each of these is a recorded event on the server, so the button
     asks first and says what it will do rather than doing it on one click. */
  /* ConfirmDialog owns the busy state and closes itself when onConfirm
     settles, so this only has to do the call and say what happened. */
  const run = async (path, body, done) => {
    try {
      await raw(`/auctions/${a.id}/${path}/`, { method: "POST", body: body || {} });
      toast.ok(done);
    } catch (e) {
      toast.warn("That did not go through", e.message || "");
    }
  };

  const items = [];
  if (live && can(user, "auction.lifecycle")) {
    items.push({ key: "pause", label: "Pause the room",
                 note: "Stops the clock. Bidders are told why.",
                 onPick: () => setAsk("pause") });
    items.push({ key: "close", label: "Close it early",
                 note: "Settles every lot against its reserve. No further bids.",
                 onPick: () => setAsk("close") });
  }
  if (a.status === "paused" && can(user, "auction.lifecycle")) {
    items.push({ key: "resume", label: "Resume the room",
                 note: "Restarts the clock where it stopped.",
                 onPick: () => setAsk("resume") });
  }
  if (a.status === "closed" && can(user, "auction.award")) {
    items.push({ key: "award", label: "Award the auction",
                 note: "Commits to the winning price on every lot.",
                 onPick: () => setAsk("award") });
  }

  const guide = (
    <Guide art={live ? "chart" : "clear"} tone={a.status === "awarded" ? "good" : undefined}
           headline={live ? "The room is open"
             : a.status === "paused" ? "The room is paused"
             : a.status === "awarded" ? "Awarded"
             : a.status === "cancelled" ? "Abandoned"
             : a.status === "scheduled" ? "Not open yet" : "The auction has closed"}
           why={live
             ? "Bidders see their own rank and never a competitor's price. Every movement is written to the record as it happens."
             : a.status === "scheduled"
               ? "The room opens on its start time, or when somebody with the open capability starts it."
               : a.status === "awarded"
                 ? "The winning prices are committed. The award is on the chain with the standings that produced it."
                 : "No further bids can land. The standings are final."}
           items={items}>
      <Figures>
        <Quiet n={a.participants != null ? a.participants : "—"} label="invited" />
        <Quiet n={a.movements != null ? a.movements : "—"} label="price movements" />
        <Quiet n={best ? fmtCompact(best.amount) : "—"} label="best price"
               tone={best ? "var(--green)" : undefined} />
        <Quiet n={a.extensions || 0} label="extensions used" />
      </Figures>
    </Guide>
  );

  return (
    <Page guide={guide} wide>
      <button className="btn sm" style={{ marginBottom: 14 }}
              onClick={() => go({ page: "auctions" })}>← All auctions</button>

      <div className="pagehead" style={{ marginBottom: 12 }}>
        <div>
          <h1>{a.title}</h1>
          <p className="mono faint">{a.ref} · {a.visibility === "rank" ? "rank visible, prices private"
            : a.visibility === "price" ? "best price visible" : "blind"}</p>
        </div>
        <div className="aucclock">
          <AucStamp s={a.status} />
          {live && a.endsAt && <LiveCountdown deadline={a.endsAt} className="mono" />}
          {extended === a.endsAt && live && <span className="extbadge">anti-snipe</span>}
        </div>
      </div>

      {a.pausedAt && a.status === "paused" && (
        <div className="notice" style={{ marginBottom: 14 }}>
          Paused{a.pausedReason ? `: ${a.pausedReason}` : "."} The clock is stopped and no bid can land.
        </div>
      )}

      {/* A lot selector, and only when there is a choice to make. A single-lot
          auction is the common case and a tab strip over one tab is furniture. */}
      {lots.length > 1 && (
        <div className="segmented auclots">
          {lots.map((l) => (
            <button key={l.id} aria-pressed={l.id === lot.id} onClick={() => setLotId(l.id)}>
              {l.number}. {l.title}
            </button>
          ))}
        </div>
      )}

      {lot && (
        <div className="card">
          <div className="chead">
            <h3>{live ? "Live standings" : "Final standings"}</h3>
            <span className="mono faint" style={{ marginLeft: "auto" }}>
              {lot.ceiling ? `ceiling ${fmtCompact(lot.ceiling)}` : ""}
              {lot.reserve ? ` · reserve ${fmtCompact(lot.reserve)}` : ""}
              {lot.minDecrement ? ` · step ${fmtCompact(lot.minDecrement)}` : ""}
            </span>
          </div>
          <div className="cbody">
            <Standings st={st} moved={moved} monitor={monitor} />
          </div>
        </div>
      )}

      {ask && (
        <ConfirmDialog
          title={ask === "pause" ? "Pause the room?" : ask === "resume" ? "Resume the room?"
            : ask === "close" ? "Close the auction early?" : "Award this auction?"}
          confirmLabel={ask === "close" ? "Close it" : ask === "award" ? "Award" : "Confirm"}
          tone={ask === "close" || ask === "award" ? "wax" : "pri"}
          onClose={() => setAsk(null)}
          onConfirm={() => {
            if (ask === "pause") return run("pause", { reason: "Paused from the room" }, "The room is paused.");
            if (ask === "resume") return run("resume", {}, "The room is open again.");
            if (ask === "close") return run("close", {}, "The auction is closed.");
            return run("award", {}, "The auction is awarded.");
          }}>
          {ask === "close"
            ? "Every lot settles against its reserve and no further bid can land. This is on the record."
            : ask === "award"
              ? "This commits to the winning price on every lot that met its reserve."
              : "Bidders are told the room's state changed."}
        </ConfirmDialog>
      )}
    </Page>
  );
}

export const AUCTION_CSS = `
/* The list. Rows rather than cards: an auction list is read down the status
   column, and cards put four of those on one line and then wrap. */
.auclist{list-style:none;margin:0;padding:0;border-top:1px solid var(--line)}
.auclist li{border-bottom:1px solid var(--line)}
.aucrow{display:grid;grid-template-columns:1fr;gap:6px;width:100%;text-align:left;
  background:none;border:0;font:inherit;color:inherit;padding:14px 4px;cursor:pointer}
.aucrow:hover{background:var(--btn-hover)}
.aucref{font-size:12px;color:var(--faint)}
.auctitle b{display:block;font-weight:600;letter-spacing:-.01em}
.auctitle small{display:block;color:var(--muted);font-size:12.5px;margin-top:2px}
.aucstate{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:12.5px}

.aucclock{display:flex;align-items:center;gap:10px;flex-wrap:wrap}

/* The readiness list, which is the same three conditions the server checks
   before it will open a room. Unticked is an empty ring rather than a cross:
   nothing here has gone wrong, it has just not been done yet. */
.aucopts{display:grid;gap:2px;justify-items:start}
.aucchecks{display:grid;gap:7px}
.aucready{display:flex;align-items:flex-start;gap:9px;font-size:13px;color:var(--muted);line-height:1.4}
.aucready.on{color:var(--ink)}
.aucready>span:first-child{flex:none;width:18px;height:18px;border-radius:50%;display:grid;
  place-items:center;background:var(--sunk);color:var(--muted);margin-top:1px}
.aucready.on>span:first-child{background:var(--green-tint);color:var(--green)}
.aucready>span:first-child i{width:7px;height:7px;border-radius:50%;
  box-shadow:inset 0 0 0 1.5px var(--line2)}
.auclots{margin-bottom:14px;overflow-x:auto}

/* A row that just changed price. The flash is on the background rather than
   the text, so a figure never becomes briefly unreadable while it moves. */
.aucboard tbody tr{transition:background var(--t) var(--ease)}
.aucmoved{background:var(--green-tint)}
.aucwhen{white-space:nowrap}
.aucauto{margin-left:7px;font-size:10px;letter-spacing:.04em;text-transform:uppercase;
  color:var(--muted);border:1px solid var(--line2);border-radius:var(--r-xs);padding:1px 5px}
.aucbest{margin-left:8px;font-size:10.5px;font-weight:600;letter-spacing:.04em;
  text-transform:uppercase;color:var(--green);border:1px solid var(--chip-ok-line);
  border-radius:var(--r-xs);padding:1px 6px}

@media(min-width:${BP.tab}px){
  .aucrow{grid-template-columns:130px minmax(0,1fr) auto;align-items:center;gap:16px;padding:14px 8px}
  .aucstate{justify-content:flex-end;min-width:210px}
}
`;
