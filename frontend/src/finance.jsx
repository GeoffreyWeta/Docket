/* Finance.

   Procurement's consequences, for the people who carry them. Analytics answers
   "how is the buying going"; this answers "what did it cost, what do we still
   owe, and what is about to go wrong" — different questions, different
   audience, and the reason this is a page rather than a sixth tab over there.

   Three rules the whole page is built on, each one a way procurement
   dashboards normally mislead:

   * **A saving is a comparison.** Measured against a recorded prior price it is
     a fact; against an internal estimate it is a comment on the estimate;
     against the median bid it is a counterfactual. All three are here and none
     of them are added together. The definitions are shared with the Analytics
     page — see analytics-model.js and backend/core/finance.py — because two
     pages disagreeing about how much was saved is worse than one of them not
     existing.

   * **Committed is not invoiced is not paid.** Three different numbers about
     the same purchase, and the fastest way to overstate a department's spend is
     to let one stand in for another. They are named separately everywhere.

   * **The ledger is a mirror.** Contracts, invoices and payments live in the
     finance system; this reads a copy. The banner at the top says how old that
     copy is, because a stale ledger drawn without comment gets believed.
*/
import React, { useEffect, useMemo, useState } from "react";

import { Empty, Stat } from "./atoms";
import { BaselineBackfill } from "./baselines";
import {
  Bars, Columns, DataTable, Donut, Dumbbell, Figure, Heatmap, Legend, Meter,
  StackedBars, TimeChart, foldTail, palette, slot,
} from "./charts";
import {
  AGE_TONE, EXCEPTION_KINDS, FRAUD_KINDS, FRESHNESS, LEVEL_META, TONE, asAt,
  columns, days, delta, exceptionTotals, freshness, groupExceptions, pct, points,
  riskLevels, term, topN, weakest,
} from "./finance-model";
import { fmtCompact, fmtDate, fmtMoney } from "./helpers";
import { Icon } from "./icons";
import { useReveal } from "./motion";
import { can } from "./perms";
import { CountUp } from "./ui";

const thisMonth = () =>
  new Date().toLocaleDateString("en-GB", { month: "long" });

const TABS = [
  { key: "savings", label: "Savings", icon: "trophy" },
  { key: "spend", label: "Spend", icon: "analytics" },
  { key: "contracts", label: "Contracts", icon: "file" },
  { key: "payments", label: "Payments", icon: "finance", perm: "finance.payables" },
  { key: "compliance", label: "Compliance", icon: "seal" },
  { key: "risk", label: "Risk", icon: "shield" },
  { key: "exceptions", label: "Exceptions", icon: "alert" },
];

export function FinancePage({ api }) {
  const { user, toast } = api;
  const [tab, setTab] = useState("savings");
  const [year, setYear] = useState(null);        // null = everything on file
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let live = true;
    setBusy(true);
    api.finance.state(year)
      .then((d) => { if (live) { setData(d); setErr(""); } })
      .catch((e) => { if (live) setErr(e.message || "The finance service is unreachable."); })
      .finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [year]);   // eslint-disable-line react-hooks/exhaustive-deps

  /* This page arms its own reveal observer. App.jsx arms one per route change
     against the bootstrap payload, which is already in hand when every other
     page mounts — here the cards are drawn from a payload that arrives after
     that observer has run and disconnected, and switching tabs mounts a fresh
     set without changing the route. Both cases leave `[data-reveal]` sitting at
     opacity 0, which is a blank page rather than a subtle animation bug.

     Above the early returns, where hooks have to live: the loading render must
     call exactly as many as the loaded one. */
  useReveal([data, tab]);

  const tabs = TABS.filter((t) => !t.perm || can(user, t.perm));
  const shown = tabs.some((t) => t.key === tab) ? tab : tabs[0].key;

  if (err) {
    return (
      <div>
        <div className="pagehead"><h1>Finance</h1></div>
        <div className="card"><div className="cbody">
          <Empty icon="alert">{err}</Empty>
        </div></div>
      </div>
    );
  }
  if (!data) {
    return (
      <div>
        <div className="pagehead"><h1>Finance</h1>
          <span className="sub">Reading the ledger…</span></div>
        <div className="grid g4">{[0, 1, 2, 3].map((i) => <div key={i} className="stat skel" />)}</div>
      </div>
    );
  }

  const ex = exceptionTotals(data.exceptions);

  return (
    <div className={busy ? "refreshing" : ""}>
      <div className="pagehead">
        <h1>Finance</h1>
        <span className="sub">What procurement cost, what is still owed, and what is about to go wrong.</span>
      </div>

      <LedgerBanner ledger={data.ledger} restricted={data.restricted} />

      <div className="anbar">
        <div className="antabs" role="tablist">
          {tabs.map((t) => (
            <button key={t.key} role="tab" aria-selected={shown === t.key}
                    className={"antab" + (shown === t.key ? " on" : "")}
                    onClick={() => setTab(t.key)}>
              <Icon n={t.icon} s={14} />{t.label}
              {t.key === "exceptions" && ex.warn > 0 && (
                <span className="tabcount" aria-label={`${ex.warn} needing attention`}>{ex.warn}</span>
              )}
            </button>
          ))}
        </div>
        <YearPicker value={year} onChange={setYear} savings={data.savings} />
      </div>

      {shown === "savings" && <SavingsTab d={data} api={api} />}
      {shown === "spend" && <SpendTab d={data} api={api} />}
      {shown === "contracts" && <ContractsTab d={data} api={api} />}
      {shown === "payments" && <PaymentsTab d={data} api={api} />}
      {shown === "compliance" && <ComplianceTab d={data} api={api} />}
      {shown === "risk" && <RiskTab d={data} api={api} />}
      {shown === "exceptions" && <ExceptionsTab d={data} api={api} />}
    </div>
  );
}

/* The years the data actually covers, rather than a range somebody guessed. */
function YearPicker({ value, onChange, savings }) {
  const years = (savings.byYear || []).map((y) => y.key).slice(-3);
  return (
    <div className="anrange">
      <button className={"btn xs ghost" + (value == null ? " on" : "")} aria-pressed={value == null}
              onClick={() => onChange(null)}>All time</button>
      {years.map((y) => (
        <button key={y} className={"btn xs ghost" + (String(value) === y ? " on" : "")}
                aria-pressed={String(value) === y} onClick={() => onChange(Number(y))}>{y}</button>
      ))}
    </div>
  );
}

/* ---------------- the staleness banner ----------------

   Deliberately at the top and deliberately not dismissible. Everything below it
   is only as true as the copy it was computed from, and that is a fact about
   every number on the page rather than a notice about one of them. */

