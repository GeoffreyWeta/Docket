"""The finance view of procurement: savings, spend, contracts, payments, risk.

Computed on the server rather than in the browser — unlike Analytics, which
works from the bootstrap payload — because this reads a mirrored ledger that can
run to tens of thousands of invoices. Shipping that to a laptop to be summed
there would be a slow page and a large amount of somebody's payables history
sitting in a browser tab.

**The savings definitions are deliberately identical to analytics-model.js.**
Two pages in one product that disagree about how much was saved is worse than
either page not existing, so the basis rule is the same in both places: measure
against a recorded prior price where one exists, against the budget where one
does not, and never add the two together. See Tender.savings_basis.

Four things this module refuses to do, each because the alternative is a number
that reads as fact and is not:

  * **No single fraud score.** The indicators are counted and named
    individually. A composite "fraud risk: 62" is an accusation with arithmetic
    painted on it, and no one can act on it or contest it.

  * **No solvency estimate.** DOCKET cannot see a vendor's balance sheet.
    What it can see is how they bid, how concentrated our spend is on them, and
    whether their paperwork is current — so the section is called financial
    distress *signals* and lists the observations, not a bankruptcy probability.

  * **No mixing currencies in a total.** Everything sums the base-currency
    column. Foreign-currency exposure is its own figure, computed from the rate
    struck against the rate today.

  * **No silent exclusion.** Rows that cannot be linked — an invoice against no
    contract, a contract against no tender — are counted and surfaced. They are
    the integration's real state and they are usually the finding.
"""
import re
from collections import defaultdict
from datetime import datetime, timezone

from .models import (Bid, Contract, FxRate, GoodsReceipt, Invoice, Payment,
                     PurchaseOrder, Supplier, Tender)
from .util import DAY_MS, abnormally_low, fmt_money, now_ms

# ------------------------------------------------------------------ time keys

MONTH_MS = 30 * DAY_MS


def month_key(ms):
    d = datetime.fromtimestamp(ms / 1000, timezone.utc)
    return f"{d.year:04d}-{d.month:02d}"


def quarter_key(ms):
    d = datetime.fromtimestamp(ms / 1000, timezone.utc)
    return f"{d.year:04d}-Q{(d.month - 1) // 3 + 1}"


def year_of(ms):
    return datetime.fromtimestamp(ms / 1000, timezone.utc).year


def month_start(key):
    y, m = key.split("-")
    return int(datetime(int(y), int(m), 1, tzinfo=timezone.utc).timestamp() * 1000)


def _series(buckets, value=lambda v: v):
    """A {key: acc} map as a sorted list the charts can read directly."""
    return [{"key": k, "at": month_start(k) if "-Q" not in k else None, "value": value(v)}
            for k, v in sorted(buckets.items())]


def _median(xs):
    xs = sorted(x for x in xs if x is not None)
    if not xs:
        return None
    m = len(xs) // 2
    return xs[m] if len(xs) % 2 else (xs[m - 1] + xs[m]) / 2


def _mean(xs):
    xs = [x for x in xs if x is not None]
    return (sum(xs) / len(xs)) if xs else None


def _pct(part, whole):
    return (part / whole * 100) if whole else None


# =================================================================== savings

def savings(tenders):
    """Every awarded tender's saving, split by what it was measured against.

    Three kinds, kept apart on purpose:

      negotiated  award against a recorded prior price. The defensible one.
      budget      award against the estimate set before going to market. This
                  measures the estimate as much as the buying.
      avoidance   award against the median bid received. Money not spent versus
                  what the market was actually asking on the day — real, but a
                  counterfactual, so it is never added to the other two.
    """
    rows = []
    for t in tenders:
        if t.status != "awarded" or t.awarded_amount is None:
            continue
        against, basis = t.savings_basis()
        if not against:
            continue
        amount = against - t.awarded_amount
        rows.append({
            "id": t.id, "ref": t.ref, "title": t.title, "category": t.category,
            "at": t.awarded_at, "basis": basis, "against": against,
            "awarded": t.awarded_amount, "amount": amount,
            "pct": _pct(amount, against),
            "source": t.baseline_source or "",
            "department": t.department or "", "project": t.project or "",
        })

    hard = [r for r in rows if r["basis"] == "baseline"]
    soft = [r for r in rows if r["basis"] == "budget"]
    total = lambda xs: sum(x["amount"] for x in xs)      # noqa: E731

    # Weighted, never the mean of the percentages: a ₦2m tender that saved 40%
    # must not move the rate as much as a ₦600m one that saved 4%.
    hard_rate = _pct(total(hard), sum(x["against"] for x in hard)) if hard else None
    all_rate = _pct(total(rows), sum(x["against"] for x in rows)) if rows else None

    by_year = defaultdict(lambda: {"negotiated": 0, "budget": 0, "n": 0})
    for r in rows:
        if not r["at"]:
            continue
        y = by_year[str(year_of(r["at"]))]
        y["negotiated" if r["basis"] == "baseline" else "budget"] += r["amount"]
        y["n"] += 1

    best = max(rows, key=lambda r: r["amount"], default=None)

    return {
        "rows": rows,
        "negotiated": {"total": total(hard), "n": len(hard), "rate": hard_rate,
                       "rows": sorted(hard, key=lambda r: -r["amount"])},
        "budget": {"total": total(soft), "n": len(soft),
                   "rate": _pct(total(soft), sum(x["against"] for x in soft)) if soft else None,
                   "rows": sorted(soft, key=lambda r: -r["amount"])},
        "total": total(rows),
        "rate": all_rate,
        "coverage": _pct(len(hard), len(rows)),
        "highest": best,
        "byYear": [{"key": k, **v} for k, v in sorted(by_year.items())],
        "trend": _series(_cumulative({r["at"]: r["amount"] for r in hard if r["at"]})),
    }


