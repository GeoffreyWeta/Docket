"""DOCKET API.

Access model: the caller presents a bearer token, which resolves to a domain
identity carrying a set of capabilities — the role's defaults plus or minus
whatever an administrator has changed for that person (see permissions.py).
Endpoints declare the capability they need; sealing and blind scoring are
enforced HERE, at serialization time — not in the client:

  * before the recorded opening, buyer roles see only that a bid exists;
  * evaluators only ever receive their own scores;
  * suppliers see only tenders they're invited to (post-publication), their
    own bid, their own letter, and anonymised answered clarifications;
  * the supplier-side AI review prompt is built server-side and never
    includes the buyer's budget ceiling.
"""
import json

from django.db import transaction
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

from django.conf import settings
from django.http import HttpResponse

from . import ai
from .models import (ActionToken as ActionTokenModel, AuctionBid, AuthToken, Bid,
                     Clarification, Document, Event,
                     Notification, Persona, Supplier, Tender)
from .notify import notify_perm, notify_supplier, notify_suppliers
from .permissions import has
from .seed import ORG, seed_all
from .tasks import maybe_sweep
from .taxonomy import ALL_CATEGORIES, canonical, family_for
from .taxonomy import tree as taxonomy_tree
from .util import (record_event, seal_bytes, seal_json, unseal_bytes,
                   unseal_json, verify_chain)
from .util import (abnormally_low, award_letter, comm_score, eff_status,
                   fmt_compact, fmt_money, now_ms, regret_letter, rid,
                   tech_score, total_score, variance_flags)

PERSONA_SUPPLIERS = ["s2", "s3", "s7"]                 # supplier personas exposed in the demo switcher


# ---------------- plumbing ----------------

def err(msg, status=400):
    return JsonResponse({"error": msg}, status=status)


def get_persona(request):
    """Resolve the caller's domain identity from their bearer token."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    tok = (AuthToken.objects
           .select_related("user__profile__persona", "user__profile__supplier")
           .filter(key=auth[7:]).first())
    if not tok or not hasattr(tok.user, "profile") or not tok.user.is_active:
        return None
    prof = tok.user.profile
    if not prof.persona_id and not prof.supplier_id:
        # An administration-console account has no domain identity, so there is
        # nobody for it to act as here. Changing who may do a thing and doing it
        # are different acts, and this is the line between them: a console token
        # cannot publish, award or score, whatever else it can reach.
        return None
    if now_ms() - tok.last_used > 60_000:
        tok.last_used = now_ms()
        tok.save(update_fields=["last_used"])
    identity = tok.user.profile.identity
    identity["userId"] = tok.user_id
    return identity


def route(methods, roles=None, perm=None):
    """Small view decorator: method check, persona resolution, authorisation, JSON body.

    `perm` is the capability the endpoint needs (see permissions.py) and is the
    normal case: it respects both the role's defaults and anything an
    administrator has granted or withdrawn for this person. `roles` remains for
    the handful of endpoints where the distinction is structural rather than a
    capability — a vendor's own bid room is not something a buyer can be granted.
    """
    def deco(fn):
        @csrf_exempt
        def wrap(request, *args, **kwargs):
            if request.method not in methods:
                return err("Method not allowed", 405)
            persona = get_persona(request)
            if not persona:
                return err("Not signed in.", 401)
            if roles and persona["role"] not in roles:
                return err("Not allowed for this role.", 403)
            if perm and not has(persona, perm):
                return err("You don't have permission to do that.", 403)
            body = {}
            if request.content_type and request.content_type.startswith("multipart/"):
                pass  # uploads: use request.FILES / request.POST in the view
            elif request.body:
                try:
                    body = json.loads(request.body)
                except (ValueError, TypeError):
                    return err("Invalid JSON body.")
            return fn(request, persona, body, *args, **kwargs)
        return wrap
    return deco


def log(persona, action, detail, tender_id=None):
    record_event(actor=persona["name"], role=persona["role"], action=action,
                 tender_id=tender_id, detail=detail)


# ---------------- serialization (sealing enforced here) ----------------

def supplier_view(s, full=False):
    """The register runs to about 1,400 vendors, so the default is the light
    record: what a list, a filter and a scorecard hold-out decision need. The
    document list alone is half the weight of the whole payload and is only
    read when someone actually opens a vendor, so it travels on request (see
    supplier_detail) rather than on every refresh.

    `full` is used for the handful of vendors attached to a tender the caller
    can see: those need their documents for compliance scoring, and for the
    vendor's own record when a supplier signs in."""
    d = {
        "id": s.id, "name": s.name, "category": s.category, "subcategory": s.subcategory,
        "family": family_for(s.category), "location": s.location,
        "rating": s.rating, "prequalified": s.prequalified, "perf": s.perf,
        "contactEmail": s.contact_email, "registeredAt": s.registered_at,
        "rejectedReason": s.rejected_reason, "invitedAt": s.invited_at,
        "code": s.code, "docCount": len(s.docs or []),
    }
    if not full:
        d["docs"] = []
        return d
    d.update({
        "docs": s.docs,
        "classification": s.classification, "contactPerson": s.contact_person,
        "phone": s.phone, "address": s.address, "paymentTerms": s.payment_terms,
        "registry": s.registry,
    })
    return d


def tender_view(t, p):
    if p["role"] == "supplier":
        if p["supplierId"] not in t.invited or t.status in ("draft", "approval"):
            return None
    d = {
        "id": t.id, "ref": t.ref, "title": t.title, "type": t.ttype, "category": t.category,
        "family": family_for(t.category),
        "budget": t.budget, "status": t.status, "publishedAt": t.published_at, "deadline": t.deadline,
        "openedAt": t.opened_at, "awardedAt": t.awarded_at, "awardedTo": t.awarded_to,
        "awardedAmount": t.awarded_amount, "techWeight": t.tech_weight, "commWeight": t.comm_weight,
        "scope": t.scope, "criteria": t.criteria, "lines": t.lines, "addenda": t.addenda,
        "invited": t.invited, "awardRec": None, "awardMemo": None, "letters": None,
        "twoStage": t.two_stage, "techOpenedAt": t.tech_opened_at, "techThreshold": t.tech_threshold,
        "minDecrement": t.auction_min_decrement,
        # Ownership and the savings basis. A supplier is told neither: which
        # buyer is carrying a tender, and what the organisation was paying
        # before it went to market, are both facts a bidder could price against.
        "ownerId": None, "baseline": None, "baselineSource": None,
    }
    if p["role"] != "supplier":
        d["ownerId"] = t.owner_id
        d["baseline"] = t.baseline
        d["baselineSource"] = t.baseline_source or None
        # How this spend is coded for finance reporting. Withheld from suppliers
        # with everything else on this branch: which cost centre is funding a
        # purchase is an internal fact, and a bidder who knows a project has its
        # own budget line prices against that budget line.
        d["dimensions"] = t.dims()
    if has(p, "award.see_recommendation"):
        d["awardRec"] = t.award_rec
        d["awardMemo"] = t.award_memo or None
        d["letters"] = t.letters
        d["coi"] = t.coi or {}
    elif p["role"] != "supplier":
        d["awardMemo"] = t.award_memo or None
        d["coi"] = t.coi or {}
    else:  # supplier: own letter only
        if t.letters and p["supplierId"] in t.letters:
            d["letters"] = {p["supplierId"]: t.letters[p["supplierId"]]}
    return d


def bid_view(b, t, p):
    opened = bool(t.opened_at)
    tech_open = bool(t.tech_opened_at)
    base = {"id": b.id, "tenderId": b.tender_id, "supplierId": b.supplier_id,
            "submittedAt": b.submitted_at, "disqualified": b.disqualified}
    if p["role"] == "supplier":
        if b.supplier_id != p["supplierId"]:
            return None
        if b.sealed_blob is not None:  # own bid, still sealed: echo what they submitted
            data = unseal_json(b.sealed_blob)
            return {**base, "amount": data["amount"], "lines": data["lines"], "sealed": True, "scores": {}}
        return {**base, "amount": b.amount, "lines": b.lines, "sealed": not opened, "scores": {}}
    if not opened and not tech_open:
        return {**base, "sealed": True}
    if has(p, "bid.see_all_scores"):
        scores, notes = b.scores, (b.notes or {})
    else:
        # blind by default: a scorer receives their own marks and nobody else's
        scores = {p["id"]: (b.scores or {}).get(p["id"], {})}
        notes = {p["id"]: (b.notes or {}).get(p["id"], "")}
    if not opened:  # two-stage, technical phase: scores flow, prices stay sealed
        return {**base, "sealed": False, "commercialSealed": True, "scores": scores, "notes": notes}
    if b.disqualified:  # commercial envelope was returned unopened — there is no amount, ever
        return {**base, "sealed": False, "commercialSealed": True, "scores": scores, "notes": notes}
    return {**base, "amount": b.amount, "lines": b.lines, "sealed": False,
            "commercialSealed": False, "scores": scores, "notes": notes}


def doc_visible(d, t, p):
    if d.kind == "tender":
        return True  # tender itself already role-filtered before this is called
    # bid documents: sealed until the relevant recorded opening
    if p["role"] == "supplier":
        return d.supplier_id == p["supplierId"]
    if d.envelope == "technical":
        return bool(t.opened_at or t.tech_opened_at)
    if not t.opened_at:
        return False
    if Bid.objects.filter(tender=t, supplier_id=d.supplier_id, disqualified=True).exists():
        return False  # returned unopened — stays that way
    return True


def doc_view(d):
    return {"id": d.id, "kind": d.kind, "tenderId": d.tender_id, "supplierId": d.supplier_id,
            "envelope": d.envelope, "name": d.name, "size": d.size,
            "uploadedBy": d.uploaded_by, "uploadedAt": d.uploaded_at}


def clar_view(c, p):
    if p["role"] == "supplier":
        if not c.a and c.supplier_id != p["supplierId"]:
            return None
        return {"id": c.id, "tenderId": c.tender_id, "q": c.q, "askedAt": c.asked_at,
                "a": c.a, "answeredAt": c.answered_at, "mine": c.supplier_id == p["supplierId"]}
    return {"id": c.id, "tenderId": c.tender_id, "supplierId": c.supplier_id, "q": c.q,
            "askedAt": c.asked_at, "a": c.a, "answeredAt": c.answered_at}


# ---------------- bootstrap ----------------

