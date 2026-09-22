"""The outbound data feed: DOCKET as a source system.

WHY THIS EXISTS. Every company that buys DOCKET already has somewhere it keeps
its numbers -- Redshift here, Snowflake there, BigQuery, Synapse, a SQL Server
nobody has touched since 2014. Writing a connector per warehouse is a treadmill,
and the alternative people reach for first -- give us credentials and we will
write into your warehouse -- is the version that fails the customer's own
security review, which for a sealed-bid procurement system is the review that
matters most. So the direction is inverted: we expose rows, they pull, and
DOCKET never holds a credential to anybody's data estate.

WHY IT IS NOT "REAL TIME". The consumer is a warehouse, and warehouses load in
batches: a columnar store writing one row at a time is the single slowest thing
you can ask it to do. So this is an incremental feed -- "everything that changed
since this cursor" -- on whatever cadence the customer's scheduler likes, five
minutes or nightly. Push notification belongs in a webhook telling them to come
and pull, never in a row-by-row stream into a column store.

THE CONTRACT WITH THE CONSUMER, in four parts:

  1. **Cursor, not offset.** Rows are ordered by `(updated_at, id)` and the
     cursor encodes both. Offsets shift under concurrent writes; this does not.

  2. **At-least-once, so upsert by `id`.** A row may be served twice -- at a
     page boundary, or after the safety lag below. It will never be served
     *out* of order, and it will never be silently skipped. Consumers MERGE on
     the primary key and repetition costs nothing.

  3. **Deletions are rows.** `/deletions` is the tombstone feed. A consumer
     that ignores it keeps deleted records forever and diverges from us without
     either side getting an error.

  4. **Additive changes only inside a version.** New fields may appear. Fields
     do not change meaning or disappear except at `/v2/`.

THE SAFETY LAG. A row's `updated_at` is stamped when the statement runs; the row
becomes *visible* when its transaction commits. A feed that serves right up to
`now` can therefore read at T, miss a row stamped T-1 that commits at T+1, and
never return to it -- the cursor has already moved past. So the feed refuses to
serve anything newer than `now - LAG_MS`, sized well above the longest write
transaction here. This narrows the window rather than closing it absolutely;
part 2 of the contract is what closes it, because a consumer that upserts is
unharmed by a row arriving in the next page instead of this one.

FIELD NAMES ARE snake_case, unlike the rest of this API. The browser payload is
camelCase because JavaScript reads it. These names become columns in somebody's
warehouse and are read in SQL, so they follow SQL's convention instead. The two
audiences are different, and the feed is versioned separately for exactly this
kind of reason.

WHAT NEVER LEAVES. Sealed bid amounts before their recorded opening, the Fernet
ciphertext itself in any state, uploaded document bytes, password hashes, TOTP
secrets and API key hashes. Sealing is a time-based property of the tender and
is enforced here at serialization -- the same rule, in the same place, as the
browser-facing API (see views.py). A feed that could be pointed at an unopened
envelope would make the envelope decorative.
"""
import base64

from django.db.models import Q
from django.db.models.signals import post_delete
from django.dispatch import receiver

from .models import (Bid, Contract, Event, GoodsReceipt, Invoice, Item, Payment,
                     Persona, PurchaseOrder, Supplier, Tender, Tombstone)
from .util import now_ms

# Above the longest write transaction in this codebase by a wide margin. The
# opening of a tender's bids is the heaviest one and is measured in tens of
# milliseconds; five seconds is not a performance cost because it only delays
# *appearance*, and a warehouse that is five seconds behind is not behind.
LAG_MS = 5_000

# Page sizes. The ceiling exists because the serializers for contracts and
# tenders carry JSON blobs, and "give me a million rows" is how a well-meaning
# backfill script takes the instance down.
DEFAULT_LIMIT = 500
MAX_LIMIT = 2_000


# ---------------- scopes ----------------
#
# Coarse on purpose. A scope per table would look rigorous and would in
# practice be copied wholesale into every key anybody mints, which is how
# fine-grained permissions end up meaning nothing. These four are the four
# conversations that actually differ in sensitivity, and "commercial" is
# separated from the rest because bid amounts and payables are the part a
# customer will want to withhold from a general-purpose BI pipeline.

SCOPES = {
    "feed.procurement": "Tenders and the vendor register",
    "feed.commercial": "Bid amounts, awards and the post-award ledger",
    "feed.people": "The org chart: names, titles and reporting lines",
    "feed.audit": "The tamper-evident event chain",
}