def cost_avoidance(tenders, bids_by_tender):
    """Award against the median bid received — what the market was asking.

    Reported apart from savings and never added to them. It is a genuine figure
    and a counterfactual at the same time: it says what the same purchase would
    have cost at a typical bid, not what the organisation used to pay. Needs
    three or more priced bids, below which "the median bid" is not a market
    price, it is one opinion.
    """
    rows = []
    for t in tenders:
        if t.status != "awarded" or t.awarded_amount is None:
            continue
        priced = [b.amount for b in bids_by_tender.get(t.id, []) if b.amount is not None]
        if len(priced) < 3:
            continue
        med = _median(priced)
        if med is None or med <= t.awarded_amount:
            continue
        rows.append({"id": t.id, "ref": t.ref, "title": t.title, "at": t.awarded_at,
                     "median": int(med), "awarded": t.awarded_amount,
                     "amount": int(med - t.awarded_amount), "bids": len(priced),
                     "pct": _pct(med - t.awarded_amount, med)})
    return {"rows": sorted(rows, key=lambda r: -r["amount"]),
            "total": sum(r["amount"] for r in rows), "n": len(rows),
            "skipped": sum(1 for t in tenders
                           if t.status == "awarded"
                           and len([b for b in bids_by_tender.get(t.id, []) if b.amount is not None]) < 3)}


def _cumulative(by_at):
    """{ms: delta} → {month: running total}."""
    out, run = {}, 0
    for at in sorted(by_at):
        run += by_at[at]
        out[month_key(at)] = run
    return out


# ============================================================ contract monitoring

def contract_rows(contracts, now=None):
    """Value, paid, balance, utilisation, expiry and escalation, per contract."""
    now = now or now_ms()
    paid_by_contract = defaultdict(int)
    invoiced_by_contract = defaultdict(int)
    for inv in Invoice.objects.select_related("contract").exclude(contract=None):
        invoiced_by_contract[inv.contract_id] += inv.amount
    for p in Payment.objects.select_related("invoice").exclude(invoice=None):
        if p.invoice and p.invoice.contract_id:
            paid_by_contract[p.invoice.contract_id] += p.amount

    po_count = defaultdict(int)
    for po in PurchaseOrder.objects.exclude(contract=None).values_list("contract_id", flat=True):
        po_count[po] += 1

    rows = []
    for c in contracts:
        paid = paid_by_contract.get(c.id, 0)
        invoiced = invoiced_by_contract.get(c.id, 0)
        delta, esc_pct = c.escalation
        days_left = int((c.ends_at - now) / DAY_MS) if c.ends_at else None
        # Category, from the tender where there was one and otherwise from the
        # vendor register. The register's category is the taxonomy the rest of
        # the product already counts by, so a contract placed with a logistics
        # vendor lands in logistics rather than in "Unrecorded" — which would be
        # true of almost every contract that predates this system and would make
        # the category chart useless on the day it shipped.
        category = (c.tender.category if c.tender else "") or \
                   (c.supplier.category if c.supplier else "")
        rows.append({
            "id": c.id, "ref": c.ref, "title": c.title, "category": category,
            "categoryFrom": "tender" if (c.tender and c.tender.category) else
                            ("vendor" if category else ""),
            "supplierId": c.supplier_id, "supplier": c.supplier.name if c.supplier else "",
            "tenderId": c.tender_id, "tenderRef": c.tender.ref if c.tender else "",
            "value": c.amount, "originalValue": c.original_value,
            "currency": c.currency, "amountSrc": c.amount_src, "fxRate": c.fx_rate,
            "paid": paid, "invoiced": invoiced, "balance": c.amount - paid,
            "utilisation": _pct(paid, c.amount),
            "invoicedPct": _pct(invoiced, c.amount),
            "signedAt": c.signed_at, "startsAt": c.starts_at, "endsAt": c.ends_at,
            "daysLeft": days_left, "status": c.status,
            "changeOrders": len(c.change_orders or []),
            "changeValue": delta, "escalationPct": esc_pct,
            "orders": po_count.get(c.id, 0),
            "department": c.department, "costCentre": c.cost_centre,
            "project": c.project, "region": c.region, "fundingSource": c.funding_source,
            "source": c.source, "syncedAt": c.synced_at,
        })
    return rows


def contract_summary(rows, now=None):
    now = now or now_ms()
    live = [r for r in rows if r["status"] == "active"]
    expiring = sorted((r for r in live if r["daysLeft"] is not None and 0 <= r["daysLeft"] <= 90),
                      key=lambda r: r["daysLeft"])
    expired = [r for r in live if r["daysLeft"] is not None and r["daysLeft"] < 0]
    exhausted = [r for r in live if r["utilisation"] is not None and r["utilisation"] >= 90]
    escalated = sorted((r for r in rows if r["escalationPct"] and r["escalationPct"] > 0),
                       key=lambda r: -r["escalationPct"])
    return {
        "rows": rows,
        "count": len(rows), "live": len(live),
        "value": sum(r["value"] for r in live),
        "paid": sum(r["paid"] for r in live),
        "balance": sum(r["balance"] for r in live),
        "utilisation": _pct(sum(r["paid"] for r in live), sum(r["value"] for r in live)),
        "expiring": expiring, "expired": expired, "exhausted": exhausted,
        "escalated": escalated,
        "changeValue": sum(r["changeValue"] for r in rows),
        "changeOrders": sum(r["changeOrders"] for r in rows),
        # A contract nobody tendered is not necessarily wrong — renewals and
        # novations are legitimate — but it is always worth being able to count.
        "untendered": [r for r in rows if not r["tenderId"]],
        "withoutOrders": [r for r in live if r["orders"] == 0],
    }


# ============================================================ payment performance

