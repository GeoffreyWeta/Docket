/* INVITING STAFF FROM A SPREADSHEET.

   Three moments, in one dialog. First the file it expects (csvguide.jsx), so
   whoever is preparing it knows the columns before they build four hundred
   rows. Then what was read: who will be invited, as what, and every row that
   will not be, with its row number and the reason, because the person fixing
   it is looking at the spreadsheet. Only then the send, because an email
   cannot be unsent. The server re-checks every row it is sent back
   (invite_views.invite_send); the preview is a courtesy, not a permission. */
import React, { useRef, useState } from "react";

import { raw, uploadFile } from "./api";
import { CsvGuide, staffCsv } from "./csvguide";
import { Choice } from "./fields";
import { Icon } from "./icons";
import { Dialog } from "./ui";

/** `roles` is [{value, label}] as the team endpoint serves it. */
export function StaffCsvDialog({ api, roles, onClose, onSent }) {
  const { toast } = api;
  const input = useRef(null);
  const [role, setRole] = useState("");   // for rows whose own role cell is blank
  const [pv, setPv] = useState(null);     // what the server read from the file
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const label = (key) => (roles.find((r) => r.value === key) || {}).label || key;

  const read = async (file) => {
    if (!file) return;
    setBusy(true); setProblem("");
    try {
      setPv(await uploadFile("/invites/parse/", file, { audience: "people", role }));
    } catch (e) {
      setProblem(e.message || "Could not read that file.");
    }
    setBusy(false);
  };

  const send = async () => {
    setBusy(true); setProblem("");
    try {
      const r = await raw("/invites/send/", {
        method: "POST", body: { audience: "people", role, rows: pv.ready },
      });
      setBusy(false);
      onClose();
      if (onSent) onSent();
      if (r.failed) {
        toast.warn(`${r.sent} sent, ${r.failed} couldn't be sent`,
                   "Not sent: " + (r.notSent || []).map((x) => `${x.email} (${x.why || "not sent"})`).join(", "));
      } else {
        toast.ok(`${r.sent} invitation${r.sent === 1 ? "" : "s"} sent`,
                 "Each person sets their own password from the link in their email.");
      }
    } catch (e) {
      setProblem(e.message || "The invitations did not go out.");
      setBusy(false);
    }
  };

  const ready = pv ? pv.ready : [];
  const tooMany = pv && ready.length > pv.sendCap;
  const picker = (
    <input ref={input} type="file" hidden accept=".csv,.xlsx,.xlsm,text/csv"
           onChange={(e) => { read(e.target.files && e.target.files[0]); e.target.value = ""; }} />
  );

  if (!pv) {
    return (
      <Dialog wide title="Invite staff from a spreadsheet" onClose={onClose} footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn pri" disabled={busy} onClick={() => input.current && input.current.click()}>
            <Icon n="upload" s={14} />{busy ? "Reading…" : "Choose the file"}
          </button>
        </>
      }>
        <CsvGuide spec={staffCsv(roles)} />
        <div className="frow" style={{ marginBottom: 0 }}>
          <label className="lbl" htmlFor="si-role">Role for anyone whose role cell is blank</label>
          <Choice id="si-role" options={roles.map((r) => [r.value, r.label])} value={role} onChange={setRole}
                  placeholder="None: a blank role is left out" />
          <div className="hint">Nothing is sent yet. You see who would be invited, and who would not and why, first.</div>
        </div>
        {problem && <div className="notice wax" style={{ marginTop: 12, marginBottom: 0 }}>{problem}</div>}
        {picker}
      </Dialog>
    );
  }

  return (
    <Dialog wide title="Send these invitations?" onClose={() => !busy && onClose()} footer={
      <>
        <button className="btn" disabled={busy} onClick={() => { setPv(null); setProblem(""); }}>Use a different file</button>
        <button className="btn pri" disabled={busy || !ready.length || tooMany} onClick={send}>
          {busy ? "Sending…" : !ready.length ? "Nobody to invite"
            : `Send ${ready.length} invitation${ready.length === 1 ? "" : "s"}`}
        </button>
      </>
    }>
      <p className="hint" style={{ marginTop: 0 }}>
        {pv.howRead === "scanned"
          ? "No column headings were recognised, so every cell was searched for addresses. Check the names before you send."
          : `Read by column: ${(pv.columns || []).join(", ")}.`}
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <span className="chip ok">{ready.length} ready to invite</span>
        {pv.rejected.length > 0 && <span className="chip warn">{pv.rejected.length} left out</span>}
      </div>
      {tooMany && (
        <div className="notice wax" style={{ marginTop: 0 }}>
          That is {ready.length} people, and one send takes at most {pv.sendCap}. Split the file and send it in parts.
        </div>
      )}
      {ready.length > 0 && (
        <div className="tscroll">
          <table className="tbl wide">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Job title</th></tr></thead>
            <tbody>
              {ready.map((r) => (
                <tr key={r.email}>
                  <td>{r.name || <span className="faint">from their email</span>}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{r.email}</td>
                  <td>{label(r.role)}</td>
                  <td>{r.title || <span className="faint">none</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pv.rejected.length > 0 && (
        <details style={{ marginTop: 12 }} open={!ready.length}>
          <summary className="hint">{pv.rejected.length} row{pv.rejected.length === 1 ? "" : "s"} left out, and why</summary>
          {pv.rejected.map((r, i) => (
            <div className="docrow" key={i}>
              <span className="mono faint">row {r.sourceRow}</span>
              <span>{r.email || "no address"}</span>
              <span className="hint" style={{ marginTop: 0 }}>{r.why}</span>
            </div>
          ))}
        </details>
      )}
      {problem && <div className="notice wax" style={{ marginTop: 12, marginBottom: 0 }}>{problem}</div>}
    </Dialog>
  );
}
