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
from django.conf import settings
from django.http import HttpResponse, JsonResponse

from . import auction as engine
from . import bulk_invite, vocab
from .models import (ActionToken, Auction, AuctionLot, AuctionParticipant, Document,
                     LotBid, Profile, Supplier)
from .permissions import has
from .taxonomy import canonical
from .util import now_ms, record_event, rid
from .notify import notify_supplier
from .views import _agreement_words, _read_upload, _bid_whole, err, log, org_name, route


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
        "direction": a.direction,
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
        "images": _images_view(a),
        "serverNow": now_ms(),
        "live": a.is_live(),
    }
    out.update({
        "allowPrebid": a.allow_prebid, "scheduledAt": a.scheduled_at,
        "paymentTerms": a.payment_terms or "", "paymentConditions": a.payment_conditions or "",
        "ndaRequired": a.nda_required, "ndaText": "" if supplier else (a.nda_text or ""),
        "documents": _docs_view(a),
        # The pre-bid stage: scheduled, and the room not open yet.
        "prebidOpen": a.status == "scheduled" and a.allow_prebid and (a.starts_at or 0) > now_ms(),
    })
    if not a.ceiling_visible and supplier and a.status in ("draft", "approval", "scheduled"):
        for l in out["lots"]:
            l["ceiling"] = None
    if supplier:
        # The NDA and the payment terms come before anything else about it.
        from . import agreements
        out["agreements"] = agreements.summary(a, p["supplierId"])
        out["gated"] = bool(out["agreements"]["pending"])
        if out["gated"]:
            out.update({"scope": "", "terms": "", "lots": [], "images": [], "documents": []})
    if not supplier:
        from . import signoffs
        so = signoffs.pending(auction=a)
        out["signoff"] = signoffs.view(so, p) if so else None
        out["questionsWaiting"] = a.questions.filter(answered_at__isnull=True).count()
        out["participants"] = a.participants.count()
        out["movements"] = a.bids.filter(retracted_at__isnull=True).count()
        # Lots won by a company not on the vendor register: audit decides
        # before the award (engine.unregistered_winners).
        out["winnerChecks"] = [
            {"lotId": l.id, "lotNumber": l.number, "lotTitle": l.title, "amount": l.awarded_amount,
             "supplierId": s.id, "name": s.name, "email": s.contact_email or ""}
            for l, s in engine.unregistered_winners(a)]
    return out


def _images_view(a):
    # `data` is deferred: this runs on every poll of the room, and the photos
    # themselves are fetched once, by id, from their own endpoint.
    return [{"id": d.id, "name": d.name, "size": d.size}
            for d in _photos(a).defer("data").order_by("uploaded_at", "id")]


def _photos(a):
    """The auction's photos. Its documents share the relation (kind
    "auctiondoc"), so every photo query says which it means."""
    return a.images.filter(kind="auction")


def _docs_view(a):
    return [{"id": d.id, "name": d.name, "size": d.size, "uploadedAt": d.uploaded_at}
            for d in a.images.filter(kind="auctiondoc").defer("data").order_by("uploaded_at", "id")]


def _gate_error(a, supplier_id):
    from .views import _gate_error as gate
    return gate(a, supplier_id)


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
    engine.start_due()
    engine.settle_due()
    rows = [_auction_view(a, p, monitor=has(p, "auction.monitor"))
            for a in Auction.objects.prefetch_related("lots").all()]
    return JsonResponse({"auctions": rows})


@route(["GET"], roles={"supplier"})
def my_auctions(request, p, body):
    """A vendor sees the auctions they were actually invited to, and drafts
    never appear: an auction nobody has opened is not yet an invitation."""
    engine.start_due()
    engine.settle_due()
    ids = list(AuctionParticipant.objects
               .filter(supplier_id=p["supplierId"]).values_list("auction_id", flat=True))
    # Not a draft, and not one waiting for its line manager: until it is
    # approved nobody has been invited to anything.
    qs = (Auction.objects.filter(pk__in=ids)
          .exclude(status__in=("draft", "approval")).prefetch_related("lots"))
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
    direction = body.get("direction", "reverse")
    if direction not in ("reverse", "sale"):
        return err("Choose buying or selling auction.")
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
        direction=direction,
    )
    log(p, "Auction created", f"{a.ref} - {a.title}")
    return JsonResponse(_auction_view(a, p, monitor=True))


@route(["POST"], perm="auction.create")
def auction_duplicate(request, p, body, aid):
    """A new draft from an existing auction: same rules, lots and vendors, no
    dates and no bids. The vendors come across uninvited, so nobody hears
    about the copy until somebody sends the invitations."""
    src = _find(aid)
    if not src:
        return err("Auction not found.", 404)
    n = Auction.objects.count() + 1
    while Auction.objects.filter(ref=f"AUC-{n:04d}").exists():
        n += 1
    a = Auction.objects.create(
        id=rid("a"), ref=f"AUC-{n:04d}", title=f"{src.title} (copy)"[:200],
        scope=src.scope, terms=src.terms, visibility=src.visibility,
        currency=src.currency, direction=src.direction,
        snipe_window_ms=src.snipe_window_ms, extend_by_ms=src.extend_by_ms,
        max_extensions=src.max_extensions, ceiling_visible=src.ceiling_visible,
        require_acceptance=src.require_acceptance, allow_prebid=src.allow_prebid,
        payment_terms=src.payment_terms, payment_conditions=src.payment_conditions,
        nda_required=src.nda_required, nda_text=src.nda_text,
        created_at=now_ms(), created_by=p["name"], owner_id=p.get("id"),
        **{key: getattr(src, key) for key, _ in Auction.DIMENSIONS},
    )
    AuctionLot.objects.bulk_create([
        AuctionLot(id=rid("l"), auction=a, number=lot.number, title=lot.title,
                   description=lot.description, qty=lot.qty, uom=lot.uom,
                   ceiling=lot.ceiling, reserve=lot.reserve,
                   min_decrement=lot.min_decrement, decrement_is_pct=lot.decrement_is_pct)
        for lot in src.lots.all()])
    suspended = set(Supplier.objects.filter(suspended=True).values_list("id", flat=True))
    AuctionParticipant.objects.bulk_create([
        AuctionParticipant(id=rid("ap"), auction=a, supplier_id=x.supplier_id)
        for x in src.participants.all() if x.supplier_id not in suspended and not x.disqualified])
    log(p, "Auction duplicated", f"{a.ref} drafted from {src.ref}: dates cleared, lots and vendors carried over.")
    return JsonResponse(_auction_view(a, p, monitor=True))


