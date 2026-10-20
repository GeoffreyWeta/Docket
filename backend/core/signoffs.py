"""Line manager sign-off for the things that are not a publication chain.

Three requests wait on one (see SignOff in models.py):

  auction_release - an auction going out to its vendors. Until it is signed
                    the auction sits at "approval" and nobody has been told.
  deadline        - a tender's closing date moving after publication, later
                    or earlier. Until it is signed the published date stands.
  auction_times   - an auction's start or end moving after it was scheduled.

Who signs is the requester's line manager, or anybody above them in the
reporting line; with nobody on record above the requester, anybody holding
approvals.FALLBACK_CAP. Nobody signs their own request (approvals.may_decide).

What happens on a yes is the change itself, applied by the module that owns
the event: procurement.apply_deadline_change, auction_views.release and
auction_views.apply_times. They re-check the event when the yes arrives rather
than trusting the state it was in when the request was made: a tender that
was opened, or an auction that started, in the meantime turns the request into
one that can no longer be applied, and the approver is told why.
"""
from django.http import JsonResponse

from . import approvals
from .models import Persona, SignOff
from .notify import notify_personas, notify_users
from .util import fmt_date_ms, now_ms, rid
from .views import err, log, org_settings, route

KIND_WORDS = {
    "auction_release": "auction going out to vendors",
    "deadline": "closing date change",
    "auction_times": "auction times change",
}


def timeline_approval_required(org=None):
    org = org if org is not None else org_settings()
    return bool(org.get("timelineApproval", True))


def pending(kind=None, tender=None, auction=None):
    qs = SignOff.objects.filter(status="pending")
    if kind:
        qs = qs.filter(kind=kind)
    if tender is not None:
        qs = qs.filter(tender=tender)
    if auction is not None:
        qs = qs.filter(auction=auction)
    return qs.first()


def approver_words(so):
    """Who the request is waiting on, in a sentence."""
    if so.approver_id and so.approver:
        return so.approver.name
    names = list(Persona.objects.filter(pk__in=so.also or []).values_list("name", flat=True))
    if names:
        return " or ".join(names)
    return "anyone who can approve publication"


def describe_change(so):
    c = so.change or {}
    parts = []
    for key, word, plain in (("deadline", "closing date", "closes"), ("startsAt", "opening time", "opens"),
                             ("endsAt", "closing time", "closes")):
        if key in c:
            old, new = c[key]
            if not new:
                continue
            # A first schedule has nothing to move from: "opens X", not "not set → X".
            parts.append(f"{word} {fmt_date_ms(old)} → {fmt_date_ms(new)}" if old
                         else f"{plain} {fmt_date_ms(new)}")
    if c.get("resume"):
        parts.append("resume the paused event")
    return "; ".join(parts)


def _event(so):
    return so.tender or so.auction


def view(so, p):
    ev = _event(so)
    return {
        "id": so.id, "kind": so.kind, "status": so.status,
        "tenderId": so.tender_id, "auctionId": so.auction_id,
        "ref": ev.ref if ev else "", "title": ev.title if ev else "",
        "requestedBy": so.requested_by_name, "requestedById": so.requested_by_id,
        "requestedAt": so.requested_at,
        "approverId": so.approver_id, "approver": approver_words(so),
        "change": so.change or {}, "summary": describe_change(so),
        "reason": so.reason, "decidedAt": so.decided_at, "decidedBy": so.decided_by,
        "note": so.note,
        "mayDecide": approvals.may_decide(so, p),
        "mayWithdraw": so.status == "pending" and p.get("id") == so.requested_by_id,
        "details": _details(so) if so.status == "pending" else None,
    }


