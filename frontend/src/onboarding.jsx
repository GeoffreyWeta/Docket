/* Public screens reached from the login page or emailed links:
   vendor registration, invite acceptance, password reset. */
import React, { useEffect, useRef, useState } from "react";

import {
  acceptInvite, claimVendor, forgotPassword, inDemo, lookupClaim, raw, registerVendor,
  resetPassword, storeAuth, verifyVendor,
} from "./api";
import { CategorySelect, LocationSelect } from "./fields";
import { ICON_CSS } from "./icons";
import { MOTION_CSS } from "./motion";
import { CSS, EXTRA_CSS, THEME_CSS } from "./styles";
import { STUDIO_CSS } from "./studio";

const CLAIM_CSS = `
.claimcard{background:var(--sunk);border:1px solid var(--line);border-radius:10px;
  padding:14px 15px;margin-bottom:18px}
.claimname{font-size:16px;font-weight:600;color:var(--ink);line-height:1.3}
.claimmeta{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-top:8px;font-size:11.5px}
.claimnote{font-size:12.5px;color:var(--muted);line-height:1.6;margin-top:11px}
`;

/* STUDIO_CSS travels with every self-assembled stylesheet.

   This screen returns before App renders ALL_CSS, so it builds its own sheet
   and gets only what is listed here. Leave STUDIO_CSS off and the deployment's
   chosen layout stops at the door: the front page and the workspace wear it,
   and the one screen in between - the first screen a new customer ever sees -
   falls back to the house tokens. The layout attribute is already on <html>,
   set by App before any of these early returns; only the rules were missing. */
function Shell({ title, sub, children }) {
  return (
    <main className="loginwrap">
      <style>{CSS + EXTRA_CSS + THEME_CSS + MOTION_CSS + ICON_CSS + CLAIM_CSS + STUDIO_CSS}</style>
      <div className="logincard">
        <div className="loginlogo"><span className="seal" aria-hidden="true" /><b>DOCKET</b></div>
        <div className="card">
          <div className="chead"><h1 className="public-title">{title}</h1>{sub && <span className="mono faint" style={{ marginLeft: "auto" }}>{sub}</span>}</div>
          <div className="cbody">{children}</div>
        </div>
      </div>
    </main>
  );
}

const Field = ({ id, label, children }) => (
  <div className="frow"><label className="lbl" htmlFor={id}>{label}</label>{children}</div>
);

