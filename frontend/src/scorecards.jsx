/* Scorecards: rank the register on one weighted model, then read a supplier.

   Two deliberate rules, both visible in the UI:

   * The rank belongs to the model, not to the table. Sorting a column reorders
     the rows so you can scan a dimension, and the rank number travels with the
     supplier rather than being renumbered, so a sort can never be mistaken for
     a re-ranking.
   * A supplier with no operating history is held out and named, with the reason.
     Scoring an unknown as zero would rank it last and look like a judgement.

   Evaluators do not get this page. They score blind, and a ranking of the
   bidders in front of them is exactly the anchor the blindness exists to
   prevent. */
import React, { useMemo, useState } from "react";

import { Empty, Money } from "./atoms";
import { daysLeft } from "./helpers";
import { Icon } from "./icons";
import { DIMENSIONS, WEIGHT_LINE, buildBoard, holdOutGroups, holdOutSummary } from "./scorecard-model";
import { CountUp, Radar } from "./ui";

const num = (v) => (v == null ? "-" : Math.round(v));

function Delta({ value, peer }) {
  if (value == null || peer == null) return <span className="faint">-</span>;
  const d = Math.round(value - peer);
  if (d === 0) return <span className="faint">level</span>;
  const up = d > 0;
  return (
    <span className={up ? "greenfg" : "waxfg"} style={{ fontWeight: 600 }}>
      <Icon n={up ? "up" : "down"} s={11} />{up ? "+" : ""}{d}
    </span>
  );
}

/* A score in a cell, with its magnitude behind it.

   The number alone makes a column of five dimensions across forty suppliers a
   wall of digits nobody scans. A single-hue wash behind each figure turns the
   table into something you can read down at a glance without spending the
   identity channel: this is magnitude, so it is one hue getting darker, never a
   red-amber-green scale that would assert a pass mark the model doesn't define.
   The digits stay in ink at full contrast — the wash is behind the value, never
   instead of it. */
function ScoreCell({ value, peerValue, label }) {
  if (value == null) {
    return (
      <td className="num mono sc-cell" data-l={label}>
        <span className="faint" title={`No history. Scored at the peer average (${num(peerValue)}) for the composite.`}>
          peer
        </span>
      </td>
    );
  }
  const v = Math.max(0, Math.min(100, value));
  return (
    <td className="num mono sc-cell" data-l={label}>
      <span className="sc-wash" style={{ "--f": v / 100 }} aria-hidden="true" />
      <span className="sc-num">{num(value)}</span>
    </td>
  );
}