def payment_performance(now=None):
    """Invoices through approval to settlement, and how long each leg took."""
    now = now or now_ms()
    invoices = list(Invoice.objects.select_related("supplier", "contract", "order", "receipt")
                    .prefetch_related("payments"))

    received = len(invoices)
    approved = [i for i in invoices if i.approved_at]
    paid_rows, part_rows, unpaid_rows, overdue_rows = [], [], [], []
    pay_days, approve_days, late_days = [], [], []
    discount_earned = discount_missed = 0
    outstanding = 0

    monthly_paid = defaultdict(int)
    monthly_ontime = defaultdict(lambda: {"on": 0, "late": 0})

    for inv in invoices:
        payments = list(inv.payments.all())
        paid = sum(p.amount for p in payments)
        last_paid = max((p.paid_at for p in payments if p.paid_at), default=None)
        settled = paid >= inv.amount and inv.amount > 0

        if inv.approved_at and inv.received_at:
            approve_days.append((inv.approved_at - inv.received_at) / DAY_MS)

        if settled and last_paid and inv.received_at:
            # Received → settled, not approved → settled: the clock a supplier
            # actually experiences starts when they send the invoice.
            pay_days.append((last_paid - inv.received_at) / DAY_MS)
            monthly_paid[month_key(last_paid)] += paid
            if inv.due_at:
                (monthly_ontime[month_key(last_paid)]["on" if last_paid <= inv.due_at else "late"]) += 1
                if last_paid > inv.due_at:
                    late_days.append((last_paid - inv.due_at) / DAY_MS)
            paid_rows.append(inv)
        elif paid > 0:
            part_rows.append(inv)
            outstanding += inv.amount - paid
        else:
            unpaid_rows.append(inv)
            outstanding += inv.amount

        if not settled and inv.due_at and inv.due_at < now:
            overdue_rows.append({
                "id": inv.id, "ref": inv.supplier_ref or inv.external_id,
                "supplier": inv.supplier.name if inv.supplier else "",
                "supplierId": inv.supplier_id,
                "amount": inv.amount, "outstanding": inv.amount - paid,
                "dueAt": inv.due_at, "daysLate": int((now - inv.due_at) / DAY_MS),
                "status": inv.status, "hold": inv.hold_reason,
            })

        # Early-payment discounts: earned only where money actually moved inside
        # the window. An offered discount that was not taken is a real loss and
        # is counted separately rather than quietly dropped.
        if inv.discount_pct and inv.discount_days and inv.received_at:
            window = inv.received_at + inv.discount_days * DAY_MS
            worth = int(inv.amount * inv.discount_pct / 100)
            if last_paid and last_paid <= window:
                discount_earned += max(sum(p.discount_taken for p in payments), worth)
            elif settled or (inv.due_at and inv.due_at < now):
                discount_missed += worth

    ageing = _ageing(unpaid_rows + part_rows, now)

    return {
        "received": received,
        "approved": len(approved),
        "paid": len(paid_rows),
        "partPaid": len(part_rows),
        "unpaid": len(unpaid_rows),
        "outstanding": outstanding,
        "paidTotal": sum(monthly_paid.values()),
        "paidThisMonth": monthly_paid.get(month_key(now), 0),
        "avgPaymentDays": _mean(pay_days),
        "medianPaymentDays": _median(pay_days),
        "avgApprovalDays": _mean(approve_days),
        "overdue": sorted(overdue_rows, key=lambda r: -r["daysLate"]),
        "overdueValue": sum(r["outstanding"] for r in overdue_rows),
        "avgDaysLate": _mean(late_days),
        "discountEarned": discount_earned,
        "discountMissed": discount_missed,
        "ageing": ageing,
        "paidTrend": _series(monthly_paid),
        "timeliness": [{"key": k, "at": month_start(k),
                        "onTime": v["on"], "late": v["late"],
                        "value": _pct(v["on"], v["on"] + v["late"])}
                       for k, v in sorted(monthly_ontime.items())],
    }


def _ageing(open_invoices, now):
    """Outstanding payables in the buckets Finance already thinks in."""
    buckets = [("current", 0, 0), ("1-30", 1, 30), ("31-60", 31, 60),
               ("61-90", 61, 90), ("90+", 91, 10**6)]
    out = {k: {"key": k, "label": k, "value": 0, "n": 0} for k, _, _ in buckets}
    for inv in open_invoices:
        paid = sum(p.amount for p in inv.payments.all())
        owed = inv.amount - paid
        if owed <= 0:
            continue
        late = int((now - inv.due_at) / DAY_MS) if inv.due_at else 0
        for key, lo, hi in buckets:
            if (late <= 0 and key == "current") or (late > 0 and lo <= late <= hi):
                out[key]["value"] += owed
                out[key]["n"] += 1
                break
    return [out[k] for k, _, _ in buckets]


# ================================================================= spend slices

DIMENSIONS = [
    ("department", "Department"),
    ("category", "Category"),
    ("project", "Project"),
    ("supplier", "Supplier"),
    ("region", "Region"),
    ("fundingSource", "Funding source"),
    ("costCentre", "Cost centre"),
]

UNRECORDED = "Unrecorded"


def spend_slices(tenders, contract_rows_):
    """Committed spend cut every way Finance asks for it.

    Spend means *committed*: an awarded tender or a signed contract. Not
    invoiced, not paid — those are their own figures on the payments section,
    and conflating them is how a department is told it has spent money it has
    only promised.

    Contracts are the primary unit where one exists, with awarded tenders that
    never became a contract added alongside. A tender that produced a contract
    is counted once, through the contract, so the totals do not double.
    """
    tendered = {r["tenderId"] for r in contract_rows_ if r["tenderId"]}
    units = []
    for r in contract_rows_:
        units.append({
            "value": r["value"], "at": r["signedAt"],
            "department": r["department"] or UNRECORDED,
            "costCentre": r["costCentre"] or UNRECORDED,
            "project": r["project"] or UNRECORDED,
            "region": r["region"] or UNRECORDED,
            "fundingSource": r["fundingSource"] or UNRECORDED,
            "supplier": r["supplier"] or UNRECORDED,
            "category": r["category"] or UNRECORDED,
        })
    supplier_names = dict(Supplier.objects.values_list("id", "name"))
    for t in tenders:
        if t.status != "awarded" or t.awarded_amount is None or t.id in tendered:
            continue
        units.append({
            "value": t.awarded_amount, "at": t.awarded_at,
            "department": t.department or UNRECORDED,
            "costCentre": t.cost_centre or UNRECORDED,
            "project": t.project or UNRECORDED,
            "region": t.region or UNRECORDED,
            "fundingSource": t.funding_source or UNRECORDED,
            "supplier": supplier_names.get(t.awarded_to) or UNRECORDED,
            "category": t.category or UNRECORDED,
        })

    out = {}
    for key, label in DIMENSIONS:
        agg = defaultdict(lambda: {"value": 0, "n": 0})
        for u in units:
            a = agg[u[key]]
            a["value"] += u["value"]
            a["n"] += 1
        rows = [{"key": k, "label": k, "value": v["value"], "n": v["n"]}
                for k, v in agg.items()]
        out[key] = {"label": label,
                    "rows": sorted(rows, key=lambda r: -r["value"]),
                    "unrecorded": next((r["value"] for r in rows if r["key"] == UNRECORDED), 0)}
    out["_total"] = sum(u["value"] for u in units)
    out["_units"] = len(units)
    return out


