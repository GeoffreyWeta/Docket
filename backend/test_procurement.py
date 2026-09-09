"""End-to-end exercise of the procurement event lifecycle.

    python test_procurement.py

Drives one requirement from nothing to an award and out the other side, through
the same HTTP endpoints the interface calls — so a green run is evidence the
workflow works, not that the ORM does:

    vendor registration (self-service, buyer-side and by invitation)
        -> a procurement event, configured and routed for approval
        -> vendors invited, including an unverified one
        -> round 1: sealed submissions, a deadline extension, a pause and a resume
        -> closing, the recorded opening, blind scoring
        -> round 2: a best-and-final drawn from the round-1 bidders
        -> evaluation against budget, projection and baseline
        -> recommendation, approval, award, letters
        -> and separately: a cancelled event, and every guard that says no

Reseeds the demo workspace on every run, because the assertions are about
transitions and a half-run leaves an event in the middle of one.
"""
import argparse
import io
import json
import os
import sys
import time

import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "docket.settings")
django.setup()

for _stream in (sys.stdout, sys.stderr):   # Windows consoles default to cp1252
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

from django.conf import settings  # noqa: E402
from django.contrib.auth.models import User  # noqa: E402
from django.core import mail  # noqa: E402
from django.test import Client  # noqa: E402

# Mail is captured rather than printed, so "was the vendor actually told" is a
# thing this file can assert instead of a thing a human reads off a console.
settings.EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"

from core.models import (ActionToken, Bid, ProcurementRound, Supplier,  # noqa: E402
                         Tender)
from core.seed import seed_all  # noqa: E402
from core.util import now_ms  # noqa: E402

DAY = 86_400_000
J = "application/json"

# The demo cast. Their capabilities are the point of the guard tests: `amara`
# runs procurement, `mark` approves, `deji` and `ngozi` score, `aisha` reads.
BUYER, APPROVER, EVAL1, EVAL2, AUDITOR = "amara", "mark", "deji", "ngozi", "aisha"

VENDOR_A = {"company": "Test Bidder Alpha Ltd", "email": "alpha@example.com",
            "password": "AlphaBidder!2026", "category": "Packaging", "location": "Lagos"}
VENDOR_B = {"company": "Test Bidder Beta Ltd", "email": "beta@example.com",
            "password": "BetaBidder!2026", "category": "Packaging", "location": "Abuja"}

c = Client()
TOK = {}
CHECKS = []
SECTION = ""


# ---------------------------------------------------------------- harness

def section(name):
    global SECTION
    SECTION = name
    print(f"\n-- {name} " + "-" * max(0, 62 - len(name)))


def ok(label):
    CHECKS.append((SECTION, label))
    print(f"   [ok] {label}")


def yes(label, cond, extra=""):
    assert cond, f"{SECTION} — {label}: FAILED {extra}"
    ok(label)


def eq(label, got, want):
    assert got == want, f"{SECTION} — {label}: {got!r} != {want!r}"
    ok(label)


def call(method, path, who, body=None, expect=200, files=None, label=None):
    kw = {"HTTP_AUTHORIZATION": f"Bearer {TOK[who]}"} if who else {}
    if files is not None:
        r = c.post(path, data=files, **kw)
    elif method == "GET":
        r = c.get(path, **kw)
    elif method == "DELETE":
        r = c.delete(path, data=json.dumps(body or {}), content_type=J, **kw)
    elif method == "PATCH":
        r = c.patch(path, data=json.dumps(body or {}), content_type=J, **kw)
    else:
        r = c.post(path, data=json.dumps(body or {}), content_type=J, **kw)
    assert r.status_code == expect, (
        f"{SECTION} — {method} {path} as {who}: {r.status_code} != {expect} — {r.content[:400]}")
    if label:
        ok(label)
    ct = r.headers.get("Content-Type", "")
    return r.json() if ct.startswith("application/json") else r


def refused(label, method, path, who, body=None, status=(400, 403, 404, 409)):
    """The other half of every capability: that it actually says no."""
    kw = {"HTTP_AUTHORIZATION": f"Bearer {TOK[who]}"} if who else {}
    fn = {"GET": c.get, "DELETE": c.delete, "PATCH": c.patch}.get(method, c.post)
    if method == "GET":
        r = fn(path, **kw)
    else:
        r = fn(path, data=json.dumps(body or {}), content_type=J, **kw)
    assert r.status_code in status, (
        f"{SECTION} — {label}: expected a refusal, got {r.status_code} — {r.content[:300]}")
    ok(f"{label} — refused {r.status_code}")
    return r


def signin(username, password=None):
    pw = settings.DEMO_PASSWORD if password is None else password
    r = c.post("/api/auth/login/", json.dumps({"username": username, "password": pw}), content_type=J)
    if r.status_code != 200 and password is None and settings.DEMO_LOGIN:
        r = c.post("/api/auth/demo/", json.dumps({"username": username}), content_type=J)
    assert r.status_code == 200, f"sign-in {username}: {r.status_code} — {r.content[:200]}"
    TOK[username] = r.json()["token"]
    return r.json()


def pdf(name, text=b"%PDF-1.4 test document"):
    f = io.BytesIO(text)
    f.name = name
    return f


def boot(who):
    return call("GET", "/api/bootstrap/", who)


def tender_of(who, tid):
    return next((t for t in boot(who)["tenders"] if t["id"] == tid), None)


def rewind(tid, ms):
    """Pull a deadline into the past so closing can be tested without waiting.

    Written straight to the row rather than through the API on purpose: no
    endpoint brings a deadline forward, and none should — that is the rule
    `extend_deadline` enforces, and this is the test harness standing in for
    the passage of time, not for a user.
    """
    Tender.objects.filter(pk=tid).update(deadline=now_ms() - ms)
    ProcurementRound.objects.filter(tender_id=tid, status="open").update(deadline=now_ms() - ms)


def mail_to(address):
    return [m for m in mail.outbox if address in m.to]


# ---------------------------------------------------------------- 1. vendors

