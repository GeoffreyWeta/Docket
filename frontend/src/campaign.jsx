/* The registration drive — asking an imported register to come and sign up.

   This is the only screen in the workspace whose button reaches ~1,300
   companies outside it, and cannot be recalled. So it is built as a preview
   that happens to have a send button, not a send button that happens to show a
   preview:

   * The numbers come first and the action last.
   * Every exclusion is named with its reason and its count. "1,307 of 1,436"
     is only trustworthy if the other 129 are accounted for.
   * The confirmation is the count itself, typed by the operator. A hold-to-
     confirm would be muscle memory by the second time; typing 1307 requires
     having read the 1307.
   * Whether mail actually leaves the building is stated in the dialog, because
     the difference between a console-logged demo and 1,300 real emails is the
     single most important thing on this screen.
*/
import React, { useEffect, useState } from "react";

import { Empty } from "./atoms";
import { Meter } from "./charts";
import { Icon } from "./icons";
import { Dialog } from "./ui";

export function CampaignDialog({ api, onClose }) {
  const { act, toast, refresh } = api;
  const [pre, setPre] = useState(null);
  const [err, setErr] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try { setPre(await act.campaignPreview()); setErr(""); }
    catch (e) { setErr(e.message || "Could not read the register."); }
  };
  useEffect(() => { load(); }, []);

  const start = async () => {
    setBusy(true);
    try {
      const out = await act.campaignStart(Number(confirm));
      setPre(out);
      setConfirm("");
      toast.ok("Registration drive started",
               `${out.state.sent} sent so far. The rest go out in batches of ${out.batch} as the workspace ticks over.`);
      refresh();
    } catch (e) {
      setErr(e.message || "Could not start the drive.");
    }
    setBusy(false);
  };

  const stop = async () => {
    setBusy(true);
    try { setPre(await act.campaignStop()); toast.ok("Drive paused", "No further invitations will be sent."); }
    catch (e) { setErr(e.message || "Could not pause the drive."); }
    setBusy(false);
  };

  if (!pre) {
    return (
      <Dialog title="Invite the register to sign up" onClose={onClose}>
        {err ? <div className="notice warn">{err}</div> : <Empty>Reading the register…</Empty>}
      </Dialog>
    );
  }

  const running = pre.state.running;
  const armed = Number(confirm) === pre.toSend && pre.toSend > 0;
  const skipped = pre.skipped;
  const totalSkipped = pre.total - pre.toSend;

  return (
    <Dialog
      title="Invite the register to sign up"
      onClose={onClose}
      footer={
        running ? (
          <>
            <button className="btn" onClick={onClose}>Close</button>
            <button className="btn wax" onClick={stop} disabled={busy}>Pause the drive</button>
          </>
        ) : (
          <>
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn pri" onClick={start} disabled={!armed || busy}>
              {busy ? "Starting…" : `Send ${pre.toSend.toLocaleString()} invitations`}
            </button>
          </>
        )
      }>

      {err && <div className="notice warn" style={{ marginBottom: 12 }}>{err}</div>}

      {/* Live or not. First, largest, and unmissable. */}
      <div className={"cmpmode " + (pre.live ? "live" : "dry")}>
        <Icon n={pre.live ? "mail" : "shield"} s={16} />
        <div>
          {pre.live ? (
            <><b>Email is live.</b> These messages will be delivered to real mailboxes
              and cannot be recalled.</>
          ) : (
            <><b>Email is not configured.</b> Messages will be written to the server log
              instead of sent, so this is safe to run as a rehearsal. Set{" "}
              <code>EMAIL_HOST</code> to send for real.</>
          )}
        </div>
      </div>

      {running && (
        <div className="notice" style={{ marginTop: 12 }}>
          <b>A drive is running.</b> {pre.state.sent.toLocaleString()} invitation(s) sent,{" "}
          {pre.toSend.toLocaleString()} still queued, {pre.batch} per sweep.
          {pre.state.failed > 0 && <> {pre.state.failed} address(es) failed and are listed on the register.</>}
        </div>
      )}

      {/* Who gets one. */}
      <div className="cmpfig">
        <div className="cmpnum">{pre.toSend.toLocaleString()}</div>
        <div className="cmplbl">
          vendor{pre.toSend === 1 ? "" : "s"} would be emailed
          {pre.distinctAddresses !== pre.toSend && (
            <> · <b>{pre.distinctAddresses.toLocaleString()}</b> distinct addresses
              <span className="faint"> (the register holds the same mailbox more than once; each gets one email)</span></>
          )}
        </div>
      </div>

      <div style={{ margin: "14px 0" }}>
        <Meter label="Of the whole register" value={pre.toSend} max={pre.total}
               format={(n) => n.toLocaleString()} />
      </div>

      {/* Who does not, and why. The reason each is skipped is the part that
          makes the headline number checkable. */}
      <div className="cmpskip">
        <div className="cmpskiphead">
          Not contacted — {totalSkipped.toLocaleString()} of {pre.total.toLocaleString()}
        </div>
        <SkipRow n={skipped.noEmail} label="no email address on the register"
                 note="nothing to send to" />
        <SkipRow n={skipped.alreadyRegistered} label="already have an account"
                 note="they've registered; asking again is noise" />
        <SkipRow n={skipped.alreadyInvited} label="already invited"
                 note="one invitation each, so a second run never double-mails" />
        <SkipRow n={skipped.heldOut} label="declined or held out"
                 note="somebody said no to this vendor; the system shouldn't overrule it" />
      </div>

      <div className="cmpwhat">
        <b>What each one receives:</b> a short note saying the organisation now runs its
        tendering through DOCKET, that their company is already on the register, and a
        single-use link to claim an account. The link attaches their login to the record
        you already hold — same vendor code, same category, same history — rather than
        creating a duplicate.
      </div>

      {!running && pre.toSend > 0 && (
        <div className="frow" style={{ marginTop: 14, marginBottom: 0 }}>
          <label className="lbl" htmlFor="cmp-confirm">
            Type <b>{pre.toSend.toLocaleString()}</b> to confirm you have read the number above
          </label>
          <input id="cmp-confirm" className="in" inputMode="numeric" autoComplete="off"
                 placeholder={String(pre.toSend)} value={confirm}
                 onChange={(e) => setConfirm(e.target.value.replace(/[^0-9]/g, ""))} />
          <div className="hint">
            Sending goes out {pre.batch} at a time in the background, so a large register
            clears over hours rather than in one burst. You can pause it at any point.
          </div>
        </div>
      )}

      {!running && pre.toSend === 0 && (
        <div className="notice" style={{ marginTop: 14 }}>
          There is nobody left to invite. Every vendor with an address on file has already
          been contacted or already has an account.
        </div>
      )}
    </Dialog>
  );
}