@route(["POST", "PATCH"], perm="auction.edit")
def auction_update(request, p, body, aid):
    a = _find(aid)
    if not a:
        return err("Auction not found.", 404)
    if a.status == "approval":
        return err("This auction is waiting for approval. Recall it to draft to change it.", 409)
    if a.status != "draft":
        return err("The rules cannot change once vendors have been told: they are pricing against "
                   "what was published. Change the times, or cancel and duplicate it.", 409)
    if "direction" in body and body["direction"] != a.direction:
        return err("Buying or selling is fixed when the auction is created. Create a new auction to change its purpose.", 409)

    # Capped to each column's length. Scope and terms are text columns and are
    # not cut: a bidder prices against the whole of them.
    for key, attr, cap in (("title", "title", 200), ("scope", "scope", None),
                           ("terms", "terms", None), ("ref", "ref", 40)):
        if key in body:
            setattr(a, attr, str(body[key]).strip()[:cap])
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
                      ("requireAcceptance", "require_acceptance"),
                      ("allowPrebid", "allow_prebid"), ("ndaRequired", "nda_required")):
        if key in body:
            setattr(a, attr, bool(body[key]))
    if "paymentTerms" in body:
        a.payment_terms = vocab.payment_terms(body.get("paymentTerms"), keep=a.payment_terms or "")
    if "paymentConditions" in body:
        a.payment_conditions = str(body.get("paymentConditions") or "").strip()[:2000]
    if "ndaText" in body or "ndaRequired" in body:
        from .agreements import default_nda
        text = str(body.get("ndaText", a.nda_text) or "").strip()[:20000]
        a.nda_text = (text or default_nda()) if a.nda_required else ""
    if a.ends_at and a.starts_at and a.ends_at <= a.starts_at:
        return err("The auction has to close after it opens.")
    a.save()
    return JsonResponse(_auction_view(a, p, monitor=True))


@route(["POST"], perm="auction.edit")
def lot_create(request, p, body, aid):
    a = _find(aid)
    if not a:
        return err("Auction not found.", 404)
    if a.status != "draft":
        return err("Lots cannot change once the auction has gone to approval or to vendors.", 409)
    try:
        ceiling = _bid_whole(body.get("ceiling", 0) or 0)
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
            reserve = _bid_whole(reserve)
        except (TypeError, ValueError):
            return err("The reserve must be a number.")
        if a.direction != "sale" and reserve > ceiling:
            return err("A reserve above the opening price would make every bid fail it.")
    else:
        reserve = None

    try:
        step = _bid_whole(body.get("minDecrement", 0) or 0)
        qty = _bid_whole(body.get("qty", 1) or 1)
    except (TypeError, ValueError):
        return err("Quantity and minimum step must be whole non-negative amounts.")
    if qty <= 0:
        return err("Quantity must be positive.")
    pct = bool(body.get("decrementIsPct"))
    if pct and step > 50:
        # Past half, a buying auction's second bid would have to be nearly
        # free; nobody sets that on purpose.
        return err("The percentage a bid must beat the best by can be at most 50%.")
    lot = AuctionLot.objects.create(
        id=rid("l"), auction=a,
        number=(a.lots.count() + 1),
        title=title, description=str(body.get("description", "")).strip(),
        qty=qty, uom=vocab.unit(body.get("uom"), blank="")[:24],
        ceiling=ceiling, reserve=reserve,
        min_decrement=step,
        decrement_is_pct=pct,
    )
    return JsonResponse(_lot_view(lot, for_buyer=True, monitor=True))


@route(["POST", "DELETE"], perm="auction.edit")
def lot_delete(request, p, body, aid, lid):
    a = _find(aid)
    if not a or a.status != "draft":
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


# ---------------- photos ----------------
#
# Optional pictures of what is being bought, for bidders to swipe through.
# They are part of what bidders price against, so like the lots they can only
# change while the auction is a draft or scheduled.

MAX_IMAGES = 10
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}


def _image_type(data):
    """The real type, read from the bytes. The browser's claimed content type is
    never trusted: these are served inline, and a page that said it was a PNG
    but was HTML would run in the app's origin."""
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


@route(["POST"], perm="auction.edit")
def image_upload(request, p, body, aid):
    a = _find(aid)
    if not a:
        return err("Auction not found.", 404)
    if a.status != "draft":
        return err("Photos cannot change once the auction has gone to approval or to vendors.", 409)
    if _photos(a).count() >= MAX_IMAGES:
        return err(f"An auction can carry at most {MAX_IMAGES} photos.")
    up, msg = _read_upload(request, IMAGE_EXTENSIONS)
    if msg:
        return err(msg if "not accepted" not in msg else "Photos have to be PNG, JPEG or WebP.")
    kind = _image_type(up["data"])
    if not kind:
        return err("That file is not a PNG, JPEG or WebP image.")
    up["content_type"] = kind
    d = Document.objects.create(id=rid("d"), kind="auction", auction=a, tender=None,
                                supplier_id=None, envelope="",
                                uploaded_by=p["name"], uploaded_at=now_ms(), **up)
    return JsonResponse({"image": {"id": d.id, "name": d.name, "size": d.size}})


@route(["POST", "DELETE"], perm="auction.edit")
def image_delete(request, p, body, aid, did):
    a = _find(aid)
    if not a:
        return err("Auction not found.", 404)
    if a.status != "draft":
        return err("Photos cannot change once the auction has gone to approval or to vendors.", 409)
    d = _photos(a).filter(pk=did).first()
    if not d:
        return err("Photo not found.", 404)
    d.delete()
    return JsonResponse({"ok": True})


@route(["GET"])
def image_view(request, p, body, aid, did):
    """Same door as the room: a buyer who can see auctions, or a vendor on
    this auction's list who has not been removed from it."""
    a = Auction.objects.filter(pk=aid).first()
    if not a:
        return err("Auction not found.", 404)
    bad = _vendor_door(a, p)
    if bad:
        return bad
    d = _photos(a).filter(pk=did).first()
    if not d:
        return err("Photo not found.", 404)
    resp = HttpResponse(bytes(d.data), content_type=d.content_type)
    resp["X-Content-Type-Options"] = "nosniff"
    resp["Content-Disposition"] = "inline"
    resp["Cache-Control"] = "private, max-age=3600"
    return resp


def _vendor_door(a, p):
    """None if this caller may read the auction's photos and documents, else
    the refusal. A buyer who can see auctions; a vendor on its list, not
    removed, once it has gone out, and past its NDA and payment terms."""
    if p["role"] == "supplier":
        part = _mine(a, p)
        if not part or part.disqualified or a.status in ("draft", "approval"):
            return err("You are not a participant in this auction.", 403)
        gate = _gate_error(a, p["supplierId"])
        if gate:
            return err(gate, 403)
        return None
    if not has(p, "page.auctions"):
        return err("You don't have permission to do that.", 403)
    return None