def _b64(s):
    return base64.urlsafe_b64encode(s.encode()).decode().rstrip("=")


def _unb64(s):
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4)).decode()


def encode_cursor(updated_at, row_id):
    return _b64(f"{updated_at}:{row_id}")


def decode_cursor(cur):
    """(updated_at, id), or None for "from the beginning".

    A cursor we cannot read is an error, not a silent restart from zero: a
    consumer whose cursor got corrupted needs to be told, not handed the whole
    table again as though nothing had happened.
    """
    if not cur:
        return None
    try:
        raw = _unb64(cur)
        ts, sep, row_id = raw.partition(":")
        if not sep:
            raise ValueError
        return int(ts), row_id
    except (ValueError, TypeError, UnicodeDecodeError, base64.binascii.Error):
        raise ValueError("Malformed cursor.")


# ---------------- serializers ----------------

def _money(o):
    """The pair every ledger row carries: base for arithmetic, source for
    truth. Both travel, because a warehouse given only the converted figure
    cannot answer "what did the contract actually say"."""
    return {
        "amount": o.amount, "currency": o.currency,
        "amount_src": o.amount_src, "fx_rate": o.fx_rate,
    }


def _mirrored(o):
    return {"source": o.source, "external_id": o.external_id, "synced_at": o.synced_at}


def _dims(o):
    return {k: (getattr(o, k) or "") for k, _ in o.DIMENSIONS}


def tender_row(t):
    return {
        "id": t.id, "ref": t.ref, "title": t.title, "type": t.ttype,
        "category": t.category, "status": t.status,
        "budget": t.budget, "baseline": t.baseline,
        "baseline_source": t.baseline_source or "",
        "projected_cost": t.projected_cost,
        "published_at": t.published_at, "deadline": t.deadline,
        "opened_at": t.opened_at, "awarded_at": t.awarded_at,
        "awarded_to": t.awarded_to, "awarded_amount": t.awarded_amount,
        "owner_id": t.owner_id,
        "tech_weight": t.tech_weight, "comm_weight": t.comm_weight,
        "two_stage": t.two_stage, "tech_opened_at": t.tech_opened_at,
        "paused_at": t.paused_at, "resumed_at": t.resumed_at,
        "cancelled_at": t.cancelled_at, "cancel_reason": t.cancel_reason or "",
        "invited_count": len(t.invited or []),
        "line_count": len(t.lines or []),
        "criteria": t.criteria or [],
        # The series, not the act. How often a deadline moved and who kept
        # moving it is a question about the tender; the audit chain answers
        # the question about the event.
        "deadline_change_count": len(t.deadline_changes or []),
        **_dims(t),
        "updated_at": t.updated_at,
    }


def bid_row(b):
    """Sealed until opened, and the seal is the point.

    Before the tender's recorded opening a bid is exported as the fact that it
    exists -- who bid, when, in which round -- and nothing about the number.
    The ciphertext is never exported in any state: it would be useless to a
    warehouse (it is Fernet, keyed off SECRET_KEY, which never leaves the app
    host) and its presence in a second system with different access control is
    precisely the risk sealing exists to remove.
    """
    opened = b.tender.opened_at is not None
    return {
        "id": b.id, "tender_id": b.tender_id, "round_id": b.round_id,
        "round_number": b.round_number,
        "supplier_id": b.supplier_id, "submitted_at": b.submitted_at,
        "disqualified": b.disqualified,
        "sealed": not opened,
        "amount": b.amount if opened else None,
        "line_prices": (b.lines or {}) if opened else None,
        "updated_at": b.updated_at,
    }


def supplier_row(s):
    return {
        "id": s.id, "name": s.name, "code": s.code or "",
        "category": s.category, "subcategory": s.subcategory or "",
        "location": s.location, "address": s.address or "",
        "contact_email": s.contact_email or "", "phone": s.phone or "",
        "contact_person": s.contact_person or "",
        "classification": s.classification or "",
        "payment_terms": s.payment_terms or "",
        "rating": s.rating, "prequalified": s.prequalified,
        "registration_status": s.registration_status(),
        "verification_status": s.verification_status(),
        "registered_at": s.registered_at, "verified_at": s.verified_at,
        "suspended": s.suspended, "suspended_at": s.suspended_at,
        "suspended_reason": s.suspended_reason or "",
        "exposure_limit": s.exposure_limit,
        "invited_at": s.invited_at, "invite_count": s.invite_count,
        "doc_count": len(s.docs or []),
        "performance": s.perf or {},
        "source": s.source or "",
        "updated_at": s.updated_at,
    }