export function ScorecardsPage({ api }) {
  const { state } = api;
  const { rows, held, peer } = useMemo(() => buildBoard(state), [state]);
  const [pick, setPick] = useState(null);
  const [sort, setSort] = useState({ key: "composite", dir: -1 });
  const [tableView, setTableView] = useState(false);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");

  const selected = rows.find((r) => r.id === pick) || rows[0];

  /* Categories present on the board, not the whole taxonomy: offering a filter
     that can only ever return nothing is a filter that wastes a click. */
  const cats = useMemo(() => {
    const m = new Map();
    rows.forEach((r) => m.set(r.category, (m.get(r.category) || 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (cat && r.category !== cat) return false;
      if (!n) return true;
      return [r.name, r.category].some((x) => (x || "").toLowerCase().includes(n));
    });
  }, [rows, q, cat]);

  const sorted = useMemo(() => {
    const out = [...filtered];
    out.sort((a, b) => {
      const av = sort.key === "composite" ? a.composite : a.scores[sort.key];
      const bv = sort.key === "composite" ? b.composite : b.scores[sort.key];
      return ((bv ?? -1) - (av ?? -1)) * (sort.dir === -1 ? 1 : -1);
    });
    return out;
  }, [filtered, sort]);

  const head = (key, label, hint) => (
    <th key={key} className="num sortable" title={hint}
        onClick={() => setSort((s) => ({ key, dir: s.key === key ? -s.dir : -1 }))}
        aria-sort={sort.key === key ? (sort.dir === -1 ? "descending" : "ascending") : "none"}>
      {label}<span className="sortmark">{sort.key === key ? (sort.dir === -1 ? "↓" : "↑") : ""}</span>
    </th>
  );

  if (!rows.length) {
    return (
      <div>
        <div className="pagehead"><h1>Scorecards</h1></div>
        <div className="card"><Empty icon="scales">
          No supplier has enough history to score yet.
          {held.length ? " " + holdOutSummary(held) : ""}
        </Empty></div>
      </div>
    );
  }

  return (
    <div>
      <div className="pagehead">
        <h1>Scorecards</h1>
        <span className="sub">Ranked on one weighted model, then read supplier by supplier.</span>
      </div>

      {selected && <SupplierCard row={selected} peer={peer} state={state} total={rows.length}
                                 tableView={tableView} onTableView={setTableView} />}

      <div className="card" data-reveal style={{ marginTop: 16 }}>
        <div className="chead">
          <h3>Supplier ranking</h3>
          <span className="mono faint" style={{ marginLeft: "auto" }}>
            {sorted.length === rows.length
              ? `${rows.length} scored`
              : `${sorted.length} of ${rows.length}`}
          </span>
        </div>

        {/* Filters in one row above the table. */}
        <div className="scfilters">
          <input className="in" placeholder="Search supplier or category…" value={q}
                 aria-label="Search the ranking" onChange={(e) => setQ(e.target.value)} />
          <select className="in" value={cat} aria-label="Filter by category"
                  onChange={(e) => setCat(e.target.value)}>
            <option value="">All categories</option>
            {cats.map(([c, n]) => <option key={c} value={c}>{c} ({n})</option>)}
          </select>
          {(q || cat) && (
            <button className="btn sm" onClick={() => { setQ(""); setCat(""); }}>Clear</button>
          )}
          <span className="scweights mono faint">{WEIGHT_LINE}</span>
        </div>

        <div className="tscroll">
          <table className="tbl wide sctable">
            <thead>
              <tr>
                <th style={{ width: 56 }}>Rank</th>
                <th>Supplier</th>
                {DIMENSIONS.map((d) => head(d.key, d.label, `${d.full} — ${d.weight}% of the composite`))}
                {head("composite", "Composite", "The weighted model")}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id} className="click" aria-selected={selected && r.id === selected.id}
                    onClick={() => { setPick(r.id); setTableView(false); }}
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter") { setPick(r.id); setTableView(false); } }}>
                  <td className="mono sc-rank" data-l="Rank">
                    <span className={r.rank === 1 ? "lead" : ""}>{r.rank}</span>
                  </td>
                  <td data-l="Supplier"><b>{r.name}</b>
                    <div className="muted" style={{ fontSize: 12 }}>{r.category}</div>
                  </td>
                  {DIMENSIONS.map((d) => (
                    <ScoreCell key={d.key} value={r.scores[d.key]} peerValue={peer[d.key]} label={d.label} />
                  ))}
                  <td className="num mono sc-comp" data-l="Composite">
                    <b>{r.composite == null ? "-" : r.composite.toFixed(1)}</b>
                    {r.imputed.length > 0 &&
                      <span className="faint" title={`${r.observed} of ${DIMENSIONS.length} dimensions measured; ${r.imputed.join(", ")} scored at the peer average`}> *</span>}
                  </td>
                </tr>
              ))}
              {!sorted.length && (
                <tr><td colSpan={DIMENSIONS.length + 3}>
                  <Empty>No supplier on the board matches that.</Empty>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="cbody" style={{ paddingTop: 12 }}>
          <div className="muted" style={{ fontSize: 12, lineHeight: 1.6 }}>
            Rank is fixed by the composite model: sorting a column reorders the rows, not the ranking.
            {rows.some((r) => r.imputed.length > 0) &&
              " An asterisk marks a supplier with no history on one or more dimensions: those are scored at the peer average, which is neutral, rather than dropped, which would reward a thin record."}
            {held.length ? " " + holdOutSummary(held) : ""}
          </div>
          {held.length > 0 && <HeldOut held={held} />}
        </div>
      </div>
    </div>
  );
}

