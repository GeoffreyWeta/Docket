/* Charts.

   Hand-rolled SVG rather than a charting library, for the same reason the rest
   of the app is hand-rolled: every mark has to read correctly in five themes,
   two of them dark, and a library's default palette knows about none of them.
   Colours here are CSS custom properties (--s1..--s8, defined per theme in
   styles.js), so a chart restyles with the theme instead of carrying baked-in
   hex through the JSX — the same rule the status stamps already follow.

   Rules these components share, and do not let a caller break:

   * Series colour is assigned by *identity*, in a fixed slot order, and never
     by rank. Sorting a bar chart must not repaint it, or the reader learns a
     colour that means "biggest" and it stops meaning the thing it names.
   * Text never wears the series colour. The mark beside a label carries the
     identity; a yellow number on a white card is simply unreadable.
   * Two or more series always get a legend. Direct labels supplement it and are
     applied sparingly — a value on every point is noise.
   * Every chart that can be a table has a table behind it. Three of the light
     palette's slots sit under 3:1 against a white card, which is legal only
     where the values are also readable some other way. That is not a detail to
     leave to the caller, so `Figure` provides the toggle itself.
*/
import React, { useId, useMemo, useRef, useState } from "react";

import { Empty } from "./atoms";
import { fmtCompact } from "./helpers";
import { Icon } from "./icons";

/* The eight categorical slots, in fixed order. Anything past the eighth folds
   into "Other" — a ninth generated hue is indistinguishable from one of these
   under colour-blindness and breaks the whole set. */
export const SLOTS = 8;
export const slot = (i) => `var(--s${(i % SLOTS) + 1})`;

/* Stable colour per key: identity decides the slot, so the same category is the
   same colour on every chart on the page and across a re-sort. The map is built
   once from a caller-supplied order (the taxonomy's family order, usually), not
   from whatever happened to be in this dataset. */
export function palette(keys) {
  const m = new Map();
  keys.forEach((k, i) => m.set(k, slot(i)));
  return (k) => m.get(k) || "var(--faint)";
}

const NUM = (n) => (Number.isFinite(n) ? n : 0);

/* ---------------- shared chrome ---------------- */

/* A titled chart with the table view built in.

   The table is not an afterthought or an accessibility checkbox — it is the
   relief channel that makes the lighter palette slots legal on a white card,
   and it is genuinely the better view when someone wants to read the numbers
   rather than the shape. */
export function Figure({ title, sub, legend, children, table, right, tall }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <div className="card fig" data-reveal>
      <div className="chead">
        <h3>{title}</h3>
        {sub ? <span className="mono faint figsub">{sub}</span> : null}
        <div className="figtools">
          {right}
          {table ? (
            <button className="btn xs ghost" onClick={() => setAsTable((v) => !v)}
                    aria-pressed={asTable}
                    title={asTable ? "Show the chart" : "Show the numbers as a table"}>
              <Icon n={asTable ? "analytics" : "audit"} s={13} />
              {asTable ? "Chart" : "Table"}
            </button>
          ) : null}
        </div>
      </div>
      {legend && !asTable ? <Legend items={legend} /> : null}
      <div className={"cbody figbody" + (tall ? " tall" : "")}>
        {asTable ? table : children}
      </div>
    </div>
  );
}

export function Legend({ items }) {
  if (!items || items.length < 2) return null;   // one series names itself in the title
  return (
    <ul className="legend">
      {items.map((it) => (
        <li key={it.label}>
          <span className="lgd" style={{ background: it.color }} aria-hidden="true" />
          {it.label}
          {it.note ? <span className="faint"> {it.note}</span> : null}
        </li>
      ))}
    </ul>
  );
}

/* One tooltip implementation for every chart. Positioned against the figure
   rather than the page so it cannot escape a scrolled card. */
