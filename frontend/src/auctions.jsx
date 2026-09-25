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
import { ConfirmDialog, LiveCountdown } from "./ui";
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
  const live = a ? a.live : null;

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
    const h = setInterval(poll, live === false ? 10000 : 2500);
    return () => { stop = true; clearInterval(h); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, live]);

  return { a, err, moved, extended };
}

/* ------------------------------------------------------------------ the list */

export function AuctionsPage({ api }) {
  const { user, go, toast } = api;
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let active = true;
    raw("/auctions/")
      .then((d) => { if (active) setRows(d.auctions || []); })
      .catch((e) => { if (active) setErr(e.message || "Could not load auctions."); });
    return () => { active = false; };
  }, []);

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
                  note: "Lots, ceiling, decrement and the clock, then invite the room." }]
             : []}>
      <Figures>
        <Quiet n={rows ? rows.length : "—"} label="auctions" />
        <Quiet n={rows ? liveOnes : "—"} label="open now"
               tone={liveOnes ? "var(--green)" : undefined} />
      </Figures>
    </Guide>
  );

  if (err) return <Page guide={guide}><Empty art="chart">{err}</Empty></Page>;
  if (!rows) return <Page guide={guide}><Empty art="chart">Loading auctions…</Empty></Page>;
  if (!rows.length) {
    return (
      <Page guide={guide}>
        <Empty art="chart">
          No reverse auctions yet.
          {can(user, "auction.create") && " An auction is for a price-only requirement where several vendors can quote the same thing."}
        </Empty>
      </Page>
    );
  }

  return (
    <Page guide={guide} wide>
      <div className="pagehead"><div><h1>Auctions</h1></div></div>
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

export function AuctionPage({ api, id }) {
  const { user, go, toast } = api;
  const { a, err, moved, extended } = useRoom(api, id);
  const [lotId, setLotId] = useState(null);
  const [ask, setAsk] = useState(null);

  const lots = lotsOf(a);
  const lot = lots.find((l) => l.id === lotId) || lots[0] || null;
  const st = lot ? stateOf(a, lot.id) : {};
  const monitor = can(user, "auction.monitor");

  if (err && !a) return <Empty art="chart">{err}</Empty>;
  if (!a) return <Empty art="chart">Opening the room…</Empty>;

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
