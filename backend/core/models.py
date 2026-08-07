"""DOCKET data model.

Timestamps are epoch milliseconds (BigInteger) end to end so the API payload
matches the frontend with zero conversion. JSON fields mirror the shapes the
UI consumes; sealing/blindness is enforced at serialization time in views.
"""
from django.db import models


class Persona(models.Model):
    """Buyer-side demo personas (procurement / evaluator / approver / auditor)."""
    id = models.CharField(primary_key=True, max_length=16)
    name = models.CharField(max_length=80)
    role = models.CharField(max_length=20)
    title = models.CharField(max_length=80)

    # Who this person reports to. Separate from `role` on purpose: a role says
    # what you may do, a reporting line says whose work you may see. A CFO and a
    # buyer can hold the same capability and still owe an account to different
    # people, and rolling a team's numbers up needs the second fact, not the
    # first. Nulled rather than cascaded when a manager leaves, so deleting a
    # manager never deletes their reports.
    manager = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL,
                                related_name="reports")

    def __str__(self):
        return f"{self.name} ({self.role})"

    def chain(self):
        """This person's management chain, nearest first. Cycle-safe: a loop
        introduced by an administrator stops the walk instead of hanging the
        request that discovered it."""
        out, seen, node = [], {self.id}, self.manager
        while node and node.id not in seen:
            out.append(node)
            seen.add(node.id)
            node = node.manager
        return out

    def descendants(self):
        """Everyone below this person, at any depth. One query, walked in memory:
        the org is tens of people, not thousands, and a recursive CTE here would
        buy nothing but a SQLite dependency."""
        everyone = list(Persona.objects.all())
        kids = {}
        for p in everyone:
            kids.setdefault(p.manager_id, []).append(p)
        out, stack, seen = [], list(kids.get(self.id, [])), {self.id}
        while stack:
            p = stack.pop()
            if p.id in seen:
                continue
            seen.add(p.id)
            out.append(p)
            stack.extend(kids.get(p.id, []))
        return out


class Supplier(models.Model):
    id = models.CharField(primary_key=True, max_length=16)
    name = models.CharField(max_length=120)
    contact_email = models.CharField(max_length=200, blank=True, default="")
    registered_at = models.BigIntegerField(null=True, blank=True)  # set for self-registered vendors
    rejected_reason = models.CharField(max_length=300, blank=True, default="")
    category = models.CharField(max_length=60)
    location = models.CharField(max_length=60)
    rating = models.FloatField(default=0)
    prequalified = models.BooleanField(default=False)
    docs = models.JSONField(default=list)   # [{name, expiry(ms)}]
    perf = models.JSONField(default=dict)   # {onTime, quality}

    # --- the vendor master ------------------------------------------------
    # Filled by `manage.py import_vendors` from the register export. `category`
    # above is the normalised bucket the app filters on; `classification` keeps
    # the register's own words, because a mapping nobody can audit is a mapping
    # nobody should trust.
    code = models.CharField(max_length=24, blank=True, default="")   # NAV / RP code
    classification = models.CharField(max_length=140, blank=True, default="")
    # Second layer under `category`, derived from `classification` by
    # taxonomy.subcategory_for. Blank means the rules could not place this
    # vendor below its category — an honest gap, not an "Other" bucket.
    subcategory = models.CharField(max_length=60, blank=True, default="")
    contact_person = models.CharField(max_length=140, blank=True, default="")
    phone = models.CharField(max_length=120, blank=True, default="")
    address = models.CharField(max_length=300, blank=True, default="")
    payment_terms = models.CharField(max_length=80, blank=True, default="")
    # Registration-drive state. `invited_at` is the guard that stops a vendor
    # being emailed twice by two people running the same campaign a week apart;
    # `invite_error` keeps the reason a send failed so a bad address is visible
    # as a bad address rather than as silence.
    invited_at = models.BigIntegerField(null=True, blank=True)
    invite_count = models.IntegerField(default=0)
    invite_error = models.CharField(max_length=200, blank=True, default="")
    # TIN, bank name, masked account, remarks, any code the vendor was
    # previously registered under, and the original cell behind every
    # normalisation. Never the full account number: see vendor_import.py.
    registry = models.JSONField(default=dict, blank=True)

    # The most this vendor may be owed at once: live contract value not yet paid,
    # plus invoices approved and not yet settled. Zero means no limit has been
    # set, which is reported as "no limit on file" rather than as a limit of
    # nothing — the two are opposite findings and a dashboard that confuses them
    # tells Finance every vendor is in breach.
    exposure_limit = models.BigIntegerField(default=0)

    def __str__(self):
        return self.name


