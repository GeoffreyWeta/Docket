/* Analytics.

   The old page was four cards. This one is organised the way the questions
   actually arrive: what did we spend, what did we save, who did the work, where
   is the risk, and how is the register shaped. Each section is a tab rather
   than a longer scroll, because these are different conversations with
   different people and nobody needs all five at once.

   The rule the whole page is built around: **a number is only as good as what
   it is compared against.** Savings measured against a recorded prior price and
   savings measured against an internal budget estimate are different kinds of
   claim, and they are never added together here. See analytics-model.js.
*/
import React, { useMemo, useState } from "react";

import { Empty, Stat } from "./atoms";
import {
  BASIS, byOwner, competition, complianceRisk, cycleTimes, orgIndex, rollupFamilies,
  savingsOverTime, savingsSplit, spendByCategory, spendOverTime, thisYear, vendorsByNode,
} from "./analytics-model";
import {
  Bars, DataTable, Donut, Dumbbell, Figure, Heatmap, Legend, Meter, StackedBars,
  TimeChart, foldTail, palette, slot,
} from "./charts";
import { DAY, abnormallyLow, fmtCompact, fmtDate, fmtMoney, mean, varianceFlags } from "./helpers";
import { Icon } from "./icons";
import { can } from "./perms";
import { CountUp } from "./ui";

const TABS = [
  { key: "spend", label: "Spend", icon: "analytics" },
  { key: "savings", label: "Savings", icon: "trophy" },
  { key: "people", label: "People", icon: "team" },
  { key: "market", label: "Competition", icon: "scales" },
  { key: "risk", label: "Risk", icon: "shield" },
];

const pct = (n) => (n == null ? "—" : (n >= 0 ? "" : "−") + Math.abs(n).toFixed(1) + "%");
const days = (n) => (n == null ? "—" : Math.round(n) + "d");

export function AnalyticsPage({ api }) {
  const { state, go, user, ai } = api;
  const [tab, setTab] = useState("spend");
  const [year, setYear] = useState(true);

  const tenders = useMemo(() => {
    const from = thisYear();
    return year
      ? state.tenders.filter((t) => !t.awardedAt || t.awardedAt >= from)
      : state.tenders;
  }, [state.tenders, year]);

  return (
    <div>
      <div className="pagehead">
        <h1>Analytics</h1>
        <span className="sub">Where the money, the time and the risk actually are.</span>
      </div>

      {/* Filters in one row above the charts, never per-card. */}
      <div className="anbar">
        <div className="antabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.key} role="tab" aria-selected={tab === t.key}
                    className={"antab" + (tab === t.key ? " on" : "")}
                    onClick={() => setTab(t.key)}>
              <Icon n={t.icon} s={14} />{t.label}
            </button>
          ))}
        </div>
        <div className="anrange">
          <button className={"btn xs ghost" + (year ? " on" : "")} aria-pressed={year}
                  onClick={() => setYear(true)}>This year</button>
          <button className={"btn xs ghost" + (!year ? " on" : "")} aria-pressed={!year}
                  onClick={() => setYear(false)}>All time</button>
        </div>
      </div>

      {tab === "spend" && <SpendTab api={api} tenders={tenders} />}
      {tab === "savings" && <SavingsTab api={api} tenders={tenders} />}
      {tab === "people" && <PeopleTab api={api} tenders={tenders} />}
      {tab === "market" && <MarketTab api={api} tenders={tenders} />}
      {tab === "risk" && <RiskTab api={api} tenders={tenders} />}
    </div>
  );
}

/* ---------------- spend ---------------- */

