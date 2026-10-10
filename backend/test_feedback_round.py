"""The October 2026 feedback round, end to end through the API.

    python test_feedback_round.py

  OPTIONAL MAXIMUMS. A tender can go out with no maximum price on its lines.
  It then has no ceiling, and where there is an approval threshold it goes for
  sign-off rather than slipping under it.

  THE CEILING CAN BE SHOWN. Only when the buyer ticks it, and only the total.

  CLOSING TIME. The deadline is a moment, not a day.

  OPEN TENDERS. Vendors see their own position (never a price or a name) and
  change their bid in place. The buying side still sees nothing until opening.

  QUANTITIES. A vendor says how much of each line they can supply. The amount
  is what they would actually charge, and scoring compares like with like.

  NEW VENDORS WAIT FOR AUDIT. A company not on the register can bid, but the
  bid is held. Opening waits for audit. Approving registers the company and
  releases its other held bids; turning it down needs a reason and the bid is
  never opened.

  DUPLICATES. Tenders and auctions copy into new drafts with the new settings.

  AUCTION STEP AS A PERCENTAGE. Capped at 50%.

  EXISTING VENDORS ARE REGISTERED. The migration marks them and does not queue
  a reminder for each.
"""
import importlib
import os
import sys

import django

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "docket.settings")
os.environ.setdefault("DEMO_LOGIN", "0")
django.setup()

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

from django.conf import settings                           # noqa: E402
from django.contrib.auth.models import User                # noqa: E402
from django.test import Client                             # noqa: E402
from django.test.utils import setup_test_environment       # noqa: E402
from django.test.runner import DiscoverRunner              # noqa: E402

settings.EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
settings.DEMO_LOGIN = False

setup_test_environment()
_runner = DiscoverRunner(verbosity=0, interactive=False)
_old_db = _runner.setup_databases()

from core.models import (Auction, AuctionLot, AuctionParticipant, AuthToken, Bid,   # noqa: E402
                         Document, OrgSetting, Persona, Profile, Supplier, TaskMark, Tender)
from core.util import DAY_MS, comm_score, now_ms, rid                                # noqa: E402

PASSED, FAILED = [], []
c = Client()
J = "application/json"


def ok(label, cond, extra=""):
    (PASSED if cond else FAILED).append(label)
    print(("  PASS  " if cond else "  FAIL  ") + label + ("" if cond else f"  - {extra}"))


def buyer(name, role):
    p = Persona.objects.create(id=rid("u"), name=name, role=role, title=role.title())
    u = User.objects.create_user(username=f"{p.id}@x.test", password="x")
    Profile.objects.create(user=u, persona=p)
    return p, AuthToken.objects.create(key=rid("k") + rid("k"), user=u, created=now_ms()).key


def vendor(name, registered=True):
    s = Supplier.objects.create(id=rid("s"), name=name, category="Packaging", location="Lagos",
                                contact_email=f"{name.split()[0].lower()}@x.test",
                                registered_at=now_ms() if registered else None)
    u = User.objects.create_user(username=f"{s.id}@x.test", password="x")
    Profile.objects.create(user=u, supplier=s)
    return s, AuthToken.objects.create(key=rid("k") + rid("k"), user=u, created=now_ms()).key


def call(method, path, key, body=None):
    fn = getattr(c, method.lower())
    r = fn(path, body if body is not None else {}, content_type=J, HTTP_AUTHORIZATION="Bearer " + key)
    try:
        return r.status_code, r.json()
    except ValueError:
        return r.status_code, {}


def boot(key):
    return call("GET", "/api/bootstrap/", key)[1]


def tender_for(key, tid):
    return next((t for t in boot(key)["tenders"] if t["id"] == tid), None)


PROC, PROC_K = buyer("Amara Okafor", "procurement")
AUD, AUD_K = buyer("Aisha Bello", "auditor")
A, A_K = vendor("Alpha Packaging")
B, B_K = vendor("Beta Packaging")
N, N_K = vendor("Newco Packaging", registered=False)

BASE = {
    "title": "Cups and boxes", "type": "RFQ", "category": "Packaging", "techWeight": 60,
    "criteria": [{"name": "Quality", "weight": 100}],
    "scope": "Supply.", "invited": [A.id, B.id, N.id],
    "technicalDocumentRequired": False,
}


def make(extra, submit=True):
    code, out = call("POST", "/api/tenders/", PROC_K, {**BASE, **extra, "submit": submit})
    assert code == 200, out
    return Tender.objects.get(pk=out["id"])


# ---------------------------------------------------------------- maximums
print("\n-- optional maximums, visible ceiling, closing time")
OrgSetting.objects.update_or_create(pk=1, defaults={"data": {"approvalThreshold": 1_000_000_000}})
t = make({"deadline": now_ms() + 2 * DAY_MS,
          "lines": [{"desc": "Cups", "qty": 100, "unit": "box"}]})