class SpendDimensions(models.Model):
    """The five ways Finance asks "where did the money go".

    Abstract, and inherited by both Tender and Contract, because the question is
    asked of committed spend regardless of whether that commitment started as a
    tender here or arrived from the ledger as a contract nobody tendered. The
    allowed values are organisation configuration (OrgSetting.data["dimensions"]),
    not code: a company reorganises its departments more often than it deploys.

    Blank means *unrecorded*, and unrecorded is reported as its own line rather
    than folded into "Other". A department that cannot see its own spend is a
    department that will not fix its own spend, and burying the gap in a bucket
    labelled "Other" is how the gap survives the review that was supposed to
    close it.
    """
    department = models.CharField(max_length=80, blank=True, default="")
    cost_centre = models.CharField(max_length=40, blank=True, default="")
    project = models.CharField(max_length=120, blank=True, default="")
    region = models.CharField(max_length=60, blank=True, default="")
    funding_source = models.CharField(max_length=80, blank=True, default="")

    DIMENSIONS = (
        ("department", "Department"),
        ("cost_centre", "Cost centre"),
        ("project", "Project"),
        ("region", "Region"),
        ("funding_source", "Funding source"),
    )

    class Meta:
        abstract = True

    def dims(self):
        return {k: (getattr(self, k) or "") for k, _ in self.DIMENSIONS}


class Tender(SpendDimensions):
    id = models.CharField(primary_key=True, max_length=16)
    ref = models.CharField(max_length=40, unique=True)
    title = models.CharField(max_length=200)
    ttype = models.CharField(max_length=8)          # RFI / RFQ / RFP
    category = models.CharField(max_length=60)
    budget = models.BigIntegerField()
    status = models.CharField(max_length=16)        # draft/approval/published/evaluation/awarded
    published_at = models.BigIntegerField(null=True, blank=True)
    deadline = models.BigIntegerField()
    opened_at = models.BigIntegerField(null=True, blank=True)
    awarded_at = models.BigIntegerField(null=True, blank=True)
    awarded_to = models.CharField(max_length=16, null=True, blank=True)
    awarded_amount = models.BigIntegerField(null=True, blank=True)
    award_memo = models.TextField(blank=True, default="")
    tech_weight = models.IntegerField(default=70)
    comm_weight = models.IntegerField(default=30)
    scope = models.TextField(blank=True, default="")
    criteria = models.JSONField(default=list)       # [{id, name, weight}]
    lines = models.JSONField(default=list)          # [{id, desc, qty, unit}]
    addenda = models.JSONField(default=list)        # [{id, at, title, note}]
    invited = models.JSONField(default=list)        # [supplier ids]
    award_rec = models.JSONField(null=True, blank=True)  # {bidId, supplierId, amount, by, at, memo}
    letters = models.JSONField(null=True, blank=True)    # {supplierId: {type, text}}
    coi = models.JSONField(default=dict)                 # {personaId: declaredAt(ms)} — conflict-of-interest sign-offs
    # two-stage envelope opening (technical first; commercial only for compliant bidders)
    two_stage = models.BooleanField(default=False)
    tech_opened_at = models.BigIntegerField(null=True, blank=True)
    tech_threshold = models.IntegerField(default=70)     # min avg technical score (0-100) to reach stage 2
    # reverse auctions (ttype="AUC"): live rank-visible bidding; deadline is the closing time
    auction_min_decrement = models.BigIntegerField(default=0)

    # --- who owns it -------------------------------------------------------
    # Until now a tender belonged to nobody. Attribution existed only as an
    # actor *name* on the audit chain, which is the right place to record what
    # happened and the wrong place to compute who is carrying what: names are
    # not keys, and an auditor's read of the chain is not a workload report.
    # SET_NULL because a tender outlives the person who ran it.
    owner = models.ForeignKey(Persona, null=True, blank=True, on_delete=models.SET_NULL,
                              related_name="owned_tenders")

    # --- what "saving" is measured against ---------------------------------
    # `budget` is a ceiling somebody set before going to market, so budget minus
    # award measures the estimate as much as the negotiation. `baseline` is what
    # this was actually costing before — last year's contract, the incumbent's
    # renewal quote, the price on the shelf. Where it is set, the saving is real
    # and comparable; where it is not, the UI falls back to budget and says so
    # rather than presenting the weaker number as if it were the stronger one.
    baseline = models.BigIntegerField(null=True, blank=True)
    baseline_source = models.CharField(max_length=200, blank=True, default="")

    def savings_basis(self):
        """(amount, basis) — the number to measure the award against and the
        word for where it came from. Never guesses: no baseline means budget."""
        if self.baseline:
            return self.baseline, "baseline"
        return self.budget, "budget"

    def __str__(self):
        return f"{self.ref} {self.title}"