@route(["GET"])
def bootstrap(request, p, body):
    maybe_sweep()  # opportunistic, throttled, idempotent

    tenders = [tv for t in Tender.objects.all() if (tv := tender_view(t, p))]
    visible_ids = {t["id"] for t in tenders}

    bids = []
    for b in Bid.objects.select_related("tender"):
        if b.tender_id not in visible_ids:
            continue
        bv = bid_view(b, b.tender, p)
        if bv:
            bids.append(bv)

    clars = [cv for c in Clarification.objects.all()
             if c.tender_id in visible_ids and (cv := clar_view(c, p))]

    if p["role"] == "supplier":
        suppliers = [supplier_view(Supplier.objects.get(pk=p["supplierId"]), full=True)]
        events = []
    else:
        # every vendor attached to a visible tender, so evaluation and the
        # scorecards have the documents they score on
        deep = set()
        for t in Tender.objects.filter(id__in=visible_ids):
            deep.update(t.invited or [])
            if t.awarded_to:
                deep.add(t.awarded_to)
        deep.update(Bid.objects.filter(tender_id__in=visible_ids).values_list("supplier_id", flat=True))
        suppliers = [supplier_view(s, full=s.id in deep)
                     for s in Supplier.objects.all().order_by("name")]
        events = [{"id": e.id, "at": e.at, "actor": e.actor, "role": e.role, "action": e.action,
                   "tenderId": e.tender_id, "detail": e.detail} for e in Event.objects.all()[:400]]

    # The org chart travels with the payload: reporting lines change rarely and
    # every desk rollup needs them, so fetching them separately would be a round
    # trip per dashboard render for data that fits in a few hundred bytes.
    people = list(Persona.objects.select_related("manager").order_by("id"))
    users = [{"id": u.id, "name": u.name, "role": u.role, "title": u.title,
              "managerId": u.manager_id}
             for u in people]

    # Whose work this person may see rolled up. Derived server-side rather than
    # left to the client to walk: "who reports to me" decides what numbers a
    # manager is shown, and a client-side answer to that is a client-side
    # decision about visibility.
    me = Persona.objects.filter(pk=p["id"]).first()
    if me and has(p, "desk.see_reports"):
        reports = [x.id for x in me.descendants()]
    else:
        reports = []

    docs = []
    tmap = {t["id"]: Tender.objects.get(pk=t["id"]) for t in tenders}
    for d in Document.objects.filter(tender_id__in=visible_ids):
        if doc_visible(d, tmap[d.tender_id], p):
            docs.append(doc_view(d))
    if p["role"] == "supplier":
        docs += [doc_view(d) for d in Document.objects.filter(kind="supplier", supplier_id=p["supplierId"])]
    else:
        docs += [doc_view(d) for d in Document.objects.filter(kind="supplier")]

    notifs = [{"id": n.id, "at": n.at, "subject": n.subject, "body": n.body,
               "tenderId": n.tender_id, "read": n.read}
              for n in Notification.objects.filter(user_id=p["userId"])[:50]]

    return JsonResponse({
        "org": org_settings(), "me": p, "users": users, "reports": reports,
        "taxonomy": taxonomy_tree(vendor_leaf_counts()) if p["role"] != "supplier" else [],
        "suppliers": suppliers, "tenders": tenders, "bids": bids,
        "clarifications": clars, "events": events, "documents": docs,
        "notifications": notifs,
        "demoLogin": settings.DEMO_LOGIN,
    })


def vendor_leaf_counts():
    """{(category, subcategory): n} across the register — one grouped query, so
    the taxonomy can show how many vendors sit under each leaf without the
    client counting 1,400 records it was never sent."""
    from django.db.models import Count
    rows = (Supplier.objects.values("category", "subcategory")
            .annotate(n=Count("id")))
    return {(r["category"], r["subcategory"]): r["n"] for r in rows}


# ---------------- org settings ----------------

# The values a tender can be coded to for finance reporting. Configuration
# rather than code: a company reorganises its departments and opens a region
# more often than it deploys, and a spend-by-department chart that needs a
# release to learn about a new department is a chart that goes stale quietly.
# An empty list means the dimension is not in use and the tender form omits it.
DEFAULT_DIMENSIONS = {
    "department": [], "cost_centre": [], "project": [], "region": [], "funding_source": [],
}

DEFAULT_SETTINGS = {"approvalThreshold": 50_000_000, "dimensions": DEFAULT_DIMENSIONS}


def org_settings():
    from .models import OrgSetting
    row = OrgSetting.objects.filter(pk=1).first()
    return {**DEFAULT_SETTINGS, **ORG, **((row.data if row else {}) or {})}


def org_name():
    return org_settings()["name"]


def ref_prefix():
    short = org_settings().get("short") or org_settings()["name"]
    p = "".join(c for c in short.upper() if c.isalnum())[:3]
    return p or "ORG"


@route(["GET", "PATCH", "POST"])
def settings_view(request, p, body):
    from .models import OrgSetting
    if request.method == "GET":
        return JsonResponse(org_settings())
    changes = {}
    if "approvalThreshold" in body:
        if not has(p, "settings.threshold"):
            return err("Only the approver can change the approval matrix.", 403)
        try:
            threshold = int(body.get("approvalThreshold"))
            if threshold < 0:
                raise ValueError
        except (TypeError, ValueError):
            return err("Enter a valid threshold amount.")
        changes["approvalThreshold"] = threshold
    if "name" in body or "short" in body:
        if not has(p, "settings.rename"):
            return err("Only procurement or the approver can rename the workspace.", 403)
        name = str(body.get("name", "")).strip()[:120]
        if "name" in body and len(name) < 2:
            return err("Enter the organisation's name.")
        if name:
            changes["name"] = name
        short = str(body.get("short", "")).strip()[:24]
        if short:
            changes["short"] = short
        elif name:
            changes["short"] = name.split()[0][:24]
    if "dimensions" in body:
        if not has(p, "finance.dimensions"):
            return err("You don't have permission to change the spend dimensions.", 403)
        given = body.get("dimensions")
        if not isinstance(given, dict):
            return err("Dimensions must be a map of dimension key to allowed values.")
        cleaned = {}
        for key in DEFAULT_DIMENSIONS:
            vals = given.get(key, (org_settings().get("dimensions") or {}).get(key) or [])
            if not isinstance(vals, list):
                return err(f"The {key} list must be a list of values.")
            # Deduplicated, trimmed, order preserved — the order is the order
            # they appear in the tender form, and somebody chose it.
            seen, out = set(), []
            for v in vals:
                s = str(v).strip()[:80]
                if s and s.lower() not in seen:
                    seen.add(s.lower())
                    out.append(s)
            cleaned[key] = out[:200]
        changes["dimensions"] = cleaned
    if not changes:
        return err("Nothing to change.")
    row, _ = OrgSetting.objects.get_or_create(pk=1)
    row.data = {**(row.data or {}), **changes}
    row.save()
    if "approvalThreshold" in changes:
        log(p, "Approval matrix changed",
            f"Publication above {fmt_compact(changes['approvalThreshold'])} now requires approver sign-off; below publishes directly.")
    if "name" in changes or "short" in changes:
        log(p, "Workspace renamed",
            f"The organisation is now \"{org_name()}\". New tender references use the {ref_prefix()}- prefix; existing references are unchanged.")
    if "dimensions" in changes:
        log(p, "Spend dimensions changed",
            ", ".join(f"{k}: {len(v)} value(s)" for k, v in changes["dimensions"].items())
            + ". Tenders already coded to a removed value keep it — the code is what was true when it was raised.")
    return JsonResponse(org_settings())


def _publish(t, p):
    t.status = "published"
    t.published_at = now_ms()
    t.save()
    log(p, "Published", f"{t.title} released to {len(t.invited)} invited supplier(s).", t.id)
    notify_suppliers(t.invited, f"Invitation to tender: {t.title}",
                     f"{org_name()} invites your sealed bid for {t.ref} — {t.title}. "
                     f"Deadline: see the bid room for full terms.", t.id)


def _route_submission(t, p):
    """The actual approval matrix: at/above the threshold → approver; below → publish now."""
    threshold = org_settings()["approvalThreshold"]
    if t.budget >= threshold:
        t.status = "approval"
        t.save()
        log(p, "Submitted for approval",
            f"Routed to the approver under the approval matrix (\u2265{fmt_compact(threshold)}).", t.id)
        notify_perm("tender.publish_decision", f"Publication approval needed: {t.title}",
                    f"{t.ref} at {fmt_compact(t.budget)} needs your sign-off before invitations go out.", t.id)
    else:
        _publish(t, p)


# ---------------- tenders ----------------

def _apply_tender_payload(t, body):
    t.title = str(body.get("title", "")).strip()
    t.ttype = body.get("type", "RFQ")
    if t.ttype not in ("RFI", "RFQ", "RFP", "AUC"):
        t.ttype = "RFQ"
    t.two_stage = bool(body.get("twoStage")) and t.ttype != "AUC"
    try:
        t.tech_threshold = max(0, min(100, int(body.get("techThreshold", 70) or 70)))
    except (TypeError, ValueError):
        t.tech_threshold = 70
    try:
        t.auction_min_decrement = max(0, int(body.get("minDecrement", 0) or 0))
    except (TypeError, ValueError):
        t.auction_min_decrement = 0

    # `canonical` accepts the seven words the old dropdown offered, so a draft
    # saved in a browser tab before this shipped still lands in a real category
    # instead of creating a twenty-fourth one nothing else counts.
    t.category = canonical(body.get("category", ""))
    t.budget = int(body.get("budget", 0) or 0)
    # What this was costing before. Optional, and left null rather than defaulted
    # to the budget: a baseline that quietly equals the ceiling would make every
    # saving read as zero and look like a calculation bug.
    try:
        base = int(body.get("baseline") or 0)
    except (TypeError, ValueError):
        base = 0
    t.baseline = base if base > 0 else None
    t.baseline_source = str(body.get("baselineSource", "")).strip()[:200] if t.baseline else ""
    t.deadline = int(body.get("deadline", 0) or 0)
    t.tech_weight = int(body.get("techWeight", 70))
    t.comm_weight = 100 - t.tech_weight
    t.scope = str(body.get("scope", "")).strip()
    t.criteria = [{"id": c.get("id") or rid("c"), "name": str(c.get("name", "")), "weight": int(c.get("weight", 0) or 0)}
                  for c in body.get("criteria", [])]
    t.lines = [{"id": l.get("id") or rid("l"), "desc": str(l["desc"]).strip(),
                "qty": int(l.get("qty", 0) or 0), "unit": str(l.get("unit", "unit")).strip() or "unit"}
               for l in body.get("lines", []) if str(l.get("desc", "")).strip()]
    t.invited = [sid for sid in body.get("invited", []) if Supplier.objects.filter(pk=sid).exists()]

    # Finance coding. Free text against a configured list rather than a foreign
    # key: the value recorded is what the department was called when the tender
    # was raised, and reorganising the list next year must not silently re-badge
    # last year's spend. Values outside the list are kept, not rejected — the
    # list is guidance for the form, and a tender blocked at submission because
    # somebody opened a new region on Monday helps nobody.
    dims = body.get("dimensions") or {}
    for key, _ in Tender.DIMENSIONS:
        setattr(t, key, str(dims.get(key, getattr(t, key, "")) or "").strip()[:120])

    if t.ttype == "AUC":  # price-only competition
        t.two_stage = False
        t.tech_weight, t.comm_weight = 0, 100
        t.criteria = []


