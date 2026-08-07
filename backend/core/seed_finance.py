"""Demo ledger for the Kestrel workspace: contracts through to payments.

Separate from seed.py because it models a different half of the business — the
tender seed is a handful of hand-written competitions with real scope text, and
this is two years of routine purchase-to-pay traffic, which is only useful in
volume. Hand-writing 300 invoices would be unreadable and hand-writing 12 would
draw trends with no shape in them.

Everything is generated from a fixed seed, so the demo is the same after every
reset and a screenshot taken today still matches the app next month. Marked
`source="seed"` throughout, which is what keeps it honest: `Mirrored.from_ledger`
is False for these rows, so nothing in the product can mistake demo data for
something Dynamics NAV actually said.

The exceptions are planted deliberately, at the bottom of this file, and each
one is labelled with the rule it exists to trigger. A dashboard of alerts that
has nothing to alert on has not been tested, and the eight rules in finance.py
are the part of this feature most likely to be quietly wrong.
"""
import random

from .models import (Contract, FxRate, GoodsReceipt, Invoice, Payment,
                     PurchaseOrder, SourceSync, Supplier, Tender)
from .util import DAY_MS, now_ms, record_event

# The organisation's own coding. Offered by the tender form and used by every
# spend-by chart; see DEFAULT_DIMENSIONS in views.py for how it is configured.
DIMENSIONS = {
    "department": ["Operations", "Supply Chain", "Facilities", "Technology",
                   "Marketing", "People", "Finance"],
    "cost_centre": ["CC-1001 Central Kitchen Lagos", "CC-1002 Central Kitchen Abuja",
                    "CC-2001 Store Operations", "CC-3001 Technology",
                    "CC-4001 Facilities", "CC-5001 Marketing"],
    "project": ["Q4 2026 store openings", "POS refresh 2026", "Cold-chain upgrade",
                "Brand relaunch", "Business as usual"],
    "region": ["South West", "South East", "South South", "North Central", "North West"],
    "funding_source": ["Opex 2026", "Capex 2026", "Expansion facility", "Opex 2025"],
}

# How each vendor's work is normally coded, so the spend slices are coherent
# rather than a random scatter across every department.
VENDOR_CODING = {
    "s1":  ("Supply Chain", "CC-1001 Central Kitchen Lagos", "Business as usual", "South West", "Opex 2026"),
    "s2":  ("Supply Chain", "CC-2001 Store Operations", "Cold-chain upgrade", "South West", "Opex 2026"),
    "s3":  ("Supply Chain", "CC-1001 Central Kitchen Lagos", "Business as usual", "South West", "Opex 2026"),
    "s4":  ("Operations", "CC-2001 Store Operations", "Q4 2026 store openings", "South East", "Capex 2026"),
    "s5":  ("Marketing", "CC-5001 Marketing", "Business as usual", "South West", "Opex 2026"),
    "s6":  ("Facilities", "CC-4001 Facilities", "Business as usual", "South West", "Opex 2026"),
    "s7":  ("Technology", "CC-3001 Technology", "POS refresh 2026", "South West", "Capex 2026"),
    "s8":  ("Supply Chain", "CC-1002 Central Kitchen Abuja", "Business as usual", "North West", "Opex 2026"),
    "s9":  ("Operations", "CC-2001 Store Operations", "Q4 2026 store openings", "South East", "Capex 2026"),
    "s10": ("Facilities", "CC-4001 Facilities", "Cold-chain upgrade", "South South", "Capex 2026"),
    "s11": ("Marketing", "CC-5001 Marketing", "Brand relaunch", "South West", "Opex 2025"),
}

# What the organisation is willing to be owed by each vendor at one time. Left
# at zero for two of them on purpose — "no limit on file" is a real state and
# the exposure table has to be able to say so without implying a breach.
EXPOSURE_LIMITS = {
    "s1": 180_000_000, "s2": 700_000_000, "s3": 600_000_000, "s4": 400_000_000,
    "s5": 250_000_000, "s6": 120_000_000, "s7": 300_000_000, "s8": 0,
    "s9": 150_000_000, "s10": 90_000_000, "s11": 0,
}

