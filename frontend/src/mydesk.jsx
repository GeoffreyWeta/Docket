/* My desk — what I have, what state it is in, and (if people report to me)
   what my team has.

   The dashboard already answers "what needs me right now". This answers the
   other question everyone actually has: *what am I carrying?* Those are
   different lists and conflating them is what made the old action queue
   useless — a tender sitting correctly with an approver is not a task, but it
   is very much still yours.

   Scope is decided by the reporting line, not by role. `state.reports` is
   computed server-side (see bootstrap in views.py) precisely so that "whose
   work may I see rolled up" is never a client-side decision.
*/
import React, { useMemo, useState } from "react";

import { Countdown, Empty, Stamp } from "./atoms";
import { DESK_BUCKETS, byOwner, desk, orgIndex, savingsSplit } from "./analytics-model";
import { Meter } from "./charts";
import { effStatus, fmtCompact, fmtDate } from "./helpers";
import { Icon } from "./icons";

export function MyDesk({ api }) {
  const { state, user, go } = api;
  const reports = state.reports || [];
  const canSeeTeam = reports.length > 0;

  /* "Mine" is what I own. "My team" is mine plus everyone below me — inclusive,
     because a manager's own tenders are part of what their team is carrying and
     leaving them out makes the rollup disagree with the org chart. */
  const [scope, setScope] = useState("mine");
  const [bucket, setBucket] = useState("live");
  const [q, setQ] = useState("");

  const ids = useMemo(
    () => (scope === "team" && canSeeTeam ? [user.id, ...reports] : [user.id]),
    [scope, canSeeTeam, reports, user.id]);

  const d = useMemo(() => desk(state.tenders, ids), [state.tenders, ids]);
  const org = useMemo(() => orgIndex(state.users || []), [state.users]);
  const rows = useMemo(
    () => byOwner(state.tenders, state.users || [], ids), [state.tenders, state.users, ids]);
  const sav = useMemo(() => savingsSplit(d.all), [d.all]);

  const list = useMemo(() => {
    const base = d[bucket] || [];
    const n = q.trim().toLowerCase();
    if (!n) return base;
    return base.filter((t) => [t.ref, t.title, t.category].some((x) => (x || "").toLowerCase().includes(n)));
  }, [d, bucket, q]);

  const owner = (t) => {
    const u = org.byId.get(t.ownerId);
    return u ? u.name : "Unassigned";
  };

  if (!d.all.length && scope === "mine") {
    return (
      <div className="card desk" data-reveal>
        <div className="chead"><h3>My desk</h3></div>
        <div className="cbody">
          <Empty icon="tender">
            You aren't carrying any tenders yet. Anything you create lands here, split by
            what's open, what's mid-flight and what's closed.
          </Empty>
        </div>
      </div>
    );
  }

  return (
    <div className="card desk" data-reveal>
      <div className="chead">
        <h3>{scope === "team" ? "My team's desk" : "My desk"}</h3>
        {canSeeTeam && (
          <div className="segmented" role="tablist" aria-label="Whose work to show">
            <button role="tab" aria-selected={scope === "mine"} className={scope === "mine" ? "on" : ""}
                    onClick={() => setScope("mine")}>Mine</button>
            <button role="tab" aria-selected={scope === "team"} className={scope === "team" ? "on" : ""}
                    onClick={() => setScope("team")}>
              My team <span className="faint">({reports.length + 1})</span>
            </button>
          </div>
        )}
        <span className="mono faint deskcount">
          {d.all.length} tender{d.all.length === 1 ? "" : "s"}
          {sav.hardTotal > 0 ? ` · ${fmtCompact(sav.hardTotal)} verified saved` : ""}
        </span>
      </div>

      {/* Bucket filters read as counts, so the shape of the desk is legible
          before anything is clicked. */}
      <div className="deskfilters">
        {DESK_BUCKETS.map((b) => (
          <button key={b.key} className={"deskchip" + (bucket === b.key ? " on" : "")}
                  onClick={() => setBucket(b.key)} title={b.hint}
                  aria-pressed={bucket === b.key}>
            {b.label}<b>{(d[b.key] || []).length}</b>
          </button>
        ))}
        <input className="in deskq" placeholder="Filter…" value={q} aria-label="Filter this list"
               onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="cbody" style={{ paddingTop: 4 }}>
        {list.length ? (
          <div className="desklist">
            {list.map((t) => (
              <div className="deskrow" key={t.id} onClick={() => go({ page: "tender", id: t.id })}
                   tabIndex={0} onKeyDown={(e) => e.key === "Enter" && go({ page: "tender", id: t.id })}>
                <div className="dkmain">
                  <div className="dktitle">{t.title}</div>
                  <div className="dkmeta">
                    <span className="mono">{t.ref}</span>
                    <span>{t.category}</span>
                    {scope === "team" && t.ownerId !== user.id && (
                      <span className="dkowner"><Icon n="team" s={11} />{owner(t)}</span>
                    )}
                  </div>
                </div>
                <div className="dkright">
                  {t.status === "awarded"
                    ? <span className="mono faint">{fmtCompact(t.awardedAmount || 0)}</span>
                    : bucket === "live" ? <Countdown deadline={t.deadline} />
                    : <span className="mono faint">{t.deadline ? fmtDate(t.deadline) : ""}</span>}
                  <Stamp s={effStatus(t)} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty>
            {q ? "Nothing here matches that." : `Nothing ${DESK_BUCKETS.find((b) => b.key === bucket).label.toLowerCase()}.`}
          </Empty>
        )}
      </div>

      {/* The rollup, only when there is a team to roll up. */}
      {scope === "team" && rows.length > 1 && (
        <div className="deskteam">
          {rows.filter((r) => r.id !== "__none").map((r) => (
            <div className="tmrow" key={r.id}>
              <div className="tmname">
                <b>{r.name}</b>
                <span className="muted">{r.title}</span>
              </div>
              <div className="tmbars">
                <Meter label={`${r.open} open · ${r.awarded} awarded`} value={r.open}
                       max={Math.max(...rows.map((x) => x.open), 1)} format={(n) => String(n)} />
              </div>
              <div className="tmsav mono">
                {r.hardSaved > 0 ? fmtCompact(r.hardSaved) : <span className="faint">—</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
