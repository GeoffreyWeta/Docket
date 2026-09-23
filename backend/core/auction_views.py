"""The reverse-auction API.

Its own endpoints under /api/auctions/, its own capabilities, its own models.
Nothing here touches a Tender, and that is the point - see the comment above
Auction in models.py for why the two stopped sharing a table.

WHAT A BIDDER MAY SEE IS DECIDED HERE, at serialization, for the same reason
sealing is decided at serialization in views.py: a rule enforced in the client
is not a rule. The auction's `visibility` setting has three positions and the
default is the strictest useful one:

  rank  - you are told your position and nothing about anyone's price. This is
          the default because live prices teach every vendor in the room what
          the others' cost base is, and they remember it at the next event.
          Rank produces the same downward pressure and leaks nothing that
          outlives the auction.
  price - the standing best price is shown, still without a name attached.
  blind - your own bids and the clock. Nothing else.

A vendor never receives another vendor's identity in any position, and the
undisclosed reserve is never sent to a bidder in any position at all.
"""
from django.http import JsonResponse

from . import auction as engine
from .models import Auction, AuctionLot, AuctionParticipant, LotBid, Supplier
from .permissions import has
from .util import now_ms, record_event, rid
from .views import err, log, route


# ---------------- serialization ----------------

def _lot_view(lot, *, for_buyer, monitor):
    out = {
        "id": lot.id, "number": lot.number, "title": lot.title,
        "description": lot.description, "qty": lot.qty, "uom": lot.uom,
        "ceiling": lot.ceiling, "minDecrement": lot.min_decrement,
        "decrementIsPct": lot.decrement_is_pct, "status": lot.status,
        "awardedTo": lot.awarded_to or None, "awardedAmount": lot.awarded_amount,
        "awardedAt": lot.awarded_at,
    }
    # The reserve is the buyer's walk-away price. A bidder who knew it would bid
    # exactly it and never a naira less, which is the whole reason it is
    # undisclosed - so it does not travel to the vendor side in any state.
    if for_buyer and monitor:
        out["reserve"] = lot.reserve
    return out


def _auction_view(a, p, *, monitor=False):
    supplier = p["role"] == "supplier"
    out = {
        "id": a.id, "ref": a.ref, "title": a.title, "scope": a.scope,
        "terms": a.terms, "status": a.status, "currency": a.currency,
        "visibility": a.visibility,
        "startsAt": a.starts_at, "endsAt": a.ends_at,
        "scheduledEndsAt": a.scheduled_ends_at, "closedAt": a.closed_at,
        "snipeWindowMs": a.snipe_window_ms, "extendByMs": a.extend_by_ms,
        "maxExtensions": a.max_extensions, "extensions": len(a.extensions or []),
        "ceilingVisible": a.ceiling_visible, "requireAcceptance": a.require_acceptance,
        "ownerId": a.owner_id, "createdAt": a.created_at,
        "pausedAt": a.paused_at, "pausedReason": a.paused_reason or "",
        "cancelledAt": a.cancelled_at, "cancelReason": a.cancel_reason or "",
        "awardedAt": a.awarded_at, "awardMemo": a.award_memo or "",
        "lots": [_lot_view(l, for_buyer=not supplier, monitor=monitor)
                 for l in a.lots.all()],
        "serverNow": now_ms(),
        "live": a.is_live(),
    }
    if not a.ceiling_visible and supplier and a.status in ("draft", "scheduled"):
        for l in out["lots"]:
            l["ceiling"] = None
    if not supplier:
        out["participants"] = a.participants.count()
        out["movements"] = a.bids.filter(retracted_at__isnull=True).count()
    return out


def _find(aid):
    return Auction.objects.filter(pk=aid).prefetch_related("lots").first()


def _mine(a, p):
    """The caller's participant row, or None. Vendors only."""
    if p["role"] != "supplier":
        return None
    return a.participants.filter(supplier_id=p["supplierId"]).first()


# ---------------- the list ----------------

@route(["GET"], perm="page.auctions")
def auction_list(request, p, body):
    rows = [_auction_view(a, p, monitor=has(p, "auction.monitor"))
            for a in Auction.objects.prefetch_related("lots").all()]
    return JsonResponse({"auctions": rows})


@route(["GET"], roles={"supplier"})
def my_auctions(request, p, body):
    """A vendor sees the auctions they were actually invited to, and drafts
    never appear: an auction nobody has opened is not yet an invitation."""
    ids = list(AuctionParticipant.objects
               .filter(supplier_id=p["supplierId"]).values_list("auction_id", flat=True))
    qs = (Auction.objects.filter(pk__in=ids)
          .exclude(status="draft").prefetch_related("lots"))
    out = []
    for a in qs:
        v = _auction_view(a, p)
        part = a.participants.filter(supplier_id=p["supplierId"]).first()
        v["accepted"] = bool(part and part.accepted_at)
        v["disqualified"] = bool(part and part.disqualified)
        out.append(v)
    return JsonResponse({"auctions": out})


