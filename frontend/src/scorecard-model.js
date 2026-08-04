/* Supplier scorecards, the model. Kept in its own file (and deliberately not
   named scorecards.js, which the .jsx page would shadow at resolution time).

   One weighted model, computed from what DOCKET actually
   knows about a supplier.

   Three of the five dimensions are derived from the workspace's own record, so
   they move on their own as tenders run:

     price       how close their opened bids sat to the best price on the same
                 tender. Sealed and returned-unopened envelopes carry no amount,
                 so a sealed price can never leak into a score.
     response    invitations answered with a sealed bid, and how early in the
                 window they answered.
     compliance  prequalification plus whether the documents on file are in date.

   Delivery and quality come from the supplier register (perf.onTime and
   perf.quality). DOCKET has no goods-receipt data of its own, so those two are
   carried, not computed: a real deployment feeds them from purchase orders.
   Every dimension states its source in the UI so nobody reads a carried number
   as a measured one.

   A supplier with no operating history is held out of the ranking rather than
   scored as zero. A supplier missing one dimension is scored at the peer
   average for it, which is neutral: renormalising the weights instead would
   quietly reward the supplier with the thinnest record, because dropping the
   dimensions it has never been tested on leaves only its strengths.

   The consequence to be aware of: a supplier that competed and came out below
   the peer average can rank below one with no record at all, because "no
   evidence" is scored as average. That is the intended reading, and it is why
   every imputed dimension is labelled in the UI rather than shown as a number
   the supplier earned. */

import { DAY, nowMs } from "./helpers";

export const DIMENSIONS = [
  { key: "delivery", label: "Delivery", weight: 25,
    full: "On-time delivery", source: "carried",
    hint: "On-time delivery rate held on the supplier register." },
  { key: "quality", label: "Quality", weight: 25,
    full: "Quality", source: "carried",
    hint: "Goods-in quality rate held on the supplier register." },
  { key: "price", label: "Price", weight: 20,
    full: "Price competitiveness", source: "computed",
    hint: "How close their opened bids sat to the best price on the same tender." },
  { key: "response", label: "Response", weight: 15,
    full: "Responsiveness", source: "computed",
    hint: "Closed invitations answered with a sealed bid, and how early in the window." },
  { key: "compliance", label: "Compliance", weight: 15,
    full: "Compliance", source: "computed",
    hint: "Prequalification plus compliance documents in date." },
];

export const WEIGHT_LINE = DIMENSIONS.map((d) => `${d.weight}% ${d.full.toLowerCase()}`).join(" · ");

const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/* ---------------- the three computed dimensions ---------------- */

/** Price: the ratio of the best opened price to theirs, per tender, averaged.
    Only opened, non-disqualified bids can contribute, so this reads nothing a
    buyer was not entitled to see. */
function priceScore(sid, tenders, bids) {
  const per = [];
  for (const t of tenders) {
    const priced = bids.filter((b) => b.tenderId === t.id && b.amount != null && !b.disqualified);
    if (priced.length < 2) continue;              // no competition to compare against
    const mine = priced.find((b) => b.supplierId === sid);
    if (!mine) continue;
    const best = Math.min(...priced.map((b) => b.amount));
    per.push(clamp((best / mine.amount) * 100));
  }
  return { value: avg(per), n: per.length };
}

/** Response: three quarters answer rate, one quarter promptness.

    Only invitations whose window has already closed count. An invitation still
    open has not been missed, and scoring it as missed reads the calendar as a
    failure. Reverse auctions are excluded too: bidding there lives in the
    auction room, which the bootstrap payload does not carry, so counting an
    auction invitation would mark every auction bidder absent. */
function responseScore(sid, tenders, bids, now) {
  const mine = tenders.filter((t) => (t.invited || []).includes(sid) &&
                                     !["draft", "approval"].includes(t.status) &&
                                     t.type !== "AUC");
  const invited = mine.filter((t) => t.deadline && t.deadline < now);
  const pending = mine.length - invited.length;
  if (!invited.length) return { value: null, n: 0, answered: 0, pending };
  let answered = 0;
  const promptness = [];
  for (const t of invited) {
    const bid = bids.find((b) => b.tenderId === t.id && b.supplierId === sid);
    if (!bid) continue;
    answered++;
    const window = t.deadline - (t.publishedAt || t.deadline);
    if (window > 0 && bid.submittedAt) {
      promptness.push(clamp(((t.deadline - bid.submittedAt) / window) * 100));
    }
  }
  const rate = (answered / invited.length) * 100;
  const early = avg(promptness);
  const value = early == null ? rate : rate * 0.75 + early * 0.25;
  return { value: clamp(value), n: invited.length, answered, pending };
}

/** Compliance: prequalification plus the state of the documents on file.
    Takes the clock as an argument so the same inputs always give the same
    score: a ranking that shifts with the wall clock cannot be audited. */
