"""The auction engine: what a bid must satisfy, and what happens after it lands.

Kept out of the views for the same reason approvals.py is: the rules of a
competition are the product, and they should be readable in one place rather
than distributed through request handling. A view decides who is asking; this
decides what is true.

FOUR THINGS THIS FILE IS CAREFUL ABOUT, because each is a way a live auction
normally goes wrong:

  **The clock is the server's.** A bidder's browser will disagree with us -
  clock drift, a slow network, a tab that was asleep - and every one of those
  disagreements favours whoever has the better connection. Nothing here reads a
  time sent by a client. `serverNow` travels in every response so the room can
  render a countdown, but what decides whether a bid is in time is measured
  here, on arrival.

  **Sniping is a design flaw, not a tactic.** A bid placed with four seconds
  left cannot be answered by anybody, however much room they had left in their
  price, so the winner is whoever's connection was quickest rather than whoever
  was cheapest - and the buyer never learns what the second bidder would have
  done. Any bid inside the window pushes the close out. The auction ends when
  bidding stops, not when the clock happens to run out.

  **Two bids arriving together must not both win.** The whole of place_bid runs
  inside a transaction that takes a row lock on the auction, so the standing
  best a bid is validated against cannot move between the check and the write.
  Without it, two vendors bidding the same millisecond both read the old best,
  both pass validation, and the leaderboard ends up with a price that never
  actually beat anything.

  **A proxy must not be a worse deal than bidding by hand.** A standing
  instruction bids the least it needs to in order to lead - never the vendor's
  floor - so a vendor who sets a floor of 8m against a field that stops at 9m
  pays 9m less one decrement, not 8m. Anything else would punish honesty about
  your own limit, and vendors would stop using the feature within one event.
"""
from django.db import transaction

from .models import Auction, AuctionLot, AuctionParticipant, LotBid, ProxyBid
from .util import now_ms, record_event, rid

# A proxy cascade is a fixed point: each automatic bid may provoke another. It
# terminates because every round strictly lowers the standing price and every
# proxy has a floor, but a cap keeps a pathological configuration from spinning
# a request rather than answering it.
MAX_PROXY_ROUNDS = 40


# ---------------- reading the lot ----------------

def live_bids(lot):
    return lot.bids.filter(retracted_at__isnull=True).order_by("amount", "at")


def best_bid(lot):
    """The standing winner: lowest price, earliest of any tie.

    The tie-break is by arrival and it matters. Two vendors at the same number
    is not a coin toss - the one who got there first held that price while the
    other was still deciding, and any other rule would mean a late bidder could
    take the lead without improving anything.
    """
    return live_bids(lot).first()


def standings(lot):
    """Each vendor's own best price, ascending. One row per bidder, not per bid."""
    best = {}
    for b in live_bids(lot):
        cur = best.get(b.supplier_id)
        if cur is None or b.amount < cur.amount:
            best[b.supplier_id] = b
    rows = sorted(best.values(), key=lambda b: (b.amount, b.at))
    return [{"rank": i + 1, "supplierId": b.supplier_id, "amount": b.amount,
             "at": b.at, "kind": b.kind, "bidId": b.id}
            for i, b in enumerate(rows)]


def rank_of(lot, supplier_id):
    return next((r["rank"] for r in standings(lot) if r["supplierId"] == supplier_id), None)


def participant(auction, supplier_id):
    return auction.participants.filter(supplier_id=supplier_id).first()


# ---------------- what a bid must satisfy ----------------

def check_bid(lot, supplier_id, amount, now=None, kind="manual"):
    """`None` if the bid is allowed, otherwise the sentence to show the bidder.

    Returned as prose rather than a code because every one of these is read by
    a vendor mid-auction with a clock running, and "409" does not tell somebody
    with thirty seconds left what to type instead.
    """
    now = now if now is not None else now_ms()
    a = lot.auction

    if a.status == "paused":
        return "This auction is paused. The clock is stopped and no prices are being taken."
    if not a.is_live(now):
        if a.status in ("closed", "awarded"):
            return "This auction has closed."
        if a.status == "cancelled":
            return "This auction was cancelled."
        if (a.starts_at or 0) > now:
            return "This auction has not opened yet."
        return "This auction has closed."
    if lot.status != "open":
        return "This lot is closed."

    p = participant(a, supplier_id)
    if not p:
        return "You are not a participant in this auction."
    if p.disqualified:
        return f"You were disqualified from this auction: {p.disqualified_reason or 'no reason recorded'}."
    if p.withdrawn_at:
        return "You withdrew from this auction."
    # A proxy is placed on the participant's behalf by rules they already
    # accepted, so it does not re-ask; only a person typing a price does.
    if a.require_acceptance and not p.accepted_at and kind == "manual":
        return "Accept the auction rules before bidding."

    if not isinstance(amount, int) or amount <= 0:
        return "Enter a price."

    top = best_bid(lot)
    if top is None:
        if lot.ceiling and amount > lot.ceiling:
            return f"The opening price is {lot.ceiling:,}. Your first bid must be at or below it."
        return None

    if top.supplier_id == supplier_id:
        # Bidding against yourself costs the vendor money and gains the buyer
        # nothing real: the price it produces was available anyway. Refused
        # rather than accepted quietly, because a vendor who does this has
        # almost always misread the leaderboard.
        return "You already hold the best price on this lot."

    limit = lot.step_to_beat(top.amount)
    if amount > limit:
        if lot.min_decrement and lot.decrement_is_pct:
            return (f"The best price is {top.amount:,} and bids must improve on it by "
                    f"{lot.min_decrement}%. Bid {limit:,} or less.")
        if lot.min_decrement:
            return (f"The best price is {top.amount:,} and bids must improve on it by at least "
                    f"{lot.min_decrement:,}. Bid {limit:,} or less.")
        return f"The best price is {top.amount:,}. Bid below it."
    return None


