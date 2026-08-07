/* Presentation logic for the Finance page.

   Thinner than analytics-model.js on purpose: the arithmetic lives on the
   server (backend/core/finance.py) because it reads a mirrored ledger that can
   run to tens of thousands of invoices, and summing those in a browser tab
   would be both slow and a lot of somebody's payables history to ship to a
   laptop. What is left here is the part that belongs to the interface — how
   stale the ledger is allowed to look before the page says so, how an exception
   is worded, and how a set of rows becomes a chart series.
*/
import { DAY, fmtCompact, fmtDate, nowMs } from "./helpers";
import { slot } from "./charts";

/* ---------------- staleness ----------------

   A finance dashboard drawing a stale ledger without saying how stale is worse
   than one drawing nothing, because the first one gets believed. These bands
   decide how loudly the page says it. */

export const FRESHNESS = {
  LIVE: "live", AGEING: "ageing", STALE: "stale", NEVER: "never",
};

export function freshness(ledger) {
  if (!ledger) return { band: FRESHNESS.NEVER, days: null, label: "never loaded" };
  const { oldestSync, neverSynced } = ledger;
  if (!oldestSync) {
    return { band: FRESHNESS.NEVER, days: null,
             label: "no finance export has been loaded yet" };
  }
  const days = Math.floor((nowMs() - oldestSync) / DAY);
  const band = days <= 1 ? FRESHNESS.LIVE : days <= 7 ? FRESHNESS.AGEING : FRESHNESS.STALE;
  const missing = (neverSynced || []).length;
  return {
    band, days, at: oldestSync,
    label: days === 0 ? "loaded today"
      : days === 1 ? "loaded yesterday"
      : `oldest feed is ${days} days old`,
    missing,
    // The oldest feed, not the newest: a page is only as current as its
    // stalest input, and quoting the newest lets one healthy feed vouch for
    // five dead ones.
    note: missing ? `${missing} feed${missing === 1 ? "" : "s"} have never run` : "",
  };
}

/* ---------------- exceptions ---------------- */

/* The eight rules, in the order Finance would work them: money already gone or
   about to go, then things that will cost money later, then things to verify.
   The order is fixed rather than sorted by value so the list reads the same way
   every morning — a queue that reshuffles itself is a queue nobody learns. */
export const EXCEPTION_KINDS = [
  { key: "duplicate_invoice", label: "Duplicate invoices", icon: "file",
    hint: "the same claim submitted twice" },
  { key: "missing_approval", label: "Missing approvals", icon: "seal",
    hint: "committed or paid without a signature" },
  { key: "payment_overdue", label: "Overdue payments", icon: "clock",
    hint: "past due and unsettled" },
  { key: "over_budget", label: "Over budget", icon: "scales",
    hint: "committed above the approved amount" },
  { key: "exposure", label: "Exposure limits", icon: "shield",
    hint: "a vendor carried past their ceiling" },
  { key: "contract_expired", label: "Expired contracts", icon: "alert",
    hint: "still live, term already ended" },
  { key: "contract_expiring", label: "Expiring soon", icon: "hourglass",
    hint: "inside the notice period" },
  { key: "variation_threshold", label: "Variations over threshold", icon: "scales",
    hint: "grown past what a variation should cover" },
  { key: "po_unmatched", label: "Unmatched orders", icon: "audit",
    hint: "the three-way match is broken" },
  { key: "low_bid", label: "Abnormally low bids", icon: "analytics",
    hint: "viability to verify before contracting" },
];

export function groupExceptions(list) {
  const by = new Map(EXCEPTION_KINDS.map((k) => [k.key, { ...k, rows: [], value: 0, warn: 0 }]));
  (list || []).forEach((e) => {
    const g = by.get(e.kind);
    if (!g) return;
    g.rows.push(e);
    g.value += e.value || 0;
    if (e.severity === "warn") g.warn += 1;
  });
  return [...by.values()].filter((g) => g.rows.length);
}

export const exceptionTotals = (list) => ({
  n: (list || []).length,
  warn: (list || []).filter((e) => e.severity === "warn").length,
  value: (list || []).reduce((n, e) => n + (e.value || 0), 0),
});

/* ---------------- series helpers ----------------

   Colour is assigned by identity here, exactly once, so the same measure is the
   same colour on every chart of the page. Never by rank, and never re-derived
   per chart — a filter that changes the row count must not repaint the
   survivors. */
