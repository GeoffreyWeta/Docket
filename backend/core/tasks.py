"""Idempotent background sweep — no worker dyno required.

Runs opportunistically (throttled) from the bootstrap endpoint, and can also be
run on a schedule via `python manage.py run_sweep` (Render cron, GitHub Action,
anything that can hit a shell). Every effect is keyed in TaskMark so repeated
runs never double-send.
"""
from .models import Bid, Supplier, TaskMark, Tender
from .notify import notify_perm, notify_supplier
from .util import DAY_MS, fmt_date_ms, now_ms, record_event

SWEEP_INTERVAL_MS = 10 * 60 * 1000  # at most every 10 minutes when triggered by traffic


def _once(key):
    """True the first time a key is seen; False afterwards."""
    if TaskMark.objects.filter(pk=key).exists():
        return False
    TaskMark.objects.create(key=key, at=now_ms())
    return True


def maybe_sweep():
    mark = TaskMark.objects.filter(pk="last_sweep").first()
    now = now_ms()
    if mark and now - mark.at < SWEEP_INTERVAL_MS:
        return False
    TaskMark.objects.update_or_create(pk="last_sweep", defaults={"at": now})
    run_sweep()
    return True


def run_sweep():
    now = now_ms()

    # 1) Deadline sealing: log the system event + tell procurement, once per tender.
    for t in Tender.objects.filter(status="published", deadline__lt=now):
        if _once(f"sealed:{t.id}"):
            n = t.bids.count()
            record_event(actor="System", role="system", at=t.deadline,
                         action="Deadline passed — bids sealed", tender_id=t.id,
                         detail=f"{n} sealed bid(s) held for formal opening.")
            notify_perm("bid.open", f"Bids sealed: {t.title}",
                        f"The deadline for {t.ref} has passed. {n} sealed bid(s) are ready for a recorded opening.",
                        t.id)

    # 2) Bid reminders: invited suppliers without a bid, deadline within 2 days.
    for t in Tender.objects.filter(status="published", deadline__gt=now, deadline__lt=now + 2 * DAY_MS):
        if t.ttype == "AUC":
            bidders = set(t.auction_bids.values_list("supplier_id", flat=True))
            word = "auction bid"
        else:
            bidders = set(Bid.objects.filter(tender=t).values_list("supplier_id", flat=True))
            word = "sealed bid"
        for sid in t.invited:
            if sid not in bidders and _once(f"remind:{t.id}:{sid}"):
                notify_supplier(sid, f"Deadline approaching: {t.title}",
                                f"Your {word} for {t.ref} is due by {fmt_date_ms(t.deadline)}. "
                                f"No submission has been received yet.", t.id)

    # 3) Compliance documents expiring → the vendor at 60 and 7 days, procurement at 30.
    for s in Supplier.objects.all():
        for doc in s.docs:
            exp = doc.get("expiry") or 0
            left = exp - now
            if left <= 0:
                continue
            for days, who in ((60, "vendor"), (30, "procurement"), (7, "vendor")):
                if left <= days * DAY_MS and _once(f"docexp:{s.id}:{doc['name']}:{days}"):
                    if who == "vendor":
                        notify_supplier(s.id, f"Document expiring: {doc['name']}",
                                        f"Your {doc['name']} expires on {fmt_date_ms(exp)}. Upload a renewal from "
                                        f"your company profile to stay eligible for invitations.")
                    else:
                        notify_perm("supplier.prequalify", f"Compliance document expiring: {s.name}",
                                    f"{doc['name']} for {s.name} expires on {fmt_date_ms(exp)}. "
                                    f"Request a renewal before inviting them to new tenders.")

    # 4) Evaluation stalled: opened 3+ days ago, an evaluator still hasn't scored every bid.
    from django.contrib.auth.models import User
    evaluators = [(u.profile.persona.id, u) for u in
                  User.objects.filter(profile__persona__role="evaluator").select_related("profile__persona")]
    from .notify import notify_users
    for t in Tender.objects.filter(status="evaluation"):
        opened = t.opened_at or t.tech_opened_at
        if not opened or now - opened < 3 * DAY_MS or t.ttype == "AUC":
            continue
        bids = [b for b in t.bids.all() if not b.disqualified]
        for pid, user in evaluators:
            missing = sum(1 for b in bids if pid not in (b.scores or {}))
            if missing and _once(f"scorenudge:{t.id}:{pid}"):
                notify_users([user], f"Scores outstanding: {t.title}",
                             f"{missing} bid(s) on {t.ref} are still waiting for your scores. The commercial "
                             f"stage and the award are blocked until the panel is complete.", t.id)

    # 5) Award recommendation sitting with the approver for 2+ days.
    for t in Tender.objects.filter(status="evaluation"):
        rec = t.award_rec
        if rec and now - rec.get("at", now) >= 2 * DAY_MS and _once(f"recnudge:{t.id}"):
            notify_perm("tender.publish_decision", f"Approval waiting: {t.title}",
                        f"The award recommendation on {t.ref} has been in your queue since "
                        f"{fmt_date_ms(rec['at'])}. Suppliers hear nothing until you decide.", t.id)

    # 6) Vendor registrations unreviewed for 3+ days.
    for s in Supplier.objects.filter(prequalified=False, registered_at__isnull=False, rejected_reason=""):
        if now - s.registered_at >= 3 * DAY_MS and _once(f"regnudge:{s.id}"):
            notify_perm("supplier.prequalify", f"Registration awaiting review: {s.name}",
                        f"{s.name} registered on {fmt_date_ms(s.registered_at)} and is still waiting for a "
                        f"prequalification decision. Vendors who hear nothing stop responding to invitations.")
