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
    """The status to act on, as opposed to the one on the row.

    A published tender whose deadline has passed is sealed whether or not
    anything has run since; that is the whole of the derivation, and it stays
    the whole of it. `paused` and `cancelled` are stored statuses rather than
    derived ones because somebody decided them - and a paused event returns
    "paused" here without a special case, which is why pausing takes an event
    out of every "published" query in the sweep for free.
    """
    if t.status == "published" and t.deadline < now_ms():
        return "closed"
    return t.status


CLOSING_SOON_MS = 2 * DAY_MS


def closing_soon(t):
    """Open, and closing inside the window a bidder can still act in."""
    return t.status == "published" and 0 < (t.deadline - now_ms()) <= CLOSING_SOON_MS


def savings_against(t, amount):
    """What one price is worth against this event: {basis, basisAmount, savings, pct}.

    Three numbers can play the part of "what we would otherwise have paid", and
    they are not interchangeable. A baseline is what the organisation actually
    paid before, so a saving against it is money that stops leaving. A
    projection is what the category manager expected this to land at, so a
    saving against it is a negotiation outcome. A budget is a ceiling somebody
    set, so a saving against it measures the estimate as much as the deal. The
    strongest available basis wins, and the word for which one it was travels
    with the number - a saving whose basis is unstated is a saving nobody can
    check.
    """
    if amount is None:
        return None
    if t.baseline:
        basis, word = t.baseline, "baseline"
    elif t.projected_cost:
        basis, word = t.projected_cost, "projection"
    else:
        basis, word = t.budget, "budget"
    saving = (basis or 0) - amount
    return {"basis": word, "basisAmount": basis, "savings": saving,
            "pct": (saving / basis * 100) if basis else 0.0}


# ---------------- evaluation math (mirrors the frontend) ----------------

def line_maxima(tender):
    """The tender's lines, when every one carries the most the buyer will pay
    per unit (`price`). None for a lump-sum tender or one drafted before lines
    had a maximum, which are graded on the total the way they always were."""
    lines = tender.lines or []
    if lines and all((l.get("price") or 0) > 0 for l in lines):
        return lines
    return None


def lines_ceiling(lines):
    """Quantity times maximum, summed: the most the whole tender can cost."""
    return sum(int(l.get("qty") or 0) * int(l.get("price") or 0) for l in lines or [])


def lines_over_max(tender, bid):
    """The lines on which this bid's rate is above the buyer's maximum."""
    lines = line_maxima(tender)
    if not lines or not bid.lines:
        return []
    return [l for l in lines if (bid.lines.get(l["id"]) or 0) > l["price"]]


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


def comm_score(bid, bids, tender=None):
    """Price score out of 100.

    With a maximum on every line it is graded line by line. Each line counts
    for its quantity times its maximum, so the big lines decide the score. A
    rate above the maximum earns nothing on that line; at or under it, the
    lowest rate on the line gets full marks and the rest score in proportion.
    Without maximums, the lowest total gets full marks."""
    if bid.amount is None:
        return None
    lines = line_maxima(tender) if tender is not None else None
    if lines and bid.lines:
        weight = lines_ceiling(lines)
        got = 0.0
        for l in lines:
            mine = bid.lines.get(l["id"]) or 0
            if mine <= 0 or mine > l["price"]:
                continue
            rates = ((b.lines or {}).get(l["id"]) or 0 for b in bids if b.amount is not None)
            best = min([mine] + [r for r in rates if 0 < r <= l["price"]])
            got += l["qty"] * l["price"] * best / mine
        return got / weight * 100
    priced = [b.amount for b in bids if b.amount is not None]
    lo = min(priced)
    return (lo / bid.amount) * 100


def total_score(tender, bid, bids):
    ts = tech_score(tender, bid)
    cs = comm_score(bid, bids, tender)
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


def org_timezone():
    """The organisation's time zone: the company profile's, else Africa/Lagos.

    A deadline in an email is read against the reader's wall clock, and the
    server's UTC is nobody's. Falls back to a fixed WAT offset if the zone
    database is missing or the profile names a zone it does not know."""
    import datetime
    try:
        from zoneinfo import ZoneInfo

        from .models import OrgSetting
        row = OrgSetting.objects.filter(pk=1).first()
        name = ((row.data if row else {}) or {}).get("timezone") or "Africa/Lagos"
        try:
            return ZoneInfo(name)
        except Exception:
            return ZoneInfo("Africa/Lagos")
    except Exception:
        return datetime.timezone(datetime.timedelta(hours=1), "WAT")


def fmt_date_ms(ms, date_only=False):
    """"Fri 14 Oct 2026, 12:00 WAT" in the organisation's time zone, or
    "Fri 14 Oct 2026" with date_only. Takes epoch milliseconds."""
    import datetime
    dt = datetime.datetime.fromtimestamp(ms / 1000, tz=org_timezone())
    day = f"{dt:%a} {dt.day} {dt:%b %Y}"
    return day if date_only else f"{day}, {dt:%H:%M} {dt:%Z}".rstrip()


# ---------------- cryptographic sealing ----------------

def _fernet():
    """Fernet key derived from SECRET_KEY. Protects bid contents at rest:
    a database dump taken before the opening contains only ciphertext.
    (An attacker holding BOTH the DB and the app's SECRET_KEY can still
    decrypt - key-management hardware is the next rung on this ladder.)"""
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


def base_url():
    """The workspace's public address, for links in mail sent without a request.

    Views build links from the request they are answering, which is always
    right. The background sweep has no request, so it reads the one place that
    can still be right: configuration.
    """
    from django.conf import settings
    return settings.PUBLIC_BASE_URL


def org_name():
    """The organisation's name. Duplicated from views.org_name deliberately -
    tasks.py cannot import views.py, which imports tasks.py."""
    from .models import OrgSetting
    from .seed import ORG
    row = OrgSetting.objects.filter(pk=1).first()
    data = {**ORG, **((row.data if row else {}) or {})}
    return data.get("name") or "DOCKET"