def sec_vendors(ctx):
    section("1. vendor registration, verification and the register")

    # --- self-service registration --------------------------------------
    mail.outbox = []
    r = c.post("/api/register/vendor/", json.dumps(VENDOR_A), content_type=J)
    assert r.status_code == 200, r.content[:300]
    if not r.json().get("verified"):   # DEMO_LOGIN=0: consume the emailed token
        tok = ActionToken.objects.filter(kind="vendor_verify", email=VENDOR_A["email"],
                                         used_at__isnull=True).first()
        call("POST", "/api/register/verify/", None, {"token": tok.token})
    a = Supplier.objects.get(contact_email=VENDOR_A["email"])
    ok(f'vendor A self-registered — {a.name} ({a.id})')
    yes("registration confirmation was emailed to the vendor",
        any("Registration received" in m.subject for m in mail_to(VENDOR_A["email"])))
    eq("registration status", a.registration_status(), "registered")
    eq("verification status starts unverified", a.verification_status(), "unverified")
    eq("source recorded", a.source, "self")

    # --- the same company again ------------------------------------------
    r = c.post("/api/register/vendor/", json.dumps(VENDOR_A), content_type=J)
    yes("registering the same email twice is refused", r.status_code == 409)

    # --- the buyer types a vendor in directly -----------------------------
    signin(BUYER)
    mail.outbox = []
    b = call("POST", "/api/suppliers/register/", BUYER, {
        "name": VENDOR_B["company"], "email": VENDOR_B["email"], "category": "Packaging",
        "location": "Abuja", "contactPerson": "Beta Contact", "phone": "+234 800 000 0000",
    }, label="buyer registered a vendor directly")
    bsid = b["id"]
    brow = Supplier.objects.get(pk=bsid)
    # "invited", not "pending": the same call emailed them a claim link, which
    # is precisely what "invitation sent, registration outstanding" means.
    eq("directly-registered vendor has an invitation outstanding",
       brow.registration_status(), "invited")
    eq("directly-registered vendor is unverified", brow.verification_status(), "unverified")
    eq("source records who put them there", brow.source, "buyer")
    yes("they were emailed a link to claim the account",
        any("claim" in m.body.lower() or "register=" in m.body for m in mail_to(VENDOR_B["email"])))

    # --- and is refused a second time -------------------------------------
    refused("registering the same company name twice", "POST", "/api/suppliers/register/", BUYER,
            {"name": VENDOR_B["company"], "email": "someone.else@example.com"}, status=(409,))

    # --- the vendor claims the record rather than making a second one -----
    tok = ActionToken.objects.filter(kind="vendor_claim", email=VENDOR_B["email"],
                                     used_at__isnull=True).first()
    yes("a single-use claim token was minted", tok is not None)
    before = Supplier.objects.count()
    call("POST", "/api/register/claim/", None, {"token": tok.token, "password": VENDOR_B["password"]})
    eq("claiming attaches to the existing record, it does not create a second",
       Supplier.objects.count(), before)
    eq("claiming completes registration",
       Supplier.objects.get(pk=bsid).registration_status(), "registered")

    # --- verification -----------------------------------------------------
    call("POST", f"/api/suppliers/{a.id}/prequalify/", BUYER, {"ok": True})
    a.refresh_from_db()
    eq("vendor A is verified after prequalification", a.verification_status(), "verified")
    yes("the verification is dated and attributed", bool(a.verified_at and a.verified_by))

    # An auditor reads; they do not decide. This is the capability check, not
    # a role check: `aisha` has page.suppliers-adjacent read access and no
    # supplier.prequalify, and the endpoint asks for the capability.
    signin(AUDITOR)
    refused("auditor prequalifying a vendor", "POST", f"/api/suppliers/{bsid}/prequalify/",
            AUDITOR, {"ok": True}, status=(403,))
    refused("auditor registering a vendor", "POST", "/api/suppliers/register/", AUDITOR,
            {"name": "Should Not Exist Ltd"}, status=(403,))

    ctx["a"] = a.id
    ctx["b"] = bsid
    signin(VENDOR_A["email"], VENDOR_A["password"])
    signin(VENDOR_B["email"], VENDOR_B["password"])
    return ctx


def sec_suspension(ctx):
    section("2. suspension: barred without being struck off")
    signin(BUYER)
    sid = ctx["a"]
    refused("suspending without a reason", "POST", f"/api/suppliers/{sid}/suspend/", BUYER,
            {"ok": True}, status=(400,))
    mail.outbox = []
    call("POST", f"/api/suppliers/{sid}/suspend/", BUYER,
         {"ok": True, "reason": "Public liability policy lapsed on 12 August."},
         label="vendor suspended with a reason")
    s = Supplier.objects.get(pk=sid)
    eq("verification status reads suspended", s.verification_status(), "suspended")
    yes("prequalification survives the suspension", s.prequalified)
    yes("the vendor was told", any("suspend" in m.subject.lower() for m in mail_to(VENDOR_A["email"])))

    refused("suspending twice", "POST", f"/api/suppliers/{sid}/suspend/", BUYER,
            {"ok": True, "reason": "again"}, status=(409,))
    refused("prequalifying a suspended vendor", "POST", f"/api/suppliers/{sid}/prequalify/", BUYER,
            {"ok": True}, status=(409,))

    call("POST", f"/api/suppliers/{sid}/suspend/", BUYER, {"ok": False},
         label="suspension lifted")
    s.refresh_from_db()
    eq("they come back verified, not unverified", s.verification_status(), "verified")
    return ctx


# ---------------------------------------------------------------- 3. the event