function LedgerBanner({ ledger, restricted }) {
  const f = freshness(ledger);
  const rows = ledger?.rows || {};
  const total = Object.values(rows).reduce((n, v) => n + v, 0);

  const tone = { live: "var(--green)", ageing: "var(--s4)", stale: "var(--wax)", never: "var(--wax)" }[f.band];
  const words = {
    live: "The finance ledger is current.",
    ageing: "The finance ledger is a few days old.",
    stale: "The finance ledger has not been refreshed recently.",
    never: "No finance ledger has been loaded.",
  }[f.band];

  return (
    <div className="ledgerbar" style={{ borderLeftColor: tone }}>
      <Icon n={f.band === "live" ? "check" : "alert"} s={15} />
      <div className="lbmain">
        <b>{words}</b>{" "}
        <span className="muted">
          {f.band === "never"
            ? "Contracts, invoices and payments come from Dynamics NAV. Until an export is loaded, the sections below show only what this system knows: tenders and awards."
            : <>Every contract, invoice and payment below is a mirror of the finance
               system, {f.label}{f.at ? ` (${fmtDate(f.at)})` : ""}. {f.note}</>}
        </span>
      </div>
      {total > 0 && (
        <span className="mono faint lbcount">
          {rows.contracts} contracts · {rows.invoices} invoices · {rows.payments} payments
        </span>
      )}
      {restricted?.includes("payables") && (
        <span className="chip" title="You can see spend and savings, but not what individual vendors are owed.">
          payables hidden
        </span>
      )}
    </div>
  );
}

/* ================================================================ savings */

function SavingsTab({ d, api }) {
  const s = d.savings;
  const av = d.avoidance;
  const neg = s.negotiated;
  const bud = s.budget;
  const util = d.trends?.budgetUtilisation || [];

  const dumbbell = neg.rows.slice(0, 12).map((r) => ({
    key: r.id, label: r.title, from: r.against, to: r.awarded,
    note: r.source ? `vs ${r.source}` : null,
  }));

  const yearRows = (s.byYear || []).map((y) => ({
    key: y.key, label: y.key,
    parts: [
      { key: "n", label: "Negotiated", value: y.negotiated, color: TONE.savings },
      { key: "b", label: "Against budget", value: y.budget, color: slot(3) },
    ],
  }));

  return (
    <>
      <div className="grid g4" style={{ marginBottom: 14 }}>
        <Stat k="Negotiated savings" v={<CountUp n={neg.total} format={fmtCompact} />}
              d={neg.n ? `${neg.n} award${neg.n === 1 ? "" : "s"} against a recorded prior price` : "no baselines on file yet"}
              tone={neg.total > 0 ? "var(--green)" : null} />
        <Stat k="Savings rate" v={pct(neg.rate)} d="weighted by value, against baseline" />
        <Stat k="Against budget only" v={fmtCompact(bud.total)}
              d={`${bud.n} award${bud.n === 1 ? "" : "s"} with no prior price recorded`}
              tone="var(--s4)" />
        <Stat k="Highest single saving"
              v={s.highest ? fmtCompact(s.highest.amount) : "—"}
              d={s.highest ? s.highest.ref : "nothing awarded yet"} />
      </div>

      <div className="card" style={{ marginBottom: 14, borderLeft: "3px solid var(--s1)" }}>
        <div className="cbody" style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
          <b style={{ color: "var(--ink)" }}>Three numbers, kept apart.</b>{" "}
          <b>Negotiated</b> compares an award to what the organisation was actually paying
          before — a prior contract, an incumbent's renewal quote. That is the figure that
          survives a review. <b>Against budget</b> compares it to the ceiling somebody
          estimated beforehand, which measures the estimate as much as the buying.{" "}
          <b>Cost avoidance</b> compares it to the median bid received: real money not
          spent, but against what the market asked rather than what you used to pay.
          Adding them together produces a headline nobody can defend.
        </div>
      </div>

      {/* The migration path: awards made before this system existed can still be
          measured properly, because the ledger already holds what they replaced.
          Only shown to someone who may actually adopt one. */}
      {can(api.user, "finance.baseline") && (
        <div style={{ marginBottom: 14 }}><BaselineBackfill api={api} /></div>
      )}

      <div className="grid g2">
        <Figure title="Baseline → award" sub="negotiated savings, per tender" tall
                table={<DataTable
                  cols={[{ key: "label", label: "Tender" },
                         { key: "from", label: "Baseline", num: true, render: (r) => fmtMoney(r.from) },
                         { key: "to", label: "Awarded", num: true, render: (r) => fmtMoney(r.to) },
                         { key: "d", label: "Saved", num: true, render: (r) => fmtMoney(r.from - r.to) }]}
                  rows={dumbbell} />}>
          {dumbbell.length
            ? <Dumbbell rows={dumbbell} fromLabel="Was paying" toLabel="Awarded at" />
            : <Empty icon="scales">
                No award yet has a recorded prior price. Add a baseline when drafting a
                tender and its saving becomes measurable here.
              </Empty>}
        </Figure>

        <Figure title="Savings by year" sub="the two bases, side by side" tall
                legend={[{ label: "Negotiated", color: TONE.savings },
                         { label: "Against budget", color: slot(3) }]}
                table={<DataTable
                  cols={[{ key: "key", label: "Year" },
                         { key: "negotiated", label: "Negotiated", num: true, render: (r) => fmtMoney(r.negotiated) },
                         { key: "budget", label: "vs budget", num: true, render: (r) => fmtMoney(r.budget) },
                         { key: "n", label: "Awards", num: true }]}
                  rows={s.byYear} />}>
          {yearRows.length
            ? <StackedBars rows={yearRows} />
            : <Empty>Nothing awarded yet.</Empty>}
        </Figure>

        <Figure title="Negotiated savings over time" sub="cumulative — the defensible line" tall
                table={<DataTable
                  cols={[{ key: "key", label: "Month" },
                         { key: "value", label: "Cumulative", num: true, render: (r) => fmtMoney(r.value) }]}
                  rows={s.trend} />}>
          {s.trend.length > 1
            ? <TimeChart area series={[{ key: "sav", label: "Negotiated savings",
                                         color: TONE.savings, points: points(s.trend) }]} />
            : <Empty>Nothing to plot until two awards have a baseline behind them.</Empty>}
        </Figure>

        {/* No `legend` prop: Dumbbell labels its own two ends, and passing one
            here stacks a second legend saying the same thing. */}
        <Figure title="Budget utilisation" sub="awarded value against the budget approved for it"
                table={<DataTable
                  cols={[{ key: "key", label: "Month" },
                         { key: "budget", label: "Budget", num: true, render: (r) => fmtMoney(r.budget) },
                         { key: "spend", label: "Awarded", num: true, render: (r) => fmtMoney(r.spend) },
                         { key: "value", label: "Used", num: true, render: (r) => pct(r.value, 0) }]}
                  rows={util} />}>
          {util.length ? (
            <>
              {/* Only tenders carry a budget, so this series is exactly as long
                  as the tendering history. Padding it with ledger contracts that
                  never had one would draw a utilisation line out of nothing. */}
              <Dumbbell rows={util.slice(-8).map((r) => ({
                          key: r.key, label: r.key, from: r.budget, to: r.spend,
                          note: `${pct(r.value, 0)} of budget` }))}
                        fromLabel="Budget" toLabel="Awarded" goodDown />
              <div className="muted" style={{ fontSize: 12, paddingTop: 10, lineHeight: 1.5 }}>
                Months with an award that carried an approved budget. Ledger contracts
                that never had one are not counted here — they appear under Spend.
              </div>
            </>
          ) : (
            <Empty icon="scales">
              No awarded tender in this period carried an approved budget to measure against.
            </Empty>
          )}
        </Figure>

        <Figure title="Cost avoidance" sub="award against the median bid received" tall
                right={av.skipped ? <span className="mono faint">{av.skipped} award(s) had too few bids</span> : null}
                table={<DataTable
                  cols={[{ key: "title", label: "Tender" },
                         { key: "median", label: "Median bid", num: true, render: (r) => fmtMoney(r.median) },
                         { key: "awarded", label: "Awarded", num: true, render: (r) => fmtMoney(r.awarded) },
                         { key: "amount", label: "Avoided", num: true, render: (r) => fmtMoney(r.amount) }]}
                  rows={av.rows.map((r) => ({ ...r, key: r.id }))} />}>
          {av.rows.length ? (
            <>
              <div className="bigfig">
                <b>{fmtCompact(av.total)}</b>
                <span>not spent against what the market was asking, across {av.n} award{av.n === 1 ? "" : "s"}</span>
              </div>
              <Bars data={av.rows.slice(0, 8).map((r) => ({
                key: r.id, label: r.title, value: r.amount, color: slot(0) }))} />
            </>
          ) : (
            <Empty icon="scales">
              Cost avoidance needs three or more priced bids on a tender, below which
              "the median bid" is one opinion rather than a market price.
              {av.skipped ? ` ${av.skipped} award(s) fell short of that.` : ""}
            </Empty>
          )}
        </Figure>
      </div>
    </>
  );
}