# ---------------- the document pack ----------------
#
# Specifications, drawings, a site map: what bidders read before they price.
# Unlike the photos and the lots, a document can be added after the auction has
# gone out - an answer to a question often is one - and every vendor is told.

@route(["POST"], perm="auction.edit")
def doc_upload(request, p, body, aid):
    a = _find(aid)
    if not a:
        return err("Auction not found.", 404)
    if a.status in ("closed", "awarded", "cancelled"):
        return err("This auction is over; its documents are final.", 409)
    up, msg = _read_upload(request)
    if msg:
        return err(msg)
    d = Document.objects.create(id=rid("d"), kind="auctiondoc", auction=a, tender=None,
                                supplier_id=None, envelope="",
                                uploaded_by=p["name"], uploaded_at=now_ms(), **up)
    log(p, "Auction document added", f"{d.name} added to {a.ref}.")
    if a.status not in ("draft", "approval"):
        _tell(_told(a), f"New document: {a.title}",
              f"{org_name()} added \"{d.name}\" to {a.ref}. Read it in the auction room.", a)
    return JsonResponse({"doc": {"id": d.id, "name": d.name, "size": d.size,
                                 "uploadedAt": d.uploaded_at}})


@route(["POST", "DELETE"], perm="auction.edit")
def doc_delete(request, p, body, aid, did):
    a = _find(aid)
    if not a:
        return err("Auction not found.", 404)
    if a.status in ("closed", "awarded", "cancelled"):
        return err("This auction is over; its documents are final.", 409)
    d = a.images.filter(kind="auctiondoc", pk=did).first()
    if not d:
        return err("Document not found.", 404)
    name = d.name
    d.delete()
    log(p, "Auction document removed", f"{name} withdrawn from {a.ref}.")
    if a.status not in ("draft", "approval"):
        _tell(_told(a), f"Document withdrawn: {a.title}",
              f"{org_name()} removed \"{name}\" from {a.ref}.", a)
    return JsonResponse({"ok": True})


@route(["GET"])
def doc_download(request, p, body, aid, did):
    a = Auction.objects.filter(pk=aid).first()
    if not a:
        return err("Auction not found.", 404)
    bad = _vendor_door(a, p)
    if bad:
        return bad
    d = a.images.filter(kind="auctiondoc", pk=did).first()
    if not d:
        return err("Document not found.", 404)
    resp = HttpResponse(bytes(d.data), content_type=d.content_type)
    resp["X-Content-Type-Options"] = "nosniff"
    resp["Content-Disposition"] = f'attachment; filename="{d.name}"'
    return resp


# ---------------- who may bid ----------------

def _when(ms):
    """A closing time as a vendor reads it in an email: date, hour, zone.
    Lagos time, which is fixed at UTC+1 with no daylight saving."""
    import datetime
    return (datetime.datetime.utcfromtimestamp(ms / 1000 + 3600)
            .strftime("%d %b %Y at %H:%M") + " (Lagos time)")


def _bidders(a):
    """Everybody still in the auction: on the list and not removed."""
    return list(a.participants.filter(disqualified=False).values_list("supplier_id", flat=True))


def _tell(sids, subject, body, a):
    """Best effort, one vendor at a time: a bad address is that vendor's problem
    and must not stop the act that triggered the message."""
    for sid in sids:
        try:
            notify_supplier(sid, subject, body, destination={"page": "auction", "id": a.id})
        except Exception:                           # noqa: BLE001
            pass


def _may_tell(a):
    """May vendors be written to about this auction yet? Not while it waits
    for its line manager, and not from a draft where one is required: they
    hear about it once it is approved and scheduled."""
    if a.status == "approval":
        return False
    if a.status == "draft":
        from . import approvals
        return not approvals.line_manager_required()
    return True


def _told(a):
    """Vendors already told about this auction and still in it."""
    return list(a.participants.filter(invite_count__gt=0, disqualified=False)
                .values_list("supplier_id", flat=True))


def _schedule_words(a):
    """When the room opens and closes, and what can be done before then."""
    if a.is_live():
        return "The room is open now. " + (f"Bidding closes on {_when(a.ends_at)}. " if a.ends_at else "")
    if a.status == "scheduled" and a.starts_at:
        return (f"Bidding opens on {_when(a.starts_at)} and closes on {_when(a.ends_at)}. "
                "Until it opens you can sign in to read the lots and the terms and ask questions"
                + (", and put in an opening price (a pre-bid) that stands as your first bid"
                   if a.allow_prebid else "") + ". ")
    return ("You will be told when the room opens. "
            + (f"Bidding closes on {_when(a.ends_at)}. " if a.ends_at else ""))


def _send_invites(a, p, only=None):
    """Email the vendors who have not been told yet, and count it on the row.

    SENDING IS ITS OWN ACT. Adding a vendor to an auction used to be
    indistinguishable from inviting them, which meant a buyer could not build
    the room quietly - pick the vendors, set the lots, sleep on the ceiling -
    without every one of those vendors getting mail the moment they were
    picked. So the list and the invitation came apart: adding is silent, and
    this is the only thing in the product that writes to a vendor about an
    auction.

    `invite_count` is the idempotence. A vendor already emailed is skipped, so
    calling this twice does not mail anybody twice, and re-running it after
    adding three more people tells only the three.
    """
    rows = a.participants.filter(invite_count=0, disqualified=False)
    if only:
        rows = rows.filter(supplier_id__in=only)
    lot = a.lots.order_by("number").first()
    sent = 0
    for part in list(rows):
        if Supplier.objects.filter(pk=part.supplier_id, suspended=True).exists():
            part.invite_error = "Blacklisted vendor cannot be invited."
            part.save(update_fields=["invite_error"])
            continue
        try:
            reached = notify_supplier(
                part.supplier_id, f"Invitation to a {'selling' if a.direction == 'sale' else 'reverse'} auction: {a.title}",
                f"{org_name()} invites you to bid in {a.ref} - {a.title}. "
                + ("Prices move live and you will see your own rank, never a "
                   "competitor's price. " if a.visibility == "rank" else "")
                + (f"The opening price is {lot.ceiling:,} {a.currency}. "
                   if lot and lot.ceiling and a.ceiling_visible else "")
                + _schedule_words(a) + _agreement_words(a).strip(),
                destination={"page": "auction", "id": a.id})
            if reached:
                part.invite_count += 1
                part.invited_at = part.invited_at or now_ms()
                part.invite_error = ""
                sent += 1
            else:
                # Left at invite_count 0 on purpose: they are still untold, and
                # the next send will try them again once somebody has put an
                # address against the company.
                part.invite_error = "No account and no contact address on the register."
        except Exception as e:                      # a bad address is one vendor's problem
            part.invite_error = str(e)[:200]
        part.save(update_fields=["invite_count", "invited_at", "invite_error"])
    return sent