def persona_row(p):
    """The org chart. No credentials and no contact details: this exists so a
    warehouse can attribute spend to a department and roll it up a reporting
    line, which needs a name, a title and a manager and nothing else."""
    return {
        "id": p.id, "name": p.name, "role": p.role, "title": p.title,
        "manager_id": p.manager_id, "approval_level": p.approval_level or "",
        "updated_at": p.updated_at,
    }


def item_row(i):
    return {
        "id": i.id, "code": i.code, "description": i.description,
        "uom": i.uom or "", "category": i.category or "", "kind": i.kind or "",
        "unit_cost": i.unit_cost, "currency": i.currency, "blocked": i.blocked,
        **_mirrored(i), "updated_at": i.updated_at,
    }


def contract_row(c):
    return {
        "id": c.id, "ref": c.ref, "title": c.title or "",
        "tender_id": c.tender_id, "supplier_id": c.supplier_id,
        "original_value": c.original_value,
        "signed_at": c.signed_at, "starts_at": c.starts_at, "ends_at": c.ends_at,
        "status": c.status, "renewal_notice_days": c.renewal_notice_days,
        "change_order_count": len(c.change_orders or []),
        **_money(c), **_mirrored(c), **_dims(c),
        "updated_at": c.updated_at,
    }


def po_row(o):
    return {
        "id": o.id, "ref": o.ref, "description": o.description or "",
        "contract_id": o.contract_id, "tender_id": o.tender_id,
        "supplier_id": o.supplier_id, "status": o.status,
        "raised_at": o.raised_at, "raised_by": o.raised_by or "",
        "approved_at": o.approved_at, "approved_by": o.approved_by or "",
        **_money(o), **_mirrored(o), "updated_at": o.updated_at,
    }


def grn_row(g):
    return {
        "id": g.id, "ref": g.ref, "order_id": g.order_id,
        "received_at": g.received_at, "received_by": g.received_by or "",
        "note": g.note or "",
        **_money(g), **_mirrored(g), "updated_at": g.updated_at,
    }


def invoice_row(i):
    return {
        "id": i.id, "supplier_ref": i.supplier_ref or "",
        "contract_id": i.contract_id, "order_id": i.order_id,
        "receipt_id": i.receipt_id, "supplier_id": i.supplier_id,
        "invoiced_at": i.invoiced_at, "received_at": i.received_at,
        "due_at": i.due_at, "approved_at": i.approved_at,
        "approved_by": i.approved_by or "", "status": i.status,
        "hold_reason": i.hold_reason or "",
        **_money(i), **_mirrored(i), "updated_at": i.updated_at,
    }


def payment_row(p):
    return {
        "id": p.id, "ref": p.ref, "invoice_id": p.invoice_id,
        "supplier_id": p.supplier_id, "paid_at": p.paid_at,
        "method": p.method or "", "discount_taken": p.discount_taken,
        **_money(p), **_mirrored(p), "updated_at": p.updated_at,
    }


# ---------------- the registry ----------------
#
# `select` is not an optimisation here, it is a correctness requirement:
# bid_row reads b.tender.opened_at to decide whether the envelope is open, and
# without select_related that is one query per bid -- a sync of ten thousand
# bids becomes ten thousand extra queries and the sealing check becomes the
# slowest thing in the system.

class Entity:
    def __init__(self, name, model, scope, row, select=()):
        self.name, self.model, self.scope, self.row = name, model, scope, row
        self.select = select

    def queryset(self):
        qs = self.model.objects.all()
        return qs.select_related(*self.select) if self.select else qs


ENTITIES = {e.name: e for e in [
    Entity("tenders", Tender, "feed.procurement", tender_row),
    Entity("suppliers", Supplier, "feed.procurement", supplier_row),
    Entity("people", Persona, "feed.people", persona_row),
    Entity("bids", Bid, "feed.commercial", bid_row, select=("tender",)),
    Entity("items", Item, "feed.commercial", item_row),
    Entity("contracts", Contract, "feed.commercial", contract_row),
    Entity("purchase_orders", PurchaseOrder, "feed.commercial", po_row),
    Entity("goods_receipts", GoodsReceipt, "feed.commercial", grn_row),
    Entity("invoices", Invoice, "feed.commercial", invoice_row),
    Entity("payments", Payment, "feed.commercial", payment_row),
]}