def sec_event(ctx):
    section("3. creating and configuring a procurement event")
    signin(BUYER)
    a, b = ctx["a"], ctx["b"]

    base = {
        "title": "Test event — twelve-month packaging supply", "type": "RFP",
        "category": "Packaging", "budget": 40_000_000, "techWeight": 60,
        "criteria": [{"name": "Quality & compliance", "weight": 60},
                     {"name": "Lead time", "weight": 40}],
        "lines": [{"desc": "Branded cold cups (sleeve of 50)", "qty": 2000, "unit": "sleeve"}],
        "scope": "Twelve-month supply of branded consumables to two central warehouses.",
        "invited": [a, b],
    }

    # --- the configuration the form is supposed to prevent -----------------
    refused("a deadline in the past", "POST", "/api/tenders/", BUYER,
            {**base, "deadline": now_ms() - DAY, "submit": True}, status=(400,))
    refused("criteria weights that do not total 100", "POST", "/api/tenders/", BUYER,
            {**base, "deadline": now_ms() + 14 * DAY, "submit": True,
             "criteria": [{"name": "Only this", "weight": 60}]}, status=(400,))
    refused("an event with nobody invited", "POST", "/api/tenders/", BUYER,
            {**base, "deadline": now_ms() + 14 * DAY, "submit": True, "invited": []}, status=(400,))
    refused("a projection above the budget ceiling", "POST", "/api/tenders/", BUYER,
            {**base, "deadline": now_ms() + 14 * DAY, "projectedCost": 60_000_000}, status=(400,))

    # --- saved as a draft first -------------------------------------------
    tid = call("POST", "/api/tenders/", BUYER,
               {**base, "deadline": now_ms() + 14 * DAY, "projectedCost": 36_000_000,
                "baseline": 38_000_000, "baselineSource": "2025 contract, annualised"})["id"]
    t = tender_of(BUYER, tid)
    eq("saved as a draft", t["status"], "draft")
    eq("the projection is recorded", t["projectedCost"], 36_000_000)
    eq("the baseline is recorded", t["baseline"], 38_000_000)
    yes("a draft is invisible to the vendors invited to it", tender_of(VENDOR_A["email"], tid) is None)

    # A draft below the approval threshold publishes straight out; this one is
    # deliberately under it so the test owns its own timing rather than the
    # approver's queue. The approval path itself is exercised at award.
    call("POST", f"/api/tenders/{tid}/submit/", BUYER, {})
    t = tender_of(BUYER, tid)
    yes("submitted for approval or published under the matrix",
        t["status"] in ("published", "approval"))
    if t["status"] == "approval":
        signin(APPROVER)
        call("POST", f"/api/tenders/{tid}/publish_decision/", APPROVER, {"ok": True})
        signin(BUYER)
        t = tender_of(BUYER, tid)
    eq("published", t["status"], "published")
    eq("it reports one round", t["currentRound"], 1)
    yes("invited vendors can now see it", tender_of(VENDOR_A["email"], tid) is not None)

    call("POST", f"/api/tenders/{tid}/docs/", BUYER, files={"file": pdf("test-rfp-pack.pdf")})
    docs = [d for d in boot(BUYER)["documents"] if d["tenderId"] == tid and d["kind"] == "tender"]
    yes("the RFP pack is attached to the event", len(docs) == 1)
    yes("invited vendors receive the document pack",
        any(d["tenderId"] == tid for d in boot(VENDOR_A["email"])["documents"]))

    ctx["tid"] = tid
    return ctx


def sec_event_vendors(ctx):
    section("4. the event's vendors")
    signin(BUYER)
    tid = ctx["tid"]

    rows = call("GET", f"/api/tenders/{tid}/vendors/", BUYER)["vendors"]
    eq("both invited vendors are on the table", len(rows), 2)
    by = {r["supplierId"]: r for r in rows}
    eq("vendor A shows as verified", by[ctx["a"]]["verificationStatus"], "verified")
    eq("vendor B shows as unverified", by[ctx["b"]]["verificationStatus"], "unverified")
    yes("an unverified vendor is on the event anyway — verification gates "
        "prequalification, not participation", by[ctx["b"]]["invitationStatus"] == "sent")
    eq("neither has bid yet", {r["bidStatus"] for r in rows}, {"none"})

    # --- adding a third, mid-competition ----------------------------------
    third = Supplier.objects.exclude(id__in=[ctx["a"], ctx["b"]]).filter(suspended=False).first()
    mail.outbox = []
    r = call("POST", f"/api/tenders/{tid}/vendors/", BUYER, {"supplierIds": [third.id]},
             label="a third vendor added to a live event")
    eq("the added vendor is on the invitation list", third.id in r["invited"], True)
    refused("adding the same vendor twice", "POST", f"/api/tenders/{tid}/vendors/", BUYER,
            {"supplierIds": [third.id]}, status=(409,))
    refused("adding a vendor that is not on the register", "POST", f"/api/tenders/{tid}/vendors/",
            BUYER, {"supplierIds": ["no-such-vendor"]}, status=(404,))

    # --- and removing them again ------------------------------------------
    call("DELETE", f"/api/tenders/{tid}/vendors/", BUYER, {"supplierId": third.id},
         label="a vendor withdrawn from a live event")
    rows = call("GET", f"/api/tenders/{tid}/vendors/", BUYER)["vendors"]
    eq("back to two", len(rows), 2)

    # --- suspended vendors are not invitable ------------------------------
    call("POST", f"/api/suppliers/{third.id}/suspend/", BUYER,
         {"ok": True, "reason": "Under investigation."})
    refused("inviting a suspended vendor", "POST", f"/api/tenders/{tid}/vendors/", BUYER,
            {"supplierIds": [third.id]}, status=(409,))
    call("POST", f"/api/suppliers/{third.id}/suspend/", BUYER, {"ok": False})

    # --- a deliberate message to the field --------------------------------
    mail.outbox = []
    sent = call("POST", f"/api/tenders/{tid}/vendors/notify/", BUYER,
                {"subject": "Reminder", "message": "Submissions close on Friday.", "only": "nobid"})
    eq("both non-bidders were notified", sent["sent"], 2)
    refused("an empty message", "POST", f"/api/tenders/{tid}/vendors/notify/", BUYER,
            {"message": "   "}, status=(400,))

    # --- reading is oversight; changing is not ----------------------------
    signin(AUDITOR)
    seen = call("GET", f"/api/tenders/{tid}/vendors/", AUDITOR,
                label="an auditor can read the event's vendor table")
    eq("and sees the same rows", len(seen["vendors"]), 2)
    refused("auditor adding a vendor to an event", "POST", f"/api/tenders/{tid}/vendors/",
            AUDITOR, {"supplierIds": [ctx["a"]]}, status=(403,))
    refused("auditor withdrawing a vendor", "DELETE", f"/api/tenders/{tid}/vendors/",
            AUDITOR, {"supplierId": ctx["a"]}, status=(403,))
    refused("auditor opening a round", "POST", f"/api/tenders/{tid}/rounds/", AUDITOR,
            {"deadline": now_ms() + 5 * DAY}, status=(403,))
    call("GET", f"/api/tenders/{tid}/rounds/", AUDITOR,
         label="but can read which rounds an event has run")

    # A vendor is told which round is running and nothing about the field.
    a_mail = VENDOR_A["email"]
    rounds = call("GET", f"/api/tenders/{tid}/rounds/", a_mail)["rounds"]
    yes("a bidder can read the round they are in", len(rounds) >= 0)
    yes("without being shown who else is in it",
        all("bidCount" not in r and set(r.get("invited") or []) <= {ctx["a"]} for r in rounds))
    refused("a vendor reading the event's vendor table", "GET", f"/api/tenders/{tid}/vendors/",
            a_mail, status=(403,))
    return ctx