ok("a tender with no maximums is accepted", t.budget == 0, t.budget)
ok("and with a threshold set it waits for sign-off instead of publishing",
   t.status == "approval", t.status)

OrgSetting.objects.update_or_create(pk=1, defaults={"data": {"approvalThreshold": 0}})
deadline = now_ms() + 3 * DAY_MS + 37 * 60_000      # not on the hour
t = make({"deadline": deadline, "budgetVisible": True,
          "lines": [{"desc": "Cups", "qty": 100, "unit": "box", "price": 500},
                    {"desc": "Boxes", "qty": 10, "unit": "box", "price": 2_000}]})
ok("the closing moment is kept to the minute", t.deadline == deadline, (t.deadline, deadline))
ok("with every line priced the ceiling is their total", t.budget == 100 * 500 + 10 * 2_000, t.budget)
seen = tender_for(A_K, t.id)
ok("a vendor sees the total when the buyer chose to show it", seen and seen["budget"] == t.budget, seen and seen["budget"])
ok("but never the per-line maximums", seen and all("price" not in l for l in seen["lines"]))
hidden = make({"deadline": deadline, "lines": [{"desc": "Cups", "qty": 100, "unit": "box", "price": 500}]})
ok("unticked, the vendor sees no ceiling", tender_for(A_K, hidden.id)["budget"] is None)
mixed = make({"deadline": deadline, "budgetVisible": True,
              "lines": [{"desc": "Cups", "qty": 100, "unit": "box", "price": 500},
                        {"desc": "Boxes", "qty": 10, "unit": "box"}]})
ok("one line left open means no ceiling at all", mixed.budget == 0, mixed.budget)
ok("and nothing to show the vendor even if ticked", tender_for(A_K, mixed.id)["budget"] is None)

# ---------------------------------------------------------------- open tender
print("\n-- open tender: position and re-bid")
ot = make({"deadline": now_ms() + 2 * DAY_MS, "bidMode": "open", "twoStage": True,
           "lines": [{"desc": "Cups", "qty": 100, "unit": "box"}]})
line = ot.lines[0]["id"]
ok("an open tender cannot also be two-stage", ot.bid_mode == "open" and not ot.two_stage)
code, _ = call("POST", f"/api/tenders/{ot.id}/bids/", A_K, {"decl": True, "lines": {line: 900}})
ok("vendor A bids", code == 200, code)
code, _ = call("POST", f"/api/tenders/{ot.id}/bids/", B_K, {"decl": True, "lines": {line: 800}})
ok("vendor B bids lower", code == 200, code)
st = tender_for(A_K, ot.id)["standing"]
ok("A is told they are 2nd of 2", st == {"position": 2, "of": 2}, st)
ok("B is told they are 1st of 2", tender_for(B_K, ot.id)["standing"] == {"position": 1, "of": 2})
a_view = [b for b in boot(A_K)["bids"] if b["tenderId"] == ot.id]
ok("A sees only their own bid", len(a_view) == 1 and a_view[0]["supplierId"] == A.id)
code, _ = call("POST", f"/api/tenders/{ot.id}/bids/", A_K, {"decl": True, "lines": {line: 750}})
ok("A changes their bid in place", code == 200 and Bid.objects.filter(tender=ot, supplier_id=A.id).count() == 1)
ok("and moves to 1st", tender_for(A_K, ot.id)["standing"]["position"] == 1)
ok("B drops to 2nd", tender_for(B_K, ot.id)["standing"]["position"] == 2)
buyer_view = [b for b in boot(PROC_K)["bids"] if b["tenderId"] == ot.id]
ok("the buying side still sees no prices before opening",
   buyer_view and all("amount" not in b for b in buyer_view), buyer_view)
code, out = call("POST", f"/api/tenders/{ot.id}/bids/", A_K, {"lines": {line: 700}})
ok("a revision still needs the declaration", code == 400, out)

# ---------------------------------------------------------------- quantities
print("\n-- quantities a vendor can supply")
qt = make({"deadline": now_ms() + 2 * DAY_MS, "bidMode": "open",
           "lines": [{"desc": "Cups", "qty": 100, "unit": "box"},
                     {"desc": "Boxes", "qty": 10, "unit": "box"}]})
l1, l2 = qt.lines[0]["id"], qt.lines[1]["id"]
code, out = call("POST", f"/api/tenders/{qt.id}/bids/", A_K,
                 {"decl": True, "lines": {l1: 100}, "qtys": {l1: 60, l2: 0}})
