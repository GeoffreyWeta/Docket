/* Public screens reached from the login page or emailed links:
   vendor registration, invite acceptance, password reset. */
import React, { useEffect, useState } from "react";

import { acceptInvite, forgotPassword, registerVendor, resetPassword, verifyVendor } from "./api";
import { ICON_CSS } from "./icons";
import { MOTION_CSS } from "./motion";
import { CSS, EXTRA_CSS, THEME_CSS } from "./styles";

function Shell({ title, sub, children }) {
  return (
    <div className="loginwrap">
      <style>{CSS + EXTRA_CSS + THEME_CSS + MOTION_CSS + ICON_CSS}</style>
      <div className="logincard">
        <div className="loginlogo"><span className="seal" aria-hidden="true" /><b>DOCKET</b></div>
        <div className="card">
          <div className="chead"><h3>{title}</h3>{sub && <span className="mono faint" style={{ marginLeft: "auto" }}>{sub}</span>}</div>
          <div className="cbody">{children}</div>
        </div>
      </div>
    </div>
  );
}

const Field = ({ label, children }) => (
  <div className="frow"><label className="lbl">{label}</label>{children}</div>
);

export function RegisterVendor({ onDone }) {
  const [f, setF] = useState({ company: "", email: "", password: "", category: "", location: "" });
  const [msg, setMsg] = useState("");
  const [state, setState] = useState("form"); // form | sent | verified
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async () => {
    setBusy(true); setMsg("");
    try {
      const r = await registerVendor(f);
      setState(r.verified ? "verified" : "sent");
    } catch (e) { setMsg(e.message); }
    setBusy(false);
  };
  if (state === "sent") return (
    <Shell title="Check your email" sub="vendor registration">
      <p style={{ fontSize: 13.5, lineHeight: 1.6 }}>We sent a confirmation link to <b>{f.email}</b>. Click it to activate your account — then sign in and upload your compliance documents for prequalification.</p>
      <button className="btn" onClick={onDone}>Back to sign in</button>
    </Shell>
  );
  if (state === "verified") return (
    <Shell title="You're registered" sub="vendor registration">
      <p style={{ fontSize: 13.5, lineHeight: 1.6 }}>
        <b>{f.company}</b> now has a DOCKET account. Sign in with <b>{f.email}</b>, upload your compliance
        documents (tax clearance, certifications) from your company profile, and the procurement team will
        review your prequalification. You'll be notified of the outcome.
      </p>
      <button className="btn pri" onClick={onDone}>Sign in</button>
    </Shell>
  );
  return (
    <Shell title="Register your company" sub="vendor onboarding">
      <Field label="Registered company name"><input className="in" value={f.company} onChange={set("company")} /></Field>
      <Field label="Work email — this becomes your username"><input className="in" value={f.email} onChange={set("email")} /></Field>
      <Field label="Password (8+ characters)"><input className="in" type="password" value={f.password} onChange={set("password")} /></Field>
      <Field label="What you supply"><input className="in" placeholder="e.g. Produce, Logistics, Equipment" value={f.category} onChange={set("category")} /></Field>
      <Field label="Location"><input className="in" placeholder="City" value={f.location} onChange={set("location")} /></Field>
      {msg && <div className="notice" style={{ borderLeft: "3px solid var(--wax)", marginBottom: 12 }}>{msg}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn pri" style={{ flex: 1 }} disabled={busy} onClick={submit}>Register</button>
        <button className="btn" onClick={onDone}>Cancel</button>
      </div>
      <div className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>
        After registering you'll upload compliance documents; the buyer's procurement team reviews them before you can be invited to tenders.
      </div>
    </Shell>
  );
}

export function VerifyVendor({ token, onDone }) {
  const [state, setState] = useState("busy");
  const [msg, setMsg] = useState("");
  useEffect(() => {
    verifyVendor(token).then(() => setState("ok")).catch((e) => { setMsg(e.message); setState("bad"); });
  }, [token]);
  return (
    <Shell title={state === "ok" ? "Email confirmed" : state === "bad" ? "Link problem" : "Confirming…"} sub="vendor registration">
      {state === "ok" && <p style={{ fontSize: 13.5, lineHeight: 1.6 }}>Your account is active. Sign in, then upload your compliance documents from your company profile.</p>}
      {state === "bad" && <p style={{ fontSize: 13.5, lineHeight: 1.6 }}>{msg}</p>}
      {state !== "busy" && <button className="btn pri" onClick={onDone}>Go to sign in</button>}
    </Shell>
  );
}

export function AcceptInvite({ token, onDone }) {
  const [f, setF] = useState({ name: "", password: "" });
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState(false);
  const submit = async () => {
    setMsg("");
    try { await acceptInvite({ token, ...f }); setOk(true); } catch (e) { setMsg(e.message); }
  };
  if (ok) return (
    <Shell title="Welcome aboard" sub="team invitation">
      <p style={{ fontSize: 13.5, lineHeight: 1.6 }}>Your account is ready — sign in with your email address and the password you just set.</p>
      <button className="btn pri" onClick={onDone}>Sign in</button>
    </Shell>
  );
  return (
    <Shell title="Join the workspace" sub="team invitation">
      <Field label="Your full name"><input className="in" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="Choose a password (8+ characters)"><input className="in" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
      {msg && <div className="notice" style={{ borderLeft: "3px solid var(--wax)", marginBottom: 12 }}>{msg}</div>}
      <button className="btn pri" style={{ width: "100%" }} onClick={submit}>Create my account</button>
    </Shell>
  );
}

export function ForgotPassword({ onDone }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const submit = async () => { try { await forgotPassword(email); } catch (e) { /* same response either way */ } setSent(true); };
  return (
    <Shell title="Reset your password" sub="account recovery">
      {sent ? (
        <>
          <p style={{ fontSize: 13.5, lineHeight: 1.6 }}>If an account exists for <b>{email}</b>, a reset link is on its way. It's valid for 3 days.</p>
          <button className="btn" onClick={onDone}>Back to sign in</button>
        </>
      ) : (
        <>
          <Field label="Your account email"><input className="in" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} /></Field>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn pri" style={{ flex: 1 }} onClick={submit} disabled={!email.trim()}>Send reset link</button>
            <button className="btn" onClick={onDone}>Cancel</button>
          </div>
        </>
      )}
    </Shell>
  );
}

export function ResetPassword({ token, onDone }) {
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState(false);
  const submit = async () => {
    setMsg("");
    try { await resetPassword(token, pw); setOk(true); } catch (e) { setMsg(e.message); }
  };
  return (
    <Shell title={ok ? "Password changed" : "Choose a new password"} sub="account recovery">
      {ok ? (
        <>
          <p style={{ fontSize: 13.5, lineHeight: 1.6 }}>Every signed-in session was signed out for safety. Use your new password to sign in.</p>
          <button className="btn pri" onClick={onDone}>Sign in</button>
        </>
      ) : (
        <>
          <Field label="New password (8+ characters)"><input className="in" type="password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} /></Field>
          {msg && <div className="notice" style={{ borderLeft: "3px solid var(--wax)", marginBottom: 12 }}>{msg}</div>}
          <button className="btn pri" style={{ width: "100%" }} onClick={submit}>Set password</button>
        </>
      )}
    </Shell>
  );
}
