"""Idempotent background sweep - no worker dyno required.

Runs opportunistically (throttled) from the bootstrap endpoint, and can also be
run on a schedule via `python manage.py run_sweep` (Render cron, GitHub Action,
anything that can hit a shell). Every effect is keyed in TaskMark so repeated
runs never double-send.
"""
from .models import Bid, ProcurementRound, Supplier, TaskMark, Tender
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


def _seal_key(t):
    """The idempotence key for "this deadline has passed".

    Keyed on the deadline, not the tender: a deadline that is extended, or a
    second bidding round with its own window, is a *new* sealing and owes
    everyone a fresh notice. The pre-rounds key was the tender alone, so it is
    adopted into the current shape the first time it is seen rather than left to
    fire a duplicate for every tender already sealed.
    """
    legacy = f"sealed:{t.id}"
    key = f"sealed:{t.id}:{t.deadline}"
    if TaskMark.objects.filter(pk=legacy).exists():
        TaskMark.objects.get_or_create(pk=key, defaults={"at": now_ms()})
        TaskMark.objects.filter(pk=legacy).delete()
    return key


def run_sweep():
    now = now_ms()

    # Auctions whose clock has run out. The room and list endpoints settle
    # these lazily when somebody looks; this catches the ones nobody opened,
    # so an unattended room still closes and becomes awardable.
    from . import auction as auction_engine
    try:
        auction_engine.settle_due(now)
    except Exception:                                             # noqa: BLE001
        pass

    # 0) Rounds whose window has run out. The tender's own deadline already
    #    reads as sealed through eff_status; this is the round row catching up,
    #    so the rounds table and the bid bucket agree with the countdown.
    for r in ProcurementRound.objects.filter(status="open", deadline__lt=now):
        r.status = "closed"
        r.closed_at = r.deadline
        r.save(update_fields=["status", "closed_at"])

    # 1) Deadline sealing: log the system event + tell procurement, once per deadline.
    for t in Tender.objects.filter(status="published", deadline__lt=now):
        if _once(_seal_key(t)):
            n = t.bids.count()
            record_event(actor="System", role="system", at=t.deadline,
                         action="Deadline passed - bids sealed", tender_id=t.id,
                         detail=f"{n} sealed bid(s) held for formal opening.")
            notify_perm("bid.open", f"Bids sealed: {t.title}",
                        f"The deadline for {t.ref} has passed. {n} sealed bid(s) are ready for a recorded opening.",
                        t.id)

    # 2) Bid reminders: invited suppliers without a bid, deadline within 2 days.
    for t in Tender.objects.filter(status="published", deadline__gt=now, deadline__lt=now + 2 * DAY_MS):
        bidders = set(Bid.objects.filter(tender=t, round=t.active_round())
                      .values_list("supplier_id", flat=True))
        word = "sealed bid"
        rnd = t.active_round()
        for sid in (rnd.bidders() if rnd else t.invited):
            if sid not in bidders and _once(f"remind:{t.id}:{t.deadline}:{sid}"):
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
                # Keyed on the document, not its name: a renewed tax clearance is
                # a new upload with the same name, and still needs its reminders.
                key = doc.get("docId") or f"{doc.get('name')}:{exp}"
                if left <= days * DAY_MS and _once(f"docexp:{s.id}:{key}:{days}"):
                    if who == "vendor":
                        notify_supplier(s.id, f"Document expiring: {doc['name']}",
                                        f"Your {doc['name']} expires on {fmt_date_ms(exp, date_only=True)}. Upload a renewal from "
                                        f"your company profile to stay eligible for invitations.")
                    else:
                        notify_perm("supplier.prequalify", f"Compliance document expiring: {s.name}",
                                    f"{doc['name']} for {s.name} expires on {fmt_date_ms(exp, date_only=True)}. "
                                    f"Request a renewal before inviting them to new tenders.")

    # 4) Evaluation stalled: opened 3+ days ago, a scorer still hasn't fully
    #    scored every bid. Addressed by capability, not by role name: companies
    #    name their own roles, and whoever holds `bid.score` is the panel.
    from .notify import _users_for_perm, notify_personas, notify_users
    evaluators = [(u.profile.persona_id, u) for u in _users_for_perm("bid.score")]
    for t in Tender.objects.filter(status="evaluation"):
        opened = t.opened_at or t.tech_opened_at
        if not opened or now - opened < 3 * DAY_MS or t.award_rec:
            continue
        crit = [c["id"] for c in (t.criteria or [])]
        bids = [b for b in t.bids.all() if not b.disqualified]
        for pid, user in evaluators:
            # A bid with one criterion scored is not scored.
            missing = sum(1 for b in bids
                          if any((b.scores or {}).get(pid, {}).get(c) in (None, "") for c in crit))
            if missing and _once(f"scorenudge:{t.id}:{pid}"):
                notify_users([user], f"Scores outstanding: {t.title}",
                             f"{missing} bid(s) on {t.ref} are still waiting for your scores.", t.id)

    # 5) Award recommendation sitting with its signer for 2+ days: the
    #    signature the chain is waiting on, or, with no ladder, whoever can
    #    decide awards.
    from . import approvals
    for t in Tender.objects.filter(status="evaluation"):
        rec = t.award_rec
        if rec and now - rec.get("at", now) >= 2 * DAY_MS and _once(f"recnudge:{t.id}"):
            subject = f"Approval waiting: {t.title}"
            text = (f"The award recommendation on {t.ref} has been in your queue since "
                    f"{fmt_date_ms(rec['at'])}. Suppliers hear nothing until you decide.")
            step = approvals.current_step(t, approvals.AWARD)
            if step:
                notify_personas(approvals.signers(step), subject, text, t.id)
            else:
                notify_perm("award.decide", subject, text, t.id)

    # 6) The registration drive, a bounded batch at a time. Placed last because
    #    it is the slowest step by an order of magnitude and everything above it
    #    is time-sensitive: a sealing notice must not wait behind 40 SMTP round
    #    trips. Does nothing at all unless a drive has been armed.
    from . import campaign
    if campaign.is_running():
        from .util import base_url, org_name
        sent, failed = campaign.send_batch(base_url(), org_name())
        if sent or failed:
            record_event(actor="System", role="system", at=now,
                         action="Registration invitations sent",
                         detail=f"{sent} sent, {failed} failed. "
                                f"{campaign.eligible().count()} still queued.")

    # 7) Vendor registrations unreviewed for 3+ days.
    for s in Supplier.objects.filter(prequalified=False, registered_at__isnull=False, rejected_reason=""):
        if now - s.registered_at >= 3 * DAY_MS and _once(f"regnudge:{s.id}"):
            notify_perm("supplier.prequalify", f"Registration awaiting review: {s.name}",
                        f"{s.name} registered on {fmt_date_ms(s.registered_at, date_only=True)} and is still waiting for a "
                        f"prequalification decision. Vendors who hear nothing stop responding to invitations.")

    # 8) The finance exceptions. Same eight rules the Finance page lists, run
    #    here so an overdue payment or a duplicate invoice reaches somebody
    #    without anyone having to open the page and look.
    sweep_finance(now)


