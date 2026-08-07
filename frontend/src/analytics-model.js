/* The arithmetic behind Analytics and MyDesk, kept out of the components.

   Two things this file is careful about, because both are ways a procurement
   dashboard normally lies:

   **Savings.** A saving is a comparison, and the number is only as good as what
   it is compared against. `budget` is a ceiling somebody estimated before going
   to market — beating it measures the estimate at least as much as the buying.
   `baseline` is what the organisation was actually paying before. Where a
   baseline exists we use it and say so; where it does not we fall back to the
   budget and label the figure differently. The two are never silently added
   together into one headline, because a "savings" total that mixes them means
   nothing and cannot be defended in a review.

   **Attribution.** Work belongs to the person who owns the tender, and rolls up
   to whoever they report to. Tenders with no owner are counted in the totals and
   named separately, never quietly dropped into somebody's column — an unowned
   tender is a gap to fix, and hiding it in an average is how it stays unfixed.
*/
import { DAY, effStatus, mean, median, nowMs } from "./helpers";

export const BASIS = { BASELINE: "baseline", BUDGET: "budget" };

/* ---------------- savings ---------------- */

/** What one awarded tender saved, and against what.

    Returns null for anything not awarded or not priced: an unawarded tender has
    no saving, and inventing one from a median bid would put a forecast in the
    same column as a fact. */
export function savingOf(t) {
  if (t.status !== "awarded" || t.awardedAmount == null) return null;
  const basis = t.baseline ? BASIS.BASELINE : BASIS.BUDGET;
  const against = t.baseline || t.budget || 0;
  if (!against) return null;
  const amount = against - t.awardedAmount;
  return {
    id: t.id, tender: t, basis, against, awarded: t.awardedAmount, amount,
    pct: (amount / against) * 100,
    source: t.baselineSource || null,
  };
}

/** Every saving in a set, split by what it was measured against.

    The split is the point. `hard` is measured against a real prior price and is
    the number to take to a board; `soft` is measured against an internal
    estimate and is the number to take to a planning meeting. Presenting their
    sum as one figure is the thing this function exists to prevent. */
export function savingsSplit(tenders) {
  const all = tenders.map(savingOf).filter(Boolean);
  const hard = all.filter((s) => s.basis === BASIS.BASELINE);
  const soft = all.filter((s) => s.basis === BASIS.BUDGET);
  const sum = (xs) => xs.reduce((n, s) => n + s.amount, 0);
  return {
    all, hard, soft,
    hardTotal: sum(hard), softTotal: sum(soft), total: sum(all),
    hardSpend: hard.reduce((n, s) => n + s.awarded, 0),
    // Weighted, not the mean of the percentages: a ₦2m tender that saved 40%
    // must not move the rate as much as a ₦600m one that saved 4%.
    hardRate: hard.length ? (sum(hard) / hard.reduce((n, s) => n + s.against, 0)) * 100 : null,
    coverage: all.length ? (hard.length / all.length) * 100 : 0,
    missingBaseline: soft.map((s) => s.tender),
  };
}

/* ---------------- attribution ---------------- */

/** Index people by id, with their reports resolved once. */
export function orgIndex(users) {
  const byId = new Map(users.map((u) => [u.id, u]));
  const kids = new Map();
  users.forEach((u) => {
    if (!u.managerId) return;
    if (!kids.has(u.managerId)) kids.set(u.managerId, []);
    kids.get(u.managerId).push(u.id);
  });
  /* Everyone below a person, at any depth. Guarded against a cycle: an org
     chart edited into a loop should render oddly, not hang the dashboard. */
  const below = (id, seen = new Set()) => {
    if (seen.has(id)) return [];
    seen.add(id);
    return (kids.get(id) || []).flatMap((k) => [k, ...below(k, seen)]);
  };
  return { byId, kids, below, chain: (id) => {
    const out = [];
    let cur = byId.get(id);
    const seen = new Set([id]);
    while (cur && cur.managerId && !seen.has(cur.managerId)) {
      seen.add(cur.managerId);
      cur = byId.get(cur.managerId);
      if (cur) out.push(cur);
    }
    return out;
  } };
}