export const TONE = {
  committed: slot(0),
  paid: slot(2),
  savings: "var(--green)",
  overdue: "var(--wax)",
  onTime: slot(2),
  late: "var(--wax)",
  forecast: slot(3),
};

/** Server rows [{key, at, value}] → chart points [{x, y}]. */
export const points = (rows) =>
  (rows || []).filter((r) => r.at && r.value != null).map((r) => ({ x: r.at, y: r.value }));

/** Server rows → Columns data, keeping the period key for the axis label. */
export const columns = (rows, color) =>
  (rows || []).map((r) => ({ key: r.key, label: r.key, value: r.value || 0, color }));

/** Top n rows, with everything else folded into a named remainder. */
export function topN(rows, n = 10, otherLabel = "All other") {
  const list = rows || [];
  if (list.length <= n + 1) return list;
  const head = list.slice(0, n);
  const tail = list.slice(n);
  return [...head, {
    key: "__rest", label: `${otherLabel} (${tail.length})`,
    value: tail.reduce((s, r) => s + (r.value || 0), 0),
    n: tail.reduce((s, r) => s + (r.n || 0), 0),
  }];
}

/* ---------------- formatting ---------------- */

export const pct = (n, dp = 1) =>
  n == null ? "—" : (n < 0 ? "−" : "") + Math.abs(n).toFixed(dp) + "%";

export const days = (n) => (n == null ? "—" : Math.round(n) + (Math.round(n) === 1 ? " day" : " days"));

/** A signed money delta, with the sign carried in words rather than colour. */
export const delta = (n) =>
  n == null ? "—" : (n > 0 ? "+" : n < 0 ? "−" : "") + fmtCompact(Math.abs(n));

/** How a contract's remaining term reads. */
export function term(daysLeft) {
  if (daysLeft == null) return { label: "no end date recorded", tone: null };
  if (daysLeft < 0) return { label: `expired ${Math.abs(daysLeft)}d ago`, tone: "warn" };
  if (daysLeft <= 30) return { label: `${daysLeft}d left`, tone: "warn" };
  if (daysLeft <= 90) return { label: `${daysLeft}d left`, tone: "watch" };
  return { label: `${Math.round(daysLeft / 30)} months left`, tone: null };
}

/** Ageing buckets carry a single hue that deepens with lateness — magnitude,
    not identity, so a rainbow here would claim the buckets differ in kind. */
export const AGE_TONE = {
  current: "var(--s3)", "1-30": "var(--s4)", "31-60": "var(--s2)",
  "61-90": "var(--s8)", "90+": "var(--wax)",
};

/* ---------------- the risk register ----------------

   A High/Medium/Low against each finance risk. Every level is decided by a
   stated threshold and ships with the observation that triggered it, because a
   severity nobody can reproduce is an opinion in a table — and the first
   question anyone asks a red row is "says who".

   The thresholds are deliberately visible constants rather than buried
   comparisons. An organisation that disagrees with one should be able to find
   it and change it in a minute. */

export const LEVEL = { HIGH: "high", MEDIUM: "medium", LOW: "low" };

export const LEVEL_META = {
  high: { label: "High", tone: "var(--wax)", icon: "alert", rank: 0 },
  medium: { label: "Medium", tone: "var(--s4)", icon: "info", rank: 1 },
  low: { label: "Low", tone: "var(--green)", icon: "check", rank: 2 },
};

export const RISK_THRESHOLDS = {
  overrunShareHigh: 5,      // % of committed spend committed above its budget
  lateDaysHigh: 30,         // average days past due
  overdueShareHigh: 10,     // % of outstanding payables that is overdue
  fxMoveHigh: 10,           // % adverse rate movement on open commitments
  signalsHigh: 3,           // distress signals against one vendor
};

const lvl = (cond_high, cond_med) =>
  (cond_high ? LEVEL.HIGH : cond_med ? LEVEL.MEDIUM : LEVEL.LOW);

