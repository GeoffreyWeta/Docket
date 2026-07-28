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
import { DIMENSIONS, WEIGHT_LINE, buildBoard, holdOutSummary } from "./scorecard-model";
import { Radar } from "./ui";

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

export function ScorecardsPage({ api }) {
  const { state } = api;
  const { rows, held, peer } = useMemo(() => buildBoard(state), [state]);
  const [pick, setPick] = useState(null);
  const [sort, setSort] = useState({ key: "composite", dir: -1 });
  const [tableView, setTableView] = useState(false);

  const selected = rows.find((r) => r.id === pick) || rows[0];

  const sorted = useMemo(() => {
    const out = [...rows];
    out.sort((a, b) => {
      const av = sort.key === "composite" ? a.composite : a.scores[sort.key];
      const bv = sort.key === "composite" ? b.composite : b.scores[sort.key];
      return ((bv ?? -1) - (av ?? -1)) * (sort.dir === -1 ? 1 : -1);
    });
    return out;
  }, [rows, sort]);

  const head = (key, label) => (
    <th className="num sortable" onClick={() => setSort((s) => ({ key, dir: s.key === key ? -s.dir : -1 }))}
        aria-sort={sort.key === key ? (sort.dir === -1 ? "descending" : "ascending") : "none"}>
      {label}{sort.key === key ? (sort.dir === -1 ? " ↓" : " ↑") : ""}
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

      <div className="card" style={{ marginTop: 16 }}>
        <div className="chead">
          <h3>Supplier ranking</h3>
          <span className="mono faint" style={{ marginLeft: "auto" }}>click to read a scorecard</span>
        </div>
        <div className="cbody" style={{ paddingTop: 0, paddingBottom: 0 }}>
          <div className="muted" style={{ fontSize: 12, padding: "10px 0" }}>{WEIGHT_LINE}</div>
        </div>
        <div className="tscroll">
          <table className="tbl wide">
            <thead>
              <tr>
                <th style={{ width: 52 }}>Rank</th>
                <th>Supplier</th>
                {DIMENSIONS.map((d) => head(d.key, d.label))}
                {head("composite", "Composite")}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id} className="click" aria-selected={selected && r.id === selected.id}
                    onClick={() => { setPick(r.id); setTableView(false); }}>
                  <td className="mono" data-l="Rank" style={{ fontWeight: r.rank === 1 ? 700 : 400,
                      color: r.rank === 1 ? "var(--green)" : undefined }}>
                    {r.rank === 1 ? "▲ " : ""}{r.rank}
                  </td>
                  <td data-l="Supplier"><b>{r.name}</b>
                    <div className="muted" style={{ fontSize: 12 }}>{r.category}</div>
                  </td>
                  {DIMENSIONS.map((d) => (
                    <td key={d.key} className="num mono" data-l={d.label}>
                      {r.scores[d.key] == null
                        ? <span className="faint" title={`No history. Scored at the peer average (${num(peer[d.key])}) for the composite.`}>-</span>
                        : num(r.scores[d.key])}
                    </td>
                  ))}
                  <td className="num mono" data-l="Composite"
                      style={{ fontWeight: 600, color: r.rank === 1 ? "var(--green)" : undefined }}>
                    {r.composite == null ? "-" : r.composite.toFixed(1)}
                    {r.imputed.length > 0 &&
                      <span className="faint" title={`${r.observed} of ${DIMENSIONS.length} dimensions measured; ${r.imputed.join(", ")} scored at the peer average`}> *</span>}
                  </td>
                </tr>
              ))}
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
          {held.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
              {held.map((h) => (
                <span className="chip" key={h.id} title={h.reason}>{h.name}: {h.reason}</span>
              ))}
            </div>
          )}
        </div>
      </div>
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
      <div className="chead">
        <h3>{row.name}</h3>
        <span className="chip">{row.category}</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <span className={"chip " + (row.rank === 1 ? "ok" : "")}>Rank {row.rank} of {total}</span>
          <span className="mono" style={{ fontWeight: 600 }}>
            {row.composite == null ? "-" : row.composite.toFixed(1)}
          </span>
          <button className="btn sm" onClick={() => onTableView(!tableView)}>
            <Icon n={tableView ? "analytics" : "audit"} s={14} />{tableView ? "Chart view" : "Table view"}
          </button>
        </span>
      </div>
      <div className="cbody scwrap">
        <div className="scchart">
          {tableView ? (
            <table className="tbl">
              <thead>
                <tr><th>Dimension</th><th className="num">{row.name}</th><th className="num">Peer average</th><th className="num">Weight</th></tr>
              </thead>
              <tbody>
                {DIMENSIONS.map((d) => (
                  <tr key={d.key}>
                    <td data-l="Dimension">{d.full}</td>
                    <td className="num mono" data-l={row.name}>{num(row.scores[d.key])}</td>
                    <td className="num mono" data-l="Peer average">{num(peer[d.key])}</td>
                    <td className="num mono faint" data-l="Weight">{d.weight}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Radar axes={DIMENSIONS} series={series} />
          )}
          <div className="muted" style={{ fontSize: 12, lineHeight: 1.55, marginTop: 10, textAlign: "center" }}>
            The supplier is filled; the peer average is a dashed outline, so the two never rely on colour alone.
          </div>
        </div>

        <div className="scdims">
          {DIMENSIONS.map((d) => (
            <div className="rowline" key={d.key}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <b>{d.full}</b> <span className="mono faint">{d.weight}%</span>
                <div className="muted" style={{ fontSize: 12 }}>
                  {d.hint} {d.source === "carried"
                    ? <span className="faint">Carried from the register.</span>
                    : <span className="faint">Computed from this workspace.</span>}
                </div>
              </span>
              <span className="mono" style={{ width: 42, textAlign: "right", fontWeight: 600 }}>
                {row.scores[d.key] == null
                  ? <span className="faint" title="No history yet; scored at the peer average">peer</span>
                  : num(row.scores[d.key])}
              </span>
              <span className="mono" style={{ width: 62, textAlign: "right", fontSize: 12 }}>
                <Delta value={row.scores[d.key]} peer={peer[d.key]} />
              </span>
            </div>
          ))}
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
.tbl th.sortable{cursor:pointer;user-select:none}
.tbl th.sortable:hover{color:var(--ink)}
@media(min-width:900px){
  .scwrap{grid-template-columns:minmax(0,320px) minmax(0,1fr);align-items:start}
}
`;
