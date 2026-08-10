"""Finance endpoints: the dashboard payload, and loading the ledger.

Kept out of the bootstrap payload on purpose. Bootstrap is fetched on every
sign-in and after every action, by every role; the finance rollups read a
mirrored ledger and are wanted by one page. Putting them in bootstrap would
make an evaluator's scoring screen wait on a payables aggregation.
"""
import json

from django.db.models import Q
from django.http import JsonResponse

from . import finance, finance_sync
from .models import Contract, GoodsReceipt, Invoice, Payment, PurchaseOrder
from .permissions import has
from .util import fmt_money, now_ms
from .views import err, log, org_settings, route


@route(["GET"], perm="page.finance")
def finance_state(request, p, body):
    """Everything the Finance page draws.

    `payables` is dropped for anyone without the capability, server-side rather
    than hidden in the interface: what a named vendor is owed is not something
    to send to a browser and ask it not to render.
    """
    try:
        year = int(request.GET.get("year") or 0) or None
    except (TypeError, ValueError):
        year = None

    data = finance.payload(threshold=org_settings().get("approvalThreshold"), year=year)

    if not has(p, "finance.payables"):
        data["payments"] = {k: v for k, v in data["payments"].items()
                            if k not in ("overdue", "ageing")}
        data["exposure"] = []
        data["distress"] = []
        data["exceptions"] = [e for e in data["exceptions"]
                              if e["kind"] not in ("exposure", "payment_overdue",
                                                   "duplicate_invoice")]
        data["restricted"] = ["payables"]
    return JsonResponse(data)


ENTITY_LABELS = {
    "dimension": "dimension values", "vendor": "vendors", "item": "items",
    "contract": "contracts", "po": "purchase orders", "grn": "goods receipts",
    "invoice": "invoices", "payment": "payments", "fx": "exchange rates",
}


@route(["GET", "POST"], perm="finance.sync")
def finance_import(request, p, body):
    """Load one entity from a NAV or Business Central export.

    GET reports what each feed last did. POST takes a file (multipart) or a
    JSON array, normalises it through the named source's adapter, and applies
    it. Preview-then-apply like the vendor register import: `dryRun` normalises
    and reports without writing, because a finance import that turns out to
    have matched 3% of vendors is one somebody needs to see before it lands.
    """
    if request.method == "GET":
        return JsonResponse({"feeds": finance_sync.sync_state(),
                             "sources": [{"key": a.key, "label": a.label}
                                         for a in finance_sync.ADAPTERS.values()],
                             "entities": [{"key": k, "label": v} for k, v in ENTITY_LABELS.items()],
                             "connection": finance_sync.bc_config(),
                             "rows": _counts()})

    source = (request.POST.get("source") or body.get("source") or "nav").strip().lower()
    entity = (request.POST.get("entity") or body.get("entity") or "").strip().lower()
    dry = str(request.POST.get("dryRun") or body.get("dryRun") or "").lower() in ("1", "true", "yes")

    if source not in finance_sync.ADAPTERS:
        return err(f"Unknown source {source!r}.")
    if entity not in finance_sync.ENTITIES:
        return err(f"Unknown entity {entity!r}. One of: {', '.join(finance_sync.ENTITIES)}.")

    upload = request.FILES.get("file")
    if upload:
        try:
            rows = finance_sync.rows_from_upload(upload)
        except Exception as exc:                                  # noqa: BLE001
            return err(f"Could not read that file: {exc}", 400)
    elif isinstance(body.get("rows"), list):
        rows = body["rows"]
    else:
        return err("Attach an export file, or post {rows: [...]}.")

    if not rows:
        return err("That export has no rows in it.")

    normalised = finance_sync.adapter_for(source).normalise(entity, rows)
    if dry:
        return JsonResponse({
            "dryRun": True, "source": source, "entity": entity,
            "read": len(rows), "recognised": len(normalised),
            "unrecognised": len(rows) - len(normalised),
            "sample": normalised[:5],
        })

    try:
        report = finance_sync.sync(source, entity, rows)
    except Exception as exc:                                      # noqa: BLE001
        return err(f"The import failed: {exc}", 400)

    log(p, "Finance ledger imported",
        f"{report['written']} {ENTITY_LABELS[entity]} from "
        f"{finance_sync.adapter_for(source).label}, of {report['seen']} read"
        + (f"; {report['unlinked']} could not be linked to anything held here" if report["unlinked"] else "")
        + (f"; {len(report['skipped'])} skipped" if report["skipped"] else "") + ".")

    return JsonResponse({**report, "source": source, "entity": entity,
                         "feeds": finance_sync.sync_state(), "rows": _counts()})


def _counts():
    return {"contracts": Contract.objects.count(), "orders": PurchaseOrder.objects.count(),
            "receipts": GoodsReceipt.objects.count(), "invoices": Invoice.objects.count(),
            "payments": Payment.objects.count()}


@route(["GET"], perm="page.finance")
def finance_exceptions(request, p, body):
    """The eight rules, on demand. The same list the sweep notifies from."""
    found = finance.exceptions(now_ms(), org_settings().get("approvalThreshold"))
    if not has(p, "finance.payables"):
        found = [e for e in found
                 if e["kind"] not in ("exposure", "payment_overdue", "duplicate_invoice")]
    return JsonResponse({"exceptions": found, "at": now_ms()})


