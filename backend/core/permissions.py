"""The capability catalogue.

Roles remain the shorthand - "evaluator", "approver", or one you invent like
"ceo" - but what a role *means* is this file plus the AccessRole table plus the
company's own wording for the starter four (OrgSetting "roles", see roles.py).
Effective set for one person:

    role defaults  +  profile.perm_extra  -  profile.perm_revoked

with a superuser holding everything. The starter roles' defaults reproduce
exactly what the role checks in views.py enforced before this layer existed, so
an untouched workspace behaves identically; the grants are the deviation, and
every one of them is recorded (see admin_views.py).

THE STARTER FOUR ARE SUGGESTIONS, NOT VOCABULARY. Every company names its own
jobs, so a workspace may rename them, change what they can do, or retire one
nobody holds. Their keys stay fixed underneath because the audit trail and
every persona already refer to them; only what the key is called and what it
carries is the company's.

Two rules kept out of this file on purpose: a supplier is a supplier (that is
structural - you cannot be granted vendorhood, and no custom role may reach the
vendor side), and sealing is time-based, not permission-based. No grant opens an
envelope before its recorded opening.
"""

ADMIN_ROLE = "superadmin"
SUPPLIER_ROLE = "supplier"

# The starter roles every workspace begins with. Their keys are fixed (events
# and personas refer to them); their names and capabilities are the company's
# to change - see role_overrides().
BUYER_ROLES = ("procurement", "evaluator", "approver", "auditor")

# The kinds of work a role can start from, in plain words. A new role picks one
# and is handed that starter's capabilities, which it can then adjust. Keyed by
# the starter whose defaults it copies.
ROLE_KINDS = {
    "procurement": "Runs tenders and the vendor register",
    "approver": "Signs off tenders and awards",
    "evaluator": "Scores bids",
    "auditor": "Sees everything, changes nothing",
}

BUILTIN_LABELS = {
    "procurement": "Procurement",
    "evaluator": "Evaluator",
    "approver": "Approver",
    "auditor": "Auditor",
    SUPPLIER_ROLE: "Supplier - bids, sees only their own",
    ADMIN_ROLE: "Administrator - this console only",
}

# What a starter role is for, until the company says otherwise.
BUILTIN_NOTES = {
    "procurement": "Drafts tenders, invites vendors, opens the sealed bids. Cannot approve their own work.",
    "evaluator": "Scores bids on their own and never sees anyone else's numbers.",
    "approver": "Signs off publications and awards up to their authority limit.",
    "auditor": "Reads everything, changes nothing.",
}

BUILTIN_TITLES = {
    "procurement": "Procurement",
    "evaluator": "Evaluator",
    "approver": "Approver",
    "auditor": "Internal Audit",
}

# Reserved so a custom role can never shadow a built-in one or a structural role.
RESERVED_ROLE_KEYS = frozenset(BUILTIN_LABELS) | {"system", "administrator", "admin", "root", "none"}

# (id, title, blurb) - the console renders the catalogue in this order.
GROUPS = [
    ("pages", "Navigation", "Which sections appear in their sidebar."),
    ("tenders", "Tenders", "Drafting, publication and the documents attached to a tender."),
    ("bids", "Bids & evaluation", "Openings, scoring, and whose scores a person can see."),
    ("auctions", "Reverse auctions", "Live price competitions: running the room and settling it."),
    ("award", "Award", "Recommending a winner and signing the award off."),
    ("suppliers", "Vendors", "The vendor register and prequalification."),
    ("workspace", "Workspace & people", "Team management and the approval matrix."),
    ("finance", "Finance", "Savings, contracts, payables and the ledger feed."),
    ("oversight", "Oversight & exports", "The audit chain and everything that leaves as a file."),
    ("ai", "Drafting assistant", "The optional AI drafting and review endpoints."),
]

