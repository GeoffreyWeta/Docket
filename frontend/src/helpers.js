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

/* Status vocabulary. Only the wording lives here — the colours are per-theme
   CSS (`.stamp.st-<key>` in styles.js), so a stamp restyles with the theme
   instead of carrying a baked-in hex through the JSX. */
export const STATUS = {
  draft:      { label: "Draft" },
  approval:   { label: "Awaiting approval" },
  published:  { label: "Open for bids" },
  closed:     { label: "Sealed" },
  evaluation: { label: "In evaluation" },
  awarded:    { label: "Awarded" },
};

export const effStatus = (t) => (t.status === "published" && t.deadline < nowMs() ? "closed" : t.status);

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