# ---------------- creating and shaping one ----------------

@route(["POST"], perm="auction.create")
def auction_create(request, p, body):
    title = str(body.get("title", "")).strip()[:200]
    if not title:
        return err("Give the auction a title.")
    n = Auction.objects.count() + 1
    a = Auction.objects.create(
        id=rid("a"), ref=str(body.get("ref", "")).strip()[:40] or f"AUC-{n:04d}",
        title=title, scope=str(body.get("scope", "")).strip(),
        terms=str(body.get("terms", "")).strip(),
        created_at=now_ms(), created_by=p["name"], owner_id=p.get("id"),
        currency=str(body.get("currency", "NGN")).strip()[:3] or "NGN",
    )
    log(p, "Auction created", f"{a.ref} - {a.title}")
    return JsonResponse(_auction_view(a, p, monitor=True))


@route(["POST", "PATCH"], perm="auction.edit")
def auction_update(request, p, body, aid):
    a = _find(aid)
    if not a:
        return err("Auction not found.", 404)
    if a.status not in ("draft", "scheduled"):
        return err("A live auction's rules cannot be changed. Pause it and cancel "
                   "if the terms were wrong - bidders priced against what was published.", 409)

    for key, attr in (("title", "title"), ("scope", "scope"), ("terms", "terms"),
                      ("ref", "ref")):
        if key in body:
            setattr(a, attr, str(body[key]).strip()[:200])
    if "visibility" in body:
        if body["visibility"] not in dict(Auction.VISIBILITY):
            return err("Visibility must be rank, price or blind.")
        a.visibility = body["visibility"]
    for key, attr in (("startsAt", "starts_at"), ("endsAt", "ends_at"),
                      ("snipeWindowMs", "snipe_window_ms"), ("extendByMs", "extend_by_ms"),
                      ("maxExtensions", "max_extensions")):
        if key in body:
            try:
                setattr(a, attr, int(body[key] or 0))
            except (TypeError, ValueError):
                return err(f"{key} must be a number.")
    for key, attr in (("ceilingVisible", "ceiling_visible"),
                      ("requireAcceptance", "require_acceptance")):
        if key in body:
            setattr(a, attr, bool(body[key]))
    if a.ends_at and a.starts_at and a.ends_at <= a.starts_at:
        return err("The auction has to close after it opens.")
    a.save()
    return JsonResponse(_auction_view(a, p, monitor=True))


@route(["POST"], perm="auction.edit")
def lot_create(request, p, body, aid):
    a = _find(aid)
    if not a:
        return err("Auction not found.", 404)
    if a.status not in ("draft", "scheduled"):
        return err("Lots cannot be added once the room is open.", 409)
    try:
        ceiling = int(body.get("ceiling", 0) or 0)
    except (TypeError, ValueError):
        return err("The opening price must be a number.")
    if ceiling <= 0:
        return err("Give the lot an opening price. A reverse auction with no ceiling "
                   "is an invitation to bid anything and then negotiate.")
    title = str(body.get("title", "")).strip()[:200]
    if not title:
        return err("Give the lot a title.")

    reserve = body.get("reserve")
    if reserve not in (None, ""):
        try:
            reserve = int(reserve)
        except (TypeError, ValueError):
            return err("The reserve must be a number.")
        if reserve > ceiling:
            return err("A reserve above the opening price would make every bid fail it.")
    else:
        reserve = None

    lot = AuctionLot.objects.create(
        id=rid("l"), auction=a,
        number=(a.lots.count() + 1),
        title=title, description=str(body.get("description", "")).strip(),
        qty=int(body.get("qty", 1) or 1), uom=str(body.get("uom", "")).strip()[:24],
        ceiling=ceiling, reserve=reserve,
        min_decrement=int(body.get("minDecrement", 0) or 0),
        decrement_is_pct=bool(body.get("decrementIsPct")),
    )
    return JsonResponse(_lot_view(lot, for_buyer=True, monitor=True))


@route(["POST", "DELETE"], perm="auction.edit")
def lot_delete(request, p, body, aid, lid):
    a = _find(aid)
    if not a or a.status not in ("draft", "scheduled"):
        return err("Lots can only be removed from a draft.", 409)
    lot = a.lots.filter(pk=lid).first()
    if not lot:
        return err("Lot not found.", 404)
    lot.delete()
    for i, l in enumerate(a.lots.order_by("number"), start=1):
        if l.number != i:
            l.number = i
            l.save(update_fields=["number"])
    return JsonResponse({"ok": True})