def _details(so):
    """What the signer is being asked about, in full, so a yes or a reasoned
    no can be given from the request itself. Buying side only (bootstrap
    sends sign-offs to nobody else)."""
    if so.tender_id:
        t = so.tender
        return {"invited": len(t.invited or []), "bids": t.bids.count(),
                "changes": len(t.deadline_changes or [])}
    a = so.auction
    from .models import Supplier
    from .vocab import VOCAB
    names = dict(Supplier.objects.filter(
        pk__in=a.participants.filter(disqualified=False).values_list("supplier_id", flat=True))
        .values_list("id", "name"))
    return {
        "direction": a.direction, "visibility": a.visibility, "allowPrebid": a.allow_prebid,
        "startsAt": a.starts_at, "endsAt": a.ends_at, "scope": a.scope, "terms": a.terms,
        "lots": [{"number": l.number, "title": l.title, "qty": l.qty, "uom": l.uom,
                  "ceiling": l.ceiling, "reserve": l.reserve, "minDecrement": l.min_decrement,
                  "decrementIsPct": l.decrement_is_pct} for l in a.lots.all()],
        "vendors": sorted(names.values()),
        "paymentTermsLabel": dict((v, lb) for v, lb in VOCAB["paymentTerms"]).get(
            a.payment_terms or "", a.payment_terms or ""),
        "paymentConditions": a.payment_conditions or "",
        "ndaRequired": a.nda_required,
        "documents": list(a.images.filter(kind="auctiondoc").values_list("name", flat=True)),
    }


def for_bootstrap(p):
    """Pending requests, and those decided in the last 30 days, for the
    buying side. A few rows: these are rare, by design."""
    if p["role"] == "supplier":
        return []
    from django.db.models import Q
    since = now_ms() - 30 * 86_400_000
    rows = (SignOff.objects.select_related("tender", "auction", "approver")
            .filter(Q(status="pending") | Q(decided_at__gte=since))[:100])
    return [view(so, p) for so in rows]


def queue_count(p):
    """How many requests are waiting on this person: theirs to sign."""
    if p["role"] == "supplier":
        return 0
    return sum(1 for so in SignOff.objects.filter(status="pending") if approvals.may_decide(so, p))


def request(kind, p, *, tender=None, auction=None, change=None, reason=""):
    """Raise a request. Returns (SignOff, error)."""
    me = Persona.objects.filter(pk=p.get("id")).first()
    mgr, above = approvals.signoff_route(me)
    so = SignOff(id=rid("so"), kind=kind, tender=tender, auction=auction,
                 requested_by=me, requested_by_name=p["name"], requested_at=now_ms(),
                 approver=mgr, also=above, change=change or {}, reason=str(reason or "")[:300])
    if not approvals.deciders(so):
        return None, ("Nobody can approve this: there is no line manager on record above you, and "
                      "nobody else can approve publication. Ask an administrator to set your line "
                      "manager on the Team page.")
    so.save()
    ev = tender or auction
    log(p, "Sign-off requested",
        f"{KIND_WORDS[kind].capitalize()} on {ev.ref}, waiting for {approver_words(so)}."
        + (f" {describe_change(so)}." if so.change else "")
        + (f" Reason: {so.reason}" if so.reason else ""), tender.id if tender else None)
    subject = {"auction_release": f"Approval needed before vendors are invited: {ev.title}",
               "deadline": f"Closing date change needs your approval: {ev.title}",
               "auction_times": f"Auction times change needs your approval: {ev.title}"}[kind]
    body = (f"{p['name']} asks you to approve the {KIND_WORDS[kind]} on {ev.ref} - {ev.title}."
            + (f" {describe_change(so).capitalize()}." if so.change else "")
            + (f" Reason given: {so.reason}" if so.reason else "")
            + " Nothing changes, and no vendor is told, until you approve.")
    _tell_people(approvals.deciders(so), subject, body, so)
    return so, None


def _tell_people(persona_ids, subject, body, so):
    from django.contrib.auth.models import User
    users = (User.objects.filter(is_active=True, profile__persona_id__in=persona_ids)
             .select_related("profile"))
    notify_users(users, subject, body, so.tender_id, destination={"page": "approvals"})


def void_for(why, tender=None, auction=None):
    """Requests on an event that has moved past them: cancelled, opened, closed."""
    qs = SignOff.objects.filter(status="pending")
    qs = qs.filter(tender=tender) if tender is not None else qs.filter(auction=auction)
    for so in qs:
        so.status = "void"
        so.decided_at = now_ms()
        so.decided_by = "System"
        so.note = why[:300]
        so.save(update_fields=["status", "decided_at", "decided_by", "note"])


