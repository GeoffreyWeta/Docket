/* First-run setup: you, your company, your team. One sitting, no console.

   Built the way New tender is built. The form asks questions in the words a
   person would use, every field explains itself underneath, and the panel on
   the right says what is still missing and jumps you to it. The button is
   disabled until it can succeed, and it is never disabled silently.

   Three steps, but one form: nothing is saved until the end, so going back
   costs nothing and there is no half-made workspace to clean up if somebody
   closes the tab. When it does save, the person lands signed in on their own
   dashboard - not on a sign-in page asking for the password they just typed. */
import React, { useEffect, useRef, useState } from "react";

import { setupStatus, setupWorkspace } from "./api";
import { DRAFT_CSS } from "./buyer";
import { fmtMoney } from "./helpers";
import { ICON_CSS, Icon } from "./icons";
import { ILLUS_CSS, Illus } from "./illus";
import { MOTION_CSS, reducedMotion } from "./motion";
import { PAGE_CSS } from "./page";
import { CSS, EXTRA_CSS, THEME_CSS } from "./styles";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ROLES = [
  ["approver",    "Approver",    "Signs off publications above the threshold, and every award."],
  ["evaluator",   "Evaluator",   "Scores bids on their own. Never sees another member's numbers."],
  ["procurement", "Procurement", "Drafts tenders, invites vendors, opens the sealed bids."],
  ["auditor",     "Auditor",     "Reads everything, changes nothing."],
];

const SETUP_CSS = `
.setupwrap{min-height:100vh;background:var(--page);padding:28px 16px 48px;color:var(--ink)}
.setupin{max-width:1040px;margin:0 auto}
.setuplogo{display:flex;align-items:center;gap:9px;font-weight:700;letter-spacing:.06em;margin-bottom:22px;font-size:13px}
.setuplogo .seal{width:22px;height:22px;border-radius:50%;background:var(--green);display:inline-block;
  box-shadow:inset 0 0 0 3px var(--card),inset 0 0 0 4px var(--green)}
.steps{display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap}
.step{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;color:var(--faint);padding:6px 10px;
  border-radius:999px;border:1px solid transparent;background:transparent;font:inherit;cursor:pointer}
.step b{display:inline-flex;width:18px;height:18px;border-radius:50%;align-items:center;justify-content:center;
  font-size:11px;background:var(--sunk);color:var(--muted);border:1px solid var(--line)}
.step.on{color:var(--ink);border-color:var(--line);background:var(--card)}
.step.on b{background:var(--green);color:var(--on-brand);border-color:var(--green)}
.step.done b{background:var(--green-tint);color:var(--green);border-color:var(--green-2)}
.teamrow{display:grid;grid-template-columns:minmax(0,1fr) 170px 36px;gap:8px;align-items:center;margin-bottom:8px}
.roleopt{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:6px}
.rolecard{border:1px solid var(--line);border-radius:10px;padding:10px 12px;font-size:12.5px;color:var(--muted);
  background:var(--card);line-height:1.45}
.rolecard b{display:block;color:var(--ink);font-size:13px;margin-bottom:2px}
.donelinks .lrow{padding:10px 0}
@media(max-width:700px){.teamrow{grid-template-columns:minmax(0,1fr) 36px}.teamrow select{grid-column:1/-1}.roleopt{grid-template-columns:1fr}}
`;