/** Per-person totals over a set of tenders. `ids` scopes it; null means everyone. */
export function byOwner(tenders, users, ids = null) {
  const scope = ids ? new Set(ids) : null;
  const rows = new Map();
  const touch = (id) => {
    if (!rows.has(id)) {
      const u = users.find((x) => x.id === id);
      rows.set(id, { id, name: u ? u.name : "Unassigned", title: u ? u.title : "",
                     live: 0, closed: 0, awarded: 0, spend: 0, hardSaved: 0, softSaved: 0,
                     cycles: [], tenders: [] });
    }
    return rows.get(id);
  };
  for (const t of tenders) {
    const id = t.ownerId || "__none";
    if (scope && !scope.has(t.ownerId)) continue;
    const r = touch(id);
    r.tenders.push(t);
    const st = effStatus(t);
    if (t.status === "awarded") {
      r.awarded += 1;
      r.spend += t.awardedAmount || 0;
      const s = savingOf(t);
      if (s) (s.basis === BASIS.BASELINE ? (r.hardSaved += s.amount) : (r.softSaved += s.amount));
      if (t.publishedAt && t.awardedAt) r.cycles.push((t.awardedAt - t.publishedAt) / DAY);
    } else if (st === "closed" || t.status === "evaluation" || t.status === "approval") {
      r.closed += 1;
    } else if (st === "published") {
      r.live += 1;
    }
  }
  return [...rows.values()]
    .map((r) => ({ ...r, cycle: r.cycles.length ? mean(r.cycles) : null,
                   open: r.live + r.closed, total: r.tenders.length }))
    .sort((a, b) => b.hardSaved + b.softSaved - (a.hardSaved + a.softSaved));
}

/* ---------------- the desk ---------------- */

/* What a person has, split the way somebody actually thinks about their own
   work: what is live, what is mid-flight and waiting on a step, and what is
   finished. `closed` deliberately means "concluded", not "past deadline" —
   past-deadline-but-unopened is the opposite of finished, and putting it in the
   done pile is how a sealed tender sits unopened for a fortnight. */
export const DESK_BUCKETS = [
  { key: "live", label: "Open", hint: "published and taking bids" },
  { key: "progress", label: "In progress", hint: "sealed, in evaluation, or awaiting a decision" },
  { key: "done", label: "Closed", hint: "awarded, or concluded without an award" },
  { key: "draft", label: "Drafts", hint: "not yet submitted" },
];

export function deskBucket(t) {
  if (t.status === "draft") return "draft";
  if (t.status === "awarded") return "done";
  const st = effStatus(t);
  if (st === "published") return "live";
  return "progress";   // sealed, evaluation, awaiting approval
}

export function desk(tenders, ownerIds) {
  const mine = ownerIds ? tenders.filter((t) => ownerIds.includes(t.ownerId)) : tenders;
  const out = { live: [], progress: [], done: [], draft: [], all: mine };
  mine.forEach((t) => out[deskBucket(t)].push(t));
  // Oldest deadline first inside each bucket: the thing closest to running out
  // of time is the thing to look at first.
  Object.keys(out).forEach((k) => {
    if (Array.isArray(out[k]) && k !== "all") out[k].sort((a, b) => (a.deadline || 0) - (b.deadline || 0));
  });
  return out;
}

/* ---------------- spend & category rollups ---------------- */

/** Committed spend by taxonomy node.

    Awarded amounts are facts. Evaluation-stage medians are forecasts. They are
    returned separately so a caller can show the forecast as a distinct band
    rather than adding it into the committed figure, which would make this
    quarter's spend look larger than anything actually signed. */
export function spendByCategory(tenders, bids) {
  const rows = new Map();
  const touch = (cat, family) => {
    if (!rows.has(cat)) rows.set(cat, { key: cat, label: cat, family, committed: 0, forecast: 0, n: 0 });
    return rows.get(cat);
  };
  for (const t of tenders) {
    if (t.status === "awarded" && t.awardedAmount != null) {
      const r = touch(t.category, t.family);
      r.committed += t.awardedAmount;
      r.n += 1;
    } else if (t.status === "evaluation") {
      const priced = bids.filter((b) => b.tenderId === t.id && b.amount != null).map((b) => b.amount);
      if (priced.length) {
        const r = touch(t.category, t.family);
        r.forecast += median(priced);
        r.n += 1;
      }
    }
  }
  return [...rows.values()].sort((a, b) => (b.committed + b.forecast) - (a.committed + a.forecast));
}

