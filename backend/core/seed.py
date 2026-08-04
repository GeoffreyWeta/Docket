"""Idempotent demo seed for the Kestrel Hospitality Group workspace."""
from django.conf import settings
from django.contrib.auth.models import User

from .models import (ActionToken, AuctionBid, AuthToken, Bid, ChainHead, Clarification,
                     Document, Event, Notification, OrgSetting, Persona, Profile,
                     Supplier, TaskMark, Tender)
from .util import (DAY_MS, award_letter, now_ms, record_event, regret_letter,
                   rid, seal_bytes, seal_json)

# A minimal valid PDF used for seeded demo documents.
TINY_PDF = (b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
            b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
            b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n"
            b"trailer<</Root 1 0 R/Size 4>>\n%%EOF")

DEMO_USERS = [
    # (username, persona_id, supplier_id)
    ("amara", "u1", None), ("deji", "u2", None), ("ngozi", "u3", None),
    ("mark", "u4", None), ("aisha", "u5", None),
    ("coldline", None, "s2"), ("harmattan", None, "s3"), ("bluechip", None, "s7"),
]

ORG = {"name": "Kestrel Hospitality Group", "short": "Kestrel", "note": "Demo workspace"}


def wipe():
    """Reset the workspace to the seed.

    Administrator accounts survive it, and so do their sessions: a demo reset is
    a statement about tendering data, not a way to lock the operator out of the
    console that governs it. Custom roles (AccessRole) survive for the same
    reason — they are configuration, not demo content.
    """
    User.objects.filter(is_superuser=False).delete()  # cascades profiles, tokens, notifications
    AuthToken.objects.exclude(user__is_superuser=True).delete()
    for m in (Notification, ActionToken, Document, TaskMark, Event,
              ChainHead, Clarification, Bid, Tender, Supplier, Persona, OrgSetting):
        m.objects.all().delete()
    # An administrator who also held a persona loses it with the Persona table,
    # and the cascade takes the profile with it. Give it back, admin-only.
    for u in User.objects.filter(is_superuser=True):
        Profile.objects.get_or_create(user=u)