/* ================================================================== spend */

function SpendTab({ d, api }) {
  const [dim, setDim] = useState("department");
  const spend = d.spend;
  const slice = spend[dim] || { rows: [], label: "" };
  const t = d.trends;

  const colour = useMemo(
    () => palette(slice.rows.map((r) => r.key)), [slice.rows]);

  const rows = topN(slice.rows, 10);
  const unrecorded = slice.unrecorded || 0;

  return (
    <>
      <div className="grid g4" style={{ marginBottom: 14 }}>
        <Stat k="Committed spend" v={<CountUp n={spend._total} format={fmtCompact} />}
              d={`${spend._units} contracts and awards`} />
        <Stat k="Largest single line"
              v={slice.rows.length ? fmtCompact(slice.rows[0].value) : "—"}
              d={slice.rows.length ? `${slice.rows[0].label} — ${slice.label.toLowerCase()}` : ""} />
        <Stat k="Unrecorded" v={unrecorded ? fmtCompact(unrecorded) : "none"}
              d={unrecorded ? `not coded to a ${slice.label.toLowerCase()}` : `every commitment carries a ${slice.label.toLowerCase()}`}
              tone={unrecorded ? "var(--wax)" : null} />
        <Stat k="This quarter"
              v={t.quarterly.length ? fmtCompact(t.quarterly[t.quarterly.length - 1].value) : "—"}
              d={t.quarterly.length ? t.quarterly[t.quarterly.length - 1].key : ""} />
      </div>

      <div className="dimbar" role="tablist" aria-label="Break spend down by">
        <span className="dimlbl">Spend by</span>
        {(d.dimensions || []).map((x) => (
          <button key={x.key} role="tab" aria-selected={dim === x.key}
                  className={"deskchip" + (dim === x.key ? " on" : "")}
                  onClick={() => setDim(x.key)}>{x.label}</button>
        ))}
      </div>

      <div className="grid g2">
        <Figure title={`Spend by ${slice.label.toLowerCase()}`}
                sub="committed — awarded or contracted, not invoiced"
                table={<DataTable
                  cols={[{ key: "label", label: slice.label },
                         { key: "value", label: "Committed", num: true, render: (r) => fmtMoney(r.value) },
                         { key: "n", label: "Commitments", num: true }]}
                  rows={rows} />}>
          {rows.length
            ? <Bars data={rows.map((r) => ({ ...r, color: colour(r.key) }))} />
            : <Empty icon="analytics">Nothing has been committed yet.</Empty>}
        </Figure>

        <Figure title={`Share by ${slice.label.toLowerCase()}`} sub="committed spend"
                table={<DataTable
                  cols={[{ key: "label", label: slice.label },
                         { key: "value", label: "Committed", num: true, render: (r) => fmtMoney(r.value) }]}
                  rows={slice.rows} />}>
          {slice.rows.length
            ? <Donut data={foldTail(slice.rows.map((r) => ({
                key: r.key, label: r.label, value: r.value, color: colour(r.key) })))}
                     centreLabel="committed" />
            : <Empty>Nothing to chart.</Empty>}
        </Figure>

        <Figure title="Monthly procurement spend" sub="value committed each month"
                table={<DataTable
                  cols={[{ key: "key", label: "Month" },
                         { key: "value", label: "Committed", num: true, render: (r) => fmtMoney(r.value) }]}
                  rows={t.spend} />}>
          {t.spend.length
            ? <Columns data={columns(t.spend, TONE.committed)} />
            : <Empty>No committed spend on file.</Empty>}
        </Figure>

        <Figure title="Procurement value by quarter" sub="committed"
                table={<DataTable
                  cols={[{ key: "key", label: "Quarter" },
                         { key: "value", label: "Committed", num: true, render: (r) => fmtMoney(r.value) }]}
                  rows={t.quarterly} />}>
          {t.quarterly.length
            ? <Columns data={columns(t.quarterly, TONE.committed)} tickEvery={1} />
            : <Empty>Nothing yet.</Empty>}
        </Figure>

        <Figure title="Top 10 suppliers by spend" sub="committed, all sources"
                table={<DataTable
                  cols={[{ key: "label", label: "Supplier" },
                         { key: "value", label: "Committed", num: true, render: (r) => fmtMoney(r.value) },
                         { key: "n", label: "Commitments", num: true }]}
                  rows={spend.supplier.rows} />}>
          <Bars data={topN(spend.supplier.rows, 10).map((r) => ({ ...r, color: slot(0) }))} />
        </Figure>

        <Figure title="Top 10 categories by spend" sub="committed"
                table={<DataTable
                  cols={[{ key: "label", label: "Category" },
                         { key: "value", label: "Committed", num: true, render: (r) => fmtMoney(r.value) }]}
                  rows={spend.category.rows} />}>
          <Bars data={topN(spend.category.rows, 10).map((r) => ({ ...r, color: slot(2) }))} />
        </Figure>

        <Figure title="Procurement cycle time" sub="publish → award, averaged by month"
                table={<DataTable
                  cols={[{ key: "key", label: "Month" },
                         { key: "value", label: "Days", num: true,
                           render: (r) => (r.value == null ? "—" : Math.round(r.value)) }]}
                  rows={t.cycleTime} />}>
          {t.cycleTime.length ? (
            <Columns data={columns(t.cycleTime, slot(6))}
                     format={(n) => Math.round(n) + "d"} unit="average" />
          ) : <Empty>No tender has run from publication to award yet.</Empty>}
        </Figure>

        <Figure title="Market price index"
                sub="median bid as a share of the tender's own budget"
                table={<DataTable
                  cols={[{ key: "key", label: "Month" },
                         { key: "value", label: "Median bid vs budget", num: true,
                           render: (r) => pct(r.value, 0) }]}
                  rows={t.priceIndex} />}>
          {t.priceIndex.length ? (
            <>
              {/* Not an average of award values: scopes differ between tenders, so
                  that would measure what was bought rather than what it cost.
                  Indexing each month's median bid against the budget set for it
                  is the comparison that holds across dissimilar purchases. */}
              <Columns data={columns(t.priceIndex, slot(4))} format={(n) => pct(n, 0)} />
              <div className="muted" style={{ fontSize: 12, paddingTop: 10, lineHeight: 1.5 }}>
                Above 100% means the market is asking more than the organisation budgeted.
                It measures pressure against your own estimates, not absolute unit prices.
              </div>
            </>
          ) : <Empty>Needs two or more priced bids on an opened tender.</Empty>}
        </Figure>
      </div>
    </>
  );
}

