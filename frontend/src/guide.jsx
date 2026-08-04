/* Role-aware Getting Started guide. Auto-opens on a user's first sign-in,
   always reachable from the "Guide" button in the top bar. */
import React from "react";

const G = {
  procurement: {
    title: "You run the tenders",
    steps: [
      ["Load your supplier book", "Suppliers → Import CSV (columns: name, category, location, email, prequalified), or invite vendors to register themselves."],
      ["Create a tender", "New tender → let the AI draft the scope and criteria, add line items, invite prequalified suppliers. Duplicate any past tender to reuse it as a template."],
      ["Publish", "Below the approval threshold it publishes instantly; at or above, it routes to the approver. Invitations email automatically."],
      ["Run the middle game", "Answer clarifications (published to everyone), issue addenda, and watch sealed bids arrive: you can count them but never see inside."],
      ["Open the bids", "After the deadline, break the seals in a recorded ceremony. Two-stage tenders open technical envelopes first; auctions just need results recorded."],
      ["Award", "Once the panel has scored, recommend a winner, and the memo writes itself and goes to the approver. Letters issue automatically on sign-off."],
      ["Keep the register healthy", "The bell warns you about expiring vendor documents and registrations waiting for review."],
    ],
  },
  evaluator: {
    title: "You score blind",
    steps: [
      ["Wait for the opening", "You'll be emailed the moment scoring opens on a tender you're panelled on."],
      ["Sign the declaration", "Scoring is locked until you sign the conflict-of-interest declaration, which is recorded in the audit trail."],
      ["Read, then score", "Download each technical proposal from the scoring card, score 0–10 per criterion, and write a short justification: auditors will ask why."],
      ["Stay blind", "You only ever see your own scores. The consensus matrix goes to the chair, never to you, so nobody anchors on a colleague."],
      ["Don't stall", "The award is blocked until every evaluator finishes. You'll be nudged after three days."],
    ],
  },
  approver: {
    title: "You are the control",
    steps: [
      ["Watch your queue", "Two piles: publications (tenders above the threshold) and awards (panel recommendations with memos). You're emailed when anything lands."],
      ["Read the memo", "Scores, savings vs budget, and any flags (abnormally low pricing, panel splits). Download it as PDF if you want it on file."],
      ["Approve or return", "Approve an award and letters issue instantly to every bidder. Return it and the panel gets your questions."],
      ["Set the matrix", "You decide the approval threshold: everything at or above it needs you; everything below publishes directly."],
    ],
  },
  auditor: {
    title: "You see everything, change nothing",
    steps: [
      ["Read the trail", "Every action in the workspace, named and timestamped. Filter by tender."],
      ["Verify integrity", "One click recomputes the hash chain. If any historical entry was altered, it tells you exactly which one."],
      ["Pull the evidence", "Export the full trail as CSV (hashes included) or a per-tender compliance report as PDF: invitation list, sealing, COI signatures, scores, award, all in one document."],
      ["Check the humans", "Scores come with written justifications, and every evaluator's conflict-of-interest declaration is on record."],
    ],
  },
  supplier: {
    title: "How to win work here",
    steps: [
      ["Get prequalified", "Upload your compliance documents (tax clearance, certifications) with expiry dates from your company profile. The buyer reviews and approves; you're notified either way."],
      ["Answer invitations", "Invitations arrive by email. Open the bid room: read the scope, download tender documents, and ask questions: answers are published to all bidders, anonymised."],
      ["Bid properly", "Upload your technical proposal (required) and commercial documents, price the lines, sign the declaration, seal the bid. You can withdraw and resubmit until the deadline."],
      ["Trust the seal", "Your price is encrypted until the recorded opening: nobody, including the buyer, can see it early. In two-stage tenders, if you don't pass technical, your price is never seen at all."],
      ["Auctions are different", "In a reverse auction you see your live rank, never a competitor's price. Each bid must undercut your last by the minimum decrement."],
      ["Stay eligible", "You're reminded before your documents expire, so renew them from your profile to keep getting invited."],
    ],
  },
};