@route(["POST"], perm="auction.invite")
def send_invites(request, p, body, aid):
    """Tell the vendors. Explicit, repeatable, and never a side effect."""
    a = _find(aid)
    if not a:
        return err("Auction not found.", 404)
    if not _may_tell(a):
        return err("Invitations go out when the auction is approved and scheduled. "
                   "Send it for approval first.", 409)
    sent = _send_invites(a, p, body.get("supplierIds"))
    if not sent:
        # Untold vendors left over after a send are ones nobody could reach,
        # which is not the same as everybody having been told.
        untold = a.participants.filter(invite_count=0, disqualified=False).count()
        if untold:
            return err(f"Nobody could be emailed: {untold} vendor{'s' if untold != 1 else ''} "
                       f"on this auction {'have' if untold != 1 else 'has'} no email address "
                       f"on the register. Add one to the vendor's record and send again.", 409)
        return err("Everybody on this auction has already been invited.", 409)
    log(p, "Auction invitations sent", f"{sent} vendor(s) emailed for {a.ref}.")
    return JsonResponse({"ok": True, "sent": sent,
                         "untold": a.participants.filter(invite_count=0,
                                                         disqualified=False).count()})


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
             "invitedAt": x.invited_at, "inviteCount": x.invite_count,
             "inviteError": x.invite_error or "", "acceptedAt": x.accepted_at,
             "joinedAt": x.joined_at, "withdrawnAt": x.withdrawn_at,
             "disqualified": x.disqualified, "reason": x.disqualified_reason or ""}
            for x in a.participants.all()]})

    ids = body.get("supplierIds") or []
    if not isinstance(ids, list) or not ids:
        return err("Pick at least one vendor.")
    known = set(Supplier.objects.filter(pk__in=ids).values_list("id", flat=True))
    blocked = list(Supplier.objects.filter(pk__in=ids, suspended=True).values_list("name", flat=True))
    if blocked:
        return err("Blacklisted vendors cannot be invited: " + ", ".join(blocked), 409)
    added = 0
    for sid in ids:
        if sid not in known:
            continue
        _, made = AuctionParticipant.objects.get_or_create(
            auction=a, supplier_id=sid,
            defaults={"id": rid("ap"), "invited_at": now_ms(), "invite_count": 0})
        added += 1 if made else 0

    if body.get("notify") and not _may_tell(a):
        body = {**body, "notify": False}
    # invite_count is how many times this vendor has actually been EMAILED, and
    # it was being set to 1 by a code path that has never sent anything. Adding
    # somebody to the list is not telling them, and the column that exists to
    # answer "were they asked?" must not answer yes on their behalf.
    sent = _send_invites(a, p, ids) if body.get("notify") else 0

    log(p, "Auction vendors invited",
        f"{added} vendor(s) added to {a.ref}."
        + (f" {sent} emailed." if sent else " No invitations sent yet."))
    return JsonResponse({"ok": True, "added": added, "sent": sent,
                         "total": a.participants.count(),
                         "untold": a.participants.filter(invite_count=0,
                                                         disqualified=False).count()})


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


# ---------------- inviting from a list ----------------
#
# The people a buyer wants in the room are very often a spreadsheet: names and
# addresses from last year's auction, a category manager's contacts, a list a
# colleague forwarded. Picking them one by one out of a 1,400-row register is
# how an auction ends up with three bidders instead of twelve.
#
# The same two steps as the bulk invitations in invite_views.py, for the same
# reason - an invitation cannot be unsent, so the preview is the confirmation.
# `parse` reads the file and says, row by row, what adding it would do and
# writes nothing. `invite_list` takes back the rows that were confirmed.

LIST_CAP = 500
_OVER = ("closed", "awarded", "cancelled")


def _vendor_index():
    """Every way a row in somebody's spreadsheet can name a vendor we hold,
    and which of those vendors already have a login."""
    by_email, by_name, logins = {}, {}, {}
    for s in Supplier.objects.only("id", "name", "contact_email"):
        if s.contact_email:
            by_email.setdefault(s.contact_email.strip().lower(), s)
        by_name.setdefault(s.name.strip().lower(), s)
    # A vendor's login is an address too, and often the one people have.
    for pr in Profile.objects.filter(supplier__isnull=False).select_related("user", "supplier"):
        logins.setdefault(pr.supplier_id, pr.user.email or pr.user.username)
        for e in (pr.user.email, pr.user.username):
            if e and "@" in e:
                by_email.setdefault(e.strip().lower(), pr.supplier)
    return by_email, by_name, logins


def _label(r):
    """The name a new vendor record gets: the company, else the person."""
    return (r.get("company") or r.get("name") or r["email"]).strip()[:120]


def _bidder_key(r):
    """Group company contacts, but identify individuals by their email."""
    company = (r.get("company") or "").strip().lower()
    return ("company", company) if company else ("individual", r["email"].lower())


def _list_rows(a, candidates):
    """Classify rows: bad ones out with a reason, good ones matched to the register.

    An address the register already knows is that vendor, not a new one - the
    whole point of a register is that the same company does not get a second
    record because it arrived in a different file. A company name is the
    fallback, matched exactly and never fuzzily: folding "Adeola Ltd" into
    "Adeola Limited" is a decision for a person.

    Each row says where its invitation will actually go, because that is not
    always the address in the file. A vendor is one record with one way in: a
    vendor with a login is told through it, one without is written to at the
    register's own address, and two people from the same new company become
    one vendor whose invitation goes to the first of them. Saying so before
    sending is the difference between a preview and a guess.
    """
    ready, rejected = bulk_invite.classify(candidates, known_emails=set())
    by_email, by_name, logins = _vendor_index()
    already = set(a.participants.values_list("supplier_id", flat=True))
    first_new = {}
    rows = []
    for r in ready:
        s, how = by_email.get(r["email"]), "email"
        company = (r.get("company") or "").strip()
        if not s and company:
            s, how = by_name.get(company.lower()), "name"
        if s and s.suspended:
            rejected.append({**r, "reason": "Blacklisted vendor cannot be invited."})
            continue
        note = ""
        if s:
            sends_to = logins.get(s.id) or s.contact_email or r["email"]
            if s.id in already:
                note = "Already on this auction."
            elif s.id in logins:
                note = "Has a DOCKET login; told there and by email."
            elif sends_to != r["email"]:
                note = f"The register holds {sends_to} for this vendor; the invitation goes there."
        else:
            key = _bidder_key(r)
            sends_to = first_new.setdefault(key, r["email"])
            if sends_to != r["email"]:
                note = f"Same company as {sends_to}: one vendor, one invitation, sent there."
        rows.append({
            "email": r["email"], "name": (r.get("name") or "").strip()[:140],
            "company": company[:120], "sourceRow": r.get("sourceRow"),
            "supplierId": s.id if s else None, "supplier": s.name if s else None,
            "matchedBy": how if s else None, "inAuction": bool(s and s.id in already),
            "sendsTo": sends_to, "note": note,
        })
    return rows, rejected


