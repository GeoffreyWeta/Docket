"""The procurement event lifecycle: rounds, live vendor management, and the
controls a competition needs between publication and award.

What was already here handled the straight line — draft, approve, publish,
seal, open, score, recommend, award — and handled it well. What it had no words
for is everything that happens when a live competition does not run straight:

  * a deadline that has to move, with the old date, the new one, the reason and
    a notice to every bidder (`extend_deadline`);
  * a competition that has to stop for a while, or stop for good (`pause`,
    `resume`, `cancel`);
  * a vendor who has to be added or withdrawn after publication, which is a
    different act from editing a draft because it changes who is racing
    (`event_vendors`);
  * a second and third submission window against the same scope, the same
    invitation list and the same award — a best-and-final, or a shortlist
    re-bid (`ProcurementRound` and the round endpoints below).

Rounds are lazy on purpose. An event with no round rows is a single-round
competition whose window is the tender's own deadline, which is what every
event created before this module existed is; `ProcurementRound.materialise`
turns that implicit round into a row exactly once, when somebody opens a
second. While a round is open the tender's own `deadline` and `status` mirror
it, so the sealing sweep, `eff_status`, the countdown and the bid room keep
working without knowing rounds exist at all.
"""
from django.db import transaction
from django.http import JsonResponse

from .models import Bid, ProcurementRound, Supplier, Tender
from .notify import notify_perm, notify_supplier, notify_suppliers
from .permissions import has
from .taxonomy import canonical
from .util import (closing_soon, eff_status, fmt_date_ms, now_ms, rid,
                   savings_against)
from .views import err, log, org_name, route

# Statuses from which a competition can still be steered. Awarded and cancelled
# events are read-only by design: an award is a commitment made to a vendor in
# writing, and an abandoned competition that can be quietly restarted is not an
# abandoned competition.
# The vocabulary itself lives on the model, next to the column that stores it.
FROZEN = ("awarded", "cancelled")


# ---------------- serialization ----------------

def round_view(r, p):
    """One round. A supplier is told the window and their own standing in it,
    never the shortlist: who else made the cut is exactly the fact a bidder
    would price against."""
    d = {
        "id": r.id, "tenderId": r.tender_id, "number": r.number, "name": r.label,
        "status": r.status, "opensAt": r.opens_at, "deadline": r.deadline,
        "openedAt": r.opened_at, "closedAt": r.closed_at,
        "instructions": r.instructions, "createdAt": r.created_at,
        "invitedCount": len(r.bidders()), "cancelReason": r.cancel_reason or "",
    }
    if p["role"] == "supplier":
        d["invited"] = [p["supplierId"]] if p["supplierId"] in r.bidders() else []
        d["mine"] = p["supplierId"] in r.bidders()
    else:
        d["invited"] = r.bidders()
        d["createdBy"] = r.created_by
        d["bidCount"] = r.bids.count()
    return d


def rounds_for(t, p):
    return [round_view(r, p) for r in t.rounds.all()]


def lifecycle_fields(t, p):
    """The keys `tender_view` merges in for the lifecycle. Split out here rather
    than inlined there so views.py keeps owning sealing and this module keeps
    owning the lifecycle."""
    d = {
        "pausedAt": t.paused_at, "resumedAt": t.resumed_at,
        "cancelledAt": t.cancelled_at, "cancelReason": t.cancel_reason or "",
        "closingSoon": closing_soon(t),
        "effStatus": eff_status(t),
    }
    if p["role"] == "supplier":
        # A bidder is owed the fact that the date moved and by how much. Who
        # moved it, and why in the buyer's own words, is internal.
        d["pausedReason"] = ""
        d["deadlineChanges"] = [{"from": c.get("from"), "to": c.get("to"), "at": c.get("at")}
                                for c in (t.deadline_changes or [])]
        d["projectedCost"] = None
    else:
        d["pausedReason"] = t.paused_reason or ""
        d["deadlineChanges"] = t.deadline_changes or []
        d["projectedCost"] = t.projected_cost
    return d


