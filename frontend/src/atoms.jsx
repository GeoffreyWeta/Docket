import React from "react";

import { STATUS, daysLeft, fmtCompact, fmtDate, fmtMoney, nowMs } from "./helpers";

/* ---------------- atoms ---------------- */

export const Stamp = ({ s }) => {
  const m = STATUS[s] || STATUS.draft;
  return <span className="stamp" style={{ color: m.fg, background: m.bg, borderColor: m.fg + "55" }}>{m.label}</span>;
};

export const Money = ({ n, strong }) => (
  <span className="money" style={strong ? { fontWeight: 600 } : null}>{fmtMoney(n)}</span>
);

export const Countdown = ({ t }) => {
  const d = daysLeft(t);
  if (d < 0) return <span className="mono faint">closed {fmtDate(t)}</span>;
  const urgent = d <= 2;
  return (
    <span className="mono" style={{ color: urgent ? "var(--wax)" : "var(--muted)" }}>
      {d === 0 ? "closes today" : d + (d === 1 ? " day left" : " days left")}
    </span>
  );
};

export const Stat = ({ k, v, d, tone }) => (
  <div className="stat">
    <div className="k">{k}</div>
    <div className="v" style={tone ? { color: tone } : null}>{v}</div>
    {d ? <div className="d">{d}</div> : null}
  </div>
);

export const Empty = ({ children }) => <div className="empty">{children}</div>;

export function MiniBars({ data }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div>
      {data.map((d, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <div className="mono" style={{ width: 110, fontSize: 11, color: "var(--muted)", textAlign: "right", flexShrink: 0 }}>{d.label}</div>
          <div style={{ flex: 1, height: 16, background: "var(--line)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ width: (d.value / max) * 100 + "%", height: "100%", background: d.color || "var(--green)", borderRadius: 3 }} />
          </div>
          <div className="mono" style={{ width: 66, fontSize: 11.5, flexShrink: 0 }}>{fmtCompact(d.value)}</div>
        </div>
      ))}
    </div>
  );
}

export function StageTracker({ t }) {
  const T = nowMs();
  const stages = [
    { k: "Drafted", done: true, at: null },
    { k: "Approved", done: !!t.publishedAt, at: null },
    { k: "Open for bids", done: !!t.publishedAt, at: t.publishedAt },
    { k: "Sealed", done: !!t.publishedAt && t.deadline < T, at: t.publishedAt && t.deadline < T ? t.deadline : null, cls: "wax" },
    { k: "Opened", done: !!t.openedAt, at: t.openedAt },
    { k: "Awarded", done: !!t.awardedAt, at: t.awardedAt, cls: "gold" },
  ];
  return (
    <div className="stages" aria-label="Tender progress">
      {stages.map((s, i) => (
        <div key={i} className={"stg" + (s.done ? " done" : "") + (s.cls && s.done ? " " + s.cls : "")}>
          <span className="dot" aria-hidden="true" />
          <div className="sk">{s.k}</div>
          <div className="sd">{s.at ? fmtDate(s.at) : "\u00A0"}</div>
        </div>
      ))}
    </div>
  );
}