# Which feed name a deleted row is tombstoned under. Keyed by model so the
# post_delete receiver can look itself up without a scan.
TOMBSTONED = {e.model: e.name for e in ENTITIES.values()}


@receiver(post_delete)
def _tombstone(sender, instance, **kwargs):
    """Record every death of an exported row, cascades included.

    Bound to post_delete globally rather than per-model because that is what
    catches cascades: deleting a tender takes its bids with it without any view
    code naming a bid, and those are exactly the rows a warehouse would
    otherwise keep forever. Anything not in the registry is ignored -- a spent
    auth token is nobody's business downstream.
    """
    name = TOMBSTONED.get(sender)
    if name:
        Tombstone.objects.create(entity=name, row_id=str(instance.pk), at=now_ms())


# ---------------- paging ----------------

def page(entity, cursor=None, limit=DEFAULT_LIMIT, now=None):
    """One page of an entity feed, plus the cursor that continues it.

    The window closes at `now - LAG_MS` for the reason in the module docstring.
    Ordering is `(updated_at, id)` and the filter is the strict "greater than
    this pair" that the pair ordering implies -- written as two ORed terms
    because that is how a composite cursor is expressed without a tuple compare
    the ORM will not emit.
    """
    now = now if now is not None else now_ms()
    ceiling = now - LAG_MS
    limit = max(1, min(int(limit or DEFAULT_LIMIT), MAX_LIMIT))

    qs = entity.queryset().filter(updated_at__lte=ceiling)
    if cursor:
        ts, row_id = cursor
        qs = qs.filter(Q(updated_at__gt=ts) | Q(updated_at=ts, id__gt=row_id))

    rows = list(qs.order_by("updated_at", "id")[: limit + 1])
    more = len(rows) > limit
    rows = rows[:limit]

    # An empty page must not rewind the consumer to the start, so the cursor
    # they sent back is the cursor they keep.
    nxt = (encode_cursor(rows[-1].updated_at, rows[-1].pk) if rows
           else (encode_cursor(*cursor) if cursor else None))
    return {
        "entity": entity.name,
        "rows": [entity.row(r) for r in rows],
        "cursor": nxt,
        "has_more": more,
        # The consumer's own watermark, so a pipeline can record how fresh it
        # is without trusting its clock against ours.
        "as_of": ceiling,
    }


def deletions_page(since_seq=0, limit=DEFAULT_LIMIT, entities=None):
    """Tombstones after `since_seq`, oldest first.

    Cursored on the autoincrement rather than on time, because that is what a
    deletion has: it happened once, in an order, and is never revised.
    """
    limit = max(1, min(int(limit or DEFAULT_LIMIT), MAX_LIMIT))
    qs = Tombstone.objects.filter(seq__gt=int(since_seq or 0))
    if entities:
        qs = qs.filter(entity__in=entities)
    rows = list(qs.order_by("seq")[: limit + 1])
    more = len(rows) > limit
    rows = rows[:limit]
    return {
        "entity": "deletions",
        "rows": [{"seq": t.seq, "entity": t.entity, "id": t.row_id, "at": t.at}
                 for t in rows],
        "cursor": str(rows[-1].seq) if rows else str(int(since_seq or 0)),
        "has_more": more,
    }


def events_page(since_seq=0, limit=DEFAULT_LIMIT):
    """The hash-chained audit log, in chain order.

    This is the feed worth having and the one nothing else offers: `seq`,
    `prev_hash` and `hash` travel with every row, so a customer's warehouse can
    re-walk the chain and prove for itself that what it received is what DOCKET
    recorded, and that nothing was altered or dropped in between. An export
    nobody can verify is a claim; this one is evidence.
    """
    limit = max(1, min(int(limit or DEFAULT_LIMIT), MAX_LIMIT))
    qs = Event.objects.filter(seq__gt=int(since_seq or 0)).order_by("seq")
    rows = list(qs[: limit + 1])
    more = len(rows) > limit
    rows = rows[:limit]
    return {
        "entity": "events",
        "rows": [{"id": e.id, "seq": e.seq, "at": e.at, "actor": e.actor,
                  "role": e.role, "action": e.action, "tender_id": e.tender_id,
                  "detail": e.detail, "prev_hash": e.prev_hash, "hash": e.hash}
                 for e in rows],
        "cursor": str(rows[-1].seq) if rows else str(int(since_seq or 0)),
        "has_more": more,
    }