def seed_all():
    wipe()
    T = now_ms()
    d = lambda n: int(n * DAY_MS)

    Persona.objects.bulk_create([
        Persona(id="u1", name="Amara Okafor", role="procurement", title="Head of Procurement"),
        Persona(id="u2", name="Deji Balogun", role="evaluator", title="Supply Quality Evaluator"),
        Persona(id="u3", name="Ngozi Eze", role="evaluator", title="Finance Evaluator"),
        Persona(id="u4", name="Mark Iyer", role="approver", title="Chief Financial Officer"),
        Persona(id="u5", name="Aisha Bello", role="auditor", title="Internal Audit"),
    ])

    sup = lambda **kw: Supplier(**kw)
    Supplier.objects.bulk_create([
        sup(id="s1", name="Lagos Fresh Produce Co.", category="Food & Produce", location="Lagos", rating=4.1, prequalified=True,
            docs=[{"name": "NAFDAC registration", "expiry": T + d(38)}, {"name": "Tax clearance 2026", "expiry": T + d(210)}],
            perf={"onTime": 91, "quality": 88}),
        sup(id="s2", name="Coldline Logistics", category="Logistics", location="Lagos", rating=4.6, prequalified=True,
            docs=[{"name": "Fleet insurance", "expiry": T + d(190)}, {"name": "Tax clearance 2026", "expiry": T + d(240)}],
            perf={"onTime": 97, "quality": 95}),
        sup(id="s3", name="Harmattan Foods Ltd", category="Dairy & Imports", location="Lagos", rating=4.4, prequalified=True,
            docs=[{"name": "HACCP certification", "expiry": T + d(24)}, {"name": "Import licence", "expiry": T + d(300)}],
            perf={"onTime": 94, "quality": 96}),
        sup(id="s4", name="Zenith Kitchen Systems", category="Equipment", location="Abuja", rating=4.3, prequalified=True,
            docs=[{"name": "SON product certification", "expiry": T + d(400)}], perf={"onTime": 89, "quality": 93}),
        sup(id="s5", name="PackRight Industries", category="Packaging", location="Ogun", rating=4.5, prequalified=True,
            docs=[{"name": "Food-contact compliance", "expiry": T + d(150)}], perf={"onTime": 96, "quality": 94}),
        sup(id="s6", name="Meridian Pest Solutions", category="Facilities services", location="Lagos", rating=4.0, prequalified=True,
            docs=[{"name": "Operator licence", "expiry": T + d(120)}], perf={"onTime": 92, "quality": 90}),
        sup(id="s7", name="BlueChip POS Africa", category="IT hardware", location="Lagos", rating=4.2, prequalified=True,
            docs=[{"name": "OEM partner certificate", "expiry": T + d(500)}], perf={"onTime": 90, "quality": 92}),
        sup(id="s8", name="Savanna Dairy Imports", category="Dairy & Imports", location="Kano", rating=4.0, prequalified=True,
            docs=[{"name": "HACCP certification", "expiry": T + d(260)}, {"name": "Tax clearance 2026", "expiry": T + d(51)}],
            perf={"onTime": 87, "quality": 91}),
        sup(id="s9", name="Okoye Catering Equipment", category="Equipment", location="Onitsha", rating=3.9, prequalified=True,
            docs=[{"name": "SON product certification", "expiry": T + d(330)}], perf={"onTime": 85, "quality": 88}),
        sup(id="s10", name="FrostLine Refrigeration", category="Equipment", location="Port Harcourt", rating=3.7, prequalified=False,
            docs=[{"name": "Tax clearance 2026", "expiry": T + d(90)}], perf={"onTime": 82, "quality": 86}),
        sup(id="s11", name="Crestpack Nigeria", category="Packaging", location="Lagos", rating=4.1, prequalified=True,
            docs=[{"name": "Food-contact compliance", "expiry": T + d(210)}], perf={"onTime": 90, "quality": 89}),
    ])

    t1 = Tender(
        id="t1", ref="KST-RFP-2026-014", title="Annual supply of mozzarella & dairy inputs", ttype="RFP", category="Dairy",
        budget=480_000_000, status="evaluation", published_at=T - d(21), deadline=T - d(6), opened_at=T - d(5),
        invited=["s3", "s8", "s1"], tech_weight=70, comm_weight=30, lines=[], addenda=[],
        criteria=[
            {"id": "c1", "name": "Product quality & certifications", "weight": 35},
            {"id": "c2", "name": "Supply reliability & capacity", "weight": 30},
            {"id": "c3", "name": "Cold-chain capability", "weight": 20},
            {"id": "c4", "name": "Commercial terms", "weight": 15},
        ],
        scope=("Twelve-month frame agreement for mozzarella, cheddar and dairy inputs across 128 stores in three brands. "
               "Weekly deliveries to two central kitchens (Lagos and Abuja). HACCP certification and end-to-end cold-chain "
               "traceability are mandatory. Volumes indexed quarterly to store count."),
    )
    t2 = Tender(
        id="t2", ref="KST-RFQ-2026-021", title="Nationwide cold-chain distribution partner", ttype="RFQ", category="Logistics",
        budget=620_000_000, status="published", published_at=T - d(9), deadline=T + d(5),
        invited=["s2", "s10", "s1"], tech_weight=65, comm_weight=35, addenda=[],
        lines=[
            {"id": "l1", "desc": "Chilled store delivery (twice-weekly, all stores)", "qty": 13312, "unit": "drop"},
            {"id": "l2", "desc": "Frozen line-haul between central kitchens", "qty": 208, "unit": "trip"},
            {"id": "l3", "desc": "Cold-chain telemetry & exception reporting", "qty": 24, "unit": "site-month"},
        ],
        criteria=[
            {"id": "c1", "name": "Network coverage", "weight": 30},
            {"id": "c2", "name": "Fleet & temperature compliance", "weight": 30},
            {"id": "c3", "name": "Track record with multi-site food service", "weight": 20},
            {"id": "c4", "name": "Commercial terms", "weight": 20},
        ],
        scope=("Two-year contract for chilled and frozen distribution from two central kitchens to 128 stores nationwide. "
               "Twice-weekly drops per store, live temperature telemetry, and a 98% on-time SLA with service credits. "
               "Price each line as a fixed unit rate for the full term."),
    )
    t3 = Tender(
        id="t3", ref="KST-RFQ-2026-019", title="Kitchen equipment for 12 new stores", ttype="RFQ", category="Equipment",
        budget=350_000_000, status="published", published_at=T - d(18), deadline=T - d(1),
        invited=["s4", "s9", "s10"], tech_weight=60, comm_weight=40, addenda=[],
        lines=[
            {"id": "l1", "desc": "Combi oven line (2 per store)", "qty": 24, "unit": "unit"},
            {"id": "l2", "desc": "Refrigeration set (walk-in + under-counter)", "qty": 12, "unit": "store set"},
            {"id": "l3", "desc": "Prep & assembly stations", "qty": 12, "unit": "store set"},
            {"id": "l4", "desc": "Extraction, install & commissioning", "qty": 12, "unit": "store"},
        ],
        criteria=[
            {"id": "c1", "name": "Build quality & certifications", "weight": 40},
            {"id": "c2", "name": "Installation & after-sales support", "weight": 35},
            {"id": "c3", "name": "Delivery schedule fit", "weight": 25},
        ],
        scope=("Supply and installation of full kitchen lines (ovens, prep tables, refrigeration, extraction) for 12 new "
               "stores opening Q4 2026. Phased delivery aligned to construction milestones; 24-month on-site warranty. "
               "Unit rates fixed for the programme."),
    )
    t4 = Tender(
        id="t4", ref="KST-RFQ-2026-008", title="Pizza boxes, cups & consumables — annual supply", ttype="RFQ", category="Packaging",
        budget=210_000_000, status="awarded", published_at=T - d(60), deadline=T - d(40), opened_at=T - d(39),
        awarded_at=T - d(31), awarded_to="s5", awarded_amount=183_000_000,
        award_memo=("Panel recommends PackRight Industries at \u20a6183m — 12.9% under the \u20a6210m ceiling. Highest technical "
                    "score (81/100) and lowest price of two compliant bids. No variance or pricing flags. Food-contact "
                    "compliance verified and current."),
        invited=["s5", "s11"], tech_weight=60, comm_weight=40, lines=[], addenda=[],
        criteria=[
            {"id": "c1", "name": "Print & material quality", "weight": 40},
            {"id": "c2", "name": "Capacity & lead times", "weight": 35},
            {"id": "c3", "name": "Sustainability of materials", "weight": 25},
        ],
        scope=("Annual supply of branded pizza boxes, cold cups, lids and napkins across three brands. Monthly call-off "
               "deliveries to two central warehouses; food-contact compliance required for all materials."),
    )
    t4.letters = {
        "s5": {"type": "award", "text": award_letter(ORG["name"], t4, "PackRight Industries", 183_000_000)},
        "s11": {"type": "regret", "text": regret_letter(ORG["name"], t4, "Crestpack Nigeria")},
    }
    t5 = Tender(
        id="t5", ref="KST-RFP-2026-027", title="Integrated pest management — 128 stores", ttype="RFP", category="Facilities",
        budget=96_000_000, status="approval", published_at=None, deadline=T + d(20),
        invited=["s6"], tech_weight=70, comm_weight=30, lines=[], addenda=[], two_stage=True, tech_threshold=70,
        criteria=[
            {"id": "c1", "name": "Methodology & food-safe chemicals", "weight": 45},
            {"id": "c2", "name": "Coverage & response times", "weight": 35},
            {"id": "c3", "name": "Reporting & audit support", "weight": 20},
        ],
        scope=("Twelve-month integrated pest management programme covering 128 stores and two central kitchens. Monthly "
               "scheduled visits, 24-hour emergency response, digital service reports per site, food-safe treatment "
               "protocols only."),
    )
    t6 = Tender(
        id="t6", ref="KST-RFP-2026-025", title="POS hardware refresh across 3 brands", ttype="RFP", category="IT hardware",
        budget=240_000_000, status="published", published_at=T - d(6), deadline=T + d(9),
        invited=["s7"], tech_weight=65, comm_weight=35,
        addenda=[{"id": "a1", "at": T - d(2), "title": "Addendum 01 — store list revised to 132 stores",
                  "note": ("Four additional stores confirmed for the deployment window. Price the deployment & training "
                           "line assuming 132 stores; terminal and screen quantities are unchanged. All other terms stand.")}],
        lines=[
            {"id": "l1", "desc": "POS terminal (dual-SIM failover capable)", "qty": 410, "unit": "unit"},
            {"id": "l2", "desc": "Kitchen display screen", "qty": 120, "unit": "unit"},
            {"id": "l3", "desc": "Deployment, staging & staff training", "qty": 128, "unit": "store"},
        ],
        criteria=[
            {"id": "c1", "name": "Hardware reliability & spec", "weight": 35},
            {"id": "c2", "name": "Deployment plan & training", "weight": 25},
            {"id": "c3", "name": "Support SLA & spares", "weight": 25},
            {"id": "c4", "name": "Warranty terms", "weight": 15},
        ],
        scope=("Replacement of 410 POS terminals and 120 kitchen display screens across three brands. Includes staging, "
               "store-by-store deployment out of trading hours, staff orientation, and a 3-year advance-replacement warranty."),
    )
    t7 = Tender(
        id="t7", ref="KST-AUC-2026-030", title="Diesel supply for store generators — reverse auction", ttype="AUC",
        category="Energy", budget=90_000_000, status="published", published_at=T - d(1), deadline=T + d(0.085),
        invited=["s2", "s3", "s7", "s6"], tech_weight=0, comm_weight=100, lines=[], addenda=[], criteria=[],
        auction_min_decrement=500_000,
        scope=("12-month supply of AGO (diesel) to 128 store generators nationwide, delivered to site on a "
               "weekly schedule. Single lump-sum annual price, price-only competition: the ceiling is the "
               "current contract value. Bidders see their live rank — never a competitor's price. Bids in the "
               "final two minutes extend the close (anti-sniping)."),
    )
    Tender.objects.bulk_create([t1, t2, t3, t4, t5, t6, t7])
    for sid, amt, when in (("s6", 88_500_000, T - d(0.9)), ("s3", 87_900_000, T - d(0.6)),
                           ("s6", 86_800_000, T - d(0.4)), ("s2", 86_500_000, T - d(0.1))):
        AuctionBid.objects.create(id=rid("ab"), tender=t7, supplier_id=sid, amount=amt, at=when)

    Bid.objects.bulk_create([
        Bid(id="b1", tender=t1, supplier_id="s3", submitted_at=T - d(8), amount=452_000_000, lines={},
            scores={"u2": {"c1": 8, "c2": 8, "c3": 9, "c4": 6}, "u3": {"c1": 7, "c2": 8, "c3": 8, "c4": 7}}),
        Bid(id="b2", tender=t1, supplier_id="s8", submitted_at=T - d(7), amount=431_000_000, lines={},
            scores={"u2": {"c1": 7, "c2": 7, "c3": 8, "c4": 7}, "u3": {"c1": 8, "c2": 6, "c3": 7, "c4": 8}}),
        Bid(id="b3", tender=t1, supplier_id="s1", submitted_at=T - d(6.3), amount=265_000_000, lines={},
            scores={"u2": {"c1": 6, "c2": 4, "c3": 5, "c4": 9}, "u3": {"c1": 5, "c2": 9, "c3": 6, "c4": 9}}),
        # t3 is sealed and unopened: amounts exist ONLY as ciphertext at rest
        Bid(id="b4", tender=t3, supplier_id="s4", submitted_at=T - d(2), amount=None, lines={},
            sealed_blob=seal_json({"amount": 312_000_000, "lines": {"l1": 4_200_000, "l2": 7_500_000, "l3": 5_100_000, "l4": 5_000_000}}), scores={}),
        Bid(id="b5", tender=t3, supplier_id="s9", submitted_at=T - d(3), amount=None, lines={},
            sealed_blob=seal_json({"amount": 298_200_000, "lines": {"l1": 3_900_000, "l2": 7_200_000, "l3": 4_900_000, "l4": 4_950_000}}), scores={}),
        Bid(id="b6", tender=t3, supplier_id="s10", submitted_at=T - d(1.2), amount=None, lines={},
            sealed_blob=seal_json({"amount": 342_000_000, "lines": {"l1": 4_600_000, "l2": 8_300_000, "l3": 5_400_000, "l4": 5_600_000}}), scores={}),
        Bid(id="b7", tender=t4, supplier_id="s5", submitted_at=T - d(42), amount=183_000_000, lines={},
            scores={"u2": {"c1": 8, "c2": 9, "c3": 7}, "u3": {"c1": 8, "c2": 8, "c3": 7}}),
        Bid(id="b8", tender=t4, supplier_id="s11", submitted_at=T - d(41), amount=201_000_000, lines={},
            scores={"u2": {"c1": 7, "c2": 7, "c3": 8}, "u3": {"c1": 7, "c2": 6, "c3": 8}}),
    ])

    Clarification.objects.bulk_create([
        Clarification(id="q1", tender=t2, supplier_id="s2",
                      q=("Can bidders propose a hub-and-spoke model using third-party cold stores in the North-East, "
                         "or must all hubs be bidder-owned?"),
                      asked_at=T - d(2), a=None, answered_at=None),
        Clarification(id="q2", tender=t6, supplier_id="s7",
                      q="Should terminals support dual-SIM failover, or is Ethernet-primary acceptable?",
                      asked_at=T - d(4),
                      a="Dual-SIM failover is required for drive-through lanes. Ethernet-primary is acceptable in-store.",
                      answered_at=T - d(3)),
    ])

    ev = lambda at, actor, role, action, tid, detail: Event(
        id=rid("e"), at=at, actor=actor, role=role, action=action, tender_id=tid, detail=detail)
    _seed_events = [

        ev(T - d(1), "System", "system", "Deadline passed — bids sealed", "t3", "3 sealed bids held for formal opening."),
        ev(T - d(1.2), "FrostLine Refrigeration", "supplier", "Sealed bid received", "t3", "Contents sealed until the opening is logged."),
        ev(T - d(2), "Amara Okafor", "procurement", "Addendum issued", "t6", "Addendum 01 — store list revised to 132 stores. New submissions must acknowledge it."),
        ev(T - d(2), "Coldline Logistics", "supplier", "Clarification asked", "t2", "Question on hub-and-spoke distribution model."),
        ev(T - d(2), "Zenith Kitchen Systems", "supplier", "Sealed bid received", "t3", "Contents sealed until the opening is logged."),
        ev(T - d(3), "Amara Okafor", "procurement", "Clarification answered", "t6", "Published to all invited suppliers."),
        ev(T - d(3), "Amara Okafor", "procurement", "Submitted for approval", "t5", "Routed to the approver under the approval matrix (>\u20a650m)."),
        ev(T - d(3), "Okoye Catering Equipment", "supplier", "Sealed bid received", "t3", "Contents sealed until the opening is logged."),
        ev(T - d(4), "BlueChip POS Africa", "supplier", "Clarification asked", "t6", "Question on terminal connectivity spec."),
        ev(T - d(5), "Amara Okafor", "procurement", "Bid opening — seals broken", "t1", "3 bids opened before the evaluation panel; amounts recorded."),
        ev(T - d(6), "System", "system", "Deadline passed — bids sealed", "t1", "3 sealed bids held for formal opening."),
        ev(T - d(6.3), "Lagos Fresh Produce Co.", "supplier", "Sealed bid received", "t1", "Contents sealed until the opening is logged."),
        ev(T - d(6), "Mark Iyer", "approver", "Approved & published", "t6", "POS hardware refresh released to invited suppliers."),
        ev(T - d(7), "Savanna Dairy Imports", "supplier", "Sealed bid received", "t1", "Contents sealed until the opening is logged."),
        ev(T - d(8), "Harmattan Foods Ltd", "supplier", "Sealed bid received", "t1", "Contents sealed until the opening is logged."),
        ev(T - d(9), "Mark Iyer", "approver", "Approved & published", "t2", "Cold-chain distribution RFQ released to invited suppliers."),
        ev(T - d(31), "Mark Iyer", "approver", "Award approved", "t4", "Awarded to PackRight Industries at \u20a6183m — 12.9% under budget. Award and regret letters issued."),
        ev(T - d(31.1), "Amara Okafor", "procurement", "Award recommended", "t4", "Panel recommendation routed to the approver."),
        ]
    for _e in sorted(_seed_events, key=lambda x: x.at):
        record_event(actor=_e.actor, role=_e.role, action=_e.action,
                     tender_id=_e.tender_id, detail=_e.detail, at=_e.at)

    record_event(actor="Amara Okafor", role="procurement", at=T - d(1),
                 action="Reverse auction opened", tender_id="t7",
                 detail="Live price competition opened to 4 invited suppliers; rank-only visibility, \u20a60.5m minimum decrement.")

    # conflict-of-interest declarations consistent with the seeded scores
    for t, when in ((t1, T - d(4.9)), (t4, T - d(38.9))):
        t.coi = {"u2": when, "u3": when}
        t.save(update_fields=["coi"])

    # demo documents: tender packs + technical proposals behind the seeded bids
    def doc(tender, kind, sid, envelope, name, by, at, sealed=False):
        Document.objects.create(id=rid("d"), kind=kind, tender=tender, supplier_id=sid,
                                envelope=envelope, name=name, content_type="application/pdf",
                                size=len(TINY_PDF), data=seal_bytes(TINY_PDF) if sealed else TINY_PDF,
                                encrypted=sealed, uploaded_by=by, uploaded_at=at)

    doc(t2, "tender", None, "", "Store list & route map.pdf", "Amara Okafor", T - d(9))
    doc(t6, "tender", None, "", "Terminal & KDS specification.pdf", "Amara Okafor", T - d(6))
    doc(t1, "bid", "s3", "technical", "Harmattan — technical proposal.pdf", "Harmattan Foods Ltd", T - d(8))
    doc(t1, "bid", "s8", "technical", "Savanna — technical proposal.pdf", "Savanna Dairy Imports", T - d(7))
    doc(t1, "bid", "s1", "technical", "Lagos Fresh — technical proposal.pdf", "Lagos Fresh Produce Co.", T - d(6.3))
    doc(t3, "bid", "s4", "technical", "Zenith — equipment schedule & method.pdf", "Zenith Kitchen Systems", T - d(2), sealed=True)
    doc(t3, "bid", "s9", "technical", "Okoye — equipment schedule & method.pdf", "Okoye Catering Equipment", T - d(3), sealed=True)
    doc(t3, "bid", "s10", "technical", "FrostLine — equipment schedule & method.pdf", "FrostLine Refrigeration", T - d(1.2), sealed=True)

    # real login accounts mapped to the demo identities
    for sid, em in (("s2", "coldline@example.com"), ("s3", "harmattan@example.com"), ("s7", "bluechip@example.com")):
        Supplier.objects.filter(pk=sid).update(contact_email=em)

    for username, pid, sid in DEMO_USERS:
        u = User.objects.create_user(username=username, email=f"{username}@example.com",
                                     password=settings.DEMO_PASSWORD)
        Profile.objects.create(user=u,
                               persona=Persona.objects.get(pk=pid) if pid else None,
                               supplier=Supplier.objects.get(pk=sid) if sid else None)