/* ============================================================== contracts */

function ContractsTab({ d, api }) {
  const c = d.contracts;
  const [filter, setFilter] = useState("all");

  const buckets = [
    { key: "all", label: "All", rows: c.rows },
    { key: "expiring", label: "Expiring", rows: c.expiring },
    { key: "expired", label: "Expired", rows: c.expired },
    { key: "exhausted", label: "Near exhausted", rows: c.exhausted },
    { key: "escalated", label: "Escalated", rows: c.escalated },
    { key: "untendered", label: "No tender", rows: c.untendered },
  ];
  const shown = (buckets.find((b) => b.key === filter) || buckets[0]).rows;

  return (
    <>
      <div className="grid g4" style={{ marginBottom: 14 }}>
        <Stat k="Live contract value" v={<CountUp n={c.value} format={fmtCompact} />}
              d={`${c.live} active of ${c.count} on file`} />
        <Stat k="Paid to date" v={fmtCompact(c.paid)}
              d={`${pct(c.utilisation, 0)} of live contract value`} />
        <Stat k="Remaining balance" v={fmtCompact(c.balance)} d="committed and not yet paid" />
        <Stat k="Cost escalation" v={delta(c.changeValue)}
              d={`${c.changeOrders} change order${c.changeOrders === 1 ? "" : "s"} across the portfolio`}
              tone={c.changeValue > 0 ? "var(--wax)" : null} />
      </div>

      <div className="dimbar">
        <span className="dimlbl">Show</span>
        {buckets.map((b) => (
          <button key={b.key} className={"deskchip" + (filter === b.key ? " on" : "")}
                  onClick={() => setFilter(b.key)}>
            {b.label} <b>{b.rows.length}</b>
          </button>
        ))}
      </div>

      <div className="card" data-reveal style={{ marginBottom: 14 }}>
        <div className="chead">
          <h3>{(buckets.find((b) => b.key === filter) || buckets[0]).label} contracts</h3>
          <span className="mono faint" style={{ marginLeft: "auto" }}>
            {shown.length} · {fmtCompact(shown.reduce((n, r) => n + r.value, 0))}
          </span>
        </div>
        <div className="cbody" style={{ paddingTop: 4 }}>
          {shown.length
            ? <ContractList rows={shown} />
            : <Empty icon="seal">Nothing in this group.</Empty>}
        </div>
      </div>

      <div className="grid g2">
        <Figure title="Contract utilisation" sub="paid against value, live contracts"
                table={<DataTable
                  cols={[{ key: "ref", label: "Contract" },
                         { key: "value", label: "Value", num: true, render: (r) => fmtMoney(r.value) },
                         { key: "paid", label: "Paid", num: true, render: (r) => fmtMoney(r.paid) },
                         { key: "utilisation", label: "Used", num: true, render: (r) => pct(r.utilisation, 0) }]}
                  rows={c.rows.filter((r) => r.status === "active")} />}>
          <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
            {c.rows.filter((r) => r.status === "active").slice(0, 8).map((r) => (
              <Meter key={r.id} label={r.title || r.ref} value={r.paid} max={r.value}
                     tone={r.utilisation >= 90 ? "var(--wax)" : TONE.paid} />
            ))}
            {!c.live && <Empty>No live contracts.</Empty>}
          </div>
        </Figure>

        <Figure title="Drawdown over time" sub="cumulative paid against cumulative committed"
                legend={[{ label: "Committed", color: TONE.committed },
                         { label: "Paid", color: TONE.paid }]}
                tall
                table={<DataTable
                  cols={[{ key: "key", label: "Month" },
                         { key: "committed", label: "Committed", num: true, render: (r) => fmtMoney(r.committed) },
                         { key: "paid", label: "Paid", num: true, render: (r) => fmtMoney(r.paid) },
                         { key: "value", label: "Drawn", num: true, render: (r) => pct(r.value, 0) }]}
                  rows={d.trends.drawdown} />}>
          {/* Both series are naira on one scale — never a second y-axis. */}
          {d.trends.drawdown.length > 1 ? (
            <TimeChart series={[
              { key: "c", label: "Committed", color: TONE.committed,
                points: d.trends.drawdown.map((r) => ({ x: r.at, y: r.committed })) },
              { key: "p", label: "Paid", color: TONE.paid,
                points: d.trends.drawdown.map((r) => ({ x: r.at, y: r.paid })) },
            ]} />
          ) : <Empty>Not enough history yet.</Empty>}
        </Figure>

        {c.escalated.length > 0 && (
          <Figure title="Cost escalation" sub="growth since signature, per contract"
                  table={<DataTable
                    cols={[{ key: "ref", label: "Contract" },
                           { key: "originalValue", label: "Signed at", num: true, render: (r) => fmtMoney(r.originalValue) },
                           { key: "value", label: "Now", num: true, render: (r) => fmtMoney(r.value) },
                           { key: "escalationPct", label: "Growth", num: true, render: (r) => pct(r.escalationPct) }]}
                    rows={c.escalated} />}>
            <Dumbbell rows={c.escalated.slice(0, 8).map((r) => ({
                        key: r.id, label: r.title || r.ref,
                        from: r.originalValue, to: r.value,
                        note: `${r.changeOrders} change order(s)` }))}
                      fromLabel="Signed at" toLabel="Now" goodDown={false} />
          </Figure>
        )}

        <Figure title="Expiry runway" sub="live contracts, soonest first"
                table={<DataTable
                  cols={[{ key: "ref", label: "Contract" },
                         { key: "supplier", label: "Supplier" },
                         { key: "daysLeft", label: "Days left", num: true },
                         { key: "value", label: "Value", num: true, render: (r) => fmtMoney(r.value) }]}
                  rows={c.rows.filter((r) => r.status === "active" && r.daysLeft != null)
                    .sort((a, b) => a.daysLeft - b.daysLeft)} />}>
          {c.expiring.length || c.expired.length ? (
            <div>
              {[...c.expired, ...c.expiring].slice(0, 10).map((r) => {
                const tm = term(r.daysLeft);
                return (
                  <div className="rowline" key={r.id}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <b>{r.title || r.ref}</b>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {r.supplier} · {fmtCompact(r.value)}
                      </div>
                    </div>
                    <span className={"chip" + (tm.tone === "warn" ? " warn" : "")}>{tm.label}</span>
                  </div>
                );
              })}
            </div>
          ) : <Empty icon="shield">No live contract expires within 90 days.</Empty>}
        </Figure>
      </div>
    </>
  );
}