# Recurring purchases, as the ledger would hold them. (supplier, title, category,
# annual value, months, currency). These become contracts with call-off orders.
RECURRING = [
    ("s3", "Dairy & mozzarella supply 2025", "Food & ingredients", 505_000_000, 12, "NGN"),
    ("s1", "Fresh produce — Lagos kitchens", "Food & ingredients", 288_000_000, 12, "NGN"),
    ("s8", "Dairy imports — northern kitchens", "Food & ingredients", 141_000_000, 12, "NGN"),
    ("s2", "Cold-chain distribution 2025", "Logistics & freight", 655_000_000, 12, "NGN"),
    ("s6", "Integrated pest management 2025", "Cleaning, pest & waste", 84_000_000, 12, "NGN"),
    ("s11", "Packaging & consumables 2025", "Printing & packaging", 228_000_000, 12, "NGN"),
    ("s5", "Branded packaging 2026", "Printing & packaging", 183_000_000, 12, "NGN"),
    ("s6", "Waste management — 128 stores", "Cleaning, pest & waste", 62_400_000, 12, "NGN"),
    ("s1", "Fresh produce 2026", "Food & ingredients", 312_000_000, 12, "NGN"),
    ("s2", "Line-haul between central kitchens", "Logistics & freight", 96_000_000, 12, "NGN"),
]

# One-off capital purchases. (supplier, title, category, value, currency, term_days)
#
# The two imported lines are priced in dollars and still running, which is what
# makes the exchange-rate exposure figure non-empty: a closed contract has no
# exposure left to carry, so a demo whose only foreign-currency commitments had
# already ended would draw an empty FX panel and look like a bug.
CAPITAL = [
    ("s4", "Kitchen equipment — 8 stores, phase 1", "Equipment & assets", 231_000_000, "NGN", 180),
    ("s9", "Prep stations & cold rooms — phase 2", "Equipment & assets", 118_500_000, "NGN", 150),
    ("s7", "POS terminals — pilot 40 stores", "IT & telecoms", 68_400_000, "USD", 420),
    ("s10", "Refrigeration retrofit — 22 stores", "Equipment & assets", 154_000_000, "USD", 500),
    ("s4", "Combi oven line replacement", "Equipment & assets", 87_200_000, "NGN", 240),
    ("s7", "Store connectivity upgrade", "IT & telecoms", 44_600_000, "NGN", 300),
    ("s11", "Brand relaunch print run", "Printing & packaging", 39_800_000, "NGN", 120),
]

# Contract headers from before this system existed — what a NAV migration
# actually delivers. Header only: no orders, no invoices, no payments, because
# a migration brings the agreements and leaves the transactions in the old
# ledger. They are what gives `pricehistory` something to derive a baseline
# from, and what makes the contract-traceability check tell the truth about an
# organisation that has been buying for longer than it has been tendering.
# (supplier, title, annual value, days ago signed, term days)
LEGACY = [
    ("s11", "Packaging & consumables 2024", 214_000_000, 1_080, 365),
    ("s5", "Packaging & consumables 2023", 186_000_000, 1_440, 365),
    ("s7", "POS estate support 2024", 79_500_000, 1_010, 365),
    ("s7", "POS terminals — first rollout", 74_800_000, 1_320, 300),
    ("s3", "Dairy supply 2024", 468_000_000, 1_070, 365),
    ("s2", "Distribution 2024", 601_000_000, 1_050, 365),
    ("s6", "Pest control 2024", 78_200_000, 1_095, 365),
    ("s4", "Kitchen equipment 2024 programme", 198_000_000, 1_150, 240),
]

USD_RATES = [(700, 1_480.0), (600, 1_512.0), (500, 1_547.0), (400, 1_566.0),
             (300, 1_601.0), (200, 1_618.0), (120, 1_634.0), (60, 1_649.0),
             (14, 1_655.0), (1, 1_662.0)]