function SpendTab({ api, tenders }) {
  const { state, go } = api;
  const [openFamily, setOpenFamily] = useState(null);

  const cats = useMemo(() => spendByCategory(tenders, state.bids), [tenders, state.bids]);
  const fams = useMemo(() => rollupFamilies(cats, state.taxonomy || []), [cats, state.taxonomy]);
  const colour = useMemo(
    () => palette((state.taxonomy || []).map((f) => f.key)), [state.taxonomy]);

  const committed = cats.reduce((n, r) => n + r.committed, 0);
  const forecast = cats.reduce((n, r) => n + r.forecast, 0);
  const trend = useMemo(() => spendOverTime(tenders), [tenders]);

  const drill = openFamily && fams.find((f) => f.key === openFamily);

  return (
    <>
      <div className="grid g4" style={{ marginBottom: 14 }}>
        <Stat k="Committed" v={<CountUp n={committed} format={fmtCompact} />}
              d={`${cats.reduce((n, r) => n + r.n, 0)} tenders`} />
        <Stat k="In flight" v={fmtCompact(forecast)} d="median bid, evaluation stage" tone="var(--s4)" />
        <Stat k="Categories touched" v={cats.length} d={`of ${(state.taxonomy || []).reduce((n, f) => n + f.categories.length, 0)} in the taxonomy`} />
        <Stat k="Families touched" v={fams.length} d={`of ${(state.taxonomy || []).length}`} />
      </div>

      <div className="grid g2">
        <Figure title="Spend by family" sub="click a family to break it down"
                legend={fams.slice(0, 8).map((f) => ({ label: f.label, color: colour(f.key) }))}
                table={<DataTable
                  cols={[{ key: "label", label: "Family" },
                         { key: "committed", label: "Committed", num: true, render: (r) => fmtMoney(r.committed) },
                         { key: "forecast", label: "In flight", num: true, render: (r) => fmtMoney(r.forecast) },
                         { key: "n", label: "Tenders", num: true }]}
                  rows={fams} />}>
          {fams.length ? (
            <Bars data={fams.map((f) => ({ key: f.key, label: f.label,
                    value: f.committed + f.forecast, color: colour(f.key) }))}
                  onPick={(d) => setOpenFamily(d.key === openFamily ? null : d.key)} />
          ) : <Empty icon="analytics">Nothing has been committed or priced yet.</Empty>}
        </Figure>

        <Figure title="Share of committed spend" sub="awarded only"
                table={<DataTable
                  cols={[{ key: "label", label: "Family" },
                         { key: "committed", label: "Committed", num: true, render: (r) => fmtMoney(r.committed) }]}
                  rows={fams.filter((f) => f.committed > 0)} />}>
          <Donut data={foldTail(fams.filter((f) => f.committed > 0)
                    .map((f) => ({ key: f.key, label: f.label, value: f.committed, color: colour(f.key) })))}
                 centreLabel="committed" />
        </Figure>

        {drill && (
          <Figure title={`${drill.label} — by category`}
                  sub={`${drill.cats.length} categor${drill.cats.length === 1 ? "y" : "ies"}`}
                  right={<button className="btn xs ghost" onClick={() => setOpenFamily(null)}>Close</button>}
                  table={<DataTable
                    cols={[{ key: "label", label: "Category" },
                           { key: "committed", label: "Committed", num: true, render: (r) => fmtMoney(r.committed) },
                           { key: "forecast", label: "In flight", num: true, render: (r) => fmtMoney(r.forecast) }]}
                    rows={drill.cats} />}>
            {/* One family, one hue: these are parts of the same thing, so they
                keep the family's colour rather than each taking a new slot. */}
            <Bars data={drill.cats.map((c) => ({ key: c.key, label: c.label,
                    value: c.committed + c.forecast, color: colour(drill.key) }))} />
          </Figure>
        )}

        <Figure title="Committed spend over time" sub="cumulative, awarded tenders"
                tall
                table={<DataTable
                  cols={[{ key: "label", label: "Tender" },
                         { key: "at", label: "Awarded", render: (r) => fmtDate(r.at) },
                         { key: "amount", label: "Amount", num: true, render: (r) => fmtMoney(r.amount) }]}
                  rows={tenders.filter((t) => t.status === "awarded" && t.awardedAt)
                    .sort((a, b) => a.awardedAt - b.awardedAt)
                    .map((t) => ({ key: t.id, label: t.title, at: t.awardedAt, amount: t.awardedAmount }))} />}>
          <TimeChart area series={[{ key: "spend", label: "Committed", color: slot(0), points: trend }]} />
        </Figure>
      </div>
    </>
  );
}