function ContractList({ rows }) {
  return (
    <div className="desklist">
      {rows.slice(0, 40).map((r) => {
        const tm = term(r.daysLeft);
        return (
          <div className="deskrow" key={r.id} style={{ cursor: "default" }}>
            <div className="dkmain">
              <div className="dktitle">{r.title || r.ref}</div>
              <div className="dkmeta">
                <span className="mono">{r.ref}</span>
                {r.supplier ? <span>{r.supplier}</span> : null}
                {r.department ? <span>{r.department}</span> : null}
                {r.tenderRef
                  ? <span className="dkowner"><Icon n="tender" s={12} />{r.tenderRef}</span>
                  : <span className="faint">no tender on file</span>}
                {r.currency !== "NGN" && (
                  <span className="chip sm">{r.currency} {r.amountSrc.toLocaleString()}</span>
                )}
              </div>
            </div>
            <div className="dkright">
              <span className="mono" title="contract value">{fmtCompact(r.value)}</span>
              <span className="mono faint" title="paid to date">{pct(r.utilisation, 0)} used</span>
              <span className={"chip" + (tm.tone === "warn" ? " warn" : "")}>{tm.label}</span>
            </div>
          </div>
        );
      })}
      {rows.length > 40 && (
        <div className="muted" style={{ fontSize: 12, padding: "10px 6px 0" }}>
          and {rows.length - 40} more — the table views above have them all.
        </div>
      )}
    </div>
  );
}

/* =============================================================== payments */

function PaymentsTab({ d, api }) {
  const p = d.payments;
  const ageing = (p.ageing || []).map((b) => ({ ...b, color: AGE_TONE[b.key] || slot(0) }));

  const timeliness = (p.timeliness || []).map((m) => ({
    key: m.key, label: m.key,
    parts: [{ key: "on", label: "On time", value: m.onTime, color: TONE.onTime },
            { key: "late", label: "Late", value: m.late, color: TONE.late }],
  }));

  return (
    <>
      <div className="grid g4" style={{ marginBottom: 14 }}>
        <Stat k="Outstanding payables" v={<CountUp n={p.outstanding} format={fmtCompact} />}
              d={`${p.received - p.paid} invoice${p.received - p.paid === 1 ? "" : "s"} unsettled`} />
        {/* Names the month. A bare "₦0" against "Paid this month" reads as a
            broken tile on the 2nd of the month; "nothing settled in August
            yet" reads as the fact it is. */}
        <Stat k="Paid this month" v={fmtCompact(p.paidThisMonth)}
              d={(p.paidThisMonth
                    ? `in ${thisMonth()} so far`
                    : `nothing settled in ${thisMonth()} yet`)
                 + ` · ${p.paid} settled in total`} />
        <Stat k="Average payment time" v={days(p.avgPaymentDays)}
              d={`received → settled · median ${days(p.medianPaymentDays)}`} />
        <Stat k="Overdue" v={fmtCompact(p.overdueValue)}
              d={p.overdue.length
                ? `${p.overdue.length} invoice${p.overdue.length === 1 ? "" : "s"}, average ${days(p.avgDaysLate)} late`
                : "nothing past due"}
              tone={p.overdue.length ? "var(--wax)" : null} />
      </div>

      <div className="grid g4" style={{ marginBottom: 14 }}>
        <Stat k="Invoices received" v={p.received} d="on the ledger" />
        <Stat k="Approved" v={p.approved}
              d={p.received ? `${Math.round((p.approved / p.received) * 100)}% of those received` : ""} />
        <Stat k="Early-payment discounts earned" v={fmtCompact(p.discountEarned)}
              d="taken by settling inside the window" tone={p.discountEarned ? "var(--green)" : null} />
        <Stat k="Discounts missed" v={fmtCompact(p.discountMissed)}
              d="offered, and the window passed"
              tone={p.discountMissed ? "var(--s4)" : null} />
      </div>

      <div className="grid g2">
        <Figure title="Outstanding payables by age" sub="what is owed, and how late it is"
                table={<DataTable
                  cols={[{ key: "label", label: "Age" },
                         { key: "n", label: "Invoices", num: true },
                         { key: "value", label: "Outstanding", num: true, render: (r) => fmtMoney(r.value) }]}
                  rows={ageing} />}>
          {ageing.some((b) => b.value > 0)
            ? <Bars data={ageing} />
            : <Empty icon="check">Nothing outstanding.</Empty>}
        </Figure>

        <Figure title="Payment timeliness" sub="invoices settled on time against late, per month"
                legend={[{ label: "On time", color: TONE.onTime },
                         { label: "Late", color: TONE.late }]}
                table={<DataTable
                  cols={[{ key: "key", label: "Month" },
                         { key: "onTime", label: "On time", num: true },
                         { key: "late", label: "Late", num: true },
                         { key: "value", label: "On time", num: true, render: (r) => pct(r.value, 0) }]}
                  rows={p.timeliness} />}>
          {timeliness.length
            ? <Columns data={timeliness} format={(n) => String(n)} unit="invoices" />
            : <Empty>No settled invoices with a due date yet.</Empty>}
        </Figure>

        <Figure title="Paid over time" sub="value settled each month"
                table={<DataTable
                  cols={[{ key: "key", label: "Month" },
                         { key: "value", label: "Paid", num: true, render: (r) => fmtMoney(r.value) }]}
                  rows={p.paidTrend} />}>
          {p.paidTrend.length
            ? <Columns data={columns(p.paidTrend, TONE.paid)} />
            : <Empty>No payments on the ledger.</Empty>}
        </Figure>

        <Figure title="Overdue invoices" sub="longest overdue first"
                table={<DataTable
                  cols={[{ key: "supplier", label: "Supplier" },
                         { key: "ref", label: "Invoice" },
                         { key: "daysLate", label: "Days late", num: true },
                         { key: "outstanding", label: "Owed", num: true, render: (r) => fmtMoney(r.outstanding) }]}
                  rows={p.overdue.map((r) => ({ ...r, key: r.id }))} />}>
          {p.overdue.length ? (
            <div>
              {p.overdue.slice(0, 10).map((r) => (
                <div className="rowline" key={r.id}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b>{r.supplier}</b>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {r.ref} · due {fmtDate(r.dueAt)}
                      {r.hold ? <> · <span className="waxfg">on hold: {r.hold}</span></> : null}
                    </div>
                  </div>
                  <span className="mono">{fmtCompact(r.outstanding)}</span>
                  <span className={"chip" + (r.daysLate > 30 ? " warn" : "")}>{r.daysLate}d late</span>
                </div>
              ))}
              {p.overdue.length > 10 && (
                <div className="muted" style={{ fontSize: 12, paddingTop: 8 }}>
                  and {p.overdue.length - 10} more — the table view has them all.
                </div>
              )}
            </div>
          ) : <Empty icon="check">Nothing is past due.</Empty>}
        </Figure>
      </div>
    </>
  );
}

/* ============================================================= compliance */