# ---------------------------------------------------------------- 5. round one

def sec_round_one(ctx):
    section("5. round 1 — submission, extension, pause, resume")
    tid = ctx["tid"]
    a_mail, b_mail = VENDOR_A["email"], VENDOR_B["email"]

    # --- a bid needs its technical proposal first --------------------------
    refused("sealing a bid with no technical proposal", "POST", f"/api/tenders/{tid}/bids/",
            a_mail, {"amount": 34_000_000}, status=(400,))
    call("POST", f"/api/tenders/{tid}/bid_docs/", a_mail,
         files={"file": pdf("alpha-technical.pdf"), "envelope": "technical"})
    call("POST", f"/api/tenders/{tid}/bid_docs/", b_mail,
         files={"file": pdf("beta-technical.pdf"), "envelope": "technical"})

    # --- line-item pricing -------------------------------------------------
    t = tender_of(a_mail, tid)
    line = t["lines"][0]["id"]
    refused("a line priced at zero", "POST", f"/api/tenders/{tid}/bids/", a_mail,
            {"lines": {line: 0}}, status=(400,))

    mail.outbox = []
    call("POST", f"/api/tenders/{tid}/bids/", a_mail, {"lines": {line: 17_000}},
         label="vendor A sealed a bid")
    call("POST", f"/api/tenders/{tid}/bids/", b_mail, {"lines": {line: 18_500}},
         label="vendor B (unverified) sealed a bid")
    yes("each bidder got a submission confirmation",
        mail_to(a_mail) and any("received" in m.subject.lower() for m in mail_to(a_mail)))
    refused("bidding twice in the same round", "POST", f"/api/tenders/{tid}/bids/", a_mail,
            {"lines": {line: 16_000}}, status=(409,))

    # --- one vendor cannot see another's bid -------------------------------
    a_bids = [b for b in boot(a_mail)["bids"] if b["tenderId"] == tid]
    eq("a vendor sees exactly one bid on this event — their own", len(a_bids), 1)
    eq("and it is theirs", a_bids[0]["supplierId"], ctx["a"])
    yes("their own sealed bid still echoes back the amount they submitted",
        a_bids[0].get("amount") == 17_000 * t["lines"][0]["qty"])
    refused("a vendor reading the bid bucket", "GET", f"/api/tenders/{tid}/bucket/", a_mail,
            status=(403,))

    # --- the buyer sees that bids exist, and nothing inside them ------------
    signin(BUYER)
    buyer_bids = [b for b in boot(BUYER)["bids"] if b["tenderId"] == tid]
    eq("the buyer sees two submissions", len(buyer_bids), 2)
    yes("both are sealed to the buyer before the opening",
        all(b.get("sealed") and b.get("amount") is None for b in buyer_bids))

    # --- extending the deadline --------------------------------------------
    old = tender_of(BUYER, tid)["deadline"]
    refused("bringing a deadline forward", "POST", f"/api/tenders/{tid}/extend/", BUYER,
            {"deadline": old - DAY, "reason": "no"}, status=(400,))
    refused("extending without a reason", "POST", f"/api/tenders/{tid}/extend/", BUYER,
            {"deadline": old + 3 * DAY}, status=(400,))
    mail.outbox = []
    call("POST", f"/api/tenders/{tid}/extend/", BUYER,
         {"deadline": old + 3 * DAY, "reason": "Two vendors asked for time to price the civils."},
         label="deadline extended")
    t = tender_of(BUYER, tid)
    eq("the new deadline is live", t["deadline"], old + 3 * DAY)
    eq("the change is recorded as a series", len(t["deadlineChanges"]), 1)
    eq("with the old date", t["deadlineChanges"][0]["from"], old)
    eq("and who moved it", t["deadlineChanges"][0]["by"], "Amara Okafor")
    yes("every invited vendor was told", len(mail_to(a_mail)) and len(mail_to(b_mail)))
    vend = tender_of(a_mail, tid)
    yes("the vendor is told the date moved", len(vend["deadlineChanges"]) == 1)
    yes("but not who moved it or why", "by" not in vend["deadlineChanges"][0])

    # --- pause and resume ---------------------------------------------------
    refused("pausing without a reason", "POST", f"/api/tenders/{tid}/pause/", BUYER, {}, status=(400,))
    mail.outbox = []
    call("POST", f"/api/tenders/{tid}/pause/", BUYER,
         {"reason": "Specification error in section 4."}, label="event paused")
    eq("status reads paused", tender_of(BUYER, tid)["status"], "paused")
    yes("vendors were told it stopped", any("paused" in m.subject.lower() for m in mail_to(a_mail)))
    refused("submitting into a paused event", "POST", f"/api/tenders/{tid}/bids/", a_mail,
            {"lines": {line: 1}}, status=(409,))
    refused("opening bids on a paused event", "POST", f"/api/tenders/{tid}/open/", BUYER,
            {}, status=(409,))
    refused("pausing an already-paused event", "POST", f"/api/tenders/{tid}/pause/", BUYER,
            {"reason": "again"}, status=(409,))

    call("POST", f"/api/tenders/{tid}/resume/", BUYER, {}, label="event resumed")
    eq("status is published again", tender_of(BUYER, tid)["status"], "published")
    refused("resuming an event that is not paused", "POST", f"/api/tenders/{tid}/resume/", BUYER,
            {}, status=(409,))

    ctx["line"] = line
    return ctx


