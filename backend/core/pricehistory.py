"""What the organisation was paying before — derived from the ledger it has.

The savings figure on the Finance page splits into "negotiated" and "against
budget", and the split is decided by one field: `Tender.baseline`. Where nobody
recorded a prior price, a real saving gets reported as the weaker kind. That is
the honest behaviour, but it is a reporting loss, and the loss is avoidable
whenever the finance ledger already contains what the same category cost last
time.

This module proposes those baselines. Four rules keep a proposal from becoming
an invention:

  1. **Only prior contracts.** Not budgets, not bids, not invoices. A contract
     is a price the organisation actually agreed. Invoices are deliberately not
     used even though they are more precise, because they would turn a drafting
     aid into a side channel onto payables for someone without that permission.

  2. **Only what came before.** A contract signed after the tender published is
     not what we "were paying before" — frequently it *is* the tender's own
     result, and using it would make every saving zero.

  3. **Annualised against its own term, or not offered.** A two-year contract
     compared with a one-year tender overstates the baseline by a factor of two.
     Where the term is unknown the figure is still offered but marked, never
     silently treated as annual.

  4. **The evidence travels with the number.** Every proposal names the
     contracts behind it and how many there were. A baseline nobody can trace is
     a baseline nobody can defend in the review the savings figure exists for.

Nothing here writes anything on its own. `apply_baselines` adopts exactly what
an operator was shown and approved — see the note on preview-then-adopt below.
"""
from collections import defaultdict

from .models import Contract, Tender
from .util import DAY_MS, fmt_money, now_ms, record_event

# A contract older than this is a weak guide to today's price in a market with
# double-digit inflation. Still offered, but marked stale so the operator
# decides rather than the code deciding for them.
STALE_DAYS = 900

MIN_TERM_DAYS = 30      # below this a "term" is a delivery date, not a period


def _annualised(c):
    """(amount, how) for one contract, normalised to a year where possible."""
    if c.starts_at and c.ends_at:
        term = (c.ends_at - c.starts_at) / DAY_MS
        if term >= MIN_TERM_DAYS:
            years = term / 365.0
            # Only scale a genuine multi-year or part-year term. A contract that
            # already runs about a year is left alone rather than nudged by the
            # few days that separate 360 from 365.
            if abs(years - 1.0) > 0.08:
                return int(round(c.amount / years)), f"annualised from a {round(term)}-day term"
            return c.amount, "a one-year term"
    return c.amount, "term not recorded — taken as annual"


def _median(xs):
    xs = sorted(xs)
    if not xs:
        return None
    m = len(xs) // 2
    return xs[m] if len(xs) % 2 else int(round((xs[m - 1] + xs[m]) / 2))


def _category_of(c):
    return (c.tender.category if c.tender_id and c.tender else "") or \
           (c.supplier.category if c.supplier_id and c.supplier else "")


def prior_contracts(category, *, before=None, supplier_id=None, exclude_tender=None):
    """Contracts in a category that predate `before`, newest first."""
    qs = Contract.objects.select_related("supplier", "tender").exclude(amount=0)
    out = []
    for c in qs:
        if exclude_tender and c.tender_id == exclude_tender:
            continue
        if supplier_id and c.supplier_id != supplier_id:
            continue
        if _category_of(c).lower() != (category or "").lower():
            continue
        at = c.signed_at or c.starts_at
        if not at:
            continue
        if before and at >= before:
            continue
        out.append(c)
    return sorted(out, key=lambda c: -(c.signed_at or c.starts_at or 0))


def _price(c, now):
    amount, how = _annualised(c)
    at = c.signed_at or c.starts_at
    return {
        "id": c.id, "ref": c.ref, "title": c.title or c.ref,
        "supplierId": c.supplier_id,
        "supplier": c.supplier.name if c.supplier else "",
        "signedAt": at, "raw": c.amount, "annual": amount, "how": how,
        "stale": (now - at) / DAY_MS > STALE_DAYS,
        "source": c.source,
    }