# ====================================================================== trends

def trends(tenders, bids_by_tender, contract_rows_, payments):
    """The time series the finance pack is built from.

    Each is a single measure over one axis. Two measures of different scale are
    never put on one chart with two y-axes — where the pack wants a comparison
    (budget against actual) both are in the same unit and share one scale.
    """
    monthly_spend = defaultdict(int)
    monthly_budget = defaultdict(int)
    monthly_award = defaultdict(int)
    quarterly = defaultdict(int)
    cycle = defaultdict(list)

    # Committed spend counts contracts, not only awards. Most of what an
    # organisation commits in a year is a renewal or a call-off against
    # something signed earlier, and a spend trend drawn from awards alone shows
    # the tendering team's activity rather than the company's money.
    tendered = {r["tenderId"] for r in contract_rows_ if r["tenderId"]}
    for r in contract_rows_:
        if not r["signedAt"]:
            continue
        monthly_spend[month_key(r["signedAt"])] += r["value"]
        quarterly[quarter_key(r["signedAt"])] += r["value"]

    for t in tenders:
        if t.status == "awarded" and t.awarded_at and t.awarded_amount is not None:
            mk = month_key(t.awarded_at)
            if t.id not in tendered:      # counted once, through its contract
                monthly_spend[mk] += t.awarded_amount
                quarterly[quarter_key(t.awarded_at)] += t.awarded_amount
            monthly_award[mk] += t.awarded_amount
            monthly_budget[mk] += t.budget or 0
            if t.published_at:
                cycle[mk].append((t.awarded_at - t.published_at) / DAY_MS)

    # Market price index: the median bid received, as a share of the tender's
    # own budget. Not a unit price — scopes differ between tenders, so a naive
    # average of award values would measure what was bought, not what it cost.
    # This measures market pressure against the organisation's own estimates,
    # which is the comparison that holds across dissimilar purchases.
    price_index = defaultdict(list)
    for t in tenders:
        if not t.budget or not t.opened_at:
            continue
        priced = [b.amount for b in bids_by_tender.get(t.id, []) if b.amount is not None]
        if len(priced) < 2:
            continue
        price_index[month_key(t.opened_at)].append(_median(priced) / t.budget * 100)

    # Award against the budget that was approved for it. Only tenders carry a
    # budget, so this series is exactly as long as the tendering history — which
    # is the honest length for it. Padding it with contracts that never had a
    # budget would draw a utilisation line out of nothing.
    util = [{"key": k, "at": month_start(k),
             "spend": monthly_award[k], "budget": monthly_budget[k],
             "value": _pct(monthly_award[k], monthly_budget[k])}
            for k in sorted(monthly_budget) if monthly_budget[k]]

    # Drawdown: how much of what has been committed has actually been paid,
    # cumulatively. This is the well-populated companion to the line above —
    # every contract has a value and payments against it, budget or no budget.
    committed_by_month, paid_by_month = defaultdict(int), defaultdict(int)
    for r in contract_rows_:
        if r["signedAt"]:
            committed_by_month[month_key(r["signedAt"])] += r["value"]
    for p in payments:
        if p.paid_at:
            paid_by_month[month_key(p.paid_at)] += p.amount
    months = sorted(set(committed_by_month) | set(paid_by_month))
    drawdown, run_c, run_p = [], 0, 0
    for k in months:
        run_c += committed_by_month.get(k, 0)
        run_p += paid_by_month.get(k, 0)
        drawdown.append({"key": k, "at": month_start(k), "committed": run_c,
                         "paid": run_p, "value": _pct(run_p, run_c)})

    return {
        "spend": _series(monthly_spend),
        "budgetUtilisation": util,
        "drawdown": drawdown,
        "quarterly": [{"key": k, "value": v} for k, v in sorted(quarterly.items())],
        "cycleTime": [{"key": k, "at": month_start(k), "value": _mean(v)}
                      for k, v in sorted(cycle.items())],
        "priceIndex": [{"key": k, "at": month_start(k), "value": _median(v)}
                       for k, v in sorted(price_index.items())],
    }


# ================================================================== compliance