# key, group, label, help
PERMISSIONS = [
    ("page.dashboard", "pages", "Dashboard", "The procurement overview and its live counters."),
    ("page.tenders", "pages", "Tenders", "The full tender list, including drafts."),
    ("page.evals", "pages", "My evaluations", "The evaluator's scoring queue."),
    ("page.approvals", "pages", "Approvals", "The queue of publications and awards awaiting sign-off."),
    ("page.suppliers", "pages", "Vendors", "The vendor register."),
    ("page.scorecards", "pages", "Scorecards", "Vendor performance scorecards."),
    ("page.team", "pages", "Team", "The workspace's people and invitations."),
    ("page.analytics", "pages", "Analytics", "Spend, cycle time and competition analytics."),
    ("page.finance", "pages", "Finance", "Savings, contract monitoring, payment performance and the finance risk register."),
    ("page.audit", "pages", "Audit trail", "The tamper-evident event chain."),
    ("page.portal", "pages", "Vendor portal", "The supplier's own invitations and bid rooms."),

    ("tender.create", "tenders", "Create tenders", "Draft a new tender, or duplicate an existing one as a template."),
    ("tender.edit", "tenders", "Edit drafts", "Change scope, criteria, weights, line items and the invitation list."),
    ("tender.submit", "tenders", "Submit for approval", "Route a draft into the approval queue, or publish it directly below the threshold."),
    ("tender.publish_decision", "tenders", "Approve publication", "Approve or reject a tender waiting to be published."),
    ("tender.addendum", "tenders", "Issue addenda", "Amend a published tender and notify every invited vendor."),
    ("tender.docs", "tenders", "Attach tender documents", "Upload and remove the buyer-side document pack."),
    ("tender.extend", "tenders", "Extend deadlines", "Push a live submission deadline back. Recorded with the old date, the new one and the reason, and every invited vendor is told."),
    ("tender.lifecycle", "tenders", "Pause, resume and cancel", "Suspend a live competition, restart it, or abandon it outright. Cancelling is final: it cannot be undone from the interface."),
    ("tender.vendors", "tenders", "Manage the invitation list", "Add or withdraw vendors on an event that is already live. Separate from editing a draft, because inviting somebody mid-competition changes who is racing."),
    ("tender.rounds", "tenders", "Run bidding rounds", "Open a second or third round against the same event - a best-and-final, or a shortlist re-bid - and close them."),

    ("bid.open", "bids", "Open sealed bids", "Break the seals in a recorded opening once the deadline has passed."),
    ("bid.score", "bids", "Score bids", "Enter technical scores and justifications as a panel member."),
    ("bid.see_all_scores", "bids", "See the whole panel's scores", "Without this a scorer sees only their own marks - this is what keeps evaluation blind."),
    ("coi.declare", "bids", "Declare conflicts of interest", "Sign the conflict-of-interest declaration before scoring."),
    ("clarification.answer", "bids", "Answer clarifications", "Publish answers to vendor questions."),

    ("page.auctions", "auctions", "Reverse auctions", "The auction list and the live rooms."),
    ("auction.create", "auctions", "Create auctions", "Draft a reverse auction, its lots and its rules."),
    ("auction.edit", "auctions", "Edit drafts", "Change lots, opening prices, decrements and the clock before the room opens."),
    ("auction.invite", "auctions", "Invite vendors", "Decide who may bid, and send the invitations."),
    ("auction.open", "auctions", "Open the room", "Start a scheduled auction and let prices be taken."),
    ("auction.lifecycle", "auctions", "Pause, resume, close and cancel", "Stop the clock on a live room, restart it, close it early or abandon it. Closing settles every lot against its reserve."),
    ("auction.monitor", "auctions", "See the live leaderboard", "Watch prices and vendor names while the room is open. Without this a person sees that an auction is running and not what anybody bid."),
    ("auction.award", "auctions", "Award an auction", "Commit to the winning prices once the room has closed."),
    ("auction.retract", "auctions", "Void a bid", "Strike a price from the record with a reason. The row stays; auctions are not editable, only annotated."),

    ("award.recommend", "award", "Recommend an award", "Put a bid forward for sign-off, and withdraw that recommendation."),
    ("award.see_recommendation", "award", "See recommendations & letters", "The pending recommendation, the award memo and the issued letters."),
    ("award.decide", "award", "Approve awards", "Sign off or reject an award recommendation and issue the letters."),

    ("supplier.prequalify", "suppliers", "Prequalify vendors", "Accept or decline a vendor's registration."),
    ("supplier.invite", "suppliers", "Invite vendors", "Email a vendor an invitation to register."),
    ("supplier.import", "suppliers", "Import the register", "Bulk-load vendors from a register export."),
    ("supplier.register", "suppliers", "Register vendors directly", "Type a vendor onto the register yourself, without waiting for them to complete a registration form. They arrive unverified either way."),
    ("supplier.suspend", "suppliers", "Suspend vendors", "Bar a verified vendor from new invitations without striking them off. Separate from prequalification, because lifting a suspension must not mean re-verifying from nothing."),

    ("team.view", "workspace", "See the team", "The member list and pending invitations."),
    ("team.invite", "workspace", "Invite team members", "Issue an invitation with a role attached."),
    ("desk.see_reports", "workspace", "See your reports' desks", "Whose workload rolls up to you. Follows the reporting line, not the role: this shows the work of everyone below you on the org chart and nobody else."),
    ("team.org", "workspace", "Set reporting lines", "Change who reports to whom. Separate from inviting people, because moving a reporting line changes what a manager can see."),
    ("team.roles", "workspace", "Set up roles", "Name the roles in this workspace and choose what each one can do. Nobody may change what their own role can do."),
    ("settings.rename", "workspace", "Rename the workspace", "The organisation name and the tender reference prefix."),
    ("settings.threshold", "workspace", "Set the approval matrix", "The value above which publication needs a sign-off."),

    ("finance.payables", "finance", "See payables and vendor exposure", "Invoice, payment and exposure detail down to the individual vendor. Separate from the Finance page itself, so a category manager can be shown savings and spend without being shown what every vendor is owed."),
    ("finance.sync", "finance", "Import the finance ledger", "Load a contract, order, receipt, invoice or payment export from NAV or Business Central."),
    ("finance.baseline", "finance", "Adopt baselines from ledger history", "Give historical awards a prior price derived from imported contracts, so savings can be measured across the years before DOCKET. Separate from importing the ledger: reading history is one thing, deciding it is the number savings are reported against is another."),
    ("finance.dimensions", "finance", "Set the spend dimensions", "The departments, cost centres, projects, regions and funding sources a tender can be coded to."),

    ("audit.integrity", "oversight", "Verify the audit chain", "Recompute every hash and report the first break."),
    ("audit.export", "oversight", "Export the audit trail", "The full event chain as CSV."),
    ("export.comparison", "oversight", "Export bid comparisons", "The scored comparison workbook."),
    ("export.memo", "oversight", "Export award memos", "The signed award memorandum as PDF."),
    ("export.compliance", "oversight", "Export compliance reports", "The per-tender compliance report as PDF."),

    ("ai.use", "ai", "Use the drafting assistant", "Scope and criteria drafting, bid review, clarification answers and insights."),
]