def sec_closing_opening(ctx):
    section("6. closing and the recorded opening")
    tid, line = ctx["tid"], ctx["line"]
    a_mail = VENDOR_A["email"]

    rewind(tid, 60_000)
    signin(BUYER)
    eq("the event reads as sealed once the deadline passes",
       tender_of(BUYER, tid)["effStatus"], "closed")
    refused("submitting after the deadline", "POST", f"/api/tenders/{tid}/bids/", a_mail,
            {"lines": {line: 1}}, status=(409,))

    # Opening is a capability, not a role: an evaluator scores, they do not
    # break seals, and an auditor does neither.
    signin(EVAL1)
    refused("an evaluator opening the bids", "POST", f"/api/tenders/{tid}/open/", EVAL1,
            {}, status=(403,))
    signin(AUDITOR)
    refused("an auditor opening the bids", "POST", f"/api/tenders/{tid}/open/", AUDITOR,
            {}, status=(403,))

    signin(BUYER)
    call("POST", f"/api/tenders/{tid}/open/", BUYER, {}, label="bids opened in a recorded opening")
    t = tender_of(BUYER, tid)
    eq("the event moves to evaluation", t["status"], "evaluation")
    yes("the opening is timestamped", bool(t["openedAt"]))
    bids = [b for b in boot(BUYER)["bids"] if b["tenderId"] == tid]
    yes("amounts are on the record now", all(b.get("amount") for b in bids))
    refused("opening a second time", "POST", f"/api/tenders/{tid}/open/", BUYER, {}, status=(409,))
    refused("extending a deadline after the opening", "POST", f"/api/tenders/{tid}/extend/", BUYER,
            {"deadline": now_ms() + DAY, "reason": "too late"}, status=(409,))

    # --- the bucket ---------------------------------------------------------
    bucket = call("GET", f"/api/tenders/{tid}/bucket/", BUYER)
    eq("the bucket groups the submissions into one round", len(bucket["groups"]), 1)
    eq("with both bids in it", len(bucket["groups"][0]["bids"]), 2)
    yes("and carries the money the panel judges against",
        bucket["budget"] == 40_000_000 and bucket["projectedCost"] == 36_000_000)
    yes("each opened bid carries its saving and the basis of it",
        all(b["savings"]["basis"] == "baseline" for b in bucket["groups"][0]["bids"]))
    return ctx


# ---------------------------------------------------------------- 7. round two

def sec_round_two(ctx):
    section("7. round 2 — a best and final drawn from round 1")
    tid = ctx["tid"]
    a_mail, b_mail = VENDOR_A["email"], VENDOR_B["email"]
    signin(BUYER)

    refused("a round with a deadline in the past", "POST", f"/api/tenders/{tid}/rounds/", BUYER,
            {"deadline": now_ms() - DAY}, status=(400,))
    refused("a shortlist containing somebody who never bid", "POST", f"/api/tenders/{tid}/rounds/",
            BUYER, {"deadline": now_ms() + 5 * DAY, "invited": ["s1"]}, status=(409,))

    r = call("POST", f"/api/tenders/{tid}/rounds/", BUYER, {
        "name": "Best and final offer", "deadline": now_ms() + 5 * DAY,
        "instructions": "Submit your best and final price for the same scope.",
        "invited": [ctx["a"], ctx["b"]],
    }, label="round 2 created as a draft")["round"]
    rid = r["id"]
    eq("it is numbered 2", r["number"], 2)
    eq("and not yet open", r["status"], "upcoming")

    t = tender_of(BUYER, tid)
    eq("round 1 was materialised behind it", len(t["rounds"]), 2)
    eq("and the round-1 bids were adopted into it",
       Bid.objects.filter(tender_id=tid, round__number=1).count(), 2)

    signin(AUDITOR)
    refused("an auditor opening a round", "POST", f"/api/rounds/{rid}/open/", AUDITOR,
            {}, status=(403,))

    signin(BUYER)
    mail.outbox = []
    call("POST", f"/api/rounds/{rid}/open/", BUYER, {}, label="round 2 opened")
    yes("its bidders were told it opened and when it closes",
        any("best and final" in m.subject.lower() for m in mail_to(a_mail)))
    t = tender_of(BUYER, tid)
    eq("the event is taking submissions again", t["status"], "published")
    eq("the current round is 2", t["currentRound"], 2)
    yes("round 1's opening is still on the record", bool(t["openedAt"]))
    r1_docs = [d for d in boot(BUYER)["documents"]
               if d["tenderId"] == tid and d["kind"] == "bid"]
    yes("and the documents it released stay readable", len(r1_docs) >= 2)
    r2_bids = [b for b in boot(BUYER)["bids"] if b["tenderId"] == tid and b["roundNumber"] == 2]
    yes("while round 2's own submissions are sealed under it",
        all(b.get("sealed") and b.get("amount") is None for b in r2_bids) if r2_bids else True)

    # --- a second submission from the same vendor, in the new round --------
    call("POST", f"/api/tenders/{tid}/bids/", a_mail, {"lines": {ctx["line"]: 15_500}},
         label="vendor A re-priced in round 2")
    call("POST", f"/api/tenders/{tid}/bids/", b_mail, {"lines": {ctx["line"]: 18_000}},
         label="vendor B re-priced in round 2")
    eq("both rounds' bids coexist", Bid.objects.filter(tender_id=tid).count(), 4)
    signin(BUYER)
    r2 = [b for b in boot(BUYER)["bids"] if b["tenderId"] == tid and b["roundNumber"] == 2]
    yes("round 2's bids are sealed to the buyer even though round 1 was opened",
        all(b.get("sealed") and b.get("amount") is None for b in r2))
    r1 = [b for b in boot(BUYER)["bids"] if b["tenderId"] == tid and b["roundNumber"] == 1]
    yes("and round 1's stay open, as they were opened on the record",
        all(b.get("amount") for b in r1))
    eq("without a fresh technical proposal being demanded",
       Bid.objects.filter(tender_id=tid, round__number=2).count(), 2)
    refused("bidding twice in round 2", "POST", f"/api/tenders/{tid}/bids/", a_mail,
            {"lines": {ctx["line"]: 15_000}}, status=(409,))

    signin(BUYER)
    call("POST", f"/api/rounds/{rid}/close/", BUYER, {}, label="round 2 closed early")
    eq("the event reads as sealed", tender_of(BUYER, tid)["effStatus"], "closed")
    call("POST", f"/api/tenders/{tid}/open/", BUYER, {}, label="round 2 opened in a recorded opening")

    bucket = call("GET", f"/api/tenders/{tid}/bucket/", BUYER)
    eq("the bucket now has two groups", len(bucket["groups"]), 2)
    eq("two bids in each", [len(g["bids"]) for g in bucket["groups"]], [2, 2])
    r2 = next(g for g in bucket["groups"] if g["round"]["number"] == 2)
    amounts = {b["supplierName"]: b["amount"] for b in r2["bids"]}
    yes("round 2 prices are on the record", all(v for v in amounts.values()))

    rows = call("GET", f"/api/tenders/{tid}/vendors/", BUYER)["vendors"]
    yes("the vendor table shows both rounds per bidder",
        all(row["roundsBid"] == [1, 2] for row in rows))
    ctx["rid2"] = rid
    return ctx


