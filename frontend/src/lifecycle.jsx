/* The event lifecycle, on the buyer's side.

   Everything here is about a competition that is already running: the vendors
   on it, the rounds it is being run in, the submissions grouped by round, and
   the four controls a live event needs and did not have — extend, pause,
   resume, cancel.

   Two rules shape all of it:

   * What is offered follows what the event's state permits AND what this person
     holds. A control that would be refused by the server is not drawn, so the
     page never invites a click it cannot honour. The server refuses anyway —
     this module decides what to show, not what is allowed.

   * Nothing here relaxes sealing. The bid bucket says who submitted and when,
     which is what tells a manager a round is complete; the amounts inside it
     are whatever the server was willing to serialise, and that decision is
     made in one place, on the server, for every caller.
*/
import React, { useEffect, useState } from "react";

import { raw } from "./api";
import { Empty, Money } from "./atoms";
import {
  DAY, ROUND_STATUS, REG_STATUS, VERIFY_STATUS, effStatus, fmtCompact, fmtDate,
  fmtDateTime, nowMs, roundsOf,
} from "./helpers";
import { Icon } from "./icons";
import { can } from "./perms";
import { ConfirmDialog, Dialog } from "./ui";

/* ---------------- small shared pieces ---------------- */

/* A date input that speaks epoch milliseconds, which is what the whole API
   does. Times default to 17:00 local — a deadline of midnight is a deadline
   nobody meant, and every deadline this app has ever set was an end-of-day. */
const toInput = (ms) => (ms ? new Date(ms - new Date(ms).getTimezoneOffset() * 60000)
  .toISOString().slice(0, 16) : "");
const fromInput = (v) => (v ? new Date(v).getTime() : 0);

function DateTimeField({ id, label, value, onChange, hint, min }) {
  return (
    <div className="frow">
      <label className="lbl" htmlFor={id}>{label}</label>
      <input id={id} className="in" type="datetime-local" value={value} min={min}
             onChange={(e) => onChange(e.target.value)} />
      {hint && <div className="muted" style={{ fontSize: 12, marginTop: 5 }}>{hint}</div>}
    </div>
  );
}

export const RoundChip = ({ status }) => {
  const r = ROUND_STATUS[status] || { label: status, tone: "" };
  return <span className={"chip " + r.tone}>{r.label}</span>;
};

const StatusChip = ({ map, value }) => {
  const v = map[value] || { label: value, tone: "" };
  return <span className={"chip " + v.tone}>{v.label}</span>;
};

/* ---------------- the lifecycle action bar ---------------- */

/* Which controls exist at all. Kept as data rather than a run of ternaries in
   the JSX so the answer to "what can be done to an event in this state" is
   readable in one place — it is the table in the product spec, and it is the
   thing that gets argued about. */
function controlsFor(t, user) {
  const st = effStatus(t);
  const live = st === "published" || st === "paused";
  const frozen = st === "awarded" || st === "cancelled";
  return {
    extend: can(user, "tender.extend") && !frozen && !t.openedAt && !t.techOpenedAt
      && (live || st === "closed"),
    pause: can(user, "tender.lifecycle") && st === "published",
    resume: can(user, "tender.lifecycle") && t.status === "paused",
    cancel: can(user, "tender.lifecycle") && !frozen && t.status !== "draft" && t.status !== "approval",
    notify: can(user, "tender.vendors") && !frozen && (t.invited || []).length > 0
      && t.status !== "draft" && t.status !== "approval",
  };
}

export function LifecycleBar({ api, t }) {
  const { user, act, toast } = api;
  const c = controlsFor(t, user);
  const [open, setOpen] = useState(null);   // extend | pause | resume | cancel | notify
  if (!Object.values(c).some(Boolean)) return null;

  const st = effStatus(t);
  const reopening = st === "closed" && c.extend;

  return (
    <>
      {open === "extend" && <ExtendDialog api={api} t={t} reopening={reopening} onClose={() => setOpen(null)} />}
      {open === "resume" && <ResumeDialog api={api} t={t} onClose={() => setOpen(null)} />}
      {open === "notify" && <NotifyDialog api={api} t={t} onClose={() => setOpen(null)} />}
      {open === "pause" && (
        <ReasonDialog title={`Pause ${t.ref}?`} confirmLabel="Pause the event" tone="wax"
                      placeholder="e.g. Specification error in section 4 — corrected pack to follow."
                      onClose={() => setOpen(null)}
                      onConfirm={async (reason) => {
                        if (await act.pauseEvent(t.id, reason)) {
                          toast.ok("Event paused", "No submissions are being taken. Every invited vendor has been told why.");
                        }
                      }}>
          Submissions stop immediately and the countdown keeps running, so resuming later will
          usually mean extending the deadline too. Every invited vendor is told, in your words.
        </ReasonDialog>
      )}
      {open === "cancel" && (
        <ReasonDialog title={`Cancel ${t.ref}?`} confirmLabel="Hold to cancel this event" tone="wax" hold
                      holdHint="Cannot be undone: hold to confirm"
                      placeholder="e.g. Requirement withdrawn — the budget line was reallocated."
                      onClose={() => setOpen(null)}
                      onConfirm={async (reason) => {
                        if (await act.cancelEvent(t.id, reason)) {
                          toast.ok("Event cancelled", "Sealed bids stay unopened. Every invited vendor has been told.");
                        }
                      }}>
          No award will be made, sealed bids are never opened, and every invited vendor is told your
          reason verbatim. <b>This cannot be undone</b> — running the requirement again means raising
          a new event, which is also the honest record of what happened.
        </ReasonDialog>
      )}

      <div className="lifebar">
        <span className="mono faint lifelbl">Event controls</span>
        {c.extend && (
          <button className="btn sm" onClick={() => setOpen("extend")}>
            <Icon n="clock" /> {reopening ? "Reopen with a new deadline" : "Extend deadline"}
          </button>
        )}
        {c.pause && <button className="btn sm" onClick={() => setOpen("pause")}>Pause</button>}
        {c.resume && <button className="btn sm pri" onClick={() => setOpen("resume")}>Resume</button>}
        {c.notify && <button className="btn sm" onClick={() => setOpen("notify")}><Icon n="mail" /> Notify vendors</button>}
        <span className="grow" />
        {c.cancel && <button className="btn sm wax" onClick={() => setOpen("cancel")}>Cancel event</button>}
      </div>
      {t.status === "paused" && (
        <div className="notice wax" style={{ marginBottom: 12 }}>
          <b>Paused {fmtDateTime(t.pausedAt)}.</b> {t.pausedReason}
          {" "}No submissions are being taken. The deadline
          {t.deadline > nowMs() ? ` is still ${fmtDate(t.deadline)}` : ` passed on ${fmtDate(t.deadline)}`}.
        </div>
      )}
      {t.cancelledAt && (
        <div className="notice wax" style={{ marginBottom: 12 }}>
          <b>Cancelled {fmtDateTime(t.cancelledAt)}.</b> {t.cancelReason}
          {" "}No award will be made and any sealed bid was never opened.
        </div>
      )}
    </>
  );
}