/** [{key, label, level, basis}] — the register, worst first. */
export function riskLevels(d) {
  const T = RISK_THRESHOLDS;
  const ex = d.exceptions || [];
  const kinds = (...ks) => ex.filter((e) => ks.includes(e.kind));

  const committed = d.spend?._total || 0;
  const overrun = kinds("over_budget");
  const overrunValue = overrun.reduce((n, e) => n + e.value, 0);
  const overrunShare = committed ? (overrunValue / committed) * 100 : 0;

  const pay = d.payments || {};
  const overdueValue = pay.overdueValue || 0;
  const outstanding = pay.outstanding || 0;
  const overdueShare = outstanding ? (overdueValue / outstanding) * 100 : 0;

  const fx = d.fx || { rows: [], movement: 0, atStruck: 0 };
  const fxShare = fx.atStruck ? (fx.movement / fx.atStruck) * 100 : 0;

  const c = d.contracts || { expired: [], expiring: [] };
  const distress = d.distress || [];
  const worstVendor = distress[0];

  const fraud = kinds("duplicate_invoice", "missing_approval", "po_unmatched",
                      "variation_threshold", "low_bid");
  const severe = kinds("duplicate_invoice").length
    + fraud.filter((e) => e.kind === "missing_approval" && e.severity === "warn").length;

  const rows = [
    {
      key: "overrun", label: "Budget overrun",
      level: lvl(overrunShare >= T.overrunShareHigh, overrun.length > 0),
      basis: overrun.length
        ? `${overrun.length} commitment(s) above approved budget, ${overrunShare.toFixed(1)}% of committed spend`
        : "nothing committed above its approved budget",
      value: overrunValue,
    },
    {
      key: "health", label: "Supplier financial health",
      level: lvl(!!worstVendor && worstVendor.n >= T.signalsHigh, distress.length > 0),
      basis: distress.length
        ? `${distress.length} vendor(s) showing signals; worst is ${worstVendor.supplier} with ${worstVendor.n}`
        : "no vendor is showing a distress signal",
      value: distress.reduce((n, r) => n + (r.exposure || 0), 0),
    },
    {
      key: "payments", label: "Payment delays",
      level: lvl((pay.avgDaysLate || 0) > T.lateDaysHigh || overdueShare >= T.overdueShareHigh,
                 (pay.overdue || []).length > 0),
      basis: (pay.overdue || []).length
        ? `${pay.overdue.length} invoice(s) overdue, ${overdueShare.toFixed(0)}% of payables, averaging ${Math.round(pay.avgDaysLate || 0)} days late`
        : "nothing is past due",
      value: overdueValue,
    },
    {
      key: "fx", label: "Exchange-rate exposure",
      level: lvl(fxShare >= T.fxMoveHigh, (fx.rows || []).length > 0),
      basis: (fx.rows || []).length
        ? `${fx.rows.length} open ${fx.currencies.join("/")} commitment(s), rates moved ${fxShare.toFixed(1)}% against us`
        : "every open commitment is in naira",
      value: fx.movement,
    },
    {
      key: "expiry", label: "Contract expiry",
      level: lvl(c.expired.length > 0, c.expiring.length > 0),
      basis: c.expired.length
        ? `${c.expired.length} contract(s) still live past their end date`
        : c.expiring.length
          ? `${c.expiring.length} contract(s) inside the notice period`
          : "no contract expires within 90 days",
      value: [...c.expired, ...c.expiring].reduce((n, r) => n + r.value, 0),
    },
    {
      key: "fraud", label: "Procurement fraud indicators",
      level: lvl(severe > 0, fraud.length > 0),
      basis: fraud.length
        ? `${fraud.length} indicator(s) open across ${new Set(fraud.map((e) => e.kind)).size} check(s)`
        : "no indicator is currently firing",
      value: fraud.reduce((n, e) => n + e.value, 0),
    },
  ];

  return rows.sort((a, b) => LEVEL_META[a.level].rank - LEVEL_META[b.level].rank);
}

/* The checks that, taken together, are what a fraud review actually looks at.
   Named here rather than in the component so the Risk panel and the exceptions
   list cannot drift apart about what counts. */
export const FRAUD_KINDS = [
  "duplicate_invoice", "missing_approval", "po_unmatched",
  "variation_threshold", "low_bid",
];

/** The compliance score's components, worst first — the number on its own is
    not actionable and the point is entirely which check is dragging it down. */
export const weakest = (checks) =>
  (checks || []).filter((c) => c.total > 0).slice().sort((a, b) => a.rate - b.rate);

export const asAt = (ms) => (ms ? `as at ${fmtDate(ms)}` : "");