function useTip() {
  const [tip, setTip] = useState(null);
  const hide = () => setTip(null);
  const show = (e, node) => {
    const box = e.currentTarget.ownerSVGElement || e.currentTarget;
    const r = box.getBoundingClientRect();
    setTip({ x: e.clientX - r.left, y: e.clientY - r.top, node });
  };
  return [tip, show, hide];
}

function Tip({ tip }) {
  if (!tip) return null;
  return (
    <div className="charttip" style={{ left: tip.x, top: tip.y }} role="status">
      {tip.node}
    </div>
  );
}

/* ---------------- bars ---------------- */

/* Horizontal bars: the default for magnitude across named things, and the only
   honest form when the names are long — "Works, property & facilities" cannot
   be a column label at any font size that is also readable.

   `data`: [{key, label, value, color?, limit?}]. Sorted by the caller.

   `limit` draws a threshold tick on the track — an exposure ceiling, a budget.
   It is a mark rather than a second bar because the question it answers is
   "past it or not", and two bars make the reader subtract. */
export function Bars({ data, format = fmtCompact, max, onPick, unit, limitLabel = "limit" }) {
  const [tip, show, hide] = useTip();
  if (!data.length) return <Empty>Nothing to chart yet.</Empty>;
  const top = max || Math.max(...data.map((d) => Math.max(NUM(d.value), NUM(d.limit))), 1);
  return (
    <div className="bars2" onMouseLeave={hide}>
      {data.map((d) => {
        const pct = (NUM(d.value) / top) * 100;
        const over = d.limit ? NUM(d.value) > NUM(d.limit) : false;
        return (
          <div className={"bar2" + (onPick ? " click" : "")} key={d.key ?? d.label}
               onClick={onPick ? () => onPick(d) : undefined}
               onMouseMove={(e) => show(e, <><b>{d.label}</b><br />{format(d.value)}{unit ? " " + unit : ""}
                 {d.limit ? <><br /><span className="faint">{limitLabel} {format(d.limit)}</span></> : null}</>)}
               tabIndex={onPick ? 0 : undefined}
               onKeyDown={onPick ? (e) => e.key === "Enter" && onPick(d) : undefined}>
            <div className="b2l" title={d.label}>{d.label}</div>
            <div className="b2t">
              {/* 4px rounded data-end, square at the baseline */}
              <span className="b2f" style={{ width: Math.max(pct, 0.6) + "%",
                      background: over ? "var(--wax)" : (d.color || slot(0)) }} />
              {d.limit ? (
                <span className="b2lim" style={{ left: (NUM(d.limit) / top) * 100 + "%" }}
                      title={`${limitLabel} ${format(d.limit)}`} />
              ) : null}
            </div>
            <div className="b2v">{format(d.value)}</div>
          </div>
        );
      })}
      <Tip tip={tip} />
    </div>
  );
}

/* Vertical columns over a time axis — months, quarters.

   Deliberately not the same component as `Bars`. Horizontal bars compare named
   things and are sorted by size; columns compare periods and are locked in
   calendar order, and a reader who has learned that the left-hand bar is the
   biggest will misread a column chart badly. Different question, different form.

   `data`: [{key, label, value, color?}] or, stacked, [{key, label, parts:[...]}]
   with `key` an ISO-ish period ("2026-03") used for the axis label. */
