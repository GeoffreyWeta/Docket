"""The November 2026 team feedback, end to end through the API.

    python test_nov_feedback.py

  WILL YOU BID? An invited vendor says yes or no. A no carries a reason, tells
  the tender's owner, and stops the reminders. Bidding records a yes; a vendor
  that has bid cannot say no without withdrawing first.

  DELIVERY AND CREDIT TERMS. A tender or auction states an Incoterm (with its
  named place) and a credit limit; the vendor accepts both with the payment
  terms, and the accepted text says so.

  AT MOST 200 LINES on a tender.

  DOCUMENT TYPES. The product specification is the Technical Datasheet (TDS);
  the certificate is the Certificate of Analysis (COA), with the licence its
  own type. An older screen sending an old name still lands on the new one.

  VENDOR CONTACTS AND CONTRACT. The vendor names who receives purchase orders
  and who deals with finance. Procurement sets the vendor's contract (payment
  terms, credit limit, bonus or malus, escalation, cash back) and the vendor
  reads it; nobody else does.

  AWARDING. The approver can award on the panel's recommendation, the lowest
  total cost, or the best item cost (each line to its lowest price, so one
  tender can have several winners). Each winner's letter lists its lines; each
  vendor sees only its own share.

  SAVINGS. With no last price on file, a saving is measured against the
  average of the bids.

  SHAREPOINT. Vendor company documents are filed; bid documents only once the
  recorded opening has unsealed them.
"""
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
from django.core import mail                               # noqa: E402
from django.core.files.uploadedfile import SimpleUploadedFile  # noqa: E402
from django.test import Client                             # noqa: E402
from django.test.utils import setup_test_environment       # noqa: E402
from django.test.runner import DiscoverRunner              # noqa: E402

settings.EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
settings.DEMO_LOGIN = False

setup_test_environment()
_runner = DiscoverRunner(verbosity=0, interactive=False)
_old_db = _runner.setup_databases()

from core import sharepoint, tasks, vocab                  # noqa: E402
from core.models import (Acceptance, AuthToken, Document, Notification,  # noqa: E402
                         OrgSetting, Participation, Persona, Profile, Supplier, Tender)
from core.util import DAY_MS, now_ms, rid                  # noqa: E402
HOUR_MS = 3600_000

PASSED, FAILED = [], []
c = Client()
J = "application/json"


def ok(label, cond, extra=""):
    (PASSED if cond else FAILED).append(label)
    print(("  PASS  " if cond else "  FAIL  ") + label + ("" if cond else f"  - {extra}"))


def buyer(name, role, manager=None):
    p = Persona.objects.create(id=rid("u"), name=name, role=role, title=role.title(), manager=manager)
    u = User.objects.create_user(username=f"{p.id}@x.test", email=f"{p.id}@x.test", password="x")
    Profile.objects.create(user=u, persona=p)
    return p, AuthToken.objects.create(key=rid("k") + rid("k"), user=u, created=now_ms()).key


def vendor(name):
    s = Supplier.objects.create(id=rid("s"), name=name, category="Packaging", location="Lagos",
                                contact_email=f"{rid('m')}@v.test", registered_at=now_ms())
    u = User.objects.create_user(username=f"{s.id}@x.test", email=s.contact_email, password="x")
    Profile.objects.create(user=u, supplier=s)
    return s, AuthToken.objects.create(key=rid("k") + rid("k"), user=u, created=now_ms()).key


def call(method, path, key, body=None):
    fn = getattr(c, method.lower())
    r = fn(path, body if body is not None else {}, content_type=J, HTTP_AUTHORIZATION="Bearer " + key)
    try:
        return r.status_code, r.json()
    except ValueError:
        return r.status_code, {}


def upload(path, key, name, data, **extra):
    r = c.post(path, {"file": SimpleUploadedFile(name, data, content_type="application/pdf"), **extra},
               HTTP_AUTHORIZATION="Bearer " + key)
    try:
        return r.status_code, r.json()
    except ValueError:
        return r.status_code, {}


def boot(key):
    return call("GET", "/api/bootstrap/", key)[1]


def tender_for(key, tid):
    return next((t for t in boot(key)["tenders"] if t["id"] == tid), None)