def vendor_rows(t, p):
    """The event's vendor table: one row per invited vendor, carrying where they
    are in registration, in verification, in invitation and in bidding.

    Buyer-side only. A vendor asking who else was invited, whether they bid and
    what round they reached is asking about the shape of the competition, and
    that is not a question the invitation entitles them to an answer to.
    """
    if p["role"] == "supplier":
        return []
    ids = list(t.invited or [])
    if t.awarded_to and t.awarded_to not in ids:
        ids.append(t.awarded_to)
    suppliers = {s.id: s for s in Supplier.objects.filter(id__in=ids)}
    bids = list(Bid.objects.filter(tender=t).select_related("round"))
    rounds = {r.id: r for r in t.rounds.all()}
    latest = t.latest_round()
    out = []
    for sid in ids:
        s = suppliers.get(sid)
        if not s:
            continue  # struck off the register since; the audit chain still has them
        mine = [b for b in bids if b.supplier_id == sid]
        mine.sort(key=lambda b: (b.round.number if b.round_id else 1))
        last = mine[-1] if mine else None
        scored = bool(last and (last.scores or {}))
        out.append({
            "supplierId": sid,
            "name": s.name,
            "email": s.contact_email or "",
            "contactPerson": s.contact_person or "",
            "registrationStatus": s.registration_status(),
            "verificationStatus": s.verification_status(),
            # Invited to the event is a fact about the event; the vendor-level
            # `invited_at` is about the register drive and is a different thing.
            "invitationStatus": ("awaiting" if t.status in ("draft", "approval") else "sent"),
            "bidStatus": ("submitted" if last else "none"),
            "submittedAt": last.submitted_at if last else None,
            "roundsBid": [b.round.number if b.round_id else 1 for b in mine],
            "currentRound": (latest.number if latest else 1),
            "inCurrentRound": (sid in latest.bidders()) if latest else True,
            "disqualified": bool(last and last.disqualified),
            "evaluationStatus": ("scored" if scored else "pending" if last else "n/a"),
            "awarded": t.awarded_to == sid,
        })
    return out


def bucket_view(t, p):
    """The bid bucket: submissions grouped by round.

    Sealing is not relaxed here. The bucket answers "who bid, in which round,
    and when" — which is safe before an opening and is precisely what a manager
    needs to know that a round is complete. Amounts come from `bid_view` in
    views.py, which is the one place that decides whether a price may be seen.
    """
    groups = []
    explicit = list(t.rounds.all())
    all_bids = list(t.bids.select_related("round"))
    if explicit:
        for r in explicit:
            bids = [b for b in all_bids if b.round_id == r.id]
            groups.append({"round": round_view(r, p), "bids": _bucket_bids(bids, t, p)})
        orphans = [b for b in all_bids if b.round_id is None]
        if orphans:  # bids taken before the round was materialised; should be none
            groups.insert(0, {"round": None, "bids": _bucket_bids(orphans, t, p)})
    else:
        groups.append({
            "round": {"id": None, "number": 1, "name": "Round 1", "status": eff_status(t),
                      "deadline": t.deadline, "openedAt": t.opened_at,
                      "invitedCount": len(t.invited or []),
                      "invited": [] if p["role"] == "supplier" else list(t.invited or [])},
            "bids": _bucket_bids(all_bids, t, p),
        })
    return groups


def _bucket_bids(bids, t, p):
    from .views import bid_view
    names = {s.id: s.name for s in Supplier.objects.filter(
        id__in=[b.supplier_id for b in bids])}
    out = []
    for b in sorted(bids, key=lambda x: x.submitted_at):
        v = bid_view(b, t, p)
        if not v:
            continue
        v["supplierName"] = names.get(b.supplier_id, b.supplier_id)
        v["roundNumber"] = b.round.number if b.round_id else 1
        if v.get("amount") is not None:
            v["savings"] = savings_against(t, v["amount"])
        out.append(v)
    return out


# ---------------- lifecycle: deadline ----------------

@route(["POST"], perm="tender.extend")
def extend_deadline(request, p, body, tid):
    """Push the submission deadline back.

    Only forward: a deadline brought in is a deadline a bidder who was working
    to the published one cannot meet, and there is no version of that which is
    fair. Sealed events can be extended — that is a reopening, and it is the
    normal remedy when a deadline lapses on a competition with too few bids —
    but an opened one cannot, because bids whose prices have been seen cannot
    compete against bids submitted afterwards.
    """
    t = Tender.objects.filter(pk=tid).first()
    if not t:
        return err("Tender not found.", 404)
    if t.status in FROZEN:
        return err(f"This event is {t.status} — its deadline is final.", 409)
    if t.status in ("draft", "approval"):
        return err("Set the deadline on the draft itself; extensions are for live events.", 409)
    if t.opened_at or t.tech_opened_at:
        return err("Bids have been opened. Reopening after an opening would let a late "
                   "bidder price against what was already unsealed.", 409)
    try:
        new_deadline = int(body.get("deadline") or 0)
    except (TypeError, ValueError):
        return err("Enter a valid new deadline.")
    if new_deadline <= now_ms():
        return err("The new deadline must be in the future.")
    if new_deadline <= t.deadline:
        return err("A deadline can only be pushed back. Bidders working to the published "
                   "date cannot be asked to meet an earlier one.")
    reason = str(body.get("reason") or "").strip()[:300]
    if not reason:
        return err("Give a reason — it is recorded and sent to every invited vendor.")

    old = t.deadline
    reopened = eff_status(t) == "closed"
    with transaction.atomic():
        # Reopening needs no status change: "closed" was never stored, it was
        # derived from the deadline having passed (see util.eff_status), so
        # moving the deadline forward lifts it by itself. A `status` write here
        # would be a second, contradictory source of truth for the same fact.
        t.deadline = new_deadline
        t.deadline_changes = list(t.deadline_changes or []) + [
            {"from": old, "to": new_deadline, "at": now_ms(), "by": p["name"], "reason": reason}
        ]
        t.save(update_fields=["deadline", "deadline_changes"])
        r = t.active_round() or t.latest_round()
        if r and r.status in ("open", "closed"):
            r.deadline = new_deadline
            r.status = "open"
            r.closed_at = None
            r.save(update_fields=["deadline", "status", "closed_at"])

    log(p, "Deadline extended" + (" — event reopened" if reopened else ""),
        f"{fmt_date_ms(old)} → {fmt_date_ms(new_deadline)}. {reason}", t.id)
    notify_suppliers(t.invited, f"Deadline extended: {t.title}",
                     f"The submission deadline for {t.ref} has moved from {fmt_date_ms(old)} to "
                     f"{fmt_date_ms(new_deadline)}. Reason given: {reason}", t.id)
    notify_perm("bid.open", f"Deadline extended: {t.title}",
                f"{p['name']} moved the deadline on {t.ref} to {fmt_date_ms(new_deadline)}. {reason}", t.id)
    return JsonResponse({"ok": True, "deadline": new_deadline})