ok("A offers 60 of 100 cups and no boxes", code == 200, out)
a_bid = Bid.objects.get(tender=qt, supplier_id=A.id)
ok("the amount is what they would charge", a_bid.amount == 60 * 100, a_bid.amount)
ok("and the quantities are recorded", a_bid.qtys == {l1: 60, l2: 0}, a_bid.qtys)
code, out = call("POST", f"/api/tenders/{qt.id}/bids/", B_K,
                 {"decl": True, "lines": {l1: 110, l2: 500}, "qtys": {l1: 101}})
ok("more than was asked for is refused", code == 400, out)
code, out = call("POST", f"/api/tenders/{qt.id}/bids/", B_K,
                 {"decl": True, "lines": {l1: 110}, "qtys": {l1: 100, l2: 10}})
ok("a supplied line with no rate is refused", code == 400, out)
code, out = call("POST", f"/api/tenders/{qt.id}/bids/", B_K, {"decl": True, "lines": {l1: 110, l2: 500}})
ok("B offers everything", code == 200, out)
b_bid = Bid.objects.get(tender=qt, supplier_id=B.id)
both = [a_bid, b_bid]
ok("offering less does not make a bid look cheaper than one that offers everything",
   comm_score(a_bid, both, qt) < comm_score(b_bid, both, qt),
   (comm_score(a_bid, both, qt), comm_score(b_bid, both, qt)))
ok("so B is 1st on the open tender", tender_for(B_K, qt.id)["standing"]["position"] == 1)

sealed = make({"deadline": now_ms() + 2 * DAY_MS, "lines": [{"desc": "Cups", "qty": 100, "unit": "box"}]})
sl = sealed.lines[0]["id"]
call("POST", f"/api/tenders/{sealed.id}/bids/", A_K, {"decl": True, "lines": {sl: 100}, "qtys": {sl: 40}})
mine = [b for b in boot(A_K)["bids"] if b["tenderId"] == sealed.id][0]
ok("a sealed bid echoes its quantities back to the vendor", mine.get("qtys") == {sl: 40}, mine)
ok("and nothing is stored in plain on the row", Bid.objects.get(tender=sealed, supplier_id=A.id).qtys == {})

# ---------------------------------------------------------------- audit hold
print("\n-- a company not on the register")
ht = make({"deadline": now_ms() + 2 * DAY_MS, "lines": [{"desc": "Cups", "qty": 100, "unit": "box"}]})
hl = ht.lines[0]["id"]
call("POST", f"/api/tenders/{ht.id}/bids/", A_K, {"decl": True, "lines": {hl: 100}})
code, out = call("POST", f"/api/tenders/{ht.id}/bids/", N_K, {"decl": True, "lines": {hl: 90}})
ok("the new company can bid", code == 200 and out.get("held") is True, out)
n_bid = Bid.objects.get(tender=ht, supplier_id=N.id)
ok("its bid is held", n_bid.review == "held")
Document.objects.create(id=rid("d"), kind="bid", tender=ht, supplier_id=N.id, envelope="technical",
                        name="n.pdf", size=1, data=b"x", uploaded_by="N", uploaded_at=now_ms())
ht2 = make({"deadline": now_ms() + 2 * DAY_MS, "lines": [{"desc": "Lids", "qty": 5, "unit": "box"}]})
call("POST", f"/api/tenders/{ht2.id}/bids/", N_K, {"decl": True, "lines": {ht2.lines[0]["id"]: 50}})
Tender.objects.filter(pk=ht.id).update(deadline=now_ms() - 1000)
code, out = call("POST", f"/api/tenders/{ht.id}/open/", PROC_K)
ok("opening waits while a bid is held", code == 409 and "audit" in out.get("error", ""), out)
code, _ = call("POST", f"/api/bids/{n_bid.id}/review/", PROC_K, {"ok": True})
ok("procurement cannot approve it", code == 403, code)
code, _ = call("POST", f"/api/bids/{n_bid.id}/review/", AUD_K, {"ok": False})
ok("turning it down needs a reason", code == 400, code)
code, _ = call("POST", f"/api/bids/{n_bid.id}/review/", AUD_K, {"ok": False, "reason": "Could not verify the company"})
ok("audit turns it down", code == 200, code)
code, out = call("POST", f"/api/tenders/{ht.id}/open/", PROC_K)
ok("now the bids open", code == 200, out)
n_bid.refresh_from_db()
ok("the turned-down bid was never unsealed", n_bid.sealed_blob is not None and n_bid.amount is None)
ok("and its document stays hidden from the buying side",
   not any(d["supplierId"] == N.id for d in boot(PROC_K)["documents"] if d.get("tenderId") == ht.id))
N.refresh_from_db()
ok("turning a bid down does not register the company", N.registered_at is None)