# ---------------- anti-sniping ----------------

def _maybe_extend(a, now):
    """Push the close out if this bid landed inside the window. Returns the new
    close time, or None if nothing moved."""
    if a.snipe_window_ms <= 0 or a.extend_by_ms <= 0:
        return None
    if (a.ends_at or 0) - now > a.snipe_window_ms:
        return None
    if len(a.extensions or []) >= a.max_extensions:
        # The cap is reached, so the clock stands. Said plainly in the record
        # rather than silently stopping: an auction that stopped extending is a
        # fact the award file needs, because the last bidder was denied the
        # answer every earlier bidder got.
        return None
    return now + a.extend_by_ms


# ---------------- placing one ----------------

@transaction.atomic
def place_bid(lot, supplier_id, amount, kind="manual", now=None, _cascade=True):
    """Record a price. Returns `(bid, error)` - exactly one of them is None.

    The row lock is the point of the transaction: `check_bid` compares against
    the standing best, and without a lock that best can move between the check
    and the insert. Two vendors bidding in the same millisecond would then both
    validate against the old price and both be written, leaving a leaderboard
    whose winner never actually beat the bid above it.
    """
    now = now if now is not None else now_ms()

    # Lock the auction, then re-read the lot through it so both are consistent.
    a = Auction.objects.select_for_update().get(pk=lot.auction_id)
    lot = AuctionLot.objects.select_related("auction").get(pk=lot.pk)
    lot.auction = a

    bad = check_bid(lot, supplier_id, amount, now=now, kind=kind)
    if bad:
        return None, bad

    new_close = _maybe_extend(a, now)
    bid = LotBid.objects.create(
        id=rid("ab"), lot=lot, auction=a, supplier_id=supplier_id,
        amount=amount, at=now, kind=kind,
        closes_at_bid_time=a.ends_at or 0, extended=bool(new_close),
    )

    if new_close:
        a.extensions = list(a.extensions or []) + [
            {"at": now, "from": a.ends_at, "to": new_close,
             "bidId": bid.id, "supplierId": supplier_id}]
        a.ends_at = new_close
        a.save(update_fields=["ends_at", "extensions"])

    # Mark the bidder as having turned up, once.
    p = participant(a, supplier_id)
    if p and not p.joined_at:
        p.joined_at = now
        p.save(update_fields=["joined_at"])

    if _cascade:
        resolve_proxies(lot, now=now)
    return bid, None


# ---------------- standing instructions ----------------

def resolve_proxies(lot, now=None):
    """Let standing instructions answer the bid that just landed.

    Each round, whoever holds an active proxy that can still beat the standing
    price bids the *least* it takes to lead - never their floor. A vendor whose
    floor is 8m facing a field that stops at 9m pays 9m less one decrement, and
    keeps the difference. Any other rule would charge vendors for being honest
    about their limit, and they would stop setting floors after one event.

    Terminates because every round strictly lowers the standing price and every
    proxy has a floor; the cap is there for a configuration nobody anticipated,
    not for the normal case.
    """
    now = now if now is not None else now_ms()
    placed = []
    for _ in range(MAX_PROXY_ROUNDS):
        top = best_bid(lot)
        if top is None:
            break
        limit = lot.step_to_beat(top.amount)
        contenders = [
            px for px in lot.proxies.filter(cancelled_at__isnull=True)
            if px.supplier_id != top.supplier_id and px.floor <= limit
        ]
        if not contenders:
            break
        # The one who can go furthest takes the lead; ties by who set it first.
        contenders.sort(key=lambda px: (px.floor, px.created_at))
        px = contenders[0]
        bid, bad = place_bid(lot, px.supplier_id, limit, kind="proxy", now=now, _cascade=False)
        if bad:
            # A proxy that cannot legally bid is not an error to raise at
            # whoever happened to bid last; it simply stops acting.
            break
        placed.append(bid)
    return placed