# The severities worth interrupting somebody for. "watch" findings are real and
# are listed on the page, but a notification per expiring contract ninety days
# out would train everyone to ignore the channel that also carries the
# duplicate invoices.
NOTIFY_SEVERITIES = ("warn",)


def sweep_finance(now=None):
    """Raise a notification for each new finance exception, once.

    The idempotence key is the rule's own `key`, which is built from the records
    involved rather than from the time - so the same overdue invoice does not
    notify twice, but an invoice that crosses into a new thirty-day band does,
    because that is a new fact.
    """
    from . import finance
    now = now or now_ms()
    try:
        found = finance.exceptions(now)
    except Exception:                                             # noqa: BLE001
        # A malformed ledger row must not take the whole sweep down with it -
        # the deadline sealing above it is time-critical and this is not.
        return 0

    fresh = [ex for ex in found
             if ex["severity"] in NOTIFY_SEVERITIES and _once(f"fin:{ex['key']}")]
    if not fresh:
        return 0

    # One summary per sweep, not one notification per finding: forty overdue
    # invoices on a first import is forty notifications nobody reads. And the
    # payables findings name what a vendor is owed, so they only go to people
    # who can see payables - the same split the Finance page itself makes.
    from .notify import _users_for_perm, notify_users
    payable = [ex for ex in fresh if ex["kind"] in PAYABLES_KINDS]
    general = [ex for ex in fresh if ex["kind"] not in PAYABLES_KINDS]
    pay_ids = {u.id for u in _users_for_perm("finance.payables")}
    everyone = _users_for_perm("page.finance")

    def summary(items):
        n = len(items)
        subject = f"{n} new thing{'s' if n != 1 else ''} need{'' if n != 1 else 's'} attention in Finance"
        body = "; ".join(ex["subject"] for ex in items[:5])
        if n > 5:
            body += f"; and {n - 5} more"
        return subject, body + ". Open the Exceptions tab on the Finance page to work through them."

    for group, users in (
        (fresh, [u for u in everyone if u.id in pay_ids]),
        (general, [u for u in everyone if u.id not in pay_ids]),
    ):
        if group and users:
            subject, body = summary(group)
            notify_users(users, subject, body, None, destination={"page": "finance"})
    return len(payable) + len(general)


# Findings about what a named vendor is owed. Kept from anyone without
# `finance.payables`, here and in finance_views.
PAYABLES_KINDS = ("exposure", "payment_overdue", "duplicate_invoice")