# Straight to publication: no line manager step, no threshold, no ladder.
OrgSetting.objects.update_or_create(pk=1, defaults={"data": {"approvalThreshold": 0,
                                                             "lineManagerApproval": False,
                                                             "reminderHours": [24]}})

APPR, APPR_K = buyer("Mark Iyer", "approver")
BUY, BUY_K = buyer("Amara Okafor", "procurement", manager=APPR)
EVAL, EVAL_K = buyer("Tolu Ade", "evaluator")
A, A_K = vendor("Alpha Foods")
B, B_K = vendor("Beta Foods")
C, C_K = vendor("Gamma Foods")

LINES = [{"id": "l1", "desc": "Flour", "qty": 100, "unit": "bag"},
         {"id": "l2", "desc": "Sugar", "qty": 50, "unit": "bag"},
         {"id": "l3", "desc": "Salt", "qty": 10, "unit": "bag"}]
BASE = {
    "title": "Baking supplies", "type": "RFQ", "category": "Packaging", "techWeight": 60,
    "criteria": [{"name": "Quality", "weight": 100}], "scope": "Supply.",
    "invited": [A.id, B.id, C.id], "technicalDocumentRequired": False, "lines": LINES,
}


def make(extra=None, submit=True, key=BUY_K):
    code, out = call("POST", "/api/tenders/", key,
                     {**BASE, "deadline": now_ms() + 5 * DAY_MS, **(extra or {}), "submit": submit})
    return code, out, (Tender.objects.get(pk=out["id"]) if code == 200 else None)


def bid(key, tid, lines, qtys=None):
    return call("POST", f"/api/tenders/{tid}/bids/", key,
                {"lines": lines, "qtys": qtys or {}, "decl": True, "acks": []})


def close_and_open(t):
    Tender.objects.filter(pk=t.id).update(deadline=now_ms() - 1000)
    code, out = call("POST", f"/api/tenders/{t.id}/open/", BUY_K)
    assert code == 200, out
    t.refresh_from_db()
    return t


# ================================================================ vocab
print("\n-- document types and Incoterms")
labels = {v: lb for v, lb, _e in vocab.VOCAB["bidDocTypes"]}
ok("the technical datasheet is called TDS", labels.get("Technical datasheet") == "Technical Datasheet (TDS)")
ok("the certificate is the COA, and the licence its own type, in that order",
   list(labels).index("Certificate of Analysis") + 1 == list(labels).index("Licence")
   and labels["Certificate of Analysis"] == "Certificate of Analysis (COA)")
ok("the old names are gone from the list",
   "Product specification" not in labels and "Certificate or licence" not in labels)
ok("an old screen sending an old name lands on the new one",
   vocab.bid_doc_type("Product specification") == "Technical datasheet"
   and vocab.bid_doc_type("certificate or licence") == "Certificate of Analysis")
ok("all eleven Incoterms 2020 rules are offered", len(vocab.INCOTERMS) == 11
   and set(vocab.INCOTERMS) == {"EXW", "FCA", "CPT", "CIP", "DAP", "DPU", "DDP", "FAS", "FOB", "CFR", "CIF"})
ok("an Incoterm is cleaned to its code", vocab.incoterm("fob") == "FOB" and vocab.incoterm("FCA Lagos") == "FCA")
try:
    vocab.incoterm("DAT")
    ok("a retired rule (DAT) is refused", False)
except vocab.Refused:
    ok("a retired rule (DAT) is refused", True)

# ================================================================ lines
print("\n-- at most 200 lines")
many = [{"desc": f"Item {i}", "qty": 1, "unit": "bag"} for i in range(201)]
code, out, _t = make({"lines": many}, submit=False)
ok("a tender with 201 lines is refused", code == 400 and "200" in out.get("error", ""), (code, out))
code, out, t200 = make({"lines": many[:200]}, submit=False)
ok("200 lines are fine", code == 200 and len(t200.lines) == 200, (code, out))

# ================================================================ terms
print("\n-- Incoterms and credit limit")
code, out, _t = make({"incoterm": "FCA", "incotermPlace": ""})
ok("an Incoterm needs its named place before it goes out", code == 400 and "place" in out["error"], (code, out))
code, out, t = make({"incoterm": "FCA", "incotermPlace": "Apapa Port", "creditLimit": 5_000_000,
                     "paymentTerms": "30 days"})