/* A confirmation that requires a reason before it will confirm. The reason is
   not decoration: it is sent to every vendor verbatim and recorded on the
   chain, which is why the button stays disabled without one. */
function ReasonDialog({ title, children, confirmLabel, tone = "pri", hold, holdHint,
                        placeholder, onClose, onConfirm }) {
  const [reason, setReason] = useState("");
  const body = (
    <>
      {children}
      <textarea className="in" style={{ marginTop: 10 }} autoFocus value={reason}
                placeholder={placeholder} onChange={(e) => setReason(e.target.value)} />
    </>
  );
  if (hold) {
    return (
      <ConfirmDialog title={title} confirmLabel={confirmLabel} tone={tone} hold holdHint={holdHint}
                     onClose={onClose} disabled={!reason.trim()}
                     onConfirm={() => onConfirm(reason.trim())}>
        {body}
      </ConfirmDialog>
    );
  }
  return (
    <Dialog title={title} onClose={onClose} footer={
      <>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className={"btn " + tone} disabled={!reason.trim()}
                onClick={() => { onClose(); onConfirm(reason.trim()); }}>{confirmLabel}</button>
      </>
    }>{body}</Dialog>
  );
}

function ExtendDialog({ api, t, reopening, onClose }) {
  const { act, toast } = api;
  const [when, setWhen] = useState(toInput(t.deadline + 7 * DAY));
  const [reason, setReason] = useState("");
  const ms = fromInput(when);
  const ok = ms > Math.max(nowMs(), t.deadline) && reason.trim();
  return (
    <Dialog title={reopening ? `Reopen ${t.ref}` : `Extend the deadline on ${t.ref}`} onClose={onClose} footer={
      <>
        {!ok && <span className="hint gatehint">Pick a date after the current deadline, and give a reason. Vendors will read it.</span>}
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={!ok} onClick={async () => {
          onClose();
          if (await act.extendDeadline(t.id, ms, reason.trim())) {
            toast.ok(reopening ? "Event reopened" : "Deadline extended",
                     `Now closing ${fmtDateTime(ms)}. Every invited vendor has been told, and the old date is on the record.`);
          }
        }}>{reopening ? "Reopen the event" : "Extend the deadline"}</button>
      </>
    }>
      <div className="rowline"><span className="muted" style={{ flex: 1 }}>Current deadline</span>
        <span className="mono">{fmtDateTime(t.deadline)}{t.deadline < nowMs() ? " · passed" : ""}</span></div>
      <DateTimeField id="ex-when" label="New deadline" value={when} onChange={setWhen}
                     hint="A deadline can only be pushed back. Bidders working to the published date cannot be asked to meet an earlier one." />
      <div className="frow">
        <label className="lbl" htmlFor="ex-why">Reason</label>
        <textarea id="ex-why" className="in" value={reason} onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Two vendors asked for more time to price the civil works package." />
        <div className="muted" style={{ fontSize: 12, marginTop: 5 }}>
          Sent to every invited vendor and recorded with the old date, the new one and your name.
        </div>
      </div>
      {(t.deadlineChanges || []).length > 0 && (
        <div className="notice" style={{ marginTop: 4 }}>
          This deadline has already moved {t.deadlineChanges.length === 1 ? "once" : `${t.deadlineChanges.length} times`}.
          Repeated extensions are visible to everyone reading the audit trail.
        </div>
      )}
    </Dialog>
  );
}

function ResumeDialog({ api, t, onClose }) {
  const { act, toast } = api;
  const lapsed = t.deadline <= nowMs();
  const [when, setWhen] = useState(lapsed ? toInput(nowMs() + 7 * DAY) : "");
  const ms = fromInput(when);
  const ok = !lapsed || ms > nowMs();
  return (
    <Dialog title={`Resume ${t.ref}`} onClose={onClose} footer={
      <>
        {!ok && <span className="hint gatehint">The old deadline has passed. Pick a new closing date first.</span>}
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={!ok} onClick={async () => {
          onClose();
          if (await act.resumeEvent(t.id, ms || null)) {
            toast.ok("Event resumed", "Submissions are open again and every invited vendor has been told.");
          }
        }}>Resume the event</button>
      </>
    }>
      {lapsed ? (
        <>
          The deadline passed while this event was paused, so it needs a new one before bidders have
          anywhere to submit into.
          <DateTimeField id="rs-when" label="New deadline" value={when} onChange={setWhen} />
        </>
      ) : (
        <>
          Submissions reopen immediately, with {Math.max(0, Math.ceil((t.deadline - nowMs()) / DAY))} day(s)
          left on the clock. The pause ate into that time — set a new deadline if bidders now need longer.
          <DateTimeField id="rs-when" label="New deadline (optional)" value={when} onChange={setWhen} />
        </>
      )}
    </Dialog>
  );
}

