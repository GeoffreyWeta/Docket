/* Account security panel: TOTP two-factor enrollment + session control. */
import React, { useEffect, useState } from "react";

import { raw } from "./api";

export function SecurityPanel({ onClose, onLogoutAll, me, onRenamed }) {
  const [st, setSt] = useState(null);       // {enabled, sessions}
  const [setup, setSetup] = useState(null); // {qr, secret}
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");

  const load = () => raw("/auth/mfa/").then(setSt).catch(() => {});
  useEffect(() => { load(); }, []);

  const begin = async () => {
    setMsg("");
    try { setSetup(await raw("/auth/mfa/setup/", { method: "POST", body: {} })); } catch (e) { setMsg(e.message); }
  };
  const enable = async () => {
    setMsg("");
    try {
      await raw("/auth/mfa/enable/", { method: "POST", body: { code } });
      setSetup(null); setCode(""); setMsg("Two-factor is on. You'll need a code at every sign-in from now.");
      load();
    } catch (e) { setMsg(e.message); }
  };
  const disable = async () => {
    setMsg("");
    try {
      await raw("/auth/mfa/disable/", { method: "POST", body: { code } });
      setCode(""); setMsg("Two-factor is off.");
      load();
    } catch (e) { setMsg(e.message); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(18,36,29,.45)", zIndex: 100,
                  display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
         onClick={onClose} role="dialog" aria-label="Account security">
      <div className="card" style={{ maxWidth: 480, width: "100%", maxHeight: "86vh", overflowY: "auto" }}
           onClick={(e) => e.stopPropagation()}>
        <div className="chead"><h3>Account security</h3>
          <button className="btn sm" style={{ marginLeft: "auto" }} onClick={onClose}>Close</button></div>
        <div className="cbody">
          <NameRow me={me} onRenamed={onRenamed} />
          <div className="rowline">
            <span style={{ flex: 1 }}>Two-factor authentication</span>
            <span className={"chip " + (st?.enabled ? "ok" : "warn")}>{st?.enabled ? "On" : "Off"}</span>
          </div>

          {!st?.enabled && !setup && (
            <div style={{ marginTop: 10 }}>
              <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.55, margin: "0 0 10px" }}>
                Adds a 6-digit code from an authenticator app (Google Authenticator, Authy, 1Password)
                to every sign-in. No phone number, no third party: the secret lives only here and on your device.
              </p>
              <button className="btn pri" onClick={begin}>Set up two-factor</button>
            </div>
          )}

          {setup && (
            <div style={{ marginTop: 10 }}>
              <p style={{ fontSize: 12.5, margin: "0 0 8px" }}>1. Scan this with your authenticator app:</p>
              <img src={setup.qr} alt="TOTP enrollment QR code" style={{ width: 168, height: 168, border: "1px solid var(--line)", borderRadius: 6 }} />
              <p className="muted" style={{ fontSize: 11.5, margin: "6px 0 12px" }}>Can't scan? Enter this key manually: <span className="mono">{setup.secret}</span></p>
              <p style={{ fontSize: 12.5, margin: "0 0 6px" }}>2. Enter the code it shows:</p>
              <div style={{ display: "flex", gap: 8 }}>
                <input className="in" style={{ maxWidth: 140 }} inputMode="numeric" placeholder="123456"
                       value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && enable()} />
                <button className="btn pri" onClick={enable} disabled={code.length < 6}>Turn on</button>
              </div>
            </div>
          )}

          {st?.enabled && (
            <div style={{ marginTop: 10 }}>
              <p style={{ fontSize: 12.5, margin: "0 0 6px" }}>Enter a current code to turn two-factor off:</p>
              <div style={{ display: "flex", gap: 8 }}>
                <input className="in" style={{ maxWidth: 140 }} inputMode="numeric" placeholder="123456"
                       value={code} onChange={(e) => setCode(e.target.value)} />
                <button className="btn" onClick={disable} disabled={code.length < 6}>Turn off</button>
              </div>
            </div>
          )}

          {msg && <div className="notice" style={{ marginTop: 12 }}>{msg}</div>}

          <div style={{ borderTop: "1px solid var(--line)", marginTop: 16, paddingTop: 12 }}>
            <div className="rowline">
              <span style={{ flex: 1 }}>Active sessions</span>
              <span className="mono">{st?.sessions ?? "-"}</span>
            </div>
            <button className="btn sm" style={{ marginTop: 6 }} onClick={onLogoutAll}>Sign out of all devices</button>
          </div>
        </div>
      </div>
    </div>
  );
}


function NameRow({ me, onRenamed }) {
  const [name, setName] = useState(me?.name || "");
  const [saved, setSaved] = useState("");
  const save = async () => {
    setSaved("");
    try {
      await raw("/me/", { method: "POST", body: { name } });
      setSaved(me?.role === "supplier"
        ? "Saved. Your company name is updated everywhere. Historical records keep the old name."
        : "Saved. Your display name is updated. Historical records keep the old name.");
      onRenamed && onRenamed();
    } catch (e) { setSaved(e.message); }
  };
  return (
    <div style={{ borderBottom: "1px solid var(--line)", paddingBottom: 12, marginBottom: 12 }}>
      <label className="lbl">{me?.role === "supplier" ? "Company name" : "Display name"}</label>
      <div style={{ display: "flex", gap: 8 }}>
        <input className="in" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} />
        <button className="btn" onClick={save} disabled={name.trim().length < 2 || name === me?.name}>Rename</button>
      </div>
      {saved && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{saved}</div>}
    </div>
  );
}