# ---------------- who may bid ----------------

@route(["GET", "POST"], perm="auction.invite")
def participants(request, p, body, aid):
    a = _find(aid)
    if not a:
        return err("Auction not found.", 404)

    if request.method == "GET":
        names = {s.id: s.name for s in Supplier.objects.all()}
        return JsonResponse({"participants": [
            {"id": x.id, "supplierId": x.supplier_id,
             "supplier": names.get(x.supplier_id, x.supplier_id),
             "invitedAt": x.invited_at, "acceptedAt": x.accepted_at,
             "joinedAt": x.joined_at, "withdrawnAt": x.withdrawn_at,
             "disqualified": x.disqualified, "reason": x.disqualified_reason or ""}
            for x in a.participants.all()]})

    ids = body.get("supplierIds") or []
    if not isinstance(ids, list) or not ids:
        return err("Pick at least one vendor.")
    known = set(Supplier.objects.filter(pk__in=ids).values_list("id", flat=True))
    added = 0
    for sid in ids:
        if sid not in known:
            continue
        _, made = AuctionParticipant.objects.get_or_create(
            auction=a, supplier_id=sid,
            defaults={"id": rid("ap"), "invited_at": now_ms(), "invite_count": 1})
        added += 1 if made else 0
    log(p, "Auction vendors invited", f"{added} vendor(s) added to {a.ref}.")
    return JsonResponse({"ok": True, "added": added,
                         "total": a.participants.count()})


@route(["POST"], perm="auction.invite")
def disqualify(request, p, body, aid, pid):
    a = _find(aid)
    part = a and a.participants.filter(pk=pid).first()
    if not part:
        return err("Participant not found.", 404)
    reason = str(body.get("reason", "")).strip()[:300]
    if not reason:
        return err("Disqualifying a bidder mid-auction needs a reason on the record.")
    part.disqualified = True
    part.disqualified_reason = reason
    part.save(update_fields=["disqualified", "disqualified_reason"])
    log(p, "Auction bidder disqualified", f"{part.supplier_id} from {a.ref}: {reason}")
    return JsonResponse({"ok": True})


# ---------------- the lifecycle ----------------

@route(["POST"], perm="auction.open")
def auction_open(request, p, body, aid):
    a = _find(aid)
    if not a:
        return err("Auction not found.", 404)
    bad = engine.open_auction(a, p["name"])
    if bad:
        return err(bad, 409)
    return JsonResponse(_auction_view(a, p, monitor=True))


@route(["POST"], perm="auction.lifecycle")
def auction_pause(request, p, body, aid):
    """Stop the clock, and give the time back.

    A pause that let the clock run would quietly shorten the auction by however
    long it took to resolve whatever caused it, and the bidders who had not yet
    moved would pay for a problem that was not theirs.
    """
    a = _find(aid)
    if not a or a.status != "live":
        return err("Only a live auction can be paused.", 409)
    reason = str(body.get("reason", "")).strip()[:300]
    if not reason:
        return err("Say why the room is being paused - the bidders will be told.")
    now = now_ms()
    a.status = "paused"
    a.paused_at = now
    a.paused_reason = reason
    a.save(update_fields=["status", "paused_at", "paused_reason"])
    record_event(actor=p["name"], role=p["role"], action="Auction paused",
                 detail=f"{a.ref}: {reason}")
    return JsonResponse(_auction_view(a, p, monitor=True))


@route(["POST"], perm="auction.lifecycle")
def auction_resume(request, p, body, aid):
    a = _find(aid)
    if not a or a.status != "paused":
        return err("Only a paused auction can be resumed.", 409)
    now = now_ms()
    # Hand back exactly the time the pause took. The close moves by the length
    # of the interruption, so nobody loses bidding time to it.
    lost = now - (a.paused_at or now)
    a.ends_at = (a.ends_at or now) + lost
    a.status = "live"
    a.resumed_at = now
    a.save(update_fields=["status", "resumed_at", "ends_at"])
    record_event(actor=p["name"], role=p["role"], action="Auction resumed",
                 detail=f"{a.ref}: closing time moved out by {lost // 1000}s, "
                        f"the length of the pause.")
    return JsonResponse(_auction_view(a, p, monitor=True))