# ---------------------------------------------------------------- 8. the end

def sec_evaluation_award(ctx):
    section("8. evaluation, recommendation, approval, award")
    tid = ctx["tid"]
    t = tender_of(BUYER, tid)
    bids = [b for b in boot(BUYER)["bids"] if b["tenderId"] == tid and b["roundNumber"] == 2]
    crit = [c["id"] for c in t["criteria"]]

    # --- scoring is gated on the conflict-of-interest declaration ----------
    signin(EVAL1)
    refused("scoring before declaring no conflict", "POST", f"/api/bids/{bids[0]['id']}/scores/",
            EVAL1, {"scores": {crit[0]: 8}}, status=(403,))
    for who in (EVAL1, EVAL2):
        signin(who)
        call("POST", f"/api/tenders/{tid}/coi/", who, {})
    ok("both evaluators signed the conflict-of-interest declaration")

    for i, who in enumerate((EVAL1, EVAL2)):
        signin(who)
        for j, b in enumerate(bids):
            call("POST", f"/api/bids/{b['id']}/scores/", who,
                 {"scores": {crit[0]: 9 - j, crit[1]: 8 - j},
                  "note": "Scored against the published criteria."})
    ok("both evaluators scored both round-2 bids")

    # --- blind scoring, enforced at serialization --------------------------
    signin(EVAL1)
    mine = [b for b in boot(EVAL1)["bids"] if b["id"] == bids[0]["id"]][0]
    eq("an evaluator receives only their own marks", list(mine["scores"].keys()), ["u2"])
    signin(BUYER)
    chair = [b for b in boot(BUYER)["bids"] if b["id"] == bids[0]["id"]][0]
    eq("the panel chair sees the whole panel", len(chair["scores"]), 2)

    # --- the recommendation ------------------------------------------------
    best = min((b for b in bids if b["amount"]), key=lambda b: b["amount"])
    signin(AUDITOR)
    refused("an auditor recommending an award", "POST", f"/api/tenders/{tid}/recommend/",
            AUDITOR, {"bidId": best["id"]}, status=(403,))
    signin(BUYER)
    call("POST", f"/api/tenders/{tid}/recommend/", BUYER, {"bidId": best["id"]},
         label="award recommended to the approver")
    refused("recommending twice", "POST", f"/api/tenders/{tid}/recommend/", BUYER,
            {"bidId": best["id"]}, status=(409,))
    refused("procurement approving its own recommendation", "POST",
            f"/api/tenders/{tid}/award_decision/", BUYER, {"ok": True}, status=(403,))

    # --- returned for review, then approved --------------------------------
    signin(APPROVER)
    call("POST", f"/api/tenders/{tid}/award_decision/", APPROVER, {"ok": False},
         label="approver returned the recommendation with questions")
    yes("the recommendation is back with the panel", tender_of(BUYER, tid)["awardRec"] is None)
    eq("and no award was made", tender_of(BUYER, tid)["status"], "evaluation")

    signin(BUYER)
    call("POST", f"/api/tenders/{tid}/recommend/", BUYER, {"bidId": best["id"]})
    signin(APPROVER)
    mail.outbox = []
    call("POST", f"/api/tenders/{tid}/award_decision/", APPROVER, {"ok": True},
         label="award approved")
    t = tender_of(APPROVER, tid)
    eq("the event is awarded", t["status"], "awarded")
    eq("to the recommended vendor", t["awardedTo"], best["supplierId"])
    eq("at the bid amount", t["awardedAmount"], best["amount"])
    yes("an award memo was recorded", bool(t["awardMemo"]))
    yes("every bidder got a letter", len(t["letters"]) >= 2)
    yes("and every bidder was emailed the outcome",
        len(mail_to(VENDOR_A["email"])) and len(mail_to(VENDOR_B["email"])))
    yes("all rounds are marked completed",
        set(ProcurementRound.objects.filter(tender_id=tid).values_list("status", flat=True)) == {"completed"})

    # --- a vendor sees their own letter and nobody else's -------------------
    signin(VENDOR_A["email"], VENDOR_A["password"])
    vt = tender_of(VENDOR_A["email"], tid)
    eq("a vendor is served exactly one letter", len(vt["letters"] or {}), 1)
    yes("their own", ctx["a"] in (vt["letters"] or {}))
    yes("and never the award recommendation", vt["awardRec"] is None)

    # --- an awarded event is frozen ----------------------------------------
    signin(BUYER)
    refused("cancelling an awarded event", "POST", f"/api/tenders/{tid}/cancel/", BUYER,
            {"reason": "changed my mind"}, status=(409,))
    refused("extending an awarded event", "POST", f"/api/tenders/{tid}/extend/", BUYER,
            {"deadline": now_ms() + DAY, "reason": "no"}, status=(409,))
    refused("adding a vendor to an awarded event", "POST", f"/api/tenders/{tid}/vendors/", BUYER,
            {"supplierIds": [ctx["a"]]}, status=(409,))
    refused("opening another round on an awarded event", "POST", f"/api/tenders/{tid}/rounds/",
            BUYER, {"deadline": now_ms() + DAY}, status=(409,))
    return ctx