def _apply(so, p):
    """Make the change. Returns an error sentence, or None."""
    if so.kind == "deadline":
        from .procurement import apply_deadline_change
        c = so.change or {}
        return apply_deadline_change(so.tender, c["deadline"][1], so.reason, p,
                                     requested_by=so.requested_by_name,
                                     resume=bool(c.get("resume")))
    if so.kind == "auction_release":
        from .auction_views import release
        return release(so.auction, p, approved_by=p["name"])
    if so.kind == "auction_times":
        from .auction_views import apply_times
        c = so.change or {}
        return apply_times(so.auction, p,
                           starts_at=(c.get("startsAt") or [None, None])[1],
                           ends_at=(c.get("endsAt") or [None, None])[1],
                           reason=so.reason, requested_by=so.requested_by_name)
    return "Unknown request."


@route(["POST"])
def decide(request, p, body, sid):
    so = SignOff.objects.select_related("tender", "auction", "approver").filter(pk=sid).first()
    if not so:
        return err("Request not found.", 404)
    if so.status != "pending":
        return err(f"This request is no longer waiting: it was {so.get_status_display().lower()}.", 409)
    if not approvals.may_decide(so, p):
        if p.get("id") == so.requested_by_id:
            return err("Nobody approves their own request.", 403)
        return err(f"This is waiting for {approver_words(so)}. It is not yours to approve.", 403)
    note = str(body.get("note") or body.get("reason") or "").strip()[:300]
    ev = _event(so)
    if body.get("ok") is not True:
        if not note:
            return err("Say why it is turned down, so the requester knows what to change.")
        so.status = "rejected"
        so.decided_at, so.decided_by, so.note = now_ms(), p["name"], note
        so.save(update_fields=["status", "decided_at", "decided_by", "note"])
        if so.kind == "auction_release" and so.auction.status == "approval":
            so.auction.status = "draft"
            so.auction.save(update_fields=["status"])
        log(p, "Sign-off turned down",
            f"{KIND_WORDS[so.kind].capitalize()} on {ev.ref} requested by {so.requested_by_name}. "
            f"Reason: {note}", so.tender_id)
        if so.requested_by_id:
            notify_personas([so.requested_by_id], f"Not approved: {ev.title}",
                            f"{p['name']} turned down the {KIND_WORDS[so.kind]} on {ev.ref}. "
                            f"Reason: {note}"
                            + (" The auction is back in draft." if so.kind == "auction_release" else
                               " Nothing changed and no vendor was told."), so.tender_id)
        return JsonResponse({"ok": True, "signoff": view(so, p)})

    problem = _apply(so, p)
    if problem:
        return err(f"This can no longer be applied: {problem} Turn it down and ask for a new one.", 409)
    so.status = "approved"
    so.decided_at, so.decided_by, so.note = now_ms(), p["name"], note
    so.save(update_fields=["status", "decided_at", "decided_by", "note"])
    log(p, "Sign-off given",
        f"{KIND_WORDS[so.kind].capitalize()} on {ev.ref} requested by {so.requested_by_name}."
        + (f" {note}" if note else ""), so.tender_id)
    if so.requested_by_id and so.requested_by_id != p.get("id"):
        notify_personas([so.requested_by_id], f"Approved: {ev.title}",
                        f"{p['name']} approved the {KIND_WORDS[so.kind]} on {ev.ref}. "
                        "It has been applied and the vendors told.", so.tender_id)
    return JsonResponse({"ok": True, "signoff": view(so, p)})


@route(["POST"])
def withdraw(request, p, body, sid):
    so = SignOff.objects.select_related("tender", "auction").filter(pk=sid).first()
    if not so:
        return err("Request not found.", 404)
    if so.status != "pending":
        return err("This request is no longer waiting.", 409)
    if p.get("id") != so.requested_by_id:
        return err("Only the person who asked can withdraw a request.", 403)
    so.status = "withdrawn"
    so.decided_at, so.decided_by = now_ms(), p["name"]
    so.save(update_fields=["status", "decided_at", "decided_by"])
    if so.kind == "auction_release" and so.auction.status == "approval":
        so.auction.status = "draft"
        so.auction.save(update_fields=["status"])
    ev = _event(so)
    log(p, "Sign-off request withdrawn", f"{KIND_WORDS[so.kind].capitalize()} on {ev.ref}.",
        so.tender_id)
    return JsonResponse({"ok": True})