def _validate_tender(t, submitting):
    if not t.title:
        return "A title is required."
    if submitting:
        if t.budget <= 0:
            return "Budget must be above zero."
        if t.deadline <= now_ms():
            return "The deadline must be in the future."
        if t.ttype == "AUC":
            if t.auction_min_decrement <= 0:
                return "Set a minimum decrement — how much each new bid must undercut by."
            if t.lines:
                return "Auctions run on a single lump-sum price — remove the line items."
        elif sum(c["weight"] for c in t.criteria) != 100:
            return "Criteria weights must total exactly 100%."
        if not t.invited:
            return "Invite at least one supplier."
        if any(l["qty"] <= 0 for l in t.lines):
            return "Every line item needs a quantity above zero."
    return None


@route(["POST"], perm="tender.create")
def tender_create(request, p, body):
    submitting = bool(body.get("submit"))
    t = Tender(id=rid("t"), status="draft", published_at=None, addenda=[])
    # Whoever drafts it owns it. Recorded at creation rather than inferred from
    # the audit chain later, because the person who first touches a tender and
    # the person carrying it are the same person exactly once — here.
    t.owner_id = p["id"] if p["role"] != "supplier" else None
    _apply_tender_payload(t, body)
    msg = _validate_tender(t, submitting)
    if msg:
        return err(msg)
    seq = Tender.objects.count() + 28
    t.ref = f"{ref_prefix()}-{t.ttype}-2026-{seq:03d}"
    t.save()
    if submitting:
        _route_submission(t, p)
    else:
        log(p, "Draft created", "Saved as draft.", t.id)
    return JsonResponse({"id": t.id})


@route(["PATCH", "POST"], perm="tender.edit")
def tender_update(request, p, body, tid):
    t = Tender.objects.filter(pk=tid).first()
    if not t:
        return err("Tender not found.", 404)
    if t.status != "draft":
        return err("Only drafts can be edited.", 409)
    submitting = bool(body.get("submit"))
    _apply_tender_payload(t, body)
    msg = _validate_tender(t, submitting)
    if msg:
        return err(msg)
    if submitting:
        t.save()
        _route_submission(t, p)
    else:
        t.status = "draft"
        t.save()
        log(p, "Draft updated", "Draft edited and saved.", t.id)
    return JsonResponse({"ok": True})


@route(["POST"], perm="tender.submit")
def tender_submit(request, p, body, tid):
    t = Tender.objects.filter(pk=tid).first()
    if not t:
        return err("Tender not found.", 404)
    if t.status != "draft":
        return err("Only drafts can be submitted.", 409)
    msg = _validate_tender(t, True)
    if msg:
        return err(msg)
    _route_submission(t, p)
    return JsonResponse({"ok": True})


@route(["POST"], perm="tender.publish_decision")
def publish_decision(request, p, body, tid):
    t = Tender.objects.filter(pk=tid).first()
    if not t:
        return err("Tender not found.", 404)
    if t.status != "approval":
        return err("This tender is not awaiting publication approval.", 409)
    if body.get("ok"):
        _publish(t, p)
    else:
        t.status = "draft"
        t.save()
        log(p, "Returned to draft", "Approver requested changes before publication.", t.id)
    return JsonResponse({"ok": True})


@route(["POST"], perm="tender.addendum")
def add_addendum(request, p, body, tid):
    t = Tender.objects.filter(pk=tid).first()
    if not t:
        return err("Tender not found.", 404)
    if eff_status(t) != "published":
        return err("Addenda can only be issued while a tender is open for bids.", 409)
    title = str(body.get("title", "")).strip()
    if not title:
        return err("An addendum needs a title.")
    seq = f"{len(t.addenda) + 1:02d}"
    t.addenda = t.addenda + [{"id": rid("a"), "at": now_ms(),
                              "title": f"Addendum {seq} — {title}",
                              "note": str(body.get("note", "")).strip()}]
    t.save()
    log(p, "Addendum issued", f"Addendum {seq} — {title}. New submissions must acknowledge it.", t.id)
    notify_suppliers(t.invited, f"Addendum issued: {t.title}",
                     f"Addendum {seq} — {title}. Review it in the bid room; new submissions must acknowledge it.",
                     t.id)
    return JsonResponse({"ok": True})


@route(["POST"], perm="bid.open")
def open_bids(request, p, body, tid):
    """The recorded opening. Three shapes:
    - reverse auction (ttype AUC): close the auction and materialise final standings as bids
    - two-stage tender, stage 1: unseal ONLY technical envelopes; prices stay ciphertext
    - two-stage tender, stage 2: unseal prices + commercial envelopes for technically
      compliant bidders; the rest are disqualified with their envelopes returned unopened
    - single-stage: unseal everything (original behaviour)
    """
    t = Tender.objects.filter(pk=tid).first()
    if not t:
        return err("Tender not found.", 404)
    from django.db import transaction as _tx

    if t.ttype == "AUC":
        if eff_status(t) != "closed":
            return err("The auction closes at its deadline — results are recorded after that.", 409)
        if t.opened_at:
            return err("Results are already recorded.", 409)
        standings = auction_standings(t)
        if not standings:
            return err("No auction bids were placed.", 409)
        with _tx.atomic():
            for st in standings:
                Bid.objects.update_or_create(
                    tender=t, supplier_id=st["supplierId"],
                    defaults={"id": rid("b"), "submitted_at": st["at"], "amount": st["amount"],
                              "lines": {}, "scores": {}},
                )
            t.opened_at = now_ms()
            t.status = "evaluation"
            t.save()
        log(p, "Auction closed — results recorded",
            f"{len(standings)} bidder(s); best price {fmt_compact(standings[0]['amount'])} after "
            f"{t.auction_bids.count()} price movements.", t.id)
        notify_perm("award.recommend", f"Auction concluded: {t.title}",
                    "Final standings are recorded and ready for an award recommendation.", t.id)
        return JsonResponse({"ok": True})

    if eff_status(t) != "closed" and not (t.two_stage and t.tech_opened_at and t.status == "evaluation"):
        return err("Bids can only be opened after the deadline seals them.", 409)
    n = t.bids.count()
    if not n:
        return err("There are no sealed bids to open.", 409)

    if t.two_stage and not t.tech_opened_at:
        # ---- stage 1: technical envelopes only ----
        with _tx.atomic():
            for d in Document.objects.select_for_update().filter(
                    tender=t, kind="bid", envelope="technical", encrypted=True):
                d.data = unseal_bytes(d.data)
                d.encrypted = False
                d.save(update_fields=["data", "encrypted"])
            t.tech_opened_at = now_ms()
            t.status = "evaluation"
            t.save()
        log(p, "Technical envelopes opened",
            f"{n} technical proposals opened for blind scoring. Commercial envelopes remain sealed "
            f"until technical evaluation concludes (threshold {t.tech_threshold}/100).", t.id)
        notify_perm("bid.score", f"Technical scoring open: {t.title}",
                    "Technical envelopes are open. Sign your conflict-of-interest declaration and score "
                    "the technical proposals — prices stay sealed until you're done.", t.id)
        return JsonResponse({"ok": True})

    if t.two_stage and t.tech_opened_at and not t.opened_at:
        # ---- stage 2: commercial envelopes for compliant bidders only ----
        try:
            threshold = int(body.get("threshold", t.tech_threshold))
        except (TypeError, ValueError):
            threshold = t.tech_threshold
        bids = list(Bid.objects.select_for_update().filter(tender=t))
        unscored = [b for b in bids if tech_score(t, b) is None]
        if unscored:
            return err(f"{len(unscored)} bid(s) have no technical scores yet — the commercial "
                       f"envelopes stay sealed until scoring is complete.", 409)
        passed, failed = [], []
        with _tx.atomic():
            for b in bids:
                if tech_score(t, b) >= threshold:
                    data = unseal_json(b.sealed_blob)
                    b.amount, b.lines, b.sealed_blob = data["amount"], data["lines"], None
                    b.save(update_fields=["amount", "lines", "sealed_blob"])
                    for d in Document.objects.select_for_update().filter(
                            tender=t, kind="bid", supplier_id=b.supplier_id, encrypted=True):
                        d.data = unseal_bytes(d.data)
                        d.encrypted = False
                        d.save(update_fields=["data", "encrypted"])
                    passed.append(b)
                else:
                    b.disqualified = True
                    b.save(update_fields=["disqualified"])
                    failed.append(b)
            t.tech_threshold = threshold
            t.opened_at = now_ms()
            t.save()
        names = {x.id: x.name for x in Supplier.objects.all()}
        log(p, "Commercial envelopes opened",
            f"{len(passed)} bidder(s) met the {threshold}/100 technical threshold; "
            f"{len(failed)} disqualified with commercial envelopes returned unopened"
            + (f" ({', '.join(names[b.supplier_id] for b in failed)})" if failed else "") + ".", t.id)
        for b in failed:
            notify_supplier(b.supplier_id, f"Technical evaluation outcome: {t.title}",
                            f"Your technical proposal did not meet the qualification threshold on {t.ref}. "
                            "Your commercial envelope was returned unopened — your pricing was never seen.", t.id)
        return JsonResponse({"ok": True})

    # ---- single-stage: unseal everything ----
    with _tx.atomic():
        for b in Bid.objects.select_for_update().filter(tender=t, sealed_blob__isnull=False):
            data = unseal_json(b.sealed_blob)
            b.amount, b.lines, b.sealed_blob = data["amount"], data["lines"], None
            b.save(update_fields=["amount", "lines", "sealed_blob"])
        for d in Document.objects.select_for_update().filter(tender=t, kind="bid", encrypted=True):
            d.data = unseal_bytes(d.data)
            d.encrypted = False
            d.save(update_fields=["data", "encrypted"])
        t.opened_at = now_ms()
        t.status = "evaluation"
        t.save()
    log(p, "Bid opening — seals broken", f"{n} bids opened before the evaluation panel; amounts recorded.", t.id)
    notify_perm("bid.score", f"Scoring open: {t.title}",
                f"The seals on {t.ref} were broken in a recorded opening. Sign your conflict-of-interest "
                f"declaration and score independently.", t.id)
    return JsonResponse({"ok": True})