function NotifyDialog({ api, t, onClose }) {
  const { state, act, toast } = api;
  const [subject, setSubject] = useState(`Update: ${t.title}`);
  const [message, setMessage] = useState("");
  const [only, setOnly] = useState("all");
  const bidders = new Set(state.bids.filter((b) => b.tenderId === t.id).map((b) => b.supplierId));
  const noBid = (t.invited || []).filter((s) => !bidders.has(s));
  const n = only === "nobid" ? noBid.length : (t.invited || []).length;
  return (
    <Dialog title="Notify the event's vendors" onClose={onClose} footer={
      <>
        {(!message.trim() || !n) && <span className="hint gatehint">{!n ? "Nobody is selected to receive this." : "Write the message first."}</span>}
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={!message.trim() || !n} onClick={async () => {
          onClose();
          const sent = await act.notifyVendors(t.id, { subject: subject.trim(), message: message.trim(), only });
          if (sent) toast.ok("Vendors notified", `${n} vendor(s) have it in their portal and their inbox.`);
        }}>Send to {n} vendor{n === 1 ? "" : "s"}</button>
      </>
    }>
      This is a message, not an addendum. An addendum amends the tender and every new submission has
      to acknowledge it; this just tells people something. Use the Overview tab to issue an addendum.
      <div className="frow" style={{ marginTop: 10 }}>
        <label className="lbl" htmlFor="nv-who">Recipients</label>
        <select id="nv-who" className="in" value={only} onChange={(e) => setOnly(e.target.value)}>
          <option value="all">Every invited vendor ({(t.invited || []).length})</option>
          <option value="nobid">Only those who have not submitted ({noBid.length})</option>
        </select>
      </div>
      <div className="frow"><label className="lbl" htmlFor="nv-sub">Subject</label>
        <input id="nv-sub" className="in" value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
      <div className="frow"><label className="lbl" htmlFor="nv-msg">Message</label>
        <textarea id="nv-msg" className="in" value={message} onChange={(e) => setMessage(e.target.value)}
                  placeholder="e.g. A reminder that submissions close on Friday at 5pm. The revised bill of quantities is in the document pack." /></div>
    </Dialog>
  );
}

/* ---------------- vendors on the event ---------------- */