def compliance(tenders, contract_rows_, threshold, now=None):
    """The governance checks, each as pass/total with the failures attached.

    The headline score is the mean of the checks that had anything to measure,
    equally weighted, and it always ships with its components. A compliance
    score on its own is a number nobody can act on; the value is entirely in
    which check is dragging it down.
    """
    now = now or now_ms()
    checks = []

    awarded = [t for t in tenders if t.status == "awarded"]

    # 1) Approval matrix respected: anything above the threshold needed sign-off.
    from .models import Event
    approved_ids = set(Event.objects.filter(action__icontains="approv")
                       .exclude(tender_id=None).values_list("tender_id", flat=True))
    above = [t for t in awarded if (t.awarded_amount or 0) > threshold]
    missing_approval = [t for t in above if t.id not in approved_ids]
    checks.append(_check("approval-limit", "Procurements within the approval limit",
                         len(above) - len(missing_approval), len(above),
                         [_tref(t) for t in missing_approval],
                         f"Awards above {fmt_money(threshold)} with an approval recorded on the audit chain."))

    # 2) Competitive rather than single-source.
    bid_counts = defaultdict(int)
    for tid in Bid.objects.values_list("tender_id", flat=True):
        bid_counts[tid] += 1
    opened = [t for t in awarded if t.opened_at or t.status == "awarded"]
    single = [t for t in opened if bid_counts.get(t.id, 0) <= 1]
    checks.append(_check("competitive", "Competitively tendered",
                         len(opened) - len(single), len(opened),
                         [_tref(t) for t in single],
                         "Awards that attracted more than one bid. One bid is a renewal with paperwork."))

    # 3) Contracts carrying a purchase order.
    live = [r for r in contract_rows_ if r["status"] == "active"]
    no_po = [r for r in live if r["orders"] == 0]
    checks.append(_check("contract-po", "Contracts with a purchase order",
                         len(live) - len(no_po), len(live),
                         [{"id": r["id"], "ref": r["ref"], "label": r["title"] or r["ref"],
                           "value": r["value"]} for r in no_po],
                         "Live contracts with at least one order raised against them."))

    # 4) Three-way match: payment supported by a receipt.
    paid_invoices = [i for i in Invoice.objects.select_related("receipt", "order", "supplier")
                     .prefetch_related("payments") if i.payments.exists()]
    no_grn = [i for i in paid_invoices if i.receipt_id is None]
    checks.append(_check("payment-grn", "Payments supported by a goods receipt",
                         len(paid_invoices) - len(no_grn), len(paid_invoices),
                         [{"id": i.id, "ref": i.supplier_ref or i.external_id,
                           "label": i.supplier.name if i.supplier else "", "value": i.amount}
                          for i in no_grn],
                         "Invoices that were paid with a receipt on file proving delivery."))

    # 5) Invoices approved before payment.
    unapproved_paid = [i for i in paid_invoices if not i.approved_at]
    checks.append(_check("invoice-approval", "Invoices approved before payment",
                         len(paid_invoices) - len(unapproved_paid), len(paid_invoices),
                         [{"id": i.id, "ref": i.supplier_ref or i.external_id,
                           "label": i.supplier.name if i.supplier else "", "value": i.amount}
                          for i in unapproved_paid],
                         "Money left only after somebody signed for it."))

    # 6) Contracts traceable to a tender.
    untendered = [r for r in contract_rows_ if not r["tenderId"]]
    checks.append(_check("contract-tender", "Contracts traceable to a tender",
                         len(contract_rows_) - len(untendered), len(contract_rows_),
                         [{"id": r["id"], "ref": r["ref"], "label": r["title"] or r["ref"],
                           "value": r["value"]} for r in untendered],
                         "Renewals and novations legitimately have no tender — the point is to know which."))

    scored = [c for c in checks if c["total"] > 0]
    score = _mean([c["rate"] for c in scored])
    return {
        "checks": checks,
        "score": score,
        "measured": len(scored),
        "exceptions": sum(c["total"] - c["passed"] for c in checks),
        "singleSource": {"n": len(single), "value": sum(t.awarded_amount or 0 for t in single)},
        "competitive": {"n": len(opened) - len(single)},
        "threshold": threshold,
    }


def _check(key, label, passed, total, failures, note):
    return {"key": key, "label": label, "passed": passed, "total": total,
            "rate": _pct(passed, total), "failures": failures[:50],
            "failureCount": len(failures), "note": note}


def _tref(t):
    return {"id": t.id, "ref": t.ref, "label": t.title, "value": t.awarded_amount or 0}


# ======================================================================== risk

def exposure_by_supplier(now=None):
    """What each vendor is owed or promised, against the limit set for them.

    Exposure is the unpaid part of live contracts plus unpaid invoices that sit
    against no contract. Invoices under a contract are already inside that
    contract's balance and adding them again would double-count the same naira.
    """
    now = now or now_ms()
    rows = defaultdict(lambda: {"contracted": 0, "unpaidInvoices": 0, "n": 0})

    paid_by_contract = defaultdict(int)
    for p in Payment.objects.select_related("invoice"):
        if p.invoice and p.invoice.contract_id:
            paid_by_contract[p.invoice.contract_id] += p.amount

    for c in Contract.objects.filter(status="active").select_related("supplier"):
        if not c.supplier_id:
            continue
        r = rows[c.supplier_id]
        r["contracted"] += max(0, c.amount - paid_by_contract.get(c.id, 0))
        r["n"] += 1

    for inv in Invoice.objects.filter(contract=None).prefetch_related("payments"):
        if not inv.supplier_id:
            continue
        owed = inv.amount - sum(p.amount for p in inv.payments.all())
        if owed > 0:
            rows[inv.supplier_id]["unpaidInvoices"] += owed

    out = []
    suppliers = {s.id: s for s in Supplier.objects.filter(id__in=rows.keys())}
    for sid, r in rows.items():
        s = suppliers.get(sid)
        total = r["contracted"] + r["unpaidInvoices"]
        limit = (s.exposure_limit if s else 0) or 0
        out.append({
            "supplierId": sid, "supplier": s.name if s else sid,
            "contracted": r["contracted"], "unpaidInvoices": r["unpaidInvoices"],
            "exposure": total, "limit": limit,
            "headroom": (limit - total) if limit else None,
            "usage": _pct(total, limit) if limit else None,
            "over": bool(limit and total > limit),
            "contracts": r["n"],
        })
    return sorted(out, key=lambda r: -r["exposure"])


def fx_exposure(now=None):
    """Open commitments in a currency the organisation does not earn, valued at
    the rate struck and at today's rate. The gap is the exposure."""
    now = now or now_ms()
    latest = FxRate.latest()
    rows = []
    paid_by_contract = defaultdict(int)
    for p in Payment.objects.select_related("invoice"):
        if p.invoice and p.invoice.contract_id:
            paid_by_contract[p.invoice.contract_id] += p.amount

    for c in Contract.objects.filter(status="active").exclude(currency="NGN").select_related("supplier"):
        outstanding_base = max(0, c.amount - paid_by_contract.get(c.id, 0))
        if outstanding_base <= 0 or not c.fx_rate:
            continue
        outstanding_src = outstanding_base / c.fx_rate
        today = latest.get(c.currency)
        if not today:
            continue
        at_today = outstanding_src * today
        rows.append({
            "id": c.id, "ref": c.ref, "title": c.title,
            "supplier": c.supplier.name if c.supplier else "",
            "currency": c.currency, "outstandingSrc": round(outstanding_src),
            "rateAt": c.fx_rate, "rateNow": today,
            "atStruck": int(outstanding_base), "atToday": int(at_today),
            "movement": int(at_today - outstanding_base),
            "movementPct": _pct(today - c.fx_rate, c.fx_rate),
        })
    return {"rows": sorted(rows, key=lambda r: -abs(r["movement"])),
            "atStruck": sum(r["atStruck"] for r in rows),
            "atToday": sum(r["atToday"] for r in rows),
            "movement": sum(r["movement"] for r in rows),
            "currencies": sorted({r["currency"] for r in rows}),
            "rates": latest}