/** Who is not on the board, and why.

    Naming every held-out supplier was right when there were twelve of them. On
    a register of 1,400 it would print 1,400 chips and bury the two that a buyer
    can actually do something about, so each reason is named with its count and
    only the small groups open by default. Nothing is hidden: every group can be
    expanded, because "held out" is a claim the reader is entitled to check. */
const NAME_UP_TO = 24;

function HeldOut({ held }) {
  const groups = holdOutGroups(held);
  const [open, setOpen] = useState(() => new Set(groups.filter((g) => g.members.length <= NAME_UP_TO).map((g) => g.reason)));
  const toggle = (reason) => setOpen((prev) => {
    const next = new Set(prev);
    next.has(reason) ? next.delete(reason) : next.add(reason);
    return next;
  });
  return (
    <div style={{ marginTop: 12 }}>
      {groups.map((g) => {
        const isOpen = open.has(g.reason);
        return (
          <div key={g.reason} style={{ marginTop: 8 }}>
            <button className="doclink" style={{ fontSize: 12 }} onClick={() => toggle(g.reason)}
                    aria-expanded={isOpen}>
              {g.members.length.toLocaleString()} {g.reason} {isOpen ? "−" : "+"}
            </button>
            {isOpen && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                {g.members.slice(0, 300).map((h) => (
                  <span className="chip" key={h.id} title={h.category}>{h.name}</span>
                ))}
                {g.members.length > 300 && (
                  <span className="muted" style={{ fontSize: 12, alignSelf: "center" }}>
                    and {(g.members.length - 300).toLocaleString()} more on the register
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SupplierCard({ row, peer, state, total, tableView, onTableView }) {
  const supplier = state.suppliers.find((s) => s.id === row.id) || {};
  const docs = supplier.docs || [];
  /* Where the supplier has no history the shape follows the peer outline, which
     is exactly what the composite assumes, and the axis reads "peer". */
  const plotted = {};
  for (const d of DIMENSIONS) plotted[d.key] = row.scores[d.key] != null ? row.scores[d.key] : peer[d.key];
  const series = [
    { key: "s", label: row.name, values: plotted, missing: row.imputed, color: "var(--green)" },
    { key: "p", label: "Prequalified average", values: peer, color: "var(--muted)", dashed: true },
  ];

  return (
    <div className="card">
      {/* The composite is the one number this card is about, so it gets the
          hero treatment rather than sitting in the header as a chip among
          chips. Rank beside it, because a score with no field size behind it
          says nothing. */}
      <div className="chead scchead">
        <div className="schero">
          <div className="scname">
            <h3>{row.name}</h3>
            <div className="scmeta">
              <span className="chip">{row.category}</span>
              {supplier.subcategory ? <span className="chip">{supplier.subcategory}</span> : null}
              {supplier.location ? <span className="faint">{supplier.location}</span> : null}
            </div>
          </div>
          <div className="scfig">
            <div className="scfignum">
              {row.composite == null ? "-" : <CountUp n={row.composite} format={(x) => x.toFixed(1)} />}
            </div>
            <div className="scfiglbl">
              composite · rank <b className={row.rank === 1 ? "greenfg" : ""}>{row.rank}</b> of {total}
            </div>
          </div>
        </div>
        <div className="segmented scseg" role="tablist" aria-label="How to read this scorecard">
          <button role="tab" aria-selected={!tableView} className={!tableView ? "on" : ""}
                  onClick={() => onTableView(false)}>
            <Icon n="analytics" s={13} /> Chart
          </button>
          <button role="tab" aria-selected={tableView} className={tableView ? "on" : ""}
                  onClick={() => onTableView(true)}>
            <Icon n="audit" s={13} /> Table
          </button>
        </div>
      </div>
      <div className="cbody scwrap">
        <div className="scchart">
          {tableView ? (
            <table className="tbl sccompare">
              <thead>
                <tr><th>Dimension</th><th className="num">{row.name}</th><th className="num">Peer</th>
                    <th className="num">Δ</th><th className="num">Weight</th></tr>
              </thead>
              <tbody>
                {DIMENSIONS.map((d) => (
                  <tr key={d.key}>
                    <td data-l="Dimension">
                      {d.full}
                      <div className="faint" style={{ fontSize: 11 }}>
                        {d.source === "carried" ? "carried from the register" : "computed here"}
                      </div>
                    </td>
                    <td className="num mono" data-l={row.name}>
                      {row.scores[d.key] == null
                        ? <span className="faint">peer</span>
                        : <b>{num(row.scores[d.key])}</b>}
                    </td>
                    <td className="num mono faint" data-l="Peer">{num(peer[d.key])}</td>
                    <td className="num mono" data-l="Δ"><Delta value={row.scores[d.key]} peer={peer[d.key]} /></td>
                    <td className="num mono faint" data-l="Weight">{d.weight}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Radar axes={DIMENSIONS} series={series} />
          )}
          <div className="scnote">
            {tableView
              ? "Δ compares this supplier to the average of every prequalified supplier on the same dimension."
              : "The supplier is filled; the peer average is a dashed outline, so the two never rely on colour alone."}
          </div>
        </div>

        <div className="scdims">
          {/* Each dimension as a track against the peer marker. A number and a
              delta made the reader do the comparison in their head; the marker
              puts "where the field sits" in the same place as the score. */}
          {DIMENSIONS.map((d) => {
            const v = row.scores[d.key];
            const p = peer[d.key];
            return (
              <div className="scdim" key={d.key}>
                <div className="scdhead">
                  <span className="scdname">
                    <b>{d.full}</b>
                    <span className="mono faint">{d.weight}%</span>
                  </span>
                  <span className="scdval mono">
                    {v == null
                      ? <span className="faint" title="No history yet; scored at the peer average">peer</span>
                      : <b>{num(v)}</b>}
                    <Delta value={v} peer={p} />
                  </span>
                </div>
                <div className="scdtrack">
                  <span className="scdfill" style={{ width: Math.max(0, Math.min(100, v ?? p ?? 0)) + "%",
                          opacity: v == null ? 0.35 : 1 }} />
                  {p != null && (
                    <span className="scdpeer" style={{ left: Math.max(0, Math.min(100, p)) + "%" }}
                          title={`Peer average ${num(p)}`} />
                  )}
                </div>
                <div className="scdhint">
                  {d.hint}{" "}
                  <span className="faint">
                    {d.source === "carried" ? "Carried from the register." : "Computed from this workspace."}
                  </span>
                </div>
              </div>
            );
          })}
          <div className="notice" style={{ marginTop: 12, fontSize: 12.5 }}>
            {row.detail.answered} of {row.detail.invitations} closed invitation(s) answered
            {row.detail.pending ? ` (${row.detail.pending} still open)` : ""} ·
            {" "}{row.detail.bids} sealed bid(s) · {row.detail.wins} won,{" "}
            {row.detail.losses} lost{row.detail.winRate != null ? ` (${row.detail.winRate}% win rate)` : ""} ·
            {" "}awarded <Money n={row.detail.awarded} />
            {row.detail.price.n > 0
              ? ` · price scored on ${row.detail.price.n} opened competition(s)`
              : " · no opened prices to compare yet"}
            {row.detail.compliance.note ? ` · ${row.detail.compliance.note}` : ""}
          </div>
          {docs.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
              {docs.map((d, i) => {
                const left = d.expiry ? daysLeft(d.expiry) : null;
                return (
                  <span key={i} className={"chip " + (left != null && left <= 30 ? "warn" : "")}>
                    {d.name}{left != null ? ` · ${left < 0 ? "expired" : left + "d left"}` : ""}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const SCORECARD_CSS = `
.scwrap{display:grid;gap:18px}
@media(min-width:900px){
  .scwrap{grid-template-columns:minmax(0,320px) minmax(0,1fr);align-items:start}
}

/* ---------------- the card header ---------------- */
.scchead{flex-wrap:wrap;gap:14px;align-items:flex-start}
.schero{display:flex;align-items:flex-start;gap:20px;flex:1;min-width:0;flex-wrap:wrap}
.scname{min-width:0}
.scname h3{margin:0 0 5px}
.scmeta{display:flex;align-items:center;gap:7px;flex-wrap:wrap;font-size:11.5px}
.scfig{text-align:right;margin-left:auto}
/* Proportional figures, not tabular: a display-size number in tabular reads loose. */
.scfignum{font-family:var(--font-sans);font-size:30px;font-weight:600;line-height:1.05;
  color:var(--ink);font-variant-numeric:normal}
.scfiglbl{font-size:11px;color:var(--faint);margin-top:2px}
.scfiglbl b{color:var(--ink)}
.scseg{flex:0 0 auto}
.scseg button{display:inline-flex;align-items:center;gap:5px}

/* ---------------- ranking table ---------------- */
.scfilters{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:0 16px 12px}
.scfilters .in{padding:6px 10px;font-size:12.5px}
.scfilters .in:first-child{flex:1;min-width:170px}
.scfilters select.in{max-width:230px}
.scweights{width:100%;font-size:10.5px;line-height:1.5}

.tbl th.sortable{cursor:pointer;user-select:none;white-space:nowrap}
.tbl th.sortable:hover{color:var(--ink)}
.sortmark{display:inline-block;width:10px;text-align:left;color:var(--brand)}

.sctable tbody tr:focus-visible{outline:2px solid var(--brand);outline-offset:-2px}
.sc-rank span{display:inline-flex;align-items:center;justify-content:center;
  min-width:22px;height:22px;border-radius:6px;font-size:11.5px;
  font-variant-numeric:tabular-nums;color:var(--muted)}
.sc-rank .lead{background:var(--green-tint);color:var(--green-deep);font-weight:700}

/* The wash behind a score. One hue, opacity carries magnitude — sequential,
   because this is "how much", not "which one". The digits sit above it in ink
   so contrast never depends on the fill. */
.sc-cell{position:relative;isolation:isolate}
.sc-wash{position:absolute;inset:3px 2px;border-radius:4px;z-index:-1;
  background:var(--brand);opacity:calc(.05 + var(--f) * .3)}
.sc-num{position:relative;font-variant-numeric:tabular-nums}
.sc-comp b{font-size:13px;font-variant-numeric:tabular-nums}

.sccompare td,.sccompare th{vertical-align:top}

/* ---------------- dimension tracks ---------------- */
.scdim{padding:11px 0;border-bottom:1px solid var(--hair)}
.scdim:last-of-type{border-bottom:0}
.scdhead{display:flex;align-items:baseline;gap:10px;justify-content:space-between}
.scdname{display:flex;align-items:baseline;gap:7px;min-width:0}
.scdname b{font-size:13px}
.scdval{display:flex;align-items:baseline;gap:9px;flex:0 0 auto;font-size:13px}
.scdtrack{position:relative;height:7px;border-radius:5px;background:var(--sunk);margin:7px 0 6px}
.scdfill{display:block;height:100%;border-radius:5px;background:var(--brand);
  transition:width .5s cubic-bezier(.22,.61,.36,1)}
/* The peer marker: a rule, not a second bar. It answers "where does the field
   sit" without competing with the supplier's own value for attention. */
.scdpeer{position:absolute;top:-3px;bottom:-3px;width:2px;background:var(--ink);
  opacity:.5;transform:translateX(-1px);border-radius:1px}
.scdhint{font-size:11.5px;color:var(--muted);line-height:1.5}
.scnote{font-size:11.5px;color:var(--muted);line-height:1.55;margin-top:10px;text-align:center}

@media(prefers-reduced-motion:reduce){ .scdfill{transition:none} }
@media(max-width:720px){
  .scfig{margin-left:0}
  .scfignum{font-size:26px}
  .scfilters select.in{max-width:none;flex:1}
}
`;