ok("with a place it is published", code == 200 and t.status == "published", (code, out, t and t.status))
ok("the terms are stored", (t.incoterm, t.incoterm_place, t.credit_limit) == ("FCA", "Apapa Port", 5_000_000))
tv = tender_for(A_K, t.id)
ok("a vendor is asked to accept the terms first", tv["gated"] and tv["agreements"]["pending"] == ["payment"])
ok("and sees the delivery terms written out",
   tv["agreements"]["incotermWords"] == "FCA Apapa Port, Incoterms 2020 (Free Carrier)", tv["agreements"])
code, _ = call("POST", f"/api/tenders/{t.id}/accept/", A_K, {"kind": "payment", "agree": True, "name": "Ada Obi"})
acc = Acceptance.objects.filter(tender=t, supplier_id=A.id).first()
ok("the accepted text carries the credit limit and the Incoterm",
   acc and "Credit limit: " in acc.text and "5,000,000" in acc.text and "FCA Apapa Port, Incoterms 2020" in acc.text,
   acc and acc.text)
code, out, t_credit = make({"creditLimit": 1_000_000})
ok("a credit limit alone is something to accept", tender_for(B_K, t_credit.id)["agreements"]["pending"] == ["payment"])

# ================================================================ participation
print("\n-- will you bid?")
code, out, t = make()
code, out = call("POST", f"/api/tenders/{t.id}/participation/", A_K, {"answer": "no"})
ok("a no needs a reason", code == 400, (code, out))
code, out = call("POST", f"/api/tenders/{t.id}/participation/", A_K, {"answer": "no", "reason": "Not a reason"})
ok("a reason off the list is refused", code == 400, (code, out))
code, out = call("POST", f"/api/tenders/{t.id}/participation/", A_K, {"answer": "no", "reason": "Other"})
ok("'Other' needs a few words", code == 400, (code, out))
code, out = call("POST", f"/api/tenders/{t.id}/participation/", A_K,
                 {"answer": "no", "reason": "We cannot meet the quantity", "note": "Max 40 bags"})
ok("a no with a reason is recorded", code == 200 and out["participation"]["answer"] == "no", (code, out))
ok("the tender's owner is told", Notification.objects.filter(
    user__profile__persona=BUY, subject__contains="will not bid").exists())
ok("the vendor sees its own answer", tender_for(A_K, t.id)["myParticipation"]["reason"] == "We cannot meet the quantity")
ok("the buyer sees every answer", tender_for(BUY_K, t.id)["participation"][A.id]["note"] == "Max 40 bags")
code, rows = call("GET", f"/api/tenders/{t.id}/vendors/", BUY_K)
row = next((r for r in rows.get("vendors", []) if r.get("supplierId") == A.id), None) if code == 200 else None
ok("and the vendor table carries it", row is not None and row["participation"]["answer"] == "no", (code, rows))
code, out = call("POST", f"/api/tenders/{t.id}/participation/", B_K, {"answer": "yes"})
ok("a yes needs nothing more", code == 200 and out["participation"]["answer"] == "yes", (code, out))
code, out = call("POST", f"/api/tenders/{t.id}/participation/", EVAL_K, {"answer": "yes"})
ok("only a vendor can answer", code == 403, code)

# Reminders: due 24h before the close, to vendors who have not bid and did not say no.
Tender.objects.filter(pk=t.id).update(deadline=now_ms() + 20 * HOUR_MS, published_at=now_ms() - 2 * DAY_MS)
mail.outbox = []
tasks.send_tender_reminders()
reminded = {m.to[0] for m in mail.outbox if "Reminder" in m.subject}
ok("the vendor that said no is not reminded", A.contact_email not in reminded, reminded)
ok("the others still are", {B.contact_email, C.contact_email} <= reminded, reminded)

code, out = bid(C_K, t.id, {"l1": 10, "l2": 20, "l3": 5})
ok("bidding records a yes", code == 200 and Participation.objects.get(tender=t, supplier_id=C.id).answer == "yes",
   (code, out))