@route(["POST"], perm="auction.invite")
def invite_list_parse(request, p, body, aid):
    """Read an uploaded list and report what adding it would do. Writes nothing."""
    a = _find(aid)
    if not a:
        return err("Auction not found.", 404)
    if a.status in _OVER:
        return err("This auction is over, so there is nobody left to invite.", 409)
    f = request.FILES.get("file")
    if not f:
        return err("Attach a .xlsx or .csv file.")
    table, bad = bulk_invite.read_table(f.name, f.read())
    if bad:
        return err(bad)
    if not table:
        return err("That file is empty.")
    candidates, notes = bulk_invite.extract(table, audience="vendors")
    if not candidates:
        return err("No email addresses found in that file. It needs a column of "
                   "addresses, with names beside them if you have them.")
    rows, rejected = _list_rows(a, candidates)
    return JsonResponse({
        "howRead": notes.get("mode"), "columns": notes.get("columns", []),
        "rows": rows, "rejected": rejected, "cap": LIST_CAP,
        "counts": {"found": notes.get("found", 0), "ready": len(rows),
                   "rejected": len(rejected),
                   "new": sum(1 for r in rows if not r["supplierId"]),
                   "known": sum(1 for r in rows if r["supplierId"] and not r["inAuction"]),
                   "inAuction": sum(1 for r in rows if r["inAuction"])},
    })


@route(["POST"], perm="auction.invite")
def invite_list(request, p, body, aid):
    """Put the confirmed rows on the auction, and email them if asked to.

    The rows come back from the preview and are checked again here: the
    preview is a courtesy to the person, not an authorisation.

    Somebody the register does not know becomes a vendor record first -
    unverified and unregistered, source "buyer", exactly what a buyer typing
    them in from the Vendors page produces - because an auction invites
    vendors, and a name and an address are enough to hold a place for one.
    Their invitation then carries the claim link that turns that record into a
    login (notify._mail_unclaimed), so the email and the way to act on it
    arrive together.
    """
    a = _find(aid)
    if not a:
        return err("Auction not found.", 404)
    if a.status in _OVER:
        return err("This auction is over, so there is nobody left to invite.", 409)
    raw_rows = body.get("rows") or []
    if not isinstance(raw_rows, list) or not raw_rows:
        return err("Nothing to add.")
    if len(raw_rows) > LIST_CAP:
        return err(f"That is {len(raw_rows)} people. Add them {LIST_CAP} at a time - one "
                   f"request emailing more than that will time out before it finishes, "
                   f"and you will not know which ones went.")
    clean = [{"email": str(r.get("email") or ""), "name": str(r.get("name") or ""),
              "company": str(r.get("company") or ""), "sourceRow": r.get("sourceRow")}
             for r in raw_rows if isinstance(r, dict)]
    rows, rejected = _list_rows(a, clean)

    made, ids, created = {}, [], 0
    for r in rows:
        sid = r["supplierId"]
        if not sid:
            # Two people from the same new company share one record rather
            # than making two vendors out of one firm.
            label = _label(r)
            key = _bidder_key(r)
            sid = made.get(key)
            if not sid:
                s = Supplier.objects.create(
                    id=rid("s"), name=label, contact_email=r["email"],
                    contact_person=r["name"], category=canonical(""), location="-",
                    prequalified=False, docs=[], perf={}, registry={},
                    source="buyer", registered_at=None)
                sid = made[key] = s.id
                created += 1
        else:
            # A register record with no address can be reached through this one.
            Supplier.objects.filter(pk=sid, contact_email="").update(contact_email=r["email"])
        AuctionParticipant.objects.get_or_create(
            auction=a, supplier_id=sid,
            defaults={"id": rid("ap"), "invited_at": now_ms(), "invite_count": 0})
        ids.append(sid)
    ids = list(dict.fromkeys(ids))

    # Never with an empty list: _send_invites reads "no filter" as everybody.
    sent = _send_invites(a, p, ids) if (body.get("send") and ids and _may_tell(a)) else 0

    log(p, "Auction vendors invited from a list",
        f"{len(ids)} vendor(s) from an uploaded list put on {a.ref}, {created} of them new "
        f"to the register." + (f" {sent} emailed." if sent else " Nobody emailed yet."))

    # The demo has no mailbox, so it shows the link the email carries. That is
    # the one way a visitor can see the other side of this: open it, set a
    # password, and arrive in the room as the vendor who was just invited.
    links = []
    if settings.DEMO_LOGIN and sent:
        claimed = set(Profile.objects.filter(supplier_id__in=ids)
                      .values_list("supplier_id", flat=True))
        names = dict(Supplier.objects.filter(pk__in=ids).values_list("id", "name"))
        for sid in ids:
            if sid in claimed:
                continue
            tok = (ActionToken.objects.filter(kind="vendor_claim", used_at__isnull=True,
                                              payload__supplierId=sid)
                   .order_by("-created").first())
            if tok:
                links.append({"supplierId": sid, "name": names.get(sid, ""),
                              "email": tok.email, "url": f"/?register={tok.token}"})

    return JsonResponse({
        "ok": True, "added": len(ids), "created": created, "sent": sent,
        "notAdded": rejected, "demoLinks": links,
        "total": a.participants.count(),
        "untold": a.participants.filter(invite_count=0, disqualified=False).count(),
    })


# ---------------- the lifecycle ----------------

EARLIER_NOTICE_MS = 24 * 3600 * 1000


def _ready_problem(a, now=None):
    """What stops this auction going out, or None. The same checks the
    draft's checklist shows."""
    now = now if now is not None else now_ms()
    if not a.lots.exists():
        return "Add at least one lot."
    if not a.participants.filter(disqualified=False).exists():
        return "Invite at least one vendor."
    if not a.ends_at:
        return "Set a closing time."
    if a.ends_at <= now:
        return "The closing time has already passed. Set a later one."
    if a.starts_at and a.starts_at >= a.ends_at:
        return "The auction has to close after it opens."
    if a.nda_required and len((a.nda_text or "").strip()) < 40:
        return "Write the non-disclosure agreement vendors will sign, or switch it off."
    return None