export function SetupWorkspace({ onDone, onLoggedIn }) {
  const [status, setStatus] = useState(null);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState(null);
  const [f, setF] = useState({
    name: "", email: "", password: "",
    company: "", short: "", threshold: "50000000",
    team: [{ id: 1, email: "", role: "approver" }],
  });
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const nextId = useRef(2);

  useEffect(() => {
    setupStatus().then(setStatus).catch(() => setStatus({ open: true, demo: false }));
  }, []);

  /* the eight conditions, each one able to say what to do about it */
  const teamRows = f.team.filter((r) => r.email.trim());
  const badTeam = teamRows.find((r) => !EMAIL.test(r.email.trim()) || r.email.trim().toLowerCase() === f.email.trim().toLowerCase());
  const checks = [
    { key: "name",    step: 0, ok: f.name.trim().length >= 2, to: "su-name",
      todo: "Tell us your name", done: "You are " + f.name.trim() },
    { key: "email",   step: 0, ok: EMAIL.test(f.email.trim()), to: "su-email",
      todo: "Enter your work email", done: f.email.trim(), note: "It becomes your sign-in." },
    { key: "pw",      step: 0, ok: f.password.length >= 8, to: "su-pw",
      todo: "Choose a password", done: "Password set", note: "At least 8 characters." },
    { key: "company", step: 1, ok: f.company.trim().length >= 2, to: "su-company",
      todo: "Name your company", done: f.company.trim(), note: "It goes on every letter and reference." },
    { key: "thr",     step: 1, ok: Number(f.threshold) >= 0 && f.threshold !== "", to: "su-thr",
      todo: "Set the sign-off rule", done: Number(f.threshold) > 0
        ? "Approver signs off from " + fmtMoney(Number(f.threshold)) : "Everything publishes straight away",
      note: "You can change it later." },
    { key: "team",    step: 2, ok: !badTeam, to: "su-team",
      todo: badTeam ? (badTeam.email.trim().toLowerCase() === f.email.trim().toLowerCase()
                        ? "You do not need to invite yourself" : "Fix an email in your team list")
                    : "Team list looks fine",
      done: teamRows.length ? teamRows.length + (teamRows.length === 1 ? " person invited" : " people invited") : "No invitations yet, that is fine",
      note: teamRows.some((r) => r.role === "approver") ? undefined : "Without an approver, nothing above the threshold can publish." },
  ];
  const outstanding = checks.filter((c) => !c.ok);
  const ready = outstanding.length === 0;
  const stepOk = (i) => checks.filter((c) => c.step === i).every((c) => c.ok);

  const jump = (c) => {
    setStep(c.step);
    setTimeout(() => {
      const el = document.getElementById(c.to);
      if (!el) return;
      el.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
      el.classList.remove("jumped"); void el.offsetWidth; el.classList.add("jumped");
      const inp = el.matches("input,select") ? el : el.querySelector("input,select");
      if (inp) inp.focus({ preventScroll: true });
    }, 30);
  };

  const submit = async () => {
    setBusy(true); setMsg("");
    try {
      const r = await setupWorkspace({
        name: f.name.trim(), email: f.email.trim().toLowerCase(), password: f.password,
        company: f.company.trim(), short: f.short.trim(),
        approvalThreshold: Number(f.threshold) || 0,
        team: teamRows.map((r) => ({ email: r.email.trim().toLowerCase(), role: r.role })),
      });
      setDone(r);
    } catch (e) { setMsg(e.message || "Something went wrong."); }
    setBusy(false);
  };

  const enter = () => {
    if (done) onLoggedIn(done, f.email.trim().toLowerCase());
  };

  const css = CSS + EXTRA_CSS + THEME_CSS + MOTION_CSS + ICON_CSS + ILLUS_CSS + DRAFT_CSS + PAGE_CSS + SETUP_CSS;

  if (status && status.open === false) {
    return (
      <div className="setupwrap"><style>{css}</style><div className="setupin" style={{ maxWidth: 520 }}>
        <div className="setuplogo"><span className="seal" aria-hidden="true" />DOCKET</div>
        <div className="guidebox"><div className="guidetop">
          <Illus n="clear" w={148} />
          <div className="guidehl">{status.orgName} is already set up</div>
          <div className="guidewhy">Ask a colleague to invite you. The link they send lets you set your own password.</div>
        </div><div className="guidefoot"><button className="btn pri" onClick={onDone}>Back to sign in</button></div></div>
      </div></div>
    );
  }

  if (done) {
    const withLinks = (done.invited || []).filter((i) => i.link);
    return (
      <div className="setupwrap"><style>{css}</style><div className="setupin" style={{ maxWidth: 560 }}>
        <div className="setuplogo"><span className="seal" aria-hidden="true" />DOCKET</div>
        <div className="guidebox good">
          <div className="guidetop">
            <Illus n="draft" w={148} />
            <div className="guidehl">{done.company} is ready</div>
            <div className="guidewhy">
              You are signed in as {f.name.trim()}.
              {done.invited?.length ? ` ${done.invited.length} ${done.invited.length === 1 ? "invitation is" : "invitations are"} on their way; each link is valid for three days.` : " Invite your team any time from the Team page."}
            </div>
          </div>
          {withLinks.length > 0 && (
            <div className="cbody donelinks">
              <div className="hint" style={{ marginTop: 0, marginBottom: 8 }}>
                Demo mode: email prints to the server log, so here are the links to try the flow yourself.
              </div>
              {withLinks.map((i) => (
                <div className="lrow" key={i.email}>
                  <div className="lrmain"><div className="lrtitle">{i.email}</div>
                    <div className="lrmeta"><span>{i.roleLabel}</span><span className="mono" style={{ wordBreak: "break-all" }}>{i.link}</span></div></div>
                </div>
              ))}
            </div>
          )}
          <div className="guidefoot">
            <button className="btn pri" onClick={enter}>Go to your workspace</button>
          </div>
        </div>
      </div></div>
    );
  }

  const guide = (
    <aside className={"ready" + (ready ? " done" : "")} aria-live="polite">
      <div className="readytop">
        <Illus n="draft" w={148} />
        <div className="readyhl">{ready ? "Ready to create your workspace" : outstanding.length === 1 ? "One thing left" : outstanding.length + " things left"}</div>
        <div className="readywhy">{ready ? "Nothing is saved until you press the button." : "Pick any line to jump straight to it."}</div>
        <div className="readybar"><i style={{ width: Math.round((checks.length - outstanding.length) / checks.length * 100) + "%" }} /></div>
      </div>
      <ul className="readylist">
        {[...outstanding, ...checks.filter((c) => c.ok)].map((c) => (
          <li key={c.key} className={c.ok ? "ok" : "todo"}>
            <button type="button" tabIndex={c.ok ? -1 : 0} onClick={() => { if (!c.ok) jump(c); }}>
              <span className="readytick" aria-hidden="true"><Icon n="check" s={11} /></span>
              <span>{c.ok ? c.done : c.todo}{!c.ok && c.note && <em>{c.note}</em>}{c.ok && c.key === "team" && c.note && <em>{c.note}</em>}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="readyfoot">
        <button className="btn pri" disabled={!ready || busy} onClick={submit}>{busy ? "Creating…" : "Create the workspace"}</button>
        {msg && <div className="notice" style={{ borderLeft: "3px solid var(--wax)", margin: 0, textAlign: "left" }}>{msg}</div>}
        <button className="btn" onClick={onDone}>Back to sign in</button>
      </div>
    </aside>
  );

  return (
    <div className="setupwrap"><style>{css}</style><div className="setupin">
      <div className="setuplogo"><span className="seal" aria-hidden="true" />DOCKET</div>
      <div className="pagehead">
        <h1>Set up your workspace</h1>
        <span className="sub">Three short steps. Nothing is saved until the end, so you can go back freely.</span>
      </div>
      {status?.demo && !status.needsSetup && (
        <div className="notice" style={{ marginBottom: 14 }}>
          This is a demo workspace, so setting it up creates your account alongside the demo ones and renames the company. Resetting the demo undoes it.
        </div>
      )}
      <div className="steps" role="tablist">
        {["You", "Your company", "Your team"].map((label, i) => (
          <button key={label} role="tab" aria-selected={step === i}
                  className={"step" + (step === i ? " on" : "") + (stepOk(i) && step !== i ? " done" : "")}
                  onClick={() => setStep(i)}>
            <b>{stepOk(i) && step !== i ? <Icon n="check" s={10} /> : i + 1}</b>{label}
          </button>
        ))}
      </div>

      <div className="ntcols">
        <div>
          {step === 0 && (
            <div className="card">
              <div className="chead"><h3>About you</h3></div>
              <div className="cbody">
                <div className="frow"><label className="lbl" htmlFor="su-name">What is your name?</label>
                  <input id="su-name" className="in" autoFocus value={f.name} onChange={(e) => set("name", e.target.value)} />
                  <div className="hint">As it should appear on letters and in the audit trail.</div></div>
                <div className="frow"><label className="lbl" htmlFor="su-email">Your work email</label>
                  <input id="su-email" className="in" type="email" autoComplete="username" value={f.email} onChange={(e) => set("email", e.target.value)} />
                  <div className="hint">This becomes your sign-in. Invitations you send will come from it.</div></div>
                <div className="frow" style={{ marginBottom: 0 }}><label className="lbl" htmlFor="su-pw">Choose a password</label>
                  <input id="su-pw" className="in" type="password" autoComplete="new-password" value={f.password} onChange={(e) => set("password", e.target.value)} />
                  <div className="hint">At least 8 characters. You can turn on an authenticator app later from Security.</div></div>
              </div>
              <div className="cbody" style={{ borderTop: "1px solid var(--line)", display: "flex", justifyContent: "flex-end" }}>
                <button className="btn pri" onClick={() => setStep(1)} disabled={!stepOk(0)}>Next: your company</button>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="card">
              <div className="chead"><h3>Your company</h3></div>
              <div className="cbody">
                <div className="frow"><label className="lbl" htmlFor="su-company">What is the company called?</label>
                  <input id="su-company" className="in" autoFocus placeholder="e.g. Kestrel Hospitality Group" value={f.company}
                         onChange={(e) => set("company", e.target.value)} />
                  <div className="hint">Goes on award letters, memos and every tender reference.</div></div>
                <div className="frow"><label className="lbl" htmlFor="su-short">Short name <span className="faint">optional</span></label>
                  <input id="su-short" className="in" placeholder={f.company.trim().split(/\s+/)[0] || "e.g. Kestrel"} value={f.short}
                         onChange={(e) => set("short", e.target.value)} />
                  <div className="hint">Tender references start with its first three letters, like {(((f.short || f.company).trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3)) || "ORG") + "-2026-001"}.</div></div>
                <div className="frow" style={{ marginBottom: 0 }} id="su-thr"><label className="lbl" htmlFor="su-thr-in">When does a tender need an approver's signature?</label>
                  <input id="su-thr-in" className="in" type="number" min="0" step="1000000" value={f.threshold} onChange={(e) => set("threshold", e.target.value)} />
                  <div className="hint">
                    In naira. A tender at or above this amount comes to an approver before it publishes; below it,
                    procurement publishes directly. Awards always need an approver. Set 0 to send nothing for sign-off.
                  </div></div>
              </div>
              <div className="cbody" style={{ borderTop: "1px solid var(--line)", display: "flex", justifyContent: "space-between", gap: 8 }}>
                <button className="btn" onClick={() => setStep(0)}>Back</button>
                <button className="btn pri" onClick={() => setStep(2)} disabled={!stepOk(1)}>Next: your team</button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="card" id="su-team">
              <div className="chead"><h3>Who works with you?</h3><span className="hint" style={{ marginLeft: "auto", marginTop: 0 }}>optional, you can do this later</span></div>
              <div className="cbody">
                <div className="hint" style={{ marginTop: 0, marginBottom: 12 }}>
                  Each person gets an email with a link to set their own password. Separation of duties is enforced by the
                  server: an evaluator cannot publish or award, an approver cannot score, an auditor cannot change anything.
                </div>
                {f.team.map((r) => (
                  <div className="teamrow" key={r.id}>
                    <input className="in" type="email" placeholder="colleague@company.com" aria-label="Work email" value={r.email}
                           onChange={(e) => set("team", f.team.map((x) => x.id === r.id ? { ...x, email: e.target.value } : x))} />
                    <select className="in" aria-label="Role" value={r.role}
                            onChange={(e) => set("team", f.team.map((x) => x.id === r.id ? { ...x, role: e.target.value } : x))}>
                      {ROLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                    <button className="btn sm" aria-label="Remove" disabled={f.team.length < 2}
                            onClick={() => set("team", f.team.filter((x) => x.id !== r.id))}><Icon n="close" s={13} /></button>
                  </div>
                ))}
                <button className="btn sm" onClick={() => set("team", [...f.team, { id: nextId.current++, email: "", role: "evaluator" }])}>Add another person</button>
                <div className="roleopt">
                  {ROLES.map(([k, l, d]) => <div className="rolecard" key={k}><b>{l}</b>{d}</div>)}
                </div>
              </div>
              <div className="cbody" style={{ borderTop: "1px solid var(--line)", display: "flex", justifyContent: "space-between", gap: 8 }}>
                <button className="btn" onClick={() => setStep(1)}>Back</button>
                <span className="hint" style={{ marginTop: 0, alignSelf: "center" }}>{ready ? "Use the button on the right to finish." : "The panel on the right lists what is still missing."}</span>
              </div>
            </div>
          )}
        </div>
        {guide}
      </div>
    </div></div>
  );
}