code, out = call("POST", f"/api/tenders/{t.id}/participation/", C_K, {"answer": "no", "reason": "Other", "note": "changed"})
ok("a vendor that has bid cannot say no without withdrawing", code == 409, (code, out))
code, out = call("POST", f"/api/tenders/{t.id}/participation/", A_K, {"answer": "yes"})
ok("a vendor can change a no to a yes", code == 200 and Participation.objects.get(tender=t, supplier_id=A.id).answer == "yes")
Tender.objects.filter(pk=t.id).update(deadline=now_ms() - 1000)
code, out = call("POST", f"/api/tenders/{t.id}/participation/", B_K, {"answer": "no", "reason": "Other", "note": "late"})
ok("after the close there is nothing to answer", code == 409, (code, out))

# ================================================================ contacts and contract
print("\n-- vendor contacts and contract")
code, out = call("POST", "/api/me/", A_K, {"name": A.name, "poContact": {"name": "Ola", "email": "not-an-email"}})
ok("a bad email for a contact is refused", code == 400, (code, out))
code, out = call("POST", "/api/me/", A_K, {"name": A.name,
                                          "poContact": {"name": "Ola Ade", "email": "po@alpha.test", "phone": "08031234567"},
                                          "financeContact": {"name": "Femi", "email": "ar@alpha.test", "phone": ""}})
A.refresh_from_db()
ok("the vendor names its PO and finance contacts", code == 200 and A.po_contact["email"] == "po@alpha.test"
   and A.po_contact["phone"].startswith("+234") and A.finance_contact["name"] == "Femi", (code, out, A.po_contact))
me = boot(A_K)["suppliers"][0]
ok("and reads them back", me["poContact"]["name"] == "Ola Ade" and me["financeContact"]["email"] == "ar@alpha.test")

body = {"paymentTerms": "45 days", "creditLimit": 12_000_000, "bonusMalus": "2% rebate above 95% on-time delivery",
        "escalation": "Prices fixed for 6 months, then reviewed against CPI", "cashBack": "1% on annual spend over ₦100m",
        "startsAt": now_ms(), "endsAt": now_ms() + 365 * DAY_MS, "ref": "CTR-2026-014"}
code, out = call("POST", f"/api/suppliers/{A.id}/contract/", EVAL_K, body)
ok("an evaluator cannot set a vendor's contract", code == 403, code)
code, out = call("POST", f"/api/suppliers/{A.id}/contract/", BUY_K, {**body, "endsAt": now_ms() - DAY_MS})
ok("a contract cannot end before it starts", code == 400, (code, out))
code, out = call("POST", f"/api/suppliers/{A.id}/contract/", BUY_K, body)
A.refresh_from_db()
ok("procurement sets it", code == 200 and A.payment_terms == "45 days" and A.exposure_limit == 12_000_000
   and A.contract["cashBack"].startswith("1%"), (code, out))
mine = boot(A_K)["suppliers"][0]["contract"]
ok("the vendor reads it", mine["isSet"] and mine["creditLimit"] == 12_000_000
   and mine["escalation"].startswith("Prices fixed") and mine["paymentTermsLabel"] == "45 days after invoice", mine)
ok("the vendor is told it changed", Notification.objects.filter(
    user__profile__supplier=A, subject__contains="contract").exists())
other = boot(B_K)["suppliers"]
ok("no other vendor sees it", len(other) == 1 and other[0]["id"] == B.id)

# ================================================================ awarding
print("\n-- awarding: recommendation, lowest total, best item cost")
code, out, t = make()
# A: cheapest on flour; B: cheapest on sugar and salt; C: lowest total among full offers.
bid(A_K, t.id, {"l1": 100, "l2": 400, "l3": 300})      # 100*100 + 50*400 + 10*300 = 33,000
bid(B_K, t.id, {"l1": 300, "l2": 100, "l3": 100})      # 30,000 + 5,000 + 1,000 = 36,000
bid(C_K, t.id, {"l1": 150, "l2": 200, "l3": 200})      # 15,000 + 10,000 + 2,000 = 27,000
t = close_and_open(t)
bids = {b.supplier_id: b for b in t.bids.all()}
code, out = call("POST", f"/api/tenders/{t.id}/recommend/", BUY_K, {"bidId": bids[A.id].id})
ok("the panel recommends Alpha", code == 200, (code, out))
tv = tender_for(APPR_K, t.id)
opts = tv.get("awardOptions") or {}
ok("the approver is shown three ways to award", set(opts) == {"recommended", "total", "item"}, list(opts))
ok("the lowest total is Gamma at 27,000", opts["total"]["parts"][0]["supplierId"] == C.id
   and opts["total"]["amount"] == 27_000, opts.get("total"))
