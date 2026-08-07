/* Backfilling savings baselines from the finance ledger.

   The migration screen. An organisation arriving with years of NAV behind it
   has already told DOCKET what it used to pay — the contracts are imported —
   but none of that reaches the savings figure until somebody decides which
   prior contract a given award should be measured against. This is where that
   decision is made, in bulk, once.

   Three things this screen refuses to do, all of them for the same reason: a
   savings number is a claim somebody will have to defend.

   * It never applies anything without a person choosing it. Rows start
     unticked, including the good ones.
   * It shows the consequence before the action. Each row states what the
     saving is reported as today, what it would become, and the difference.
   * It leads with the awkward cases rather than burying them. A proposal that
     turns a reported saving into a reported loss is real information — the
     price went up — and it sorts to the top with a warning, not out of sight.
*/
import React, { useEffect, useMemo, useState } from "react";

import { Empty, Money } from "./atoms";
import { Meter } from "./charts";
import { fmtCompact, fmtDate, fmtMoney } from "./helpers";
import { Icon } from "./icons";
import { useReveal } from "./motion";

const CONFIDENCE = {
  good: { label: "Good", hint: "Two or more recent prior contracts agree." },
  thin: { label: "Thin", hint: "Only one recent contract to go on." },
  stale: { label: "Stale", hint: "Every contract behind this is over two and a half years old. In a high-inflation currency that is a weak guide to today's price." },
};