class Bid(models.Model):
    id = models.CharField(primary_key=True, max_length=16)
    tender = models.ForeignKey(Tender, on_delete=models.CASCADE, related_name="bids")
    supplier_id = models.CharField(max_length=16)
    submitted_at = models.BigIntegerField()
    amount = models.BigIntegerField(null=True, blank=True)  # None while cryptographically sealed
    sealed_blob = models.BinaryField(null=True, blank=True)  # Fernet({amount, lines}) until opening
    lines = models.JSONField(default=dict)   # {lineId: unitPrice}
    scores = models.JSONField(default=dict)  # {personaId: {criterionId: 0-10}}
    notes = models.JSONField(default=dict)   # {personaId: justification text}
    disqualified = models.BooleanField(default=False)  # failed stage 1 — commercial envelope returned unopened

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["tender", "supplier_id"], name="one_bid_per_supplier"),
        ]


class Clarification(models.Model):
    id = models.CharField(primary_key=True, max_length=16)
    tender = models.ForeignKey(Tender, on_delete=models.CASCADE, related_name="clarifications")
    supplier_id = models.CharField(max_length=16)
    q = models.TextField()
    asked_at = models.BigIntegerField()
    a = models.TextField(null=True, blank=True)
    answered_at = models.BigIntegerField(null=True, blank=True)


class Event(models.Model):
    id = models.CharField(primary_key=True, max_length=16)
    seq = models.IntegerField(default=0)          # position in the hash chain
    prev_hash = models.CharField(max_length=64, blank=True, default="")
    hash = models.CharField(max_length=64, blank=True, default="")
    at = models.BigIntegerField()
    actor = models.CharField(max_length=120)
    role = models.CharField(max_length=20)
    action = models.CharField(max_length=120)
    tender_id = models.CharField(max_length=16, null=True, blank=True)
    detail = models.TextField(blank=True, default="")

    class Meta:
        ordering = ["-at"]


class Profile(models.Model):
    """Maps a real Django auth user to a domain identity (buyer persona or supplier).

    A profile with neither persona nor supplier belongs to an administrator: an
    account that manages people and permissions and takes no part in tendering.
    """
    user = models.OneToOneField("auth.User", on_delete=models.CASCADE, related_name="profile")
    persona = models.ForeignKey(Persona, null=True, blank=True, on_delete=models.CASCADE)
    supplier = models.ForeignKey(Supplier, null=True, blank=True, on_delete=models.CASCADE)
    totp_secret = models.CharField(max_length=64, blank=True, default="")
    totp_confirmed = models.BooleanField(default=False)
    # Deviations from this person's role defaults — see permissions.py. Empty on
    # every account until an administrator moves someone off their role.
    perm_extra = models.JSONField(default=list, blank=True)     # granted on top of the role
    perm_revoked = models.JSONField(default=list, blank=True)   # taken away from the role

    @property
    def identity(self):
        from .permissions import ADMIN_ROLE, resolve
        if self.persona_id:
            p = self.persona
            base = {"id": p.id, "name": p.name, "role": p.role, "title": p.title, "supplierId": None}
        elif self.supplier_id:
            s = self.supplier
            base = {"id": s.id, "name": s.name, "role": "supplier", "title": "Supplier", "supplierId": s.id}
        else:
            base = {"id": f"a{self.user_id}", "name": self.user.get_full_name() or self.user.username,
                    "role": ADMIN_ROLE, "title": "System administrator", "supplierId": None}
        admin = bool(self.user.is_superuser)
        base["perms"] = sorted(resolve(base["role"], self.perm_extra, self.perm_revoked, superadmin=admin))
        base["isAdmin"] = admin
        return base