item = opts["item"]
by = {p["supplierId"]: p for p in item["parts"]}
ok("best item cost: flour to Alpha, sugar and salt to Beta, 16,000 in all",
   item["amount"] == 100 * 100 + 50 * 100 + 10 * 100 and set(by) == {A.id, B.id}
   and [x["lineId"] for x in by[A.id]["lines"]] == ["l1"]
   and sorted(x["lineId"] for x in by[B.id]["lines"]) == ["l2", "l3"], item)
code, out = call("POST", f"/api/tenders/{t.id}/award_decision/", APPR_K, {"ok": True, "method": "nonsense"})
ok("an unknown method is refused", code == 400, (code, out))
code, out = call("POST", f"/api/tenders/{t.id}/award_decision/", APPR_K, {"ok": True, "method": "item"})
t.refresh_from_db()
ok("the approver awards on best item cost", code == 200 and t.status == "awarded" and t.award_method == "item",
   (code, out, t.status))
ok("two vendors win; the larger share is the headline winner",
   len(t.award_split) == 2 and t.awarded_to == A.id and t.awarded_amount == 16_000, (t.award_split, t.awarded_to))
ok("each winner's letter lists its own lines", t.letters[A.id]["type"] == "award" and "Flour" in t.letters[A.id]["text"]
   and "Sugar" not in t.letters[A.id]["text"] and "Sugar" in t.letters[B.id]["text"], t.letters[A.id]["text"][:300])
ok("the vendor that won nothing gets a regret letter", t.letters[C.id]["type"] == "regret")
ok("the memo records how it was awarded", "best item cost" in t.award_memo, t.award_memo)
va = tender_for(A_K, t.id)
ok("a winner sees only its own share", len(va["awardSplit"]) == 1 and va["awardSplit"][0]["supplierId"] == A.id)
ok("a vendor that won nothing sees no share", tender_for(C_K, t.id)["awardSplit"] == [])
ok("the audit trail says the basis changed", t.id in {e.tender_id for e in __import__("core.models", fromlist=["Event"])
                                                      .Event.objects.filter(action="Award basis changed")})

code, out, t = make({"title": "Second"})
bid(A_K, t.id, {"l1": 100, "l2": 400, "l3": 300})
bid(B_K, t.id, {"l1": 300, "l2": 100, "l3": 100})
bid(C_K, t.id, {"l1": 150, "l2": 200, "l3": 200})
t = close_and_open(t)
bids = {b.supplier_id: b for b in t.bids.all()}
call("POST", f"/api/tenders/{t.id}/recommend/", BUY_K, {"bidId": bids[A.id].id})
code, out = call("POST", f"/api/tenders/{t.id}/award_decision/", APPR_K, {"ok": True, "method": "total"})
t.refresh_from_db()
ok("the approver awards on the lowest total instead", code == 200 and t.awarded_to == C.id
   and t.awarded_amount == 27_000 and t.award_method == "single" and t.award_split == [], (code, out, t.awarded_to))
ok("the lowest-total winner gets the award letter", t.letters[C.id]["type"] == "award"
   and t.letters[A.id]["type"] == "regret")

code, out, t = make({"title": "Third"})
bid(A_K, t.id, {"l1": 100, "l2": 400, "l3": 300})
bid(B_K, t.id, {"l1": 300, "l2": 100, "l3": 100})
t = close_and_open(t)
bids = {b.supplier_id: b for b in t.bids.all()}
call("POST", f"/api/tenders/{t.id}/recommend/", BUY_K, {"bidId": bids[A.id].id})
code, out = call("POST", f"/api/tenders/{t.id}/award_decision/", APPR_K, {"ok": True})
t.refresh_from_db()
ok("approving without choosing awards the recommendation, as before", code == 200 and t.awarded_to == A.id
   and t.awarded_amount == 33_000 and t.award_method == "single", (code, out))