export function VendorsTab({ api, t }) {
  const { state, user, act, toast } = api;
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [adding, setAdding] = useState(false);
  const [dropping, setDropping] = useState(null);
  const [q, setQ] = useState("");
  const canManage = can(user, "tender.vendors") && !["awarded", "cancelled"].includes(t.status);

  const load = () => {
    setErr("");
    raw(`/tenders/${t.id}/vendors/`)
      .then((d) => setRows(d.vendors))
      .catch((e) => setErr(e.message || "Could not load this event's vendors."));
  };
  useEffect(load, [t.id, (t.invited || []).length, state.bids.length]);

  if (err) return <div className="notice wax">{err} <button className="btn sm" onClick={load}>Try again</button></div>;
  if (!rows) return <div className="card"><div className="cbody"><span className="muted">Loading vendors…</span></div></div>;

  const shown = q.trim()
    ? rows.filter((r) => (r.name + " " + r.email).toLowerCase().includes(q.trim().toLowerCase()))
    : rows;
  const submitted = rows.filter((r) => r.bidStatus === "submitted").length;
  const unverified = rows.filter((r) => r.verificationStatus === "unverified").length;
  const unregistered = rows.filter((r) => r.registrationStatus !== "registered").length;

  return (
    <div>
      {adding && <AddVendorsDialog api={api} t={t} invited={rows.map((r) => r.supplierId)}
                                   onClose={() => setAdding(false)} onDone={load} />}
      {dropping && (
        <ConfirmDialog title={`Withdraw ${dropping.name}?`} confirmLabel="Withdraw the invitation" tone="wax"
                       onClose={() => setDropping(null)}
                       onConfirm={async () => {
                         const s = dropping;
                         if (await act.removeEventVendor(t.id, s.supplierId)) {
                           toast.ok(`${s.name} withdrawn`, "They have been told, and the change is on the audit trail.");
                           load();
                         }
                       }}>
          They lose access to this event's bid room and are told their invitation was withdrawn.
          They stay on the vendor register and can be invited to anything else.
        </ConfirmDialog>
      )}

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="chead">
          <h3>Vendors on this event</h3>
          <span className="mono faint" style={{ marginLeft: 10 }}>
            {rows.length} invited · {submitted} submitted
          </span>
          <span className="grow" />
          <input className="in" style={{ maxWidth: 200 }} placeholder="Search vendors…"
                 aria-label="Search this event's vendors" value={q} onChange={(e) => setQ(e.target.value)} />
          {canManage && <button className="btn sm pri" style={{ marginLeft: 8 }} onClick={() => setAdding(true)}>
            <Icon n="plus" /> Add vendors
          </button>}
        </div>
        {!rows.length ? (
          <div className="cbody">
            <Empty icon="suppliers">
              No vendors on this event yet. A competition with nobody in it cannot be published —
              {canManage ? " add vendors from the register to get started." : " ask the event owner to add some."}
            </Empty>
          </div>
        ) : (
          <div className="tscroll">
            <table className="tbl wide">
              <thead>
                <tr>
                  <th>Vendor</th><th>Registration</th><th>Verification</th>
                  <th>Invitation</th><th>Bid</th><th>Rounds</th><th>Evaluation</th><th />
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.supplierId}>
                    <td>
                      <b>{r.name}</b>
                      {r.awarded && <span className="chip gold" style={{ marginLeft: 6 }}>Awarded</span>}
                      <div className="muted" style={{ fontSize: 11.5 }}>{r.email || "no email on file"}</div>
                    </td>
                    <td data-l="Registration"><StatusChip map={REG_STATUS} value={r.registrationStatus} /></td>
                    <td data-l="Verification"><StatusChip map={VERIFY_STATUS} value={r.verificationStatus} /></td>
                    <td data-l="Invitation">
                      <span className={"chip " + (r.invitationStatus === "sent" ? "ok" : "")}>
                        {r.invitationStatus === "sent" ? "Invited" : "Not yet sent"}
                      </span>
                    </td>
                    <td data-l="Bid">
                      {r.bidStatus === "submitted"
                        ? <span className="chip ok">Submitted</span>
                        : <span className="chip">No bid</span>}
                      {r.submittedAt && <div className="mono faint" style={{ fontSize: 11 }}>{fmtDate(r.submittedAt)}</div>}
                    </td>
                    <td data-l="Rounds" className="mono">
                      {r.roundsBid.length ? r.roundsBid.map((n) => `R${n}`).join(", ") : "—"}
                      {!r.inCurrentRound && r.roundsBid.length > 0 &&
                        <div className="muted" style={{ fontSize: 11 }}>not in the current round</div>}
                    </td>
                    <td data-l="Evaluation">
                      {r.disqualified ? <span className="chip warn">Disqualified</span>
                        : r.evaluationStatus === "scored" ? <span className="chip ok">Scored</span>
                        : r.evaluationStatus === "pending" ? <span className="chip">Awaiting scores</span>
                        : <span className="muted">—</span>}
                    </td>
                    <td>
                      {canManage && r.bidStatus !== "submitted" && !r.awarded && (
                        <button className="btn sm" onClick={() => setDropping(r)}>Withdraw</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* The two facts a manager needs told to them rather than counted off a
          table. Unverified participation is deliberate here — it is the
          standing rule, not an oversight — so it is stated as a fact, not a
          warning somebody has to dismiss. */}
      {rows.length > 0 && (unverified > 0 || unregistered > 0) && (
        <div className="notice">
          {unverified > 0 && (
            <>
              <b>{unverified} of these vendors {unverified === 1 ? "is" : "are"} unverified.</b>{" "}
              They can still be invited and can still bid — verification gates prequalification, not
              participation. Verify them from the Vendors page when their documents are in.{" "}
            </>
          )}
          {unregistered > 0 && (
            <>
              <b>{unregistered} {unregistered === 1 ? "has" : "have"} not completed registration.</b>{" "}
              They cannot sign in to submit until they do. Their invitation email carries the link.
            </>
          )}
        </div>
      )}
    </div>
  );
}

function AddVendorsDialog({ api, t, invited, onClose, onDone }) {
  const { state, act, toast } = api;
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState([]);
  const pool = state.suppliers.filter((s) => !invited.includes(s.id) && !s.suspended);
  const shown = q.trim()
    ? pool.filter((s) => (s.name + " " + (s.code || "") + " " + s.category).toLowerCase()
        .includes(q.trim().toLowerCase())).slice(0, 40)
    : pool.slice(0, 40);
  const toggle = (id) => setPicked((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  const unverified = picked.filter((id) => {
    const s = state.suppliers.find((x) => x.id === id);
    return s && !s.prequalified;
  }).length;
  const live = ["published", "paused"].includes(t.status) || effStatus(t) === "closed";
  const [mail, setMail] = useState(true);

  return (
    <Dialog wide title="Add vendors to this event" onClose={onClose} footer={
      <>
        {!picked.length && <span className="hint gatehint">Pick at least one vendor.</span>}
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={!picked.length} onClick={async () => {
          onClose();
          const r = await act.addEventVendors(t.id, picked, live && mail);
          if (r) {
            toast.ok(`${picked.length} vendor(s) added`,
                     !live ? "They will be invited when this event is published."
                       : mail ? "They have been invited by email and can see the bid room now."
                              : "Nobody was emailed. They can see the bid room, and you can write to them from the event's vendor list.");
            onDone();
          }
        }}>Add {picked.length ? `${picked.length} vendor${picked.length === 1 ? "" : "s"}` : "vendors"}</button>
      </>
    }>
      <input className="in" autoFocus placeholder="Search the register by name, code or category…"
             aria-label="Search the vendor register" value={q} onChange={(e) => setQ(e.target.value)} />
      {live && (
        <div className="notice" style={{ marginTop: 10 }}>
          This event is already live, so anyone added now has less time to price than the vendors
          invited at publication — which is a fact the audit trail records.
          {/* The mail is a choice rather than a consequence of adding somebody.
              It stays ticked by default on a LIVE event: a vendor added to a
              running tender and never told has been given a deadline nobody
              mentioned, which is worse than an email they did not expect. On a
              draft there is nothing to tell them about and nothing is sent. */}
          <label className="checkline" style={{ marginTop: 8 }}>
            <input type="checkbox" checked={mail} onChange={(e) => setMail(e.target.checked)} />
            <span>Email them the invitation now</span>
          </label>
        </div>
      )}
      <div className="picklist" style={{ marginTop: 10 }}>
        {shown.map((s) => (
          <label key={s.id} className={"pickrow" + (picked.includes(s.id) ? " on" : "")}>
            <input type="checkbox" checked={picked.includes(s.id)} onChange={() => toggle(s.id)} />
            <span style={{ flex: 1 }}>
              <b>{s.name}</b>
              <span className="muted" style={{ fontSize: 11.5, display: "block" }}>
                {s.category}{s.location ? ` · ${s.location}` : ""}{s.code ? ` · ${s.code}` : ""}
              </span>
            </span>
            <StatusChip map={VERIFY_STATUS} value={s.verificationStatus
              || (s.prequalified ? "verified" : "unverified")} />
          </label>
        ))}
        {!shown.length && <Empty>{pool.length ? "No vendors match that search." : "Every vendor on the register is already invited."}</Empty>}
      </div>
      {unverified > 0 && (
        <div className="notice" style={{ marginTop: 10 }}>
          {unverified} of the vendors you picked {unverified === 1 ? "is" : "are"} unverified.
          That does not stop them bidding — it is recorded, and their bid is evaluated like any other.
        </div>
      )}
    </Dialog>
  );
}

/* ---------------- rounds ---------------- */

export function RoundsTab({ api, t }) {
  const { user, act, toast } = api;
  const rounds = roundsOf(t);
  const canManage = can(user, "tender.rounds") && !["awarded", "cancelled"].includes(t.status);
  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState(null);
  const explicit = (t.rounds || []).length > 0;
  const open = rounds.find((r) => r.status === "open");
  const canAddRound = canManage && !open && !["draft", "approval"].includes(t.status) && t.type !== "AUC";

  return (
    <div>
      {creating && <NewRoundDialog api={api} t={t} onClose={() => setCreating(false)} />}
      {cancelling && (
        <ReasonDialog title={`Cancel ${cancelling.name}?`} confirmLabel="Cancel the round" tone="wax"
                      placeholder="e.g. Only one vendor responded — the round is not competitive."
                      onClose={() => setCancelling(null)}
                      onConfirm={async (reason) => {
                        if (await act.cancelRound(cancelling.id, reason)) {
                          toast.ok(`${cancelling.name} cancelled`, "Its bidders have been told. Earlier rounds are untouched.");
                        }
                      }}>
          The round stops taking submissions and its bidders are told why. Submissions already made in
          this round are kept and stay sealed; earlier rounds are not affected.
        </ReasonDialog>
      )}

      <div className="pagehead" style={{ marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0 }}>Bidding rounds</h3>
          <span className="muted" style={{ fontSize: 12.5 }}>
            {explicit
              ? `${rounds.length} round(s) against one scope, one panel and one award.`
              : "This event is running as a single round. Open a second one for a best-and-final or a shortlist re-bid."}
          </span>
        </div>
        <span className="grow" />
        {canAddRound && <button className="btn sm pri" onClick={() => setCreating(true)}>
          <Icon n="plus" /> Open a new round
        </button>}
      </div>

      <div className="roundlist">
        {rounds.map((r) => {
          const isOpen = r.status === "open";
          const left = r.deadline ? r.deadline - nowMs() : null;
          return (
            <div key={r.id || "implicit"} className={"card roundcard" + (isOpen ? " on" : "")}>
              <div className="chead">
                <h3>{r.name}</h3>
                <RoundChip status={r.status} />
                {r.implicit && <span className="mono faint" style={{ marginLeft: 8 }}>the event's own window</span>}
                <span className="grow" />
                {canManage && !r.implicit && (r.status === "draft" || r.status === "upcoming") && (
                  <button className="btn sm pri" onClick={async () => {
                    if (await act.openRound(r.id)) {
                      toast.ok(`${r.name} open`, `${r.invitedCount} vendor(s) have been told it is open and when it closes.`);
                    }
                  }}>Open the round</button>
                )}
                {canManage && !r.implicit && isOpen && (
                  <button className="btn sm" style={{ marginLeft: 8 }} onClick={async () => {
                    if (await act.closeRound(r.id)) {
                      toast.ok(`${r.name} closed`, "Its submissions are sealed and ready for a recorded opening.");
                    }
                  }}>Close early</button>
                )}
                {canManage && !r.implicit && !["completed", "cancelled"].includes(r.status) && (
                  <button className="btn sm wax" style={{ marginLeft: 8 }} onClick={() => setCancelling(r)}>Cancel</button>
                )}
              </div>
              <div className="cbody" style={{ paddingTop: 6 }}>
                <div className="rowline"><span className="muted" style={{ flex: 1 }}>Submission window</span>
                  <span className="mono">
                    {r.opensAt ? fmtDate(r.opensAt) : "—"} → {r.deadline ? fmtDateTime(r.deadline) : "—"}
                  </span></div>
                {isOpen && left != null && (
                  <div className="rowline"><span className="muted" style={{ flex: 1 }}>Time remaining</span>
                    <span className="mono" style={{ color: left < 2 * DAY ? "var(--wax)" : undefined }}>
                      {left > 0 ? `${Math.ceil(left / DAY)} day(s)` : "closed"}
                    </span></div>
                )}
                <div className="rowline"><span className="muted" style={{ flex: 1 }}>Vendors in this round</span>
                  <span className="mono">{r.invitedCount}</span></div>
                {r.bidCount != null && (
                  <div className="rowline"><span className="muted" style={{ flex: 1 }}>Submissions received</span>
                    <span className="mono">{r.bidCount}</span></div>
                )}
                {r.openedAt && (
                  <div className="rowline"><span className="muted" style={{ flex: 1 }}>Opened</span>
                    <span className="mono">{fmtDateTime(r.openedAt)}</span></div>
                )}
                {r.instructions && <div className="aihint" style={{ marginTop: 8 }}>{r.instructions}</div>}
                {r.cancelReason && <div className="notice wax" style={{ marginTop: 8 }}>{r.cancelReason}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NewRoundDialog({ api, t, onClose }) {
  const { state, act, toast } = api;
  const rounds = roundsOf(t);
  const next = rounds.length + 1;
  const [name, setName] = useState(next === 2 ? "Best and final offer" : `Round ${next}`);
  const [when, setWhen] = useState(toInput(nowMs() + 7 * DAY));
  const [instructions, setInstructions] = useState("");
  const [shortlist, setShortlist] = useState([]);

  /* A later round is drawn from the vendors who bid in an earlier one. Adding
     somebody new here would let them price against a field that has already
     shown its hand, which is the whole reason later rounds are constrained. */
  const prior = [...new Set(state.bids.filter((b) => b.tenderId === t.id).map((b) => b.supplierId))];
  const ms = fromInput(when);
  const ok = ms > nowMs() && name.trim();

  return (
    <Dialog title={`Open ${name || `round ${next}`}`} onClose={onClose} footer={
      <>
        {!ok && <span className="hint gatehint">Give the round a name and a closing date in the future.</span>}
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={!ok} onClick={async () => {
          onClose();
          const r = await act.createRound(t.id, {
            name: name.trim(), deadline: ms, instructions: instructions.trim(),
            invited: shortlist.length ? shortlist : undefined,
          });
          if (r) toast.ok(`${name.trim()} created`, "It is drafted, not yet open. Open it when you are ready and its bidders are told.");
        }}>Create the round</button>
      </>
    }>
      A new round takes fresh submissions against the same scope, the same panel and the same award.
      Earlier rounds and their bids are kept exactly as they are.
      <div className="frow" style={{ marginTop: 10 }}>
        <label className="lbl" htmlFor="nr-name">Round name</label>
        <input id="nr-name" className="in" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <DateTimeField id="nr-when" label="Submissions close" value={when} onChange={setWhen} />
      <div className="frow">
        <label className="lbl" htmlFor="nr-inst">Instructions to bidders <span className="faint">optional</span></label>
        <textarea id="nr-inst" className="in" value={instructions} onChange={(e) => setInstructions(e.target.value)}
                  placeholder="e.g. Submit your best and final price for the same scope. Technical proposals already accepted stand — do not resubmit them." />
      </div>
      {prior.length > 0 && (
        <div className="frow">
          <label className="lbl">Who bids in this round</label>
          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
            Leave everything unticked to carry the whole invitation list forward. Tick a shortlist to
            run this round with fewer — it can only be drawn from vendors who bid in an earlier round.
          </div>
          <div className="picklist">
            {prior.map((sid) => {
              const s = state.suppliers.find((x) => x.id === sid);
              return (
                <label key={sid} className={"pickrow" + (shortlist.includes(sid) ? " on" : "")}>
                  <input type="checkbox" checked={shortlist.includes(sid)}
                         onChange={() => setShortlist((p) => p.includes(sid) ? p.filter((x) => x !== sid) : [...p, sid])} />
                  <span style={{ flex: 1 }}>{s ? s.name : sid}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </Dialog>
  );
}

/* ---------------- the bid bucket ---------------- */

/* Submissions grouped by round. The point is comparison across rounds: did the
   best-and-final actually move anybody's price, and by how much. */
export function BidBucket({ api, t }) {
  const { toast } = api;
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let live = true;
    raw(`/tenders/${t.id}/bucket/`)
      .then((d) => { if (live) setData(d); })
      .catch((e) => { if (live) setErr(e.message || "Could not load the submissions."); });
    return () => { live = false; };
  }, [t.id, t.openedAt, (t.rounds || []).length]);

  if (err) return <div className="notice wax">{err}</div>;
  if (!data) return <div className="card"><div className="cbody"><span className="muted">Loading submissions…</span></div></div>;

  const groups = data.groups || [];
  const total = groups.reduce((n, g) => n + g.bids.length, 0);
  if (!total) {
    return (
      <div className="card"><div className="cbody">
        <Empty icon="envelope">
          No submissions yet. Vendors' bids arrive sealed and stay sealed until the deadline passes
          and somebody records an opening.
        </Empty>
      </div></div>
    );
  }

  /* What each vendor bid, round by round, so a price that moved is visible as
     movement rather than as two numbers in two tables. */
  const byVendor = new Map();
  groups.forEach((g, gi) => g.bids.forEach((b) => {
    if (!byVendor.has(b.supplierId)) byVendor.set(b.supplierId, { name: b.supplierName, rounds: {} });
    byVendor.get(b.supplierId).rounds[b.roundNumber] = b;
  }));
  const roundNumbers = [...new Set(groups.map((g) => (g.round ? g.round.number : 1)))].sort((a, b) => a - b);
  const multi = roundNumbers.length > 1;

  return (
    <div>
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="chead"><h3>Where the bids landed</h3>
          <span className="mono faint" style={{ marginLeft: "auto" }}>
            {total} submission(s) across {roundNumbers.length} round(s)
          </span>
        </div>
        <div className="cbody" style={{ paddingTop: 0 }}>
          {groups.map((g, i) => {
            const r = g.round || { number: 1, name: "Round 1", status: "closed" };
            return (
              <div className="bucketgroup" key={r.id || i}>
                <div className="buckethead">
                  <b>{r.name || `Round ${r.number}`}</b>
                  <RoundChip status={r.status} />
                  <span className="mono faint">
                    {g.bids.length} of {r.invitedCount ?? "—"} invited
                    {r.deadline ? ` · closed ${fmtDate(r.deadline)}` : ""}
                  </span>
                </div>
                {g.bids.length === 0 ? (
                  <div className="muted" style={{ fontSize: 12.5, padding: "4px 0 10px" }}>
                    No submissions in this round.
                  </div>
                ) : (
                  <div className="bucketrows">
                    {g.bids.map((b) => (
                      <div className="bucketrow" key={b.id}>
                        <span className="bseal" aria-hidden="true" />
                        <span style={{ flex: 1 }}>
                          <b>{b.supplierName}</b>
                          <span className="mono faint" style={{ marginLeft: 8 }}>{fmtDateTime(b.submittedAt)}</span>
                          {b.disqualified && <span className="chip warn" style={{ marginLeft: 8 }}>Disqualified</span>}
                        </span>
                        {b.sealed || b.amount == null
                          ? <span className="mono waxfg" style={{ fontSize: 11, letterSpacing: ".1em" }}>SEALED</span>
                          : (
                            <>
                              <Money n={b.amount} strong />
                              {b.savings && (
                                <span className="mono faint" style={{ fontSize: 11, minWidth: 92, textAlign: "right" }}
                                      title={`Against the ${b.savings.basis}`}>
                                  {b.savings.savings >= 0 ? "−" : "+"}{fmtCompact(Math.abs(b.savings.savings))}
                                </span>
                              )}
                            </>
                          )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {multi && (
        <div className="card">
          <div className="chead"><h3>How prices moved between rounds</h3>
            <span className="mono faint" style={{ marginLeft: "auto" }}>what each round actually changed</span></div>
          <div className="tscroll">
            <table className="tbl wide">
              <thead>
                <tr>
                  <th>Vendor</th>
                  {roundNumbers.map((n) => <th key={n} className="num">R{n}</th>)}
                  <th className="num">Movement</th>
                </tr>
              </thead>
              <tbody>
                {[...byVendor.entries()].map(([sid, v]) => {
                  const priced = roundNumbers.map((n) => v.rounds[n]).filter((b) => b && b.amount != null);
                  const first = priced[0], last = priced[priced.length - 1];
                  const delta = first && last && first !== last ? last.amount - first.amount : null;
                  return (
                    <tr key={sid}>
                      <td><b>{v.name}</b></td>
                      {roundNumbers.map((n) => {
                        const b = v.rounds[n];
                        return (
                          <td key={n} className="num mono" data-l={`R${n}`}>
                            {!b ? <span className="muted">—</span>
                              : b.amount == null ? <span className="waxfg">sealed</span>
                              : fmtCompact(b.amount)}
                          </td>
                        );
                      })}
                      <td className="num mono" data-l="Movement"
                          style={{ color: delta == null ? undefined : delta < 0 ? "var(--green)" : "var(--wax)" }}>
                        {delta == null ? "—"
                          : delta === 0 ? "no change"
                          : `${delta < 0 ? "−" : "+"}${fmtCompact(Math.abs(delta))}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- vendor register: direct registration & suspension ------- */

export function RegisterVendorDialog({ api, onClose }) {
  const { act, toast, refresh } = api;
  const [f, setF] = useState({
    name: "", email: "", contactPerson: "", phone: "", category: "", subcategory: "",
    location: "", address: "", paymentTerms: "", code: "", invite: true,
  });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const ok = f.name.trim().length > 1 && (!f.email || f.email.includes("@"));

  const submit = async () => {
    setBusy(true); setProblem(null);
    try {
      const r = await raw("/suppliers/register/", { method: "POST", body: { ...f, name: f.name.trim() } });
      onClose();
      await refresh();
      toast.ok(`${r.name} added to the register`,
               f.email && f.invite
                 ? "They have a link to claim their account. They are unverified until you prequalify them."
                 : "They are unverified until you prequalify them, and cannot sign in until they have an email on file.");
    } catch (e) {
      setProblem(e.message || "Could not add this vendor.");
    }
    setBusy(false);
  };

  return (
    <Dialog wide title="Register a vendor" onClose={onClose} footer={
      <>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={!ok || busy} onClick={submit}>
          {busy ? "Adding…" : "Add to the register"}
        </button>
      </>
    }>
      You know the company; waiting for them to fill in a form is a week of nothing. They arrive
      <b> unverified</b>, which is what they are — somebody typed them in and nobody has checked them.
      That does not stop them being invited to bid.
      {problem && <div className="notice wax" style={{ marginTop: 10 }}>{problem}</div>}
      <div className="grid g2" style={{ marginTop: 10 }}>
        <div className="frow"><label className="lbl" htmlFor="rv-name">Registered company name</label>
          <input id="rv-name" className="in" autoFocus value={f.name} onChange={(e) => set("name", e.target.value)}
                 placeholder="e.g. Adeola Industrial Services Ltd" /></div>
        <div className="frow"><label className="lbl" htmlFor="rv-code">Vendor code <span className="faint">optional</span></label>
          <input id="rv-code" className="in" value={f.code} onChange={(e) => set("code", e.target.value)}
                 placeholder="e.g. V-01842" /></div>
        <div className="frow"><label className="lbl" htmlFor="rv-email">Contact email</label>
          <input id="rv-email" className="in" type="email" value={f.email} onChange={(e) => set("email", e.target.value)}
                 placeholder="tenders@company.com" /></div>
        <div className="frow"><label className="lbl" htmlFor="rv-person">Contact person</label>
          <input id="rv-person" className="in" value={f.contactPerson} onChange={(e) => set("contactPerson", e.target.value)} /></div>
        <div className="frow"><label className="lbl" htmlFor="rv-phone">Phone</label>
          <input id="rv-phone" className="in" value={f.phone} onChange={(e) => set("phone", e.target.value)} /></div>
        <div className="frow"><label className="lbl" htmlFor="rv-loc">Location</label>
          <input id="rv-loc" className="in" value={f.location} onChange={(e) => set("location", e.target.value)}
                 placeholder="e.g. Lagos" /></div>
        <div className="frow"><label className="lbl" htmlFor="rv-cat">Category</label>
          <input id="rv-cat" className="in" value={f.category} onChange={(e) => set("category", e.target.value)}
                 placeholder="e.g. Logistics" /></div>
        <div className="frow"><label className="lbl" htmlFor="rv-terms">Payment terms</label>
          <input id="rv-terms" className="in" value={f.paymentTerms} onChange={(e) => set("paymentTerms", e.target.value)}
                 placeholder="e.g. 30 days" /></div>
      </div>
      <div className="frow"><label className="lbl" htmlFor="rv-addr">Address</label>
        <input id="rv-addr" className="in" value={f.address} onChange={(e) => set("address", e.target.value)} /></div>
      <label className="checkline" style={{ marginTop: 6 }}>
        <input type="checkbox" checked={f.invite} disabled={!f.email}
               onChange={(e) => set("invite", e.target.checked)} />
        Email them a link to claim their account
        {!f.email && <span className="muted" style={{ marginLeft: 6 }}>— needs an email address</span>}
      </label>
    </Dialog>
  );
}

export function SuspendDialog({ api, supplier, onClose }) {
  const { act, toast } = api;
  const lifting = supplier.suspended;
  const [reason, setReason] = useState("");
  if (lifting) {
    return (
      <ConfirmDialog title={`Lift the suspension on ${supplier.name}?`} confirmLabel="Lift the suspension"
                     onClose={onClose}
                     onConfirm={async () => {
                       if (await act.suspendVendor(supplier.id, false)) {
                         toast.ok(`${supplier.name} reinstated`, "They can be invited to tenders again, and they have been told.");
                       }
                     }}>
        They become eligible for invitations again.
        {supplier.prequalified
          ? " They stay prequalified — a suspension never undid that."
          : " They remain unverified, as they were before the suspension."}
        <div className="notice" style={{ marginTop: 10 }}>
          Suspended {supplier.suspendedAt ? fmtDate(supplier.suspendedAt) : ""}: {supplier.suspendedReason}
        </div>
      </ConfirmDialog>
    );
  }
  return (
    <Dialog title={`Suspend ${supplier.name}`} onClose={onClose} footer={
      <>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn wax" disabled={!reason.trim()} onClick={async () => {
          onClose();
          if (await act.suspendVendor(supplier.id, true, reason.trim())) {
            toast.ok(`${supplier.name} suspended`, "They cannot be added to new events. Invitations they already hold stand.");
          }
        }}>Suspend & send the reason</button>
      </>
    }>
      They can no longer be added to events. Invitations they already hold are <b>not</b> withdrawn —
      pulling a bidder out of a live competition is a decision for that competition, and its page has
      the control for it.
      {supplier.prequalified && <><br /><br />Their prequalification is untouched: lifting the suspension
        brings them back verified rather than making them start again.</>}
      <textarea className="in" style={{ marginTop: 10 }} autoFocus value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Public liability policy lapsed on 12 August. Reinstate on proof of renewal." />
    </Dialog>
  );
}

/* ---------------- styles ---------------- */

export const LIFECYCLE_CSS = `
.lifebar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 14px;
  padding:9px 12px;border:1px solid var(--line);border-radius:var(--r);background:var(--card)}
.lifebar .lifelbl{margin-right:2px}
.lifebar .grow{flex:1}
@media (max-width:720px){.lifebar{padding:9px}.lifebar .lifelbl{display:none}}

.picklist{max-height:320px;overflow:auto;border:1px solid var(--line);border-radius:var(--r)}
.pickrow{display:flex;align-items:center;gap:10px;padding:9px 11px;cursor:pointer;
  border-bottom:1px solid var(--hair);font-size:13px}
.pickrow:last-child{border-bottom:0}
.pickrow:hover{background:var(--sunk)}
.pickrow.on{background:var(--green-tint)}

.roundlist{display:flex;flex-direction:column;gap:12px}
.roundcard.on{border-color:var(--chip-ok-line);box-shadow:0 0 0 1px var(--chip-ok-line) inset}

.bucketgroup{padding:12px 0;border-bottom:1px solid var(--hair)}
.bucketgroup:last-child{border-bottom:0;padding-bottom:2px}
.buckethead{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-bottom:8px}
.bucketrows{display:flex;flex-direction:column;gap:6px}
.bucketrow{display:flex;align-items:center;gap:10px;padding:8px 11px;font-size:13px;
  border:1px solid var(--hair);border-radius:var(--r);background:var(--sunk)}
.bucketrow .bseal{width:8px;height:8px;border-radius:50%;background:var(--wax);flex:0 0 auto}

.evalmoney{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:12px}
.evalmoney .em{flex:1;min-width:130px;padding:10px 12px;border:1px solid var(--line);
  border-radius:var(--r);background:var(--card)}
.evalmoney .em .k{font-family:var(--th-font);font-size:var(--th-size);letter-spacing:var(--th-ls);
  text-transform:uppercase;color:var(--muted);margin-bottom:4px}
.evalmoney .em .v{font-size:17px;font-weight:600;font-variant-numeric:tabular-nums}
`;