# ---------------- lifecycle: pause / resume / cancel ----------------

@route(["POST"], perm="tender.lifecycle")
def pause_event(request, p, body, tid):
    t = Tender.objects.filter(pk=tid).first()
    if not t:
        return err("Tender not found.", 404)
    if t.status == "paused":
        return err("This event is already paused.", 409)
    if t.status != "published":
        return err("Only a live event can be paused.", 409)
    reason = str(body.get("reason") or "").strip()[:300]
    if not reason:
        return err("Give a reason — vendors are told why their competition stopped.")
    t.status = "paused"
    t.paused_at = now_ms()
    t.paused_reason = reason
    t.save(update_fields=["status", "paused_at", "paused_reason"])
    log(p, "Event paused", f"Submissions suspended. {reason}", t.id)
    notify_suppliers(t.invited, f"Event paused: {t.title}",
                     f"{org_name()} has paused {t.ref}. No submissions are being taken while it is "
                     f"paused, and you will be told when it resumes. Reason given: {reason}", t.id)
    return JsonResponse({"ok": True})


@route(["POST"], perm="tender.lifecycle")
def resume_event(request, p, body, tid):
    """Restart a paused event, optionally with a new deadline.

    A pause eats the bidders' remaining time, so resuming without moving the
    deadline is only honest where time is left. Where the deadline passed while
    the event was paused, a new one is required rather than defaulted: the
    system cannot know how long bidders now need.
    """
    t = Tender.objects.filter(pk=tid).first()
    if not t:
        return err("Tender not found.", 404)
    if t.status != "paused":
        return err("This event is not paused.", 409)
    new_deadline = body.get("deadline")
    if new_deadline:
        try:
            new_deadline = int(new_deadline)
        except (TypeError, ValueError):
            return err("Enter a valid new deadline.")
        if new_deadline <= now_ms():
            return err("The new deadline must be in the future.")
    elif t.deadline <= now_ms():
        return err("The deadline passed while this event was paused. Set a new one to resume.")
    else:
        new_deadline = None

    old = t.deadline
    t.status = "published"
    t.resumed_at = now_ms()
    t.paused_reason = ""
    fields = ["status", "resumed_at", "paused_reason"]
    if new_deadline:
        t.deadline = new_deadline
        t.deadline_changes = list(t.deadline_changes or []) + [
            {"from": old, "to": new_deadline, "at": now_ms(), "by": p["name"],
             "reason": "Event resumed after a pause."}]
        fields += ["deadline", "deadline_changes"]
    t.save(update_fields=fields)
    r = t.latest_round()
    if r and r.status in ("open", "closed"):
        r.status = "open"
        r.closed_at = None
        if new_deadline:
            r.deadline = new_deadline
        r.save(update_fields=["status", "closed_at", "deadline"])

    detail = "Submissions reopened."
    if new_deadline:
        detail += f" Deadline moved {fmt_date_ms(old)} → {fmt_date_ms(new_deadline)}."
    log(p, "Event resumed", detail, t.id)
    notify_suppliers(t.invited, f"Event resumed: {t.title}",
                     f"{org_name()} has resumed {t.ref}. Submissions are open again"
                     + (f" until {fmt_date_ms(t.deadline)}." if t.deadline else "."), t.id)
    return JsonResponse({"ok": True, "deadline": t.deadline})


