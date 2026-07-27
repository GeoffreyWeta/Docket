"""Shared helpers: money formatting, evaluation math, letters, id/time."""
import random
import statistics
import string
import time


def now_ms():
    return int(time.time() * 1000)


def rid(prefix=""):
    return prefix + "".join(random.choices(string.ascii_lowercase + string.digits, k=9))


DAY_MS = 86_400_000


def fmt_money(n):
    return "\u20a6" + f"{round(n):,}"


def fmt_compact(n):
    if n >= 1e9:
        v = f"{n / 1e9:.2f}".rstrip("0").rstrip(".")
        return f"\u20a6{v}bn"
    if n >= 1e6:
        v = f"{n / 1e6:.1f}".rstrip("0").rstrip(".")
        return f"\u20a6{v}m"
    return fmt_money(n)


def eff_status(t):
    if t.status == "published" and t.deadline < now_ms():
        return "closed"
    return t.status


# ---------------- evaluation math (mirrors the frontend) ----------------

def tech_score(tender, bid):
    per = []
    for scores in (bid.scores or {}).values():
        tot, w = 0.0, 0
        for c in tender.criteria:
            v = scores.get(c["id"])
            if v is not None and v != "":
                tot += float(v) * 10 * c["weight"]
                w += c["weight"]
        if w:
            per.append(tot / w)
    return sum(per) / len(per) if per else None


def comm_score(bid, bids):
    if bid.amount is None:
        return None
    priced = [b.amount for b in bids if b.amount is not None]
    lo = min(priced)
    return (lo / bid.amount) * 100


def total_score(tender, bid, bids):
    ts = tech_score(tender, bid)
    cs = comm_score(bid, bids)
    if ts is None or cs is None:
        return None
    return ts * tender.tech_weight / 100 + cs * tender.comm_weight / 100


def variance_flags(tender, bid):
    flagged = []
    for c in tender.criteria:
        vals = [
            float(s[c["id"]])
            for s in (bid.scores or {}).values()
            if s.get(c["id"]) is not None and s.get(c["id"]) != ""
        ]
        if len(vals) > 1 and statistics.pstdev(vals) >= 2:
            flagged.append(c)
    return flagged


def abnormally_low(bid, bids):
    if len(bids) <= 2:
        return False
    return bid.amount < 0.65 * statistics.median([b.amount for b in bids])


# ---------------- letters ----------------

def award_letter(org, tender, supplier_name, amount):
    return (
        f"Dear {supplier_name},\n\n"
        f"Re: {tender.ref} \u2014 {tender.title}\n\n"
        f"Following the sealed-bid opening and the evaluation panel's assessment under the published criteria, "
        f"{org} is pleased to inform you that your bid of {fmt_money(amount)} has been accepted.\n\n"
        f"Our contracts team will be in touch within five working days to begin contracting and mobilisation. "
        f"This award is conditional on the compliance documents on file remaining valid at contract signature.\n\n"
        f"Thank you for the quality of your submission.\n\n{org} \u2014 Procurement"
    )


def regret_letter(org, tender, supplier_name):
    return (
        f"Dear {supplier_name},\n\n"
        f"Re: {tender.ref} \u2014 {tender.title}\n\n"
        f"Thank you for the time and care that went into your sealed bid. After evaluation against the published "
        f"criteria, we write to confirm that your bid was not successful on this occasion.\n\n"
        f"Your submission was opened only after the deadline, in a recorded opening, and was scored by the full "
        f"panel. A summary of your scores is available on request.\n\n"
        f"We valued your participation and encourage you to bid on future opportunities with {org}.\n\n"
        f"{org} \u2014 Procurement"
    )


def fmt_date_ms(ms):
    import datetime
    return datetime.datetime.utcfromtimestamp(ms / 1000).strftime("%d %b %Y")


# ---------------- cryptographic sealing ----------------

def _fernet():
    """Fernet key derived from SECRET_KEY. Protects bid contents at rest:
    a database dump taken before the opening contains only ciphertext.
    (An attacker holding BOTH the DB and the app's SECRET_KEY can still
    decrypt — key-management hardware is the next rung on this ladder.)"""
    import base64
    import hashlib

    from cryptography.fernet import Fernet
    from django.conf import settings
    key = base64.urlsafe_b64encode(hashlib.sha256(settings.SECRET_KEY.encode()).digest())
    return Fernet(key)


def seal_json(obj):
    import json
    return _fernet().encrypt(json.dumps(obj).encode())


def unseal_json(blob):
    import json
    return json.loads(_fernet().decrypt(bytes(blob)))


def seal_bytes(b):
    return _fernet().encrypt(bytes(b))


def unseal_bytes(b):
    return _fernet().decrypt(bytes(b))


# ---------------- tamper-evident audit chain ----------------

def event_hash(prev_hash, id, seq, at, actor, action, tender_id, detail):
    import hashlib
    material = "|".join([prev_hash, id, str(seq), str(at), actor, action, str(tender_id or ""), detail])
    return hashlib.sha256(material.encode()).hexdigest()


def record_event(*, actor, role, action, tender_id=None, detail="", at=None):
    """Append an event to the hash chain. Every write goes through here."""
    from django.db import transaction

    from .models import ChainHead, Event
    at = at if at is not None else now_ms()
    eid = rid("e")
    with transaction.atomic():
        head, _ = ChainHead.objects.select_for_update().get_or_create(pk=1)
        seq = head.seq + 1
        h = event_hash(head.hash, eid, seq, at, actor, action, tender_id, detail)
        ev = Event.objects.create(id=eid, seq=seq, prev_hash=head.hash, hash=h, at=at,
                                  actor=actor, role=role, action=action,
                                  tender_id=tender_id, detail=detail)
        head.seq, head.hash = seq, h
        head.save(update_fields=["seq", "hash"])
    return ev


def verify_chain():
    """Recompute the whole chain. Returns (ok, count, first_broken_seq_or_None)."""
    from .models import Event
    prev = "genesis"
    n = 0
    for ev in Event.objects.order_by("seq"):
        expected = event_hash(prev, ev.id, ev.seq, ev.at, ev.actor, ev.action, ev.tender_id, ev.detail)
        if ev.prev_hash != prev or ev.hash != expected:
            return False, n, ev.seq
        prev = ev.hash
        n += 1
    return True, n, None