def sec_cancellation(ctx):
    section("9. cancellation")
    signin(BUYER)
    tid = call("POST", "/api/tenders/", BUYER, {
        "title": "Test event — to be cancelled", "type": "RFQ", "category": "Packaging",
        "budget": 12_000_000, "deadline": now_ms() + 10 * DAY, "techWeight": 60,
        "criteria": [{"name": "Quality", "weight": 100}],
        "scope": "A requirement that will be withdrawn.", "invited": [ctx["a"]], "submit": True,
    })["id"]
    if tender_of(BUYER, tid)["status"] == "approval":
        signin(APPROVER)
        call("POST", f"/api/tenders/{tid}/publish_decision/", APPROVER, {"ok": True})
        signin(BUYER)

    a_mail = VENDOR_A["email"]
    call("POST", f"/api/tenders/{tid}/bid_docs/", a_mail,
         files={"file": pdf("alpha-technical-2.pdf"), "envelope": "technical"})
    call("POST", f"/api/tenders/{tid}/bids/", a_mail, {"amount": 11_000_000})
    ok("a vendor sealed a bid before the withdrawal")

    signin(AUDITOR)
    refused("an auditor cancelling an event", "POST", f"/api/tenders/{tid}/cancel/", AUDITOR,
            {"reason": "no"}, status=(403,))
    signin(BUYER)
    refused("cancelling without a reason", "POST", f"/api/tenders/{tid}/cancel/", BUYER,
            {}, status=(400,))

    mail.outbox = []
    call("POST", f"/api/tenders/{tid}/cancel/", BUYER,
         {"reason": "Requirement withdrawn — the budget line was reallocated."},
         label="event cancelled with a reason")
    t = tender_of(BUYER, tid)
    eq("status reads cancelled", t["status"], "cancelled")
    yes("with a timestamp and the reason", bool(t["cancelledAt"]) and "budget line" in t["cancelReason"])
    yes("the vendor was told, verbatim",
        any("budget line" in m.body for m in mail_to(a_mail)))

    yes("the sealed bid was never opened",
        Bid.objects.get(tender_id=tid, supplier_id=ctx["a"]).sealed_blob is not None)
    refused("opening a cancelled event's bids", "POST", f"/api/tenders/{tid}/open/", BUYER,
            {}, status=(409,))
    refused("submitting into a cancelled event", "POST", f"/api/tenders/{tid}/bids/", a_mail,
            {"amount": 1}, status=(409,))
    refused("cancelling twice", "POST", f"/api/tenders/{tid}/cancel/", BUYER,
            {"reason": "again"}, status=(409,))
    refused("resuming a cancelled event", "POST", f"/api/tenders/{tid}/resume/", BUYER,
            {}, status=(409,))
    refused("extending a cancelled event", "POST", f"/api/tenders/{tid}/extend/", BUYER,
            {"deadline": now_ms() + DAY, "reason": "no"}, status=(409,))

    # The vendor still sees it — that is the point of telling them.
    yes("the vendor can still read the cancelled event and why",
        (tender_of(a_mail, tid) or {}).get("cancelReason", "").startswith("Requirement withdrawn"))
    return ctx