@route(["POST"], perm="award.recommend")
def recommend_award(request, p, body, tid):
    t = Tender.objects.filter(pk=tid).first()
    if not t:
        return err("Tender not found.", 404)
    if t.status != "evaluation":
        return err("Awards can only be recommended during evaluation.", 409)
    if t.award_rec:
        return err("A recommendation is already with the approver.", 409)
    bids = list(t.bids.all())
    bid = next((b for b in bids if b.id == body.get("bidId")), None)
    if not bid:
        return err("Bid not found on this tender.", 404)
    if bid.disqualified:
        return err("That bidder was disqualified at technical evaluation — their commercial envelope was never opened.", 409)
    if bid.amount is None:
        return err("That bid's commercial envelope is still sealed.", 409)
    s = Supplier.objects.get(pk=bid.supplier_id)
    ts = tech_score(t, bid)
    cs = comm_score(bid, bids)
    tot = total_score(t, bid, bids)
    under = (t.budget - bid.amount) / t.budget * 100
    flags = []
    if abnormally_low(bid, bids):
        flags.append("pricing flagged as abnormally low — viability to be verified before contract")
    for c in variance_flags(t, bid):
        flags.append(f'panel split on "{c["name"]}"')
    memo = (
        f"Panel recommends {s.name} at {fmt_compact(bid.amount)} — {under:.1f}% under the "
        f"{fmt_compact(t.budget)} ceiling. Technical {f'{ts:.0f}' if ts is not None else '—'}/100, "
        f"commercial {cs:.0f}/100, weighted total {f'{tot:.1f}' if tot is not None else '—'}. "
        + (("Flags: " + "; ".join(flags) + ".") if flags else "No variance or pricing flags.")
    )
    t.award_rec = {"bidId": bid.id, "supplierId": bid.supplier_id, "amount": bid.amount,
                   "by": p["name"], "at": now_ms(), "memo": memo}
    t.save()
    log(p, "Award recommended", f"Panel recommendation for {s.name} routed to the approver.", t.id)
    notify_perm("award.decide", f"Award approval needed: {t.title}",
                f"The panel recommends {s.name} at {fmt_compact(bid.amount)} for {t.ref}. "
                f"The memo is waiting in your approvals queue.", t.id)
    return JsonResponse({"ok": True})


@route(["POST"], perm="award.recommend")
def withdraw_recommendation(request, p, body, tid):
    t = Tender.objects.filter(pk=tid).first()
    if not t or not t.award_rec:
        return err("No recommendation to withdraw.", 404)
    t.award_rec = None
    t.save()
    log(p, "Award recommendation withdrawn", "Recommendation pulled back by the panel chair before approval.", t.id)
    return JsonResponse({"ok": True})


@route(["POST"], perm="award.decide")
def award_decision(request, p, body, tid):
    t = Tender.objects.filter(pk=tid).first()
    if not t:
        return err("Tender not found.", 404)
    rec = t.award_rec
    if not rec or t.status != "evaluation":
        return err("No award recommendation is awaiting approval on this tender.", 409)
    if body.get("ok"):
        winner = Supplier.objects.get(pk=rec["supplierId"])
        t.status = "awarded"
        t.awarded_to = rec["supplierId"]
        t.awarded_amount = rec["amount"]
        t.awarded_at = now_ms()
        t.award_memo = rec["memo"]
        t.award_rec = None
        letters = {}
        for b in t.bids.all():
            name = Supplier.objects.get(pk=b.supplier_id).name
            letters[b.supplier_id] = (
                {"type": "award", "text": award_letter(org_name(), t, name, t.awarded_amount)}
                if b.supplier_id == t.awarded_to
                else {"type": "regret", "text": regret_letter(org_name(), t, name)}
            )
        t.letters = letters
        t.save()
        under = (t.budget - t.awarded_amount) / t.budget * 100
        log(p, "Award approved",
            f"Awarded to {winner.name} at {fmt_compact(t.awarded_amount)} — {under:.1f}% under budget. "
            f"Award and regret letters issued.", t.id)
        notify_perm("award.recommend", f"Award approved: {t.title}",
                    f"The award to {winner.name} was approved. Letters have been issued to all bidders.", t.id)
        for sid in letters:
            notify_supplier(sid, f"Outcome available: {t.title}",
                            f"The outcome of {t.ref} has been decided. Your letter is available in your portal.",
                            t.id)
    else:
        t.award_rec = None
        t.save()
        log(p, "Award recommendation returned", "Approver returned the recommendation to the panel with questions.", t.id)
        notify_perm("award.recommend", f"Recommendation returned: {t.title}",
                    "The approver returned the award recommendation to the panel with questions.", t.id)
    return JsonResponse({"ok": True})


# ---------------- bids ----------------

@route(["POST", "DELETE"], roles={"supplier"})
def bid_collection(request, p, body, tid):
    t = Tender.objects.filter(pk=tid).first()
    if not t:
        return err("Tender not found.", 404)
    me = p["supplierId"]
    if me not in t.invited:
        return err("You are not invited to this tender.", 403)
    if eff_status(t) != "published":
        return err("The deadline has passed — the tender is sealed.", 409)

    if request.method == "DELETE":
        deleted, _ = Bid.objects.filter(tender=t, supplier_id=me).delete()
        if not deleted:
            return err("You have no sealed bid to withdraw.", 404)
        log(p, "Sealed bid withdrawn by supplier", "Withdrawn before the deadline; a replacement may be submitted.", t.id)
        return JsonResponse({"ok": True})

    if Bid.objects.filter(tender=t, supplier_id=me).exists():
        return err("You already have a sealed bid — withdraw it first to replace it.", 409)
    acks = set(body.get("acks", []))
    missing = [a["title"] for a in t.addenda if a["id"] not in acks]
    if missing:
        return err("Acknowledge every addendum before sealing: " + "; ".join(missing))
    if t.lines:
        prices = body.get("lines", {}) or {}
        amount = 0
        clean_lines = {}
        for l in t.lines:
            try:
                price = int(prices.get(l["id"]))
            except (TypeError, ValueError):
                price = 0
            if price <= 0:
                return err(f'Every line needs a unit rate above zero ("{l["desc"]}").')
            amount += price * l["qty"]
            clean_lines[l["id"]] = price
    else:
        try:
            amount = int(body.get("amount", 0))
        except (TypeError, ValueError):
            amount = 0
        if amount <= 0:
            return err("The bid amount must be above zero.")
        clean_lines = {}
    if t.ttype == "AUC":
        return err("This is a live reverse auction — place bids in the auction room instead.", 409)
    if not Document.objects.filter(tender=t, kind="bid", supplier_id=me, envelope="technical").exists():
        return err("Upload your technical proposal before sealing the bid.")
    Bid.objects.create(id=rid("b"), tender=t, supplier_id=me, submitted_at=now_ms(),
                       amount=None, lines={}, scores={},
                       sealed_blob=seal_json({"amount": amount, "lines": clean_lines}))
    log(p, "Sealed bid received", "Contents sealed until the opening is logged.", t.id)
    notify_perm("bid.open", f"Sealed bid received: {t.title}",
                f"A sealed bid was received on {t.ref}. Contents stay sealed until the recorded opening.", t.id)
    return JsonResponse({"ok": True})


@route(["POST"], perm="bid.score")
def save_scores(request, p, body, bid_id):
    b = Bid.objects.select_related("tender").filter(pk=bid_id).first()
    if not b:
        return err("Bid not found.", 404)
    t = b.tender
    if not (t.opened_at or t.tech_opened_at) or t.status == "awarded":
        return err("Scoring is only open between the bid opening and the award.", 409)
    if p["id"] not in (t.coi or {}):
        return err("Sign the conflict-of-interest declaration for this tender before scoring.", 403)
    valid = {c["id"] for c in t.criteria}
    with transaction.atomic():
        b = Bid.objects.select_for_update().get(pk=bid_id)
        mine = dict((b.scores or {}).get(p["id"], {}))
        for cid, v in (body.get("scores") or {}).items():
            if cid not in valid:
                continue
            if v == "" or v is None:
                mine.pop(cid, None)
            else:
                try:
                    mine[cid] = max(0, min(10, float(v)))
                except (TypeError, ValueError):
                    continue
        scores = dict(b.scores or {})
        scores[p["id"]] = mine
        b.scores = scores
        update_fields = ["scores"]
        if "note" in body:
            notes = dict(b.notes or {})
            note = str(body.get("note") or "").strip()
            if note:
                notes[p["id"]] = note[:2000]
            else:
                notes.pop(p["id"], None)
            b.notes = notes
            update_fields.append("notes")
        b.save(update_fields=update_fields)
    return JsonResponse({"ok": True})


# ---------------- clarifications ----------------

@route(["POST"], roles={"supplier"})
def ask_clarification(request, p, body, tid):
    t = Tender.objects.filter(pk=tid).first()
    if not t:
        return err("Tender not found.", 404)
    if p["supplierId"] not in t.invited or eff_status(t) != "published":
        return err("Questions can only be asked on open tenders you're invited to.", 403)
    q = str(body.get("q", "")).strip()
    if not q:
        return err("The question is empty.")
    Clarification.objects.create(id=rid("q"), tender=t, supplier_id=p["supplierId"],
                                 q=q, asked_at=now_ms())
    log(p, "Clarification asked", "Question submitted to the buyer.", t.id)
    notify_perm("clarification.answer", f"New clarification: {t.title}",
                f"A supplier asked a question on {t.ref}. Answers are published to all invited suppliers.", t.id)
    return JsonResponse({"ok": True})