def release(a, p, approved_by=None):
    """Send an approved (or approval-free) auction out. With a start time still
    ahead it is scheduled and every vendor is told when it opens; otherwise the
    room opens now. Returns an error sentence, or None."""
    a = _find(a.id)
    if a.status not in ("draft", "approval"):
        return "the auction has already gone out."
    problem = _ready_problem(a)
    if problem:
        return problem
    now = now_ms()
    by = f" Approved by {approved_by}." if approved_by else ""
    if a.starts_at and a.starts_at > now:
        a.status = "scheduled"
        a.scheduled_at = now
        a.scheduled_ends_at = a.ends_at
        a.save(update_fields=["status", "scheduled_at", "scheduled_ends_at"])
        record_event(actor=p["name"], role=p["role"], action="Auction scheduled",
                     detail=f"{a.ref}: opens {_when(a.starts_at)}, closes {_when(a.ends_at)}."
                            + (" Pre-bids allowed until it opens." if a.allow_prebid else "") + by)
        sent = _send_invites(a, p)
        if sent:
            log(p, "Auction invitations sent", f"{sent} vendor(s) emailed the schedule for {a.ref}.")
        return None
    told = _told(a)
    a.starts_at = now
    a.save(update_fields=["starts_at"])
    bad = engine.open_auction(a, p["name"])
    if bad:
        return bad
    _tell(told, f"The auction room is open: {a.title}",
          f"{org_name()} has opened {a.ref} - {a.title}. You can bid now. "
          f"Bidding closes on {_when(a.ends_at)}.", a)
    sent = _send_invites(a, p)
    if sent:
        log(p, "Auction invitations sent", f"{sent} vendor(s) emailed when {a.ref} opened.")
    return None


@route(["POST"], perm="auction.open")
def auction_submit(request, p, body, aid):
    """Send a draft out: to the line manager first where that is required, and
    otherwise straight to the vendors, scheduled or open now."""
    a = _find(aid)
    if not a:
        return err("Auction not found.", 404)
    return _submit(a, p)


def _submit(a, p):
    from . import approvals, signoffs
    aid = a.id
    if a.status == "approval":
        return err("This auction is already waiting for approval.", 409)
    if a.status != "draft":
        return err("This auction has already gone out.", 409)
    problem = _ready_problem(a)
    if problem:
        return err(problem, 409)
    if approvals.line_manager_required():
        so, msg = signoffs.request(
            "auction_release", p, auction=a,
            change={"startsAt": [None, a.starts_at or 0], "endsAt": [None, a.ends_at]}
            if a.starts_at else {"endsAt": [None, a.ends_at]})
        if msg:
            return err(msg, 409)
        a.status = "approval"
        a.save(update_fields=["status"])
        out = _auction_view(a, p, monitor=True)
        out["pending"] = True
        out["approver"] = signoffs.approver_words(so)
        return JsonResponse(out)
    problem = release(a, p)
    if problem:
        return err(problem, 409)
    a = _find(aid)
    return JsonResponse(_auction_view(a, p, monitor=True))


@route(["POST"])
def auction_recall(request, p, body, aid):
    """Take an auction back from approval to draft, to change it."""
    from . import signoffs
    a = _find(aid)
    if not a or a.status != "approval":
        return err("Only an auction waiting for approval can be recalled.", 409)
    so = signoffs.pending("auction_release", auction=a)
    if not (has(p, "auction.edit") or (so and so.requested_by_id == p.get("id"))):
        return err("You don't have permission to do that.", 403)
    if so:
        so.status = "withdrawn"
        so.decided_at, so.decided_by = now_ms(), p["name"]
        so.save(update_fields=["status", "decided_at", "decided_by"])
    a.status = "draft"
    a.save(update_fields=["status"])
    log(p, "Auction recalled to draft", f"{a.ref} taken back from approval to be changed.")
    return JsonResponse(_auction_view(a, p, monitor=True))


def times_problem(a, starts_at, ends_at, now=None):
    """Why the auction cannot move to these times, or None."""
    now = now if now is not None else now_ms()
    if a.status == "scheduled":
        if not starts_at or starts_at <= now:
            return "The opening time must be in the future."
        if not ends_at or ends_at <= starts_at:
            return "The auction has to close after it opens."
        if starts_at < (a.starts_at or 0) and starts_at < now + EARLIER_NOTICE_MS:
            return ("Moving the opening earlier needs at least 24 hours' notice to vendors. "
                    f"Pick {_when(now + EARLIER_NOTICE_MS)} or later.")
        if starts_at == a.starts_at and ends_at == a.ends_at:
            return "Those are the times already."
        return None
    if a.status in ("live", "paused"):
        if starts_at and starts_at != a.starts_at:
            return "The room is already open; only its closing time can move."
        if not ends_at or ends_at <= max(now, a.ends_at or 0):
            return "A live auction's closing time can only move later."
        return None
    return "Only a scheduled or live auction's times can be changed."


def apply_times(a, p, starts_at=None, ends_at=None, reason="", requested_by=None):
    """Move the times and tell every vendor. Returns an error, or None."""
    a = _find(a.id)
    starts_at = starts_at or a.starts_at
    ends_at = ends_at or a.ends_at
    problem = times_problem(a, starts_at, ends_at)
    if problem:
        return problem
    old_start, old_end = a.starts_at, a.ends_at
    a.starts_at, a.ends_at = starts_at, ends_at
    fields = ["starts_at", "ends_at"]
    if a.status == "scheduled":
        a.scheduled_ends_at = ends_at
        fields.append("scheduled_ends_at")
    a.save(update_fields=fields)
    by = requested_by or p["name"]
    approved = f" Approved by {p['name']}." if requested_by and requested_by != p["name"] else ""
    moved = []
    if old_start != starts_at:
        moved.append(f"opens {_when(old_start)} → {_when(starts_at)}")
    if old_end != ends_at:
        moved.append(f"closes {_when(old_end)} → {_when(ends_at)}")
    record_event(actor=p["name"], role=p["role"], action="Auction times changed",
                 detail=f"{a.ref}: {'; '.join(moved)}. {reason} Requested by {by}.{approved}")
    _tell(_told(a), f"New times: {a.title}",
          f"{org_name()} has changed the times of {a.ref} - {a.title}. "
          + (f"Bidding now opens on {_when(starts_at)} and closes on {_when(ends_at)}."
             if a.status == "scheduled" else f"Bidding now closes on {_when(ends_at)}.")
          + (f" Reason given: {reason}" if reason else ""), a)
    return None


