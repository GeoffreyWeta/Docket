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

    def __str__(self):
        return f"{self.name} ({self.role})"


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
    contact_person = models.CharField(max_length=140, blank=True, default="")
    phone = models.CharField(max_length=120, blank=True, default="")
    address = models.CharField(max_length=300, blank=True, default="")
    payment_terms = models.CharField(max_length=80, blank=True, default="")
    # TIN, bank name, masked account, remarks, any code the vendor was
    # previously registered under, and the original cell behind every
    # normalisation. Never the full account number: see vendor_import.py.
    registry = models.JSONField(default=dict, blank=True)

    def __str__(self):
        return self.name


class Tender(models.Model):
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