class AuthToken(models.Model):
    """Opaque bearer token issued at login. Sent as `Authorization: Bearer <key>`."""
    key = models.CharField(primary_key=True, max_length=64)
    user = models.ForeignKey("auth.User", on_delete=models.CASCADE, related_name="tokens")
    created = models.BigIntegerField()
    last_used = models.BigIntegerField(default=0)


class Document(models.Model):
    """Uploaded file, stored in the database so it survives Render deploys.

    kind='tender'  — buyer-published tender document (visible to invited suppliers)
    kind='bid'     — supplier submission document; sealed until the recorded opening
    envelope       — 'technical' or 'commercial' for bid documents
    """
    id = models.CharField(primary_key=True, max_length=16)
    kind = models.CharField(max_length=12)  # tender | bid | supplier
    tender = models.ForeignKey(Tender, null=True, blank=True, on_delete=models.CASCADE, related_name="documents")
    supplier_id = models.CharField(max_length=16, null=True, blank=True)
    envelope = models.CharField(max_length=12, blank=True, default="")
    encrypted = models.BooleanField(default=False)          # bid docs are ciphertext until opening
    expiry = models.BigIntegerField(null=True, blank=True)  # compliance docs (kind=supplier)
    name = models.CharField(max_length=200)
    content_type = models.CharField(max_length=120, blank=True, default="application/octet-stream")
    size = models.IntegerField()
    data = models.BinaryField()
    uploaded_by = models.CharField(max_length=120)
    uploaded_at = models.BigIntegerField()


class Notification(models.Model):
    id = models.CharField(primary_key=True, max_length=16)
    user = models.ForeignKey("auth.User", on_delete=models.CASCADE, related_name="notifications")
    at = models.BigIntegerField()
    subject = models.CharField(max_length=200)
    body = models.TextField(blank=True, default="")
    tender_id = models.CharField(max_length=16, null=True, blank=True)
    read = models.BooleanField(default=False)
    emailed = models.BooleanField(default=False)

    class Meta:
        ordering = ["-at"]


class TaskMark(models.Model):
    """Idempotence keys + throttle for the background sweep."""
    key = models.CharField(primary_key=True, max_length=120)
    at = models.BigIntegerField()


class ChainHead(models.Model):
    """Single-row pointer to the tip of the tamper-evident audit chain."""
    id = models.IntegerField(primary_key=True, default=1)
    seq = models.IntegerField(default=0)
    hash = models.CharField(max_length=64, default="genesis")


class ActionToken(models.Model):
    """Single-use emailed tokens: vendor verification, team invites, password resets."""
    token = models.CharField(primary_key=True, max_length=64)
    kind = models.CharField(max_length=20)  # vendor_verify | vendor_invite | team_invite | reset
    email = models.CharField(max_length=200)
    payload = models.JSONField(default=dict)
    created = models.BigIntegerField()
    used_at = models.BigIntegerField(null=True, blank=True)


class AuctionBid(models.Model):
    """One row per price submitted in a live reverse auction — the full movement history."""
    id = models.CharField(primary_key=True, max_length=16)
    tender = models.ForeignKey(Tender, on_delete=models.CASCADE, related_name="auction_bids")
    supplier_id = models.CharField(max_length=16)
    amount = models.BigIntegerField()
    at = models.BigIntegerField()

    class Meta:
        ordering = ["at"]


class OrgSetting(models.Model):
    """Single-row org configuration: the real approval matrix lives here."""
    id = models.IntegerField(primary_key=True, default=1)
    data = models.JSONField(default=dict)  # {approvalThreshold: int}


class FailedLogin(models.Model):
    """Brute-force lockout: too many failures in a window locks the username."""
    username = models.CharField(max_length=200, db_index=True)
    at = models.BigIntegerField()