CATALOGUE = [{"key": k, "group": g, "label": lb, "help": h} for k, g, lb, h in PERMISSIONS]
ALL_KEYS = frozenset(p["key"] for p in CATALOGUE)

_PROCUREMENT = {
    "page.dashboard", "page.tenders", "page.suppliers", "page.scorecards",
    "page.team", "page.analytics", "page.audit", "page.finance",
    "tender.create", "tender.edit", "tender.submit", "tender.addendum", "tender.docs",
    "tender.extend", "tender.lifecycle", "tender.vendors", "tender.rounds",
    "bid.open", "bid.see_all_scores", "clarification.answer",
    "award.recommend", "award.see_recommendation",
    "page.auctions", "auction.create", "auction.edit", "auction.invite",
    "auction.open", "auction.lifecycle", "auction.monitor", "auction.retract",
    "supplier.prequalify", "supplier.invite", "supplier.import",
    "supplier.register", "supplier.suspend",
    "team.view", "team.invite", "team.org", "desk.see_reports", "settings.rename",
    "audit.integrity", "audit.export",
    "export.comparison", "export.memo", "export.compliance",
    "finance.payables", "finance.sync", "finance.dimensions", "finance.baseline",
    "ai.use",
}

_EVALUATOR = {"page.evals", "page.audit", "bid.score", "coi.declare"}

_APPROVER = {
    "page.approvals", "page.tenders", "page.scorecards", "page.audit", "page.finance",
    "tender.publish_decision", "award.decide",
    # The same separation as a tender: procurement runs the room, the approver
    # commits the money. auction.award is deliberately absent from _PROCUREMENT
    # for exactly the reason award.decide is.
    "page.auctions", "auction.monitor", "auction.award",
    "bid.see_all_scores", "award.see_recommendation",
    "settings.rename", "settings.threshold",
    "team.view", "desk.see_reports",
    "audit.integrity", "audit.export",
    "export.comparison", "export.memo", "export.compliance",
    "finance.payables",
}

# Read-only oversight, and that now includes the money. An auditor who can see
# the award but not the invoice paid against it cannot follow the transaction
# to its end, which is the one thing the role exists to do. No finance.sync:
# reading the ledger is oversight, loading it is an operation.
_AUDITOR = {
    "page.audit", "page.tenders", "page.scorecards", "page.finance",
    "page.auctions", "auction.monitor",
    "bid.see_all_scores", "award.see_recommendation",
    "audit.integrity", "audit.export",
    "export.comparison", "export.memo", "export.compliance",
    "finance.payables",
}

BUILTIN_DEFAULTS = {
    "procurement": frozenset(_PROCUREMENT),
    "evaluator": frozenset(_EVALUATOR),
    "approver": frozenset(_APPROVER),
    "auditor": frozenset(_AUDITOR),
    SUPPLIER_ROLE: frozenset({"page.portal"}),
    ADMIN_ROLE: frozenset(),   # the console is authorised by is_superuser, not by these
}

# Granting a supplier a buyer-side capability is not a permission decision, it
# is a category error: they sit on the other side of the seal. The console
# offers them nothing, and the resolver drops it if something else tries.
SUPPLIER_ALLOWED = frozenset({"page.portal"})