def distress_signals(now=None):
    """Observable signals that a vendor may be under financial strain.

    Explicitly not a solvency estimate. DOCKET sees bidding behaviour, our own
    concentration, and paperwork currency — none of which is a balance sheet.
    Each signal is listed with what was observed so the reader judges it, and
    the count is a count of signals, never a score.
    """
    now = now or now_ms()
    by_supplier = defaultdict(list)

    # Our spend concentrated on one vendor is our risk, not theirs — but it is
    # the number that decides how much their trouble would cost us.
    exposure = {r["supplierId"]: r for r in exposure_by_supplier(now)}
    total_exposure = sum(r["exposure"] for r in exposure.values()) or 1
    for sid, r in exposure.items():
        share = r["exposure"] / total_exposure * 100
        if share >= 20:
            by_supplier[sid].append({"signal": "concentration",
                                     "detail": f"{share:.0f}% of all open exposure sits with this vendor"})

    for s in Supplier.objects.all():
        expired = [d for d in (s.docs or [])
                   if d.get("expiry") and d["expiry"] < now]
        if expired:
            by_supplier[s.id].append({
                "signal": "documents",
                "detail": f"{len(expired)} compliance document(s) expired"})
        perf = s.perf or {}
        if perf.get("onTime") is not None and perf["onTime"] < 70:
            by_supplier[s.id].append({"signal": "delivery",
                                      "detail": f"on-time delivery {perf['onTime']}%"})

    # Bidding below anything sustainable is the classic distress tell.
    bids_by_tender = defaultdict(list)
    for b in Bid.objects.exclude(amount=None):
        bids_by_tender[b.tender_id].append(b)
    for tid, bids in bids_by_tender.items():
        for b in bids:
            if abnormally_low(b, bids):
                by_supplier[b.supplier_id].append({
                    "signal": "pricing",
                    "detail": "bid more than 35% below the median on a tender"})

    names = dict(Supplier.objects.values_list("id", "name"))
    out = [{"supplierId": sid, "supplier": names.get(sid, sid), "signals": sigs,
            "n": len(sigs), "exposure": exposure.get(sid, {}).get("exposure", 0)}
           for sid, sigs in by_supplier.items()]
    return sorted(out, key=lambda r: (-r["n"], -r["exposure"]))


# ================================================================== exceptions
#
# The eight automatic alerts. Each rule returns a list of dicts in one shape so
# the sweep can notify on them and the page can list them without either side
# knowing what the individual rules are:
#
#   kind      stable key, used for the notification idempotence mark
#   severity  "warn" | "watch"
#   subject   the one-line finding
#   detail    what was observed, in enough detail to act without opening it
#   ref       {page, id} the UI can route to, or None
#   value     the money at stake, where there is one
#   at        when the condition arose, for ordering

def exceptions(now=None, threshold=None):
    now = now or now_ms()
    if threshold is None:
        from .views import org_settings
        threshold = org_settings().get("approvalThreshold") or 0
    out = []
    out += _ex_over_budget(now)
    out += _ex_contract_expiry(now)
    out += _ex_exposure(now)
    out += _ex_overdue(now)
    out += _ex_duplicate_invoice(now)
    out += _ex_low_bid(now)
    out += _ex_missing_approval(now, threshold)
    out += _ex_unmatched_po(now)
    out += _ex_variation(now)
    return sorted(out, key=lambda e: (0 if e["severity"] == "warn" else 1, -(e["value"] or 0)))


def _ex(kind, severity, subject, detail, *, ref=None, value=0, at=None, key=""):
    return {"kind": kind, "severity": severity, "subject": subject, "detail": detail,
            "ref": ref, "value": value or 0, "at": at, "key": key or f"{kind}:{ref}"}


def _ex_over_budget(now):
    out = []
    for t in Tender.objects.filter(status="awarded").exclude(awarded_amount=None):
        if t.budget and t.awarded_amount > t.budget:
            over = t.awarded_amount - t.budget
            out.append(_ex("over_budget", "warn",
                           f"Award exceeds budget: {t.ref}",
                           f"{t.title} was awarded at {fmt_money(t.awarded_amount)} against a budget of "
                           f"{fmt_money(t.budget)} — over by {fmt_money(over)} ({over / t.budget * 100:.1f}%).",
                           ref={"page": "tender", "id": t.id}, value=over, at=t.awarded_at,
                           key=f"over_budget:{t.id}"))
    for c in Contract.objects.filter(status="active").select_related("tender"):
        if c.tender and c.tender.budget and c.amount > c.tender.budget:
            over = c.amount - c.tender.budget
            out.append(_ex("over_budget", "warn",
                           f"Contract value exceeds tender budget: {c.ref}",
                           f"{c.title or c.ref} stands at {fmt_money(c.amount)} after "
                           f"{len(c.change_orders or [])} change order(s), against a budget of "
                           f"{fmt_money(c.tender.budget)}.",
                           ref={"page": "finance", "id": c.id}, value=over, at=c.signed_at,
                           key=f"over_budget_contract:{c.id}"))
    return out