@route(["POST"], perm="tender.lifecycle")
def cancel_event(request, p, body, tid):
    """Abandon a competition. One way: there is no un-cancel here.

    A cancellation is told to every bidder, and a competition that can be
    silently restarted after that notice is a competition whose bidders cannot
    trust the notice. Restarting means raising a new event, which is also the
    honest record of what happened.
    """
    t = Tender.objects.filter(pk=tid).first()
    if not t:
        return err("Tender not found.", 404)
    if t.status == "cancelled":
        return err("This event is already cancelled.", 409)
    if t.status == "awarded":
        return err("An awarded event cannot be cancelled — the award is a commitment already "
                   "made in writing. Terminate the contract instead.", 409)
    reason = str(body.get("reason") or "").strip()[:300]
    if not reason:
        return err("Give a reason — every invited vendor is told it verbatim.")
    n = t.bids.count()
    with transaction.atomic():
        t.status = "cancelled"
        t.cancelled_at = now_ms()
        t.cancel_reason = reason
        t.save(update_fields=["status", "cancelled_at", "cancel_reason"])
        t.rounds.exclude(status__in=("completed", "cancelled")).update(
            status="cancelled", cancel_reason=reason)
    log(p, "Event cancelled", f"{reason} {n} submission(s) held unopened.", t.id)
    notify_suppliers(t.invited, f"Event cancelled: {t.title}",
                     f"{org_name()} has cancelled {t.ref}. No award will be made. "
                     f"Reason given: {reason}\n\nAny sealed bid you submitted was not opened.", t.id)
    notify_perm("bid.open", f"Event cancelled: {t.title}",
                f"{p['name']} cancelled {t.ref}. {reason}", t.id)
    return JsonResponse({"ok": True})


# ---------------- the event's vendors ----------------

@route(["GET", "POST", "DELETE"])
def event_vendors(request, p, body, tid):
    """The invitation list of a live event.

    GET is the vendor table. POST adds vendors and invites them. DELETE
    withdraws one, and only one who has not bid: a submitted bid is a record of
    participation, and quietly dropping a bidder off the list would erase it.

    Reading and changing are separated rather than sharing one capability. An
    auditor's whole job is to be able to see who was invited to what and whether
    they answered; requiring the capability to *change* the list in order to
    *read* it would put that behind a grant nobody should be given for oversight.
    So the read follows whether this person can see the event at all, and only
    the writes ask for `tender.vendors`.

    Unverified vendors are added without objection. That is the standing rule
    here — verification gates prequalification, not participation — and the
    response says so, so the buyer knows what they just invited.
    """
    t = Tender.objects.filter(pk=tid).first()
    if not t:
        return err("Tender not found.", 404)
    if p["role"] == "supplier":
        return err("The other vendors on an event are not shared with its bidders.", 403)

    if request.method == "GET":
        if not (has(p, "page.tenders") or has(p, "page.evals") or has(p, "page.approvals")
                or has(p, "tender.vendors")):
            return err("You don't have permission to see this event's vendors.", 403)
        return JsonResponse({"vendors": vendor_rows(t, p), "rounds": rounds_for(t, p)})

    if not has(p, "tender.vendors"):
        return err("You don't have permission to change this event's vendors.", 403)
    if t.status in FROZEN:
        return err(f"This event is {t.status} — its invitation list is final.", 409)

    if request.method == "DELETE":
        sid = str(body.get("supplierId") or "")
        if sid not in (t.invited or []):
            return err("That vendor is not on this event's invitation list.", 404)
        if Bid.objects.filter(tender=t, supplier_id=sid).exists():
            return err("This vendor has already submitted. Withdrawing them now would erase a "
                       "record of participation — disqualify them at evaluation instead.", 409)
        s = Supplier.objects.filter(pk=sid).first()
        t.invited = [x for x in t.invited if x != sid]
        t.save(update_fields=["invited"])
        for r in t.rounds.all():
            if sid in (r.invited or []):
                r.invited = [x for x in r.invited if x != sid]
                r.save(update_fields=["invited"])
        log(p, "Vendor withdrawn from event",
            f"{s.name if s else sid} removed from the invitation list.", t.id)
        if s and t.status not in ("draft", "approval"):
            notify_supplier(sid, f"Invitation withdrawn: {t.title}",
                            f"Your invitation to {t.ref} has been withdrawn by {org_name()}.", t.id)
        return JsonResponse({"ok": True, "invited": t.invited})

    # --- POST: add one or many ---
    ids = body.get("supplierIds")
    if ids is None and body.get("supplierId"):
        ids = [body["supplierId"]]
    if not isinstance(ids, list) or not ids:
        return err("Choose at least one vendor to add.")
    ids = [str(x) for x in ids][:200]
    found = {s.id: s for s in Supplier.objects.filter(id__in=ids)}
    missing = [i for i in ids if i not in found]
    if missing:
        return err(f"{len(missing)} of those vendors are not on the register.", 404)

    already = [i for i in ids if i in (t.invited or [])]
    fresh = [i for i in ids if i not in (t.invited or [])]
    if not fresh:
        return err("Every vendor you chose is already invited to this event.", 409)

    unverified = [found[i].name for i in fresh if found[i].verification_status() != "verified"]
    suspended = [found[i].name for i in fresh if found[i].suspended]
    if suspended:
        return err("Suspended vendors cannot be invited: " + ", ".join(suspended[:5]) + ".", 409)

    t.invited = list(t.invited or []) + fresh
    t.save(update_fields=["invited"])
    r = t.active_round()
    if r and r.invited:
        r.invited = list(r.invited) + fresh
        r.save(update_fields=["invited"])

    names = ", ".join(found[i].name for i in fresh[:8]) + ("…" if len(fresh) > 8 else "")
    log(p, "Vendors added to event",
        f"{len(fresh)} vendor(s) invited: {names}."
        + (f" {len(unverified)} of them unverified." if unverified else ""), t.id)

    live = t.status in ("published", "paused") or eff_status(t) == "closed"
    if live and body.get("notify", True):
        for sid in fresh:
            notify_supplier(sid, f"Invitation to tender: {t.title}",
                            f"{org_name()} invites your sealed bid for {t.ref} — {t.title}. "
                            + (f"Submissions close {fmt_date_ms(t.deadline)}. " if t.deadline else "")
                            + "Full terms are in your bid room.", t.id)
    return JsonResponse({"ok": True, "added": fresh, "alreadyInvited": already,
                         "unverified": unverified, "invited": t.invited})