@route(["POST"], perm="auction.lifecycle")
def auction_times(request, p, body, aid):
    """Move a scheduled auction's opening or closing, or a live one's close.
    Waits for the line manager where date change approval is on."""
    from . import signoffs
    a = _find(aid)
    if not a:
        return err("Auction not found.", 404)
    try:
        starts_at = int(body["startsAt"]) if body.get("startsAt") else a.starts_at
        ends_at = int(body["endsAt"]) if body.get("endsAt") else a.ends_at
    except (TypeError, ValueError):
        return err("Enter valid times.")
    problem = times_problem(a, starts_at, ends_at)
    if problem:
        return err(problem, 409 if "Only a" in problem else 400)
    reason = str(body.get("reason") or "").strip()[:300]
    if not reason:
        return err("Give a reason - it is recorded and sent to every vendor.")
    if signoffs.timeline_approval_required():
        if signoffs.pending("auction_times", auction=a):
            return err("A change to these times is already waiting for approval.", 409)
        change = {}
        if starts_at != a.starts_at:
            change["startsAt"] = [a.starts_at, starts_at]
        if ends_at != a.ends_at:
            change["endsAt"] = [a.ends_at, ends_at]
        so, msg = signoffs.request("auction_times", p, auction=a, change=change, reason=reason)
        if msg:
            return err(msg, 409)
        out = _auction_view(a, p, monitor=True)
        out["pending"] = True
        out["approver"] = signoffs.approver_words(so)
        return JsonResponse(out)
    problem = apply_times(a, p, starts_at, ends_at, reason)
    if problem:
        return err(problem, 409)
    return JsonResponse(_auction_view(_find(aid), p, monitor=True))


@route(["POST"], perm="auction.open")
def auction_open(request, p, body, aid):
    """The old "open the room" button. A draft goes the way every draft goes
    now (auction_submit); a scheduled auction opens on schedule, not early."""
    a = _find(aid)
    if not a:
        return err("Auction not found.", 404)
    if a.status in ("draft", "approval"):
        return _submit(a, p)
    if a.status == "scheduled":
        return err(f"This auction opens on schedule, {_when(a.starts_at)}. Change its times "
                   f"to open it at another time.", 409)
    told = _told(a)
    bad = engine.open_auction(a, p["name"])
    if bad:
        return err(bad, 409)
    # Those invited earlier were promised "you will be told when the room
    # opens", so they are told, with the close.
    _tell(told, f"The auction room is open: {a.title}",
          f"{org_name()} has opened {a.ref} - {a.title}. You can bid now. "
          f"Bidding closes on {_when(a.ends_at)}.", a)
    # Anyone still untold is told now. Up to here silence was the point - the
    # buyer was still shaping the thing - but an open room nobody was invited
    # to is just a clock running in an empty building.
    sent = _send_invites(a, p)
    if sent:
        log(p, "Auction invitations sent", f"{sent} vendor(s) emailed when {a.ref} opened.")
    out = _auction_view(a, p, monitor=True)
    out["sent"] = sent
    return JsonResponse(out)


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
    _tell(_bidders(a), f"Auction paused: {a.title}",
          f"{a.ref} - {a.title} is paused. The clock is stopped and no prices are being "
          f"taken. Reason: {reason.rstrip('.')}. The time lost is given back when the room reopens.", a)
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
    from . import signoffs
    a = _find(aid)
    if not a or a.status in ("awarded", "cancelled"):
        return err("This auction cannot be cancelled.", 409)
    reason = str(body.get("reason", "")).strip()[:300]
    if not reason:
        return err("Cancelling an auction needs a reason on the record.")
    told = _told(a) if a.status not in ("draft", "approval") else []
    a.status = "cancelled"
    a.cancelled_at = now_ms()
    a.cancel_reason = reason
    a.save(update_fields=["status", "cancelled_at", "cancel_reason"])
    signoffs.void_for("The auction was cancelled.", auction=a)
    record_event(actor=p["name"], role=p["role"], action="Auction cancelled",
                 detail=f"{a.ref}: {reason}")
    _tell(told, f"Auction cancelled: {a.title}",
          f"{org_name()} has cancelled {a.ref} - {a.title}. Reason given: {reason}", a)
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
    if Supplier.objects.filter(pk__in=[l.awarded_to for l in won], suspended=True).exists():
        return err("A selected winner is blacklisted. Review the lot before awarding; no award has been issued.", 409)
    if not won:
        return err("No lot has a winner - every lot was either unbid or failed its reserve.", 409)
    pending = engine.unregistered_winners(a)
    if pending:
        return err(f"{len(pending)} lot(s) were won by a company not on the vendor register. Audit must "
                   f"approve or turn down the winner before the auction is awarded.", 409)
    a.status = "awarded"
    a.awarded_at = now_ms()
    a.awarded_by = p["name"]
    a.award_memo = str(body.get("memo", "")).strip()
    a.save(update_fields=["status", "awarded_at", "awarded_by", "award_memo"])
    s = engine.savings(a)
    record_event(actor=p["name"], role=p["role"], action="Auction awarded",
                 detail=f"{a.ref}: {len(won)} lot(s), {s['final']:,} against an opening "
                        f"{s['ceiling']:,} - {s['saved']:,} below the opening price.")

    # Tell the room how it ended: each winner what they won and at what price,
    # and everybody else who bid that they were not successful.
    wins = {}
    for l in won:
        wins.setdefault(l.awarded_to, []).append(
            f"Lot {l.number}, {l.title}: {l.awarded_amount:,} {a.currency}")
    for sid, lines in wins.items():
        _tell([sid], f"You won: {a.title}",
              f"{org_name()} has awarded {a.ref} - {a.title}. You won:\n"
              + "\n".join(lines) + "\n\nThe buyer will be in touch about the order.", a)
    bid = set(a.bids.filter(retracted_at__isnull=True).values_list("supplier_id", flat=True))
    _tell([sid for sid in _bidders(a) if sid in bid and sid not in wins],
          f"Auction result: {a.title}",
          f"{org_name()} has awarded {a.ref} - {a.title}. Your bid was not successful "
          f"this time. Thank you for taking part.", a)
    return JsonResponse({"ok": True, "savings": s,
                         "auction": _auction_view(a, p, monitor=True)})