export function BaselineBackfill({ api, onClose }) {
  const { toast, refresh } = api;
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [picked, setPicked] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(null);

  const load = async () => {
    try { setData(await api.finance.baselines()); setErr(""); }
    catch (e) { setErr(e.message || "Could not read the ledger."); }
  };
  useEffect(() => { load(); }, []);

  /* This panel fetches its own candidates, so its rows land after whichever
     page mounted it has already armed and spent its reveal observer. Arming one
     here on the same data is what keeps `[data-reveal]` from leaving the whole
     card at opacity 0 — which is not a missed animation, it is a blank card. */
  useReveal([data]);

  const rows = useMemo(() => {
    if (!data) return [];
    /* Awkward first: anything that would make the reported saving worse, then
       the biggest awards. Sorting purely by value would put the one row that
       needs a human decision at the bottom of a long list. */
    return [...data.candidates].sort((a, b) => {
      if (!!a.worsens !== !!b.worsens) return a.worsens ? -1 : 1;
      if (!!a.suggestion !== !!b.suggestion) return a.suggestion ? -1 : 1;
      return (b.awarded || 0) - (a.awarded || 0);
    });
  }, [data]);

  const usable = rows.filter((r) => r.suggestion && !r.worsens);
  const toggle = (id) => setPicked((p) => {
    const n = new Set(p);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const apply = async () => {
    setBusy(true);
    const picks = rows.filter((r) => picked.has(r.id) && r.suggestion)
      .map((r) => ({ id: r.id, amount: r.suggestion.amount, source: r.suggestion.source }));
    try {
      const out = await api.finance.adoptBaselines(picks);
      const n = out.applied.length;
      toast.ok(n ? `${n} baseline${n === 1 ? "" : "s"} adopted` : "Nothing was applied",
               out.skipped.length ? `${out.skipped.length} refused — see the list.` : "");
      setPicked(new Set());
      await load();
      refresh();
      if (out.skipped.length) setErr(out.skipped.map((s) => `${s.ref || s.id}: ${s.why}`).join("\n"));
    } catch (e) {
      setErr(e.message || "Could not apply.");
    }
    setBusy(false);
  };

  if (!data) {
    return (
      <div className="card" data-reveal>
        <div className="chead"><h3>Baselines from history</h3></div>
        <div className="cbody">{err ? <div className="notice warn">{err}</div> : <Empty>Reading the ledger…</Empty>}</div>
      </div>
    );
  }

  const c = data.coverage;

  return (
    <div className="card bfill" data-reveal>
      <div className="chead">
        <h3>Baselines from history</h3>
        <span className="mono faint" style={{ marginLeft: "auto" }}>
          {c.withBaseline} of {c.awarded} awards measured against a prior price
        </span>
      </div>

      <div className="cbody">
        <div className="muted bfintro">
          Savings are only as good as what they are compared against. Where an award has no
          prior price on file it is measured against its budget, which grades the estimate as
          much as the buying. These are the awards the imported ledger could measure properly:
          each proposal is the median of the <b>contracts that came before it</b> in the same
          category, annualised against its own term.
        </div>

        <div className="grid g2" style={{ margin: "14px 0" }}>
          <Meter label="Awards with a recorded prior price" value={c.withBaseline} max={c.awarded}
                 format={(n) => String(n)} tone="var(--green)" />
          <Meter label="By value" value={c.covered} max={c.value} format={fmtCompact} />
        </div>

        {err && <div className="notice warn" style={{ whiteSpace: "pre-line", marginBottom: 12 }}>{err}</div>}

        {!rows.length ? (
          <Empty icon="seal">
            Every awarded tender already has a prior price recorded. Nothing to backfill.
          </Empty>
        ) : (
          <>
            <div className="bfbar">
              <button className="btn sm" disabled={!usable.length}
                      onClick={() => setPicked(new Set(usable.map((r) => r.id)))}>
                Select all {usable.length} that show a saving
              </button>
              {picked.size > 0 && (
                <button className="btn sm" onClick={() => setPicked(new Set())}>Clear</button>
              )}
              <span className="grow" />
              <button className="btn pri sm" disabled={!picked.size || busy} onClick={apply}>
                {busy ? "Applying…" : `Adopt ${picked.size} baseline${picked.size === 1 ? "" : "s"}`}
              </button>
            </div>

            <div className="bflist">
              {rows.map((r) => (
                <BackfillRow key={r.id} r={r} picked={picked.has(r.id)} onToggle={() => toggle(r.id)}
                             open={open === r.id} onOpen={() => setOpen(open === r.id ? null : r.id)} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function BackfillRow({ r, picked, onToggle, open, onOpen }) {
  const s = r.suggestion;
  const conf = s ? (CONFIDENCE[s.confidence] || CONFIDENCE.thin) : null;

  return (
    <div className={"bfrow" + (r.worsens ? " warn" : "") + (picked ? " on" : "")}>
      <label className="bfpick">
        <input type="checkbox" checked={picked} disabled={!s} onChange={onToggle}
               aria-label={`Adopt a baseline for ${r.ref}`} />
      </label>

      <div className="bfmain">
        <div className="bftitle">{r.title}</div>
        <div className="bfmeta">
          <span className="mono">{r.ref}</span>
          <span>{r.category}</span>
          {r.awardedAt ? <span>awarded {fmtDate(r.awardedAt)}</span> : null}
        </div>

        {s ? (
          <>
            <div className="bfmove">
              <span className="bfnow">
                today <b>{fmtMoney(r.currentSaving)}</b> <span className="faint">vs budget</span>
              </span>
              <Icon n="chev" s={12} />
              <span className={"bfnext" + (r.worsens ? " bad" : " good")}>
                <b>{fmtMoney(r.proposedSaving)}</b>{" "}
                <span className="faint">vs {fmtMoney(s.amount)} prior price</span>
              </span>
              <span className={"chip " + (conf.label === "Good" ? "ok" : "warn")} title={conf.hint}>
                {conf.label}
              </span>
            </div>
            {r.worsens && (
              <div className="bfwarn">
                <Icon n="alert" s={12} />
                {/* One span, not bare text: .bfwarn is a flex row, and the runs
                    either side of the <b> would each become their own flex item
                    and lay out as columns. */}
                <span>
                  This award cost <b>more</b> than the contract it replaced, so it would report a
                  loss rather than a saving. That may be exactly right — prices rise — but it is a
                  claim worth making deliberately, so it is left out of bulk adoption.
                </span>
              </div>
            )}
            {r.smaller && (
              <div className="bfsmaller">
                Lower than the budget figure, and more defensible: budgets carry padding, so a real
                prior price usually shrinks the number while making it one that survives a review.
              </div>
            )}
            <button className="doclink bfwhy" onClick={onOpen} aria-expanded={open}>
              {open ? "Hide" : "Show"} the {s.n} contract{s.n === 1 ? "" : "s"} behind this
            </button>
            {open && (
              <div className="bfev">
                <div className="bfevsrc">{s.source}</div>
                {s.evidence.map((e) => (
                  <div className="bfevrow" key={e.id}>
                    <span className="mono">{e.ref}</span>
                    <span className="bfevsup">{e.supplier}</span>
                    <span className="mono bfevamt">{fmtMoney(e.raw)}</span>
                    <span className="faint">{e.how}</span>
                    {e.stale ? <span className="chip warn">old</span> : null}
                    <span className="faint">{e.signedAt ? fmtDate(e.signedAt) : ""}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="bfnone">
            No contract in <b>{r.category}</b> predates this award, so the ledger cannot say what
            it replaced. Its saving stays measured against budget
            (<Money n={r.currentSaving} />).
          </div>
        )}
      </div>

      <div className="bfaward">
        <div className="mono">{fmtCompact(r.awarded)}</div>
        <div className="faint">awarded</div>
      </div>
    </div>
  );
}

/* The drafting-time half: what this category used to cost, offered on the
   tender form. Small on purpose — a suggestion, next to the field, that fills
   it in and says where the number came from. */
export function BaselineHint({ api, category, onAdopt, current }) {
  const [s, setS] = useState(null);
  const [state, setState] = useState("idle");

  useEffect(() => {
    if (!category) { setS(null); setState("idle"); return; }
    let live = true;
    setState("loading");
    api.finance.baselineFor(category)
      .then((r) => { if (live) { setS(r.suggestion); setState("done"); } })
      .catch(() => { if (live) { setS(null); setState("done"); } });
    return () => { live = false; };
  }, [category]);

  if (state !== "done" || !s) return null;
  if (current && Number(current) === s.amount) {
    return <div className="hint bhok"><Icon n="check" s={12} /> Matches the ledger's prior price for this category.</div>;
  }

  return (
    <div className="bhint">
      <div className="bhmain">
        <b>{fmtMoney(s.amount)}</b> a year is what this category cost before.
        <div className="faint">{s.source}</div>
      </div>
      <button type="button" className="btn xs" onClick={() => onAdopt(s.amount, s.source)}>
        Use it
      </button>
    </div>
  );
}

export const BASELINE_CSS = `
.bfintro{font-size:12.5px;line-height:1.65}
.bfintro b{color:var(--ink)}
.bfbar{display:flex;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid var(--line);
  flex-wrap:wrap}
.bfbar .grow{flex:1}

.bflist{display:flex;flex-direction:column}
.bfrow{display:flex;gap:12px;padding:13px 8px;border-bottom:1px solid var(--hair);
  border-left:3px solid transparent;border-radius:6px}
.bfrow:last-child{border-bottom:0}
.bfrow.on{background:var(--sunk)}
.bfrow.warn{border-left-color:var(--wax)}
.bfpick{flex:0 0 auto;padding-top:2px}
.bfmain{flex:1;min-width:0}
.bftitle{font-weight:600;font-size:13.5px}
.bfmeta{display:flex;gap:10px;flex-wrap:wrap;font-size:11.5px;color:var(--faint);margin-top:2px}

.bfmove{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px;font-size:12.5px}
.bfnow{color:var(--muted)}
.bfnext.good b{color:var(--green)}
.bfnext.bad b{color:var(--wax)}
.bfwarn{display:flex;gap:7px;align-items:flex-start;margin-top:8px;font-size:11.5px;
  color:var(--muted);line-height:1.55;background:var(--wax-tint);padding:8px 10px;border-radius:7px}
.bfwarn b{color:var(--ink)}
.bfsmaller{margin-top:7px;font-size:11.5px;color:var(--muted);line-height:1.55}
.bfwhy{font-size:11.5px;margin-top:8px;display:inline-block}
.bfnone{font-size:12px;color:var(--muted);line-height:1.55;margin-top:7px}

.bfev{margin-top:9px;padding:10px 12px;background:var(--sunk);border-radius:8px;
  border:1px solid var(--line)}
.bfevsrc{font-size:11.5px;color:var(--muted);margin-bottom:8px;line-height:1.5}
.bfevrow{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;font-size:11.5px;
  padding:3px 0;color:var(--muted)}
.bfevsup{flex:1;min-width:90px;color:var(--ink)}
.bfevamt{color:var(--ink);font-variant-numeric:tabular-nums}

.bfaward{flex:0 0 auto;text-align:right;font-size:12px}
.bfaward .mono{font-variant-numeric:tabular-nums;color:var(--ink)}
.bfaward .faint{font-size:10.5px}

/* the tender-form hint */
.bhint{display:flex;gap:10px;align-items:center;margin-top:7px;padding:9px 11px;
  background:var(--sunk);border:1px solid var(--line);border-radius:8px}
.bhmain{flex:1;min-width:0;font-size:12px;line-height:1.5}
.bhmain b{color:var(--ink)}
.bhmain .faint{font-size:11px;display:block;margin-top:2px}
.bhok{display:flex;align-items:center;gap:5px;color:var(--green)}

@media(max-width:720px){
  .bfrow{flex-wrap:wrap}
  .bfaward{text-align:left}
}
`;