@route(["POST"], perm="tender.vendors")
def notify_event_vendors(request, p, body, tid):
    """A deliberate message to the event's vendors — a nudge before a deadline,
    a note that documents changed. Distinct from an addendum, which amends the
    tender itself and which bidders must acknowledge before submitting."""
    t = Tender.objects.filter(pk=tid).first()
    if not t:
        return err("Tender not found.", 404)
    message = str(body.get("message") or "").strip()[:2000]
    if not message:
        return err("Write the message the vendors will receive.")
    subject = str(body.get("subject") or "").strip()[:160] or f"Update: {t.title}"
    targets = body.get("supplierIds")
    if not isinstance(targets, list) or not targets:
        targets = list(t.invited or [])
    targets = [s for s in targets if s in (t.invited or [])]
    if not targets:
        return err("No invited vendors to notify.", 409)
    only = body.get("only")
    if only == "nobid":
        bidders = set(Bid.objects.filter(tender=t).values_list("supplier_id", flat=True))
        targets = [s for s in targets if s not in bidders]
        if not targets:
            return err("Every invited vendor has already submitted.", 409)
    notify_suppliers(targets, subject, message, t.id)
    log(p, "Vendors notified", f"{len(targets)} vendor(s) sent \"{subject}\".", t.id)
    return JsonResponse({"ok": True, "sent": len(targets)})


# ---------------- rounds ----------------

@route(["GET", "POST"])
def round_collection(request, p, body, tid):
    """List an event's rounds, or open a new one.

    Read and write are split for the same reason they are on the vendor list: a
    bidder is entitled to know which round is running and an auditor is entitled
    to know how many there were, and neither of those is permission to start
    one. Vendors get the round-level view `round_view` allows them, which is the
    window and their own standing in it — never the shortlist.
    """
    t = Tender.objects.filter(pk=tid).first()
    if not t:
        return err("Tender not found.", 404)
    if request.method == "GET":
        if p["role"] == "supplier" and p["supplierId"] not in (t.invited or []):
            return err("You are not invited to this event.", 403)
        return JsonResponse({"rounds": rounds_for(t, p)})

    if not has(p, "tender.rounds"):
        return err("You don't have permission to run bidding rounds.", 403)
    if t.status in FROZEN:
        return err(f"This event is {t.status} — no further rounds can be opened.", 409)
    if t.status in ("draft", "approval"):
        return err("Publish the event first. Round 1 is the event's own submission window.", 409)
    if t.ttype == "AUC":
        return err("A reverse auction is a single continuous competition — it has no rounds.", 409)

    try:
        deadline = int(body.get("deadline") or 0)
    except (TypeError, ValueError):
        return err("Enter a valid deadline for this round.")
    if deadline <= now_ms():
        return err("The round's deadline must be in the future.")
    try:
        opens_at = int(body.get("opensAt") or 0) or now_ms()
    except (TypeError, ValueError):
        opens_at = now_ms()
    if opens_at >= deadline:
        return err("The round's deadline must be after it opens.")

    with transaction.atomic():
        first = ProcurementRound.materialise(t, actor=p["name"])
        prev = t.rounds.order_by("-number").first()
        if prev and prev.status in ("open", "upcoming"):
            return err(f"{prev.label} is still open. Close it before opening another.", 409)
        # Who bids in this round. Empty means everyone invited to the event; a
        # best-and-final normally carries a shortlist, and the shortlist has to
        # be drawn from people who actually bid — inviting a new vendor into a
        # later round would let them price against a published field.
        shortlist = body.get("invited")
        if isinstance(shortlist, list) and shortlist:
            prior = set(Bid.objects.filter(tender=t).values_list("supplier_id", flat=True))
            bad = [s for s in shortlist if s not in prior]
            if bad:
                return err("A later round is drawn from vendors who bid in an earlier one. "
                           f"{len(bad)} of those did not.", 409)
            invited = [str(s) for s in shortlist]
        else:
            invited = list(t.invited or [])
        if not invited:
            return err("A round needs at least one vendor.")

        number = (prev.number if prev else 0) + 1
        r = ProcurementRound.objects.create(
            id=rid("r"), tender=t, number=number,
            name=str(body.get("name") or "").strip()[:120] or f"Round {number}",
            status="upcoming", opens_at=opens_at, deadline=deadline,
            instructions=str(body.get("instructions") or "").strip()[:4000],
            invited=invited, created_at=now_ms(), created_by=p["name"],
        )
    log(p, "Round created",
        f"{r.label} drafted for {len(invited)} vendor(s), closing {fmt_date_ms(deadline)}.", t.id)
    return JsonResponse({"ok": True, "round": round_view(r, p)})