# A custom role is a buyer-side role. It may hold anything except the vendor
# portal, which belongs to accounts that have a vendor record behind them.
CUSTOM_GRANTABLE = frozenset(ALL_KEYS - {"page.portal"})


# ---------------- the role registry ----------------

def role_overrides():
    """{starter key: {label, note, title, perms, hidden}} - what this company
    calls each starter role and what it lets it do. Kept on the settings row
    beside the approval ladder; an absent entry means "as shipped"."""
    from .models import OrgSetting
    row = OrgSetting.objects.filter(pk=1).first()
    raw = ((row.data or {}).get("roles") if row else None) or {}
    return {k: v for k, v in raw.items() if k in BUYER_ROLES and isinstance(v, dict)}


def starter_role(key, override=None):
    """One starter role as this company has shaped it."""
    o = override or {}
    named = str(o.get("label") or "").strip()
    perms = (BUILTIN_DEFAULTS[key] if o.get("perms") is None
             else frozenset(set(o["perms"]) & CUSTOM_GRANTABLE))
    return {"key": key, "label": named or BUILTIN_LABELS[key],
            "title": str(o.get("title") or "").strip() or named or BUILTIN_TITLES.get(key, ""),
            "note": str(o["note"]).strip() if o.get("note") is not None else BUILTIN_NOTES[key],
            "perms": perms, "builtin": True, "hidden": bool(o.get("hidden"))}


def custom_roles():
    """{key: {...}} for every role this company has shaped: the starters it
    renamed, reshaped or retired, and every role it invented. Two queries.

    The starters ride along in here, rather than in a second registry, because
    this dict is what every caller already threads through `resolve` - so a
    starter the company has re-scoped is re-scoped everywhere at once."""
    from .models import AccessRole
    out = {k: starter_role(k, o) for k, o in role_overrides().items()}
    for r in AccessRole.objects.all():
        out[r.key] = {
            "key": r.key, "label": r.label, "title": r.title, "note": r.note,
            "perms": frozenset(set(r.perms or []) & CUSTOM_GRANTABLE),
            "builtin": False, "hidden": False, "created": r.created, "createdBy": r.created_by,
        }
    return out


def roles_map(custom=None):
    """Every role the workspace knows: the starters, then the invented ones.
    Retired starters stay in here so old events and invitations still read."""
    out = {key: starter_role(key) for key in BUYER_ROLES}
    for key in (SUPPLIER_ROLE, ADMIN_ROLE):
        out[key] = {"key": key, "label": BUILTIN_LABELS[key], "title": "", "note": "",
                    "perms": BUILTIN_DEFAULTS[key], "builtin": True, "structural": True,
                    "hidden": False}
    out.update(custom if custom is not None else custom_roles())
    return out


def role_label(role, custom=None):
    r = roles_map(custom).get(role)
    return r["label"] if r else role


def assignable_roles(custom=None):
    """Roles a person may be put on: the starters the company still uses, then
    every invented role. Not `supplier` (vendors arrive by registering) and not
    `superadmin` (that is the administrator flag, not a role)."""
    m = roles_map(custom)
    return [m[k] for k in BUYER_ROLES if not m[k].get("hidden")] + sorted(
        (v for v in m.values() if not v["builtin"]), key=lambda v: v["label"].lower())


def defaults_for(role, custom=None):
    """What the role itself carries, before any per-person deviation."""
    r = (custom if custom is not None else custom_roles()).get(role)
    if r:
        return set(r["perms"])
    return set(BUILTIN_DEFAULTS.get(role, ()))


def resolve(role, extra=(), revoked=(), superadmin=False, custom=None):
    """The effective capability set for one person."""
    if superadmin:
        # Everything on the buyer side. Not the vendor portal: that belongs to
        # accounts with a vendor record behind them, and there is nothing for it
        # to show anyone else.
        if role == SUPPLIER_ROLE:
            return set(SUPPLIER_ALLOWED)
        return set(ALL_KEYS) - {"page.portal"}
    keys = defaults_for(role, custom) | (set(extra or ()) & ALL_KEYS)
    keys -= set(revoked or ())
    if role == SUPPLIER_ROLE:
        keys &= SUPPLIER_ALLOWED
    return keys


def grantable_for(role):
    """What the console is willing to offer for a role: everything on the buyer
    side, nothing for vendors, and nothing for the console-only administrator
    identity (its authority is the flag, not a grant)."""
    if role == SUPPLIER_ROLE:
        return set(SUPPLIER_ALLOWED)
    if role == ADMIN_ROLE:
        return set()
    if role in BUYER_ROLES:
        return set(ALL_KEYS)
    return set(CUSTOM_GRANTABLE)


def has(identity, key):
    """`identity` is the dict returned by Profile.identity."""
    return key in (identity.get("perms") or ())