def seed_finance(now=None):
    """Build the demo ledger. Idempotent: clears anything it wrote before."""
    T = now or now_ms()
    rng = random.Random(20260806)          # fixed: the demo must not drift
    d = lambda n: int(n * DAY_MS)          # noqa: E731

    for m in (Payment, Invoice, GoodsReceipt, PurchaseOrder, Contract, FxRate, SourceSync):
        m.objects.filter(**({"source": "seed"} if hasattr(m, "source") else {})).delete()

    for sid, limit in EXPOSURE_LIMITS.items():
        Supplier.objects.filter(pk=sid).update(exposure_limit=limit)

    _seed_dimensions_on_tenders()

    for days_ago, rate in USD_RATES:
        FxRate.objects.update_or_create(currency="USD", at=T - d(days_ago),
                                        defaults={"rate": rate, "source": "seed"})
    rate_now = USD_RATES[-1][1]

    n = [0]
    def nxt(prefix):
        n[0] += 1
        return f"{prefix}{n[0]:04d}"

    contracts = []

    # ---- migrated history: headers only, all closed --------------------------
    legacy = []
    for i, (sid, title, value, ago, term_days) in enumerate(LEGACY):
        signed = T - d(ago)
        legacy.append(_contract(nxt("LEG-"), sid, title, value, signed,
                                signed + d(term_days), "closed", "NGN", rate_now, T))

    # ---- recurring supply agreements, staggered across two years -------------
    for i, (sid, title, category, value, months, ccy) in enumerate(RECURRING):
        signed = T - d(700 - i * 62)
        ends = signed + d(months * 30)
        status = "active" if ends > T else "expired"
        contracts.append(_contract(
            nxt("SC-2025-"), sid, title, value, signed, ends, status, ccy, rate_now, T))

    # ---- capital purchases ---------------------------------------------------
    for i, (sid, title, category, value, ccy, term) in enumerate(CAPITAL):
        signed = T - d(430 - i * 55)
        ends = signed + d(term)
        contracts.append(_contract(
            nxt("CP-2026-"), sid, title, value, signed, ends,
            "active" if ends > T else "closed", ccy, rate_now, T))

    # ---- the one contract that came out of a tender in this system -----------
    t4 = Tender.objects.filter(pk="t4").first()
    if t4:
        c = _contract("SC-2026-0100", "s5", "Pizza boxes, cups & consumables — annual supply",
                      183_000_000, t4.awarded_at or (T - d(31)),
                      (t4.awarded_at or T) + d(365), "active", "NGN", rate_now, T)
        c.tender = t4
        c.save(update_fields=["tender"])
        contracts.append(c)

    # ---- the tendering history behind some of those contracts ----------------
    _seed_history(contracts, rng, T)

    # ---- orders, receipts, invoices, payments --------------------------------
    # Only for contracts this workspace has lived through. The migrated headers
    # deliberately carry no transactions: inventing two years of invoices for
    # them would make the payment-performance figures a fiction, and the whole
    # point of the ageing profile is that it is real.
    for c in contracts:
        _flow(c, rng, T, nxt)

    _plant_exceptions(contracts, rng, T, nxt, rate_now)
    _mark_feeds(T)
    return {"contracts": len(contracts) + len(legacy), "legacy": len(legacy),
            "invoices": Invoice.objects.count(), "payments": Payment.objects.count()}


def _contract(ref, sid, title, value_ngn, signed, ends, status, ccy, rate_now, T):
    """One contract, with its coding and its currency resolved."""
    dept, cc, proj, region, fund = VENDOR_CODING.get(sid, ("", "", "", "", ""))
    if ccy == "USD":
        # Struck at the rate in force on the day it was signed, not today's —
        # that gap is the whole of the exchange-rate exposure figure. The last
        # observation on or before the signature date, so a contract signed
        # after a devaluation carries the post-devaluation rate.
        earlier = [r for ago, r in USD_RATES if T - int(ago * DAY_MS) <= signed]
        struck = earlier[-1] if earlier else USD_RATES[0][1]
        src = int(round(value_ngn / struck))
        amount = int(round(src * struck))
        rate = struck
    else:
        src, amount, rate = value_ngn, value_ngn, 1.0
    return Contract.objects.create(
        id=f"ct-{ref.lower()}"[:24], source="seed", external_id=ref, synced_at=T,
        ref=ref, title=title, supplier_id=sid,
        amount=amount, original_value=amount, amount_src=src, currency=ccy, fx_rate=rate,
        signed_at=signed, starts_at=signed, ends_at=ends, status=status,
        change_orders=[], renewal_notice_days=90,
        department=dept, cost_centre=cc, project=proj, region=region, funding_source=fund,
    )


