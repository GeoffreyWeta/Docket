"""The capability catalogue.

Roles remain the shorthand — "evaluator", "approver", or one you invent like
"ceo" — but what a role *means* is this file plus the AccessRole table.
Effective set for one person:

    role defaults  +  profile.perm_extra  -  profile.perm_revoked

with a superuser holding everything. The built-in role defaults reproduce
exactly what the role checks in views.py enforced before this layer existed, so
an untouched workspace behaves identically; the grants are the deviation, and
every one of them is recorded (see admin_views.py).

Two rules kept out of this file on purpose: a supplier is a supplier (that is
structural — you cannot be granted vendorhood, and no custom role may reach the
vendor side), and sealing is time-based, not permission-based. No grant opens an
envelope before its recorded opening.
"""

ADMIN_ROLE = "superadmin"
SUPPLIER_ROLE = "supplier"

# The four that are code rather than configuration: separation of duties is the
# product, so these cannot be edited or deleted from the console.
BUYER_ROLES = ("procurement", "evaluator", "approver", "auditor")

BUILTIN_LABELS = {
    "procurement": "Procurement — runs tenders",
    "evaluator": "Evaluator — scores blind",
    "approver": "Approver — signs publications & awards",
    "auditor": "Auditor — read-only oversight",
    SUPPLIER_ROLE: "Supplier — bids, sees only their own",
    ADMIN_ROLE: "Administrator — this console only",
}

BUILTIN_TITLES = {
    "procurement": "Procurement",
    "evaluator": "Evaluator",
    "approver": "Approver",
    "auditor": "Internal Audit",
}

# Reserved so a custom role can never shadow a built-in one or a structural role.
RESERVED_ROLE_KEYS = frozenset(BUILTIN_LABELS) | {"system", "administrator", "admin", "root", "none"}

# (id, title, blurb) — the console renders the catalogue in this order.
GROUPS = [
    ("pages", "Navigation", "Which sections appear in their sidebar."),
    ("tenders", "Tenders", "Drafting, publication and the documents attached to a tender."),
    ("bids", "Bids & evaluation", "Openings, scoring, and whose scores a person can see."),
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

    ("bid.open", "bids", "Open sealed bids", "Break the seals in a recorded opening once the deadline has passed."),
    ("bid.score", "bids", "Score bids", "Enter technical scores and justifications as a panel member."),
    ("bid.see_all_scores", "bids", "See the whole panel's scores", "Without this a scorer sees only their own marks — this is what keeps evaluation blind."),
    ("coi.declare", "bids", "Declare conflicts of interest", "Sign the conflict-of-interest declaration before scoring."),
    ("clarification.answer", "bids", "Answer clarifications", "Publish answers to vendor questions."),

    ("award.recommend", "award", "Recommend an award", "Put a bid forward to the approver, and withdraw that recommendation."),
    ("award.see_recommendation", "award", "See recommendations & letters", "The pending recommendation, the award memo and the issued letters."),
    ("award.decide", "award", "Approve awards", "Sign off or reject an award recommendation and issue the letters."),

    ("supplier.prequalify", "suppliers", "Prequalify vendors", "Accept or decline a vendor's registration."),
    ("supplier.invite", "suppliers", "Invite vendors", "Email a vendor an invitation to register."),
    ("supplier.import", "suppliers", "Import the register", "Bulk-load vendors from a register export."),

    ("team.view", "workspace", "See the team", "The member list and pending invitations."),
    ("team.invite", "workspace", "Invite team members", "Issue an invitation with a role attached."),
    ("desk.see_reports", "workspace", "See your reports' desks", "Whose workload rolls up to you. Follows the reporting line, not the role: this shows the work of everyone below you on the org chart and nobody else."),
    ("team.org", "workspace", "Set reporting lines", "Change who reports to whom. Separate from inviting people, because moving a reporting line changes what a manager can see."),
    ("settings.rename", "workspace", "Rename the workspace", "The organisation name and the tender reference prefix."),
    ("settings.threshold", "workspace", "Set the approval matrix", "The value above which publication needs approver sign-off."),

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
    "bid.open", "bid.see_all_scores", "clarification.answer",
    "award.recommend", "award.see_recommendation",
    "supplier.prequalify", "supplier.invite", "supplier.import",
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

def custom_roles():
    """{key: {...}} for every role invented in the console. One query."""
    from .models import AccessRole
    out = {}
    for r in AccessRole.objects.all():
        out[r.key] = {
            "key": r.key, "label": r.label, "title": r.title, "note": r.note,
            "perms": frozenset(set(r.perms or []) & CUSTOM_GRANTABLE),
            "builtin": False, "created": r.created, "createdBy": r.created_by,
        }
    return out


def roles_map(custom=None):
    """Every role the workspace knows: the built-ins, then the invented ones."""
    out = {}
    for key in BUYER_ROLES:
        out[key] = {"key": key, "label": BUILTIN_LABELS[key], "title": BUILTIN_TITLES.get(key, ""),
                    "note": "", "perms": BUILTIN_DEFAULTS[key], "builtin": True}
    for key in (SUPPLIER_ROLE, ADMIN_ROLE):
        out[key] = {"key": key, "label": BUILTIN_LABELS[key], "title": "", "note": "",
                    "perms": BUILTIN_DEFAULTS[key], "builtin": True, "structural": True}
    out.update(custom if custom is not None else custom_roles())
    return out


def role_label(role, custom=None):
    r = roles_map(custom).get(role)
    return r["label"] if r else role


def assignable_roles(custom=None):
    """Roles the console may put a person on: the four built-ins plus every
    custom role. Not `supplier` (vendors arrive by registering) and not
    `superadmin` (that is the administrator flag, not a role)."""
    m = roles_map(custom)
    return [m[k] for k in BUYER_ROLES] + sorted(
        (v for v in m.values() if not v["builtin"]), key=lambda v: v["label"].lower())


def defaults_for(role, custom=None):
    """What the role itself carries, before any per-person deviation."""
    if role in BUILTIN_DEFAULTS:
        return set(BUILTIN_DEFAULTS[role])
    r = (custom if custom is not None else custom_roles()).get(role)
    return set(r["perms"]) if r else set()


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