def _ex_contract_expiry(now):
    out = []
    for c in Contract.objects.filter(status="active").exclude(ends_at=None).select_related("supplier"):
        days = int((c.ends_at - now) / DAY_MS)
        if days < 0:
            out.append(_ex("contract_expired", "warn",
                           f"Contract expired: {c.ref}",
                           f"{c.title or c.ref} with {c.supplier.name if c.supplier else 'the vendor'} "
                           f"ended {abs(days)} day(s) ago and is still marked active.",
                           ref={"page": "finance", "id": c.id}, value=c.amount, at=c.ends_at,
                           key=f"contract_expired:{c.id}"))
        elif days <= (c.renewal_notice_days or 90):
            out.append(_ex("contract_expiring", "watch",
                           f"Contract expires in {days} day(s): {c.ref}",
                           f"{c.title or c.ref} ends on "
                           f"{datetime.fromtimestamp(c.ends_at / 1000, timezone.utc):%d %b %Y}. "
                           f"Retendering takes longer than the notice period on most categories.",
                           ref={"page": "finance", "id": c.id}, value=c.amount, at=c.ends_at,
                           key=f"contract_expiring:{c.id}"))
    return out


def _ex_exposure(now):
    return [_ex("exposure", "warn",
                f"Exposure limit exceeded: {r['supplier']}",
                f"Open exposure of {fmt_money(r['exposure'])} against a limit of {fmt_money(r['limit'])} "
                f"— over by {fmt_money(r['exposure'] - r['limit'])} across {r['contracts']} live contract(s).",
                ref={"page": "supplier", "id": r["supplierId"]},
                value=r["exposure"] - r["limit"], at=now,
                key=f"exposure:{r['supplierId']}")
            for r in exposure_by_supplier(now) if r["over"]]


def _ex_overdue(now):
    out = []
    for inv in (Invoice.objects.exclude(due_at=None).filter(due_at__lt=now)
                .select_related("supplier").prefetch_related("payments")):
        owed = inv.amount - sum(p.amount for p in inv.payments.all())
        if owed <= 0:
            continue
        late = int((now - inv.due_at) / DAY_MS)
        out.append(_ex("payment_overdue", "warn" if late > 30 else "watch",
                       f"Payment {late} day(s) overdue: {inv.supplier.name if inv.supplier else inv.supplier_ref}",
                       f"Invoice {inv.supplier_ref or inv.external_id} for {fmt_money(owed)} fell due on "
                       f"{datetime.fromtimestamp(inv.due_at / 1000, timezone.utc):%d %b %Y}"
                       + (f" and is on hold: {inv.hold_reason}." if inv.hold_reason else "."),
                       ref={"page": "finance", "id": inv.id}, value=owed, at=inv.due_at,
                       key=f"payment_overdue:{inv.id}:{late // 30}"))
    return out


