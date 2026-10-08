"""Add a selling-auction demonstration without resetting any existing records."""
from django.conf import settings
from django.contrib.auth.models import User
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from core.models import AccessRole, Auction, AuctionLot, AuctionParticipant, Persona, Profile, Supplier, DemoFixture
from core.util import now_ms

class Command(BaseCommand):
    help = "Add a safe staff/company selling auction to the demo database only."

    @transaction.atomic
    def handle(self, *args, **options):
        if not settings.DEMO_LOGIN:
            raise CommandError("This fixture is only for the demo workspace.")
        now = now_ms()
        AccessRole.objects.get_or_create(key="auction-organiser", defaults={
            "label":"Auction organiser", "title":"Auction organiser", "note":"Runs auctions without awarding or managing staff.",
            "perms":["page.auctions", "auction.create", "auction.edit", "auction.invite", "auction.open", "auction.lifecycle", "auction.monitor"], "created":now})
        persona, _ = Persona.objects.get_or_create(id="uauctiondemo", defaults={"name":"ENG Auction Organiser", "role":"auction-organiser", "title":"Auction organiser"})
        host, host_made = User.objects.get_or_create(username="auctionhost", defaults={"email":"auctionhost@example.com"})
        if host_made:
            host.set_unusable_password(); host.save()
        Profile.objects.get_or_create(user=host, defaults={"persona":persona})
        staff, _ = Supplier.objects.get_or_create(id="sstaffdemo", defaults={"name":"Tolu - Staff Bidder", "category":"Individual bidders", "contact_email":"staffbidder@example.com", "contact_person":"Tolu", "registered_at":now})
        bidder, bidder_made = User.objects.get_or_create(username="staffbidder", defaults={"email":"staffbidder@example.com"})
        if bidder_made:
            bidder.set_unusable_password(); bidder.save()
        Profile.objects.get_or_create(user=bidder, defaults={"supplier":staff})
        auction, made = Auction.objects.get_or_create(id="asaledemo", defaults={"ref":"SALE-DEMO-001", "title":"ENG surplus equipment sale", "direction":"sale", "status":"live", "visibility":"price", "terms":"Demonstration only. Highest eligible bid wins, subject to reserve and award approval. Winners pay and collect after confirmation.", "scope":"Staff and companies can bid for surplus office equipment.", "owner":persona, "created_by":persona.name, "created_at":now, "starts_at":now-60000, "ends_at":now+7*86400000, "scheduled_ends_at":now+7*86400000})
        lot, _ = AuctionLot.objects.get_or_create(id="lsaledemo", defaults={"auction":auction, "number":1, "title":"Surplus office desk", "description":"Used office desk. Inspect condition before bidding; collection arranged after award.", "ceiling":10000, "reserve":15000, "min_decrement":500})
        bidders = [staff] + list(Supplier.objects.filter(id__in=["s1","s2"]))
        for supplier in bidders:
            AuctionParticipant.objects.get_or_create(auction=auction, supplier_id=supplier.id, defaults={"id":("apsale"+supplier.id)[:16], "invited_at":now, "invite_count":1})
        fixture = DemoFixture.objects.filter(pk=1).first()
        if fixture:
            from core.seed import _label
            manifest = dict(fixture.manifest or {})
            for model, ids in [(AccessRole,["auction-organiser"]),(Persona,[persona.id]),(Supplier,[staff.id]),(Auction,[auction.id]),(AuctionLot,[lot.id]),(AuctionParticipant,list(auction.participants.values_list("id",flat=True)))]:
                label = _label(model)
                manifest[label] = list(dict.fromkeys(manifest.get(label,[]) + [str(i) for i in ids]))
            manifest["auth.User"] = list(dict.fromkeys(manifest.get("auth.User",[]) + [host.username,bidder.username]))
            fixture.manifest=manifest; fixture.save(update_fields=["manifest"])
        self.stdout.write("Selling demo ready: auctionhost organises; staffbidder bids. Existing data was retained.")