export function Columns({ data, format = fmtCompact, unit, height = 190, onPick, tickEvery }) {
  const [tip, show, hide] = useTip();
  if (!data.length) return <Empty>Nothing to chart yet.</Empty>;

  const totals = data.map((d) => (d.parts ? d.parts.reduce((s, p) => s + NUM(p.value), 0) : NUM(d.value)));
  const top = Math.max(...totals, 1);
  /* Enough labels to orient, never so many they collide. One in four at a
     couple of years of months, all of them at a quarter's worth. */
  const every = tickEvery || Math.max(1, Math.ceil(data.length / 8));
  /* Across more than one calendar year every label carries its year. Without
     this a two-year axis prints "Aug" twice with nothing to separate them,
     which is worse than no label at all — it reads as a repeated month. */
  const spansYears = new Set(data.map((d) => String(d.key).slice(0, 4))).size > 1;

  return (
    <div className="cols" style={{ "--colh": height + "px" }} onMouseLeave={hide}>
      <div className="colgrid" aria-hidden="true">
        {[0, 0.5, 1].map((f) => <span key={f} style={{ bottom: `calc(${f * 100}% )` }} />)}
      </div>
      <div className="coltrack">
        {data.map((d, i) => {
          const total = totals[i];
          const parts = d.parts || [{ key: "v", label: d.label, value: d.value, color: d.color || slot(0) }];
          const tipNode = (
            <>
              <b>{d.label || d.key}</b>
              {d.parts
                ? parts.map((p) => <React.Fragment key={p.key}><br />{p.label}: {format(p.value)}</React.Fragment>)
                : <><br />{format(total)}{unit ? " " + unit : ""}</>}
            </>
          );
          return (
            <div className={"colw" + (onPick ? " click" : "")} key={d.key}
                 onClick={onPick ? () => onPick(d) : undefined}
                 onMouseMove={(e) => show(e, tipNode)}
                 tabIndex={onPick ? 0 : undefined}
                 onKeyDown={onPick ? (e) => e.key === "Enter" && onPick(d) : undefined}>
              <div className="colstack" style={{ height: `${(total / top) * 100}%` }}>
                {parts.filter((p) => NUM(p.value) > 0).map((p) => (
                  <span key={p.key} style={{ flex: NUM(p.value), background: p.color || slot(0) }} />
                ))}
              </div>
              <div className="collbl">{i % every === 0 ? periodLabel(d.key, spansYears) : " "}</div>
            </div>
          );
        })}
      </div>
      <Tip tip={tip} />
    </div>
  );
}

/* "2026-03" → "Mar", and "Jan 26" wherever the year turns over, so a two-year
   axis reads without a second row of labels. "2026-Q1" → "Q1 26". */
function periodLabel(key, withYear) {
  const s = String(key || "");
  const q = s.match(/^(\d{4})-Q(\d)$/);
  if (q) return `Q${q[2]} ${q[1].slice(2)}`;
  const m = s.match(/^(\d{4})-(\d{2})$/);
  if (!m) return s;
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                 "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m[2]) - 1] || m[2];
  // Across more than one calendar year every label carries its year: a two-year
  // axis that prints "Aug" twice with nothing between them reads as a repeat.
  return withYear || month === "Jan" ? `${month} ${m[1].slice(2)}` : month;
}

/* Stacked horizontal bars for part-to-whole across a few series.
   `rows`: [{key, label, parts:[{key,label,value,color}]}] */
export function StackedBars({ rows, format = fmtCompact, onPick }) {
  const [tip, show, hide] = useTip();
  if (!rows.length) return <Empty>Nothing to chart yet.</Empty>;
  const totals = rows.map((r) => r.parts.reduce((s, p) => s + NUM(p.value), 0));
  const top = Math.max(...totals, 1);
  return (
    <div className="bars2" onMouseLeave={hide}>
      {rows.map((r, i) => (
        <div className={"bar2" + (onPick ? " click" : "")} key={r.key}
             onClick={onPick ? () => onPick(r) : undefined}>
          <div className="b2l" title={r.label}>{r.label}</div>
          <div className="b2t stack" style={{ width: (totals[i] / top) * 100 + "%" }}>
            {r.parts.filter((p) => NUM(p.value) > 0).map((p) => (
              <span key={p.key} style={{ flex: NUM(p.value), background: p.color }}
                    onMouseMove={(e) => show(e, <><b>{p.label}</b><br />{format(p.value)} of {format(totals[i])}</>)} />
            ))}
          </div>
          <div className="b2v">{format(totals[i])}</div>
        </div>
      ))}
      <Tip tip={tip} />
    </div>
  );
}

/* ---------------- dumbbell: before → after ---------------- */