def suggest(category, *, before=None, supplier_id=None, prefer_supplier=None,
            exclude_tender=None, now=None):
    """A proposed baseline for a category, with the evidence behind it.

    Two different questions, answered in order of how well they answer "what
    were we paying for *this*":

    **The incumbent's own prior contract.** Where the award went to a supplier
    the organisation already had a contract with in this category, that contract
    is the price being replaced — not an estimate of it. It is used on its own.

    **Otherwise, the category median.** The median of the annualised prior
    contracts, not the mean and not the latest: one renegotiated outlier should
    not move the figure, and the most recent contract is not automatically the
    representative one.

    The distinction matters more than it looks. A category like "Food &
    ingredients" holds contracts from ₦141m to ₦600m for quite different things;
    a median across all of them is a number about the category, not about the
    tender, and using it where an incumbent contract exists throws away the one
    piece of evidence that would have survived a review. `basis` says which
    happened, so the caller can show it.

    `supplier_id` restricts the search to one vendor. `prefer_supplier` does
    not restrict anything — it names the incumbent so their contract wins the
    tie, while the rest of the category stays visible as context. The backfill
    uses the second: narrowing the query would hide the comparison that shows
    why the incumbent figure was chosen.

    Returns None where there is nothing to go on — an empty answer, never a
    guessed one.
    """
    now = now or now_ms()
    rows = prior_contracts(category, before=before, supplier_id=supplier_id,
                           exclude_tender=exclude_tender)
    if not rows:
        return None

    priced = [_price(c, now) for c in rows]

    want = prefer_supplier or supplier_id
    incumbent = [p for p in priced if want and p["supplierId"] == want]
    if incumbent:
        # Newest first out of prior_contracts, so the first is the contract most
        # recently in force with the supplier who just won.
        best = incumbent[0]
        used, basis = [best], "incumbent"
        amount = best["annual"]
        words = (f"{best['ref']}, the prior contract with {best['supplier']} — "
                 f"{fmt_money(best['raw'])}, {best['how']}")
    else:
        used, basis = priced, "category"
        amount = _median([p["annual"] for p in priced])
        if len(priced) == 1:
            p = priced[0]
            words = f"{p['ref']} with {p['supplier']} — {fmt_money(p['raw'])}, {p['how']}"
        else:
            words = (f"median of {len(priced)} prior {category.lower()} contracts "
                     f"({', '.join(p['ref'] for p in priced[:3])}"
                     f"{f' and {len(priced) - 3} more' if len(priced) > 3 else ''})")

    fresh = [p for p in used if not p["stale"]]
    newest = max(p["signedAt"] for p in used)

    # An incumbent contract is strong evidence even on its own — it is the thing
    # being replaced — so it is not downgraded for being a single row the way a
    # lone category contract is.
    if basis == "incumbent":
        confidence = "good" if fresh else "stale"
    else:
        confidence = "good" if len(fresh) >= 2 else "thin" if fresh else "stale"

    return {
        "amount": amount,
        "source": words,
        "basis": basis,
        "n": len(used),
        "fresh": len(fresh),
        "stale": len(used) - len(fresh),
        "newestAt": newest,
        "confidence": confidence,
        "evidence": used[:8],
        # The rest of the category, for context, when an incumbent decided it.
        "alsoSeen": [p for p in priced if p not in used][:6] if basis == "incumbent" else [],
    }


# ------------------------------------------------------------------- coverage

def coverage():
    """How much of the awarded record can be measured against a prior price."""
    awarded = [t for t in Tender.objects.all()
               if t.status == "awarded" and t.awarded_amount is not None]
    withb = [t for t in awarded if t.baseline]
    value = sum(t.awarded_amount for t in awarded) or 0
    covered = sum(t.awarded_amount for t in withb) or 0
    return {
        "awarded": len(awarded),
        "withBaseline": len(withb),
        "withoutBaseline": len(awarded) - len(withb),
        "pct": (len(withb) / len(awarded) * 100) if awarded else None,
        "valuePct": (covered / value * 100) if value else None,
        "value": value, "covered": covered,
    }