class AccessRole(models.Model):
    """A role invented in the administration console — "CEO", "Legal", "Board".

    The four built-in roles (procurement / evaluator / approver / auditor) are
    code, because separation of duties is the product. These are configuration:
    a name, a job title, and a set of capability keys from permissions.py. A
    person on a custom role can still be moved off it individually, exactly like
    anyone else.
    """
    key = models.CharField(primary_key=True, max_length=20)   # slug; lands in Persona.role
    label = models.CharField(max_length=80)
    title = models.CharField(max_length=80, blank=True, default="")  # default job title
    note = models.CharField(max_length=200, blank=True, default="")
    perms = models.JSONField(default=list)
    created = models.BigIntegerField(default=0)
    created_by = models.CharField(max_length=200, blank=True, default="")

    class Meta:
        ordering = ["label"]

    def __str__(self):
        return self.label


# =====================================================================
#  The post-award ledger — a mirror, not a book of record
# =====================================================================
#
# DOCKET runs the competition and stops at award. Contracts, purchase orders,
# receipts, invoices and payments are kept in the finance system (Dynamics NAV
# today, Business Central expected), and that system remains the book of record.
# What lives below is a *mirror*: enough of the ledger, keyed to its own
# identifiers, for Finance to see procurement and its consequences on one page.
#
# Three rules hold every row here honest, and they are enforced by shape rather
# than by discipline:
#
#   1. **Provenance travels with the row.** `source` + `external_id` say which
#      system said this and what it called it. Re-importing updates the same row
#      instead of creating a second truth, and the day the ledger moves to
#      Business Central the old rows stay attributable to NAV.
#
#   2. **Staleness is a fact, not an absence.** `synced_at` on every row and
#      SourceSync per feed. A finance dashboard drawing a stale ledger without
#      saying how stale is worse than one that draws nothing, because the first
#      gets believed.
#
#   3. **One currency in a total.** Every amount is stored twice: `amount` in the
#      base currency for arithmetic, and `amount_src`/`currency`/`fx_rate` for
#      what was actually agreed. Summing mixed currencies is the single easiest
#      way to publish a number that is wrong by an order of magnitude, and the
#      only reliable defence is to make the converted figure the one that adds up.

class Mirrored(models.Model):
    """Provenance and staleness for anything mirrored from the finance system."""
    SOURCES = (("nav", "Dynamics NAV"), ("bc", "Business Central"),
               ("seed", "Demo seed"), ("manual", "Entered here"))

    id = models.CharField(primary_key=True, max_length=24)
    source = models.CharField(max_length=12, default="nav")
    external_id = models.CharField(max_length=80, blank=True, default="")
    synced_at = models.BigIntegerField(default=0)

    class Meta:
        abstract = True

    @property
    def from_ledger(self):
        """False for rows this workspace invented — they carry no ERP authority."""
        return self.source in ("nav", "bc")


class Money(models.Model):
    """An amount, in the base currency and in the one it was agreed in.

    `amount` is always base (NGN) and is the only field anything sums.
    `amount_src` is what the contract or invoice actually says. When the two
    currencies match, `fx_rate` is 1 and the pair is redundant — which is the
    common case and costs nothing. When they differ, the pair is the entire
    basis of the exchange-rate exposure figure: what we owe in a currency we do
    not earn, struck at a rate that has since moved.
    """
    amount = models.BigIntegerField(default=0)              # base currency (NGN)
    currency = models.CharField(max_length=3, default="NGN")
    amount_src = models.BigIntegerField(default=0)          # as agreed
    fx_rate = models.FloatField(default=1.0)                # base per unit, at commitment

    class Meta:
        abstract = True

    @property
    def foreign(self):
        return self.currency != "NGN"


class FxRate(models.Model):
    """Base-currency price of one unit of a foreign currency, over time.

    Kept as history rather than a single current figure so exposure can be shown
    as a movement — "this contract was struck at 1,480 and today's rate is
    1,655" — which is the only form of the number anyone can act on.
    """
    currency = models.CharField(max_length=3)
    at = models.BigIntegerField()
    rate = models.FloatField()
    source = models.CharField(max_length=12, default="nav")

    class Meta:
        ordering = ["-at"]
        constraints = [models.UniqueConstraint(fields=["currency", "at"], name="one_rate_per_day")]

    @staticmethod
    def latest():
        """{currency: rate} at the most recent observation of each."""
        out = {}
        for r in FxRate.objects.order_by("currency", "-at"):
            out.setdefault(r.currency, r.rate)
        out["NGN"] = 1.0
        return out