/** Roll category rows up to their family. */
export function rollupFamilies(catRows, taxonomy) {
  const label = new Map(taxonomy.map((f) => [f.key, f.label]));
  const out = new Map();
  for (const r of catRows) {
    const k = r.family || "goods";
    if (!out.has(k)) out.set(k, { key: k, label: label.get(k) || k, committed: 0, forecast: 0, n: 0, cats: [] });
    const f = out.get(k);
    f.committed += r.committed; f.forecast += r.forecast; f.n += r.n; f.cats.push(r);
  }
  return [...out.values()].sort((a, b) => (b.committed + b.forecast) - (a.committed + a.forecast));
}

/** Vendors per taxonomy node, for the register's shape. */
export function vendorsByNode(suppliers) {
  const fam = new Map(), cat = new Map(), sub = new Map();
  for (const s of suppliers) {
    fam.set(s.family, (fam.get(s.family) || 0) + 1);
    cat.set(s.category, (cat.get(s.category) || 0) + 1);
    if (s.subcategory) {
      const k = s.category + " › " + s.subcategory;
      sub.set(k, (sub.get(k) || 0) + 1);
    }
  }
  return { fam, cat, sub };
}

/* ---------------- competition & cycle ---------------- */

/** How much competition each tender actually attracted. One bid is not a
    tender, it is a renewal with paperwork, and it is worth naming as such. */
export function competition(tenders, bids) {
  const rows = tenders
    .filter((t) => t.openedAt || t.status === "awarded" || t.status === "evaluation")
    .map((t) => {
      const n = bids.filter((b) => b.tenderId === t.id).length;
      return { key: t.id, label: t.title, value: n, invited: (t.invited || []).length, tender: t };
    });
  const counts = rows.map((r) => r.value);
  return {
    rows: rows.sort((a, b) => a.value - b.value),
    avg: counts.length ? mean(counts) : 0,
    single: rows.filter((r) => r.value <= 1),
    responseRate: rows.length
      ? mean(rows.map((r) => (r.invited ? (r.value / r.invited) * 100 : 0)))
      : 0,
  };
}

/** Publish → award, per tender, for the tenders that got there. */
export function cycleTimes(tenders) {
  const rows = tenders
    .filter((t) => t.status === "awarded" && t.publishedAt && t.awardedAt)
    .map((t) => ({ key: t.id, label: t.title, value: (t.awardedAt - t.publishedAt) / DAY, tender: t }));
  return { rows, avg: rows.length ? mean(rows.map((r) => r.value)) : null,
           med: rows.length ? median(rows.map((r) => r.value)) : null };
}

/** Cumulative committed spend over time — the shape of the year so far. */
export function spendOverTime(tenders) {
  const pts = tenders
    .filter((t) => t.status === "awarded" && t.awardedAt && t.awardedAmount != null)
    .sort((a, b) => a.awardedAt - b.awardedAt);
  let run = 0;
  return pts.map((t) => ({ x: t.awardedAt, y: (run += t.awardedAmount) }));
}

/** Savings accumulating over time, hard only — the defensible line. */
export function savingsOverTime(tenders) {
  const pts = tenders.map(savingOf).filter((s) => s && s.basis === BASIS.BASELINE && s.tender.awardedAt)
    .sort((a, b) => a.tender.awardedAt - b.tender.awardedAt);
  let run = 0;
  return pts.map((s) => ({ x: s.tender.awardedAt, y: (run += s.amount) }));
}

/* ---------------- risk ---------------- */

export function complianceRisk(suppliers) {
  const out = [];
  suppliers.forEach((s) => (s.docs || []).forEach((d) => {
    const left = Math.ceil((d.expiry - nowMs()) / DAY);
    if (left <= 90) out.push({ supplier: s, doc: d, days: left, expired: left < 0 });
  }));
  return out.sort((a, b) => a.days - b.days);
}

export const thisYear = () => new Date(new Date().getFullYear(), 0, 1).getTime();