@route(["POST"], perm="auction.lifecycle")
def auction_close(request, p, body, aid):
    a = _find(aid)
    if not a:
        return err("Auction not found.", 404)
    outcome, bad = engine.close_auction(a, p["name"])
    if bad:
        return err(bad, 409)
    return JsonResponse({"ok": True, "outcome": outcome,
                         "savings": engine.savings(a),
                         "auction": _auction_view(a, p, monitor=True)})


@route(["POST"], perm="auction.lifecycle")
def auction_cancel(request, p, body, aid):
    a = _find(aid)
    if not a or a.status in ("awarded", "cancelled"):
        return err("This auction cannot be cancelled.", 409)
    reason = str(body.get("reason", "")).strip()[:300]
    if not reason:
        return err("Cancelling an auction needs a reason on the record.")
    a.status = "cancelled"
    a.cancelled_at = now_ms()
    a.cancel_reason = reason
    a.save(update_fields=["status", "cancelled_at", "cancel_reason"])
    record_event(actor=p["name"], role=p["role"], action="Auction cancelled",
                 detail=f"{a.ref}: {reason}")
    return JsonResponse(_auction_view(a, p, monitor=True))


@route(["POST"], perm="auction.award")
def auction_award(request, p, body, aid):
    """Commit to what the room produced.

    Separate capability from running the auction, and held by the approver
    rather than by procurement, for the same reason award.decide is: the person
    who ran the competition should not also be the person who commits the
    money to its result.
    """
    a = _find(aid)
    if not a:
        return err("Auction not found.", 404)
    if a.status != "closed":
        return err("An auction is awarded after it closes, not before.", 409)
    won = [l for l in a.lots.all() if l.awarded_to]
    if not won:
        return err("No lot has a winner - every lot was either unbid or failed its reserve.", 409)
    a.status = "awarded"
    a.awarded_at = now_ms()
    a.awarded_by = p["name"]
    a.award_memo = str(body.get("memo", "")).strip()
    a.save(update_fields=["status", "awarded_at", "awarded_by", "award_memo"])
    s = engine.savings(a)
    record_event(actor=p["name"], role=p["role"], action="Auction awarded",
                 detail=f"{a.ref}: {len(won)} lot(s), {s['final']:,} against an opening "
                        f"{s['ceiling']:,} - {s['saved']:,} below the opening price.")
    return JsonResponse({"ok": True, "savings": s,
                         "auction": _auction_view(a, p, monitor=True)})


# ---------------- the room ----------------

@route(["GET"])
def room(request, p, body, aid):
    """What one caller may see of a live auction, right now.

    The hot path: polled by every open room every couple of seconds, and the
    one place the visibility rules are applied. A buyer with auction.monitor
    gets names and prices; a buyer without gets the shape of the competition
    and none of its content; a vendor gets what the auction's visibility
    setting allows and never another vendor's identity.
    """
    a = _find(aid)
    if not a:
        return err("Auction not found.", 404)
    supplier = p["role"] == "supplier"
    part = _mine(a, p)
    if supplier and not part:
        return err("You are not a participant in this auction.", 403)
    if not supplier and not has(p, "page.auctions"):
        return err("You don't have permission to do that.", 403)

    monitor = (not supplier) and has(p, "auction.monitor")
    now = now_ms()
    out = _auction_view(a, p, monitor=monitor)
    out["lotState"] = []

    names = {s.id: s.name for s in Supplier.objects.all()} if monitor else {}

    for lot in a.lots.all():
        rows = engine.standings(lot)
        top = rows[0] if rows else None
        st = {"lotId": lot.id, "bidders": len(rows),
              "movements": lot.bids.filter(retracted_at__isnull=True).count()}

        if monitor:
            st["leaderboard"] = [
                {**r, "supplier": names.get(r["supplierId"], r["supplierId"])} for r in rows]
            st["best"] = top["amount"] if top else None
        elif not supplier:
            # A buyer-side reader without auction.monitor learns that a
            # competition is happening and nothing about its content.
            pass
        else:
            me = p["supplierId"]
            mine = [{"amount": b.amount, "at": b.at, "kind": b.kind}
                    for b in lot.bids.filter(supplier_id=me, retracted_at__isnull=True)
                                     .order_by("at")]
            my_rank = next((r["rank"] for r in rows if r["supplierId"] == me), None)
            st.update({"myBids": mine, "myRank": my_rank,
                       "leading": my_rank == 1 if my_rank else False})
            if a.visibility == "price":
                st["best"] = top["amount"] if top else None
            elif a.visibility == "rank":
                st["best"] = None
            else:                                  # blind
                st.pop("bidders", None)
                st["myRank"] = None
                st["leading"] = None
            px = lot.proxies.filter(supplier_id=me, cancelled_at__isnull=True).first()
            st["myLimit"] = px.floor if px else None
            # What they would have to bid to take the lead. Computed here rather
            # than in the browser because it depends on the standing best, which
            # in rank mode the browser is not allowed to know.
            if top and top["supplierId"] != me:
                st["toLead"] = lot.step_to_beat(top["amount"])
            elif not top:
                st["toLead"] = lot.ceiling
            else:
                st["toLead"] = None
        out["lotState"].append(st)

    if supplier and part:
        out["accepted"] = bool(part.accepted_at)
        out["disqualified"] = part.disqualified
        out["disqualifiedReason"] = part.disqualified_reason or ""
    return JsonResponse(out)