held2 = Bid.objects.get(tender=ht2, supplier_id=N.id)
code, _ = call("POST", f"/api/suppliers/{N.id}/prequalify/", PROC_K, {"ok": True})
held2.refresh_from_db()
N.refresh_from_db()
ok("prequalifying the company registers it", code == 200 and N.registered_at is not None)
ok("and releases its other held bid", held2.review == "approved", held2.review)

N2, N2_K = vendor("Second Newco", registered=False)
t3 = make({"deadline": now_ms() + 2 * DAY_MS, "invited": [N2.id], "lines": [{"desc": "Cups", "qty": 1, "unit": "box"}]})
t4 = make({"deadline": now_ms() + 2 * DAY_MS, "invited": [N2.id], "lines": [{"desc": "Cups", "qty": 1, "unit": "box"}]})
for x in (t3, t4):
    call("POST", f"/api/tenders/{x.id}/bids/", N2_K, {"decl": True, "lines": {x.lines[0]["id"]: 10}})
first = Bid.objects.get(tender=t3, supplier_id=N2.id)
code, _ = call("POST", f"/api/bids/{first.id}/review/", AUD_K, {"ok": True})
ok("audit approves one bid", code == 200, code)
ok("which releases the company's other held bid too",
   Bid.objects.get(tender=t4, supplier_id=N2.id).review == "approved")
t5 = make({"deadline": now_ms() + 2 * DAY_MS, "invited": [N2.id], "lines": [{"desc": "Cups", "qty": 1, "unit": "box"}]})
call("POST", f"/api/tenders/{t5.id}/bids/", N2_K, {"decl": True, "lines": {t5.lines[0]["id"]: 10}})
ok("and its next bid counts straight away", Bid.objects.get(tender=t5, supplier_id=N2.id).review == "")

# ---------------------------------------------------------------- duplicates
print("\n-- duplicates")
code, out = call("POST", f"/api/tenders/{ot.id}/duplicate/", PROC_K)
copy = Tender.objects.get(pk=out["id"]) if code == 200 else None
ok("a tender duplicates", copy is not None, out)
ok("the copy keeps open bidding and the visibility choice",
   copy and copy.bid_mode == "open" and copy.budget_visible == ot.budget_visible)
ok("and starts as an undated draft", copy and copy.status == "draft" and copy.deadline == 0)

a = Auction.objects.create(id=rid("a"), ref="AUC-9001", title="Diesel", created_at=now_ms(), owner=PROC)
AuctionLot.objects.create(id=rid("l"), auction=a, number=1, title="AGO", qty=10, ceiling=1000,
                          min_decrement=2, decrement_is_pct=True)
AuctionParticipant.objects.create(id=rid("ap"), auction=a, supplier_id=A.id, invited_at=now_ms())
code, out = call("POST", f"/api/auctions/{a.id}/duplicate/", PROC_K)
dup = Auction.objects.filter(pk=out.get("id")).first() if code == 200 else None
ok("an auction duplicates", dup is not None, out)
lots = list(dup.lots.all()) if dup else []
ok("with its lots and their percentage step", len(lots) == 1 and lots[0].decrement_is_pct and lots[0].min_decrement == 2)
parts = list(dup.participants.all()) if dup else []
ok("and its vendors, not yet invited", len(parts) == 1 and parts[0].invited_at is None)
ok("as a draft with no clock", dup and dup.status == "draft" and not dup.ends_at)

code, out = call("POST", f"/api/auctions/{dup.id}/lots/", PROC_K,
                 {"title": "More AGO", "ceiling": 500, "minDecrement": 60, "decrementIsPct": True})
ok("a step above 50% is refused", code == 400, out)
code, out = call("POST", f"/api/auctions/{dup.id}/lots/", PROC_K,
                 {"title": "More AGO", "ceiling": 500, "minDecrement": 5, "decrementIsPct": True})
ok("a 5% step is accepted", code == 200 and out.get("decrementIsPct") is True, out)

# ---------------------------------------------------------------- migration
print("\n-- existing vendors are registered")
old = Supplier.objects.create(id=rid("s"), name="Old Register Vendor", category="Fuel", location="Lagos",
                              prequalified=False)
mig = importlib.import_module("core.migrations.0031_open_tenders_quantities_and_new_vendor_review")
from django.apps import apps as live_apps   # noqa: E402
mig.forwards(live_apps, None)
old.refresh_from_db()
ok("a vendor added before the flag is now registered", old.registered_at is not None)
ok("without a reminder being queued for it", TaskMark.objects.filter(pk=f"regnudge:{old.id}").exists())

_runner.teardown_databases(_old_db)
print(f"\n{len(PASSED)} passed, {len(FAILED)} failed")
for f in FAILED:
    print("  FAILED: " + f)
sys.exit(1 if FAILED else 0)