@route(["POST"], perm="finance.sync")
def finance_pull(request, p, body):
    """Pull live from Business Central rather than from an uploaded export.

    One entity with `entity`, or the whole ledger in dependency order without
    it. Refuses clearly when the connection is not configured: "nothing came
    back" and "nobody told me where to look" are different problems and only
    one of them is worth investigating in the ledger.
    """
    entity = (body.get("entity") or "").strip().lower()
    cfg = finance_sync.bc_config()
    if not cfg["configured"]:
        return err("Business Central is not connected — missing "
                   + ", ".join(cfg["missing"])
                   + ". Set them in the server environment, or upload an export instead.", 409)

    if entity and entity not in finance_sync.ENTITIES:
        return err(f"Unknown entity {entity!r}.")

    try:
        report = (finance_sync.pull(entity) if entity else finance_sync.pull_all())
    except Exception as exc:                                      # noqa: BLE001
        return err(f"The pull failed: {exc}", 502)

    detail = (f"{entity or 'all feeds'} pulled live from Business Central. "
              + ", ".join(f"{k}: {v.get('written', v.get('error', '?'))}"
                          for k, v in (report if not entity else {entity: report}).items()))
    log(p, "Finance ledger pulled", detail[:400])
    return JsonResponse({"ok": True, "report": report,
                         "feeds": finance_sync.sync_state(), "rows": _counts()})


@route(["GET"], perm="page.tenders")
def item_search(request, p, body):
    """The material master, searched. Feeds the line-item picker on the tender form.

    A search endpoint rather than a slice of the bootstrap payload: the item
    master runs to thousands of rows in most ledgers, it changes on its own
    schedule, and one screen wants it. Blocked items are excluded from the
    picker but stay in the database, because a discontinued item still appears
    on the tenders that bought it and its price history is still history.
    """
    from .models import Item
    q = (request.GET.get("q") or "").strip()
    qs = Item.objects.filter(blocked=False)
    if q:
        qs = qs.filter(Q(code__icontains=q) | Q(description__icontains=q)
                       | Q(description2__icontains=q) | Q(category__icontains=q))
    rows = [{"code": i.code, "label": i.label, "uom": i.uom, "category": i.category,
             "unitCost": i.unit_cost, "currency": i.currency}
            for i in qs.order_by("description")[:40]]
    return JsonResponse({"items": rows, "total": Item.objects.filter(blocked=False).count(),
                         "query": q})


@route(["GET"], perm="page.tenders")
def item_history(request, p, body):
    """What this item has actually been awarded at, over time.

    The unit-price trend the Finance page could not draw before items existed:
    with a code on the line, the same oven bought in three tenders is three
    points on one series instead of three unrelated free-text descriptions.
    """
    from . import pricehistory
    code = (request.GET.get("code") or "").strip()
    if not code:
        return err("Name an item code to look up.")
    return JsonResponse(pricehistory.item_prices(code))


@route(["GET"], perm="tender.create")
def baseline_suggestion(request, p, body):
    """What the organisation was paying in a category, for the tender form.

    Guarded by `tender.create` rather than a finance capability: this is a
    drafting aid, and the person drafting is the person who needs it. It returns
    prior *contract* values only — never an invoice, never a payment — so it
    cannot become a side channel onto payables for somebody without
    `finance.payables`.
    """
    from . import pricehistory
    category = (request.GET.get("category") or "").strip()
    supplier = (request.GET.get("supplierId") or "").strip() or None
    if not category:
        return err("Name a category to look up.")
    s = pricehistory.suggest(category, supplier_id=supplier)
    return JsonResponse({"category": category, "suggestion": s})


@route(["GET", "POST"], perm="finance.baseline")
def baseline_backfill(request, p, body):
    """Measure the historical record against the ledger it arrived with.

    GET previews: every awarded tender with no baseline, what history would
    propose for it, and what that would do to the saving. POST adopts the ones
    the operator picked.

    Preview-then-adopt, and adopt-what-you-saw: the amounts applied are the ones
    sent back from the preview, not a recomputation at write time. A savings
    figure whose basis moved between the screen and the database is a figure
    nobody signed off.
    """
    from . import pricehistory
    if request.method == "GET":
        return JsonResponse({"coverage": pricehistory.coverage(),
                             "candidates": pricehistory.backfill_candidates()})

    picks = body.get("picks")
    if not isinstance(picks, list) or not picks:
        return err("Pick at least one tender to apply a baseline to.")
    applied, skipped = pricehistory.apply_baselines(picks, p["name"])
    if applied:
        total = sum(a["amount"] for a in applied)
        log(p, "Baselines adopted from ledger history",
            f"{len(applied)} awarded tender(s) given a prior price from the finance "
            f"ledger, {fmt_money(total)} of baseline in total. "
            f"Every one records the contracts it came from.")
    return JsonResponse({"applied": applied, "skipped": skipped,
                         "coverage": pricehistory.coverage()})