def set_proxy(lot, supplier_id, floor, now=None):
    """Replace this vendor's standing instruction on this lot, then let it act."""
    now = now if now is not None else now_ms()
    a = lot.auction
    p = participant(a, supplier_id)
    if not p or not p.may_bid:
        return None, "You are not bidding in this auction."
    if a.require_acceptance and not p.accepted_at:
        return None, "Accept the auction rules before setting a limit."
    if not isinstance(floor, int) or floor <= 0:
        return None, "Enter the lowest price you are willing to accept."
    if lot.ceiling and floor > lot.ceiling:
        return None, f"The opening price is {lot.ceiling:,}. Your limit must be at or below it."

    lot.proxies.filter(supplier_id=supplier_id, cancelled_at__isnull=True).update(cancelled_at=now)
    px = ProxyBid.objects.create(id=rid("px"), lot=lot, supplier_id=supplier_id,
                                 floor=floor, created_at=now)
    # A limit set before anybody has bid should open the bidding at the ceiling
    # rather than sit idle waiting for a first price that may never come.
    if best_bid(lot) is None:
        place_bid(lot, supplier_id, lot.ceiling or floor, kind="proxy", now=now)
    else:
        resolve_proxies(lot, now=now)
    return px, None


# ---------------- the lifecycle ----------------

def open_auction(a, actor, now=None):
    now = now if now is not None else now_ms()
    if a.status not in ("draft", "scheduled"):
        return "Only a draft or scheduled auction can be opened."
    if not a.lots.exists():
        return "Add at least one lot before opening."
    if not a.participants.exists():
        return "Invite at least one vendor before opening."
    if not a.ends_at:
        return "Set a closing time before opening."
    a.status = "live"
    a.starts_at = a.starts_at or now
    a.scheduled_ends_at = a.scheduled_ends_at or a.ends_at
    a.save(update_fields=["status", "starts_at", "scheduled_ends_at"])
    record_event(actor=actor, role="procurement", action="Auction opened",
                 detail=f"{a.ref} - {a.lots.count()} lot(s), "
                        f"{a.participants.count()} vendor(s) invited.")
    return None


def close_auction(a, actor, now=None):
    """Close the clock and settle each lot against its reserve.

    A lot whose best price never reached the reserve does NOT get a winner. The
    buyer is not bound by a number nobody met, and quietly awarding it anyway
    would make the reserve decorative - which is worse than not having one,
    because somebody set it believing it meant something.
    """
    now = now if now is not None else now_ms()
    if a.status not in ("live", "paused"):
        return None, "Only a live auction can be closed."

    outcome = []
    for lot in a.lots.all():
        top = best_bid(lot)
        lot.status = "closed"
        if top is None:
            outcome.append({"lot": lot.id, "result": "no bids"})
        elif lot.reserve is not None and top.amount > lot.reserve:
            outcome.append({"lot": lot.id, "result": "reserve not met",
                            "best": top.amount, "supplierId": top.supplier_id})
        else:
            lot.awarded_to = top.supplier_id
            lot.awarded_amount = top.amount
            lot.awarded_at = now
            outcome.append({"lot": lot.id, "result": "winner",
                            "best": top.amount, "supplierId": top.supplier_id})
        lot.save(update_fields=["status", "awarded_to", "awarded_amount", "awarded_at"])

    a.status = "closed"
    a.closed_at = now
    a.ends_at = min(a.ends_at or now, now)
    a.save(update_fields=["status", "closed_at", "ends_at"])

    won = sum(1 for o in outcome if o["result"] == "winner")
    record_event(actor=actor, role="procurement", action="Auction closed",
                 detail=f"{a.ref} - {a.bids.count()} price movements, "
                        f"{len(a.extensions or [])} extension(s), {won} lot(s) with a winner.")
    return outcome, None


def savings(a):
    """Opening prices against final prices. Only lots that actually landed.

    A lot with no winner contributes nothing to either side of the comparison:
    counting its ceiling as "saved" would report a saving on something the
    organisation has not bought.
    """
    start = end = 0
    for lot in a.lots.all():
        if lot.awarded_amount is None:
            continue
        start += lot.ceiling
        end += lot.awarded_amount
    return {"ceiling": start, "final": end, "saved": start - end,
            "pct": ((start - end) / start * 100) if start else 0.0}


def replay(a):
    """Every movement in order, with what it did to the leaderboard.

    The artefact an award file needs and that almost nothing produces: not a
    list of prices but the shape of the competition - who led, for how long,
    what each extension was triggered by. A buyer defending an award is asked
    "how do you know it was competitive", and this is the answer.
    """
    rows = []
    per_lot = {}
    for b in a.bids.filter(retracted_at__isnull=True).order_by("at", "id"):
        book = per_lot.setdefault(b.lot_id, {})
        prev = min(book.values()) if book else None
        cur = book.get(b.supplier_id)
        if cur is None or b.amount < cur:
            book[b.supplier_id] = b.amount
        now_best = min(book.values())
        rows.append({
            "bidId": b.id, "lotId": b.lot_id, "at": b.at,
            "supplierId": b.supplier_id, "amount": b.amount, "kind": b.kind,
            "tookLead": prev is None or b.amount < prev,
            "bestAfter": now_best,
            "extended": b.extended,
            "closesAt": b.closes_at_bid_time,
        })
    return rows