print("\n-- part quantities: the next cheapest fills the rest")
code, out, t = make({"title": "Fourth"})
bid(A_K, t.id, {"l1": 100, "l2": 400, "l3": 300}, qtys={"l1": 60})     # only 60 of the 100 bags of flour
bid(B_K, t.id, {"l1": 300, "l2": 100, "l3": 100})
bid(C_K, t.id, {"l1": 150, "l2": 200, "l3": 200})
t = close_and_open(t)
bids = {b.supplier_id: b for b in t.bids.all()}
call("POST", f"/api/tenders/{t.id}/recommend/", BUY_K, {"bidId": bids[B.id].id})
item = tender_for(APPR_K, t.id)["awardOptions"]["item"]
flour = sorted((x["qty"], p["supplierId"]) for p in item["parts"] for x in p["lines"] if x["lineId"] == "l1")
ok("flour: 60 from Alpha, the other 40 from Gamma", flour == [(40, C.id), (60, A.id)], flour)
total = tender_for(APPR_K, t.id)["awardOptions"]["total"]
ok("the lowest total looks first at vendors offering everything", total["parts"][0]["supplierId"] == C.id, total)

# ================================================================ savings
print("\n-- savings without a last price")
code, out, t = make({"title": "Savings"})
bid(A_K, t.id, {"l1": 100, "l2": 100, "l3": 100})     # 16,000
bid(B_K, t.id, {"l1": 200, "l2": 200, "l3": 200})     # 32,000
t = close_and_open(t)
ok("the average of the bids is the basis", t.savings_basis() == (24_000, "bids"), t.savings_basis())
ok("and the buyer is sent it", tender_for(BUY_K, t.id)["bidAverage"] == 24_000)
ok("a vendor is not", "bidAverage" not in tender_for(A_K, t.id) or tender_for(A_K, t.id)["bidAverage"] is None)
Tender.objects.filter(pk=t.id).update(baseline=30_000)
t.refresh_from_db()
ok("a last price, where there is one, still wins", t.savings_basis() == (30_000, "baseline"))

# ================================================================ SharePoint
print("\n-- SharePoint")
ok("off unless set up", not sharepoint.enabled() and sharepoint.sweep() == 0)
filed = []
os.environ.update({"SHAREPOINT_SITE": "x.sharepoint.com:/sites/P", "SHAREPOINT_TENANT_ID": "t",
                   "SHAREPOINT_CLIENT_ID": "c", "SHAREPOINT_CLIENT_SECRET": "s"})
sharepoint.upload = lambda folders, name, data, ct="": (filed.append(("/".join(folders), name, data))
                                                       or f"https://x.sharepoint.com/{len(filed)}")
Document.objects.update(sharepoint_at=now_ms())        # what is already there is not the point
code, out = upload("/api/me/docs/", A_K, "tax.pdf", b"%PDF-tax", type="Tax clearance certificate")
code, out, t = make({"title": "Filing", "technicalDocumentRequired": True})
upload(f"/api/tenders/{t.id}/bid_docs/", B_K, "tds.pdf", b"%PDF-tds", docType="Technical datasheet")
bid(B_K, t.id, {"l1": 1, "l2": 1, "l3": 1})
sharepoint.sweep()
ok("a vendor's company document is filed under the vendor",
   any(f[0].endswith(f"Vendors/{A.name}/Company documents") and f[2] == b"%PDF-tax" for f in filed), filed)
ok("a sealed bid document is not", not any("tds" in f[1] for f in filed), filed)
close_and_open(t)
sharepoint.sweep()
hit = next((f for f in filed if "tds" in f[1]), None)
ok("once opened, it is filed under the tender, the vendor and its envelope",
   hit and f"Bids/{B.name}/Technical" in hit[0] and hit[1].startswith("Technical Datasheet (TDS) - ")
   and hit[2] == b"%PDF-tds", hit)
docs = boot(BUY_K)["documents"]
ok("the buyer sees the SharePoint link", any(d.get("sharepointUrl") for d in docs))
ok("a vendor never does", not any("sharepointUrl" in d for d in boot(A_K)["documents"]))
for k in ("SHAREPOINT_SITE", "SHAREPOINT_TENANT_ID", "SHAREPOINT_CLIENT_ID", "SHAREPOINT_CLIENT_SECRET"):
    os.environ.pop(k, None)

_runner.teardown_databases(_old_db)
print(f"\n{len(PASSED)} passed, {len(FAILED)} failed")
sys.exit(1 if FAILED else 0)