function ComplianceTab({ d, api }) {
  const c = d.compliance;
  const ranked = weakest(c.checks);

  return (
    <>
      <div className="grid g4" style={{ marginBottom: 14 }}>
        <Stat k="Compliance score" v={c.score == null ? "—" : Math.round(c.score) + "%"}
              d={`mean of ${c.measured} checks that had something to measure`}
              tone={c.score >= 90 ? "var(--green)" : c.score >= 75 ? "var(--s4)" : "var(--wax)"} />
        <Stat k="Exceptions" v={c.exceptions} d="individual failures across all checks"
              tone={c.exceptions ? "var(--s4)" : null} />
        <Stat k="Single-source" v={c.singleSource.n}
              d={`${fmtCompact(c.singleSource.value)} awarded with one bid or none`}
              tone={c.singleSource.n ? "var(--s4)" : null} />
        <Stat k="Competitive" v={c.competitive.n} d="awards that attracted a real contest" />
      </div>

      <div className="card" style={{ marginBottom: 14, borderLeft: "3px solid var(--s1)" }}>
        <div className="cbody" style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
          <b style={{ color: "var(--ink)" }}>The score is the least useful thing here.</b>{" "}
          It is the unweighted mean of the checks below, and it moves for reasons that have
          nothing to do with control — running more tenders in a quarter changes it.
          What is worth reading is which check is lowest and what sits behind it, so each
          one lists its own failures. Checks with nothing to measure are excluded rather
          than scored as 100%.
        </div>
      </div>

      <div className="grid g2">
        {ranked.map((ch) => (
          <div className="card" data-reveal key={ch.key}>
            <div className="chead">
              <h3>{ch.label}</h3>
              <span className={"chip" + (ch.rate < 75 ? " warn" : "")} style={{ marginLeft: "auto" }}>
                {ch.passed} of {ch.total}
              </span>
            </div>
            <div className="cbody">
              <Meter label={pct(ch.rate, 0) + " passing"} value={ch.passed} max={ch.total}
                     format={(n) => String(Math.round(n))}
                     tone={ch.rate >= 90 ? "var(--green)" : ch.rate >= 75 ? "var(--s4)" : "var(--wax)"} />
              <div className="muted" style={{ fontSize: 12.5, marginTop: 10, lineHeight: 1.55 }}>
                {ch.note}
              </div>
              {ch.failures.length > 0 && (
                <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid var(--hair)" }}>
                  {ch.failures.slice(0, 5).map((f) => (
                    <div className="rowline" key={f.id}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <b>{f.label || f.ref}</b>
                        <div className="muted mono" style={{ fontSize: 11.5 }}>{f.ref}</div>
                      </div>
                      {f.value ? <span className="mono faint">{fmtCompact(f.value)}</span> : null}
                    </div>
                  ))}
                  {ch.failureCount > 5 && (
                    <div className="muted" style={{ fontSize: 12, paddingTop: 6 }}>
                      and {ch.failureCount - 5} more.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/* =================================================================== risk */

function RiskTab({ d, api }) {
  const fx = d.fx;
  const exposure = d.exposure || [];
  const distress = d.distress || [];
  const c = d.contracts;
  const over = exposure.filter((r) => r.over);
  const noLimit = exposure.filter((r) => !r.limit);
  /* Withheld and empty are opposite findings. Without this the tile below
     reads "all within their ceiling" to someone who simply is not allowed to
     see the ceilings, which is the reassuring version of a wrong answer. */
  const hidden = (d.restricted || []).includes("payables");

  const budgetOverrun = (d.exceptions || []).filter((e) => e.kind === "over_budget");

  return (
    <>
      <div className="grid g4" style={{ marginBottom: 14 }}>
        <Stat k="Budget overrun" v={budgetOverrun.length}
              d={budgetOverrun.length
                ? `${fmtCompact(budgetOverrun.reduce((n, e) => n + e.value, 0))} committed above approved`
                : "nothing committed above its budget"}
              tone={budgetOverrun.length ? "var(--wax)" : null} />
        <Stat k="Contract expiry" v={c.expiring.length + c.expired.length}
              d={`${c.expired.length} expired, ${c.expiring.length} inside notice`}
              tone={c.expired.length ? "var(--wax)" : c.expiring.length ? "var(--s4)" : null} />
        <Stat k="Exchange-rate exposure" v={fx.rows.length ? delta(fx.movement) : "none"}
              d={fx.rows.length
                ? `on ${fmtCompact(fx.atStruck)} of open ${fx.currencies.join(", ")} commitments`
                : "no open foreign-currency commitments"}
              tone={fx.movement > 0 ? "var(--wax)" : null} />
        {/* The subtitle counts a different population from the headline, so it
            names it. "1 / 1 vendor(s) have no limit on file" reads as though
            the two numbers are the same fact. */}
        <Stat k="Vendors over limit" v={hidden ? "—" : over.length}
              d={hidden ? "you don't have access to vendor payables"
                : `of ${exposure.length} carrying exposure`
                  + (noLimit.length
                      ? ` · ${noLimit.length} ${noLimit.length === 1 ? "has" : "have"} no limit set`
                      : "")}
              tone={over.length ? "var(--wax)" : null} />
      </div>

      <RiskRegister d={d} />

      <div className="grid g2">
        <Figure title="Vendor exposure against limit"
                sub="unpaid contract balance plus unsettled invoices"
                table={<DataTable
                  cols={[{ key: "supplier", label: "Vendor" },
                         { key: "exposure", label: "Exposure", num: true, render: (r) => fmtMoney(r.exposure) },
                         { key: "limit", label: "Limit", num: true, render: (r) => (r.limit ? fmtMoney(r.limit) : "none set") },
                         { key: "usage", label: "Used", num: true, render: (r) => (r.usage == null ? "—" : pct(r.usage, 0)) }]}
                  rows={exposure.map((r) => ({ ...r, key: r.supplierId }))} />}>
          {exposure.length ? (
            <Bars data={exposure.slice(0, 10).map((r) => ({
                    key: r.supplierId, label: r.supplier, value: r.exposure,
                    limit: r.limit || undefined, color: slot(0) }))}
                  limitLabel="limit" />
          ) : hidden ? (
            <Empty icon="lock">
              Vendor exposure is part of payables, which your account cannot see. The
              figures exist — they are withheld here, not absent.
            </Empty>
          ) : <Empty icon="shield">Nothing is currently owed or committed.</Empty>}
        </Figure>

        <Figure title="Exchange-rate exposure"
                sub="open foreign-currency commitments, at the rate struck and today's"
                table={<DataTable
                  cols={[{ key: "ref", label: "Contract" },
                         { key: "outstandingSrc", label: "Outstanding", num: true,
                           render: (r) => `${r.currency} ${r.outstandingSrc.toLocaleString()}` },
                         { key: "rateAt", label: "Struck at", num: true, render: (r) => r.rateAt.toFixed(0) },
                         { key: "rateNow", label: "Today", num: true, render: (r) => r.rateNow.toFixed(0) },
                         { key: "movement", label: "Movement", num: true, render: (r) => fmtMoney(r.movement) }]}
                  rows={fx.rows.map((r) => ({ ...r, key: r.id }))} />}>
          {fx.rows.length ? (
            <>
              <div className="bigfig">
                <b className={fx.movement > 0 ? "waxfg" : ""}>{delta(fx.movement)}</b>
                <span>
                  more to settle the same commitments than when they were signed —{" "}
                  {fmtCompact(fx.atStruck)} → {fmtCompact(fx.atToday)}
                </span>
              </div>
              <Dumbbell rows={fx.rows.map((r) => ({
                          key: r.id, label: r.title || r.ref,
                          from: r.atStruck, to: r.atToday,
                          note: `${r.currency} ${r.outstandingSrc.toLocaleString()} at ${r.rateAt.toFixed(0)} → ${r.rateNow.toFixed(0)}` }))}
                        fromLabel="At the rate struck" toLabel="At today's rate" goodDown />
            </>
          ) : (
            <Empty icon="shield">
              Every open commitment is in naira, so there is no exchange-rate exposure to carry.
            </Empty>
          )}
        </Figure>

        <FraudPanel d={d} api={api} />

        <div className="card" data-reveal style={{ gridColumn: "1 / -1" }}>
          <div className="chead">
            <h3>Vendor financial-distress signals</h3>
            <span className="mono faint" style={{ marginLeft: "auto" }}>
              {distress.length} vendor{distress.length === 1 ? "" : "s"} with at least one signal
            </span>
          </div>
          <div className="cbody">
            <div className="muted" style={{ fontSize: 12.5, marginBottom: 12, lineHeight: 1.6 }}>
              <b style={{ color: "var(--ink)" }}>Signals, not a solvency estimate.</b>{" "}
              DOCKET cannot see a vendor's balance sheet. What it can see is how they bid,
              how much of our exposure sits with them, and whether their paperwork is
              current. Each observation is listed so you can judge it — there is no score,
              because a number here would be an accusation with arithmetic painted on it.
            </div>
            {hidden ? (
              <Empty icon="lock">
                Distress signals name individual vendors and what they are owed, so they
                sit behind the payables permission.
              </Empty>
            ) : distress.length ? distress.slice(0, 10).map((r) => (
              <div className="rowline" key={r.supplierId}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b>{r.supplier}</b>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {r.signals.map((s) => s.detail).join(" · ")}
                  </div>
                </div>
                {r.exposure ? <span className="mono faint">{fmtCompact(r.exposure)} exposed</span> : null}
                <span className={"chip" + (r.n >= 3 ? " warn" : "")}>
                  {r.n} signal{r.n === 1 ? "" : "s"}
                </span>
              </div>
            )) : <Empty icon="check">No vendor is showing a distress signal.</Empty>}
          </div>
        </div>
      </div>
    </>
  );
}

/* The register: one row per finance risk, worst first.

   Every level comes from a stated threshold in finance-model.js and carries the
   observation that produced it. A severity nobody can reproduce is an opinion
   in a table, and the first question anyone asks a red row is "says who" — so
   the answer is in the row. */
function RiskRegister({ d }) {
  const rows = riskLevels(d);
  const counts = rows.reduce((a, r) => ({ ...a, [r.level]: (a[r.level] || 0) + 1 }), {});

  return (
    <div className="card" data-reveal style={{ marginBottom: 14 }}>
      <div className="chead">
        <h3>Risk register</h3>
        <span className="mono faint">assessed against fixed thresholds</span>
        <span className="mono faint" style={{ marginLeft: "auto" }}>
          {counts.high || 0} high · {counts.medium || 0} medium · {counts.low || 0} low
        </span>
      </div>
      <div className="cbody" style={{ paddingTop: 4 }}>
        <table className="risktab">
          <thead>
            <tr><th>Risk</th><th>Level</th><th>What that is based on</th><th className="num">Value</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const m = LEVEL_META[r.level];
              return (
                <tr key={r.key}>
                  <td><b>{r.label}</b></td>
                  <td>
                    {/* Icon and word, never colour alone. */}
                    <span className={"lvl lvl-" + r.level}>
                      <Icon n={m.icon} s={13} />{m.label}
                    </span>
                  </td>
                  <td className="muted">{r.basis}</td>
                  <td className="num mono">{r.value ? fmtCompact(r.value) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* The checks a fraud review actually runs, gathered in one place.

   They are individually listed under Exceptions too, and that is deliberate:
   there they are work to clear, here they are a pattern to read. What is not
   here is a composite score — a single "fraud risk: 62" is an accusation with
   arithmetic painted on it, and nobody can act on it or contest it. */
function FraudPanel({ d, api }) {
  const ex = (d.exceptions || []).filter((e) => FRAUD_KINDS.includes(e.kind));
  const groups = groupExceptions(ex);
  const value = ex.reduce((n, e) => n + e.value, 0);

  return (
    <div className="card" data-reveal style={{ gridColumn: "1 / -1" }}>
      <div className="chead">
        <h3>Procurement fraud indicators</h3>
        <span className="mono faint" style={{ marginLeft: "auto" }}>
          {ex.length} open{value ? ` · ${fmtCompact(value)}` : ""}
        </span>
      </div>
      <div className="cbody">
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 12, lineHeight: 1.6 }}>
          <b style={{ color: "var(--ink)" }}>Indicators, counted separately.</b>{" "}
          None of these proves anything on its own — a duplicate reference is usually a
          vendor resending an invoice, and an order without a receipt is usually paperwork
          running late. They are here because <i>together</i> they are the shape a review
          looks for, and because each one is cheap to check and expensive to miss.
        </div>
        {groups.length ? (
          <div className="fraudgrid">
            {groups.map((g) => (
              <button key={g.key} className="fraudcell"
                      onClick={() => api.go({ page: "finance" })}
                      title={g.rows.map((r) => r.subject).slice(0, 5).join("\n")}>
                <Icon n={g.icon} s={16} />
                <b>{g.rows.length}</b>
                <span>{g.label}</span>
                {g.value ? <span className="mono faint">{fmtCompact(g.value)}</span> : null}
              </button>
            ))}
          </div>
        ) : (
          <Empty icon="check">
            No indicator is firing. On a ledger this size that is worth a second look at the
            freshness banner rather than a celebration.
          </Empty>
        )}
      </div>
    </div>
  );
}

/* ============================================================= exceptions */

function ExceptionsTab({ d, api }) {
  const [open, setOpen] = useState(null);
  const groups = groupExceptions(d.exceptions);
  const tot = exceptionTotals(d.exceptions);
  const shown = open ? groups.filter((g) => g.key === open) : groups;

  return (
    <>
      <div className="grid g4" style={{ marginBottom: 14 }}>
        <Stat k="Open exceptions" v={tot.n} d={`${tot.warn} need attention now`}
              tone={tot.warn ? "var(--wax)" : null} />
        <Stat k="Value at stake" v={fmtCompact(tot.value)}
              d="overdue, duplicated, over budget or unapproved" />
        <Stat k="Rules" v={EXCEPTION_KINDS.length} d="checked on every sweep" />
        <Stat k="Firing" v={groups.length} d="rules with something to report" />
      </div>

      <div className="card" style={{ marginBottom: 14, borderLeft: "3px solid var(--s1)" }}>
        <div className="cbody" style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
          These run automatically on every background sweep, and anything marked{" "}
          <b>needs attention</b> also raises a notification to everyone who can see this
          page — once per finding, not once per sweep. Findings marked <b>watch</b> are
          listed here but do not notify: a notification for every contract ninety days from
          expiry would train everybody to ignore the channel that also carries the
          duplicate invoices.
        </div>
      </div>

      <div className="dimbar">
        <span className="dimlbl">Rule</span>
        <button className={"deskchip" + (!open ? " on" : "")} onClick={() => setOpen(null)}>
          All <b>{tot.n}</b>
        </button>
        {groups.map((g) => (
          <button key={g.key} className={"deskchip" + (open === g.key ? " on" : "")}
                  onClick={() => setOpen(g.key === open ? null : g.key)}>
            {g.label} <b>{g.rows.length}</b>
          </button>
        ))}
      </div>

      {!groups.length && (
        <div className="card"><div className="cbody">
          <Empty icon="check">
            Nothing is failing any of the eight checks. That is worth a second look at the
            banner above — a clean sheet on a stale ledger is not the same as a clean sheet.
          </Empty>
        </div></div>
      )}

      {shown.map((g) => (
        <div className="card" data-reveal key={g.key} style={{ marginBottom: 14 }}>
          <div className="chead">
            <Icon n={g.icon} s={15} />
            <h3>{g.label}</h3>
            <span className="mono faint">{g.hint}</span>
            <span className={"chip" + (g.warn ? " warn" : "")} style={{ marginLeft: "auto" }}>
              {g.rows.length}{g.value ? ` · ${fmtCompact(g.value)}` : ""}
            </span>
          </div>
          <div className="cbody" style={{ paddingTop: 4 }}>
            {g.rows.slice(0, 12).map((e, i) => (
              <div className={"exrow" + (e.severity === "warn" ? " warn" : "")} key={e.key || i}>
                <span className="exdot" aria-hidden="true" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b>{e.subject}</b>
                  <div className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>{e.detail}</div>
                </div>
                <div className="exright">
                  {e.value ? <span className="mono">{fmtCompact(e.value)}</span> : null}
                  <span className="chip sm">{e.severity === "warn" ? "needs attention" : "watch"}</span>
                  {e.ref?.page === "tender" && (
                    <button className="btn xs ghost"
                            onClick={() => api.go({ page: "tender", id: e.ref.id })}>Open</button>
                  )}
                </div>
              </div>
            ))}
            {g.rows.length > 12 && (
              <div className="muted" style={{ fontSize: 12, padding: "8px 0 2px" }}>
                and {g.rows.length - 12} more.
              </div>
            )}
          </div>
        </div>
      ))}
    </>
  );
}

/* ---------------- styles ---------------- */

export const FINANCE_CSS = `
.ledgerbar{display:flex;align-items:flex-start;gap:11px;padding:12px 15px;margin-bottom:16px;
  background:var(--card);border:1px solid var(--line);border-left-width:3px;border-radius:10px;
  font-size:12.5px;line-height:1.55}
.ledgerbar>svg{flex:0 0 auto;margin-top:1px;color:var(--muted)}
.lbmain{flex:1;min-width:0}
.lbcount{flex:0 0 auto;font-size:11px;white-space:nowrap}

.tabcount{display:inline-flex;align-items:center;justify-content:center;min-width:16px;height:16px;
  padding:0 4px;border-radius:8px;background:var(--wax);color:#fff;font-size:10px;font-weight:700;
  font-variant-numeric:tabular-nums;margin-left:2px}

.dimbar{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-bottom:14px}
.dimlbl{font-size:11px;color:var(--faint);letter-spacing:.04em;text-transform:uppercase;
  margin-right:2px}

/* A headline that is a sentence, for the places where one number needs a clause
   after it to mean anything — an FX movement, an avoidance total. */
.bigfig{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;padding:2px 0 14px}
.bigfig b{font-size:26px;font-weight:600;letter-spacing:-.01em}
.bigfig span{font-size:12.5px;color:var(--muted);flex:1;min-width:180px;line-height:1.5}

/* ---- risk register ---- */
.risktab{width:100%;border-collapse:collapse;font-size:13px}
.risktab th{text-align:left;font-size:10.5px;letter-spacing:.05em;text-transform:uppercase;
  color:var(--faint);font-weight:500;padding:0 10px 8px 0;border-bottom:1px solid var(--hair)}
.risktab th.num,.risktab td.num{text-align:right;padding-right:0}
.risktab td{padding:11px 10px 11px 0;border-bottom:1px solid var(--hair);vertical-align:top}
.risktab tr:last-child td{border-bottom:0}
.risktab td.muted{font-size:12.5px;line-height:1.5}
/* Icon + word, so the level never depends on colour alone. */
.lvl{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:999px;
  font-size:11.5px;font-weight:600;white-space:nowrap}
.lvl-high{background:var(--wax-tint);color:var(--wax)}
.lvl-medium{background:color-mix(in srgb,var(--s4) 14%,transparent);color:var(--s4)}
.lvl-low{background:color-mix(in srgb,var(--green) 12%,transparent);color:var(--green)}

/* ---- fraud indicators ---- */
.fraudgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px}
.fraudcell{display:flex;flex-direction:column;align-items:flex-start;gap:2px;
  padding:12px 13px;border:1px solid var(--line);border-radius:10px;background:var(--sunk);
  font:inherit;text-align:left;cursor:pointer;transition:border-color .15s,background .15s}
.fraudcell:hover{border-color:var(--line2);background:var(--card)}
.fraudcell:focus-visible{outline:2px solid var(--brand);outline-offset:1px}
.fraudcell>svg{color:var(--muted);margin-bottom:2px}
.fraudcell b{font-size:21px;font-weight:600;line-height:1.1}
.fraudcell span{font-size:11.5px;color:var(--muted);line-height:1.35}

.exrow{display:flex;align-items:flex-start;gap:11px;padding:11px 4px;
  border-bottom:1px solid var(--hair)}
.exrow:last-child{border-bottom:0}
.exdot{flex:0 0 auto;width:7px;height:7px;border-radius:50%;background:var(--s4);margin-top:5px}
.exrow.warn .exdot{background:var(--wax)}
.exright{display:flex;align-items:center;gap:8px;flex:0 0 auto;flex-wrap:wrap;justify-content:flex-end}

.refreshing{opacity:.72;transition:opacity .2s}
.stat.skel{height:86px;background:var(--sunk);border-radius:10px;animation:skelpulse 1.4s ease-in-out infinite}
@keyframes skelpulse{0%,100%{opacity:.55}50%{opacity:.85}}

@media(max-width:720px){
  .ledgerbar{flex-wrap:wrap}
  .lbcount{width:100%}
  .exright{width:100%;justify-content:flex-start;padding-left:18px}
  .bigfig b{font-size:22px}
  /* The register drops its basis column rather than scrolling sideways: the
     level and the risk are what a phone is being asked, and the reasoning is
     one tap away in the table views. */
  .risktab th:nth-child(3),.risktab td:nth-child(3){display:none}
  .fraudgrid{grid-template-columns:repeat(auto-fit,minmax(120px,1fr))}
}
@media(prefers-reduced-motion:reduce){
  .stat.skel{animation:none}
}
`;