@route(["POST"], perm="clarification.answer")
def answer_clarification(request, p, body, cid):
    c = Clarification.objects.filter(pk=cid).first()
    if not c:
        return err("Clarification not found.", 404)
    a = str(body.get("a", "")).strip()
    if not a:
        return err("The answer is empty.")
    c.a = a
    c.answered_at = now_ms()
    c.save()
    log(p, "Clarification answered", "Published to all invited suppliers.", c.tender_id)
    t = c.tender
    notify_suppliers(t.invited, f"Clarification answered: {t.title}",
                     "The buyer published an answer to a clarification. All invited suppliers can view it.", t.id)
    return JsonResponse({"ok": True})


# ---------------- suppliers ----------------

@route(["GET"])
def supplier_detail(request, p, body, sid):
    """The full register record for one vendor: documents, contact, address,
    payment terms, TIN, bank name and the masked account. Fetched when someone
    opens a vendor rather than shipped for all 1,400 on every refresh.

    A supplier may read their own record and nothing else, which is the same
    rule the bootstrap payload follows."""
    if p["role"] == "supplier" and p["supplierId"] != sid:
        return err("Not yours to read.", 403)
    s = Supplier.objects.filter(pk=sid).first()
    if not s:
        return err("Supplier not found.", 404)
    return JsonResponse(supplier_view(s, full=True))


@route(["POST"], perm="supplier.prequalify")
def prequalify(request, p, body, sid):
    s = Supplier.objects.filter(pk=sid).first()
    if not s:
        return err("Supplier not found.", 404)
    ok = body.get("ok", True)
    if ok:
        s.prequalified = True
        s.rejected_reason = ""
        s.save(update_fields=["prequalified", "rejected_reason"])
        log(p, "Supplier prequalified", f"{s.name} approved onto the register after document review.")
        notify_supplier(s.id, "Prequalification approved",
                        f"{org_name()} has prequalified {s.name}. You can now be invited to tenders.")
    else:
        reason = str(body.get("reason") or "").strip()[:300]
        if not reason:
            return err("Give the vendor a reason — it's recorded and sent to them.")
        s.prequalified = False
        s.rejected_reason = reason
        s.save(update_fields=["prequalified", "rejected_reason"])
        log(p, "Prequalification declined", f"{s.name}: {reason}")
        notify_supplier(s.id, "Prequalification declined",
                        f"{org_name()} reviewed your registration and needs more before prequalifying you: {reason}")
    return JsonResponse({"ok": True})


# ---------------- reset ----------------

@route(["POST"])
def reset_demo(request, p, body):
    import secrets

    from django.contrib.auth.models import User
    username = User.objects.get(pk=p["userId"]).username
    seed_all()
    user = User.objects.filter(username=username).select_related("profile").first()
    # Not part of the seed, or left without a domain identity by it (an
    # administrator's persona goes with the reset): sign in again.
    if not user or not hasattr(user, "profile") or not (user.profile.persona_id or user.profile.supplier_id):
        return JsonResponse({"ok": True, "token": None})
    tok = AuthToken.objects.create(key=secrets.token_hex(32), user=user, created=now_ms())
    return JsonResponse({"ok": True, "token": tok.key, "me": user.profile.identity})


# ---------------- AI ----------------

def _ai_guard(fn):
    def wrap(request, p, body, *args, **kwargs):
        try:
            return fn(request, p, body, *args, **kwargs)
        except ai.AIUnavailable as e:
            return err(str(e), 503)
        except Exception:
            return err("The drafting service is unreachable right now. Try again in a moment.", 502)
    return wrap


@route(["POST"], perm="ai.use")
@_ai_guard
def ai_scope(request, p, body):
    title = str(body.get("title", "")).strip() or "supply tender"
    category = str(body.get("category", "")).strip()
    lines = [str(l).strip() for l in body.get("lines", []) if str(l).strip()]
    hint = f" Priced line items: {'; '.join(lines)}." if lines else ""
    text = ai.ask(
        f'Draft a scope-of-work paragraph (70\u2013100 words, plain prose, no headings) for a procurement tender by a '
        f'multi-brand restaurant group operating ~128 stores. Title: "{title}". Category: {category}.{hint} '
        f'Be specific about deliverables, service levels and compliance expectations. Neutral, formal tone.'
    )
    return JsonResponse({"text": text})


@route(["POST"], perm="ai.use")
@_ai_guard
def ai_criteria(request, p, body):
    title = str(body.get("title", "")).strip() or "supply tender"
    category = str(body.get("category", "")).strip()
    scope = str(body.get("scope", "")).strip() or "not written yet"
    arr = ai.ask_json(
        f'Suggest evaluation criteria for a procurement tender. Title: "{title}". Category: {category}. Scope: {scope}\n'
        f'Return a JSON array of 3\u20135 objects, each {{"name": string (max 6 words), "weight": integer}}. '
        f'Weights are the technical-envelope split and must sum to exactly 100. Order by weight, highest first. '
        f'Criteria must be specific to this purchase, not generic.'
    )
    if not (isinstance(arr, list) and arr and all(c.get("name") and int(c.get("weight", 0)) > 0 for c in arr)):
        return err("The AI returned an unusable criteria set — try again.", 502)
    if sum(int(c["weight"]) for c in arr) != 100:
        return err("The AI's weights didn't sum to 100 — try again.", 502)
    return JsonResponse({"criteria": [{"name": str(c["name"]), "weight": int(c["weight"])} for c in arr]})


@route(["POST"], perm="ai.use")
@_ai_guard
def ai_clar_answer(request, p, body, cid):
    c = Clarification.objects.select_related("tender").filter(pk=cid).first()
    if not c:
        return err("Clarification not found.", 404)
    t = c.tender
    text = ai.ask(
        f'You draft clarification answers for a buyer running a tender. Tender: "{t.title}". Scope: {t.scope}\n'
        f'Supplier question: "{c.q}"\n\n'
        f"Draft a clear, decision-making answer in 2\u20134 sentences that the buyer can publish to all invited suppliers. "
        f"Where the scope doesn't settle the question, make one sensible, clearly stated ruling rather than hedging. "
        f"Formal but plain tone. Answer only — no preamble."
    )
    return JsonResponse({"text": text})


@route(["POST"], perm="ai.use")
@_ai_guard
def ai_brief(request, p, body, tid):
    t = Tender.objects.filter(pk=tid).first()
    if not t or not t.opened_at:
        return err("The brief is available once bids are opened.", 409)
    bids = list(t.bids.all())
    rows = []
    for b in bids:
        s = Supplier.objects.get(pk=b.supplier_id)
        ts = tech_score(t, b)
        rows.append(
            f"{s.name}: bid {fmt_money(b.amount)} (budget {fmt_money(t.budget)}); "
            f"avg technical score {f'{ts:.0f}/100' if ts is not None else 'not yet scored'}; "
            f"supplier on-time delivery {s.perf.get('onTime')}%, quality {s.perf.get('quality')}%."
        )
    text = ai.ask(
        f'You are advising a procurement evaluation panel. Tender: "{t.title}". Scope: {t.scope}\n'
        f"Criteria weights: {', '.join(c['name'] + ' ' + str(c['weight']) + '%' for c in t.criteria)}. "
        f"Split: {t.tech_weight}% technical / {t.comm_weight}% commercial.\nBids:\n" + "\n".join(rows) +
        "\n\nWrite a crisp comparison brief (max 180 words): relative strengths, risks (including any abnormally low "
        "pricing), and what the panel should verify before awarding. Do not pick a winner. Plain prose, no headings, "
        "no markdown."
    )
    return JsonResponse({"text": text})


@route(["POST"], roles={"supplier"})
@_ai_guard
def ai_bid_review(request, p, body, tid):
    """Advisory review for the supplier's draft bid. Deliberately NEVER includes the buyer's budget."""
    t = Tender.objects.filter(pk=tid).first()
    if not t or p["supplierId"] not in t.invited:
        return err("Tender not found.", 404)
    if t.lines:
        prices = body.get("lines", {}) or {}
        total = 0
        parts = []
        for l in t.lines:
            try:
                v = int(prices.get(l["id"]))
            except (TypeError, ValueError):
                v = 0
            if v > 0:
                total += v * l["qty"]
                parts.append(f"{l['desc']}: {fmt_money(v)} per {l['unit']} \u00d7 {l['qty']:,}")
            else:
                parts.append(f"{l['desc']}: NOT PRICED \u00d7 {l['qty']:,}")
        pricing = "\n".join(parts) + f"\nRunning total: {fmt_money(total)}"
    else:
        try:
            amt = int(body.get("amount", 0))
        except (TypeError, ValueError):
            amt = 0
        pricing = f"Lump sum: {fmt_money(amt) if amt > 0 else 'NOT ENTERED'}"
    missing = [str(x) for x in body.get("missing", [])] or ["none"]
    text = ai.ask(
        f'You advise a supplier finalising a sealed tender bid. You work for the supplier only — be practical and candid.\n'
        f'Tender: "{t.title}". Scope: {t.scope}\n'
        f"Published criteria: {', '.join(c['name'] + ' ' + str(c['weight']) + '%' for c in t.criteria)} "
        f"({t.tech_weight}% technical / {t.comm_weight}% commercial).\n"
        f"Addenda in force: {' | '.join(a['title'] + ' — ' + a.get('note', '') for a in t.addenda) or 'none'}.\n"
        f"Their draft pricing:\n{pricing}\nOutstanding checklist items: {'; '.join(missing)}.\n\n"
        f"In max 120 words: flag anything incomplete, anything an addendum changes about their pricing, and one or two "
        f"things worth double-checking against the criteria before sealing. Plain prose, no headings, no markdown."
    )
    return JsonResponse({"text": text})


