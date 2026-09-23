"""Move every ttype="AUC" tender out of the tender table and into its own.

An auction stops being a kind of tender here. Each one becomes an Auction with
a single lot carrying what the tender's budget and decrement used to say, its
invitation list becomes participant rows, and its movement history becomes lot
bids. The tender row is then removed, because leaving it would mean the same
event existing twice with two different sets of rules about who may see what.

THE ID IS PRESERVED, and that is the one detail worth being careful about.
`Event.tender_id` is a plain CharField rather than a foreign key - deliberately,
so that the audit chain outlives the things it describes - which means deleting
these tenders cannot damage the chain, but it also means an auditor following
`tender_id="t7"` would find nothing if the auction were given a fresh id. Giving
the Auction the tender's own id keeps every historical entry resolvable.

TOMBSTONES ARE WRITTEN BY HAND. The post_delete receiver in datafeed.py keys off
the real model classes, and a migration deletes through historical ones, so the
signal will not recognise these. A warehouse that has already synced these
tenders has to be told they are gone, so the rows are written explicitly.
"""
from django.db import migrations


def _status(t):
    """Where this event actually is, in auction terms."""
    if t.cancelled_at:
        return "cancelled"
    if t.status == "awarded":
        return "awarded"
    if t.opened_at:                 # the old close recorded the standings here
        return "closed"
    if t.status == "published":
        return "live"
    return "draft"


def forward(apps, schema_editor):
    import random
    import string
    import time

    Tender = apps.get_model("core", "Tender")
    OldBid = apps.get_model("core", "AuctionBid")
    Auction = apps.get_model("core", "Auction")
    Lot = apps.get_model("core", "AuctionLot")
    Part = apps.get_model("core", "AuctionParticipant")
    LotBid = apps.get_model("core", "LotBid")
    Tombstone = apps.get_model("core", "Tombstone")

    now = int(time.time() * 1000)
    rid = lambda p: p + "".join(random.choices(string.ascii_lowercase + string.digits, k=9))

    moved = []
    for t in Tender.objects.filter(ttype="AUC"):
        a = Auction.objects.create(
            id=t.id, ref=t.ref, title=t.title, scope=t.scope or "",
            status=_status(t),
            # Rank-only: it is the safest default and matches what the old room
            # actually showed a vendor, which was their position and no prices.
            visibility="rank",
            starts_at=t.published_at, scheduled_ends_at=t.deadline,
            ends_at=t.deadline, closed_at=t.opened_at,
            ceiling_visible=True,
            # These auctions ran without an acceptance step, and inventing one
            # retrospectively would lock every existing bidder out of a room
            # they were already competing in.
            require_acceptance=False,
            owner_id=t.owner_id, created_at=t.published_at or now,
            created_by="", awarded_at=t.awarded_at, award_memo=t.award_memo or "",
            cancelled_at=t.cancelled_at, cancel_reason=t.cancel_reason or "",
            paused_at=t.paused_at, paused_reason=t.paused_reason or "",
            resumed_at=t.resumed_at,
            department=t.department, cost_centre=t.cost_centre, project=t.project,
            region=t.region, funding_source=t.funding_source,
            updated_at=now,
        )
        lot = Lot.objects.create(
            id=rid("l"), auction=a, number=1, title=t.title,
            description=t.scope or "", qty=1, uom="",
            ceiling=t.budget or 0,
            min_decrement=getattr(t, "auction_min_decrement", 0) or 0,
            decrement_is_pct=False,
            status="closed" if a.status in ("closed", "awarded", "cancelled") else "open",
            awarded_to=t.awarded_to or "", awarded_amount=t.awarded_amount,
            awarded_at=t.awarded_at, updated_at=now,
        )
        for sid in (t.invited or []):
            Part.objects.create(id=rid("ap"), auction=a, supplier_id=sid,
                                invited_at=t.published_at, invite_count=1,
                                updated_at=now)
        for ab in OldBid.objects.filter(tender_id=t.id).order_by("at"):
            LotBid.objects.create(
                id=ab.id, lot=lot, auction=a, supplier_id=ab.supplier_id,
                amount=ab.amount, at=ab.at, kind="manual",
                closes_at_bid_time=t.deadline or 0, extended=False,
                updated_at=now)
        moved.append(t.id)

    if moved:
        # The tender rows go, and their bids and documents with them. For an
        # auction those "bids" were only the final standings written back at
        # close, and they now exist properly as lot bids.
        for tid in moved:
            Tombstone.objects.create(entity="tenders", row_id=tid, at=now)
        Tender.objects.filter(id__in=moved).delete()


def backward(apps, schema_editor):
    """Deliberately not reversible.

    Going back would have to invent a tender for each auction and would lose
    lots, participants, proxies and extensions - everything the separation
    exists to make expressible. Roll back the schema with 0020 and restore data
    from a backup instead of pretending this can be undone in place.
    """
    raise RuntimeError(
        "0021 cannot be reversed: auctions carry lots, participants and "
        "extensions that no tender row can hold. Restore from a backup.")


class Migration(migrations.Migration):

    dependencies = [("core", "0020_auction_auctionlot_auctionparticipant_lotbid_and_more")]

    operations = [migrations.RunPython(forward, backward)]