/* The right form for "what it was, what it became" — a saving, a price movement,
   a baseline against an award. Two dots joined by a rule reads as one fact about
   one item; two bars side by side reads as two facts you have to subtract in
   your head.

   `rows`: [{key,label,from,to,note}] */
export function Dumbbell({ rows, format = fmtCompact, fromLabel = "Before", toLabel = "After", goodDown = true }) {
  const [tip, show, hide] = useTip();
  if (!rows.length) return <Empty>Nothing to compare yet.</Empty>;
  const top = Math.max(...rows.flatMap((r) => [NUM(r.from), NUM(r.to)]), 1);
  const pc = (v) => (NUM(v) / top) * 100;
  return (
    <>
      <ul className="legend">
        <li><span className="lgd ring" aria-hidden="true" />{fromLabel}</li>
        <li><span className="lgd" style={{ background: slot(0) }} aria-hidden="true" />{toLabel}</li>
      </ul>
      <div className="dumb" onMouseLeave={hide}>
        {rows.map((r) => {
          const a = pc(r.from), b = pc(r.to);
          const better = goodDown ? NUM(r.to) < NUM(r.from) : NUM(r.to) > NUM(r.from);
          const lo = Math.min(a, b), hi = Math.max(a, b);
          return (
            <div className="dbr" key={r.key}
                 onMouseMove={(e) => show(e, <><b>{r.label}</b><br />
                   {fromLabel} {format(r.from)} → {toLabel} {format(r.to)}
                   {r.note ? <><br /><span className="faint">{r.note}</span></> : null}</>)}>
              <div className="b2l" title={r.label}>{r.label}</div>
              <div className="dbt">
                <span className="dbrule" style={{ left: lo + "%", width: (hi - lo) + "%",
                        background: better ? "var(--green)" : "var(--wax)" }} />
                <span className="dbdot from" style={{ left: a + "%" }} />
                <span className="dbdot to" style={{ left: b + "%", background: slot(0) }} />
              </div>
              <div className="b2v">{format(r.to)}</div>
            </div>
          );
        })}
        <Tip tip={tip} />
      </div>
    </>
  );
}

/* ---------------- donut ---------------- */

/* Part-to-whole for a handful of slices, with the total in the middle where the
   reader is already looking. Anything past six slices folds into "Other" before
   it gets here — see `foldTail`. */
export function Donut({ data, total, format = fmtCompact, centre, centreLabel, size = 190 }) {
  const [tip, show, hide] = useTip();
  const sum = total ?? data.reduce((s, d) => s + NUM(d.value), 0);
  if (!sum) return <Empty>Nothing to chart yet.</Empty>;
  const R = size / 2, r = R * 0.62, C = 2 * Math.PI * ((R + r) / 2);
  const width = R - r;
  let acc = 0;
  return (
    <div className="donutwrap" onMouseLeave={hide}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="donut" role="img"
           aria-label={`Total ${format(sum)}`}>
        <g transform={`rotate(-90 ${R} ${R})`}>
          {data.map((d) => {
            const frac = NUM(d.value) / sum;
            const len = frac * C;
            const el = (
              <circle key={d.key} cx={R} cy={R} r={(R + r) / 2} fill="none"
                      stroke={d.color} strokeWidth={width}
                      /* the 2px surface gap that separates touching segments */
                      strokeDasharray={`${Math.max(len - 2, 0.5)} ${C - Math.max(len - 2, 0.5)}`}
                      strokeDashoffset={-acc}
                      onMouseMove={(e) => show(e, <><b>{d.label}</b><br />{format(d.value)} · {Math.round(frac * 100)}%</>)} />
            );
            acc += len;
            return el;
          })}
        </g>
        <text x={R} y={R - 2} textAnchor="middle" className="dnum">{centre ?? format(sum)}</text>
        <text x={R} y={R + 16} textAnchor="middle" className="dlbl">{centreLabel || "total"}</text>
      </svg>
      <Tip tip={tip} />
    </div>
  );
}