@route(["POST"], roles={"supplier"})
def accept_terms(request, p, body, aid):
    a = _find(aid)
    part = a and _mine(a, p)
    if not part:
        return err("You are not a participant in this auction.", 403)
    if not part.accepted_at:
        part.accepted_at = now_ms()
        part.save(update_fields=["accepted_at"])
    return JsonResponse({"ok": True, "acceptedAt": part.accepted_at})


@route(["POST"], roles={"supplier"})
def place_bid(request, p, body, aid, lid):
    a = _find(aid)
    if not a:
        return err("Auction not found.", 404)
    lot = a.lots.filter(pk=lid).first()
    if not lot:
        return err("Lot not found.", 404)
    try:
        amount = int(body.get("amount"))
    except (TypeError, ValueError):
        return err("Enter a price.")

    bid, bad = engine.place_bid(lot, p["supplierId"], amount)
    if bad:
        return err(bad, 409)
    lot.refresh_from_db()
    rank = engine.rank_of(lot, p["supplierId"])
    return JsonResponse({
        "ok": True, "bidId": bid.id, "amount": bid.amount, "at": bid.at,
        "myRank": rank, "leading": rank == 1,
        "extended": bid.extended, "endsAt": a.__class__.objects.get(pk=a.pk).ends_at,
        "serverNow": now_ms(),
    })


@route(["POST"], roles={"supplier"})
def set_limit(request, p, body, aid, lid):
    """A standing instruction: keep me leading, down to this price and no further."""
    a = _find(aid)
    lot = a and a.lots.filter(pk=lid).first()
    if not lot:
        return err("Lot not found.", 404)
    if body.get("cancel"):
        lot.proxies.filter(supplier_id=p["supplierId"],
                           cancelled_at__isnull=True).update(cancelled_at=now_ms())
        return JsonResponse({"ok": True, "limit": None})
    try:
        floor = int(body.get("floor"))
    except (TypeError, ValueError):
        return err("Enter the lowest price you are willing to accept.")
    px, bad = engine.set_proxy(lot, p["supplierId"], floor)
    if bad:
        return err(bad, 409)
    return JsonResponse({"ok": True, "limit": px.floor,
                         "myRank": engine.rank_of(lot, p["supplierId"])})


@route(["POST"], perm="auction.retract")
def retract_bid(request, p, body, aid, bid_id):
    """Strike a price from the standings without removing it from the record."""
    b = LotBid.objects.filter(pk=bid_id, auction_id=aid).first()
    if not b:
        return err("Bid not found.", 404)
    if b.retracted_at:
        return err("That bid is already voided.", 409)
    reason = str(body.get("reason", "")).strip()[:300]
    if not reason:
        return err("Voiding a bid needs a reason on the record.")
    b.retracted_at = now_ms()
    b.retracted_reason = reason
    b.save(update_fields=["retracted_at", "retracted_reason"])
    record_event(actor=p["name"], role=p["role"], action="Auction bid voided",
                 detail=f"{b.amount:,} from {b.supplier_id} on {b.auction_id}: {reason}")
    return JsonResponse({"ok": True})


@route(["GET"], perm="auction.monitor")
def auction_replay(request, p, body, aid):
    """The competition as it actually unfolded - the artefact an award file needs.

    Not a list of prices but the shape of the event: who led and for how long,
    which bids took the lead, what each extension was triggered by. "How do you
    know it was competitive" is the question an award gets asked, and a
    leaderboard alone does not answer it.
    """
    a = _find(aid)
    if not a:
        return err("Auction not found.", 404)
    names = {s.id: s.name for s in Supplier.objects.all()}
    rows = engine.replay(a)
    for r in rows:
        r["supplier"] = names.get(r["supplierId"], r["supplierId"])
    return JsonResponse({
        "auction": _auction_view(a, p, monitor=True),
        "movements": rows,
        "extensions": a.extensions or [],
        "savings": engine.savings(a),
    })