/* ---------------- savings ---------------- */

function SavingsTab({ api, tenders }) {
  const { state, go } = api;
  const s = useMemo(() => savingsSplit(tenders), [tenders]);
  const trend = useMemo(() => savingsOverTime(tenders), [tenders]);

  const dumbbell = s.hard.map((x) => ({
    key: x.id, label: x.tender.title, from: x.against, to: x.awarded,
    note: x.source ? `vs ${x.source}` : null,
  }));

  return (
    <>
      {/* The headline is the defensible number, not the flattering one. */}
      <div className="grid g4" style={{ marginBottom: 14 }}>
        <Stat k="Verified savings" v={<CountUp n={s.hardTotal} format={fmtCompact} />}
              d={s.hard.length ? `${s.hard.length} award${s.hard.length === 1 ? "" : "s"} vs a recorded prior price` : "no baselines recorded yet"}
              tone={s.hardTotal > 0 ? "var(--green)" : null} />
        <Stat k="Saving rate" v={pct(s.hardRate)} d="weighted, against baseline" />
        <Stat k="Against budget only" v={fmtCompact(s.softTotal)}
              d={`${s.soft.length} award${s.soft.length === 1 ? "" : "s"} with no prior price on file`}
              tone="var(--s4)" />
        <Stat k="Baseline coverage" v={Math.round(s.coverage) + "%"}
              d="of awards measurable against a real prior price" />
      </div>

      {/* Saying why the two numbers are separate, once, where the split is. */}
      <div className="card" style={{ marginBottom: 14, borderLeft: "3px solid var(--s1)" }}>
        <div className="cbody" style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
          <b style={{ color: "var(--ink)" }}>Two numbers, deliberately.</b>{" "}
          <b>Verified savings</b> compare an award to what the organisation was actually
          paying before — a prior contract, an incumbent's renewal quote, the price on the
          shelf. That is the figure that survives a review.{" "}
          <b>Against budget</b> compares an award to the ceiling somebody estimated
          beforehand, which measures the estimate as much as the buying. They are shown
          apart because adding them together produces a headline nobody can defend.
        </div>
      </div>

      <div className="grid g2">
        <Figure title="Baseline → award" sub="verified savings, per tender"
                tall
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

        <Figure title="Verified savings over time" sub="cumulative" tall
                table={<DataTable
                  cols={[{ key: "label", label: "Tender" },
                         { key: "amount", label: "Saved", num: true, render: (r) => fmtMoney(r.amount) }]}
                  rows={s.hard.map((x) => ({ key: x.id, label: x.tender.title, amount: x.amount }))} />}>
          {trend.length
            ? <TimeChart area series={[{ key: "sav", label: "Verified savings", color: "var(--green)", points: trend }]} />
            : <Empty>Nothing to plot until an award has a baseline behind it.</Empty>}
        </Figure>

        {s.missingBaseline.length > 0 && (
          <div className="card" data-reveal style={{ gridColumn: "1 / -1" }}>
            <div className="chead">
              <h3>Awards with no prior price on file</h3>
              <span className="mono faint" style={{ marginLeft: "auto" }}>
                {s.missingBaseline.length} · worth {fmtCompact(s.softTotal)} in unverified saving
              </span>
            </div>
            <div className="cbody" style={{ paddingTop: 6 }}>
              <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
                Each of these is measured against its budget because nothing records what
                the organisation paid before. Adding a baseline to future tenders in these
                categories is what moves the coverage figure above.
              </div>
              {s.missingBaseline.slice(0, 8).map((t) => (
                <div className="rowline" key={t.id}>
                  <div style={{ flex: 1 }}>
                    <b className="doclink" onClick={() => go({ page: "tender", id: t.id })}>{t.title}</b>
                    <div className="muted" style={{ fontSize: 12 }}>{t.category}</div>
                  </div>
                  <span className="mono faint">{fmtCompact(t.budget - t.awardedAmount)} vs budget</span>
                </div>
              ))}
              {s.missingBaseline.length > 8 && (
                <div className="muted" style={{ fontSize: 12, paddingTop: 8 }}>
                  and {s.missingBaseline.length - 8} more.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/* ---------------- people ---------------- */

function PeopleTab({ api, tenders }) {
  const { state, user, go } = api;
  const org = useMemo(() => orgIndex(state.users || []), [state.users]);
  const rows = useMemo(() => byOwner(tenders, state.users || []), [tenders, state.users]);
  const named = rows.filter((r) => r.id !== "__none");
  const unowned = rows.find((r) => r.id === "__none");

  const heatCols = [
    { key: "live", label: "Open" },
    { key: "closed", label: "In progress" },
    { key: "awarded", label: "Awarded" },
  ];

  return (
    <>
      <div className="grid g4" style={{ marginBottom: 14 }}>
        <Stat k="People carrying tenders" v={named.length} d="with at least one" />
        <Stat k="Busiest desk" v={named.length ? named.slice().sort((a, b) => b.open - a.open)[0].name.split(" ")[0] : "—"}
              d={named.length ? `${named.slice().sort((a, b) => b.open - a.open)[0].open} open` : ""} />
        <Stat k="Median cycle" v={days(named.filter((r) => r.cycle != null).length
                ? mean(named.filter((r) => r.cycle != null).map((r) => r.cycle)) : null)}
              d="publish → award" />
        <Stat k="Unassigned" v={unowned ? unowned.total : 0}
              d={unowned ? "tenders with no owner recorded" : "every tender has an owner"}
              tone={unowned ? "var(--wax)" : null} />
      </div>

      <div className="grid g2">
        <Figure title="Savings by person" sub="verified and budget-only, side by side"
                legend={[{ label: "Verified", color: "var(--green)" },
                         { label: "Against budget", color: "var(--s4)" }]}
                table={<DataTable
                  cols={[{ key: "name", label: "Person" },
                         { key: "hardSaved", label: "Verified", num: true, render: (r) => fmtMoney(r.hardSaved) },
                         { key: "softSaved", label: "vs budget", num: true, render: (r) => fmtMoney(r.softSaved) },
                         { key: "awarded", label: "Awards", num: true }]}
                  rows={named} />}>
          {named.length ? (
            <StackedBars rows={named.map((r) => ({
              key: r.id, label: r.name,
              parts: [{ key: "h", label: "Verified", value: r.hardSaved, color: "var(--green)" },
                      { key: "s", label: "Against budget", value: r.softSaved, color: "var(--s4)" }],
            }))} />
          ) : <Empty icon="team">No tender has an owner recorded yet.</Empty>}
        </Figure>

        <Figure title="Workload" sub="tenders by stage, per person"
                table={<DataTable
                  cols={[{ key: "name", label: "Person" },
                         { key: "live", label: "Open", num: true },
                         { key: "closed", label: "In progress", num: true },
                         { key: "awarded", label: "Awarded", num: true }]}
                  rows={named} />}>
          {named.length ? (
            <Heatmap rows={named.map((r) => ({ key: r.id, label: r.name, ...r }))}
                     cols={heatCols} value={(r, c) => r[c.key]} format={(n) => String(n)} />
          ) : <Empty>Nothing to chart.</Empty>}
        </Figure>

        <div className="card" data-reveal style={{ gridColumn: "1 / -1" }}>
          <div className="chead"><h3>Reporting lines</h3>
            <span className="mono faint" style={{ marginLeft: "auto" }}>
              who a desk rolls up to
            </span>
          </div>
          <div className="cbody">
            <OrgChart users={state.users || []} org={org} rows={rows} me={user.id} />
          </div>
        </div>
      </div>
    </>
  );
}

/* The org chart as an indented tree. Deliberately not a boxes-and-lines
   diagram: on a phone that is an image nobody can read, and the only fact this
   has to carry is who sits under whom. */
export function OrgChart({ users, org, rows = [], me, onPick }) {
  const byOwnerId = new Map(rows.map((r) => [r.id, r]));
  const roots = users.filter((u) => !u.managerId || !org.byId.has(u.managerId));
  const seen = new Set();

  const node = (u, depth) => {
    if (seen.has(u.id)) return null;   // a cycle renders once, not forever
    seen.add(u.id);
    const kids = (org.kids.get(u.id) || []).map((id) => org.byId.get(id)).filter(Boolean);
    const r = byOwnerId.get(u.id);
    return (
      <React.Fragment key={u.id}>
        <div className={"orgrow" + (u.id === me ? " me" : "")} style={{ paddingLeft: depth * 22 }}
             onClick={onPick ? () => onPick(u) : undefined}>
          {depth > 0 && <span className="orgtick" aria-hidden="true" />}
          <div className="orgmain">
            <b>{u.name}</b>{u.id === me ? <span className="chip sm">you</span> : null}
            <div className="muted" style={{ fontSize: 12 }}>{u.title}</div>
          </div>
          {r && r.total > 0 && (
            <span className="mono faint" title="tenders owned">
              {r.open} open · {r.awarded} awarded
            </span>
          )}
        </div>
        {kids.map((k) => node(k, depth + 1))}
      </React.Fragment>
    );
  };

  if (!users.length) return <Empty>No people yet.</Empty>;
  return <div className="orgtree">{roots.map((u) => node(u, 0))}</div>;
}

/* ---------------- competition ---------------- */

function MarketTab({ api, tenders }) {
  const { state, go } = api;
  const comp = useMemo(() => competition(tenders, state.bids), [tenders, state.bids]);
  const cyc = useMemo(() => cycleTimes(tenders), [tenders]);
  const reg = useMemo(() => vendorsByNode(state.suppliers), [state.suppliers]);
  const colour = useMemo(
    () => palette((state.taxonomy || []).map((f) => f.key)), [state.taxonomy]);

  const famRows = (state.taxonomy || [])
    .map((f) => ({ key: f.key, label: f.label, value: reg.fam.get(f.key) || 0, color: colour(f.key) }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);

  return (
    <>
      <div className="grid g4" style={{ marginBottom: 14 }}>
        <Stat k="Bids per tender" v={comp.avg ? comp.avg.toFixed(1) : "—"} d="average, opened tenders" />
        <Stat k="Response rate" v={comp.responseRate ? Math.round(comp.responseRate) + "%" : "—"}
              d="of invited vendors who bid" />
        <Stat k="Single-bid tenders" v={comp.single.length}
              d="one bid or none — not a competition"
              tone={comp.single.length ? "var(--wax)" : null} />
        <Stat k="Median cycle" v={days(cyc.med)} d="publish → award" />
      </div>

      <div className="grid g2">
        <Figure title="Bids received" sub="fewest first — the top of this list is the risk"
                table={<DataTable
                  cols={[{ key: "label", label: "Tender" },
                         { key: "value", label: "Bids", num: true },
                         { key: "invited", label: "Invited", num: true }]}
                  rows={comp.rows} />}>
          {comp.rows.length ? (
            <Bars data={comp.rows.map((r) => ({ ...r,
                    /* status colour, not a series slot: "one bid" is a state,
                       not an identity, and it means the same thing everywhere */
                    color: r.value <= 1 ? "var(--wax)" : slot(0) }))}
                  format={(n) => String(n)} unit="bids"
                  onPick={(d) => go({ page: "tender", id: d.key })} />
          ) : <Empty icon="envelope">No tender has been opened yet.</Empty>}
        </Figure>

        <Figure title="Time to award" sub="publish → award, per tender"
                table={<DataTable
                  cols={[{ key: "label", label: "Tender" },
                         { key: "value", label: "Days", num: true, render: (r) => Math.round(r.value) }]}
                  rows={cyc.rows} />}>
          {cyc.rows.length ? (
            <Bars data={cyc.rows.map((r) => ({ ...r, color: slot(0) }))}
                  format={(n) => Math.round(n) + "d"} />
          ) : <Empty>No tender has reached award yet.</Empty>}
        </Figure>

        <Figure title="The register, by family" sub={`${state.suppliers.length.toLocaleString()} vendors`}
                right={can(api.user, "page.suppliers")
                  ? <button className="btn xs ghost" onClick={() => go({ page: "suppliers" })}>Open the register</button>
                  : null}
                table={<DataTable
                  cols={[{ key: "label", label: "Family" }, { key: "value", label: "Vendors", num: true }]}
                  rows={famRows} />}>
          <Bars data={famRows} format={(n) => n.toLocaleString()} unit="vendors" />
        </Figure>

        <Figure title="Where the register is thin"
                sub="categories with spend but few vendors"
                table={<DataTable
                  cols={[{ key: "label", label: "Category" },
                         { key: "vendors", label: "Vendors", num: true },
                         { key: "spend", label: "Spend", num: true, render: (r) => fmtMoney(r.spend) }]}
                  rows={thinCategories(tenders, state.suppliers)} />}>
          <ThinList rows={thinCategories(tenders, state.suppliers)} />
        </Figure>
      </div>
    </>
  );
}

/* A category the organisation buys in but has almost nobody to buy from is a
   supply risk that never shows up on a spend chart, because spend charts are
   sorted by size and this problem is small until it isn't. */
function thinCategories(tenders, suppliers) {
  const counts = new Map();
  suppliers.forEach((s) => counts.set(s.category, (counts.get(s.category) || 0) + 1));
  const spend = new Map();
  tenders.forEach((t) => {
    const v = t.status === "awarded" ? (t.awardedAmount || 0) : 0;
    if (v) spend.set(t.category, (spend.get(t.category) || 0) + v);
  });
  return [...spend.entries()]
    .map(([cat, v]) => ({ key: cat, label: cat, spend: v, vendors: counts.get(cat) || 0 }))
    .filter((r) => r.vendors < 8)
    .sort((a, b) => a.vendors - b.vendors);
}

function ThinList({ rows }) {
  if (!rows.length) {
    return <Empty icon="shield">
      Every category the organisation has spent in has a workable number of vendors behind it.
    </Empty>;
  }
  return (
    <div>
      {rows.map((r) => (
        <div className="rowline" key={r.key}>
          <div style={{ flex: 1 }}>
            <b>{r.label}</b>
            <div className="muted" style={{ fontSize: 12 }}>{fmtCompact(r.spend)} committed</div>
          </div>
          <span className={"chip " + (r.vendors <= 2 ? "warn" : "")}>
            {r.vendors} vendor{r.vendors === 1 ? "" : "s"}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ---------------- risk ---------------- */

function RiskTab({ api, tenders }) {
  const { state, go, ai } = api;
  const [insight, setInsight] = useState("");
  const [busy, setBusy] = useState(false);

  const expiring = useMemo(() => complianceRisk(state.suppliers), [state.suppliers]);
  const outliers = useMemo(() => {
    const out = [];
    tenders.filter((t) => t.openedAt).forEach((t) => {
      const bids = state.bids.filter((b) => b.tenderId === t.id);
      bids.forEach((b) => { if (abnormallyLow(b, bids)) out.push({ t, b }); });
    });
    return out;
  }, [tenders, state.bids]);
  const splits = useMemo(() => {
    const out = [];
    tenders.filter((t) => t.openedAt).forEach((t) => {
      state.bids.filter((b) => b.tenderId === t.id).forEach((b) => {
        varianceFlags(t, b).forEach((c) => out.push({ t, b, c }));
      });
    });
    return out;
  }, [tenders, state.bids]);

  const expired = expiring.filter((x) => x.expired);
  const soon = expiring.filter((x) => !x.expired && x.days <= 30);
  const held = state.suppliers.filter((s) => !s.prequalified).length;
  const name = (sid) => (state.suppliers.find((s) => s.id === sid) || {}).name || sid;

  const gen = async () => {
    setBusy(true); setInsight("");
    try { setInsight((await ai.insights()) || "No response, try again."); }
    catch (e) { setInsight(e.message || "The insight service is unreachable right now."); }
    setBusy(false);
  };

  return (
    <>
      <div className="grid g4" style={{ marginBottom: 14 }}>
        <Stat k="Expired documents" v={expired.length} d="vendors currently non-compliant"
              tone={expired.length ? "var(--wax)" : null} />
        <Stat k="Expiring in 30 days" v={soon.length} d="renewals to chase"
              tone={soon.length ? "var(--s4)" : null} />
        <Stat k="Price anomalies" v={outliers.length} d="bids 35%+ below the median"
              tone={outliers.length ? "var(--s4)" : null} />
        <Stat k="Panel splits" v={splits.length} d="criteria where evaluators disagree"
              tone={splits.length ? "var(--s4)" : null} />
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="chead"><h3>This week's read</h3>
          <button className="btn sm" style={{ marginLeft: "auto" }} onClick={gen} disabled={busy}>
            {busy ? "Analysing…" : "Generate with AI"}
          </button>
        </div>
        <div className="cbody">
          {insight ? <div className="aihint">{insight}</div> : (
            <span className="muted" style={{ fontSize: 13 }}>
              A short written read of the live portfolio: what's on track, which risks deserve
              attention this week, and what to do about each. Advisory only.
            </span>
          )}
        </div>
      </div>

      <div className="grid g2">
        <Figure title="Compliance runway" sub="days until each document expires"
                table={<DataTable
                  cols={[{ key: "v", label: "Vendor" }, { key: "d", label: "Document" },
                         { key: "days", label: "Days", num: true }]}
                  rows={expiring.slice(0, 40).map((x) => ({ key: x.supplier.id + x.doc.name,
                    v: x.supplier.name, d: x.doc.name, days: x.days }))} />}>
          {expiring.length ? (
            <div>
              {expiring.slice(0, 10).map((x) => (
                <div className="rowline" key={x.supplier.id + x.doc.name}>
                  <div style={{ flex: 1 }}>
                    <b>{x.supplier.name}</b>
                    <div className="muted" style={{ fontSize: 12 }}>{x.doc.name}</div>
                  </div>
                  <span className={"chip " + (x.expired ? "warn" : x.days <= 30 ? "warn" : "")}>
                    {x.expired ? `expired ${Math.abs(x.days)}d ago` : `${x.days} days`}
                  </span>
                </div>
              ))}
              {expiring.length > 10 && (
                <div className="muted" style={{ fontSize: 12, paddingTop: 8 }}>
                  and {expiring.length - 10} more — the table view has them all.
                </div>
              )}
            </div>
          ) : <Empty icon="shield">No compliance document expires in the next 90 days.</Empty>}
        </Figure>

        <Figure title="Open risk flags" sub="pricing and panel disagreement">
          <div>
            {outliers.map((x, i) => (
              <div className="rowline" key={"o" + i}>
                <div style={{ flex: 1 }}>
                  <b>{name(x.b.supplierId)}</b>
                  <div className="muted" style={{ fontSize: 12 }}>{x.t.title}</div>
                </div>
                <span className="chip warn">Bid 35%+ below median</span>
              </div>
            ))}
            {splits.map((x, i) => (
              <div className="rowline" key={"s" + i}>
                <div style={{ flex: 1 }}>
                  <b>{x.c.name}</b>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {name(x.b.supplierId)} · {x.t.title}
                  </div>
                </div>
                <span className="chip warn">Evaluators split ≥2 pts</span>
              </div>
            ))}
            {!outliers.length && !splits.length && <Empty icon="seal">No open risk flags.</Empty>}
          </div>
        </Figure>

        <Figure title="Register health" sub="prequalification across the vendor base">
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Meter label="Prequalified" value={state.suppliers.length - held}
                   max={state.suppliers.length} format={(n) => n.toLocaleString()} tone="var(--green)" />
            <Meter label="With an email address on file"
                   value={state.suppliers.filter((s) => s.contactEmail).length}
                   max={state.suppliers.length} format={(n) => n.toLocaleString()} />
            <Meter label="Invited to register"
                   value={state.suppliers.filter((s) => s.invitedAt).length}
                   max={state.suppliers.length} format={(n) => n.toLocaleString()} tone="var(--s7)" />
          </div>
        </Figure>
      </div>
    </>
  );
}