@route(["POST"], perm="ai.use")
@_ai_guard
def ai_insights(request, p, body):
    tenders = list(Tender.objects.all())
    awarded = [t for t in tenders if t.status == "awarded"]
    savings = sum(t.budget - t.awarded_amount for t in awarded)
    cycles = [(t.awarded_at - t.published_at) / 86_400_000 for t in awarded if t.published_at and t.awarded_at]
    outliers, splits = [], []
    for t in tenders:
        if not t.opened_at:
            continue
        bids = list(t.bids.all())
        for b in bids:
            if abnormally_low(b, bids):
                outliers.append(f'{Supplier.objects.get(pk=b.supplier_id).name} on "{t.title}"')
            for c in variance_flags(t, b):
                splits.append(f'"{c["name"]}" for {Supplier.objects.get(pk=b.supplier_id).name}')
    expiring = sum(
        1 for s in Supplier.objects.all() for doc in s.docs
        if doc["expiry"] - now_ms() <= 60 * 86_400_000
    )
    by_cat = {}
    for t in awarded:
        by_cat[t.category] = by_cat.get(t.category, 0) + t.awarded_amount
    facts = "\n".join([
        f"Awarded tenders: {len(awarded)}, total savings vs budget {fmt_money(savings)}.",
        f"Average publish-to-award cycle: {round(sum(cycles) / len(cycles))} days." if cycles else "No completed award cycles yet.",
        f"Open tenders: {sum(1 for t in tenders if eff_status(t) == 'published')}; "
        f"sealed awaiting opening: {sum(1 for t in tenders if eff_status(t) == 'closed')}; "
        f"in evaluation: {sum(1 for t in tenders if t.status == 'evaluation')}.",
        f"Abnormally low bids flagged: {'; '.join(outliers) or 'none'}.",
        f"Evaluator splits (\u22652 pts): {'; '.join(splits) or 'none'}.",
        f"Supplier compliance documents expiring within 60 days: {expiring}.",
        f"Committed spend by category: {', '.join(k + ' ' + fmt_compact(v) for k, v in by_cat.items()) or 'none yet'}.",
    ])
    text = ai.ask(
        f"You advise the head of procurement at a multi-brand restaurant group. Current portfolio facts:\n{facts}\n\n"
        f"Write a 100\u2013140 word insight note: what's going well, the two or three risks that most deserve attention "
        f"this week, and one concrete next action for each risk. Plain prose, no headings, no markdown, no flattery."
    )
    return JsonResponse({"text": text})


# ---------------- conflict-of-interest ----------------

@route(["POST"], perm="coi.declare")
def declare_coi(request, p, body, tid):
    t = Tender.objects.filter(pk=tid).first()
    if not t:
        return err("Tender not found.", 404)
    if not (t.opened_at or t.tech_opened_at) or t.status == "awarded":
        return err("Declarations are signed when scoring opens.", 409)
    coi = dict(t.coi or {})
    if p["id"] not in coi:
        coi[p["id"]] = now_ms()
        t.coi = coi
        t.save(update_fields=["coi"])
        log(p, "Conflict-of-interest declaration signed",
            "Evaluator confirmed no conflict of interest with any bidder on this tender.", t.id)
    return JsonResponse({"ok": True})


# ---------------- documents ----------------

def _read_upload(request):
    f = request.FILES.get("file")
    if not f:
        return None, "No file in the upload."
    if f.size > settings.MAX_UPLOAD_BYTES:
        return None, f"Files are capped at {settings.MAX_UPLOAD_BYTES // (1024 * 1024)} MB."
    name = f.name[-200:]
    ext = ("." + name.rsplit(".", 1)[-1].lower()) if "." in name else ""
    if ext not in settings.ALLOWED_UPLOAD_EXTENSIONS:
        return None, f"File type {ext or '(none)'} is not accepted."
    return {"name": name, "content_type": f.content_type or "application/octet-stream",
            "size": f.size, "data": f.read()}, None


@route(["POST"], perm="tender.docs")
def upload_tender_doc(request, p, body, tid):
    t = Tender.objects.filter(pk=tid).first()
    if not t:
        return err("Tender not found.", 404)
    if t.status == "awarded":
        return err("This tender is closed.", 409)
    up, msg = _read_upload(request)
    if msg:
        return err(msg)
    d = Document.objects.create(id=rid("d"), kind="tender", tender=t, supplier_id=None, envelope="",
                                uploaded_by=p["name"], uploaded_at=now_ms(), **up)
    log(p, "Tender document published", f"{d.name} attached; visible to all invited suppliers.", t.id)
    return JsonResponse({"doc": doc_view(d)})


@route(["POST"], roles={"supplier"})
def upload_bid_doc(request, p, body, tid):
    t = Tender.objects.filter(pk=tid).first()
    if not t:
        return err("Tender not found.", 404)
    if p["supplierId"] not in t.invited or eff_status(t) != "published":
        return err("Documents can only be uploaded to open tenders you're invited to.", 403)
    envelope = request.POST.get("envelope", "technical")
    if envelope not in ("technical", "commercial"):
        return err("Envelope must be technical or commercial.")
    up, msg = _read_upload(request)
    if msg:
        return err(msg)
    up["data"] = seal_bytes(up["data"])
    d = Document.objects.create(id=rid("d"), kind="bid", tender=t, supplier_id=p["supplierId"],
                                envelope=envelope, encrypted=True,
                                uploaded_by=p["name"], uploaded_at=now_ms(), **up)
    # No event on purpose: even the existence of pre-submission uploads is the supplier's business.
    return JsonResponse({"doc": doc_view(d)})


@route(["POST", "DELETE"])
def delete_doc(request, p, body, doc_id):
    d = Document.objects.select_related("tender").filter(pk=doc_id).first()
    if not d:
        return err("Document not found.", 404)
    if d.kind == "supplier":
        return err("Compliance documents are managed from your company profile.", 403)
    t = d.tender
    if d.kind == "tender":
        if not has(p, "tender.docs") or t.status == "awarded":
            return err("Not allowed.", 403)
    else:
        if p["role"] != "supplier" or d.supplier_id != p["supplierId"] or eff_status(t) != "published":
            return err("Not allowed.", 403)
        if Bid.objects.filter(tender=t, supplier_id=p["supplierId"]).exists():
            return err("Withdraw your sealed bid before changing its documents.", 409)
    d.delete()
    return JsonResponse({"ok": True})


@route(["GET"])
def download_doc(request, p, body, doc_id):
    d = Document.objects.select_related("tender").filter(pk=doc_id).first()
    if not d:
        return err("Document not found.", 404)
    if d.kind == "supplier":
        if p["role"] == "supplier" and d.supplier_id != p["supplierId"]:
            return err("Not allowed.", 403)
    else:
        t = d.tender
        if tender_view(t, p) is None:
            return err("Not allowed.", 403)
        if not doc_visible(d, t, p):
            return err("Sealed until the recorded opening.", 403)
    payload = unseal_bytes(d.data) if d.encrypted else bytes(d.data)
    resp = HttpResponse(payload, content_type=d.content_type)
    resp["Content-Disposition"] = f'attachment; filename="{d.name}"'
    return resp


# ---------------- notifications ----------------

@route(["POST"])
def mark_notifications_read(request, p, body):
    ids = body.get("ids")
    qs = Notification.objects.filter(user_id=p["userId"], read=False)
    if isinstance(ids, list):
        qs = qs.filter(id__in=[str(i) for i in ids])
    qs.update(read=True)
    return JsonResponse({"ok": True})


# ---------------- health ----------------

@csrf_exempt
def health(request):
    try:
        Tender.objects.exists()
        return JsonResponse({"ok": True})
    except Exception:
        return JsonResponse({"ok": False}, status=500)


# ---------------- vendor compliance documents ----------------

@route(["POST"], roles={"supplier"})
def upload_supplier_doc(request, p, body):
    up, msg = _read_upload(request)
    if msg:
        return err(msg)
    try:
        expiry = int(request.POST.get("expiry", 0)) or None
    except (TypeError, ValueError):
        expiry = None
    label = (request.POST.get("label") or up["name"]).strip()[:120]
    sup = Supplier.objects.get(pk=p["supplierId"])
    d = Document.objects.create(id=rid("d"), kind="supplier", tender=None, supplier_id=sup.id,
                                envelope="", expiry=expiry, uploaded_by=p["name"],
                                uploaded_at=now_ms(), **up)
    docs = list(sup.docs or [])
    docs.append({"name": label, "expiry": expiry or 0, "docId": d.id})
    sup.docs = docs
    sup.save(update_fields=["docs"])
    record_event(actor=p["name"], role="supplier", action="Compliance document submitted",
                 detail=f"{label} uploaded for prequalification review.")
    return JsonResponse({"doc": doc_view(d)})


@route(["POST", "DELETE"], roles={"supplier"})
def delete_supplier_doc(request, p, body, doc_id):
    d = Document.objects.filter(pk=doc_id, kind="supplier", supplier_id=p["supplierId"]).first()
    if not d:
        return err("Document not found.", 404)
    sup = Supplier.objects.get(pk=p["supplierId"])
    sup.docs = [x for x in (sup.docs or []) if x.get("docId") != d.id]
    sup.save(update_fields=["docs"])
    d.delete()
    return JsonResponse({"ok": True})


# ---------------- team management ----------------

@route(["GET"], perm="team.view")
def team(request, p, body):
    from django.contrib.auth.models import User

    from .permissions import custom_roles, role_label
    custom = custom_roles()
    members = []
    for u in User.objects.filter(profile__persona__isnull=False).select_related("profile__persona"):
        per = u.profile.persona
        prof = u.profile
        members.append({"username": u.username, "email": u.email, "name": per.name,
                        "id": per.id, "managerId": per.manager_id,
                        "role": per.role, "roleLabel": role_label(per.role, custom).split("—")[0].strip(),
                        "title": per.title, "active": u.is_active,
                        # so the Team page tells the truth when someone has been
                        # moved off their role in the administration console
                        "custom": bool(prof.perm_extra or prof.perm_revoked)})
    pending = [{"email": t.email, "role": t.payload.get("role", ""),
                "roleLabel": role_label(t.payload.get("role", ""), custom).split("—")[0].strip(),
                "at": t.created}
               for t in ActionTokenModel.objects.filter(kind="team_invite", used_at__isnull=True)]
    from .permissions import assignable_roles
    roles = [{"value": r["key"], "label": r["label"]} for r in assignable_roles(custom)]
    return JsonResponse({"members": members, "invites": pending, "roles": roles})


@route(["POST"], perm="team.org")
def set_reporting_line(request, p, body):
    """Move one person under another, or to the top of the chart.

    Two refusals, both structural rather than stylistic. You cannot be your own
    manager, and you cannot be placed under one of your own reports — either
    would create a cycle, and a cycle in a reporting line is not a strange org
    chart, it is a rollup that never terminates and a manager who can see their
    own manager's desk. `Persona.chain()` is cycle-safe as a second line of
    defence, but the place to refuse a loop is where it would be created.
    """
    pid = str(body.get("personId", ""))
    mid = body.get("managerId") or None
    person = Persona.objects.filter(pk=pid).first()
    if not person:
        return err("No such person.", 404)
    if mid:
        manager = Persona.objects.filter(pk=str(mid)).first()
        if not manager:
            return err("No such manager.", 404)
        if manager.id == person.id:
            return err("Somebody cannot report to themselves.")
        if any(x.id == manager.id for x in person.descendants()):
            return err(f"{manager.name} already reports to {person.name}, directly or "
                       f"through someone else. That would make a loop.")
    was = person.manager.name if person.manager else "nobody"
    person.manager_id = str(mid) if mid else None
    person.save(update_fields=["manager"])
    now = Persona.objects.get(pk=person.id).manager
    log(p, "Reporting line changed",
        f"{person.name} now reports to {now.name if now else 'nobody'} (was {was}).")
    return JsonResponse({"ok": True})