/* A workspace can invent its own roles, and an invented role has no written
   guide. Assemble one from what the person can actually do, in the order the
   work happens. Falling through to another role's guide would be worse than
   saying nothing: it would describe someone else's job. */
const CAP_STEPS = [
  ["tender.create", "Draft tenders", "New tender → scope, criteria and line items, then invite prequalified vendors."],
  ["tender.submit", "Put them forward", "Below the approval threshold a tender publishes directly; at or above it routes to whoever approves publications."],
  ["tender.publish_decision", "Approve publications", "Your queue holds tenders waiting to go out. Approve and the invitations email themselves."],
  ["clarification.answer", "Answer questions", "Vendor questions are answered once and published to every bidder, anonymised."],
  ["bid.open", "Open the bids", "After the deadline, break the seals in a recorded opening. Nobody sees a price before that, including you."],
  ["bid.score", "Score", "Sign the conflict-of-interest declaration, then score each criterion and say why in writing."],
  ["bid.see_all_scores", "Read the panel", "You see the whole panel's marks and the consensus matrix, not just your own."],
  ["award.recommend", "Recommend a winner", "The memo writes itself from the scores and goes to whoever signs awards off."],
  ["award.decide", "Sign awards off", "Approve and the award and regret letters issue instantly. Return it and the panel gets your questions."],
  ["supplier.prequalify", "Keep the register clean", "Review registrations and expiring compliance documents from the Vendors page."],
  ["settings.threshold", "Set the approval matrix", "You decide the value above which publication needs a sign-off."],
  ["audit.integrity", "Verify the trail", "One click recomputes the hash chain and names the first altered entry, if there is one."],
  ["audit.export", "Pull the evidence", "The full event chain as CSV, hashes included."],
];

function fromCapabilities(user) {
  const perms = user?.perms || [];
  const steps = CAP_STEPS.filter(([k]) => perms.includes(k)).map(([, t, d]) => [t, d]);
  return {
    title: user?.title ? `You are ${user.title}` : "Your workspace",
    steps: steps.length ? steps : [[
      "Nothing assigned yet",
      "Your account exists but carries no capabilities. Ask whoever administers this workspace to give you the access your job needs.",
    ]],
  };
}

export function seenKey(username) {
  return `docket_guide_seen_${username || "anon"}`;
}

export function GuidePanel({ role, user, onClose }) {
  const g = G[role] || fromCapabilities(user);
  return (
    <div className="panelwrap" onClick={onClose} role="dialog" aria-label="Getting started guide">
      {/* .panel is a bottom sheet on a phone and a centred card above that,
          with the head (and its close button) pinned while the steps scroll */}
      <div className="card panel" onClick={(e) => e.stopPropagation()}>
        <div className="chead">
          <h3>Getting started: {g.title}</h3>
          <button className="btn sm" style={{ marginLeft: "auto" }} onClick={onClose}>Close</button>
        </div>
        <div className="cbody">
          {g.steps.map(([head, body], i) => (
            <div key={i} style={{ display: "flex", gap: 12, padding: "10px 0", borderBottom: i < g.steps.length - 1 ? "1px dashed var(--line)" : "none" }}>
              <span className="mono" style={{ color: "var(--brass)", fontSize: 13, minWidth: 20, paddingTop: 1 }}>{String(i + 1).padStart(2, "0")}</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 2 }}>{head}</div>
                <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.55 }}>{body}</div>
              </div>
            </div>
          ))}
          <div className="muted" style={{ fontSize: 11.5, marginTop: 12 }}>
            Reopen this any time from the Guide button in the top bar. Everything described here is enforced
            by the server, not the interface: the rules hold even if the screen doesn't.
          </div>
        </div>
      </div>
    </div>
  );
}
