import React from "react";

import { STATUS, daysLeft, fmtCompact, fmtDate, fmtMoney, nowMs } from "./helpers";
import { Icon } from "./icons";
import { fmtRemaining, tickRateFor, useTicker } from "./motion";

/* ---------------- atoms ---------------- */

const DAY_MS = 86400000;

export const Stamp = ({ s }) => {
  const key = STATUS[s] ? s : "draft";
  return <span className={"stamp st-" + key}>{STATUS[key].label}</span>;
};

export const Money = ({ n, strong }) => (
  <span className="money" style={strong ? { fontWeight: 600 } : null}>{fmtMoney(n)}</span>
);

/* Accepts `t` or `deadline` — both spellings are in use across the app, and
   passing the wrong one used to render "NaN days left" in the auction room.
   Inside the last day it stops rounding to days and ticks a real clock. */
export const Countdown = ({ t, deadline }) => {
  const at = t ?? deadline;
  const left = at == null ? NaN : at - nowMs();
  useTicker(Number.isFinite(left) && left > 0 && left < DAY_MS ? tickRateFor(left) : 0);
  if (!Number.isFinite(left)) return <span className="mono faint">—</span>;
  if (left <= 0) return <span className="mono faint">closed {fmtDate(at)}</span>;
  if (left < DAY_MS) {
    const critical = left < 120_000;
    return (
      <span className={"clock" + (critical ? " critical" : " soon")} title={"Closes " + fmtDate(at)}>
        {fmtRemaining(left)} left
      </span>
    );
  }
  const d = daysLeft(at);
  return (
    <span className="mono" style={{ color: d <= 2 ? "var(--wax)" : "var(--muted)" }}>
      {d + (d === 1 ? " day left" : " days left")}
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

/* `icon` gives an empty state something to look at — pass an icon name from
   icons.jsx (e.g. <Empty icon="envelope">No bids yet.</Empty>). */
export const Empty = ({ children, icon }) => (
  <div className="empty">
    {icon ? <Icon n={icon} s={30} /> : null}
    {children}
  </div>
);

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