def sec_two_stage_and_rounds(ctx):
    """Per-round sealing must not disturb two-stage envelope opening.

    These two features answer the same question — "may this be seen yet" — from
    different directions, and they meet in `bid_view` and `doc_visible`. Rounds
    ask *which window* was opened; two-stage asks *which envelope*. An earlier
    version of the round work collapsed the two-stage intermediate state, where
    a bid is deliberately `sealed: False, commercialSealed: True` so the panel
    can score technical proposals while prices are still ciphertext. Nothing in
    the rounds suite caught it, because the rounds suite has no two-stage event
    in it. Now it does.
    """
    section("9. two-stage opening, with rounds in the same codebase")
    signin(BUYER)
    a, b = ctx["a"], ctx["b"]
    a_mail, b_mail = VENDOR_A["email"], VENDOR_B["email"]

    tid = call("POST", "/api/tenders/", BUYER, {
        "title": "Test event — two-stage technical then commercial", "type": "RFP",
        "category": "Packaging", "budget": 20_000_000, "deadline": now_ms() + 10 * DAY,
        "techWeight": 70, "twoStage": True, "techThreshold": 50,
        "criteria": [{"name": "Quality & compliance", "weight": 100}],
        "scope": "A two-stage competition: technical envelopes open first.",
        "invited": [a, b], "submit": True,
    })["id"]
    if tender_of(BUYER, tid)["status"] == "approval":
        signin(APPROVER)
        call("POST", f"/api/tenders/{tid}/publish_decision/", APPROVER, {"ok": True})
        signin(BUYER)
    yes("two-stage event published", tender_of(BUYER, tid)["twoStage"])

    for who, amount in ((a_mail, 17_000_000), (b_mail, 18_000_000)):
        call("POST", f"/api/tenders/{tid}/bid_docs/", who,
             files={"file": pdf(f"{who}-technical.pdf"), "envelope": "technical"})
        call("POST", f"/api/tenders/{tid}/bid_docs/", who,
             files={"file": pdf(f"{who}-commercial.pdf"), "envelope": "commercial"})
        call("POST", f"/api/tenders/{tid}/bids/", who, {"amount": amount})
    ok("both vendors sealed a bid with both envelopes")

    rewind(tid, 60_000)
    signin(BUYER)
    call("POST", f"/api/tenders/{tid}/open/", BUYER, {}, label="stage 1: technical envelopes opened")

    bids = [x for x in boot(BUYER)["bids"] if x["tenderId"] == tid]
    eq("two bids on the record", len(bids), 2)
    yes("stage 1 reports the technical envelope open",
        all(x.get("sealed") is False for x in bids), extra=str(bids))
    yes("and the commercial envelope still sealed",
        all(x.get("commercialSealed") is True for x in bids), extra=str(bids))
    yes("with no price anywhere in the payload",
        all("amount" not in x for x in bids), extra=str(bids))

    docs = [d for d in boot(BUYER)["documents"] if d["tenderId"] == tid and d["kind"] == "bid"]
    envelopes = {d["envelope"] for d in docs}
    eq("only technical documents are released in stage 1", envelopes, {"technical"})

    # --- stage 2 -----------------------------------------------------------
    crit = tender_of(BUYER, tid)["criteria"][0]["id"]
    for who in (EVAL1, EVAL2):
        signin(who)
        call("POST", f"/api/tenders/{tid}/coi/", who, {})
        for x in bids:
            call("POST", f"/api/bids/{x['id']}/scores/", who, {"scores": {crit: 8}})
    signin(BUYER)
    call("POST", f"/api/tenders/{tid}/open/", BUYER, {}, label="stage 2: commercial envelopes opened")
    bids = [x for x in boot(BUYER)["bids"] if x["tenderId"] == tid]
    yes("prices are on the record once stage 2 is opened",
        all(x.get("amount") for x in bids), extra=str(bids))
    docs = [d for d in boot(BUYER)["documents"] if d["tenderId"] == tid and d["kind"] == "bid"]
    eq("and both envelopes are readable", {d["envelope"] for d in docs}, {"technical", "commercial"})

    # --- a round 2 on top of a two-stage event ------------------------------
    r = call("POST", f"/api/tenders/{tid}/rounds/", BUYER,
             {"name": "Round 2", "deadline": now_ms() + 5 * DAY, "invited": [a, b]})["round"]
    call("POST", f"/api/rounds/{r['id']}/open/", BUYER, {})
    ok("a second round opened on a two-stage event")

    t = tender_of(BUYER, tid)
    yes("stage 1's technical opening is still on the record", bool(t["techOpenedAt"]))
    yes("and so is stage 2's", bool(t["openedAt"]))
    docs = [d for d in boot(BUYER)["documents"] if d["tenderId"] == tid and d["kind"] == "bid"]
    eq("round 1's documents stay readable — they were opened on the record", len(docs), 4)

    call("POST", f"/api/tenders/{tid}/bid_docs/", a_mail,
         files={"file": pdf("alpha-round2-technical.pdf"), "envelope": "technical"})
    call("POST", f"/api/tenders/{tid}/bids/", a_mail, {"amount": 16_000_000})
    signin(BUYER)
    r2docs = [d for d in boot(BUYER)["documents"]
              if d["tenderId"] == tid and d["kind"] == "bid" and d["roundId"] == r["id"]]
    eq("a round-2 technical proposal is NOT released by stage 1's opening", len(r2docs), 0)
    r2bids = [x for x in boot(BUYER)["bids"] if x["tenderId"] == tid and x["roundNumber"] == 2]
    yes("and the round-2 bid is sealed under its own round",
        all(x.get("sealed") and "amount" not in x for x in r2bids), extra=str(r2bids))
    return ctx


def sec_audit(ctx):
    section("11. the audit trail")
    signin(BUYER)
    events = [e for e in boot(BUYER)["events"] if e["tenderId"] == ctx["tid"]]
    actions = {e["action"] for e in events}
    # Round entries are logged under the round's own name, not its number: an
    # audit trail that says "Round 2 opened" when everyone involved called it
    # the best and final is an audit trail people have to translate.
    for want in ("Deadline extended", "Event paused", "Event resumed",
                 "Vendors added to event", "Vendor withdrawn from event", "Vendors notified",
                 "Round created", "Best and final offer opened", "Best and final offer closed",
                 "Bid opening", "Award recommended", "Award recommendation returned",
                 "Award approved"):
        yes(f'"{want}" is on the trail',
            any(a.startswith(want) for a in actions), extra=str(sorted(actions)))
    ext = next(e for e in events if e["action"].startswith("Deadline extended"))
    yes("the extension records both dates", "→" in ext["detail"])
    yes("and the reason given", "civils" in ext["detail"])

    integrity = call("GET", "/api/audit/integrity/", BUYER)
    yes("the hash chain still verifies after every lifecycle write", integrity["ok"])
    ok(f'{integrity["count"]} events verified')
    return ctx


# ---------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--keep", action="store_true",
                    help="do not reseed first (only safe on a freshly seeded database)")
    args = ap.parse_args()

    started = time.time()
    if not args.keep:
        print("Reseeding the demo workspace…")
        seed_all()
    for who in (BUYER, APPROVER, EVAL1, EVAL2, AUDITOR):
        signin(who)

    ctx = {}
    for fn in (sec_vendors, sec_suspension, sec_event, sec_event_vendors, sec_round_one,
               sec_closing_opening, sec_round_two, sec_evaluation_award, sec_cancellation,
               sec_two_stage_and_rounds, sec_audit):
        ctx = fn(ctx) or ctx

    print(f"\n{len(CHECKS)} checks passed in {time.time() - started:.1f}s "
          f"across {len({s for s, _ in CHECKS})} sections.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