function SkipRow({ n, label, note }) {
  if (!n) return null;
  return (
    <div className="cmpskiprow">
      <span className="mono">{n.toLocaleString()}</span>
      <span>{label}<span className="faint"> — {note}</span></span>
    </div>
  );
}

export const CAMPAIGN_CSS = `
.cmpmode{display:flex;gap:10px;align-items:flex-start;padding:11px 13px;border-radius:9px;
  font-size:12.5px;line-height:1.55}
.cmpmode.live{background:var(--wax-tint);border:1px solid var(--chip-warn-line);color:var(--ink)}
.cmpmode.dry{background:var(--sunk);border:1px solid var(--line);color:var(--muted)}
.cmpmode code{font-family:var(--font-mono);font-size:11.5px;background:var(--card);
  padding:1px 5px;border-radius:4px;border:1px solid var(--line)}

.cmpfig{margin-top:16px}
.cmpnum{font-family:var(--font-sans);font-size:40px;font-weight:600;line-height:1;
  color:var(--ink);font-variant-numeric:normal}
.cmplbl{font-size:12.5px;color:var(--muted);margin-top:5px;line-height:1.5}

.cmpskip{border:1px solid var(--line);border-radius:9px;overflow:hidden}
.cmpskiphead{background:var(--sunk);padding:8px 12px;font-size:11.5px;font-weight:600;
  color:var(--muted);border-bottom:1px solid var(--line)}
.cmpskiprow{display:flex;gap:12px;padding:8px 12px;font-size:12.5px;color:var(--ink);
  border-bottom:1px solid var(--hair);align-items:baseline}
.cmpskiprow:last-child{border-bottom:0}
.cmpskiprow .mono{flex:0 0 56px;text-align:right;font-size:12px;
  font-variant-numeric:tabular-nums;color:var(--muted)}

.cmpwhat{margin-top:14px;font-size:12.5px;color:var(--muted);line-height:1.6}
.cmpwhat b{color:var(--ink)}
`;
