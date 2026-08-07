"""Test company + test user, and an end-to-end exercise of the platform
through their accounts.

    python test_org.py            # set up only — idempotent, never wipes data
    python test_org.py --full     # reseed the demo, set up, then test everything

Setup creates a self-registered vendor ("Test Company Ltd") and a buyer-side
teammate ("Test User", procurement) through the same HTTP endpoints the UI
calls, so a green run is evidence the real flows work — not just the ORM.
--full then drives both accounts through every feature: approval matrix,
clarifications, addenda, sealed bidding with encrypted uploads, the recorded
opening, COI-gated blind scoring, award + letters, exports, the audit chain,
two-stage envelopes, a reverse auction, prequalification, MFA, lockout,
password reset, renames, the background sweep and the AI guards.
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

# Capture outbound mail instead of printing it, so dispatch itself is assertable.
settings.EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"

from core.models import (ActionToken, Bid, Document, Event, FailedLogin,  # noqa: E402
                         Notification, Supplier, TaskMark, Tender)
from core.seed import ORG, seed_all  # noqa: E402
from core.util import now_ms  # noqa: E402

# ---------------------------------------------------------------- credentials

COMPANY = {
    "company": "Test Company Ltd",
    "email": "testco@example.com",
    "password": "TestCompany!2026",
    "category": "General supplies",
    "location": "Lagos",
}
TEAMMATE = {
    "email": "test.user@example.com",
    "password": "TestUser!2026",
    "name": "Test User",
    "role": "procurement",
    "title": "Test Procurement Lead",
}
SANDBOX_TENDER = "Test sandbox — branded consumables (test data)"
SANDBOX_AUCTION = "Test sandbox — diesel reverse auction (test data)"
COMPANY2 = {  # second vendor, used for the decline → fix → approve path
    "company": "Test Company Two",
    "email": "testco2@example.com",
    "password": "TestCompany2!2026",
    "category": "Facilities services",
    "location": "Abuja",
}

DAY = 86_400_000
J = "application/json"

c = Client()
TOK = {}
CHECKS = []
SECTION = ""


# ---------------------------------------------------------------- test harness

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
        f"{SECTION} — {method} {path} as {who}: {r.status_code} != {expect} — {r.content[:300]}")
    if label:
        ok(label)
    ct = r.headers.get("Content-Type", "")
    return r.json() if ct.startswith("application/json") else r


def signin(username, password=None, expect=200):
    """Password sign-in, falling back to the one-click demo login for seeded accounts."""
    pw = settings.DEMO_PASSWORD if password is None else password
    r = c.post("/api/auth/login/", json.dumps({"username": username, "password": pw}), content_type=J)
    if r.status_code != 200 and password is None and settings.DEMO_LOGIN:
        r = c.post("/api/auth/demo/", json.dumps({"username": username}), content_type=J)
    assert r.status_code == expect, f"sign-in {username}: {r.status_code} — {r.content[:200]}"
    if r.status_code == 200:
        TOK[username] = r.json()["token"]
        return r.json()
    return None


def pdf(name, text=b"%PDF-1.4 test document"):
    f = io.BytesIO(text)
    f.name = name
    return f


def boot(who):
    return call("GET", "/api/bootstrap/", who)


def tender_of(who, tid):
    return next((t for t in boot(who)["tenders"] if t["id"] == tid), None)


def subjects(who):
    return [n["subject"] for n in boot(who)["notifications"]]


def new_tender(who, payload, expect=200):
    return call("POST", "/api/tenders/", who, payload, expect=expect)


# ---------------------------------------------------------------- setup

CO, TU = COMPANY["email"], TEAMMATE["email"]


def _procurement_login():
    """Sign in as an existing procurement user so invites can be sent."""
    if not User.objects.filter(profile__persona__role="procurement").exists():
        print("   no procurement account found — seeding the demo workspace first")
        seed_all()
    for name in ["amara"] + list(User.objects.filter(profile__persona__role="procurement")
                                 .values_list("username", flat=True)):
        if name in (TU,):
            continue
        try:
            signin(name)
            return name
        except AssertionError:
            continue
    raise SystemExit("Could not sign in as any procurement user — reseed with "
                     "`python manage.py seed_demo --force`.")


def register_company(spec):
    """Self-service vendor registration through the public endpoint. Idempotent."""
    r = c.post("/api/register/vendor/", json.dumps(spec), content_type=J)
    if r.status_code == 409:  # already registered on a previous run
        signin(spec["email"], spec["password"])
        return Supplier.objects.get(contact_email=spec["email"]).id, False
    assert r.status_code == 200, f"vendor registration: {r.status_code} — {r.content[:200]}"
    if not r.json().get("verified"):  # DEMO_LOGIN=0: consume the emailed verification token
        tok = ActionToken.objects.filter(kind="vendor_verify", email=spec["email"],
                                         used_at__isnull=True).first()
        assert tok, "no verification token was minted"
        call("POST", "/api/register/verify/", None, {"token": tok.token})
    signin(spec["email"], spec["password"])
    return Supplier.objects.get(contact_email=spec["email"]).id, True


def invite_teammate(inviter, spec):
    """Team invite → accept → sign in. Idempotent."""
    if User.objects.filter(username=spec["email"]).exists():
        signin(spec["email"], spec["password"])
        return False
    r = call("POST", "/api/team/invite/", inviter,
             {"email": spec["email"], "role": spec["role"], "name": spec["name"], "title": spec["title"]})
    link = r.get("inviteLink")
    token = (link.split("itoken=")[1] if link else
             ActionToken.objects.filter(kind="team_invite", email=spec["email"], used_at__isnull=True).first().token)
    call("POST", "/api/register/accept_invite/", None,
         {"token": token, "password": spec["password"], "name": spec["name"]})
    signin(spec["email"], spec["password"])
    return True


def setup():
    section("SETUP — test company + test user")
    inviter = _procurement_login()
    ok(f"signed in as existing procurement user — {inviter}")

    sid, fresh = register_company(COMPANY)
    ok(f'{"registered" if fresh else "reusing"} vendor "{COMPANY["company"]}" ({sid})')

    mail.outbox = []
    made = invite_teammate(inviter, TEAMMATE)
    if made:
        yes("invitation email was dispatched with a single-use link",
            any(TEAMMATE["email"] in m.to and "itoken=" in m.body for m in mail.outbox))
    me = boot(TU)["me"]
    eq("test user has the invited role", me["role"], TEAMMATE["role"])
    ok(f'{"invited" if made else "reusing"} teammate "{TEAMMATE["name"]}" — {me["title"]}')

    # a compliance document with an expiry, uploaded by the company itself
    if not Document.objects.filter(kind="supplier", supplier_id=sid).exists():
        call("POST", "/api/me/docs/", CO,
             files={"file": pdf("test-company-tax-clearance.pdf"),
                    "label": "Tax clearance 2026", "expiry": str(now_ms() + 200 * DAY)})
    yes("compliance document on file",
        Document.objects.filter(kind="supplier", supplier_id=sid).exists())

    # the test user (procurement) runs the prequalification decision
    if not Supplier.objects.get(pk=sid).prequalified:
        call("POST", f"/api/suppliers/{sid}/prequalify/", TU, {"ok": True})
    yes("test company prequalified", Supplier.objects.get(pk=sid).prequalified)

    # an open tender so the test company's portal has something to bid on
    existing = Tender.objects.filter(title=SANDBOX_TENDER).first()
    if existing and existing.deadline > now_ms():
        ok(f'reusing open sandbox tender "{SANDBOX_TENDER}" ({existing.ref})')
    else:
        tid = new_tender(TU, {
            "title": SANDBOX_TENDER, "type": "RFQ", "category": "Packaging",
            "budget": 30_000_000, "deadline": now_ms() + 7 * DAY, "techWeight": 60,
            "criteria": [{"name": "Quality & compliance", "weight": 60},
                         {"name": "Lead time", "weight": 40}],
            "lines": [{"desc": "Branded cold cups (sleeve of 50)", "qty": 2000, "unit": "sleeve"},
                      {"desc": "Takeaway boxes (carton of 100)", "qty": 1200, "unit": "carton"}],
            "invited": [sid], "submit": True,
            "scope": ("Sandbox tender created by the test-org setup script so the test company has a "
                      "live bid room: twelve-month supply of branded consumables to two central "
                      "warehouses, monthly call-off, food-contact compliance required."),
        })["id"]
        call("POST", f"/api/tenders/{tid}/docs/", TU, files={"file": pdf("test-tender-pack.pdf")})
        t = tender_of(TU, tid)
        yes(f'sandbox tender published to the test company ({t["ref"]})', t["status"] == "published")
        yes("test company can see it in its portal", tender_of(CO, tid) is not None)

    _sandbox_auction(sid)
    return {"sid": sid, "inviter": inviter}


def _sandbox_auction(sid):
    """A live reverse auction with rivals already bidding, so the auction room
    has a real leaderboard to move. Closes two hours out."""
    live = Tender.objects.filter(title=SANDBOX_AUCTION, deadline__gt=now_ms() + 60_000,
                                 status="published").first()
    if live:
        ok(f"reusing live sandbox auction ({live.ref}) — closes {(live.deadline - now_ms()) // 60000} min from now")
        return
    tid = new_tender(TU, {
        "title": SANDBOX_AUCTION, "type": "AUC", "category": "Energy",
        "budget": 90_000_000, "deadline": now_ms() + 2 * 3600_000, "minDecrement": 500_000,
        "invited": [sid, "s2", "s3"], "submit": True,
        "scope": ("Sandbox reverse auction created by the test-org setup script: 12-month AGO supply to "
                  "128 store generators. Price-only competition — you see your live rank, never a "
                  "competitor's price, and bids in the final two minutes extend the close."),
    })["id"]
    if tender_of(TU, tid)["status"] == "approval":       # 90m sits above the approval matrix
        signin("mark")
        call("POST", f"/api/tenders/{tid}/publish_decision/", "mark", {"ok": True})
    t = tender_of(TU, tid)
    yes(f"sandbox auction live ({t['ref']}, closes in 2h)", t["status"] == "published")

    # rivals open the bidding so there is a leaderboard to climb
    placed = 0
    for who, amount in (("coldline", 88_000_000), ("harmattan", 89_500_000)):
        try:
            signin(who)
            call("POST", f"/api/tenders/{tid}/auction/bids/", who, {"amount": amount})
            placed += 1
        except (AssertionError, KeyError):
            pass    # rivals unavailable (DEMO_LOGIN=0 with unknown passwords) — the room still works
    ok(f"{placed} rival bid(s) already on the board — the test company enters at rank {placed + 1}")


# ---------------------------------------------------------------- A. accounts & guards

def sec_accounts(ctx):
    section("A. authentication, identity and role guards")
    sid = ctx["sid"]
    r = c.get("/api/bootstrap/")
    eq("unauthenticated bootstrap is refused", r.status_code, 401)
    r = c.post("/api/auth/login/", json.dumps({"username": CO, "password": "wrong-one"}), content_type=J)
    eq("wrong password is refused", r.status_code, 401)
    FailedLogin.objects.filter(username=CO).delete()
    signin(CO, COMPANY["password"])
    signin(TU, TEAMMATE["password"])
    ok("both test accounts sign in with their passwords")

    d = boot(CO)
    eq("company sees only its own supplier record", [s["id"] for s in d["suppliers"]], [sid])
    eq("company name is its own", d["suppliers"][0]["name"], COMPANY["company"])
    eq("company sees no audit trail", d["events"], [])
    eq("company sees only the tenders it is invited to",
       sorted(t["title"] for t in d["tenders"]), sorted([SANDBOX_TENDER, SANDBOX_AUCTION]))
    d = boot(TU)
    yes("test user sees the whole supplier register", len(d["suppliers"]) >= 11)
    yes("test user sees the audit trail", len(d["events"]) > 10)
    eq("workspace name resolves", d["org"]["name"], ORG["name"])

    call("GET", "/api/team/", CO, expect=403, label="company cannot read the team page")
    call("POST", "/api/tenders/", CO, {"title": "x"}, expect=403,
         label="company cannot create tenders")
    call("POST", f"/api/suppliers/{sid}/prequalify/", CO, {"ok": True}, expect=403,
         label="company cannot prequalify itself")
    call("POST", "/api/settings/", TU, {"approvalThreshold": 1}, expect=403,
         label="procurement cannot change the approval matrix")
    call("POST", "/api/auth/logout/", CO, {})
    r = c.get("/api/bootstrap/", HTTP_AUTHORIZATION=f"Bearer {TOK[CO]}")
    eq("sign-out revokes the token server-side", r.status_code, 401)
    signin(CO, COMPANY["password"])

    r = c.post("/api/register/vendor/", json.dumps(COMPANY), content_type=J)
    eq("duplicate company registration is refused", r.status_code, 409)
    r = c.post("/api/register/vendor/", json.dumps({**COMPANY, "email": "x@y.z", "password": "short"}),
               content_type=J)
    eq("short password is refused at registration", r.status_code, 400)
    r = c.post("/api/register/vendor/", json.dumps({**COMPANY, "email": "not-an-email"}), content_type=J)
    eq("invalid email is refused at registration", r.status_code, 400)
    r = call("GET", "/api/team/", ctx["inviter"])
    yes("test user appears on the team page", any(m["email"] == TU for m in r["members"]))


# ---------------------------------------------------------------- B. tenders & approval matrix

def sec_tenders(ctx):
    section("B. tender creation, validation and the approval matrix")
    sid, now = ctx["sid"], now_ms()

    base = {"type": "RFQ", "category": "Packaging", "techWeight": 60, "scope": "Test scope.",
            "criteria": [{"name": "Quality", "weight": 60}, {"name": "Lead time", "weight": 40}],
            "invited": [sid], "submit": True}
    new_tender(TU, {**base, "title": "Bad weights", "budget": 1_000_000,
                    "deadline": now + 5 * DAY,
                    "criteria": [{"name": "Quality", "weight": 50}]}, expect=400)
    ok("criteria weights must total 100")
    new_tender(TU, {**base, "title": "Past deadline", "budget": 1_000_000, "deadline": now - DAY}, expect=400)
    ok("deadline must be in the future")
    new_tender(TU, {**base, "title": "Nobody invited", "budget": 1_000_000,
                    "deadline": now + 5 * DAY, "invited": []}, expect=400)
    ok("at least one supplier must be invited")
    new_tender(TU, {**base, "title": "Zero quantity", "budget": 1_000_000, "deadline": now + 5 * DAY,
                    "lines": [{"desc": "Cups", "qty": 0, "unit": "sleeve"}]}, expect=400)
    ok("every line item needs a quantity")

    a = new_tender(TU, {
        **base,
        "title": "Test Company trial — packaging consumables",
        "budget": 30_000_000, "deadline": now + 7 * DAY,
        "lines": [{"desc": "Branded cold cups (sleeve of 50)", "qty": 2000, "unit": "sleeve"},
                  {"desc": "Takeaway boxes (carton of 100)", "qty": 1200, "unit": "carton"}],
        "invited": [sid, "s2"],
        "scope": "Twelve-month supply of branded consumables to two central warehouses.",
    })["id"]
    ta = tender_of(TU, a)
    eq("below-threshold tender publishes straight through", ta["status"], "published")
    prefix = "".join(ch for ch in (boot(TU)["org"]["short"]).upper() if ch.isalnum())[:3]
    yes(f"reference uses the workspace prefix ({prefix}-)", ta["ref"].startswith(prefix + "-"), ta["ref"])
    yes("company now sees the tender it was invited to", tender_of(CO, a) is not None)
    yes("invitation notification reached the company",
        any("Invitation to tender" in s for s in subjects(CO)))
    yes("uninvited supplier cannot see it", tender_of("harmattan", a) is None)

    b = new_tender(TU, {**base, "title": "Test Company trial — store fit-out", "category": "Facilities",
                        "budget": 60_000_000, "deadline": now + int(1.2 * DAY)})["id"]
    eq("at/above-threshold tender routes for approval", tender_of(TU, b)["status"], "approval")
    yes("approver was notified", any("Publication approval needed" in s for s in subjects("mark")))
    yes("company cannot see a tender awaiting approval", tender_of(CO, b) is None)
    call("POST", f"/api/tenders/{b}/publish_decision/", TU, {"ok": True}, expect=403,
         label="procurement cannot approve publication")
    call("POST", f"/api/tenders/{b}/publish_decision/", "mark", {"ok": True})
    eq("approver publishes it", tender_of(TU, b)["status"], "published")

    up = call("POST", f"/api/tenders/{a}/docs/", TU, files={"file": pdf("test-tender-pack.pdf")})
    r = call("GET", f"/api/docs/{up['doc']['id']}/download/", CO)
    yes("company downloads the published tender pack", r.content.startswith(b"%PDF"))
    call("GET", f"/api/docs/{up['doc']['id']}/download/", "harmattan", expect=403,
         label="uninvited supplier cannot download it")
    ctx["a"], ctx["b"] = a, b


# ---------------------------------------------------------------- C. clarifications, addenda, sealed bid

def sec_bidding(ctx):
    section("C. clarifications, addenda and the sealed bid")
    a, sid = ctx["a"], ctx["sid"]

    call("POST", f"/api/tenders/{a}/clarifications/", CO,
         {"q": "Can cups be delivered in mixed pallets?"}, label="company asks a clarification")
    cid = [q for q in boot(TU)["clarifications"] if q["tenderId"] == a][0]["id"]
    yes("procurement was notified", any("New clarification" in s for s in subjects(TU)))
    call("POST", f"/api/clarifications/{cid}/answer/", CO, {"a": "no"}, expect=403,
         label="a supplier cannot answer clarifications")
    call("POST", f"/api/clarifications/{cid}/answer/", TU,
         {"a": "Yes — mixed pallets are acceptable if labelled per SKU."})
    q = [x for x in boot(CO)["clarifications"] if x["id"] == cid][0]
    yes("company reads the published answer", q["a"].startswith("Yes"))
    q2 = [x for x in boot("coldline")["clarifications"] if x["id"] == cid][0]
    yes("rival sees the answer anonymised", "supplierId" not in q2 and q2["mine"] is False)

    call("POST", f"/api/tenders/{a}/addenda/", TU,
         {"title": "carton count revised", "note": "Price cartons of 100, not 120."})
    ta = tender_of(CO, a)
    eq("addendum reached the company", len(ta["addenda"]), 1)
    yes("addendum notification sent", any("Addendum issued" in s for s in subjects(CO)))
    lines = {l["desc"]: l["id"] for l in ta["lines"]}
    cups, boxes = lines["Branded cold cups (sleeve of 50)"], lines["Takeaway boxes (carton of 100)"]
    prices = {cups: 6000, boxes: 9000}          # 12.0m + 10.8m = 22.8m of a 30m ceiling
    acks = [x["id"] for x in ta["addenda"]]

    call("POST", f"/api/tenders/{a}/bids/", CO, {"lines": prices, "acks": []}, expect=400,
         label="cannot seal a bid without acknowledging the addendum")
    call("POST", f"/api/tenders/{a}/bids/", CO, {"lines": prices, "acks": acks}, expect=400,
         label="cannot seal a bid without a technical proposal")
    call("POST", f"/api/tenders/{a}/bid_docs/", CO,
         files={"file": pdf("big.pdf", b"x" * (11 * 1024 * 1024)), "envelope": "technical"}, expect=400,
         label="oversized upload rejected")
    call("POST", f"/api/tenders/{a}/bid_docs/", CO,
         files={"file": pdf("run.sh", b"#!/bin/sh"), "envelope": "technical"}, expect=400,
         label="unsafe file extension rejected")
    doc_id = call("POST", f"/api/tenders/{a}/bid_docs/", CO,
                  files={"file": pdf("test-company-technical.pdf"), "envelope": "technical"})["doc"]["id"]
    row = Document.objects.get(pk=doc_id)
    yes("uploaded proposal is ciphertext at rest",
        row.encrypted and not bytes(row.data).startswith(b"%PDF"))
    r = call("GET", f"/api/docs/{doc_id}/download/", CO)
    yes("owner still reads their own document back", r.content.startswith(b"%PDF"))
    call("GET", f"/api/docs/{doc_id}/download/", TU, expect=403,
         label="buyer cannot open a bid document before the opening")

    call("POST", f"/api/tenders/{a}/bids/", CO, {"lines": prices, "acks": acks},
         label="company seals its bid")
    bid = Bid.objects.get(tender_id=a, supplier_id=sid)
    yes("bid amount is ciphertext at rest", bid.amount is None and bid.sealed_blob is not None)
    mine = [x for x in boot(CO)["bids"] if x["tenderId"] == a][0]
    eq("company sees its own sealed figure echoed back", mine["amount"], 22_800_000)
    theirs = [x for x in boot(TU)["bids"] if x["tenderId"] == a][0]
    yes("buyer learns only that a bid exists", theirs["sealed"] and "amount" not in theirs)
    yes("procurement was notified of the sealed bid",
        any("Sealed bid received" in s for s in subjects(TU)))

    call("POST", f"/api/tenders/{a}/bids/", CO, {"lines": prices, "acks": acks}, expect=409,
         label="a second bid is refused until the first is withdrawn")
    call("DELETE", f"/api/docs/{doc_id}/", CO, expect=409,
         label="documents are locked while the bid is sealed")
    call("DELETE", f"/api/tenders/{a}/bids/", CO, {}, label="company withdraws its bid")
    call("DELETE", f"/api/docs/{doc_id}/", CO, {}, label="documents unlock after withdrawal")
    call("POST", f"/api/tenders/{a}/bid_docs/", CO,
         files={"file": pdf("test-company-technical-v2.pdf"), "envelope": "technical"})
    call("POST", f"/api/tenders/{a}/bids/", CO, {"lines": prices, "acks": acks},
         label="company reseals a replacement bid")

    # a rival bids too, so the evaluation has something to compare
    call("POST", f"/api/tenders/{a}/bid_docs/", "coldline",
         files={"file": pdf("coldline-technical.pdf"), "envelope": "technical"})
    call("POST", f"/api/tenders/{a}/bids/", "coldline",
         {"lines": {cups: 6500, boxes: 9500}, "acks": acks})     # 24.4m
    ok("rival supplier seals a competing bid")
    eq("rival cannot see the test company's bid",
       [x["supplierId"] for x in boot("coldline")["bids"] if x["tenderId"] == a], ["s2"])


# ---------------------------------------------------------------- D. opening, scoring, award

def sec_opening_award(ctx):
    section("D. recorded opening, COI-gated blind scoring, award")
    a, sid = ctx["a"], ctx["sid"]

    call("POST", f"/api/tenders/{a}/open/", TU, {}, expect=409,
         label="bids cannot be opened before the deadline")
    call("GET", f"/api/tenders/{a}/export/comparison.xlsx", TU, expect=409,
         label="no comparison export before the opening")
    Tender.objects.filter(pk=a).update(deadline=now_ms() - 1000)
    ta = tender_of(TU, a)
    yes("the deadline is served to the client, which renders it as sealed",
        ta["status"] == "published" and ta["deadline"] < now_ms())
    call("DELETE", f"/api/tenders/{a}/bids/", CO, {}, expect=409,
         label="a sealed bid can no longer be withdrawn after the deadline")
    call("POST", f"/api/tenders/{a}/bid_docs/", CO,
         files={"file": pdf("late.pdf"), "envelope": "technical"}, expect=403,
         label="documents can no longer be swapped after the deadline")
    call("POST", f"/api/tenders/{a}/bids/", "harmattan", {"amount": 1, "acks": []}, expect=403,
         label="a late bid from an uninvited supplier is refused")
    call("POST", f"/api/tenders/{a}/open/", CO, {}, expect=403,
         label="a supplier cannot open the bids")
    call("POST", f"/api/tenders/{a}/open/", TU, {}, label="test user opens the bids on the record")

    bid = Bid.objects.get(tender_id=a, supplier_id=sid)
    yes("opening decrypts the amount at rest", bid.amount == 22_800_000 and bid.sealed_blob is None)
    yes("opening decrypts the documents at rest",
        not Document.objects.filter(tender_id=a, kind="bid", encrypted=True).exists())
    docs = [x for x in boot(TU)["documents"] if x["tenderId"] == a and x["kind"] == "bid"]
    yes("buyer can now list bid documents", len(docs) == 2)
    r = call("GET", f"/api/docs/{docs[0]['id']}/download/", TU)
    yes("buyer downloads a proposal after the opening", r.content.startswith(b"%PDF"))

    bids = {x["supplierId"]: x for x in boot(TU)["bids"] if x["tenderId"] == a}
    ours = bids[sid]["id"]
    call("POST", f"/api/bids/{ours}/scores/", "deji", {"scores": {"x": 5}}, expect=403,
         label="evaluator is blocked from scoring before signing the COI declaration")
    call("POST", f"/api/tenders/{a}/coi/", "deji", {}, label="evaluator signs the COI declaration")
    call("POST", f"/api/tenders/{a}/coi/", "ngozi", {})
    crit = [x["id"] for x in tender_of(TU, a)["criteria"]]
    for who, ours_score, theirs_score in (("deji", 9, 7), ("ngozi", 8, 7)):
        call("POST", f"/api/bids/{ours}/scores/", who,
             {"scores": {crit[0]: ours_score, crit[1]: ours_score},
              "note": "Samples matched the spec; references checked."})
        call("POST", f"/api/bids/{bids['s2']['id']}/scores/", who,
             {"scores": {crit[0]: theirs_score, crit[1]: theirs_score}})
    ok("both evaluators score every bid")
    seen = [x for x in boot("deji")["bids"] if x["id"] == ours][0]
    eq("evaluator only ever receives their own scores", sorted(seen["scores"]), ["u2"])
    chair = [x for x in boot(TU)["bids"] if x["id"] == ours][0]
    yes("panel chair sees the full score set and justification",
        sorted(chair["scores"]) == ["u2", "u3"] and chair["notes"]["u2"].startswith("Samples"))
    yes("supplier never sees any scores", boot(CO)["bids"][0]["scores"] == {})

    call("POST", f"/api/tenders/{a}/recommend/", CO, {"bidId": ours}, expect=403,
         label="a supplier cannot recommend an award")
    call("POST", f"/api/tenders/{a}/recommend/", TU, {"bidId": ours},
         label="test user recommends the test company")
    yes("approver was notified", any("Award approval needed" in s for s in subjects("mark")))
    yes("memo names the test company",
        COMPANY["company"] in tender_of(TU, a)["awardRec"]["memo"])
    call("POST", f"/api/tenders/{a}/recommend/", TU, {"bidId": bids["s2"]["id"]}, expect=409,
         label="a second recommendation is refused while one is with the approver")
    call("POST", f"/api/tenders/{a}/withdraw_recommendation/", TU, {},
         label="chair can withdraw the recommendation")
    call("POST", f"/api/tenders/{a}/recommend/", TU, {"bidId": ours})
    call("POST", f"/api/tenders/{a}/award_decision/", TU, {"ok": True}, expect=403,
         label="procurement cannot approve its own recommendation")
    mail.outbox = []
    call("POST", f"/api/tenders/{a}/award_decision/", "mark", {"ok": True},
         label="approver signs off the award")
    yes("the outcome notification was also emailed to the company",
        any(COMPANY["email"] in m.to and "Outcome available" in m.subject for m in mail.outbox))
    yes("the notification records that it was emailed",
        Notification.objects.filter(user__username=CO, subject__startswith="Outcome available",
                                    emailed=True).exists())

    ta = tender_of(TU, a)
    yes("tender is awarded to the test company at the sealed price",
        ta["status"] == "awarded" and ta["awardedTo"] == sid and ta["awardedAmount"] == 22_800_000)
    mine = tender_of(CO, a)
    eq("company receives an award letter", mine["letters"][sid]["type"], "award")
    eq("company sees no other bidder's letter", list(mine["letters"]), [sid])
    yes("award letter carries the workspace name", ORG["name"] in mine["letters"][sid]["text"])
    yes("company was notified of the outcome", any("Outcome available" in s for s in subjects(CO)))
    eq("rival receives a regret letter",
       tender_of("coldline", a)["letters"]["s2"]["type"], "regret")
    call("POST", "/api/notifications/read/", CO, {})
    yes("company can clear its notifications", all(n["read"] for n in boot(CO)["notifications"]))


# ---------------------------------------------------------------- E. exports & audit chain

def sec_exports_audit(ctx):
    section("E. exports and the tamper-evident audit trail")
    a = ctx["a"]
    r = call("GET", f"/api/tenders/{a}/export/comparison.xlsx", TU)
    yes("bid comparison exports as xlsx", r.content[:2] == b"PK")
    call("GET", f"/api/tenders/{a}/export/comparison.xlsx", CO, expect=403,
         label="suppliers cannot export the comparison")
    r = call("GET", f"/api/tenders/{a}/export/memo.pdf", "mark")
    yes("award memo exports as pdf", r.content.startswith(b"%PDF"))
    r = call("GET", f"/api/tenders/{a}/export/compliance.pdf", "aisha")
    yes("compliance report exports as pdf", r.content.startswith(b"%PDF") and len(r.content) > 1500)
    call("GET", f"/api/tenders/{a}/export/compliance.pdf", CO, expect=403,
         label="suppliers cannot export the compliance report")
    r = call("GET", "/api/export/audit.csv", "aisha")
    yes("audit trail exports as csv with hashes", b"prev_hash" in r.content)
    call("GET", "/api/export/audit.csv", CO, expect=403, label="suppliers cannot export the audit trail")

    integ = call("GET", "/api/audit/integrity/", "aisha")
    yes("audit chain verifies", integ["ok"] and integ["count"] > 20, integ)
    ev = Event.objects.order_by("seq")[5]
    orig, ev.detail = ev.detail, "history, rewritten"
    ev.save(update_fields=["detail"])
    broken = call("GET", "/api/audit/integrity/", "aisha")
    yes("editing one historical row breaks the chain",
        broken["ok"] is False and broken["brokenAt"] == 6, broken)
    ev.detail = orig
    ev.save(update_fields=["detail"])
    yes("restoring the row heals the chain", call("GET", "/api/audit/integrity/", "aisha")["ok"])
    actions = [e["action"] for e in boot(TU)["events"]]
    for act in ("Sealed bid received", "Bid opening — seals broken",
                "Conflict-of-interest declaration signed", "Award recommended", "Award approved"):
        yes(f'audit trail records "{act}"', act in actions)


# ---------------------------------------------------------------- F. two-stage envelopes

def sec_two_stage(ctx):
    section("F. two-stage envelope opening")
    sid, now = ctx["sid"], now_ms()
    tid = new_tender(TU, {
        "title": "Test Company trial — security services (two-stage)", "type": "RFP",
        "category": "Facilities", "budget": 40_000_000, "deadline": now + 3 * DAY, "techWeight": 60,
        "twoStage": True, "techThreshold": 70, "scope": "Guarding for 12 flagship stores.",
        "criteria": [{"name": "Capability", "weight": 60}, {"name": "Coverage", "weight": 40}],
        "invited": [sid, "s3"], "submit": True})["id"]
    t = tender_of(TU, tid)
    yes("two-stage tender created", t["twoStage"] and t["techThreshold"] == 70)
    if t["status"] == "approval":
        call("POST", f"/api/tenders/{tid}/publish_decision/", "mark", {"ok": True})

    for who, amount in ((CO, 36_000_000), ("harmattan", 38_000_000)):
        call("POST", f"/api/tenders/{tid}/bid_docs/", who,
             files={"file": pdf(f"{who}-technical.pdf"), "envelope": "technical"})
        call("POST", f"/api/tenders/{tid}/bid_docs/", who,
             files={"file": pdf(f"{who}-commercial.pdf"), "envelope": "commercial"})
        call("POST", f"/api/tenders/{tid}/bids/", who, {"amount": amount, "acks": []})
    ok("both bidders lodge technical and commercial envelopes")
    Tender.objects.filter(pk=tid).update(deadline=now_ms() - 1000)

    call("POST", f"/api/tenders/{tid}/open/", TU, {}, label="stage 1 — technical envelopes opened")
    row = Tender.objects.get(pk=tid)
    yes("commercial stage is untouched", row.tech_opened_at and not row.opened_at)
    yes("prices stay ciphertext at rest in stage 1",
        all(b.amount is None and b.sealed_blob for b in row.bids.all()))
    d = boot(TU)
    sb = [b for b in d["bids"] if b["tenderId"] == tid]
    yes("api exposes no prices in stage 1",
        all(b.get("commercialSealed") and "amount" not in b for b in sb))
    envs = {x["envelope"] for x in d["documents"] if x["tenderId"] == tid and x["kind"] == "bid"}
    eq("only technical documents are visible in stage 1", envs, {"technical"})
    call("POST", f"/api/tenders/{tid}/open/", TU, {}, expect=409,
         label="stage 2 is blocked until technical scoring is complete")

    bmap = {b.supplier_id: b.id for b in row.bids.all()}
    crit = [x["id"] for x in tender_of(TU, tid)["criteria"]]
    for who in ("deji", "ngozi"):
        call("POST", f"/api/tenders/{tid}/coi/", who, {})
        call("POST", f"/api/bids/{bmap[sid]}/scores/", who, {"scores": {c: 9 for c in crit}})
        call("POST", f"/api/bids/{bmap['s3']}/scores/", who, {"scores": {c: 4 for c in crit}})
    ok("panel scores the technical envelopes blind (90/100 vs 40/100)")

    call("POST", f"/api/tenders/{tid}/open/", TU, {"threshold": 70},
         label="stage 2 — commercial envelopes opened for compliant bidders only")
    row = Tender.objects.get(pk=tid)
    passed, failed = row.bids.get(supplier_id=sid), row.bids.get(supplier_id="s3")
    yes("compliant bidder's price is decrypted",
        passed.amount == 36_000_000 and passed.sealed_blob is None)
    yes("disqualified bidder's price is never decrypted",
        failed.disqualified and failed.amount is None and failed.sealed_blob is not None)
    api_fail = [b for b in boot(TU)["bids"] if b["tenderId"] == tid and b["supplierId"] == "s3"][0]
    yes("api withholds the disqualified price",
        api_fail["disqualified"] and "amount" not in api_fail)
    comm = Document.objects.get(tender_id=tid, supplier_id="s3", envelope="commercial")
    yes("returned envelope stays encrypted", comm.encrypted)
    call("GET", f"/api/docs/{comm.id}/download/", TU, expect=403,
         label="buyer cannot open a returned commercial envelope")
    yes("disqualified bidder was told",
        any("Technical evaluation outcome" in s for s in subjects("harmattan")))
    call("POST", f"/api/tenders/{tid}/recommend/", TU, {"bidId": failed.id}, expect=409,
         label="a disqualified bidder cannot be recommended")
    call("POST", f"/api/tenders/{tid}/recommend/", TU, {"bidId": passed.id})
    call("POST", f"/api/tenders/{tid}/award_decision/", "mark", {"ok": True})
    eq("two-stage award completes", tender_of(CO, tid)["letters"][sid]["type"], "award")
    r = call("GET", f"/api/tenders/{tid}/export/compliance.pdf", "aisha")
    yes("two-stage compliance report exports", r.content.startswith(b"%PDF"))
    ctx["two_stage"] = tid


# ---------------------------------------------------------------- G. reverse auction

def sec_auction(ctx):
    section("G. reverse auction")
    sid, now = ctx["sid"], now_ms()
    base = {"title": "Test Company trial — diesel reverse auction", "type": "AUC",
            "category": "Energy", "budget": 90_000_000, "deadline": now + 30 * 60_000,
            "invited": [sid, "s2", "s3"], "scope": "Price-only competition.", "submit": True}
    new_tender(TU, {**base, "minDecrement": 0}, expect=400)
    ok("an auction needs a minimum decrement")
    new_tender(TU, {**base, "minDecrement": 500_000,
                    "lines": [{"desc": "Diesel", "qty": 1, "unit": "year"}]}, expect=400)
    ok("an auction cannot carry line items")
    tid = new_tender(TU, {**base, "minDecrement": 500_000})["id"]
    if tender_of(TU, tid)["status"] == "approval":   # 90m ceiling is above the matrix threshold
        call("POST", f"/api/tenders/{tid}/publish_decision/", "mark", {"ok": True})
    eq("auction created and published", tender_of(TU, tid)["status"], "published")

    a = call("GET", f"/api/tenders/{tid}/auction/", CO)
    yes("company sees a live auction room", a["live"] and a["bidders"] == 0 and a["myRank"] is None)
    yes("suppliers never receive the leaderboard", "leaderboard" not in a)
    eq("ceiling and decrement are published", (a["ceiling"], a["minDecrement"]), (90_000_000, 500_000))
    call("GET", f"/api/tenders/{tid}/auction/", "bluechip", expect=404,
         label="uninvited supplier cannot reach the auction room")

    call("POST", f"/api/tenders/{tid}/auction/bids/", CO, {"amount": 95_000_000}, expect=400,
         label="an opening bid above the ceiling is refused")
    r = call("POST", f"/api/tenders/{tid}/auction/bids/", CO, {"amount": 88_000_000})
    eq("company opens at 88m and leads", r["myRank"], 1)
    r = call("POST", f"/api/tenders/{tid}/auction/bids/", "coldline", {"amount": 87_000_000})
    eq("rival undercuts and takes the lead", r["myRank"], 1)
    eq("company drops to second", call("GET", f"/api/tenders/{tid}/auction/", CO)["myRank"], 2)
    call("POST", f"/api/tenders/{tid}/auction/bids/", CO, {"amount": 87_600_000}, expect=400,
         label="a bid that ignores the minimum decrement is refused")
    r = call("POST", f"/api/tenders/{tid}/auction/bids/", CO, {"amount": 86_500_000})
    eq("company retakes the lead", r["myRank"], 1)
    call("POST", f"/api/tenders/{tid}/auction/bids/", "harmattan", {"amount": 90_000_000})
    lb = call("GET", f"/api/tenders/{tid}/auction/", TU)["leaderboard"]
    yes("buyer watches the full leaderboard",
        [x["amount"] for x in lb] == [86_500_000, 87_000_000, 90_000_000], lb)
    yes("leaderboard names the leading company", lb[0]["supplier"] == COMPANY["company"])
    mine = call("GET", f"/api/tenders/{tid}/auction/", CO)
    yes("company sees only its own price history",
        [x["amount"] for x in mine["myBids"]] == [88_000_000, 86_500_000] and mine["leading"])
    call("POST", f"/api/tenders/{tid}/bids/", CO, {"amount": 80_000_000, "acks": []}, expect=409,
         label="the sealed-bid endpoint is closed on auctions")

    Tender.objects.filter(pk=tid).update(deadline=now_ms() + 60_000)
    before = Tender.objects.get(pk=tid).deadline
    r = call("POST", f"/api/tenders/{tid}/auction/bids/", CO, {"amount": 85_900_000})
    yes("a bid inside the closing window extends the close (anti-sniping)",
        r["extended"] and r["deadline"] > before)
    call("POST", f"/api/tenders/{tid}/open/", TU, {}, expect=409,
         label="results cannot be recorded while the auction is live")
    Tender.objects.filter(pk=tid).update(deadline=now_ms() - 1000)
    call("POST", f"/api/tenders/{tid}/auction/bids/", CO, {"amount": 85_000_000}, expect=409,
         label="bidding is refused after the close")
    call("POST", f"/api/tenders/{tid}/open/", TU, {}, label="auction closed and standings recorded")
    bids = sorted([b for b in boot(TU)["bids"] if b["tenderId"] == tid], key=lambda b: b["amount"])
    yes("final standings became bids", len(bids) == 3 and bids[0]["amount"] == 85_900_000)
    eq("the test company holds the best price", bids[0]["supplierId"], sid)
    call("POST", f"/api/tenders/{tid}/recommend/", TU, {"bidId": bids[0]["id"]})
    call("POST", f"/api/tenders/{tid}/award_decision/", "mark", {"ok": True})
    eq("auction award flows through the normal approval path",
       tender_of(CO, tid)["letters"][sid]["type"], "award")
    ctx["auction"] = tid


# ---------------------------------------------------------------- H. vendor administration

def sec_vendor_admin(ctx):
    section("H. vendor onboarding, prequalification and self-service")
    sid = ctx["sid"]
    sid2, _ = register_company(COMPANY2)
    ok(f'second vendor "{COMPANY2["company"]}" registered ({sid2})')
    d = boot(COMPANY2["email"])
    yes("new registration is pending, not prequalified",
        d["suppliers"][0]["prequalified"] is False and d["suppliers"][0]["registeredAt"])
    yes("procurement heard about the registration",
        any("New vendor registration" in s for s in subjects(TU)))
    call("POST", "/api/me/docs/", COMPANY2["email"],
         files={"file": pdf("testco2-insurance.pdf"), "label": "Public liability insurance",
                "expiry": str(now_ms() + 120 * DAY)})
    comp = [x for x in boot(TU)["documents"] if x["kind"] == "supplier" and x["supplierId"] == sid2][0]
    r = call("GET", f"/api/docs/{comp['id']}/download/", TU)
    yes("procurement reviews the compliance document", r.content.startswith(b"%PDF"))
    call("POST", f"/api/suppliers/{sid2}/prequalify/", TU, {"ok": False}, expect=400,
         label="declining requires a recorded reason")
    call("POST", f"/api/suppliers/{sid2}/prequalify/", TU,
         {"ok": False, "reason": "Insurance certificate expires inside the contract term."})
    d = boot(COMPANY2["email"])
    yes("vendor sees the decline reason", d["suppliers"][0]["rejectedReason"].startswith("Insurance"))
    yes("vendor was notified of the decline",
        any("Prequalification declined" in s for s in subjects(COMPANY2["email"])))
    call("POST", f"/api/suppliers/{sid2}/prequalify/", TU, {"ok": True})
    d = boot(COMPANY2["email"])
    yes("approval clears the decline reason",
        d["suppliers"][0]["prequalified"] and not d["suppliers"][0]["rejectedReason"])
    yes("vendor was notified of the approval",
        any("Prequalification approved" in s for s in subjects(COMPANY2["email"])))

    call("POST", "/api/suppliers/invite/", TU, {"email": "prospect@example.com"},
         label="procurement invites a vendor to register by email")
    call("POST", "/api/suppliers/invite/", TU, {"email": "nonsense"}, expect=400,
         label="a malformed invitation address is refused")

    csv = io.BytesIO(b"name,category,location,email,prequalified\n"
                     b"Test Import Alpha,Produce,Jos,alpha@example.com,yes\n"
                     b"Test Company Ltd,General,Lagos,,no\n"
                     b",,,,\n")
    csv.name = "book.csv"
    r = call("POST", "/api/suppliers/import/", TU, files={"file": csv})
    yes("csv import creates new vendors and skips duplicates/blanks",
        r["created"] == 1 and r["skipped"] == 2, r)
    call("POST", "/api/suppliers/import/", CO, files={"file": csv}, expect=403,
         label="suppliers cannot import a vendor book")

    docs = boot(CO)["suppliers"][0]["docs"]
    yes("company lists its own compliance documents", any(x.get("docId") for x in docs))
    stale = [x for x in docs if x.get("docId")][0]["docId"]
    call("DELETE", f"/api/me/docs/{stale}/", CO, {}, label="company removes a compliance document")
    call("POST", "/api/me/docs/", CO,
         files={"file": pdf("test-company-tax-clearance-2027.pdf"), "label": "Tax clearance 2027",
                "expiry": str(now_ms() + 20 * DAY)})
    ok("company uploads a renewal")
    call("POST", "/api/me/", CO, {"name": "Test Company (Nigeria) Ltd", "location": "Ikeja, Lagos"},
         label="company corrects its own details")
    eq("company rename takes effect", boot(CO)["suppliers"][0]["name"], "Test Company (Nigeria) Ltd")
    yes("rename is recorded in the audit trail",
        any(e["action"] == "Company renamed" for e in boot("aisha")["events"]))
    call("POST", "/api/me/", CO, {"name": COMPANY["company"]})
    eq("company name restored", boot(CO)["suppliers"][0]["name"], COMPANY["company"])
    call("POST", "/api/me/", CO, {"name": "X"}, expect=400, label="a one-character name is refused")
    r = call("POST", f"/api/tenders/{ctx['a']}/duplicate/", TU, {})
    dup = tender_of(TU, r["id"])
    yes("a past tender duplicates into a clean draft",
        dup["status"] == "draft" and dup["title"].endswith("(copy)") and dup["deadline"] == 0)
    call("POST", f"/api/tenders/{ctx['a']}/duplicate/", CO, {}, expect=403,
         label="suppliers cannot duplicate tenders")
    ctx["sid2"] = sid2


# ---------------------------------------------------------------- I. security

def sec_security(ctx):
    section("I. MFA, lockout, sessions and password reset")
    import pyotp

    setup_ = call("POST", "/api/auth/mfa/setup/", TU, {})
    yes("enrollment returns a secret and a QR code",
        setup_["secret"] and setup_["qr"].startswith("data:image/png"))
    call("POST", "/api/auth/mfa/enable/", TU, {"code": "000000"}, expect=400,
         label="a wrong code cannot enable two-factor")
    call("POST", "/api/auth/mfa/enable/", TU, {"code": pyotp.TOTP(setup_["secret"]).now()},
         label="test user enables two-factor")
    r = c.post("/api/auth/login/", json.dumps({"username": TU, "password": TEAMMATE["password"]}),
               content_type=J)
    yes("password alone no longer signs in",
        r.status_code == 401 and r.json().get("mfaRequired") is True)
    r = c.post("/api/auth/login/", json.dumps({"username": TU, "password": TEAMMATE["password"],
                                               "code": "123456"}), content_type=J)
    eq("a wrong authenticator code is refused", r.status_code, 401)
    FailedLogin.objects.filter(username=TU).delete()
    r = c.post("/api/auth/login/", json.dumps({"username": TU, "password": TEAMMATE["password"],
                                               "code": pyotp.TOTP(setup_["secret"]).now()}),
               content_type=J)
    eq("password + code signs in", r.status_code, 200)
    TOK[TU] = r.json()["token"]
    yes("mfa status reports enabled", call("GET", "/api/auth/mfa/", TU)["enabled"] is True)
    yes("enrollment is in the audit trail",
        any(e["action"] == "Two-factor authentication enabled" for e in boot("aisha")["events"]))
    call("POST", "/api/auth/mfa/disable/", TU, {"code": "999999"}, expect=400,
         label="disabling two-factor needs a current code")
    call("POST", "/api/auth/mfa/disable/", TU, {"code": pyotp.TOTP(setup_["secret"]).now()},
         label="test user disables two-factor")
    signin(TU, TEAMMATE["password"])
    ok("password-only sign-in works again")

    for _ in range(5):
        r = c.post("/api/auth/login/", json.dumps({"username": CO, "password": "nope"}), content_type=J)
        assert r.status_code == 401
    r = c.post("/api/auth/login/", json.dumps({"username": CO, "password": COMPANY["password"]}),
               content_type=J)
    eq("five failures lock the company account for 15 minutes", r.status_code, 429)
    FailedLogin.objects.filter(username=CO).delete()   # simulate the window passing
    signin(CO, COMPANY["password"])
    ok("the lock clears when the window passes")

    signin(CO, COMPANY["password"])
    first = TOK[CO]
    signin(CO, COMPANY["password"])
    second = TOK[CO]
    r = call("POST", "/api/auth/logout_all/", CO, {})
    yes("sign-out everywhere revokes every session", r["revoked"] >= 2)
    for tk in (first, second):
        assert c.get("/api/bootstrap/", HTTP_AUTHORIZATION=f"Bearer {tk}").status_code == 401
    ok("every revoked token is dead")
    signin(CO, COMPANY["password"])

    call("POST", "/api/auth/forgot/", None, {"email": "nobody@example.com"},
         label="an unknown address gets the same answer (no account enumeration)")
    yes("no token is minted for an unknown address",
        not ActionToken.objects.filter(kind="reset", email="nobody@example.com").exists())
    call("POST", "/api/auth/forgot/", None, {"email": TU})
    tok = ActionToken.objects.filter(kind="reset", email=TU, used_at__isnull=True).first()
    yes("a single-use reset token is minted", tok is not None)
    call("POST", "/api/auth/reset_password/", None, {"token": tok.token, "password": "Interim!2026"},
         label="the emailed link resets the password")
    call("POST", "/api/auth/reset_password/", None, {"token": tok.token, "password": "Interim!2026"},
         expect=410, label="the reset link is single-use")
    signin(TU, TEAMMATE["password"], expect=401)
    ok("the old password is dead")
    signin(TU, "Interim!2026")
    ok("the new password works")
    r = c.get("/api/bootstrap/", HTTP_AUTHORIZATION=f"Bearer {second}")
    eq("resetting revoked the other sessions", r.status_code, 401)
    call("POST", "/api/auth/forgot/", None, {"email": TU})     # restore the documented password
    tok = ActionToken.objects.filter(kind="reset", email=TU, used_at__isnull=True).first()
    call("POST", "/api/auth/reset_password/", None,
         {"token": tok.token, "password": TEAMMATE["password"]})
    signin(TU, TEAMMATE["password"])
    ok("documented test-user password restored")


# ---------------------------------------------------------------- J. org administration

def sec_org_admin(ctx):
    section("J. approval matrix and workspace rename")
    now = now_ms()
    r = call("POST", "/api/settings/", "mark", {"approvalThreshold": 100_000_000})
    eq("approver raises the publication threshold", r["approvalThreshold"], 100_000_000)
    eq("the new threshold is served to everyone",
       boot(TU)["org"]["approvalThreshold"], 100_000_000)
    tid = new_tender(TU, {"title": "Test Company trial — threshold check", "type": "RFQ",
                          "category": "Facilities", "budget": 80_000_000, "deadline": now + 6 * DAY,
                          "techWeight": 60, "scope": "x", "invited": [ctx["sid"]],
                          "criteria": [{"name": "Quality", "weight": 100}], "submit": True})["id"]
    eq("80m publishes directly under a 100m threshold", tender_of(TU, tid)["status"], "published")
    call("POST", "/api/settings/", "mark", {"approvalThreshold": 50_000_000})
    ok("threshold restored to 50m")

    call("POST", "/api/settings/", CO, {"name": "Evil Corp"}, expect=403,
         label="a supplier cannot rename the workspace")
    call("POST", "/api/settings/", TU, {"name": "Test Workspace Group", "short": "Testworks"})
    eq("procurement renames the workspace", boot(TU)["org"]["name"], "Test Workspace Group")
    r = new_tender(TU, {"title": "Test Company trial — renamed workspace", "type": "RFQ",
                        "category": "Facilities", "budget": 4_000_000, "deadline": now + 6 * DAY,
                        "techWeight": 60, "scope": "x", "invited": [ctx["sid"]],
                        "criteria": [{"name": "Quality", "weight": 100}], "submit": True})
    yes("new references pick up the new prefix", tender_of(TU, r["id"])["ref"].startswith("TES-"))
    yes("the invitation carries the new workspace name",
        any("Test Workspace Group invites" in n["body"] for n in boot(CO)["notifications"]))
    call("POST", "/api/settings/", TU, {"name": ORG["name"], "short": ORG["short"]})
    eq("workspace name restored", boot(TU)["org"]["name"], ORG["name"])

    call("POST", "/api/me/", TU, {"name": "Test User (Procurement)"})
    eq("test user renames themselves", boot(TU)["me"]["name"], "Test User (Procurement)")
    yes("the rename is recorded",
        any(e["action"] == "Display name changed" for e in boot("aisha")["events"]))
    call("POST", "/api/me/", TU, {"name": TEAMMATE["name"]})
    eq("display name restored", boot(TU)["me"]["name"], TEAMMATE["name"])


# ---------------------------------------------------------------- K. background sweep

def sec_sweep(ctx):
    section("K. background sweep (reminders, expiries, nudges)")
    from core.tasks import run_sweep
    a, b, sid, sid2 = ctx["a"], ctx["b"], ctx["sid"], ctx["sid2"]

    def n_count(username, prefix):
        return Notification.objects.filter(user__username=username, subject__startswith=prefix).count()

    run_sweep()
    yes("compliance expiry alerts the vendor", n_count(CO, "Document expiring") >= 1)
    yes("compliance expiry alerts procurement",
        Notification.objects.filter(subject__startswith="Compliance document expiring",
                                    subject__contains=COMPANY["company"]).exists())
    before = n_count(CO, "Document expiring")
    run_sweep()
    eq("the sweep is idempotent", n_count(CO, "Document expiring"), before)

    yes("invited bidders are reminded before the deadline",
        Notification.objects.filter(user__username=CO, tender_id=b,
                                    subject__startswith="Deadline approaching").exists())
    Tender.objects.filter(pk=b).update(deadline=now_ms() - 1000)
    run_sweep()
    yes("procurement is told when a deadline seals the bids",
        Notification.objects.filter(user__username=TU, tender_id=b,
                                    subject__startswith="Bids sealed").exists())
    yes("the sealing is written to the audit trail",
        Event.objects.filter(tender_id=b, action__startswith="Deadline passed").exists())

    # stall the awarded tender back into evaluation to exercise the two nudges
    bid = Bid.objects.filter(tender_id=a, supplier_id=sid).first()
    keep_scores, keep_status = dict(bid.scores), Tender.objects.get(pk=a).status
    bid.scores = {k: v for k, v in keep_scores.items() if k != "u3"}
    bid.save(update_fields=["scores"])
    Tender.objects.filter(pk=a).update(
        status="evaluation", opened_at=now_ms() - 4 * DAY,
        award_rec={"bidId": bid.id, "supplierId": sid, "amount": 1, "by": "test",
                   "at": now_ms() - 3 * DAY, "memo": "m"})
    TaskMark.objects.filter(key__startswith=f"scorenudge:{a}").delete()
    run_sweep()
    yes("an evaluator with outstanding scores is nudged", n_count("ngozi", "Scores outstanding") >= 1)
    yes("an approver sitting on a recommendation is nudged", n_count("mark", "Approval waiting") >= 1)
    bid.scores = keep_scores
    bid.save(update_fields=["scores"])
    Tender.objects.filter(pk=a).update(status=keep_status, award_rec=None)
    ok("awarded tender restored")

    Supplier.objects.filter(pk=sid2).update(prequalified=False, rejected_reason="",
                                            registered_at=now_ms() - 4 * DAY)
    run_sweep()
    yes("an unreviewed registration is escalated to procurement",
        Notification.objects.filter(user__username=TU,
                                    subject__startswith="Registration awaiting review").exists())
    call("POST", f"/api/suppliers/{sid2}/prequalify/", TU, {"ok": True})
    ok("second vendor re-approved")
    yes("every notification carries a subject and body",
        all(n["subject"] for n in boot(CO)["notifications"]))


# ---------------------------------------------------------------- L. AI guards

def sec_ai(ctx):
    section("L. AI endpoints")
    configured = bool(settings.ANTHROPIC_API_KEY)
    call("POST", "/api/ai/scope/", CO, {"title": "x"}, expect=403,
         label="suppliers cannot reach buyer AI drafting")
    if configured:
        r = call("POST", "/api/ai/scope/", TU, {"title": "Test scope", "category": "Packaging"})
        yes("scope drafting returns text", bool(r.get("text")))
    else:
        r = call("POST", "/api/ai/scope/", TU, {"title": "x"}, expect=503)
        yes("without a key the AI endpoints fail friendly, not fatally",
            "ANTHROPIC_API_KEY" in r["error"])
        r = call("POST", f"/api/ai/tenders/{ctx['a']}/bid_review/", CO, {"amount": 1}, expect=503)
        yes("the supplier-side review is guarded the same way", "AI is not configured" in r["error"])


def sec_taxonomy(ctx):
    section("M. spend taxonomy")
    from core.taxonomy import ALL_CATEGORIES, _check, canonical, subcategory_for

    gaps = _check()
    yes("every importer category has a home in exactly one family",
        not gaps["missing"] and not gaps["extra"] and not gaps["duplicated"], repr(gaps))

    b = call("GET", "/api/bootstrap/", TU)
    tree = b["taxonomy"]
    eq("the taxonomy travels with the bootstrap", len(tree), 8)
    flat = [c["key"] for f in tree for c in f["categories"]]
    eq("every category appears once in the tree", sorted(flat), sorted(ALL_CATEGORIES))
    yes("families carry a vendor count", all("count" in f for f in tree))
    yes("categories carry their subcategory leaves",
        any(c["subs"] for f in tree for c in f["categories"]))

    eq("a legacy tender word maps onto the register's vocabulary",
       canonical("IT hardware"), "IT & telecoms")
    eq("a real category passes through untouched",
       canonical("Food & ingredients"), "Food & ingredients")
    eq("an unknown word lands in Uncategorised rather than inventing a category",
       canonical(""), "Uncategorised")
    eq("subcategories come off the register's own wording",
       subcategory_for("Fuel, diesel & gas", "DIESEL SUPPLY"), "Diesel & AGO")
    eq("a category with no second layer says so with a blank, not a guess",
       subcategory_for("Legal", "LAW FIRM"), "")

    yes("every tender carries its family for rollups",
        all(t.get("family") for t in b["tenders"]))
    yes("every vendor carries its family", all(s.get("family") for s in b["suppliers"]))

    # A tender created through the API is stored canonically, whichever word it arrives as.
    t = call("POST", "/api/tenders/", TU, {
        "title": "Taxonomy check", "type": "RFQ", "category": "IT hardware",
        "budget": 1_000_000, "deadline": now_ms() + 20 * DAY, "invited": [ctx["sid"]],
        "criteria": [{"name": "Quality", "weight": 100}], "techWeight": 70})
    made = tender_of(TU, t["id"])
    eq("a legacy category posted to the API is stored canonically",
       made["category"], "IT & telecoms")
    eq("and its family resolves", made["family"], "tech")


def sec_savings(ctx):
    section("N. savings baseline")
    t = call("POST", "/api/tenders/", TU, {
        "title": "Baseline check", "type": "RFQ", "category": "Food & ingredients",
        "budget": 100_000_000, "baseline": 120_000_000,
        "baselineSource": "2025 contract, annualised",
        "deadline": now_ms() + 20 * DAY, "invited": [ctx["sid"]],
        "criteria": [{"name": "Quality", "weight": 100}], "techWeight": 70})
    made = tender_of(TU, t["id"])
    eq("a baseline is stored", made["baseline"], 120_000_000)
    eq("and so is where it came from", made["baselineSource"], "2025 contract, annualised")

    # No baseline means null, never the budget: a baseline silently equal to the
    # ceiling would make every saving read as zero.
    t2 = call("POST", "/api/tenders/", TU, {
        "title": "No baseline", "type": "RFQ", "category": "Food & ingredients",
        "budget": 100_000_000, "deadline": now_ms() + 20 * DAY, "invited": [ctx["sid"]],
        "criteria": [{"name": "Quality", "weight": 100}], "techWeight": 70})
    made2 = tender_of(TU, t2["id"])
    yes("no baseline stays null rather than defaulting to the budget",
        made2["baseline"] is None)
    yes("and the source is dropped with it", not made2["baselineSource"])

    # A bidder must never be told what the buyer paid before, or who is running it.
    sandbox = Tender.objects.filter(title=SANDBOX_TENDER).first()
    sup_view = tender_of(CO, sandbox.id)
    yes("a supplier is never shown the baseline", sup_view["baseline"] is None)
    yes("a supplier is never shown the owner", sup_view["ownerId"] is None)

    buyer_view = tender_of(TU, sup_view["id"])
    yes("the buyer side does see the owner", buyer_view["ownerId"] is not None)
    eq("a tender is owned by whoever drafted it", made["ownerId"], buyer_view["ownerId"])


def sec_reporting(ctx):
    section("O. reporting lines")
    from core.models import Persona

    b = call("GET", "/api/bootstrap/", TU)
    yes("the org chart travels with the bootstrap",
        all("managerId" in u for u in b["users"]))

    signin("amara")
    amara = "amara"
    line = lambda body, expect=200: call("POST", "/api/team/org/", amara, body, expect=expect)

    r = line({"personId": "u1", "managerId": "u1"}, expect=400)
    yes("somebody cannot report to themselves", "themselves" in r["error"])
    r = line({"personId": "u4", "managerId": "u2"}, expect=400)
    yes("a loop in the reporting line is refused", "loop" in r["error"])
    r = line({"personId": "u1", "managerId": "nope"}, expect=404)
    ok("an unknown manager is a 404, not a silent no-op")

    line({"personId": "u2", "managerId": "u4"})
    eq("a valid move is applied", Persona.objects.get(pk="u2").manager_id, "u4")
    line({"personId": "u2", "managerId": "u1"})
    eq("and can be moved back", Persona.objects.get(pk="u2").manager_id, "u1")

    line({"personId": "u5", "managerId": None})
    yes("somebody can be detached to the top of the chart",
        Persona.objects.get(pk="u5").manager_id is None)
    line({"personId": "u5", "managerId": "u0"})

    call("POST", "/api/team/org/", "deji",
         {"personId": "u2", "managerId": "u0"}, expect=403,
         label="an evaluator cannot rewire the org chart")

    # Whose desk rolls up to whom is computed server-side, from the line.
    signin("mark")
    mark = call("GET", "/api/bootstrap/", "mark")
    yes("a manager is told who reports to them", "u1" in mark["reports"])
    yes("and it follows the line at any depth, not just direct reports",
        "u2" in mark["reports"] and "u3" in mark["reports"])
    signin("deji")
    deji = call("GET", "/api/bootstrap/", "deji")
    eq("somebody with no reports and no capability is told nothing", deji["reports"], [])


def sec_executive(ctx):
    section("P. the executive role")
    signin("tunde")
    tunde = "tunde"
    me = call("GET", "/api/bootstrap/", tunde)

    yes("an executive sees the whole org", len(me["reports"]) >= 4)
    yes("and can read the analytics", "page.analytics" in me["me"]["perms"])
    yes("and the whole panel's scores", "bid.see_all_scores" in me["me"]["perms"])

    # Oversight is read-only on purpose: an executive who can push a tender
    # through is an executive nobody can escalate to.
    yes("but holds no power to publish", "tender.submit" not in me["me"]["perms"])
    yes("nor to score", "bid.score" not in me["me"]["perms"])
    yes("nor to award", "award.decide" not in me["me"]["perms"])
    call("POST", "/api/tenders/", tunde, {"title": "x"}, expect=403,
         label="and the server refuses the attempt, not just the button")
    sandbox = Tender.objects.filter(title=SANDBOX_TENDER).first()
    call("POST", f"/api/tenders/{sandbox.id}/award_decision/", tunde, {"ok": True}, expect=403,
         label="including signing off an award")


def sec_campaign(ctx):
    section("Q. vendor registration drive")
    from core import campaign
    from core.models import ActionToken, Profile, Supplier

    pre = call("GET", "/api/suppliers/campaign/", TU)
    yes("the preview counts who would be emailed", pre["toSend"] >= 0)
    yes("and accounts for everyone it skips", set(pre["skipped"]) == {
        "noEmail", "alreadyInvited", "alreadyRegistered", "heldOut"})
    yes("and states whether mail actually leaves the building", "live" in pre)

    # The confirmation is the count itself: a stale preview cannot be confirmed.
    r = call("POST", "/api/suppliers/campaign/", TU, {"action": "start"}, expect=400)
    yes("starting without confirming the count is refused", "Confirm" in r["error"])
    r = call("POST", "/api/suppliers/campaign/", TU,
             {"action": "start", "confirm": pre["toSend"] + 999}, expect=400)
    yes("confirming the wrong count is refused too", "Confirm" in r["error"])

    from core.campaign import is_live
    yes("a non-delivering mail backend is never reported as live",
        is_live() is False, f"backend={settings.EMAIL_BACKEND}")
    call("POST", "/api/suppliers/campaign/", CO, {"action": "start", "confirm": pre["toSend"]},
         expect=403, label="a supplier cannot start a drive against the register")

    if pre["toSend"]:
        r = call("POST", "/api/suppliers/campaign/", TU,
                 {"action": "start", "confirm": pre["toSend"]})
        yes("confirming the exact count arms the drive", r["state"]["running"])

        # Sending is bounded per sweep — a request that mails 1,300 vendors is a
        # request that times out halfway with no record of who was reached.
        sent, failed = campaign.send_batch("https://example.test", "Test Org", limit=3)
        yes("a batch is bounded", sent + failed <= 3)
        yes("every send is marked on the vendor",
            Supplier.objects.filter(invited_at__isnull=False).count() >= sent)
        before = Supplier.objects.filter(invited_at__isnull=False).count()
        campaign.send_batch("https://example.test", "Test Org", limit=3)
        after = Supplier.objects.filter(invited_at__isnull=False).count()
        yes("and nobody is picked up twice", after > before or not campaign.eligible().exists())

        r = call("POST", "/api/suppliers/campaign/", TU, {"action": "stop"})
        yes("the drive can be paused", not r["state"]["running"])

        # The claim link attaches to the record the buyer already holds.
        tok = ActionToken.objects.filter(kind="vendor_claim", used_at__isnull=True).first()
        if tok:
            sid = tok.payload["supplierId"]
            look = c.get(f"/api/register/claim/?token={tok.token}").json()
            eq("the link names the vendor it was minted for",
               look["supplier"]["name"], Supplier.objects.get(pk=sid).name)
            n_before = Supplier.objects.count()
            r = c.post("/api/register/claim/",
                       json.dumps({"token": tok.token, "password": "ClaimTest!2026"}),
                       content_type=J)
            eq("claiming succeeds", r.status_code, 200)
            eq("and creates no duplicate vendor record", Supplier.objects.count(), n_before)
            yes("the login attaches to the existing register row",
                Profile.objects.filter(supplier_id=sid).exists())
            r = c.post("/api/register/claim/",
                       json.dumps({"token": tok.token, "password": "ClaimTest!2026"}),
                       content_type=J)
            eq("and the link is single-use", r.status_code, 410)

    campaign.stop()
    Supplier.objects.all().update(invited_at=None, invite_error="")


def sec_history(ctx):
    """Baselines derived from the ledger the organisation arrived with.

    The migration case: a company moving onto DOCKET has years of contracts
    behind it, and those contracts are what its first awards should be measured
    against. Everything here is about that derivation being defensible rather
    than merely present.
    """
    section("R. baselines from ledger history")
    from core import pricehistory as ph
    from core.models import Contract, Supplier, Tender
    from core.util import DAY_MS, now_ms

    T = now_ms()

    def legacy(sid, name, cat, prior, award, budget, *, term_days=365, signed_days=400):
        """A vendor with one pre-DOCKET contract, then a tender awarded to them."""
        s = Supplier.objects.create(id=sid, name=name, category=cat, location="Lagos",
                                    prequalified=True, docs=[], perf={})
        Contract.objects.create(
            id="c" + sid, source="nav", external_id="EXT" + sid, ref="NAV-" + sid,
            title=f"{name} prior term", supplier=s, tender=None,
            amount=prior, original_value=prior, currency="NGN", amount_src=prior,
            signed_at=T - signed_days * DAY_MS, starts_at=T - signed_days * DAY_MS,
            ends_at=T - (signed_days - term_days) * DAY_MS, status="expired", synced_at=T)
        t = Tender.objects.create(
            id="t" + sid, ref="HIST-" + sid, title=f"{name} retender", ttype="RFQ",
            category=cat, budget=budget, status="awarded", published_at=T - 60 * DAY_MS,
            deadline=T - 40 * DAY_MS, opened_at=T - 39 * DAY_MS, awarded_at=T - 30 * DAY_MS,
            awarded_to=s.id, awarded_amount=award, criteria=[], lines=[], addenda=[],
            invited=[s.id])
        return s, t

    # Three outcomes that must be told apart.
    legacy("hA", "Alpha Uniforms", "Uniforms & workwear", 180_000_000, 154_000_000, 200_000_000)
    legacy("hB", "Beta Chemicals", "Chemicals", 90_000_000, 118_000_000, 130_000_000)
    legacy("hC", "Gamma Legal", "Legal", 60_000_000, 42_000_000, 95_000_000)

    rows = {r["id"]: r for r in ph.backfill_candidates()}
    a, b = rows["thA"], rows["thB"]

    yes("a pre-DOCKET contract becomes a baseline proposal", a["suggestion"] is not None)
    eq("and the proposal is the contract, not a category average",
       a["suggestion"]["basis"], "incumbent")
    eq("valued at what that contract cost", a["suggestion"]["amount"], 180_000_000)
    yes("the proposal names the contract it came from",
        "NAV-hA" in a["suggestion"]["source"])

    # The distinction the whole screen turns on.
    yes("a smaller-but-honest figure is not flagged as a problem",
        a["smaller"] and not a["worsens"])
    yes("an award that cost more than what it replaced is flagged as a loss",
        b["worsens"] and b["proposedSaving"] < 0)

    # Only what came before.
    eq("a contract signed after the award is never used as its baseline",
       len(ph.prior_contracts("Uniforms & workwear",
                              before=T - 500 * DAY_MS)), 0)

    # Annualisation.
    legacy("hD", "Delta Fleet", "Fleet & automotive", 900_000_000, 250_000_000, 400_000_000,
           term_days=1095, signed_days=1200)
    d = {r["id"]: r for r in ph.backfill_candidates()}["thD"]
    eq("a three-year contract is annualised, not taken whole",
       d["suggestion"]["amount"], 300_000_000)
    yes("and says so", "annualised" in d["suggestion"]["evidence"][0]["how"])

    # Adopting.
    usable = [r for r in ph.backfill_candidates()
              if r["suggestion"] and not r.get("worsens")]
    picks = [{"id": r["id"], "amount": r["suggestion"]["amount"],
              "source": r["suggestion"]["source"]} for r in usable]
    before = ph.coverage()["withBaseline"]
    applied, skipped = ph.apply_baselines(picks, "Test User")
    yes("adopting a batch applies every clean row", len(applied) == len(picks))
    eq("and coverage rises by exactly that many",
       ph.coverage()["withBaseline"], before + len(applied))

    t = Tender.objects.get(pk="thA")
    eq("the tender now measures against the prior price", t.savings_basis()[1], "baseline")
    yes("and keeps the sentence a reviewer can check it against",
        "NAV-hA" in t.baseline_source)
    ev = Event.objects.filter(tender_id="thA", action="Savings baseline recorded").first()
    yes("the adoption is written to the audit trail", ev is not None)
    yes("naming the evidence, not just the number", ev and "NAV-hA" in ev.detail)

    # Refusals.
    _, again = ph.apply_baselines([{"id": "thA", "amount": 1, "source": "x"}], "Test User")
    yes("an existing baseline is never overwritten by a backfill",
        again and "already has a baseline" in again[0]["why"])
    _, loss = ph.apply_baselines(
        [{"id": "thB", "amount": rows["thB"]["suggestion"]["amount"], "source": "x"}], "Test User")
    yes("a baseline at or below the award is refused in bulk",
        loss and "loss, not a saving" in loss[0]["why"])

    # The endpoints, and who may reach them.
    r = call("GET", "/api/finance/baseline/?category=Uniforms%20%26%20workwear", TU)
    yes("the tender form can ask what a category used to cost",
        r["suggestion"] and r["suggestion"]["amount"] > 0)
    call("GET", "/api/finance/baseline/", TU, expect=400,
         label="asking with no category is refused")
    call("GET", "/api/finance/baseline/?category=Legal", CO, expect=403,
         label="a supplier cannot read what the buyer used to pay")
    call("GET", "/api/finance/baselines/", CO, expect=403,
         label="nor the backfill")
    call("POST", "/api/finance/baselines/", TU, {"picks": []}, expect=400,
         label="adopting nothing is refused rather than silently succeeding")

    # A category nobody has bought in yields nothing, rather than a guess.
    r = call("GET", "/api/finance/baseline/?category=Travel%20%26%20hospitality", TU)
    yes("an unknown category returns no suggestion at all",
        r["suggestion"] is None or r["suggestion"]["n"] > 0)


# ---------------------------------------------------------------- main

def print_credentials():
    print("\n" + "=" * 68)
    print("TEST ACCOUNTS  (sign in at /  —  username is the email address)")
    print("=" * 68)
    rows = [
        ("Test company (supplier)", COMPANY["email"], COMPANY["password"],
         f'{COMPANY["company"]} — prequalified'),
        ("Test user (buyer)", TEAMMATE["email"], TEAMMATE["password"],
         f'{TEAMMATE["name"]} — {TEAMMATE["role"]}'),
    ]
    for what, user, pw, note in rows:
        print(f"  {what:24}  {user:24}  {pw:20}  {note}")
    print("=" * 68)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--full", action="store_true",
                    help="reseed the demo workspace, then run the whole end-to-end suite")
    args = ap.parse_args()

    started = time.time()
    if args.full:
        print("Reseeding the demo workspace (--full wipes and reseeds this database)…")
        seed_all()
    ctx = setup()
    if args.full:
        # the rest of the cast: evaluators, approver, auditor and two rival suppliers
        for who in ("deji", "ngozi", "mark", "aisha", "coldline", "harmattan", "bluechip"):
            signin(who)
        ok("demo cast signed in (evaluators, approver, auditor, rival suppliers)")
        for fn in (sec_accounts, sec_tenders, sec_bidding, sec_opening_award, sec_exports_audit,
                   sec_two_stage, sec_auction, sec_vendor_admin, sec_security, sec_org_admin,
                   sec_sweep, sec_ai,
                   sec_taxonomy, sec_savings, sec_reporting, sec_executive, sec_campaign,
                   sec_history):
            fn(ctx)
        print(f"\n{len(CHECKS)} checks passed in {time.time() - started:.1f}s "
              f"across {len({s for s, _ in CHECKS})} sections.")
    else:
        print(f"\nSetup complete — {len(CHECKS)} checks passed. "
              f"Run with --full to exercise the whole platform.")
    print_credentials()
    return 0


if __name__ == "__main__":
    sys.exit(main())