def _round(rid_):
    return ProcurementRound.objects.select_related("tender").filter(pk=rid_).first()


@route(["PATCH", "POST"], perm="tender.rounds")
def round_update(request, p, body, rid_):
    r = _round(rid_)
    if not r:
        return err("Round not found.", 404)
    if r.status not in ("draft", "upcoming"):
        return err("Only a round that has not opened can be edited. Extend the deadline "
                   "instead once it is running.", 409)
    fields = []
    if "name" in body:
        r.name = str(body.get("name") or "").strip()[:120]
        fields.append("name")
    if "instructions" in body:
        r.instructions = str(body.get("instructions") or "").strip()[:4000]
        fields.append("instructions")
    if "deadline" in body:
        try:
            d = int(body.get("deadline") or 0)
        except (TypeError, ValueError):
            return err("Enter a valid deadline.")
        if d <= now_ms():
            return err("The round's deadline must be in the future.")
        r.deadline = d
        fields.append("deadline")
    if "opensAt" in body:
        try:
            o = int(body.get("opensAt") or 0)
        except (TypeError, ValueError):
            return err("Enter a valid opening time.")
        r.opens_at = o
        fields.append("opens_at")
    if r.opens_at and r.deadline and r.opens_at >= r.deadline:
        return err("The round's deadline must be after it opens.")
    if "invited" in body and isinstance(body["invited"], list):
        prior = set(Bid.objects.filter(tender=r.tender).values_list("supplier_id", flat=True))
        bad = [s for s in body["invited"] if s not in prior and r.number > 1]
        if bad:
            return err("A later round is drawn from vendors who bid in an earlier one.", 409)
        r.invited = [str(s) for s in body["invited"]]
        fields.append("invited")
    if not fields:
        return err("Nothing to change.")
    r.save(update_fields=fields)
    log(p, "Round updated", f"{r.label} amended before opening.", r.tender_id)
    return JsonResponse({"ok": True, "round": round_view(r, p)})


@route(["POST"], perm="tender.rounds")
def round_open(request, p, body, rid_):
    """Open a round for submissions.

    The tender's own `deadline` and `status` are pointed at this round while it
    runs. That is what lets everything written before rounds existed — the
    sealing sweep, `eff_status`, the bid room's countdown, the submission
    guard — keep working with no knowledge of them.
    """
    r = _round(rid_)
    if not r:
        return err("Round not found.", 404)
    t = r.tender
    if t.status in FROZEN:
        return err(f"This event is {t.status}.", 409)
    if r.status == "open":
        return err("This round is already open.", 409)
    if r.status not in ("draft", "upcoming"):
        return err("A round that has closed cannot be reopened. Open a new one.", 409)
    if not r.deadline or r.deadline <= now_ms():
        return err("Set a deadline in the future before opening this round.")
    other = t.rounds.filter(status="open").exclude(pk=r.pk).first()
    if other:
        return err(f"{other.label} is still open. Close it first.", 409)
    if t.bids.filter(round__isnull=True).exists() and r.number > 1:
        ProcurementRound.materialise(t, actor=p["name"])

    with transaction.atomic():
        r.status = "open"
        r.opens_at = r.opens_at or now_ms()
        r.closed_at = None
        r.save(update_fields=["status", "opens_at", "closed_at"])
        t.status = "published"
        t.deadline = r.deadline
        # The earlier round's opening is left exactly where it is. A later round
        # is a fresh sealing, but that is expressed by this round having no
        # `opened_at` of its own — not by erasing the record that round 1 was
        # opened, which happened, was witnessed and is what the documents
        # already released are released under. See views._round_opened.
        t.save(update_fields=["status", "deadline"])

    log(p, f"{r.label} opened",
        f"Submissions open to {len(r.bidders())} vendor(s) until {fmt_date_ms(r.deadline)}.", t.id)
    notify_suppliers(r.bidders(), f"{r.label} open: {t.title}",
                     f"{org_name()} has opened {r.label.lower()} of {t.ref}. Submissions close "
                     f"{fmt_date_ms(r.deadline)}."
                     + (f"\n\n{r.instructions}" if r.instructions else ""), t.id)
    return JsonResponse({"ok": True, "round": round_view(r, p)})