@route(["POST"], perm="team.invite")
def invite_team(request, p, body):
    from .account_views import EMAIL_RE, _link, _mail, _mint
    from .permissions import assignable_roles, role_label
    email = str(body.get("email", "")).strip().lower()
    role = body.get("role")
    if not EMAIL_RE.match(email):
        return err("Enter a valid email address.")
    # the built-in four plus any role invented in the administration console
    if role not in {r["key"] for r in assignable_roles()}:
        return err("Pick a role that exists in this workspace.")
    from django.contrib.auth.models import User
    if User.objects.filter(username=email).exists():
        return err("That email already has an account.", 409)
    tok = _mint("team_invite", email, {"role": role, "title": str(body.get("title", "")).strip(),
                                       "name": str(body.get("name", "")).strip()})
    _mail(email, f"You're invited to {org_name()}'s DOCKET workspace",
          f"{p['name']} invited you as {role_label(role)}. Set your password here:\n\n"
          f"{_link(request, 'itoken', tok.token)}\n\nThe link is valid for 3 days.")
    log(p, "Team member invited", f"{email} invited as {role_label(role)}.")
    resp = {"ok": True}
    if settings.DEMO_LOGIN:  # demo convenience: surface the link so the flow is testable without a mailbox
        resp["inviteLink"] = _link(request, "itoken", tok.token)
    return JsonResponse(resp)


@route(["POST"], perm="supplier.invite")
def invite_vendor(request, p, body):
    from .account_views import EMAIL_RE, _link, _mail, _mint
    email = str(body.get("email", "")).strip().lower()
    if not EMAIL_RE.match(email):
        return err("Enter a valid email address.")
    tok = _mint("vendor_invite", email, {})
    _mail(email, f"{org_name()} invites you to register on DOCKET",
          f"{org_name()} uses DOCKET for sealed-bid tendering. Register your company here:\n\n"
          f"{_link(request, 'register', '1')}\n\nOnce registered and prequalified, you can be invited to tenders.")
    log(p, "Vendor invited to register", f"Registration invitation sent to {email}.")
    return JsonResponse({"ok": True})


# ---------------- audit-chain verification ----------------

@route(["GET"], perm="audit.integrity")
def chain_integrity(request, p, body):
    ok, count, broken = verify_chain()
    return JsonResponse({"ok": ok, "count": count, "brokenAt": broken})


# ---------------- reverse auctions ----------------

def auction_standings(t):
    """Final/current standings: each supplier's best (latest, lowest) price, ascending."""
    latest = {}
    for ab in t.auction_bids.all():  # ordered by at
        latest[ab.supplier_id] = {"supplierId": ab.supplier_id, "amount": ab.amount, "at": ab.at}
    return sorted(latest.values(), key=lambda x: (x["amount"], x["at"]))


SNIPE_WINDOW_MS = 2 * 60 * 1000  # bids in the last 2 minutes extend the close by 2 minutes


@route(["GET"])
def auction_state(request, p, body, tid):
    """Live auction room state, polled by clients. Suppliers get their rank —
    never a competitor's price. Buyer roles get the full leaderboard."""
    t = Tender.objects.filter(pk=tid).first()
    if not t or t.ttype != "AUC" or tender_view(t, p) is None:
        return err("Auction not found.", 404)
    standings = auction_standings(t)
    now = now_ms()
    out = {"serverNow": now, "deadline": t.deadline, "live": t.status == "published" and now < t.deadline,
           "recorded": bool(t.opened_at), "bidders": len(standings),
           "minDecrement": t.auction_min_decrement, "ceiling": t.budget,
           "movements": t.auction_bids.count()}
    if p["role"] == "supplier":
        me = p["supplierId"]
        mine = [{"amount": ab.amount, "at": ab.at}
                for ab in t.auction_bids.filter(supplier_id=me)]
        rank = next((i + 1 for i, x in enumerate(standings) if x["supplierId"] == me), None)
        out.update({"myBids": mine, "myRank": rank, "leading": rank == 1 if rank else False})
    else:
        names = {x.id: x.name for x in Supplier.objects.all()}
        out["leaderboard"] = [{**x, "supplier": names.get(x["supplierId"], x["supplierId"])} for x in standings]
    return JsonResponse(out)


@route(["POST"], roles={"supplier"})
def auction_bid(request, p, body, tid):
    from django.db import transaction as _tx
    t = Tender.objects.select_for_update().filter(pk=tid).first() if False else Tender.objects.filter(pk=tid).first()
    if not t or t.ttype != "AUC":
        return err("Auction not found.", 404)
    me = p["supplierId"]
    if me not in t.invited:
        return err("You're not invited to this auction.", 403)
    try:
        amount = int(body.get("amount", 0))
    except (TypeError, ValueError):
        return err("Enter a valid amount.")
    if amount <= 0:
        return err("Enter a valid amount.")
    with _tx.atomic():
        t = Tender.objects.select_for_update().get(pk=tid)
        now = now_ms()
        if t.status != "published" or now >= t.deadline:
            return err("The auction has closed.", 409)
        my_last = t.auction_bids.filter(supplier_id=me).last()
        if my_last is None:
            if amount > t.budget:
                return err(f"Opening bids must not exceed the {fmt_compact(t.budget)} ceiling.")
        else:
            floor = my_last.amount - t.auction_min_decrement
            if amount > floor:
                return err(f"Each new bid must undercut your previous {fmt_compact(my_last.amount)} "
                           f"by at least {fmt_compact(t.auction_min_decrement)}.")
        AuctionBid.objects.create(id=rid("ab"), tender=t, supplier_id=me, amount=amount, at=now)
        extended = False
        if t.deadline - now < SNIPE_WINDOW_MS:
            t.deadline = now + SNIPE_WINDOW_MS
            t.save(update_fields=["deadline"])
            extended = True
    if extended:
        record_event(actor="System", role="system", action="Auction extended",
                     tender_id=t.id, detail="A bid landed inside the closing window — close extended by 2 minutes (anti-sniping).")
    standings = auction_standings(t)
    rank = next((i + 1 for i, x in enumerate(standings) if x["supplierId"] == me), None)
    return JsonResponse({"ok": True, "myRank": rank, "deadline": t.deadline, "extended": extended})


# ---------------- supplier CSV import ----------------

@route(["POST"], perm="supplier.import")
def import_suppliers(request, p, body):
    """CSV columns (header required, order free): name, category, location, email,
    prequalified (yes/no). Duplicate names are skipped, not overwritten."""
    import csv
    import io as _io
    f = request.FILES.get("file")
    if not f:
        return err("Attach a CSV file.")
    if f.size > 2 * 1024 * 1024:
        return err("Imports are capped at 2 MB.")
    try:
        rows = list(csv.DictReader(_io.StringIO(f.read().decode("utf-8-sig"))))
    except Exception:
        return err("Could not read that file — export it as UTF-8 CSV and try again.")
    if not rows:
        return err("The file has a header but no rows.")
    cols = {c.strip().lower() for c in (rows[0].keys() or [])}
    if "name" not in cols:
        return err('The CSV needs at least a "name" column (plus optional category, location, email, prequalified).')
    existing = {s.name.strip().lower() for s in Supplier.objects.all()}
    created, skipped = [], 0
    for r in rows:
        r = {(k or "").strip().lower(): (v or "").strip() for k, v in r.items()}
        name = r.get("name", "")[:120]
        if not name or name.lower() in existing:
            skipped += 1
            continue
        existing.add(name.lower())
        Supplier.objects.create(
            id=rid("s"), name=name, category=r.get("category", "General")[:60] or "General",
            location=r.get("location", "—")[:60] or "—",
            prequalified=r.get("prequalified", "").lower() in ("yes", "y", "true", "1"),
            contact_email=r.get("email", "")[:200], docs=[], perf={},
        )
        created.append(name)
    log(p, "Suppliers imported", f"{len(created)} supplier(s) imported from CSV; {skipped} duplicate/blank row(s) skipped.")
    return JsonResponse({"created": len(created), "skipped": skipped})


@route(["GET", "POST"], perm="supplier.invite")
def vendor_campaign(request, p, body):
    """The registration drive: ask the imported register to come and sign up.

    GET previews — exactly who would be contacted and who would be skipped, with
    the reason for each skip. POST with {action:"start"} arms it; the sending
    itself happens in the background sweep, a bounded batch at a time.

    A preview is not a formality here. This is the one action in the workspace
    that reaches 1,300 companies outside it, and it cannot be recalled. The
    caller has to have seen the number before they can send it: `start` refuses
    unless the body echoes back the count the preview returned.
    """
    from . import campaign
    if request.method == "GET":
        return JsonResponse(campaign.preview())

    action = str(body.get("action", ""))
    if action == "stop":
        campaign.stop()
        log(p, "Registration drive paused", "No further invitations will be sent.")
        return JsonResponse(campaign.preview())
    if action != "start":
        return err("Unknown action.")

    pre = campaign.preview()
    if not pre["toSend"]:
        return err("There is nobody left to invite. Every vendor with an address on "
                   "file has already been contacted or already has an account.")
    # The confirmation is the count itself, so a stale preview cannot be
    # confirmed: if the register changed under the operator, the numbers no
    # longer match and they are sent back to look again.
    try:
        confirmed = int(body.get("confirm", -1))
    except (TypeError, ValueError):
        confirmed = -1
    if confirmed != pre["toSend"]:
        return err(f"This would email {pre['toSend']} vendors. Confirm that number to "
                   f"send. (You confirmed {confirmed if confirmed >= 0 else 'nothing'}.)")

    campaign.start(p["name"])
    log(p, "Registration drive started",
        f"{pre['toSend']} vendor(s) queued for a registration invitation, "
        f"{pre['distinctAddresses']} distinct address(es), {campaign.BATCH} per sweep.")
    return JsonResponse(campaign.preview())


