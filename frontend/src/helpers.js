/* Formatting, status and evaluation math (client mirror of backend/core/util.py). */

export const DAY = 86400000;
export const nowMs = () => Date.now();
export const uid = () => Math.random().toString(36).slice(2, 9);

export const fmtMoney = (n, cur = "NGN") => {
  try {
    return new Intl.NumberFormat("en-NG", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(n);
  } catch (e) {
    return "₦" + Math.round(n).toLocaleString();
  }
};
export const fmtCompact = (n) => {
  if (n >= 1e9) return "₦" + (n / 1e9).toFixed(2).replace(/\.?0+$/, "") + "bn";
  if (n >= 1e6) return "₦" + (n / 1e6).toFixed(1).replace(/\.0$/, "") + "m";
  return "₦" + Math.round(n).toLocaleString();
};
export const fmtDate = (t) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
export const fmtDateTime = (t) => new Date(t).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
export const daysLeft = (t) => Math.ceil((t - nowMs()) / DAY);

export const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
export const stdev = (a) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) * (x - m)))); };

/* Status vocabulary. Only the wording lives here: the colours are per-theme
   CSS (`.stamp.st-<key>` in styles.js), so a stamp restyles with the theme
   instead of carrying a baked-in hex through the JSX. */
export const STATUS = {
  draft:      { label: "Draft" },
  approval:   { label: "Awaiting approval" },
  published:  { label: "Open for bids" },
  closing:    { label: "Closing soon" },
  paused:     { label: "Paused" },
  closed:     { label: "Sealed" },
  evaluation: { label: "In evaluation" },
  awarded:    { label: "Awarded" },
  cancelled:  { label: "Cancelled" },
};

export const effStatus = (t) => (t.status === "published" && t.deadline < nowMs() ? "closed" : t.status);

/* The status a person is shown, which is one step finer than the status the
   server acts on. "Closing soon" is not a state a tender is in — nothing
   transitions into or out of it — it is the last stretch of "open", surfaced
   because a bidder with 30 hours left and a bidder with 30 days left are not
   in the same situation and a single green badge tells them they are. */
export const CLOSING_SOON = 2 * DAY;
export const displayStatus = (t) => {
  const st = effStatus(t);
  if (st !== "published") return st;
  const left = t.deadline - nowMs();
  return left > 0 && left <= CLOSING_SOON ? "closing" : "published";
};

/* ---------------- rounds ---------------- */

export const ROUND_STATUS = {
  draft:      { label: "Draft", tone: "" },
  upcoming:   { label: "Upcoming", tone: "" },
  open:       { label: "Open", tone: "ok" },
  closed:     { label: "Closed", tone: "warn" },
  evaluation: { label: "Under evaluation", tone: "" },
  completed:  { label: "Completed", tone: "gold" },
  cancelled:  { label: "Cancelled", tone: "warn" },
};

/* An event with no explicit rounds is a single-round event whose window is the
   tender's own deadline — see ProcurementRound in the backend. The interface
   says "Round 1" either way, so a manager opening a second round sees a list
   grow rather than a concept appear. */
export const roundsOf = (t) => (t.rounds && t.rounds.length ? t.rounds : [{
  id: null, number: 1, name: "Round 1", status: effStatus(t) === "published" ? "open" : effStatus(t),
  deadline: t.deadline, opensAt: t.publishedAt, openedAt: t.openedAt,
  invited: t.invited || [], invitedCount: (t.invited || []).length, implicit: true,
}]);

export const activeRound = (t) => roundsOf(t).find((r) => r.status === "open") || null;

/* ---------------- vendor lifecycle ---------------- */

export const REG_STATUS = {
  pending:    { label: "Pending registration", tone: "" },
  invited:    { label: "Invitation sent", tone: "" },
  registered: { label: "Registered", tone: "ok" },
};

export const VERIFY_STATUS = {
  unverified: { label: "Unverified", tone: "" },
  verified:   { label: "Verified", tone: "ok" },
  rejected:   { label: "Declined", tone: "warn" },
  suspended:  { label: "Suspended", tone: "warn" },
};

/* Derived on the client only as a fallback: the server sends both statuses on
   every supplier record, and this keeps a stale cached payload rendering
   something true rather than blank. */
export const regStatusOf = (s) =>
  s.registrationStatus || (s.registeredAt ? "registered" : s.invitedAt ? "invited" : "pending");
export const verifyStatusOf = (s) =>
  s.verificationStatus || (s.suspended ? "suspended" : s.rejectedReason ? "rejected"
    : s.prequalified ? "verified" : "unverified");

/* ---------------- what a bid is worth ---------------- */

/* Mirrors util.savings_against. Three numbers can play "what we would otherwise
   have paid" and they are not interchangeable: a baseline is what was actually
   being paid, a projection is what this was expected to land at, a budget is a
   ceiling somebody set. The strongest available basis wins and its name travels
   with the number, because a saving whose basis is unstated cannot be checked. */
export const savingsAgainst = (t, amount) => {
  if (amount == null) return null;
  const [basisAmount, basis] = t.baseline ? [t.baseline, "baseline"]
    : t.projectedCost ? [t.projectedCost, "projection"]
    : [t.budget, "budget"];
  const savings = (basisAmount || 0) - amount;
  return { basis, basisAmount, savings, pct: basisAmount ? (savings / basisAmount) * 100 : 0 };
};

export const techScore = (t, bid) => {
  const panels = Object.values(bid.scores || {});
  const per = panels
    .map((sc) => {
      let tot = 0, w = 0;
      t.criteria.forEach((c) => { const v = sc[c.id]; if (v != null && v !== "") { tot += Number(v) * 10 * c.weight; w += c.weight; } });
      return w ? tot / w : null;
    })
    .filter((x) => x != null);
  return per.length ? mean(per) : null;
};
export const commScore = (t, bid, bids) => {
  const lo = Math.min(...bids.map((b) => b.amount));
  return (lo / bid.amount) * 100;
};
export const totalScore = (t, bid, bids) => {
  const ts = techScore(t, bid);
  if (ts == null) return null;
  return (ts * t.techWeight) / 100 + (commScore(t, bid, bids) * t.commWeight) / 100;
};
export const varianceFlags = (t, bid) =>
  t.criteria.filter((c) => {
    const vs = Object.values(bid.scores || {}).map((s) => s[c.id]).filter((v) => v != null && v !== "").map(Number);
    return vs.length > 1 && stdev(vs) >= 2;
  });
export const abnormallyLow = (bid, bids) => {
  const priced = bids.filter((b) => b.amount != null);
  return bid.amount != null && priced.length > 2 && bid.amount < 0.65 * median(priced.map((b) => b.amount));
};