def backfill_candidates(now=None):
    """Awarded tenders with no baseline, and what history would propose.

    Includes the tenders history cannot help with, marked as such. A backfill
    screen that silently lists only the fixable ones tells the operator the job
    is finished when it is not.
    """
    now = now or now_ms()
    out = []
    for t in Tender.objects.select_related("owner").all():
        if t.status != "awarded" or t.awarded_amount is None or t.baseline:
            continue
        before = t.published_at or t.awarded_at or now
        # The supplier who won is passed in so a prior contract with that same
        # supplier — the price actually being replaced — beats a median across
        # everything else in the category. Without this the strongest evidence
        # available gets averaged away.
        s = suggest(t.category, before=before, prefer_supplier=t.awarded_to,
                    exclude_tender=t.id, now=now)
        row = {
            "id": t.id, "ref": t.ref, "title": t.title, "category": t.category,
            "awarded": t.awarded_amount, "budget": t.budget,
            "awardedAt": t.awarded_at,
            "currentBasis": "budget",
            "currentSaving": (t.budget or 0) - t.awarded_amount,
            "suggestion": s,
        }
        if s:
            row["proposedSaving"] = s["amount"] - t.awarded_amount
            row["delta"] = row["proposedSaving"] - row["currentSaving"]

            # Two different things, and conflating them makes the screen useless.
            #
            # `smaller` — the honest figure is lower than the budget figure. This
            # is the *expected* outcome, not a problem: budgets carry padding, so
            # replacing one with a real prior price usually shrinks the number
            # while making it defensible. Flagging it as a warning would mean
            # excluding the exact cases this tool exists for.
            #
            # `worsens` — the award cost *more* than the thing it replaced. That
            # is a genuine finding worth a human decision, and it is the only one
            # held back from bulk adoption.
            row["smaller"] = 0 <= row["proposedSaving"] < row["currentSaving"]
            row["worsens"] = row["proposedSaving"] < 0
        out.append(row)
    return sorted(out, key=lambda r: -(r.get("awarded") or 0))


# --------------------------------------------------------------------- adopt

def apply_baselines(picks, actor, now=None):
    """Adopt the baselines an operator picked. Returns (applied, skipped).

    **Adopt what you saw.** The amount written is the one that came back from
    the preview, not one recomputed here. Between the operator reading the
    screen and pressing the button, an import can land and move the median — and
    a savings figure whose basis changed after it was approved is a figure
    nobody actually signed off. Recomputing would also make the audit entry a
    lie, since it names the evidence the operator was shown.

    Every write is refused rather than corrected if it does not make sense: a
    tender that is not awarded, already has a baseline, or was handed an amount
    at or below its own award value (which would report a saving of zero or a
    loss, silently).
    """
    now = now or now_ms()
    applied, skipped = [], []

    for pick in picks:
        if not isinstance(pick, dict):
            skipped.append({"id": None, "why": "malformed selection"})
            continue
        tid = pick.get("id") or pick.get("tenderId")
        t = Tender.objects.filter(pk=tid).first()
        if not t:
            skipped.append({"id": tid, "why": "no such tender"})
            continue
        if t.status != "awarded" or t.awarded_amount is None:
            skipped.append({"id": tid, "ref": t.ref, "why": "not an awarded tender"})
            continue
        if t.baseline:
            skipped.append({"id": tid, "ref": t.ref,
                            "why": "already has a baseline — left alone"})
            continue
        try:
            amount = int(pick.get("amount") or 0)
        except (TypeError, ValueError):
            amount = 0
        if amount <= 0:
            skipped.append({"id": tid, "ref": t.ref, "why": "no amount given"})
            continue
        if amount <= t.awarded_amount:
            skipped.append({"id": tid, "ref": t.ref,
                            "why": f"{fmt_money(amount)} is at or below the award "
                                   f"({fmt_money(t.awarded_amount)}) — that is a loss, not a saving, "
                                   f"and wants recording deliberately rather than in a bulk backfill"})
            continue

        source = str(pick.get("source") or "").strip()[:200] or "adopted from ledger history"
        t.baseline = amount
        t.baseline_source = source
        t.save(update_fields=["baseline", "baseline_source"])

        saving = amount - t.awarded_amount
        record_event(actor=actor, role="procurement", at=now,
                     action="Savings baseline recorded", tender_id=t.id,
                     detail=f"Prior price set to {fmt_money(amount)} from the finance ledger "
                            f"({source}). The award at {fmt_money(t.awarded_amount)} now reports "
                            f"a negotiated saving of {fmt_money(saving)} in place of a "
                            f"budget-only figure.")
        applied.append({"id": t.id, "ref": t.ref, "title": t.title,
                        "amount": amount, "saving": saving, "source": source})

    return applied, skipped