class SourceSync(models.Model):
    """Per-feed import state: what ran, when, and what it did or failed to do.

    One row per (source, entity). The failure fields are as important as the
    success ones — a feed that silently stopped three weeks ago looks exactly
    like a quiet month unless the last attempt is recorded next to the last
    success.
    """
    source = models.CharField(max_length=12)
    entity = models.CharField(max_length=24)     # contract | po | grn | invoice | payment | fx
    last_attempt = models.BigIntegerField(default=0)
    last_success = models.BigIntegerField(default=0)
    rows_seen = models.IntegerField(default=0)
    rows_written = models.IntegerField(default=0)
    error = models.CharField(max_length=300, blank=True, default="")

    class Meta:
        constraints = [models.UniqueConstraint(fields=["source", "entity"], name="one_sync_per_feed")]


class Contract(Mirrored, Money, SpendDimensions):
    """An award turned into a commitment.

    `tender` is nullable and often null: the ledger holds contracts that were
    renewed, novated or placed before this system existed, and dropping them
    would understate committed spend on the very page Finance uses to size it.
    A contract with no tender behind it is *itself* a finding — see the
    single-source figure on the compliance dashboard — so it is kept, counted,
    and marked, never quietly excluded.

    `original_value` and `amount` (the current value) are stored separately so
    cost escalation is a subtraction rather than an assertion. Change orders are
    kept as the list of what actually happened, because "value grew by ₦40m" and
    "value grew by ₦40m across nine variations nobody batched" are different
    findings and only the second one names the problem.
    """
    tender = models.ForeignKey(Tender, null=True, blank=True, on_delete=models.SET_NULL,
                               related_name="contracts")
    supplier = models.ForeignKey(Supplier, null=True, blank=True, on_delete=models.SET_NULL,
                                 related_name="contracts")
    ref = models.CharField(max_length=60)
    title = models.CharField(max_length=200, blank=True, default="")
    original_value = models.BigIntegerField(default=0)     # base currency, at signature
    signed_at = models.BigIntegerField(null=True, blank=True)
    starts_at = models.BigIntegerField(null=True, blank=True)
    ends_at = models.BigIntegerField(null=True, blank=True)
    status = models.CharField(max_length=16, default="active")   # active|expired|closed|terminated
    # [{at, amount, reason, ref, approved_by}] — amount is base currency, signed
    change_orders = models.JSONField(default=list, blank=True)
    renewal_notice_days = models.IntegerField(default=90)

    class Meta:
        ordering = ["-signed_at"]
        constraints = [models.UniqueConstraint(fields=["source", "external_id"],
                                               name="one_contract_per_external_id")]

    def __str__(self):
        return f"{self.ref} {self.title}"

    @property
    def escalation(self):
        """Base-currency growth since signature, and what fraction that is."""
        base = self.original_value or 0
        delta = (self.amount or 0) - base
        return delta, ((delta / base * 100) if base else None)


class PurchaseOrder(Mirrored, Money):
    """A call-off against a contract, or a standalone order.

    Nullable `contract` on purpose: a PO raised against no contract is the thing
    the "contracts without purchase orders" and "PO not matched" checks exist to
    surface, and a schema that forbade it would simply hide it.
    """
    contract = models.ForeignKey(Contract, null=True, blank=True, on_delete=models.SET_NULL,
                                 related_name="orders")
    tender = models.ForeignKey(Tender, null=True, blank=True, on_delete=models.SET_NULL,
                               related_name="orders")
    supplier = models.ForeignKey(Supplier, null=True, blank=True, on_delete=models.SET_NULL,
                                 related_name="orders")
    ref = models.CharField(max_length=60)
    description = models.CharField(max_length=200, blank=True, default="")
    raised_at = models.BigIntegerField(null=True, blank=True)
    raised_by = models.CharField(max_length=120, blank=True, default="")
    status = models.CharField(max_length=16, default="open")   # open|received|closed|cancelled
    approved_at = models.BigIntegerField(null=True, blank=True)
    approved_by = models.CharField(max_length=120, blank=True, default="")

    class Meta:
        ordering = ["-raised_at"]
        constraints = [models.UniqueConstraint(fields=["source", "external_id"],
                                               name="one_po_per_external_id")]