/* Six slices plus a real "Other" beats nine slices nobody can tell apart. */
export function foldTail(data, keep = 6, otherLabel = "Other") {
  if (data.length <= keep + 1) return data;
  const head = data.slice(0, keep);
  const tail = data.slice(keep);
  return [...head, {
    key: "__other", label: `${otherLabel} (${tail.length})`,
    value: tail.reduce((s, d) => s + NUM(d.value), 0), color: "var(--faint)",
  }];
}

/* ---------------- line / area over time ---------------- */

/* `series`: [{key,label,color,points:[{x,y}]}] with x as epoch ms. */
export function TimeChart({ series, height = 210, format = fmtCompact, area, yLabel }) {
  const [hover, setHover] = useState(null);
  const wrapRef = useRef(null);
  const id = useId();
  const all = series.flatMap((s) => s.points);
  if (!all.length) return <Empty>No history yet.</Empty>;

  const xs = all.map((p) => p.x), ys = all.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs) || x0 + 1;
  const yTop = Math.max(...ys, 1) * 1.12;
  const W = 100, H = height, PAD = 26;   // W in %, H in px — the svg scales on x
  const px = (x) => (x1 === x0 ? 50 : ((x - x0) / (x1 - x0)) * (W - 2) + 1);
  const py = (y) => H - PAD - (NUM(y) / yTop) * (H - PAD - 12);

  // Four clean gridlines, rounded to numbers a person would say out loud.
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yTop);

  const onMove = (e) => {
    const r = wrapRef.current.getBoundingClientRect();
    const fx = ((e.clientX - r.left) / r.width) * W;
    let best = null;
    series.forEach((s) => s.points.forEach((p) => {
      const d = Math.abs(px(p.x) - fx);
      if (!best || d < best.d) best = { d, p, s };
    }));
    if (best) setHover(best);
  };

  return (
    <div className="tchart" ref={wrapRef} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" height={H} width="100%" role="img"
           aria-label={yLabel || "Trend over time"}>
        <defs>
          {series.map((s, i) => (
            <linearGradient key={s.key} id={`${id}-g${i}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.16" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {ticks.map((t, i) => (
          <line key={i} x1="0" x2={W} y1={py(t)} y2={py(t)} className="grid" vectorEffect="non-scaling-stroke" />
        ))}
        {series.map((s, i) => {
          const pts = [...s.points].sort((a, b) => a.x - b.x);
          const d = pts.map((p, j) => `${j ? "L" : "M"}${px(p.x)} ${py(p.y)}`).join(" ");
          return (
            <g key={s.key}>
              {area && pts.length > 1 && (
                <path d={`${d} L${px(pts[pts.length - 1].x)} ${H - PAD} L${px(pts[0].x)} ${H - PAD} Z`}
                      fill={`url(#${id}-g${i})`} />
              )}
              <path d={d} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round"
                    strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              {pts.length === 1 && <circle cx={px(pts[0].x)} cy={py(pts[0].y)} r="4" fill={s.color} />}
            </g>
          );
        })}
        {hover && (
          <>
            <line x1={px(hover.p.x)} x2={px(hover.p.x)} y1="8" y2={H - PAD} className="crosshair"
                  vectorEffect="non-scaling-stroke" />
            {/* surface ring keeps the marker legible where it crosses a line */}
            <circle cx={px(hover.p.x)} cy={py(hover.p.y)} r="5" fill={hover.s.color}
                    stroke="var(--card)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          </>
        )}
      </svg>
      <div className="tticks" aria-hidden="true">
        {ticks.slice(1).map((t, i) => (
          <span key={i} style={{ bottom: (H - py(t) - PAD) + "px" }}>{format(t)}</span>
        ))}
      </div>
      {hover && (
        <div className="charttip" style={{ left: `${px(hover.p.x)}%`, top: py(hover.p.y) - 6 }} role="status">
          <b>{hover.s.label}</b><br />
          {format(hover.p.y)}<br />
          <span className="faint">{new Date(hover.p.x).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
        </div>
      )}
    </div>
  );
}

/* ---------------- heatmap ---------------- */