@route(["POST"], perm="supplier.import")
def import_register(request, p, body):
    """Replace the vendor register from an uploaded register export.

    Two calls, deliberately. The first uploads the file and gets back what it
    would do — how many vendors, how many new, what would be deleted. Nothing is
    written. The second sends the same file with confirm=1 and applies it.

    Replacing 1,400 vendors is not an action anyone should be able to take by
    misclicking a file picker, and the numbers in that preview are the only way
    to notice you picked last year's export.

    Same decisions and the same guards as `manage.py import_vendors`: both go
    through core.vendor_sync.
    """
    import json as _json

    from core.vendor_import import build_book
    from core import vendor_sync

    f = request.FILES.get("file")
    if not f:
        return err("Attach the register export (a .json file).")
    if f.size > settings.MAX_UPLOAD_BYTES:
        return err("Register imports are capped at %d MB." % (settings.MAX_UPLOAD_BYTES // (1024 * 1024)))
    try:
        book = _json.loads(f.read().decode("utf-8-sig"))
    except Exception:
        return err("Could not read that file. It needs to be the register exported as JSON.")
    if not isinstance(book, dict):
        return err("That JSON is not a register export. Expected one entry per "
                   "spreadsheet sheet, each holding a list of vendor rows.")

    vendors, report = build_book(book)
    plan = vendor_sync.plan(vendors)

    preview = {
        "rows": report["rows"],
        "vendors": plan["vendors"],
        "merged": len(report["merged"]),
        "prequalified": report["vendors"] - report["not_prequalified"],
        "heldOut": report["not_prequalified"],
        "uncategorised": len(report["uncategorised"]),
        "noLocation": len(report["no_location"]),
        "unparsedDates": len(report["unparsed_dates"]),
        "onRegisterNow": plan["from_register"],
        "new": len(plan["new"]),
        "refresh": len(plan["refresh"]),
        "untouched": len(plan["outside"]),
        "willDelete": len(plan["drop"]),
        "keptBecauseUsed": len(plan["held"]),
        "deleteNames": [plan["names"][s] for s in plan["drop"][:6]],
        "keptNames": [plan["names"][s] for s in plan["held"][:6]],
        "blocked": plan["blocked"],
        "needsConfirm": plan["needs_confirm"],
    }
    if plan["blocked"]:
        return JsonResponse({"applied": False, "preview": preview, "error": plan["blocked"]}, status=400)

    confirmed = str(body.get("confirm") or request.POST.get("confirm") or "") in ("1", "true", "yes")
    if not confirmed:
        return JsonResponse({"applied": False, "preview": preview})
    # The shrink guard is not a warning to click past blindly: applying it needs
    # its own acknowledgement, separate from confirming the upload.
    if plan["needs_confirm"] and str(request.POST.get("shrinkOk") or "") not in ("1", "true", "yes"):
        return JsonResponse({"applied": False, "preview": preview,
                             "error": plan["needs_confirm"]}, status=409)

    out = vendor_sync.apply(vendors, plan)
    log(p, "Vendor register replaced",
        "%d vendors from an uploaded register export: %d new, %d refreshed, %d removed. "
        "Register now holds %d suppliers."
        % (plan["vendors"], out["created"], out["refreshed"],
           out["seeded_removed"] + out["dropped"], out["total"]))
    return JsonResponse({"applied": True, "preview": preview, "result": {
        "created": out["created"], "refreshed": out["refreshed"],
        "removed": out["seeded_removed"] + out["dropped"], "total": out["total"],
    }})


# ---------------- tender duplication (templates) ----------------

@route(["POST"], perm="tender.create")
def duplicate_tender(request, p, body, tid):
    src = Tender.objects.filter(pk=tid).first()
    if not src or tender_view(src, p) is None:
        return err("Tender not found.", 404)
    t = Tender(
        id=rid("t"), title=f"{src.title} (copy)", ttype=src.ttype, category=src.category,
        budget=src.budget, status="draft", published_at=None, deadline=0,
        tech_weight=src.tech_weight, comm_weight=src.comm_weight, scope=src.scope,
        criteria=[{**c, "id": rid("c")} for c in (src.criteria or [])],
        lines=[{**l, "id": rid("l")} for l in (src.lines or [])],
        invited=list(src.invited or []), addenda=[], two_stage=src.two_stage,
        tech_threshold=src.tech_threshold, auction_min_decrement=src.auction_min_decrement,
    )
    seq = Tender.objects.count() + 28
    t.ref = f"{ref_prefix()}-{t.ttype}-2026-{seq:03d}"
    t.save()
    log(p, "Tender duplicated", f"Draft created from {src.ref} — dates cleared, everything else carried over.", t.id)
    return JsonResponse({"id": t.id})


# ---------------- compliance report (per-tender, PDF) ----------------

@route(["GET"], perm="export.compliance")
def export_compliance(request, p, body, tid):
    t = Tender.objects.filter(pk=tid).first()
    if not t:
        return err("Tender not found.", 404)
    import io as _io

    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

    from .util import fmt_date_ms, verify_chain
    h = ParagraphStyle("h", fontName="Times-Bold", fontSize=15, spaceAfter=2)
    sub = ParagraphStyle("sub", fontName="Courier", fontSize=8.5, textColor="#666666", spaceAfter=12)
    sec = ParagraphStyle("sec", fontName="Times-Bold", fontSize=11.5, spaceBefore=10, spaceAfter=4)
    body_s = ParagraphStyle("b", fontName="Times-Roman", fontSize=10, leading=14)

    names = {x.id: x.name for x in Supplier.objects.all()}
    personas = {x.id: x.name for x in Persona.objects.all()}
    bids = list(t.bids.all())
    events = list(Event.objects.filter(tender_id=t.id).order_by("seq"))
    ok, count, broken = verify_chain()

    flow = [Paragraph("PROCUREMENT COMPLIANCE REPORT", h),
            Paragraph(f"{t.ref} · {t.title} · generated by DOCKET for {p['name']} ({p['role']})", sub)]

    def para(txt):
        flow.append(Paragraph(txt, body_s))

    flow.append(Paragraph("1. Competition", sec))
    para(f"Type: {t.ttype}{' · two-stage envelope opening' if t.two_stage else ''}. Budget ceiling {fmt_compact(t.budget)}. "
         f"{len(t.invited)} supplier(s) invited: {', '.join(names.get(x, x) for x in t.invited) or '—'}. "
         f"{len(bids)} bid(s) received. Published {fmt_date_ms(t.published_at) if t.published_at else '—'}; "
         f"deadline {fmt_date_ms(t.deadline) if t.deadline else '—'}.")

    flow.append(Paragraph("2. Sealing & opening", sec))
    if t.two_stage:
        para(f"Technical envelopes opened {fmt_date_ms(t.tech_opened_at) if t.tech_opened_at else '—'}; "
             f"commercial envelopes {fmt_date_ms(t.opened_at) if t.opened_at else 'still sealed'} "
             f"(technical threshold {t.tech_threshold}/100). "
             f"Disqualified bidders' commercial envelopes were never decrypted.")
    else:
        para(f"Bids sealed at the deadline and opened {fmt_date_ms(t.opened_at) if t.opened_at else '—'} in a recorded ceremony. "
             "Contents were ciphertext at rest until that moment.")

    flow.append(Paragraph("3. Conflict-of-interest declarations", sec))
    coi = t.coi or {}
    para("; ".join(f"{personas.get(k, k)} signed {fmt_date_ms(v)}" for k, v in coi.items()) or
         "No declarations on record.")

    flow.append(Paragraph("4. Evaluation", sec))
    for b in bids:
        s_name = names.get(b.supplier_id, b.supplier_id)
        if b.disqualified:
            para(f"{s_name}: disqualified at technical stage — commercial envelope returned unopened.")
            continue
        ts = tech_score(t, b)
        amount = fmt_compact(b.amount) if b.amount is not None else "sealed"
        scorers = ", ".join(personas.get(k, k) for k in (b.scores or {}))
        para(f"{s_name}: {amount}; technical {f'{ts:.0f}/100' if ts is not None else 'not scored'}"
             + (f"; scored by {scorers}" if scorers else "") + ".")

    flow.append(Paragraph("5. Award", sec))
    if t.awarded_to:
        para(f"Awarded to {names.get(t.awarded_to, t.awarded_to)} at {fmt_compact(t.awarded_amount)} on "
             f"{fmt_date_ms(t.awarded_at)}. Award and regret letters issued to all bidders.")
    elif t.award_rec:
        para(f"Recommendation for {names.get(t.award_rec['supplierId'])} with the approver since {fmt_date_ms(t.award_rec['at'])}.")
    else:
        para("No award recommendation yet.")

    flow.append(Paragraph("6. Audit trail", sec))
    para(f"{len(events)} recorded event(s) for this tender within a workspace chain of {count} events. "
         f"Chain integrity at generation time: {'VERIFIED' if ok else f'FAILED at #{broken}'}.")
    for e in events:
        para(f"{fmt_date_ms(e.at)} — {e.actor} ({e.role}): {e.action}. {e.detail}")

    buf = _io.BytesIO()
    SimpleDocTemplate(buf, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm,
                      topMargin=18 * mm, bottomMargin=18 * mm,
                      title=f"{t.ref} compliance report").build(flow)
    resp = HttpResponse(buf.getvalue(), content_type="application/pdf")
    resp["Content-Disposition"] = f'attachment; filename="{t.ref}-compliance.pdf"'
    return resp


# ---------------- rename: my display name / my company ----------------

@route(["PATCH", "POST"])
def me_update(request, p, body):
    name = str(body.get("name", "")).strip()[:120]
    if len(name) < 2:
        return err("Enter a name.")
    if p["role"] == "supplier":
        sup = Supplier.objects.get(pk=p["supplierId"])
        old = sup.name
        sup.name = name
        if body.get("category"):
            sup.category = str(body["category"]).strip()[:60]
        if body.get("location"):
            sup.location = str(body["location"]).strip()[:60]
        sup.save()
        if old != name:
            record_event(actor=name, role="supplier", action="Company renamed",
                         detail=f'Previously registered as "{old}". Historical records keep the old name.')
    else:
        per = Persona.objects.get(pk=p["id"])
        old = per.name
        per.name = name
        if body.get("title"):
            per.title = str(body["title"]).strip()[:120]
        per.save()
        if old != name:
            record_event(actor=name, role=p["role"], action="Display name changed",
                         detail=f'Previously "{old}". Historical records keep the old name.')
    return JsonResponse({"ok": True})