def _norm_ref(s):
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def _ex_duplicate_invoice(now):
    """Two claims for the same thing. Caught two ways, because vendors resubmit
    both by re-sending the same document and by re-keying it under a new
    number: identical supplier + reference, and identical supplier + amount +
    invoice date. Both are reported; neither is auto-rejected."""
    out = []
    by_ref, by_amount = defaultdict(list), defaultdict(list)
    for inv in Invoice.objects.select_related("supplier"):
        if not inv.supplier_id:
            continue
        if inv.supplier_ref:
            by_ref[(inv.supplier_id, _norm_ref(inv.supplier_ref))].append(inv)
        if inv.amount and inv.invoiced_at:
            by_amount[(inv.supplier_id, inv.amount, inv.invoiced_at // DAY_MS)].append(inv)

    seen = set()
    for (sid, ref), group in by_ref.items():
        if len(group) < 2:
            continue
        ids = tuple(sorted(i.id for i in group))
        seen.add(ids)
        s = group[0].supplier
        out.append(_ex("duplicate_invoice", "warn",
                       f"Duplicate invoice reference: {s.name if s else sid}",
                       f"{len(group)} invoices share the reference "
                       f"“{group[0].supplier_ref}” totalling {fmt_money(sum(i.amount for i in group))}.",
                       ref={"page": "finance", "id": group[0].id},
                       value=sum(i.amount for i in group[1:]), at=now,
                       key=f"duplicate_invoice:{'|'.join(ids)}"))
    for (sid, amount, _day), group in by_amount.items():
        ids = tuple(sorted(i.id for i in group))
        if len(group) < 2 or ids in seen:
            continue
        s = group[0].supplier
        out.append(_ex("duplicate_invoice", "warn",
                       f"Same amount, same day: {s.name if s else sid}",
                       f"{len(group)} invoices for {fmt_money(amount)} carry the same invoice date under "
                       f"different references ({', '.join(i.supplier_ref or i.external_id for i in group)}).",
                       ref={"page": "finance", "id": group[0].id},
                       value=amount * (len(group) - 1), at=now,
                       key=f"duplicate_amount:{'|'.join(ids)}"))
    return out


def _ex_low_bid(now):
    out = []
    by_tender = defaultdict(list)
    for b in Bid.objects.exclude(amount=None).select_related("tender"):
        by_tender[b.tender_id].append(b)
    names = dict(Supplier.objects.values_list("id", "name"))
    for tid, bids in by_tender.items():
        t = bids[0].tender
        if not t.opened_at:
            continue      # nothing is abnormal before the envelopes are opened
        med = _median([b.amount for b in bids])
        for b in bids:
            if abnormally_low(b, bids):
                out.append(_ex("low_bid", "watch",
                               f"Bid abnormally low: {names.get(b.supplier_id, b.supplier_id)}",
                               f"{fmt_money(b.amount)} against a median of {fmt_money(med)} on {t.ref}. "
                               f"Verify viability before contracting.",
                               ref={"page": "tender", "id": t.id},
                               value=int(med - b.amount), at=t.opened_at,
                               key=f"low_bid:{b.id}"))
    return out


def _ex_missing_approval(now, threshold):
    out = []
    from .models import Event
    approved = set(Event.objects.filter(action__icontains="approv")
                   .exclude(tender_id=None).values_list("tender_id", flat=True))
    for t in Tender.objects.filter(status="awarded").exclude(awarded_amount=None):
        if (t.awarded_amount or 0) > threshold and t.id not in approved:
            out.append(_ex("missing_approval", "warn",
                           f"Award above the approval limit with no sign-off: {t.ref}",
                           f"{t.title} was awarded at {fmt_money(t.awarded_amount)}, above the "
                           f"{fmt_money(threshold)} threshold, and the audit chain holds no approval event.",
                           ref={"page": "tender", "id": t.id}, value=t.awarded_amount,
                           at=t.awarded_at, key=f"missing_approval:{t.id}"))
    for inv in (Invoice.objects.filter(approved_at=None).select_related("supplier")
                .prefetch_related("payments")):
        if inv.payments.exists():
            out.append(_ex("missing_approval", "warn",
                           f"Invoice paid without approval: {inv.supplier.name if inv.supplier else ''}",
                           f"Invoice {inv.supplier_ref or inv.external_id} for {fmt_money(inv.amount)} "
                           f"has payments against it and no approval recorded.",
                           ref={"page": "finance", "id": inv.id}, value=inv.amount, at=now,
                           key=f"missing_approval_invoice:{inv.id}"))
    for po in PurchaseOrder.objects.filter(approved_at=None).select_related("supplier"):
        if po.amount > threshold:
            out.append(_ex("missing_approval", "watch",
                           f"Purchase order above the limit with no approval: {po.ref}",
                           f"{po.description or po.ref} for {fmt_money(po.amount)} carries no approver.",
                           ref={"page": "finance", "id": po.id}, value=po.amount,
                           at=po.raised_at, key=f"missing_approval_po:{po.id}"))
    return out


# How much a contract may grow after signature before the growth is itself the
# finding. Fifteen per cent is the common public-procurement ceiling for
# variations without a fresh competition; an organisation with its own figure
# should move it here. Counted against the *original* value, not the current
# one, or each variation quietly raises the bar for the next.
VARIATION_THRESHOLD_PCT = 15


def _ex_variation(now):
    """Change orders that have grown a contract past the variation threshold.

    Reported on the cumulative total rather than per order, because the way a
    contract doubles is rarely one variation anybody would have queried — it is
    nine of them, each defensible on its own, which is exactly the pattern a
    per-order check is blind to.
    """
    out = []
    for c in Contract.objects.exclude(status="terminated").select_related("supplier"):
        delta, pct_ = c.escalation
        if not c.original_value or delta <= 0 or pct_ is None:
            continue
        if pct_ < VARIATION_THRESHOLD_PCT:
            continue
        orders = c.change_orders or []
        unapproved = [o for o in orders if not o.get("approved_by")]
        out.append(_ex("variation_threshold", "warn",
                       f"Variations exceed {VARIATION_THRESHOLD_PCT}%: {c.ref}",
                       f"{c.title or c.ref} has grown {pct_:.1f}% since signature — "
                       f"{fmt_money(c.original_value)} to {fmt_money(c.amount)} across "
                       f"{len(orders)} change order(s)"
                       + (f", {len(unapproved)} of them with no approver recorded." if unapproved else ".")
                       + " Growth on this scale is normally a retender, not a variation.",
                       ref={"page": "finance", "id": c.id}, value=delta, at=c.signed_at,
                       key=f"variation:{c.id}:{int(pct_ // 5)}"))
    return out


def _ex_unmatched_po(now):
    """The three-way match, from both ends: an order that never received
    anything, and an invoice being paid against no order at all."""
    out = []
    for po in (PurchaseOrder.objects.filter(status__in=("open", "received"))
               .exclude(raised_at=None).select_related("supplier").prefetch_related("receipts")):
        age = int((now - po.raised_at) / DAY_MS)
        if not po.receipts.exists() and age > 30:
            out.append(_ex("po_unmatched", "watch",
                           f"Purchase order with no receipt after {age} days: {po.ref}",
                           f"{po.description or po.ref} for {fmt_money(po.amount)} to "
                           f"{po.supplier.name if po.supplier else 'the vendor'} has no goods receipt.",
                           ref={"page": "finance", "id": po.id}, value=po.amount,
                           at=po.raised_at, key=f"po_unmatched:{po.id}"))
    for inv in (Invoice.objects.filter(order=None).select_related("supplier")
                .prefetch_related("payments")):
        if inv.payments.exists():
            out.append(_ex("po_unmatched", "warn",
                           f"Invoice paid against no purchase order: {inv.supplier.name if inv.supplier else ''}",
                           f"Invoice {inv.supplier_ref or inv.external_id} for {fmt_money(inv.amount)} "
                           f"was settled with no order and no receipt to match it to.",
                           ref={"page": "finance", "id": inv.id}, value=inv.amount, at=now,
                           key=f"invoice_no_po:{inv.id}"))
    return out


# ===================================================================== payload

def payload(threshold=None, year=None):
    """Everything the Finance page reads, in one response."""
    now = now_ms()
    if threshold is None:
        from .views import org_settings
        threshold = org_settings().get("approvalThreshold") or 0

    tenders = list(Tender.objects.all())
    if year:
        tenders = [t for t in tenders if not t.awarded_at or year_of(t.awarded_at) == year]

    bids_by_tender = defaultdict(list)
    for b in Bid.objects.all():
        bids_by_tender[b.tender_id].append(b)

    contracts = list(Contract.objects.select_related("supplier", "tender"))
    crows = contract_rows(contracts, now)
    if year:
        crows = [r for r in crows if not r["signedAt"] or year_of(r["signedAt"]) == year]

    payments = list(Payment.objects.all())
    from .finance_sync import freshness, sync_state
    oldest, never = freshness()

    return {
        "asAt": now,
        "ledger": {"oldestSync": oldest, "neverSynced": never, "feeds": sync_state(),
                   "rows": {"contracts": Contract.objects.count(),
                            "orders": PurchaseOrder.objects.count(),
                            "receipts": GoodsReceipt.objects.count(),
                            "invoices": Invoice.objects.count(),
                            "payments": Payment.objects.count()}},
        "savings": savings(tenders),
        "avoidance": cost_avoidance(tenders, bids_by_tender),
        "contracts": contract_summary(crows, now),
        "payments": payment_performance(now),
        "spend": spend_slices(tenders, crows),
        "trends": trends(tenders, bids_by_tender, crows, payments),
        "compliance": compliance(tenders, crows, threshold, now),
        "exposure": exposure_by_supplier(now),
        "fx": fx_exposure(now),
        "distress": distress_signals(now),
        "exceptions": exceptions(now, threshold),
        "dimensions": [{"key": k, "label": lb} for k, lb in DIMENSIONS],
    }