function complianceScore(supplier, now) {
  const docs = supplier.docs || [];
  if (!docs.length) {
    return { value: supplier.prequalified ? 55 : 40, n: 0, note: "no compliance documents on file" };
  }
  let expired = 0, expiring = 0;
  for (const d of docs) {
    if (!d.expiry) continue;
    const left = Math.ceil((d.expiry - now) / DAY);
    if (left < 0) expired++;
    else if (left <= 30) expiring++;
  }
  const value = clamp(100 - expired * 25 - expiring * 10, 35);
  const note = expired ? `${expired} document(s) expired`
             : expiring ? `${expiring} document(s) expiring inside 30 days`
             : "all documents in date";
  return { value, n: docs.length, note };
}

/* ---------------- one supplier ---------------- */

export function scoreSupplier(supplier, tenders, bids, now = nowMs()) {
  const sid = supplier.id;
  const perf = supplier.perf || {};
  const price = priceScore(sid, tenders, bids);
  const response = responseScore(sid, tenders, bids, now);
  const compliance = complianceScore(supplier, now);

  const scores = {
    delivery: perf.onTime != null ? clamp(perf.onTime) : null,
    quality: perf.quality != null ? clamp(perf.quality) : null,
    price: price.value,
    response: response.value,
    compliance: compliance.value,
  };

  const bidsMade = bids.filter((b) => b.supplierId === sid);
  const wins = tenders.filter((t) => t.awardedTo === sid);
  const decided = tenders.filter((t) => t.status === "awarded" &&
                                        bidsMade.some((b) => b.tenderId === t.id));

  return {
    id: sid,
    name: supplier.name,
    category: supplier.category,
    prequalified: supplier.prequalified,
    scores,
    detail: {
      price, response, compliance,
      invitations: response.n,
      answered: response.answered || 0,
      pending: response.pending || 0,
      bids: bidsMade.length,
      wins: wins.length,
      losses: Math.max(0, decided.length - wins.length),
      winRate: decided.length ? Math.round((wins.length / decided.length) * 100) : null,
      awarded: wins.reduce((s, t) => s + (t.awardedAmount || 0), 0),
    },
  };
}

/* ---------------- the board ---------------- */

/** Why a supplier cannot be ranked. Held out, never scored as zero. */
function holdOutReason(s) {
  if (!s.prequalified) {
    return s.rejectedReason ? "prequalification declined" : "in prequalification review";
  }
  const perf = s.perf || {};
  if (perf.onTime == null && perf.quality == null) return "no operating history yet";
  return null;
}

/**
 * Build the ranked board plus the held-out list and the peer average.
 * Ranking is by composite, descending; the rank number belongs to the model,
 * so re-sorting a column in the UI must not renumber it.
 */
export function buildBoard(state, now = nowMs()) {
  const suppliers = state.suppliers || [];
  const tenders = state.tenders || [];
  const bids = state.bids || [];

  const held = [];
  const rows = [];
  for (const s of suppliers) {
    const reason = holdOutReason(s);
    if (reason) {
      held.push({ id: s.id, name: s.name, category: s.category, reason });
      continue;
    }
    rows.push(scoreSupplier(s, tenders, bids, now));
  }

  /* The peer average comes first, because it is what a missing dimension is
     scored at. Renormalising the weights instead would reward a supplier for
     having less history: drop the two dimensions it has never been tested on
     and its composite rises above a supplier that competed and was marked
     down. Scoring the gap at the peer average is neutral, and every imputed
     dimension is named in the UI. */
  const peer = {};
  for (const d of DIMENSIONS) {
    peer[d.key] = avg(rows.map((r) => r.scores[d.key]).filter((v) => v != null));
  }

  for (const r of rows) {
    let weighted = 0, used = 0;
    r.imputed = [];
    for (const d of DIMENSIONS) {
      const own = r.scores[d.key];
      const value = own != null ? own : peer[d.key];
      if (value == null) continue;              // nobody has data: drop the weight
      if (own == null) r.imputed.push(d.key);
      weighted += value * d.weight;
      used += d.weight;
    }
    r.composite = used ? weighted / used : null;
    r.observed = DIMENSIONS.length - r.imputed.length;
  }

  rows.sort((a, b) => (b.composite ?? -1) - (a.composite ?? -1) || a.name.localeCompare(b.name));
  rows.forEach((r, i) => { r.rank = i + 1; });
  peer.composite = avg(rows.map((r) => r.composite).filter((v) => v != null));

  return { rows, held, peer };
}

/** Held out, grouped by reason, commonest first.

    The register runs to about 1,400 vendors and all but a handful have never
    delivered against a tender here, so the reasons need counts: "1,424 for no
    operating history yet" is a fact about the register, while "1 for
    prequalification declined" is a decision somebody made and can revisit. */
export function holdOutGroups(held) {
  const m = new Map();
  for (const h of held) {
    if (!m.has(h.reason)) m.set(h.reason, []);
    m.get(h.reason).push(h);
  }
  return [...m.entries()]
    .map(([reason, members]) => ({ reason, members }))
    .sort((a, b) => b.members.length - a.members.length);
}

/** Held-out reasons, collapsed for the footnote under the table. */
export function holdOutSummary(held) {
  if (!held.length) return "";
  const parts = holdOutGroups(held).map((g) => `${g.members.length.toLocaleString()} for ${g.reason}`);
  return `${held.length.toLocaleString()} supplier${held.length === 1 ? "" : "s"} held out: ${parts.join(", ")}.`;
}