@route(["POST"], perm="tender.rounds")
def round_close(request, p, body, rid_):
    """Close a round early. Reaching its deadline closes it too — this is the
    manual case, for a round every invited vendor has already answered."""
    r = _round(rid_)
    if not r:
        return err("Round not found.", 404)
    t = r.tender
    if r.status != "open":
        return err("Only an open round can be closed.", 409)
    n = r.bids.count()
    with transaction.atomic():
        r.status = "closed"
        r.closed_at = now_ms()
        r.deadline = min(r.deadline or now_ms(), now_ms())
        r.save(update_fields=["status", "closed_at", "deadline"])
        t.deadline = r.deadline   # keeps eff_status() reading "closed"
        t.save(update_fields=["deadline"])
    log(p, f"{r.label} closed", f"{n} submission(s) sealed for opening.", t.id)
    notify_perm("bid.open", f"{r.label} closed: {t.title}",
                f"{r.label} of {t.ref} is closed with {n} sealed submission(s), ready for a "
                f"recorded opening.", t.id)
    return JsonResponse({"ok": True, "round": round_view(r, p)})


@route(["POST"], perm="tender.rounds")
def round_cancel(request, p, body, rid_):
    r = _round(rid_)
    if not r:
        return err("Round not found.", 404)
    if r.status in ("completed", "cancelled"):
        return err(f"This round is already {r.status}.", 409)
    reason = str(body.get("reason") or "").strip()[:300]
    if not reason:
        return err("Give a reason — the round's bidders are told it.")
    t = r.tender
    was_open = r.status == "open"
    with transaction.atomic():
        r.status = "cancelled"
        r.cancel_reason = reason
        r.closed_at = now_ms()
        r.save(update_fields=["status", "cancel_reason", "closed_at"])
        if was_open:
            # Fall back to whatever the last completed round left behind, so the
            # event does not sit "published" with a live deadline nobody can
            # bid into.
            prev = t.rounds.filter(number__lt=r.number).order_by("-number").first()
            t.status = "evaluation" if (prev and prev.bids.exists()) else "published"
            if t.status == "published" and prev and prev.deadline:
                t.deadline = prev.deadline
            t.save(update_fields=["status", "deadline"])
    log(p, f"{r.label} cancelled", reason, t.id)
    if was_open:
        notify_suppliers(r.bidders(), f"{r.label} cancelled: {t.title}",
                         f"{org_name()} has cancelled {r.label.lower()} of {t.ref}. "
                         f"Reason given: {reason}", t.id)
    return JsonResponse({"ok": True, "round": round_view(r, p)})


@route(["GET"])
def bid_bucket(request, p, body, tid):
    """Submissions grouped by round, for the manager and the evaluation panel."""
    t = Tender.objects.filter(pk=tid).first()
    if not t:
        return err("Tender not found.", 404)
    if p["role"] == "supplier":
        return err("Bid submissions are not shared between vendors.", 403)
    if not has(p, "page.tenders") and not has(p, "bid.score") and not has(p, "bid.open"):
        return err("You don't have permission to see this event's submissions.", 403)
    return JsonResponse({"groups": bucket_view(t, p),
                         "budget": t.budget, "projectedCost": t.projected_cost,
                         "baseline": t.baseline})


# ---------------- the vendor register ----------------