class GoodsReceipt(Mirrored, Money):
    """Evidence that what was ordered actually arrived. The middle leg of the
    three-way match, and the one most often missing."""
    order = models.ForeignKey(PurchaseOrder, null=True, blank=True, on_delete=models.SET_NULL,
                              related_name="receipts")
    ref = models.CharField(max_length=60)
    received_at = models.BigIntegerField(null=True, blank=True)
    received_by = models.CharField(max_length=120, blank=True, default="")
    note = models.CharField(max_length=200, blank=True, default="")

    class Meta:
        ordering = ["-received_at"]
        constraints = [models.UniqueConstraint(fields=["source", "external_id"],
                                               name="one_grn_per_external_id")]


class Invoice(Mirrored, Money):
    """A supplier's claim, and its progress through approval to settlement.

    `supplier_ref` is the vendor's own invoice number and is the key duplicate
    detection works on. It is stored exactly as the vendor wrote it, with the
    normalised form derived at comparison time: "INV-0042" and "inv 42" are the
    same claim submitted twice, and normalising on the way in would destroy the
    evidence that they arrived differently.
    """
    contract = models.ForeignKey(Contract, null=True, blank=True, on_delete=models.SET_NULL,
                                 related_name="invoices")
    order = models.ForeignKey(PurchaseOrder, null=True, blank=True, on_delete=models.SET_NULL,
                              related_name="invoices")
    receipt = models.ForeignKey(GoodsReceipt, null=True, blank=True, on_delete=models.SET_NULL,
                                related_name="invoices")
    supplier = models.ForeignKey(Supplier, null=True, blank=True, on_delete=models.SET_NULL,
                                 related_name="invoices")
    supplier_ref = models.CharField(max_length=80, blank=True, default="")
    invoiced_at = models.BigIntegerField(null=True, blank=True)
    received_at = models.BigIntegerField(null=True, blank=True)
    due_at = models.BigIntegerField(null=True, blank=True)
    approved_at = models.BigIntegerField(null=True, blank=True)
    approved_by = models.CharField(max_length=120, blank=True, default="")
    status = models.CharField(max_length=16, default="received")  # received|approved|rejected|paid|part_paid
    hold_reason = models.CharField(max_length=200, blank=True, default="")
    # Terms offered for settling early, e.g. 2% if paid within 10 days. Earned
    # only if a payment actually lands inside the window — see finance.py.
    discount_pct = models.FloatField(default=0)
    discount_days = models.IntegerField(default=0)

    class Meta:
        ordering = ["-received_at"]
        constraints = [models.UniqueConstraint(fields=["source", "external_id"],
                                               name="one_invoice_per_external_id")]

    @property
    def paid(self):
        return sum(p.amount for p in self.payments.all())


class Payment(Mirrored, Money):
    """Money that actually left. Part payments are rows, not a status: an
    invoice settled in three tranches has three dates, and an average payment
    time computed from only the last one flatters the figure."""
    invoice = models.ForeignKey(Invoice, null=True, blank=True, on_delete=models.SET_NULL,
                                related_name="payments")
    supplier = models.ForeignKey(Supplier, null=True, blank=True, on_delete=models.SET_NULL,
                                 related_name="payments")
    ref = models.CharField(max_length=60)
    paid_at = models.BigIntegerField(null=True, blank=True)
    method = models.CharField(max_length=24, blank=True, default="")
    discount_taken = models.BigIntegerField(default=0)

    class Meta:
        ordering = ["-paid_at"]
        constraints = [models.UniqueConstraint(fields=["source", "external_id"],
                                               name="one_payment_per_external_id")]


class AdminAudit(models.Model):
    """Administration console log: every act of the console, in its own ledger.

    Separate from Event because these are acts *on* the workspace rather than
    acts *within* it, and because the console is the only place they are read.
    Changes to who can do what are additionally mirrored into the main audit
    chain — a permission that moved during a live tender is exactly the kind of
    thing an auditor is there to find.
    """
    id = models.CharField(primary_key=True, max_length=16)
    at = models.BigIntegerField()
    actor = models.CharField(max_length=200)          # administrator's username
    action = models.CharField(max_length=140)
    target = models.CharField(max_length=200, blank=True, default="")
    detail = models.TextField(blank=True, default="")
    ip = models.CharField(max_length=64, blank=True, default="")

    class Meta:
        ordering = ["-at"]
