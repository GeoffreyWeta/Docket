/* The administration console, served at /superadmin.

   Its own sign-in, its own token (a separate localStorage key, so signing out of
   the workspace does not sign you out of here and vice versa), and no link to it
   from anywhere in the tendering UI. The URL is not the security — every request
   below is checked against is_superuser on the server, and a correct password on
   a non-administrator account is refused here exactly as a wrong one is.

   What it governs: accounts, roles, and each person's capabilities. What it
   deliberately cannot do: open a sealed bid, score, publish or award. An
   administrator has no domain identity, and this console offers no route to one —
   changing who may do a thing is a different act from doing it. */

import React, { useEffect, useMemo, useState } from "react";

import { ICON_CSS, Icon } from "./icons";
import { CSS, EXTRA_CSS, THEME_CSS } from "./styles";
import { Dialog, Toasts, useToasts } from "./ui";

const TKEY = "docket_admin_token";

/* ---------------- api ---------------- */

const token = () => localStorage.getItem(TKEY);

async function req(path, { method = "GET", body } = {}) {
  const r = await fetch("/api/admin" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let d = null;
  try { d = await r.json(); } catch (e) { /* empty body */ }
  if (!r.ok) {
    const e = new Error((d && d.error) || `Request failed (${r.status})`);
    e.status = r.status;
    e.mfaRequired = !!(d && d.mfaRequired);
    throw e;
  }
  return d;
}

/* ---------------- helpers ---------------- */

const fmtDate = (ms) => (ms ? new Date(ms).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—");
const fmtWhen = (ms) => (ms ? new Date(ms).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "never");

const ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*-_=+";
function generatePassword(n = 20) {
  const bytes = new Uint32Array(n);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 20);

/* ---------------- talking about people like people ---------------- */

/** "Amara Okafor" → "AO"; falls back to the first letters of an email. */
function initials(name = "") {
  const words = name.replace(/[^\p{L}\p{N} .@-]/gu, " ").split(/[ .@-]+/).filter(Boolean);
  if (!words.length) return "?";
  return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
}

/* A stable colour per person, so the same face keeps the same badge between
   visits. Fixed saturation and lightness: it has to carry white text and read
   the same in all five themes. */
function avatarHue(seed = "") {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

/** "3 hours ago" beats a timestamp when the question is "are they using this?" */
function ago(ms) {
  if (!ms) return "never signed in";
  const s = Math.max(0, Date.now() - ms) / 1000;
  if (s < 90) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  if (d === 1) return "yesterday";
  if (d < 30) return `${d} days ago`;
  const mo = Math.round(d / 30);
  if (mo < 18) return `${mo} month${mo === 1 ? "" : "s"} ago`;
  return `${Math.round(mo / 12)} years ago`;
}

/* What this person does, in the words someone would actually use. Ordered by
   how much the capability defines the job, so the first three tell the story.
   The permission catalogue is the precise answer and lives one click away; this
   is the answer you can read down a list of forty people. */
const IN_PLAIN_WORDS = [
  ["award.decide", "signs off awards"],
  ["tender.publish_decision", "approves publications"],
  ["tender.create", "runs tenders"],
  ["bid.open", "opens sealed bids"],
  ["award.recommend", "recommends winners"],
  ["bid.score", "scores bids"],
  ["supplier.prequalify", "looks after the vendor register"],
  ["team.invite", "brings people in"],
  ["settings.threshold", "sets the approval matrix"],
  ["audit.integrity", "watches the audit trail"],
  ["clarification.answer", "answers vendor questions"],
];

/* Read-only access says almost nothing when someone also does real work — every
   buyer-side role can see the audit trail — so these only speak when there is
   nothing louder to say. */
const IF_NOTHING_ELSE = [
  ["page.portal", "bids for work here"],
  ["audit.integrity", "watches the audit trail"],
  ["page.audit", "reads the audit trail"],
  ["page.scorecards", "reads the vendor scorecards"],
  ["page.tenders", "reads the tenders"],
];

function inPlainWords(user) {
  if (user.isAdmin && user.role === "superadmin") return "Looks after accounts and permissions.";
  const perms = new Set(user.perms || []);
  let bits = IN_PLAIN_WORDS.filter(([k]) => perms.has(k)).map(([, phrase]) => phrase).slice(0, 3);
  if (!bits.length) {
    const fallback = IF_NOTHING_ELSE.find(([k]) => perms.has(k));
    bits = fallback ? [fallback[1]] : [];
  }
  if (!bits.length) return "Nothing assigned yet.";
  const joined = bits.length === 1 ? bits[0] : `${bits.slice(0, -1).join(", ")} and ${bits[bits.length - 1]}`;
  return joined.charAt(0).toUpperCase() + joined.slice(1) + ".";
}

/** The pills beside a name, without saying "administrator" twice. */
function Pills({ user: u }) {
  const consoleOnly = u.role === "superadmin";
  return (
    <>
      {!consoleOnly && <span className="chip soft">{u.roleLabel.split("—")[0].trim()}</span>}
      {u.isAdmin && <span className="chip gold">administrator</span>}
      {consoleOnly && <span className="chip soft">no workspace access</span>}
    </>
  );
}

function Avatar({ name, seed, size = 40, dim }) {
  const h = avatarHue(seed || name || "");
  return (
    <span className={"avatar" + (dim ? " dim" : "")} aria-hidden="true"
          style={{ width: size, height: size, fontSize: Math.round(size * 0.36),
                   background: `hsl(${h} 44% 42%)` }}>
      {initials(name)}
    </span>
  );
}

/* ---------------- sign in ---------------- */

export function AdminLogin({ onIn }) {
  const [u, setU] = useState("");
  const [pw, setPw] = useState("");
  const [code, setCode] = useState("");
  const [mfa, setMfa] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true); setMsg("");
    try {
      const res = await req("/login/", {
        method: "POST",
        body: { username: u.trim().toLowerCase(), password: pw, ...(mfa ? { code } : {}) },
      });
      localStorage.setItem(TKEY, res.token);
      onIn(res.admin);
    } catch (e) {
      if (e.mfaRequired) setMfa(true);
      setMsg(e.message || "Sign-in failed.");
    }
    setBusy(false);
  };

  return (
    <div className="loginwrap adminwrap">
      <div className="logincard">
        <div className="loginlogo"><span className="seal" aria-hidden="true" /><b>DOCKET</b></div>
        <div className="card">
          <div className="chead"><h3>Administration</h3>
            <span className="mono faint" style={{ marginLeft: "auto" }}>accounts &amp; permissions</span></div>
          <div className="cbody">
            <div className="frow"><label className="lbl" htmlFor="a-u">Username</label>
              <input id="a-u" className="in" autoComplete="username" value={u}
                     onChange={(e) => setU(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} /></div>
            <div className="frow"><label className="lbl" htmlFor="a-p">Password</label>
              <input id="a-p" className="in" type="password" autoComplete="current-password" value={pw}
                     onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} /></div>
            {mfa && (
              <div className="frow"><label className="lbl" htmlFor="a-c">Authenticator code</label>
                <input id="a-c" className="in" inputMode="numeric" autoComplete="one-time-code" placeholder="123456"
                       value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} /></div>
            )}
            {msg && <div className="notice" style={{ borderLeft: "3px solid var(--wax)", marginBottom: 12 }}>{msg}</div>}
            <button className="btn pri" style={{ width: "100%" }} onClick={submit}
                    disabled={busy || !u.trim() || !pw}>{busy ? "Checking…" : "Sign in"}</button>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 12 }}>
              This console manages accounts, roles and permissions. It holds no tendering identity:
              nothing signed in here can bid, score, publish or award.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- the permission grid ---------------- */