def _flow(c, rng, T, nxt):
    """Call-off orders against a contract, each with a receipt, invoice and
    payment — with realistic drop-off at every stage, because a ledger where
    every order is fully received and every invoice paid on time is a ledger
    nobody needs a dashboard for."""
    span = max(1, int(((c.ends_at or T) - c.signed_at) / DAY_MS))
    elapsed = max(0, min(span, int((T - c.signed_at) / DAY_MS)))
    if elapsed <= 0:
        return
    # Monthly call-offs for supply agreements; two or three for capital items.
    count = max(1, min(14, elapsed // 30)) if c.ref.startswith("SC") else rng.randint(2, 3)
    slice_ = c.amount // max(count, 1)

    for i in range(count):
        raised = c.signed_at + int((i + 0.5) * (elapsed / count) * DAY_MS)
        if raised > T:
            break
        amount = int(slice_ * rng.uniform(0.85, 1.12))
        # One number per document: the reference the ledger knows it by, its own
        # key, and the row id all agree, which is what makes a demo row you can
        # actually follow from the contract card down to the payment.
        po_ref = nxt("PO-")
        po = PurchaseOrder.objects.create(
            id=f"po-{po_ref}"[:24], source="seed", external_id=po_ref, synced_at=T,
            ref=po_ref, description=f"{c.title} — call-off {i + 1}",
            contract=c, tender=c.tender, supplier_id=c.supplier_id,
            amount=amount, amount_src=int(amount / c.fx_rate), currency=c.currency, fx_rate=c.fx_rate,
            raised_at=raised, raised_by="Amara Okafor", status="received",
            approved_at=raised + int(rng.uniform(0.5, 3) * DAY_MS), approved_by="Mark Iyer",
        )
        # ~92% of orders are received. The rest are the three-way-match findings.
        grn = None
        if rng.random() < 0.92:
            recv = raised + int(rng.uniform(4, 21) * DAY_MS)
            if recv <= T:
                grn_ref = nxt("GRN-")
                grn = GoodsReceipt.objects.create(
                    id=f"gr-{grn_ref}"[:24], source="seed", external_id=grn_ref, synced_at=T,
                    ref=grn_ref, order=po, amount=amount, amount_src=po.amount_src,
                    currency=c.currency, fx_rate=c.fx_rate,
                    received_at=recv, received_by="Store Operations", note="Delivered in full",
                )
        received = raised + int(rng.uniform(8, 30) * DAY_MS)
        if received > T:
            continue
        terms = 30 if c.currency == "NGN" else 45
        approved = received + int(rng.uniform(1, 9) * DAY_MS)
        # A tenth of recent invoices are still sitting unapproved — the approval
        # queue is where payment performance actually goes wrong. Anything older
        # than a quarter has been dealt with one way or the other; a permanent
        # backlog of two-year-old unapproved invoices is a data-generation
        # artefact, not a finance problem.
        stale = (T - received) / DAY_MS > 100
        has_approval = (stale or rng.random() < 0.90) and approved <= T
        inv_ref = nxt("PINV-")
        inv = Invoice.objects.create(
            id=f"iv-{inv_ref}"[:24], source="seed", external_id=inv_ref, synced_at=T,
            supplier_ref=f"{c.supplier_id.upper()}/{rng.randint(1000, 9999)}",
            contract=c, order=po, receipt=grn, supplier_id=c.supplier_id,
            amount=amount, amount_src=po.amount_src, currency=c.currency, fx_rate=c.fx_rate,
            invoiced_at=received - d1(rng, 0, 3), received_at=received,
            due_at=received + terms * DAY_MS,
            approved_at=approved if has_approval else None,
            approved_by="Mark Iyer" if has_approval else "",
            status="approved" if has_approval else "received",
            discount_pct=2.0 if rng.random() < 0.25 else 0,
            discount_days=10 if rng.random() < 0.25 else 0,
        )
        if not has_approval:
            continue
        # Settlement: mostly on time, a long tail that is not, and a small
        # number still open. Whether one stays open is gated on age rather than
        # on a flat probability — a flat one leaves two-year-old invoices
        # permanently unpaid and piles the whole ageing profile into the 90+
        # bucket, which is not what a going concern's payables look like.
        age_days = (T - inv.due_at) / DAY_MS
        roll = rng.random()
        if roll < 0.72:
            paid_at = approved + int(rng.uniform(2, 24) * DAY_MS)
        elif roll < 0.90 or age_days > 120:
            paid_at = inv.due_at + int(rng.uniform(3, 40) * DAY_MS)
        else:
            continue                                   # genuinely still open
        if paid_at > T:
            continue
        discount = 0
        if inv.discount_pct and paid_at <= inv.received_at + inv.discount_days * DAY_MS:
            discount = int(inv.amount * inv.discount_pct / 100)
        pay_ref = nxt("PMT-")
        Payment.objects.create(
            id=f"pm-{pay_ref}"[:24], source="seed", external_id=pay_ref, synced_at=T,
            invoice=inv, supplier_id=c.supplier_id, ref=pay_ref,
            amount=inv.amount - discount, amount_src=inv.amount_src,
            currency=c.currency, fx_rate=c.fx_rate,
            paid_at=paid_at, method="Bank transfer", discount_taken=discount,
        )
        inv.status = "paid"
        inv.save(update_fields=["status"])


def d1(rng, lo, hi):
    return int(rng.uniform(lo, hi) * DAY_MS)


# ---------------------------------------------------------------- the history
#
# Five competitions from 2025 that produced five of the contracts above. Without
# them the demo shows eighteen contracts and one tender, which makes the
# traceability check read 6% and the cycle-time trend a single point.
#
# It also keeps the check honest in the other direction: thirteen contracts
# still have no tender behind them, because renewals and pre-system agreements
# genuinely do not, and a compliance dashboard that scores 100% on its first day
# is measuring nothing.

HISTORY = [
    # (contract ref prefix match, ref, title, category, budget, baseline,
    #  baseline_source, award, winner, other bidders, days ago awarded, owner)
    ("SC-2025-0001", "KST-RFP-2025-004", "Dairy & mozzarella supply 2025", "Food & ingredients",
     530_000_000, 548_000_000, "2024 contract with Harmattan Foods, annualised",
     505_000_000, "s3", ["s8", "s1"], 690, "u1"),
    ("SC-2025-0004", "KST-RFQ-2025-011", "Cold-chain distribution 2025", "Logistics & freight",
     690_000_000, 712_000_000, "2024 distribution contract, annualised",
     655_000_000, "s2", ["s10", "s1"], 505, "u1"),
    ("SC-2025-0006", "KST-RFQ-2025-018", "Packaging & consumables 2025", "Printing & packaging",
     240_000_000, 0, "", 228_000_000, "s11", ["s5"], 380, "u1"),
    ("CP-2026-0011", "KST-RFQ-2026-002", "Kitchen equipment — 8 stores, phase 1", "Equipment & assets",
     245_000_000, 259_000_000, "2025 fit-out actuals, per-store × 8",
     231_000_000, "s4", ["s9", "s10"], 420, "u1"),
    ("CP-2026-0013", "KST-RFP-2026-006", "POS terminals — pilot 40 stores", "IT & telecoms",
     74_000_000, 0, "", 68_400_000, "s7", ["s4", "s9"], 300, "u4"),
]


def _seed_history(contracts, rng, T):
    from .models import Bid
    d = lambda n: int(n * DAY_MS)                                # noqa: E731
    by_ref = {c.ref: c for c in contracts}

    for h, (cref, ref, title, category, budget, baseline, basis,
            award, winner, others, ago, owner) in enumerate(HISTORY):
        c = by_ref.get(cref)
        awarded_at = T - d(ago)
        published = awarded_at - d(rng.randint(34, 61))
        deadline = published + d(rng.randint(14, 21))
        dept, cc, proj, region, fund = VENDOR_CODING.get(winner, ("", "", "", "", ""))
        t = Tender.objects.create(
            id=f"th-{ref[-8:].lower()}"[:16], ref=ref, title=title, ttype=ref.split("-")[1],
            category=category, owner_id=owner, budget=budget,
            baseline=baseline or None, baseline_source=basis,
            status="awarded", published_at=published, deadline=deadline,
            opened_at=deadline + d(1), awarded_at=awarded_at,
            awarded_to=winner, awarded_amount=award,
            invited=[winner] + others, tech_weight=65, comm_weight=35,
            criteria=[{"id": "c1", "name": "Technical capability", "weight": 60},
                      {"id": "c2", "name": "Commercial terms", "weight": 40}],
            lines=[], addenda=[],
            award_memo=f"Awarded to the highest-scoring compliant bid at {award:,}.",
            department=dept, cost_centre=cc, project=proj, region=region, funding_source=fund,
        )
        # The winning price plus losing bids above it — enough priced bids for
        # the cost-avoidance median to mean something.
        prices = [(winner, award)] + [
            (sid, int(award * rng.uniform(1.06, 1.34))) for sid in others]
        # Ids are positional rather than composed from the tender and supplier:
        # Bid.id is 16 characters, and a composed key truncates to the same
        # string for every bidder on a tender, which silently drops all but one.
        for j, (sid, amount) in enumerate(prices):
            Bid.objects.create(
                id=f"bh{h}{j}", tender=t, supplier_id=sid,
                submitted_at=deadline - d(rng.uniform(0.5, 4)), amount=amount,
                lines={}, scores={}, notes={})
        # The approval that let each award through, on the audit chain where the
        # compliance check looks for it. Without these the historical tenders
        # read as five unapproved awards, which is a defect in the seed being
        # reported as a governance failure — the worst kind of false positive,
        # because it is indistinguishable from the real thing.
        #
        # The last one is left unapproved on purpose. RULE: missing_approval.
        if h < len(HISTORY) - 1:
            record_event(actor="Mark Iyer", role="approver", at=awarded_at,
                         action="Award approved", tender_id=t.id,
                         detail=f"{title} awarded to the highest-scoring compliant bid at {award:,}.")

        if c:
            c.tender = t
            c.save(update_fields=["tender"])


# ------------------------------------------------------------------ exceptions
#
# One case per rule in finance.py, so the alerts panel is exercised rather than
# assumed. Each block names the rule it is there to trigger.

def _plant_exceptions(contracts, rng, T, nxt, rate_now):
    d = lambda n: int(n * DAY_MS)          # noqa: E731
    active = [c for c in contracts if c.status == "active"]
    if not active:
        return

    # RULE: contract_expiring — inside the 90-day notice window.
    soon = active[0]
    soon.ends_at = T + d(38)
    soon.save(update_fields=["ends_at"])

    # RULE: contract_expired — ended, still marked active. The one that costs
    # money, because supply continues on lapsed terms nobody renegotiated.
    lapsed = active[1] if len(active) > 1 else active[0]
    lapsed.ends_at = T - d(23)
    lapsed.save(update_fields=["ends_at"])

    # RULE: over_budget — change orders push a contract past the tender budget
    # it was let against.
    tendered = next((c for c in contracts if c.tender_id), None)
    if tendered:
        uplift = int(tendered.original_value * 0.19)
        tendered.change_orders = [
            {"at": T - d(120), "amount": int(uplift * 0.4), "ref": "VO-01",
             "reason": "Additional 14 stores added to the delivery schedule",
             "approved_by": "Mark Iyer"},
            {"at": T - d(64), "amount": int(uplift * 0.35), "ref": "VO-02",
             "reason": "Board substrate change after food-contact retest",
             "approved_by": "Mark Iyer"},
            {"at": T - d(19), "amount": uplift - int(uplift * 0.75), "ref": "VO-03",
             "reason": "Q4 volume uplift ahead of the festive trading period",
             "approved_by": ""},
        ]
        tendered.amount = tendered.original_value + uplift
        tendered.save(update_fields=["change_orders", "amount"])

    # RULE: exposure — one vendor carried well past the limit set for them.
    over = next((c for c in active if c.supplier_id == "s10"), None)
    if over:
        over.amount = 240_000_000                     # limit is 90m
        over.original_value = 240_000_000
        over.save(update_fields=["amount", "original_value"])

    # RULE: payment_overdue — three claims well past due, one of them on hold
    # with a reason, because "overdue" and "disputed" need telling apart.
    overdue_specs = [(64, "s3", 41_200_000, ""), (38, "s2", 27_850_000, ""),
                     (96, "s9", 18_400_000, "Quantity dispute — 2 cold rooms short on delivery")]
    for i, (late, sid, amount, hold) in enumerate(overdue_specs):
        c = next((x for x in contracts if x.supplier_id == sid), active[0])
        Invoice.objects.create(
            id=f"iv-od{i}", source="seed", external_id=f"PINV-OD-{i}", synced_at=T,
            supplier_ref=f"{sid.upper()}/OD{1200 + i}", contract=c, order=None,
            receipt=None, supplier_id=sid, amount=amount, amount_src=amount,
            currency="NGN", fx_rate=1.0,
            invoiced_at=T - d(late + 34), received_at=T - d(late + 30),
            due_at=T - d(late), approved_at=T - d(late + 22), approved_by="Mark Iyer",
            status="approved", hold_reason=hold,
        )

    # RULE: duplicate_invoice — the same reference twice (a resend), and the
    # same amount on the same day under two references (a re-key).
    dup_c = next((c for c in contracts if c.supplier_id == "s1"), active[0])
    for i in range(2):
        Invoice.objects.create(
            id=f"iv-dup{i}", source="seed", external_id=f"PINV-DUP-{i}", synced_at=T,
            supplier_ref="S1/4471", contract=dup_c, supplier_id="s1",
            amount=12_640_000, amount_src=12_640_000, currency="NGN", fx_rate=1.0,
            invoiced_at=T - d(26), received_at=T - d(24 - i), due_at=T + d(6),
            approved_at=None, status="received",
        )
    for i, ref in enumerate(("S8/2210", "S8/2219")):
        Invoice.objects.create(
            id=f"iv-dupamt{i}", source="seed", external_id=f"PINV-DUPA-{i}", synced_at=T,
            supplier_ref=ref, contract=next((c for c in contracts if c.supplier_id == "s8"), dup_c),
            supplier_id="s8", amount=7_980_000, amount_src=7_980_000, currency="NGN", fx_rate=1.0,
            invoiced_at=T - d(17), received_at=T - d(16), due_at=T + d(14),
            approved_at=T - d(11), approved_by="Mark Iyer", status="approved",
        )

    # RULE: missing_approval (invoice) — money left with nobody's name on it.
    unapproved = Invoice.objects.create(
        id="iv-noapp", source="seed", external_id="PINV-NOAPP", synced_at=T,
        supplier_ref="S6/8890", contract=next((c for c in contracts if c.supplier_id == "s6"), active[0]),
        supplier_id="s6", amount=9_450_000, amount_src=9_450_000, currency="NGN", fx_rate=1.0,
        invoiced_at=T - d(54), received_at=T - d(52), due_at=T - d(22),
        approved_at=None, status="paid",
    )
    Payment.objects.create(
        id="pm-noapp", source="seed", external_id="PMT-NOAPP", synced_at=T,
        invoice=unapproved, supplier_id="s6", ref="PMT-NOAPP",
        amount=9_450_000, amount_src=9_450_000, currency="NGN", fx_rate=1.0,
        paid_at=T - d(30), method="Bank transfer",
    )

    # RULE: po_unmatched (both directions) — an order that never received
    # anything, and an invoice settled against no order at all.
    stale_c = next((c for c in active if c.supplier_id == "s4"), active[0])
    PurchaseOrder.objects.create(
        id="po-nogrn", source="seed", external_id="PO-NOGRN", synced_at=T,
        ref="PO-NOGRN", description="Combi ovens — 4 units, phase 2 stores",
        contract=stale_c, supplier_id="s4", amount=31_800_000, amount_src=31_800_000,
        currency="NGN", fx_rate=1.0, raised_at=T - d(71), raised_by="Amara Okafor",
        status="open", approved_at=T - d(69), approved_by="Mark Iyer",
    )
    no_po = Invoice.objects.create(
        id="iv-nopo", source="seed", external_id="PINV-NOPO", synced_at=T,
        supplier_ref="S7/3312", contract=None, order=None, receipt=None, supplier_id="s7",
        amount=14_200_000, amount_src=14_200_000, currency="NGN", fx_rate=1.0,
        invoiced_at=T - d(40), received_at=T - d(38), due_at=T - d(8),
        approved_at=T - d(31), approved_by="Mark Iyer", status="paid",
    )
    Payment.objects.create(
        id="pm-nopo", source="seed", external_id="PMT-NOPO", synced_at=T,
        invoice=no_po, supplier_id="s7", ref="PMT-NOPO",
        amount=14_200_000, amount_src=14_200_000, currency="NGN", fx_rate=1.0,
        paid_at=T - d(12), method="Bank transfer",
    )

    # RULE: missing_approval (purchase order) — above the matrix, no approver.
    PurchaseOrder.objects.create(
        id="po-noapp", source="seed", external_id="PO-NOAPP", synced_at=T,
        ref="PO-NOAPP", description="Emergency generator hire — 9 stores, harmattan outage",
        contract=None, supplier_id="s10", amount=58_400_000, amount_src=58_400_000,
        currency="NGN", fx_rate=1.0, raised_at=T - d(16), raised_by="Facilities",
        status="open", approved_at=None, approved_by="",
    )


def _seed_dimensions_on_tenders():
    """Code the hand-written tenders, so Analytics and Finance agree about which
    department a competition belongs to. t5 is deliberately left uncoded — an
    unrecorded tender is a state the spend charts have to be able to show."""
    coding = {
        "t1": ("Supply Chain", "CC-1001 Central Kitchen Lagos", "Business as usual", "South West", "Opex 2026"),
        "t2": ("Supply Chain", "CC-2001 Store Operations", "Cold-chain upgrade", "South West", "Opex 2026"),
        "t3": ("Operations", "CC-2001 Store Operations", "Q4 2026 store openings", "South East", "Capex 2026"),
        "t4": ("Marketing", "CC-5001 Marketing", "Business as usual", "South West", "Opex 2026"),
        "t6": ("Technology", "CC-3001 Technology", "POS refresh 2026", "South West", "Capex 2026"),
        "t7": ("Facilities", "CC-4001 Facilities", "Business as usual", "North Central", "Opex 2026"),
    }
    for tid, (dept, cc, proj, region, fund) in coding.items():
        Tender.objects.filter(pk=tid).update(
            department=dept, cost_centre=cc, project=proj, region=region, funding_source=fund)


def _mark_feeds(T):
    """Record the demo ledger as a feed that has run, so the staleness banner
    has something true to say instead of claiming nothing was ever imported."""
    for entity in ("contract", "po", "grn", "invoice", "payment", "fx"):
        SourceSync.objects.update_or_create(
            source="seed", entity=entity,
            defaults={"last_attempt": T, "last_success": T, "error": "",
                      "rows_seen": 0, "rows_written": 0})