@route(["POST"], perm="supplier.register")
def register_supplier(request, p, body):
    """Put a vendor on the register from inside DOCKET.

    The buyer knows the company; waiting for the company to fill in a form is a
    week of nothing. They arrive `unverified` and `pending registration`, which
    is exactly what they are: somebody typed them in, nobody has checked them,
    and they hold no account of their own yet.

    Duplicate detection is by name and by email, and it refuses rather than
    merges. A register of 1,400 vendors accumulates near-misses, and silently
    folding "Adeola Ltd" into "Adeola Limited" is a decision only a person
    should make.
    """
    from .account_views import EMAIL_RE

    name = str(body.get("name") or "").strip()[:120]
    if len(name) < 2:
        return err("Enter the vendor's registered company name.")
    email = str(body.get("email") or "").strip().lower()[:200]
    if email and not EMAIL_RE.match(email):
        return err("Enter a valid contact email address, or leave it blank.")

    clash = Supplier.objects.filter(name__iexact=name).first()
    if not clash and email:
        clash = Supplier.objects.filter(contact_email__iexact=email).first()
    if clash:
        return JsonResponse({
            "error": f"{clash.name} is already on the register"
                     + (f" ({clash.contact_email})" if clash.contact_email else "")
                     + ". Add them to your event instead of creating a second record.",
            "existing": {"id": clash.id, "name": clash.name,
                         "email": clash.contact_email, "code": clash.code},
        }, status=409)

    s = Supplier.objects.create(
        id=rid("s"),
        name=name,
        contact_email=email,
        category=canonical(str(body.get("category") or "")),
        subcategory=str(body.get("subcategory") or "").strip()[:60],
        location=str(body.get("location") or "").strip()[:60] or "—",
        contact_person=str(body.get("contactPerson") or "").strip()[:140],
        phone=str(body.get("phone") or "").strip()[:120],
        address=str(body.get("address") or "").strip()[:300],
        payment_terms=str(body.get("paymentTerms") or "").strip()[:80],
        code=str(body.get("code") or "").strip()[:24],
        classification=str(body.get("classification") or "").strip()[:140],
        prequalified=False, docs=[], perf={}, registry={},
        source="buyer", registered_at=None,
    )
    log(p, "Vendor registered on the register",
        f"{s.name} added directly by {p['name']}. Unverified until prequalification.")
    if email and body.get("invite", True):
        # They still need an account of their own to receive invitations and
        # bid. The registration link is the same one the drive uses.
        from .account_views import _link, _mail, _mint
        tok = _mint("vendor_claim", email, {"supplierId": s.id})
        s.invited_at = now_ms()
        s.invite_count = (s.invite_count or 0) + 1
        s.save(update_fields=["invited_at", "invite_count"])
        _mail(email, f"{org_name()} has added {s.name} to their vendor register",
              f"{org_name()} uses DOCKET for sealed-bid tendering and has added {s.name} to "
              f"their register. Set a password to claim your account:\n\n"
              f"{_link(request, 'register', tok.token)}\n\n"
              f"You can then receive invitations and submit bids.")
    return JsonResponse({"ok": True, "id": s.id, "name": s.name})


@route(["POST"], perm="supplier.suspend")
def suspend_supplier(request, p, body, sid):
    """Bar a vendor from new invitations, or lift the bar.

    Suspension does not undo verification. A vendor whose insurance lapsed for
    six weeks and then renewed it should come back verified, not start their
    prequalification over — and the register should be able to say what the six
    weeks were about.
    """
    s = Supplier.objects.filter(pk=sid).first()
    if not s:
        return err("Supplier not found.", 404)
    lift = body.get("ok") is False or body.get("lift") is True
    if lift:
        if not s.suspended:
            return err("This vendor is not suspended.", 409)
        s.suspended = False
        s.suspended_reason = ""
        s.suspended_at = None
        s.save(update_fields=["suspended", "suspended_reason", "suspended_at"])
        log(p, "Vendor suspension lifted",
            f"{s.name} is eligible for invitations again"
            + (" and remains prequalified." if s.prequalified else "."))
        notify_supplier(s.id, "Suspension lifted",
                        f"{org_name()} has lifted the suspension on {s.name}. You can be invited "
                        f"to tenders again.")
        return JsonResponse({"ok": True, "suspended": False})

    reason = str(body.get("reason") or "").strip()[:300]
    if not reason:
        return err("Give a reason — it is recorded and sent to the vendor.")
    if s.suspended:
        return err("This vendor is already suspended.", 409)
    # `invited` is a JSON array and SQLite has no containment lookup for one.
    # The live set is a handful of rows, so it is filtered in Python rather than
    # pushed into a LIKE over serialised JSON, which would match ids by prefix.
    live = [t.ref for t in Tender.objects.filter(status__in=("published", "paused"))
            if s.id in (t.invited or [])]
    s.suspended = True
    s.suspended_reason = reason
    s.suspended_at = now_ms()
    s.save(update_fields=["suspended", "suspended_reason", "suspended_at"])
    log(p, "Vendor suspended",
        f"{s.name}: {reason}"
        + (f" Still invited to {len(live)} live event(s); existing invitations stand."
           if live else ""))
    notify_supplier(s.id, "Vendor account suspended",
                    f"{org_name()} has suspended {s.name} from new tender invitations. "
                    f"Reason given: {reason}")
    return JsonResponse({"ok": True, "suspended": True, "liveEvents": live})