/** One row per capability, grouped. In `user` mode each row also says where the
    answer comes from — the role, or a decision somebody made about this person —
    because "why can they do that?" is the question this console exists to
    answer. */
export function PermGrid({ catalogue, held, defaults = [], allowed, onToggle, readOnly }) {
  const heldSet = useMemo(() => new Set(held), [held]);
  const defSet = useMemo(() => new Set(defaults), [defaults]);
  const okSet = useMemo(() => (allowed ? new Set(allowed) : null), [allowed]);

  return (
    <div className="permgrid">
      {catalogue.groups.map((g) => {
        const rows = catalogue.permissions.filter((p) => p.group === g.id && (!okSet || okSet.has(p.key)));
        if (!rows.length) return null;
        const on = rows.filter((p) => heldSet.has(p.key)).length;
        return (
          <div className="permgroup" key={g.id}>
            <div className="permhead">
              <div>
                <b>{g.title}</b>
                <div className="muted" style={{ fontSize: 11.5 }}>{g.blurb}</div>
              </div>
              <span className="mono faint">{on}/{rows.length}</span>
            </div>
            {rows.map((p) => {
              const checked = heldSet.has(p.key);
              const fromRole = defSet.has(p.key);
              let tag = null;
              if (defaults.length || defSet.size) {
                if (checked && !fromRole) tag = <span className="ptag grant">granted</span>;
                else if (!checked && fromRole) tag = <span className="ptag revoke">withdrawn</span>;
                else if (checked) tag = <span className="ptag role">from role</span>;
              }
              return (
                <label className={"permrow" + (checked ? " on" : "") + (readOnly ? " ro" : "")} key={p.key}>
                  <input type="checkbox" checked={checked} disabled={readOnly}
                         onChange={() => onToggle && onToggle(p.key, !checked)} />
                  <span className="pbody">
                    <span className="pname">{p.label}{tag}</span>
                    <span className="phelp">{p.help}</span>
                  </span>
                </label>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- one person ---------------- */

export function UserPanel({ state, user, onClose, onSaved, toast }) {
  const [u, setU] = useState(user);
  const [form, setForm] = useState({ name: user.name, email: user.email, title: user.title, role: user.role });
  const [extra, setExtra] = useState(new Set(user.extra));
  const [revoked, setRevoked] = useState(new Set(user.revoked));
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isSelf = state.admin.userId === u.id;
  const isVendor = u.role === "supplier";
  const defaults = useMemo(() => new Set(u.defaults), [u.defaults]);

  /* Effective set, recomputed as you click, so the panel shows the outcome and
     not the bookkeeping. The server recomputes it the same way and its answer
     wins on save. */
  const held = useMemo(() => {
    const s = new Set(u.isAdmin ? state.catalogue.permissions.map((p) => p.key) : u.defaults);
    if (!u.isAdmin) {
      extra.forEach((k) => s.add(k));
      revoked.forEach((k) => s.delete(k));
    }
    return [...s];
  }, [u, extra, revoked, state.catalogue.permissions]);

  const dirtyPerms = useMemo(() => {
    const a = [...extra].sort().join("|"), b = [...revoked].sort().join("|");
    return a !== u.extra.join("|") || b !== u.revoked.join("|");
  }, [extra, revoked, u.extra, u.revoked]);

  const dirtyIdentity = form.name !== u.name || form.email !== u.email
    || form.title !== u.title || form.role !== u.role;

  const toggle = (key, want) => {
    const inRole = defaults.has(key);
    const nx = new Set(extra), nr = new Set(revoked);
    if (want) { if (inRole) nr.delete(key); else nx.add(key); }
    else if (inRole) nr.add(key);
    else nx.delete(key);
    setExtra(nx); setRevoked(nr);
  };

  const run = async (fn, okTitle, okBody) => {
    setBusy(true);
    try {
      const res = await fn();
      if (res && res.user) { setU(res.user); setExtra(new Set(res.user.extra)); setRevoked(new Set(res.user.revoked));
        setForm({ name: res.user.name, email: res.user.email, title: res.user.title, role: res.user.role }); }
      if (okTitle) toast.ok(okTitle, okBody);
      await onSaved();
      return true;
    } catch (e) {
      toast.warn("That didn't go through", e.message || "");
      return false;
    } finally { setBusy(false); }
  };

  const savePerms = () => run(
    () => req("/users/perms/", { method: "POST", body: { userId: u.id, extra: [...extra], revoked: [...revoked] } }),
    "Permissions saved", `${u.name} now has ${held.length} capabilities. They take effect on their next request.`);

  const saveIdentity = () => run(
    () => {
      const body = { name: form.name, email: form.email, title: form.title };
      if (form.role !== u.role) body.role = form.role;
      return req(`/users/${u.id}/`, { method: "POST", body });
    },
    "Account updated", "");

  const footer = (
    <>
      <span className="faint" style={{ marginRight: "auto", fontSize: 11.5 }}>
        {u.username} · {u.sessions === 0 ? "no devices signed in" : `${u.sessions} device${u.sessions === 1 ? "" : "s"} signed in`} · last seen {ago(u.lastSeen)}
      </span>
      <button className="btn" onClick={onClose} disabled={busy}>Close</button>
    </>
  );

  return (
    <Dialog title={u.name} onClose={onClose} footer={footer} wide>
      {/* Who you are looking at, said once at the top, so the two columns of
          controls below never have to re-establish it. */}
      <div className="phead">
        <Avatar name={u.name} seed={u.username} size={46} dim={!u.active} />
        <div>
          <div className="pline">
            <b className="pn">{u.name}</b>
            <Pills user={u} />
            {!u.active && <span className="chip warn">disabled</span>}
          </div>
          <div className="pdoes">{inPlainWords(u)}</div>
        </div>
      </div>
      <div className="admincols">
        <div>
          <div className="lbl">Who they are</div>
          {isVendor ? (
            <div className="notice">
              This is a vendor account: {u.name} registered themselves and is prequalified in the
              workspace. Vendors hold no buyer-side capabilities and cannot be given a buyer role —
              they sit on the other side of the seal.
            </div>
          ) : (
            <>
              <div className="frow"><label className="lbl">Name</label>
                <input className="in" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="frow"><label className="lbl">Job title</label>
                <input className="in" value={form.title || ""} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
              <div className="frow"><label className="lbl">Email</label>
                <input className="in" value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div className="frow"><label className="lbl">Role</label>
                <select className="in" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  {!state.roles.some((r) => r.key === form.role) && <option value={form.role}>{u.roleLabel}</option>}
                  {state.roles.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                </select>
                <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
                  Changing the role changes the defaults underneath. Anything granted or withdrawn for
                  this person individually is kept and re-applied on top.
                </div>
              </div>
              <button className="btn pri sm" onClick={saveIdentity} disabled={busy || !dirtyIdentity}>Save these details</button>
            </>
          )}

          <div className="lbl" style={{ marginTop: 22 }}>How their account stands</div>
          <div className="kv"><span>Can sign in</span><b>{u.active ? "Yes" : "No — disabled"}</b></div>
          <div className="kv"><span>This console</span><b>{u.isAdmin ? "Yes — full access" : "No"}</b></div>
          <div className="kv"><span>Two-factor</span><b>{u.mfa ? "On" : "Not set up yet"}</b></div>
          <div className="kv"><span>With you since</span><b>{fmtDate(u.joined)}</b></div>

          <div className="btnrow">
            <button className="btn sm" disabled={busy || isSelf}
                    onClick={() => run(() => req(`/users/${u.id}/`, { method: "POST", body: { active: !u.active } }),
                                       u.active ? "Account disabled" : "Account enabled",
                                       u.active ? "They are signed out everywhere and cannot sign in." : "They can sign in again.")}>
              {u.active ? "Disable account" : "Enable account"}
            </button>
            <button className="btn sm" disabled={busy || u.sessions === 0}
                    onClick={() => run(() => req(`/users/${u.id}/sessions/`, { method: "POST", body: {} }),
                                       "Sessions revoked", "Every device holding a token for this account is signed out.")}>
              Revoke sessions
            </button>
            {u.mfa && (
              <button className="btn sm" disabled={busy}
                      onClick={() => run(() => req(`/users/${u.id}/mfa_reset/`, { method: "POST", body: {} }),
                                         "Two-factor reset", "They can re-enrol from their own security panel.")}>
                Reset two-factor
              </button>
            )}
            {!isVendor && (
              <button className="btn sm" disabled={busy || isSelf}
                      onClick={() => run(() => req(`/users/${u.id}/`, { method: "POST", body: { isAdmin: !u.isAdmin } }),
                                         u.isAdmin ? "Administrator access removed" : "Administrator access granted",
                                         u.isAdmin ? "" : "They can now sign in at /superadmin and change anyone's permissions.")}>
                {u.isAdmin ? "Remove administrator access" : "Make administrator"}
              </button>
            )}
          </div>

          <div className="lbl" style={{ marginTop: 22 }}>Give them a new password</div>
          <div className="pwrow">
            <input className="in" value={pw} placeholder="At least 10 characters"
                   onChange={(e) => setPw(e.target.value)} />
            <button className="btn sm" onClick={() => setPw(generatePassword())}>Generate</button>
          </div>
          <button className="btn sm" style={{ marginTop: 8 }} disabled={busy || pw.length < 10}
                  onClick={async () => {
                    const ok = await run(() => req(`/users/${u.id}/password/`, { method: "POST", body: { password: pw } }),
                                         "Password set", "Every existing session for this account was revoked.");
                    if (ok) { navigator.clipboard?.writeText(pw).catch(() => {}); setPw(""); }
                  }}>
            Set password (and copy it)
          </button>

          {!isVendor && (
            <>
              <div className="lbl" style={{ marginTop: 22 }}>Remove them</div>
              {confirmDelete ? (
                <div className="notice" style={{ borderLeft: "3px solid var(--wax)" }}>
                  Delete <b>{u.name}</b>? Their sign-in and notifications go; audit events already
                  recorded under their name stay, and so does every tender they touched.
                  <div className="btnrow" style={{ marginTop: 10 }}>
                    <button className="btn sm" onClick={() => setConfirmDelete(false)}>Keep</button>
                    <button className="btn wax sm" disabled={busy}
                            onClick={async () => {
                              const ok = await run(() => req(`/users/${u.id}/delete/`, { method: "POST", body: {} }),
                                                   "Account deleted", `${u.name} can no longer sign in.`);
                              if (ok) onClose();
                            }}>Delete the account</button>
                  </div>
                </div>
              ) : (
                <button className="btn sm" disabled={isSelf} onClick={() => setConfirmDelete(true)}>Delete account…</button>
              )}
            </>
          )}
        </div>

        <div>
          <div className="permtop">
            <div>
              <div className="lbl" style={{ margin: 0 }}>Capabilities</div>
              <div className="muted" style={{ fontSize: 11.5 }}>
                {u.isAdmin
                  ? "This account is an administrator and holds everything, whatever the boxes say."
                  : <>Defaults come from <b>{u.roleLabel}</b>. Tick to grant, untick to withdraw.</>}
              </div>
            </div>
            <span className="mono faint">{held.length} held</span>
          </div>
          {isVendor ? (
            <div className="notice" style={{ marginTop: 10 }}>
              Vendor accounts see their own invitations, their own bid and their own letter. That is
              structural, not a permission, so there is nothing here to change.
            </div>
          ) : (
            <>
              <PermGrid catalogue={state.catalogue} held={held} defaults={u.defaults}
                        allowed={u.grantable} onToggle={toggle} readOnly={u.isAdmin || busy} />
              {!u.isAdmin && (
                <div className="btnrow sticky">
                  <button className="btn pri sm" onClick={savePerms} disabled={busy || !dirtyPerms}>
                    {busy ? "Saving…" : "Save permissions"}
                  </button>
                  <button className="btn sm" disabled={busy || (!extra.size && !revoked.size)}
                          onClick={() => { setExtra(new Set()); setRevoked(new Set()); }}>
                    Back to role defaults
                  </button>
                  {dirtyPerms && <span className="mono faint" style={{ fontSize: 11 }}>unsaved</span>}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}

/* ---------------- create an account ---------------- */

export function NewUserDialog({ state, onClose, onSaved, toast }) {
  const [f, setF] = useState({
    name: "", username: "", title: "", role: state.roles[0]?.key || "procurement",
    password: generatePassword(), isAdmin: false,
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const save = async () => {
    setBusy(true); setMsg("");
    try {
      await req("/users/", { method: "POST", body: { ...f, email: f.username } });
      navigator.clipboard?.writeText(`${f.username} / ${f.password}`).catch(() => {});
      toast.ok("Account created", `${f.name} can sign in now. Username and password copied to your clipboard.`);
      await onSaved();
      onClose();
    } catch (e) { setMsg(e.message || "Could not create the account."); }
    setBusy(false);
  };

  return (
    <Dialog title="New account" onClose={onClose} footer={
      <>
        <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn pri" onClick={save}
                disabled={busy || f.name.trim().length < 2 || f.username.trim().length < 3 || f.password.length < 10}>
          {busy ? "Creating…" : "Create account"}
        </button>
      </>
    }>
      <div className="frow"><label className="lbl">Name</label>
        <input className="in" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
      <div className="frow"><label className="lbl">Work email (this is their username)</label>
        <input className="in" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value.trim().toLowerCase() })} /></div>
      <div className="frow"><label className="lbl">Role</label>
        <select className="in" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
          {state.roles.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          <option value="superadmin">Administrator only — this console, no workspace access</option>
        </select></div>
      {f.role !== "superadmin" && (
        <div className="frow"><label className="lbl">Job title (optional)</label>
          <input className="in" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
      )}
      <div className="frow"><label className="lbl">Password</label>
        <div className="pwrow">
          <input className="in mono" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          <button className="btn sm" onClick={() => setF({ ...f, password: generatePassword() })}>Generate</button>
        </div>
        <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
          Copied to your clipboard when the account is created. Send it over a channel you trust and
          have them change it.
        </div>
      </div>
      {f.role !== "superadmin" && (
        <label className="checkline">
          <input type="checkbox" checked={f.isAdmin} onChange={(e) => setF({ ...f, isAdmin: e.target.checked })} />
          Also give them administrator access to this console
        </label>
      )}
      {msg && <div className="notice" style={{ borderLeft: "3px solid var(--wax)", marginTop: 12 }}>{msg}</div>}
    </Dialog>
  );
}

/* ---------------- people ---------------- */

/** One person, as a person: a face, their name, what they do here in a sentence,
    and how their access stands. The precise capability list is one click away —
    this is what you read when you are scanning for the right human. */
function PersonRow({ user: u, onOpen }) {
  const adjusted = u.extra.length + u.revoked.length;
  const nothing = !u.isAdmin && !u.perms.length;
  const flag = !u.active ? "off" : nothing ? "empty" : "";
  return (
    <div className={"person" + (flag ? " " + flag : "")} role="button" tabIndex={0}
         onClick={() => onOpen(u.id)}
         onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(u.id); } }}>
      <Avatar name={u.name} seed={u.username} dim={!u.active} />
      <div className="pinfo">
        <div className="pline">
          <b className="pn">{u.name}</b>
          <Pills user={u} />
          {!u.active && <span className="chip warn">disabled</span>}
        </div>
        <div className="pdoes">{inPlainWords(u)}</div>
        <div className="pmeta">
          <span>{u.username}</span>
          <span>{ago(u.lastSeen)}</span>
          {u.sessions > 0 && <span>{u.sessions} device{u.sessions === 1 ? "" : "s"}</span>}
          {u.mfa && <span className="good">two-factor on</span>}
          {adjusted > 0 && (
            <span className="tweak">
              {u.extra.length > 0 && `${u.extra.length} extra${u.extra.length === 1 ? "" : "s"}`}
              {u.extra.length > 0 && u.revoked.length > 0 && ", "}
              {u.revoked.length > 0 && `${u.revoked.length} withdrawn`}
            </span>
          )}
        </div>
      </div>
      <button className="btn sm pmanage" onClick={(e) => { e.stopPropagation(); onOpen(u.id); }}>
        Open
      </button>
    </div>
  );
}

const FILTERS = [
  ["team", "The team", (u) => u.role !== "supplier"],
  ["vendors", "Vendors", (u) => u.role === "supplier"],
  ["admins", "Administrators", (u) => u.isAdmin],
  ["attention", "Needs a look", (u) => !u.active || (!u.isAdmin && !u.perms.length)],
  ["all", "Everyone", () => true],
];

export function PeopleTab({ state, reload, toast }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(null);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState("team");

  const test = (FILTERS.find(([k]) => k === filter) || FILTERS[0])[2];
  const counts = Object.fromEntries(FILTERS.map(([k, , fn]) => [k, state.users.filter(fn).length]));
  const search = q.trim().toLowerCase();
  const rows = state.users.filter((u) => {
    if (!test(u)) return false;
    if (!search) return true;
    return [u.name, u.username, u.email, u.roleLabel].some((v) => (v || "").toLowerCase().includes(search));
  });
  const current = open ? state.users.find((u) => u.id === open) : null;
  const needing = state.users.filter(FILTERS[3][2]).length;

  return (
    <>
      <div className="toolrow">
        <input className="in" placeholder="Search by name, email or role…" value={q}
               onChange={(e) => setQ(e.target.value)} />
        <button className="btn pri sm" onClick={() => setCreating(true)}>
          <Icon n="plus" s={14} /> Add someone
        </button>
      </div>

      <div className="filterchips">
        {FILTERS.map(([key, label]) => (
          <button key={key} className={"fchip" + (filter === key ? " on" : "")} onClick={() => setFilter(key)}>
            {label}<span className="n">{counts[key]}</span>
          </button>
        ))}
      </div>

      {filter !== "attention" && needing > 0 && (
        <div className="notice friendly">
          {needing === 1 ? "One account needs a look" : `${needing} accounts need a look`} — disabled,
          or signed in with nothing assigned yet.{" "}
          <button className="doclink" onClick={() => setFilter("attention")}>Show them</button>
        </div>
      )}

      <div className="people">
        {rows.map((u) => <PersonRow key={u.id} user={u} onOpen={setOpen} />)}
        {!rows.length && (
          <div className="emptyfriendly">
            <Avatar name="?" seed={q || filter} size={44} dim />
            <b>{search ? `Nobody here matches “${q.trim()}”` : "Nobody in this group yet"}</b>
            <span>
              {search
                ? "Try part of a name or an email address, or switch group above."
                : "Add someone with the button above, or pick another group."}
            </span>
          </div>
        )}
      </div>

      {current && <UserPanel state={state} user={current} toast={toast}
                             onClose={() => setOpen(null)} onSaved={reload} />}
      {creating && <NewUserDialog state={state} toast={toast}
                                  onClose={() => setCreating(false)} onSaved={reload} />}
    </>
  );
}

/* ---------------- roles ---------------- */

export function RoleDialog({ state, role, onClose, onSaved, toast }) {
  const creating = !role;
  const [f, setF] = useState({
    key: role?.key || "", label: role?.label || "", title: role?.title || "", note: role?.note || "",
  });
  const [perms, setPerms] = useState(new Set(role?.perms || []));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const readOnly = !!role?.builtin;

  const save = async () => {
    setBusy(true); setMsg("");
    try {
      const body = { ...f, key: f.key || slug(f.label), perms: [...perms] };
      if (creating) await req("/roles/", { method: "POST", body });
      else await req(`/roles/${role.key}/`, { method: "POST", body });
      toast.ok(creating ? "Role created" : "Role saved",
               creating ? `“${f.label}” can now be assigned to anyone.` : "Everyone on this role picks up the change immediately.");
      await onSaved();
      onClose();
    } catch (e) { setMsg(e.message || "Could not save the role."); }
    setBusy(false);
  };

  return (
    <Dialog title={creating ? "New role" : role.label} onClose={onClose} wide footer={
      <>
        {readOnly && <span className="mono faint" style={{ marginRight: "auto", fontSize: 11 }}>built-in — separation of duties is enforced in code</span>}
        <button className="btn" onClick={onClose} disabled={busy}>{readOnly ? "Close" : "Cancel"}</button>
        {!readOnly && (
          <button className="btn pri" onClick={save} disabled={busy || f.label.trim().length < 2}>
            {busy ? "Saving…" : creating ? "Create role" : "Save role"}
          </button>
        )}
      </>
    }>
      <div className="admincols">
        <div>
          <div className="frow"><label className="lbl">Name</label>
            <input className="in" value={f.label} disabled={readOnly}
                   onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="CEO" /></div>
          {creating && (
            <div className="frow"><label className="lbl">Id (used in the audit trail)</label>
              <input className="in mono" value={f.key} placeholder={slug(f.label) || "ceo"}
                     onChange={(e) => setF({ ...f, key: slug(e.target.value) })} />
              <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
                Lowercase, no spaces. It cannot be changed later, because events already recorded
                refer to it.
              </div>
            </div>
          )}
          <div className="frow"><label className="lbl">Default job title</label>
            <input className="in" value={f.title} disabled={readOnly}
                   onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Chief Executive" /></div>
          <div className="frow"><label className="lbl">Note (optional)</label>
            <input className="in" value={f.note} disabled={readOnly}
                   onChange={(e) => setF({ ...f, note: e.target.value })}
                   placeholder="What this role is for" /></div>
          {!creating && (
            <div className="kv"><span>People on it</span><b>{role.people}</b></div>
          )}
          {msg && <div className="notice" style={{ borderLeft: "3px solid var(--wax)" }}>{msg}</div>}
          {!readOnly && (
            <div className="notice" style={{ marginTop: 12 }}>
              A role is a starting point. Anyone on it can still be moved individually from the
              people list, and those adjustments survive a change here.
            </div>
          )}
        </div>
        <div>
          <div className="permtop">
            <div><div className="lbl" style={{ margin: 0 }}>Capabilities</div>
              <div className="muted" style={{ fontSize: 11.5 }}>What everyone on this role can do by default.</div></div>
            <span className="mono faint">{perms.size} selected</span>
          </div>
          <PermGrid catalogue={state.catalogue} held={[...perms]} defaults={[]}
                    allowed={readOnly ? undefined : state.catalogue.customGrantable}
                    readOnly={readOnly || busy}
                    onToggle={(key, want) => {
                      const n = new Set(perms);
                      if (want) n.add(key); else n.delete(key);
                      setPerms(n);
                    }} />
        </div>
      </div>
    </Dialog>
  );
}

export function RolesTab({ state, reload, toast }) {
  const [open, setOpen] = useState(null);       // role object
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  const remove = async (r) => {
    setBusy(true);
    try {
      await req(`/roles/${r.key}/delete/`, { method: "POST", body: {} });
      toast.ok("Role deleted", `“${r.label}” is gone.`);
      await reload();
    } catch (e) { toast.warn("Could not delete that role", e.message || ""); }
    setBusy(false);
  };

  return (
    <>
      <div className="toolrow">
        <div className="muted" style={{ fontSize: 12.5, flex: 1 }}>
          The four built-in roles carry the separation of duties the system is built on and cannot be
          edited. Anything else you need — a CEO, a legal reviewer, a board observer — you invent here.
        </div>
        <button className="btn pri sm" onClick={() => setCreating(true)}><Icon n="plus" s={14} /> New role</button>
      </div>

      <div className="rolegrid">
        {state.roles.map((r) => (
          <div className="card rolecard" key={r.key}>
            <div className="chead">
              <h3>{r.label.split("—")[0].trim()}</h3>
              {r.builtin
                ? <span className="chip" style={{ marginLeft: "auto" }}>built-in</span>
                : <span className="chip gold" style={{ marginLeft: "auto" }}>custom</span>}
            </div>
            <div className="cbody">
              <div className="muted" style={{ fontSize: 12.5, minHeight: 34 }}>
                {r.note || (r.builtin ? r.label.split("—")[1]?.trim() || "" : "No note.")}
              </div>
              <div className="kv"><span>Can do</span><b>{r.perms.length} thing{r.perms.length === 1 ? "" : "s"}</b></div>
              <div className="kv"><span>People on it</span><b>{r.people === 0 ? "nobody yet" : r.people}</b></div>
              <div className="kv"><span>Id</span><b className="mono">{r.key}</b></div>
              <div className="btnrow" style={{ marginTop: 10 }}>
                <button className="btn sm" onClick={() => setOpen(r)}>{r.builtin ? "View" : "Edit"}</button>
                {!r.builtin && (
                  <button className="btn sm" disabled={busy || r.people > 0}
                          title={r.people ? "Move the people on it to another role first" : ""}
                          onClick={() => remove(r)}>Delete</button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {open && <RoleDialog state={state} role={open} toast={toast}
                           onClose={() => setOpen(null)} onSaved={reload} />}
      {creating && <RoleDialog state={state} toast={toast}
                               onClose={() => setCreating(false)} onSaved={reload} />}
    </>
  );
}

/* ---------------- log ---------------- */

export function LogTab() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => { req("/log/").then((d) => setRows(d.entries)).catch((e) => setErr(e.message)); }, []);

  return (
    <div className="card">
      <div className="chead"><h3>What has changed</h3>
        <span className="faint" style={{ marginLeft: "auto", fontSize: 11.5 }}>everything done in this console, newest first</span></div>
      {err && <div className="cbody"><div className="notice">{err}</div></div>}
      <div className="tscroll">
        <table className="tbl">
          <thead><tr><th>When</th><th>Who did it</th><th>What they did</th><th>Who it was about</th><th>Detail</th><th>From</th></tr></thead>
          <tbody>
            {(rows || []).map((e) => (
              <tr key={e.id}>
                <td data-l="When" className="faint" title={fmtWhen(e.at)}>{ago(e.at)}</td>
                <td data-l="Administrator">{e.actor}</td>
                <td data-l="Action"><b>{e.action}</b></td>
                <td data-l="Target">{e.target || "—"}</td>
                <td data-l="Detail" className="muted">{e.detail || "—"}</td>
                <td data-l="From" className="mono faint">{e.ip || "—"}</td>
              </tr>
            ))}
            {rows && !rows.length && <tr><td colSpan={6} className="muted" style={{ padding: 18 }}>Nothing has been changed here yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="cbody" style={{ borderTop: "1px solid var(--line)" }}>
        <div className="muted" style={{ fontSize: 12 }}>
          Changes to accounts, roles and permissions are also written into the workspace's
          tamper-evident audit chain, where an auditor can see them. Password resets, session
          revocations and two-factor resets stay in this log.
        </div>
      </div>
    </div>
  );
}

/* ---------------- shell ---------------- */

/* A greeting is a small thing, but this console is where you arrive to deal
   with people, and it costs nothing to open like a person. */
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const TABS = [["people", "People"], ["roles", "Roles"], ["log", "What has changed"]];

export default function SuperAdmin() {
  const [signedIn, setSignedIn] = useState(!!token());
  const [state, setState] = useState(null);
  const [tab, setTab] = useState("people");
  const [err, setErr] = useState("");
  const [toast, toasts, dropToast] = useToasts();

  const reload = async () => {
    try {
      const d = await req("/state/");
      setState(d);
      setErr("");
      return d;
    } catch (e) {
      if (e.status === 401) { localStorage.removeItem(TKEY); setSignedIn(false); setState(null); }
      else setErr(e.message || "Could not reach the server.");
      return null;
    }
  };

  useEffect(() => { if (signedIn) reload(); /* eslint-disable-next-line */ }, [signedIn]);

  const signOut = async () => {
    try { await req("/logout/", { method: "POST", body: {} }); } catch (e) { /* going anyway */ }
    localStorage.removeItem(TKEY);
    setSignedIn(false); setState(null);
  };

  const style = <style>{CSS + EXTRA_CSS + THEME_CSS + ICON_CSS + ADMIN_CSS}</style>;

  if (!signedIn) {
    return <>{style}<AdminLogin onIn={() => setSignedIn(true)} /></>;
  }
  if (!state) {
    return (
      <>{style}
        <div className="dk"><div className="main"><div className="content">
          <div className="card"><div className="cbody">{err || "Loading the console…"}</div></div>
        </div></div></div>
      </>
    );
  }

  const c = state.counts;
  return (
    <>
      {style}
      <div className="dk adminroot">
        <header className="admintop">
          <div className="loginlogo" style={{ margin: 0 }}>
            <span className="seal" aria-hidden="true" /><b>DOCKET</b>
            <span className="adminmark">Administration</span>
          </div>
          <div className="spacer" style={{ flex: 1 }} />
          <span className="mono faint" style={{ fontSize: 11.5 }}>{state.admin.name}</span>
          <button className="btn sm" onClick={signOut}>Sign out</button>
        </header>

        <main className="content adminmain">
          <div className="pagehead">
            <h1>{greeting()}, {state.admin.name.split(" ")[0]}</h1>
            <span className="sub">
              {state.counts.team} on the team · {state.counts.suppliers} vendors ·{" "}
              {state.counts.customRoles === 0 ? "no roles of your own yet" : `${state.counts.customRoles} role${state.counts.customRoles === 1 ? "" : "s"} you made`}
            </span>
          </div>

          {err && <div className="notice" style={{ borderLeft: "3px solid var(--wax)", marginBottom: 14 }}>{err}</div>}

          <div className="statrow">
            {[["Everyone", c.total, "accounts that can sign in"],
              ["Your team", c.team, "people who run the tendering"],
              ["Vendors", c.suppliers, "suppliers with a login"],
              ["Administrators", c.admins, "can open this console"],
              ["Your own roles", c.customRoles, "beyond the built-in four"],
              ["Tailored access", c.customised, "moved off their role"],
              ["Switched off", c.disabled, "cannot sign in"]].map(([k, v, d]) => (
                <div className="stat" key={k}><div className="k">{k}</div><div className="v">{v}</div><div className="d">{d}</div></div>
              ))}
          </div>

          <div className="admintabs">
            {TABS.map(([key, label]) => (
              <button key={key} className={"admintab" + (tab === key ? " on" : "")} onClick={() => setTab(key)}>{label}</button>
            ))}
          </div>

          {tab === "people" && <PeopleTab state={state} reload={reload} toast={toast} />}
          {tab === "roles" && <RolesTab state={state} reload={reload} toast={toast} />}
          {tab === "log" && <LogTab />}

          {state.demoLogin && (
            <div className="notice" style={{ marginTop: 18 }}>
              This deployment has <b>DEMO_LOGIN=1</b>: the workspace sign-in offers one-click logins for
              the demo accounts. Administrator accounts are never among them, and this console always
              requires a password. Set DEMO_LOGIN=0 before anyone real uses it.
            </div>
          )}
        </main>
      </div>
      <Toasts items={toasts} onDismiss={dropToast} />
    </>
  );
}

/* ---------------- console-only styling ---------------- */

export const ADMIN_CSS = `
.adminwrap .logincard{max-width:420px}
.adminroot{display:block;background:var(--paper)}
.admintop{display:flex;align-items:center;gap:10px;padding:10px var(--gutter);
  background:var(--card);border-bottom:1px solid var(--line);position:sticky;top:0;z-index:20}
.adminmark{font-family:var(--font-mono);font-size:9.5px;text-transform:uppercase;letter-spacing:.14em;
  color:var(--brand);border:1px solid var(--brand-ring);background:var(--brand-tint);
  border-radius:var(--r-xs);padding:3px 7px;margin-left:8px}
.adminmain{max-width:1180px;margin:0 auto;padding:18px var(--gutter) 60px;overflow:visible}
.statrow{display:grid;grid-template-columns:repeat(auto-fit,minmax(148px,1fr));gap:10px;margin-bottom:18px}
.admintabs{display:flex;gap:4px;border-bottom:1px solid var(--line);margin-bottom:16px;overflow-x:auto}
.admintab{background:none;border:0;border-bottom:2px solid transparent;padding:10px 14px;
  font:inherit;font-size:13.5px;font-weight:550;color:var(--muted);cursor:pointer;white-space:nowrap;min-height:var(--tap)}
.admintab:hover{color:var(--ink)}
.admintab.on{color:var(--brand);border-bottom-color:var(--brand)}
.toolrow{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:14px}
.toolrow .in{flex:1 1 220px;min-width:180px}

/* ---- people, as people ----
   A row per person rather than a grid of cells: a face, a name, one sentence of
   what they do, and the housekeeping in small type underneath. It has to stay
   scannable at forty rows, so the sentence is capped at three capabilities and
   everything precise lives in the panel. */
.avatar{display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;
  border-radius:50%;color:#fff;font-weight:600;letter-spacing:.02em;
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.16),var(--shadow)}
.avatar.dim{filter:saturate(.25) opacity(.6)}
.people{display:flex;flex-direction:column;gap:8px}
.person{display:flex;align-items:center;gap:13px;padding:12px 14px;background:var(--card);
  border:var(--card-bd) solid var(--line);border-radius:var(--r);cursor:pointer;
  transition:border-color var(--t) var(--ease),box-shadow var(--t) var(--ease),transform var(--t) var(--ease)}
.person:hover{border-color:var(--line2);box-shadow:var(--shadow-lg,var(--shadow))}
.person:active{transform:translateY(.5px)}
.person:focus-visible{outline:2px solid var(--brand);outline-offset:2px}
.person.off{background:var(--sunk)}
.person.off .pn{text-decoration:line-through;text-decoration-color:var(--line2)}
.person.empty{border-left:3px solid var(--brass)}
.pinfo{flex:1;min-width:0}
.pline{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.pn{font-family:var(--font-display);font-size:15.5px;font-weight:600;letter-spacing:-.01em}
.pdoes{font-size:12.5px;color:var(--ink);opacity:.82;margin-top:2px;line-height:1.45}
.pmeta{display:flex;flex-wrap:wrap;gap:4px 14px;margin-top:5px;font-size:11.5px;color:var(--faint)}
.pmeta .good{color:var(--green)}
.pmeta .tweak{color:var(--brand)}
/* The whole row is the button on a phone, where the sentence needs the width;
   the explicit control returns once there is room for it. */
.pmanage{display:none;flex:0 0 auto}
/* the role pill in a quieter register than the status chips beside it */
.chip.soft{background:var(--sunk);border-color:var(--line);color:var(--muted)}
.filterchips{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:14px}
.fchip{display:inline-flex;align-items:center;gap:7px;padding:7px 13px;border-radius:999px;
  border:1px solid var(--line2);background:var(--card);color:var(--muted);
  font:inherit;font-size:12.5px;font-weight:550;cursor:pointer;min-height:36px;
  transition:all var(--t) var(--ease)}
.fchip:hover{border-color:var(--brand-ring);color:var(--ink)}
.fchip .n{font-family:var(--font-mono);font-size:10.5px;opacity:.75}
.fchip.on{background:var(--p-container);border-color:var(--brand-ring);color:var(--on-p-container)}
.notice.friendly{border-left:3px solid var(--brass);background:var(--brass-tint);color:var(--gold-ink);margin-bottom:14px}
.notice.friendly .doclink{color:inherit;font-weight:600}
.emptyfriendly{display:flex;flex-direction:column;align-items:center;gap:7px;text-align:center;
  padding:38px 20px;background:var(--card);border:1px dashed var(--line2);border-radius:var(--r)}
.emptyfriendly b{font-family:var(--font-display);font-size:15px}
.emptyfriendly span{font-size:12.5px;color:var(--muted);max-width:330px;line-height:1.5}
.phead{display:flex;align-items:center;gap:13px;padding-bottom:14px;margin-bottom:16px;
  border-bottom:1px solid var(--line)}
.phead>div{min-width:0}
.admincols{display:grid;grid-template-columns:minmax(0,1fr);gap:22px}
.kv{display:flex;align-items:baseline;gap:10px;font-size:12.5px;padding:5px 0;border-bottom:1px solid var(--hair)}
.kv span{color:var(--muted);flex:1}
.btnrow{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:12px}
.btnrow.sticky{position:sticky;bottom:0;z-index:1;background:var(--card);padding:10px 0 2px;
  margin-top:2px;border-top:1px solid var(--line);box-shadow:0 -8px 12px -10px rgba(0,0,0,.28)}
.pwrow{display:flex;gap:8px}
.pwrow .in{flex:1}
.permtop{display:flex;align-items:flex-end;gap:10px;margin-bottom:8px}
.permtop>div:first-child{flex:1}
.permgrid{display:flex;flex-direction:column;gap:12px;max-height:none;padding-bottom:2px}
.permgroup{border:1px solid var(--line);border-radius:var(--r-sm);overflow:hidden;background:var(--card)}
.permhead{display:flex;align-items:center;gap:10px;padding:9px 12px;background:var(--sunk);
  border-bottom:1px solid var(--line);font-size:13px}
.permhead>div{flex:1}
.permrow{display:flex;gap:10px;align-items:flex-start;padding:9px 12px;border-bottom:1px solid var(--hair);cursor:pointer}
.permrow:last-child{border-bottom:0}
.permrow:hover{background:var(--btn-hover)}
.permrow.ro{cursor:default;opacity:.75}
.permrow input{margin-top:2px;width:16px;height:16px;accent-color:var(--brand);flex:0 0 auto}
.pbody{display:flex;flex-direction:column;gap:2px;min-width:0}
.pname{font-size:13px;font-weight:550;display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.phelp{font-size:11.5px;color:var(--muted);line-height:1.45}
.ptag{font-family:var(--font-mono);font-size:9px;text-transform:uppercase;letter-spacing:.11em;
  padding:2px 6px;border-radius:var(--r-xs);border:1px solid var(--line2);color:var(--faint)}
.ptag.grant{color:var(--green);border-color:var(--chip-ok-line);background:var(--green-tint)}
.ptag.revoke{color:var(--wax);border-color:var(--chip-warn-line);background:var(--wax-tint)}
.rolegrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}
.rolecard .cbody{display:flex;flex-direction:column}
@media (min-width:700px){
  .pmanage{display:inline-flex}
  .person{padding:13px 16px}
}
@media (min-width:900px){
  .admincols{grid-template-columns:minmax(0,340px) minmax(0,1fr);gap:26px}
}
`;