/* Magnitude across a grid — category × month, person × status. One hue,
   more-is-darker: a rainbow here would claim the cells differ in kind when they
   differ only in amount. */
export function Heatmap({ rows, cols, value, format = fmtCompact, label }) {
  const [tip, show, hide] = useTip();
  const max = useMemo(
    () => Math.max(...rows.flatMap((r) => cols.map((c) => NUM(value(r, c)))), 1),
    [rows, cols, value]);
  if (!rows.length) return <Empty>Nothing to chart yet.</Empty>;
  return (
    <div className="heat" onMouseLeave={hide}>
      <div className="heatgrid" style={{ gridTemplateColumns: `minmax(96px,1.4fr) repeat(${cols.length}, 1fr)` }}>
        <div />
        {cols.map((c) => <div key={c.key} className="hcol">{c.label}</div>)}
        {rows.map((r) => (
          <React.Fragment key={r.key}>
            <div className="hrow" title={r.label}>{r.label}</div>
            {cols.map((c) => {
              const v = NUM(value(r, c));
              /* opacity carries magnitude on one hue; the floor keeps an empty
                 cell visibly a cell rather than a hole in the grid */
              const a = v ? 0.12 + (v / max) * 0.78 : 0;
              return (
                <div key={c.key} className="hcell"
                     style={{ background: v ? `color-mix(in srgb, var(--s1) ${a * 100}%, transparent)` : "var(--sunk)" }}
                     onMouseMove={(e) => show(e, <><b>{r.label} · {c.label}</b><br />{v ? format(v) : "nothing"}</>)}>
                  <span className={a > 0.55 ? "on" : ""}>{v ? format(v) : ""}</span>
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
      <Tip tip={tip} />
    </div>
  );
}

/* ---------------- meter ---------------- */

/* A single ratio against a limit. The unfilled track is a lighter step of the
   fill's own ramp, so the state reads across the whole bar rather than only in
   the filled part.

   `meter2`, not `meter`, for the same reason the bars above are `bars2`:
   styles.js already owns `.meter` as a bare 6px progress rail (supplier.jsx
   uses it), and sharing the name let that rule's fixed height collapse this
   component wherever it appeared — label, track and all. Two different marks
   cannot share one class name just because they mean roughly the same thing. */
export function Meter({ value, max, label, tone, format = fmtCompact }) {
  const pct = max ? Math.min(100, (NUM(value) / max) * 100) : 0;
  const over = NUM(value) > max;
  return (
    <div className="meter2">
      <div className="mlab">
        <span>{label}</span>
        <b className={over ? "waxfg" : ""}>{format(value)} <span className="faint">of {format(max)}</span></b>
      </div>
      <div className="mtrack">
        <span style={{ width: pct + "%", background: over ? "var(--wax)" : (tone || "var(--s1)") }} />
      </div>
    </div>
  );
}

/* ---------------- sparkline (stat tiles) ---------------- */

export function Spark({ points, w = 96, h = 26, color = "var(--s1)" }) {
  if (!points || points.length < 2) return null;
  const ys = points.map(NUM);
  const lo = Math.min(...ys), hi = Math.max(...ys);
  const span = hi - lo || 1;
  const d = ys.map((y, i) => `${i ? "L" : "M"}${(i / (ys.length - 1)) * w} ${h - ((y - lo) / span) * (h - 4) - 2}`).join(" ");
  return (
    <svg className="spark2" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ---------------- a table for any of the above ---------------- */

/* The relief channel, as one component. Every Figure that shows colour-encoded
   values should pass one of these as `table`. */
export function DataTable({ cols, rows }) {
  return (
    <div className="tscroll">
      <table className="tbl">
        <thead><tr>{cols.map((c) => <th key={c.key} className={c.num ? "num" : ""}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.key ?? i}>
              {cols.map((c) => (
                <td key={c.key} className={c.num ? "num mono" : ""} data-l={c.label}>
                  {c.render ? c.render(r) : r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