export function RegisterVendor({ onDone }) {
  const [f, setF] = useState({ company: "", email: "", password: "", category: "", location: "" });
  const [msg, setMsg] = useState("");
  const [state, setState] = useState("form"); // form | sent | verified
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const pick = (k) => (v) => setF({ ...f, [k]: v });
  const submit = async () => {
    setBusy(true); setMsg("");
    try {
      const r = await registerVendor(f);
      setState(r.verified ? "verified" : r.claim ? "claim" : "sent");
    } catch (e) { setMsg(e.message); }
    setBusy(false);
  };
  if (state === "sent") return (
    <Shell title="Check your email" sub="vendor registration">
      <p style={{ fontSize: 13.5, lineHeight: 1.6 }}>We sent a confirmation link to <b>{f.email}</b>. Click it to activate your account, then sign in and upload your compliance documents for prequalification.</p>
      <button className="btn" onClick={onDone}>Back to sign in</button>
    </Shell>
  );
  /* The address is already on the buyer's vendor list. A second record would
     split the company's history in two, so the server emailed the claim link
     for the one that exists instead. */
  if (state === "claim") return (
    <Shell title="Check your email" sub="vendor registration">
      <p style={{ fontSize: 13.5, lineHeight: 1.6 }}>
        Your company is already on the vendor list. We sent a link to <b>{f.email}</b>. Open it to
        set your password and sign in. There is no need to register again.
      </p>
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
      <Field id="rv-company" label="Registered company name">
        <input id="rv-company" className="in" autoComplete="organization" value={f.company} onChange={set("company")} /></Field>
      <Field id="rv-email" label="Work email (this becomes your username)">
        <input id="rv-email" className="in" type="email" inputMode="email" autoComplete="email"
               value={f.email} onChange={set("email")} /></Field>
      <Field id="rv-pw" label="Password (8+ characters)">
        <input id="rv-pw" className="in" type="password" autoComplete="new-password" value={f.password} onChange={set("password")} /></Field>
      <Field id="rv-cat" label="What you supply"><CategorySelect id="rv-cat" value={f.category} onChange={pick("category")} required /></Field>
      <Field id="rv-loc" label="Location"><LocationSelect id="rv-loc" value={f.location} onChange={pick("location")} required /></Field>
      {msg && <div className="notice" style={{ borderLeft: "3px solid var(--wax)", marginBottom: 12 }}>{msg}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn pri" style={{ flex: 1 }} disabled={busy} onClick={submit}>Register</button>
        <button className="btn" onClick={onDone}>Cancel</button>
      </div>
      <div className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>
        After registering you'll upload compliance documents for the buyer's procurement team to review. You can bid on tenders you're invited to while they are reviewed.
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

/* Claiming an account against a vendor record that already exists.

   A vendor arriving from the registration drive must not be shown the ordinary
   sign-up form: they would type their company name again and create a second
   record for a company the buyer already has on the register. At the scale a
   drive runs at, that is not an edge case - it is over a thousand duplicates.

   So this screen tells them who they are before it asks for anything. The only
   field is a password: the company, the email and the vendor code all come from
   the register, and the token is what proves the claim. */
export function ClaimVendor({ token, onDone, onLoggedIn }) {
  const [sup, setSup] = useState(null);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState("");
  const [state, setState] = useState("loading");   // loading | form | done | bad
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    lookupClaim(token)
      .then((r) => { setSup(r.supplier); setState("form"); })
      .catch((e) => { setMsg(e.message); setState("bad"); });
  }, [token]);

  const submit = async () => {
    if (pw !== pw2) { setMsg("The two passwords don't match."); return; }
    setBusy(true); setMsg("");
    try {
      await claimVendor(token, pw);
      /* A newly claimed account uses its password, including in the demo.
         Passwordless access is reserved for the prepared demo personas. */
      if (inDemo() && onLoggedIn && sup && sup.email) {
        try {
          const res = await raw("/auth/login/", {method:"POST", body:{username:sup.email,password:pw,asBidder:true}});
          onLoggedIn(res, sup.email);
          return;
        } catch (e) { /* fall through to the done screen */ }
      }
      setState("done");
    } catch (e) { setMsg(e.message); }
    setBusy(false);
  };

  if (state === "loading") {
    return <Shell title="Checking your invitation…" sub="vendor registration" />;
  }
  if (state === "bad") {
    return (
      <Shell title="Link problem" sub="vendor registration">
        <p style={{ fontSize: 13.5, lineHeight: 1.6 }}>{msg}</p>
        <button className="btn pri" onClick={onDone}>Go to sign in</button>
      </Shell>
    );
  }
  if (state === "done") {
    return (
      <Shell title="You're registered" sub="bidder account">
        <p style={{ fontSize: 13.5, lineHeight: 1.6 }}>
          <b>{sup.name}</b> now has a DOCKET account. Sign in with <b>{sup.email}</b>, then
          open your auction invitations. Individuals and companies can bid; read each event's
          terms before accepting them. Company compliance documents are required only where the organiser asks for them.
        </p>
        <button className="btn pri" onClick={onDone}>Sign in</button>
      </Shell>
    );
  }

  return (
    <Shell title="Claim your account" sub="bidder account">
      {/* Naming the record they are claiming, before anything is typed. */}
      <div className="claimcard">
        <div className="claimname">{sup.name}</div>
        <div className="claimmeta">
          {sup.code ? <span className="chip">Vendor code {sup.code}</span> : null}
          <span className="chip">{sup.category}</span>
          {sup.subcategory ? <span className="chip">{sup.subcategory}</span> : null}
          {sup.location ? <span className="faint">{sup.location}</span> : null}
        </div>
        <div className="claimnote">
          You're already on the register. Setting a password here attaches a login to that
          existing record - nothing is duplicated, and your vendor code and history stay
          as they are.
        </div>
      </div>

      <Field id="cv-email" label="Your sign-in email">
        <input id="cv-email" className="in" type="email" autoComplete="username" value={sup.email} disabled readOnly />
      </Field>
      <div className="hint" style={{ marginTop: -8, marginBottom: 12 }}>
        This is the address the register holds for you. If it's wrong, reply to the
        invitation and ask the buyer to correct it before you register.
      </div>
      {sup.existingAccount && <p className="hint">You already have a DOCKET account. Enter your existing password below; it will stay unchanged. After registration, select “Sign in as an invited bidder” to bid separately from your workplace role.</p>}
      <Field id="cv-pw" label={sup.existingAccount ? "Your existing DOCKET password" : "Choose a password"}>
        <input id="cv-pw" className="in" type="password" autoComplete="new-password" value={pw}
               placeholder="At least 8 characters" onChange={(e) => setPw(e.target.value)} />
      </Field>
      <Field id="cv-pw2" label="Confirm it">
        <input id="cv-pw2" className="in" type="password" autoComplete="new-password" value={pw2}
               onChange={(e) => setPw2(e.target.value)}
               onKeyDown={(e) => { if (e.key === "Enter" && pw.length >= 8) submit(); }} />
      </Field>
      {msg && <div className="notice warn" style={{ marginBottom: 12 }}>{msg}</div>}
      <button className="btn pri" onClick={submit} disabled={pw.length < 8 || busy}>
        {busy ? "Creating your account…" : "Create my account"}
      </button>
      <button className="btn" style={{ marginLeft: 8 }} onClick={onDone}>Cancel</button>
    </Shell>
  );
}

/* The link is checked before the form is shown, so somebody with an expired
   or already-used link is told so before typing a password. Accepting signs
   the person straight in: they have just chosen the password. */
export function AcceptInvite({ token, onDone, onSignedIn, onForgot }) {
  const [info, setInfo] = useState(null);
  const [f, setF] = useState({ name: "", password: "", password2: "" });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    raw(`/register/invite_info/?token=${encodeURIComponent(token || "")}`)
      .then((r) => { setInfo(r); if (r.name) setF((x) => ({ ...x, name: x.name || r.name })); })
      .catch(() => setInfo({ state: "ok" }));   // could not check: let the form try
  }, [token]);
  const submit = async () => {
    setMsg(""); setBusy(true);
    try {
      const r = await acceptInvite({ token, name: f.name, password: f.password });
      if (r.token) {
        if (onSignedIn) { onSignedIn(r, info && info.email); return; }
        storeAuth(r.token, info && info.email);
        window.location.replace(window.location.pathname);   // drop ?itoken and boot signed in
        return;
      }
      onDone && onDone();
    } catch (e) { setMsg(e.message); }
    setBusy(false);
  };
  if (!info) return <Shell title="Join the workspace" sub="team invitation"><p className="muted">Checking your invitation...</p></Shell>;
  const who = info.invitedBy || "the person who invited you";
  if (info.state === "used") return (
    <Shell title="You already have an account" sub="team invitation">
      <p style={{ fontSize: 13.5, lineHeight: 1.6 }}>
        This invitation has been used{info.email ? <> for <b>{info.email}</b></> : null}. Sign in with that
        email address. If you have forgotten the password, you can set a new one.
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn pri" onClick={onDone}>Sign in</button>
        <button className="btn" onClick={() => (onForgot ? onForgot() : window.location.assign("/forgot"))}>
          Forgot password
        </button>
      </div>
    </Shell>
  );
  if (info.state !== "ok") return (
    <Shell title="This invitation link no longer works" sub="team invitation">
      <p style={{ fontSize: 13.5, lineHeight: 1.6 }}>
        {info.state === "expired"
          ? <>Invitation links last three days, and this one has run out or was replaced by a newer one. Ask {who}{info.company ? <> at {info.company}</> : null} to send it again from the Team page.</>
          : <>We could not find this invitation. Check you opened the whole link from the email, or ask the person who invited you to send it again.</>}
      </p>
      <button className="btn" onClick={onDone}>Back to sign in</button>
    </Shell>
  );
  const problem = f.name.trim().length < 2 ? "Enter your name."
    : f.password.length < 8 ? "Choose a password of at least 8 characters."
    : f.password !== f.password2 ? "The two passwords do not match." : "";
  return (
    <Shell title={info.company ? `Join ${info.company}` : "Join the workspace"} sub="team invitation">
      {info.company && (
        <div className="claimcard">
          <div className="claimname">Joining {info.company}{info.role ? <> as {info.role}</> : null}</div>
          <div className="claimnote">
            {info.invitedBy ? <>Invited by {info.invitedBy}. </> : null}
            {info.email ? <>Your sign-in will be <b>{info.email}</b>.</> : null}
          </div>
        </div>
      )}
      <Field id="ai-name" label="Your full name"><input id="ai-name" className="in" autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field id="ai-pw" label="Choose a password (8+ characters)"><input id="ai-pw" className="in" type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
      <Field id="ai-pw2" label="Type it again"><input id="ai-pw2" className="in" type="password" autoComplete="new-password" value={f.password2}
             onChange={(e) => setF({ ...f, password2: e.target.value })}
             onKeyDown={(e) => { if (e.key === "Enter" && !problem) submit(); }} /></Field>
      {problem && (f.password || f.password2) && <div className="hint" style={{ marginTop: -6, marginBottom: 10 }}>{problem}</div>}
      {msg && <div className="notice" style={{ borderLeft: "3px solid var(--wax)", marginBottom: 12 }}>{msg}</div>}
      <button className="btn pri" style={{ width: "100%" }} onClick={submit} disabled={!!problem || busy}>
        {busy ? "Creating your account..." : "Create my account"}
      </button>
    </Shell>
  );
}

export function ForgotPassword({ onDone }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const submit = async () => {
    if (pending.current || !email.trim()) return;
    pending.current = true; setBusy(true); setError("");
    try { await forgotPassword(email.trim()); setSent(true); }
    catch (e) { setError(e.message || "Could not send the request. Please try again."); }
    finally { pending.current = false; setBusy(false); }
  };
  return (
    <Shell title="Reset your password" sub="account recovery">
      {sent ? (
        <>
          <p style={{ fontSize: 13.5, lineHeight: 1.6 }}>If an account exists for <b>{email}</b>, a reset link is on its way. It's valid for 3 days.</p>
          <button className="btn" onClick={onDone}>Back to sign in</button>
        </>
      ) : (
        <>
          <Field id="recovery-email" label="Your account email"><input id="recovery-email" className="in" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} /></Field>
          {error && <div className="notice" role="alert" style={{ marginBottom: 12 }}>{error}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn pri" style={{ flex: 1 }} onClick={submit} disabled={busy || !email.trim()}>{busy ? "Sending..." : "Send reset link"}</button>
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