@route(["POST"], perm="bid.approve_new_vendor")
def winner_review(request, p, body, aid, lid):
    """Audit's decision on a lot won by a company not on the vendor register.

    Approving puts the company on the register (and lets any tender bid it has
    waiting count). Turning it down removes it from this auction, on the record
    and with a reason, and every lot it had won passes to the next best bidder,
    who may need the same check."""
    from .views import _tell_released, put_on_register
    a = _find(aid)
    lot = a and a.lots.filter(pk=lid).first()
    if not lot:
        return err("Lot not found.", 404)
    if a.status != "closed":
        return err("Winners are checked after the auction closes and before it is awarded.", 409)
    s = Supplier.objects.filter(pk=lot.awarded_to).first() if lot.awarded_to else None
    if not s or s.registered_at:
        return err("This lot's winner is not waiting for approval.", 409)
    if body.get("ok", True) is not False:
        if s.suspended:
            return err("This vendor is suspended. Lift the suspension before approving them.", 409)
        _tell_released(p, s, put_on_register(s, p["name"], "Approved by audit after winning an auction"))
        log(p, "Auction winner approved",
            f"{s.name} won lot {lot.number} of {a.ref} and was approved onto the vendor register.")
        return JsonResponse(_auction_view(a, p, monitor=True))

    reason = str(body.get("reason") or "").strip()[:300]
    if not reason:
        return err("Give a reason. It is recorded and sent to the vendor.")
    part = a.participants.filter(supplier_id=s.id).first()
    if part:
        part.disqualified = True
        part.disqualified_reason = f"Not approved by audit: {reason}"[:300]
        part.save(update_fields=["disqualified", "disqualified_reason"])
    moved = engine.resettle_without(a, s.id)
    names = {x.id: x.name for x in Supplier.objects.filter(
        pk__in=[o["supplierId"] for o in moved if o.get("supplierId")])}
    went = "; ".join(
        f"lot passes to {names.get(o['supplierId'], o['supplierId'])}" if o["result"] == "winner"
        else f"lot has no winner ({o['result']})" for o in moved)
    log(p, "Auction winner turned down", f"{s.name} on {a.ref}: {reason}. {went}.")
    _tell([s.id], f"Auction result: {a.title}",
          f"{org_name()} could not accept {s.name} as the winner on {a.ref}: {reason}", a)
    engine.ask_audit_about_new_winners(a)
    return JsonResponse(_auction_view(a, p, monitor=True))


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
    # Start time reached, or time up: settle it now, so whoever is looking sees
    # the room as it is rather than as the last sweep left it.
    if a.status == "scheduled" and (a.starts_at or 0) <= now_ms():
        engine.start_due()
        a = _find(aid)
    if engine.settle_if_due(a):
        a = _find(aid)
    supplier = p["role"] == "supplier"
    part = _mine(a, p)
    if supplier and not part:
        return err("You are not a participant in this auction.", 403)
    if supplier and a.status in ("draft", "approval"):
        return err("This auction has not gone out to vendors yet.", 404)
    if not supplier and not has(p, "page.auctions"):
        return err("You don't have permission to do that.", 403)

    monitor = (not supplier) and has(p, "auction.monitor")
    out = _auction_view(a, p, monitor=monitor)
    out["lotState"] = []
    out["questions"] = _questions_view(a, p)
    if supplier and out.get("gated"):
        # Past the NDA and the payment terms first: nothing about the lots.
        out["questions"] = []
        out["accepted"] = bool(part.accepted_at)
        out["disqualified"] = part.disqualified
        out["disqualifiedReason"] = part.disqualified_reason or ""
        return JsonResponse(out)
    sealed = a.status == "scheduled"   # the pre-bid stage: own prices only

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
            if sealed:
                # Before the room opens a vendor sees their own pre-bid and
                # nothing about anybody else's: no rank, no count, no best.
                st.update({"myRank": None, "leading": None, "best": None, "toLead": None,
                           "myLimit": None})
                st.pop("bidders", None)
                st.pop("movements", None)
                out["lotState"].append(st)
                continue
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


def _questions_view(a, p):
    """Questions and answers on this auction. A vendor sees every answered
    question and their own unanswered ones; never who asked."""
    rows = []
    names = None
    for c in a.questions.order_by("asked_at"):
        if p["role"] == "supplier":
            if not c.a and c.supplier_id != p["supplierId"]:
                continue
            rows.append({"id": c.id, "q": c.q, "askedAt": c.asked_at, "a": c.a,
                         "answeredAt": c.answered_at, "mine": c.supplier_id == p["supplierId"]})
        else:
            if names is None:
                names = dict(Supplier.objects.filter(
                    pk__in=a.questions.values_list("supplier_id", flat=True)).values_list("id", "name"))
            rows.append({"id": c.id, "q": c.q, "askedAt": c.asked_at, "a": c.a,
                         "answeredAt": c.answered_at, "supplierId": c.supplier_id,
                         "supplier": names.get(c.supplier_id, c.supplier_id)})
    return rows


@route(["POST"], roles={"supplier"})
def ask_question(request, p, body, aid):
    """A vendor's question, before the room opens or while it is open. The
    answer goes to every vendor still in the auction."""
    from .models import Clarification
    from .notify import _users_for_perm, notify_users
    a = _find(aid)
    part = a and _mine(a, p)
    if not part or part.disqualified or a.status not in ("scheduled", "live", "paused"):
        return err("Questions can be asked while the auction is scheduled or open.", 403)
    gate = _gate_error(a, p["supplierId"])
    if gate:
        return err(gate, 403)
    q = str(body.get("q") or "").strip()[:2000]
    if not q:
        return err("The question is empty.")
    Clarification.objects.create(id=rid("q"), tender=None, auction=a, supplier_id=p["supplierId"],
                                 q=q, asked_at=now_ms())
    log(p, "Auction question asked", f"{a.ref}: question submitted to the buyer.")
    notify_users(_users_for_perm("clarification.answer"), f"New question: {a.title}",
                 f"A vendor asked a question on {a.ref}. The answer is published to every vendor "
                 f"in the auction.", destination={"page": "auction", "id": a.id})
    return JsonResponse({"ok": True, "questions": _questions_view(a, p)})


@route(["POST"], roles={"supplier"})
def accept_terms(request, p, body, aid):
    a = _find(aid)
    part = a and _mine(a, p)
    if not part or a.status in ("draft", "approval"):
        return err("You are not a participant in this auction.", 403)
    kind = str(body.get("kind") or "rules")
    if kind in ("nda", "payment"):
        from . import agreements
        if body.get("agree") is not True:
            return err("Tick the box to confirm you have read it and agree.")
        from .views import _username
        acc, msg = agreements.accept(a, p["supplierId"], kind, body.get("name"), body.get("title"),
                                     _username(p), agreements.client_ip(request))
        if msg:
            return err(msg)
        what = "Non-disclosure agreement signed" if kind == "nda" else "Payment terms accepted"
        log(p, what, f"{a.ref}: {acc.signed_name}"
                     f"{f' ({acc.signed_title})' if acc.signed_title else ''}. "
                     f"Text digest {acc.digest[:16]}.")
        return JsonResponse({"ok": True, "agreements": agreements.summary(a, p["supplierId"])})
    gate = _gate_error(a, p["supplierId"])
    if gate:
        return err(gate, 403)
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
        amount = _bid_whole(body.get("amount"))
    except (TypeError, ValueError):
        return err("Enter a positive whole amount; fractions and negative prices are not accepted.")
    gate = _gate_error(a, p["supplierId"])
    if gate:
        return err(gate, 403)

    if a.status == "scheduled":
        bid, bad = engine.place_prebid(lot, p["supplierId"], amount)
        if bad:
            return err(bad, 409)
        return JsonResponse({"ok": True, "bidId": bid.id, "amount": bid.amount, "at": bid.at,
                             "prebid": True, "myRank": None, "leading": None, "extended": False,
                             "endsAt": a.ends_at, "serverNow": now_ms()})
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
