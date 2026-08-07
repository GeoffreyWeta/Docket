"""End-to-end API smoke test (authenticated). Run: python3 smoke.py"""
import io
import json
import os
import time

import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "docket.settings")
django.setup()

from django.test import Client  # noqa: E402

from core.seed import seed_all  # noqa: E402
from core.seed_finance import HISTORY  # noqa: E402

# The seven hand-written competitions, plus the 2025 awards that sit behind the
# imported ledger (seed_finance.HISTORY). Derived rather than hardcoded: this
# assertion is about the buyer seeing everything, and a magic number turns that
# into a test that fails whenever the demo gains a tender.
SEEDED_TENDERS = 7 + len(HISTORY)

seed_all()  # every run starts from the pristine demo state

c = Client()
J = "application/json"
TOK = {}


def login(username, password="docket-demo"):
    r = c.post("/api/auth/login/", json.dumps({"username": username, "password": password}), content_type=J)
    assert r.status_code == 200, r.content
    TOK[username] = r.json()["token"]
    return r.json()


def call(method, path, who, body=None, expect=200, files=None):
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
    assert r.status_code == expect, f"{method} {path} as {who}: {r.status_code} != {expect} — {r.content[:300]}"
    ct = r.headers.get("Content-Type", "")
    return r.json() if ct.startswith("application/json") else r

# --- auth basics ---
assert c.get("/api/health/").json()["ok"]
r = c.get("/api/bootstrap/")
assert r.status_code == 401, "unauthenticated bootstrap must 401"
r = c.post("/api/auth/login/", json.dumps({"username": "amara", "password": "wrong"}), content_type=J)
assert r.status_code == 401
cfg = c.get("/api/auth/config/").json()
# nine: five buyer personas, the executive, and three vendors
assert cfg["demoLogin"] and len(cfg["accounts"]) == 9, cfg["accounts"]
for u in ["tunde", "amara", "deji", "ngozi", "mark", "aisha", "coldline", "harmattan", "bluechip"]:
    login(u)
# demo one-click login works while enabled
r = c.post("/api/auth/demo/", json.dumps({"username": "mark"}), content_type=J)
assert r.status_code == 200

# --- sealing & blindness (now behind real identities) ---
d = call("GET", "/api/bootstrap/", "amara")
assert d["me"]["role"] == "procurement" and len(d["tenders"]) == SEEDED_TENDERS
t3bids = [b for b in d["bids"] if b["tenderId"] == "t3"]
assert all(b.get("sealed") and "amount" not in b for b in t3bids), "SEAL LEAK"
d2 = call("GET", "/api/bootstrap/", "deji")
assert all(set(b["scores"]) == {"u2"} for b in d2["bids"] if b["tenderId"] == "t1"), "BLIND LEAK"

# --- documents: sealed bid docs are invisible & undownloadable pre-opening ---
buyer_docs = {x["id"]: x for x in d["documents"]}
assert all(x["kind"] == "tender" or x["tenderId"] == "t1" for x in buyer_docs.values()), \
    "bid docs for unopened t3 leaked to buyer"
ds = call("GET", "/api/bootstrap/", "bluechip")
t6doc = [x for x in ds["documents"] if x["kind"] == "tender" and x["tenderId"] == "t6"][0]
r = call("GET", f"/api/docs/{t6doc['id']}/download/", "bluechip")
assert r.content.startswith(b"%PDF")
# a buyer cannot download a t3 bid doc pre-opening
from core.models import Document
t3doc = Document.objects.filter(tender_id="t3", kind="bid").first()
call("GET", f"/api/docs/{t3doc.id}/download/", "amara", expect=403)

# --- supplier bid flow with real uploads on t2 ---
pdf = io.BytesIO(b"%PDF-1.4 fake proposal"); pdf.name = "coldline-proposal.pdf"
r = call("POST", "/api/tenders/t2/bids/", "coldline", {"lines": {"l1": 32000, "l2": 850000, "l3": 260000}, "acks": []}, expect=400)
up = call("POST", "/api/tenders/t2/bid_docs/", "coldline", files={"file": pdf, "envelope": "technical"})
call("POST", "/api/tenders/t2/bids/", "coldline", {"lines": {"l1": 32000, "l2": 850000, "l3": 260000}, "acks": []})
# doc locked while bid is sealed; unlocked after withdraw
call("DELETE", f"/api/docs/{up['doc']['id']}/", "coldline", expect=409)
call("DELETE", "/api/tenders/t2/bids/", "coldline")
call("POST", "/api/tenders/t2/bids/", "coldline", {"lines": {"l1": 31000, "l2": 840000, "l3": 255000}, "acks": []})
# oversized upload rejected
big = io.BytesIO(b"x" * (11 * 1024 * 1024)); big.name = "big.pdf"
call("POST", "/api/tenders/t2/bid_docs/", "coldline", files={"file": big, "envelope": "technical"}, expect=400)
bad = io.BytesIO(b"#!/bin/sh"); bad.name = "run.sh"
call("POST", "/api/tenders/t2/bid_docs/", "coldline", files={"file": bad, "envelope": "technical"}, expect=400)

# --- notifications: procurement heard about the sealed bid; sweep flagged expiring docs ---
d = call("GET", "/api/bootstrap/", "amara")
subjects = [n["subject"] for n in d["notifications"]]
assert any("Sealed bid received" in x for x in subjects), subjects
assert any("Compliance document expiring" in x for x in subjects), "sweep expiry alert missing"
call("POST", "/api/notifications/read/", "amara", {})
d = call("GET", "/api/bootstrap/", "amara")
assert all(n["read"] for n in d["notifications"])

# --- COI gate: evaluator cannot score t3 until declared ---
call("POST", "/api/tenders/t3/open/", "amara", {})
d = call("GET", "/api/bootstrap/", "deji")
bid_id = [b for b in d["bids"] if b["tenderId"] == "t3"][0]["id"]
call("POST", f"/api/bids/{bid_id}/scores/", "deji", {"scores": {"c1": 8}}, expect=403)
call("POST", "/api/tenders/t3/coi/", "deji", {})
call("POST", f"/api/bids/{bid_id}/scores/", "deji", {"scores": {"c1": 8, "c2": 7, "c3": 9}, "note": "Strong install track record; verify spares stock."})
d = call("GET", "/api/bootstrap/", "amara")
b = [x for x in d["bids"] if x["id"] == bid_id][0]
assert b["notes"].get("u2", "").startswith("Strong install"), "chair should see the justification"
# opened t3 bid docs now downloadable by buyer
call("GET", f"/api/docs/{t3doc.id}/download/", "amara")

# --- award lifecycle notifications ---
call("POST", "/api/tenders/t1/recommend/", "amara", {"bidId": "b1"})
d = call("GET", "/api/bootstrap/", "mark")
assert any("Award approval needed" in n["subject"] for n in d["notifications"])
call("POST", "/api/tenders/t1/award_decision/", "mark", {"ok": True})
d = call("GET", "/api/bootstrap/", "harmattan")
t1 = [t for t in d["tenders"] if t["id"] == "t1"][0]
assert t1["letters"]["s3"]["type"] == "award"
assert any("Outcome available" in n["subject"] for n in d["notifications"])

# --- logout invalidates the token; reset re-issues one ---
call("POST", "/api/auth/logout/", "aisha", {})
r = c.get("/api/bootstrap/", HTTP_AUTHORIZATION=f"Bearer {TOK['aisha']}")
assert r.status_code == 401
r = call("POST", "/api/reset/", "amara", {})
assert r["token"]
TOK["amara"] = r["token"]
d = call("GET", "/api/bootstrap/", "amara")
assert (len(d["tenders"]) == SEEDED_TENDERS
        and [t for t in d["tenders"] if t["id"] == "t1"][0]["status"] == "evaluation")

print("ALL SMOKE TESTS PASSED")

# ================= full-platform additions =================
# (the reset above restored the seed and revoked tokens — sign the cast back in)
for u in ["deji", "ngozi", "mark", "aisha", "coldline", "harmattan", "bluechip"]:
    login(u)

# --- crypto sealing at rest: a fresh submission is ciphertext in the database ---
from core.models import Bid as _Bid
pdfc = io.BytesIO(b"%PDF-1.4 proposal"); pdfc.name = "coldline-proposal.pdf"
call("POST", "/api/tenders/t2/bid_docs/", "coldline", files={"file": pdfc, "envelope": "technical"})
call("POST", "/api/tenders/t2/bids/", "coldline", {"lines": {"l1": 32000, "l2": 850000, "l3": 260000}, "acks": []})
nb = _Bid.objects.filter(tender_id="t2").first()
assert nb.amount is None and nb.sealed_blob, "fresh bid must be ciphertext at rest"
from core.models import Document as _Doc
nd = _Doc.objects.filter(tender_id="t2", kind="bid").first()
assert nd.encrypted and not bytes(nd.data).startswith(b"%PDF"), "fresh bid doc must be ciphertext at rest"
# ...yet the owner can still read their own document back
r = call("GET", f"/api/docs/{nd.id}/download/", "coldline")
assert r.content.startswith(b"%PDF"), "owner download must transparently decrypt"

# --- vendor self-registration (demo auto-verify) → prequal queue → decline → fix → approve ---
r = c.post("/api/register/vendor/", json.dumps({"company": "Sahara Fresh Farms", "email": "sahara@example.com",
    "password": "SaharaFresh!1", "category": "Produce", "location": "Kano"}), content_type=J)
assert r.status_code == 200 and r.json()["verified"] is True, r.content
login("sahara@example.com", "SaharaFresh!1")
d = call("GET", "/api/bootstrap/", "sahara@example.com")
me_sup = d["suppliers"][0]
assert me_sup["prequalified"] is False and me_sup["registeredAt"], "self-registered vendor should be pending"
assert d["tenders"] == [], "unprequalified vendor sees no tenders"
sid_new = me_sup["id"]
# duplicate email blocked
r = c.post("/api/register/vendor/", json.dumps({"company": "Dup", "email": "sahara@example.com", "password": "12345678x"}), content_type=J)
assert r.status_code == 409
# procurement was notified
d = call("GET", "/api/bootstrap/", "amara")
assert any("New vendor registration" in n["subject"] for n in d["notifications"])
# vendor uploads a compliance document with expiry
pdf2 = io.BytesIO(b"%PDF-1.4 tax clearance"); pdf2.name = "tax-clearance-2026.pdf"
up = call("POST", "/api/me/docs/", "sahara@example.com", files={"file": pdf2, "label": "Tax clearance 2026", "expiry": str(int(time.time()*1000) + 200*24*3600*1000)})
d = call("GET", "/api/bootstrap/", "sahara@example.com")
assert any(x["kind"] == "supplier" for x in d["documents"])
assert any(doc.get("docId") for doc in d["suppliers"][0]["docs"])
# procurement can see + download the compliance doc, then declines with a reason
d = call("GET", "/api/bootstrap/", "amara")
comp = [x for x in d["documents"] if x["kind"] == "supplier" and x["supplierId"] == sid_new][0]
r = call("GET", f"/api/docs/{comp['id']}/download/", "amara")
assert r.content.startswith(b"%PDF")
call("POST", f"/api/suppliers/{sid_new}/prequalify/", "amara", {"ok": False}, expect=400)  # reason required
call("POST", f"/api/suppliers/{sid_new}/prequalify/", "amara", {"ok": False, "reason": "Insurance certificate missing."})
d = call("GET", "/api/bootstrap/", "sahara@example.com")
assert d["suppliers"][0]["rejectedReason"].startswith("Insurance")
assert any("Prequalification declined" in n["subject"] for n in d["notifications"])
# approve
call("POST", f"/api/suppliers/{sid_new}/prequalify/", "amara", {"ok": True})
d = call("GET", "/api/bootstrap/", "sahara@example.com")
assert d["suppliers"][0]["prequalified"] is True and not d["suppliers"][0]["rejectedReason"]

# --- team invite → accept → login with assigned role; permissions enforced ---
r = call("POST", "/api/team/invite/", "amara", {"email": "tunde@example.com", "role": "evaluator", "name": "Tunde Ajayi", "title": "Ops Analyst"})
assert r.get("inviteLink"), "demo mode should surface the invite link"
itoken = r["inviteLink"].split("itoken=")[1]
rr = c.post("/api/register/accept_invite/", json.dumps({"token": itoken, "password": "Evaluate!23"}), content_type=J)
assert rr.status_code == 200, rr.content
# token is single-use
rr = c.post("/api/register/accept_invite/", json.dumps({"token": itoken, "password": "Evaluate!23"}), content_type=J)
assert rr.status_code == 410
login("tunde@example.com", "Evaluate!23")
d = call("GET", "/api/bootstrap/", "tunde@example.com")
assert d["me"]["role"] == "evaluator"
call("POST", "/api/tenders/t5/publish_decision/", "tunde@example.com", {"ok": True}, expect=403)  # evaluators can't approve
tm = call("GET", "/api/team/", "amara")
assert any(m["email"] == "tunde@example.com" for m in tm["members"])
call("GET", "/api/team/", "tunde@example.com", expect=403)

# --- password reset (token from DB since demo email is console) ---
call("POST", "/api/auth/forgot/", None, {"email": "tunde@example.com"})
from core.models import ActionToken as _AT
rt = _AT.objects.filter(kind="reset", email="tunde@example.com", used_at__isnull=True).first()
assert rt
rr = c.post("/api/auth/reset_password/", json.dumps({"token": rt.token, "password": "NewPass!456"}), content_type=J)
assert rr.status_code == 200
r = c.post("/api/auth/login/", json.dumps({"username": "tunde@example.com", "password": "Evaluate!23"}), content_type=J)
assert r.status_code == 401, "old password must be dead"
login("tunde@example.com", "NewPass!456")

# --- opening decrypts at rest; exports; tamper-evident chain ---
call("GET", "/api/tenders/t3/export/comparison.xlsx", "amara", expect=409)  # not before the opening
call("POST", "/api/tenders/t3/open/", "amara", {})
b4 = _Bid.objects.get(pk="b4")
assert b4.amount == 312000000 and b4.sealed_blob is None, "opening must decrypt at rest"
assert not _Doc.objects.filter(tender_id="t3", kind="bid", encrypted=True).exists(), "opening must decrypt documents"
call("POST", "/api/tenders/t1/recommend/", "amara", {"bidId": "b1"})  # regenerates the memo post-reset
r = call("GET", "/api/tenders/t3/export/comparison.xlsx", "amara")
assert r.content[:2] == b"PK", "xlsx magic"
call("GET", "/api/tenders/t3/export/comparison.xlsx", "coldline", expect=403)
r = call("GET", "/api/tenders/t1/export/memo.pdf", "mark")
assert r.content.startswith(b"%PDF")
r = call("GET", "/api/export/audit.csv", "aisha")
assert b"prev_hash" in r.content
ok = call("GET", "/api/audit/integrity/", "aisha")
assert ok["ok"] and ok["count"] > 20, ok
# tamper with one event → chain must break
from core.models import Event as _Ev
ev = _Ev.objects.order_by("seq")[5]
orig = ev.detail; ev.detail = "history, rewritten"; ev.save(update_fields=["detail"])
ok = call("GET", "/api/audit/integrity/", "aisha")
assert ok["ok"] is False and ok["brokenAt"] == 6, ok
ev.detail = orig; ev.save(update_fields=["detail"])
assert call("GET", "/api/audit/integrity/", "aisha")["ok"]

print("FULL PLATFORM TESTS PASSED")

# ================= two-stage opening + reverse auctions =================
from core.models import Tender as _T

# --- reverse auction on seeded t7 ---
a = call("GET", "/api/tenders/t7/auction/", "coldline")
assert a["live"] and a["myRank"] == 1 and a["bidders"] == 3, a
assert "leaderboard" not in a, "suppliers must never see the leaderboard"
h = call("GET", "/api/tenders/t7/auction/", "harmattan")
assert h["myRank"] == 3 and all("amount" not in k for k in ("leaderboard",) if k in h)
buyer = call("GET", "/api/tenders/t7/auction/", "amara")
assert buyer["leaderboard"][0]["supplier"] == "Coldline Logistics" and buyer["leaderboard"][0]["amount"] == 86_500_000
# decrement rule: harmattan must undercut own 87.9m by ≥0.5m
call("POST", "/api/tenders/t7/auction/bids/", "harmattan", {"amount": 87_600_000}, expect=400)
r = call("POST", "/api/tenders/t7/auction/bids/", "harmattan", {"amount": 86_000_000})
assert r["myRank"] == 1
# first bid over the ceiling rejected; at/below accepted
call("POST", "/api/tenders/t7/auction/bids/", "bluechip", {"amount": 95_000_000}, expect=400)
call("POST", "/api/tenders/t7/auction/bids/", "bluechip", {"amount": 89_000_000})
# sealed-bid endpoint is closed on auctions
call("POST", "/api/tenders/t7/bids/", "coldline", {"amount": 80_000_000, "acks": []}, expect=409)
# anti-sniping: with <2min left, a bid extends the close
_T.objects.filter(pk="t7").update(deadline=int(time.time() * 1000) + 60_000)
before = _T.objects.get(pk="t7").deadline
r = call("POST", "/api/tenders/t7/auction/bids/", "coldline", {"amount": 85_500_000})
assert r["extended"] and r["deadline"] > before, "anti-sniping extension failed"
# recording blocked while live; then close and record
call("POST", "/api/tenders/t7/open/", "amara", {}, expect=409)
_T.objects.filter(pk="t7").update(deadline=int(time.time() * 1000) - 1000)
call("POST", "/api/tenders/t7/open/", "amara", {})
d = call("GET", "/api/bootstrap/", "amara")
t7bids = sorted([b for b in d["bids"] if b["tenderId"] == "t7"], key=lambda b: b["amount"])
assert t7bids[0]["amount"] == 85_500_000 and len(t7bids) == 4
# award the auction through the normal CFO flow
call("POST", "/api/tenders/t7/recommend/", "amara", {"bidId": t7bids[0]["id"]})
call("POST", "/api/tenders/t7/award_decision/", "mark", {"ok": True})
d = call("GET", "/api/bootstrap/", "coldline")
assert [t for t in d["tenders"] if t["id"] == "t7"][0]["letters"]["s2"]["type"] == "award"

# --- two-stage envelope opening, full lifecycle on a fresh tender ---
r = call("POST", "/api/tenders/", "amara", {
    "title": "Store security services — two-stage", "type": "RFP", "category": "Facilities",
    "budget": 40_000_000, "deadline": int(time.time() * 1000) + 86_400_000, "techWeight": 60,
    "twoStage": True, "techThreshold": 70, "scope": "Guarding for 12 flagship stores.",
    "criteria": [{"name": "Capability", "weight": 60}, {"name": "Coverage", "weight": 40}],
    "invited": ["s2", "s3"], "submit": True})
ts_id = r["id"]
st = [t for t in call("GET", "/api/bootstrap/", "amara")["tenders"] if t["id"] == ts_id][0]
assert st["twoStage"] and st["techThreshold"] == 70
if st["status"] == "approval":
    call("POST", f"/api/tenders/{ts_id}/publish_decision/", "mark", {"ok": True})
for who, amt in (("coldline", 36_000_000), ("harmattan", 38_000_000)):
    f1 = io.BytesIO(b"%PDF-1.4 tech"); f1.name = f"{who}-technical.pdf"
    call("POST", f"/api/tenders/{ts_id}/bid_docs/", who, files={"file": f1, "envelope": "technical"})
    f2 = io.BytesIO(b"%PDF-1.4 commercial"); f2.name = f"{who}-commercial.pdf"
    call("POST", f"/api/tenders/{ts_id}/bid_docs/", who, files={"file": f2, "envelope": "commercial"})
    call("POST", f"/api/tenders/{ts_id}/bids/", who, {"amount": amt, "acks": []})
_T.objects.filter(pk=ts_id).update(deadline=int(time.time() * 1000) - 1000)
# stage 1: technical only
call("POST", f"/api/tenders/{ts_id}/open/", "amara", {})
t = _T.objects.get(pk=ts_id)
assert t.tech_opened_at and not t.opened_at
bmap = {b.supplier_id: b for b in t.bids.all()}
assert all(b.amount is None and b.sealed_blob for b in bmap.values()), "prices must stay ciphertext in stage 1"
d = call("GET", "/api/bootstrap/", "amara")
sb = [b for b in d["bids"] if b["tenderId"] == ts_id]
assert all(b.get("commercialSealed") and "amount" not in b for b in sb), "API must not expose prices in stage 1"
docs = [x for x in d["documents"] if x["tenderId"] == ts_id and x["kind"] == "bid"]
assert all(x["envelope"] == "technical" for x in docs), "commercial docs must stay invisible in stage 1"
# stage 2 blocked until scored
call("POST", f"/api/tenders/{ts_id}/open/", "amara", {}, expect=409)
# both evaluators score: coldline passes, harmattan fails the 70 threshold
for ev in ("deji", "ngozi"):
    call("POST", f"/api/tenders/{ts_id}/coi/", ev, {})
    for sid, v in (("s2", 9), ("s3", 4)):
        call("POST", f"/api/bids/{bmap[sid].id}/scores/", ev, {"scores": {c["id"]: v for c in t.criteria}})
# stage 2: commercial envelopes for compliant bidders only
call("POST", f"/api/tenders/{ts_id}/open/", "amara", {"threshold": 70})
t = _T.objects.get(pk=ts_id)
b_cold, b_harm = t.bids.get(supplier_id="s2"), t.bids.get(supplier_id="s3")
assert b_cold.amount == 36_000_000 and b_cold.sealed_blob is None
assert b_harm.disqualified and b_harm.amount is None and b_harm.sealed_blob, \
    "disqualified commercial envelope must remain ciphertext forever"
d = call("GET", "/api/bootstrap/", "amara")
api_harm = [b for b in d["bids"] if b["tenderId"] == ts_id and b["supplierId"] == "s3"][0]
assert api_harm["disqualified"] and "amount" not in api_harm
harm_comm = Document.objects.get(tender_id=ts_id, supplier_id="s3", envelope="commercial")
call("GET", f"/api/docs/{harm_comm.id}/download/", "amara", expect=403)  # returned unopened
assert harm_comm.encrypted
d = call("GET", "/api/bootstrap/", "harmattan")
assert any("Technical evaluation outcome" in n["subject"] for n in d["notifications"])
# recommending the disqualified bidder is impossible; the compliant one flows to award
call("POST", f"/api/tenders/{ts_id}/recommend/", "amara", {"bidId": b_harm.id}, expect=409)
call("POST", f"/api/tenders/{ts_id}/recommend/", "amara", {"bidId": b_cold.id})
call("POST", f"/api/tenders/{ts_id}/award_decision/", "mark", {"ok": True})

print("STAGE-2 + AUCTION TESTS PASSED")

# ================= reminder mails =================
from core.tasks import run_sweep as _sweep
from core.models import Supplier as _S, TaskMark as _TM, Notification as _N
_now = int(time.time() * 1000)
_D = 24 * 3600 * 1000

# vendor expiry: harmattan's HACCP (~24d out) → 60d and 30d marks fire; vendor + procurement each hear once
_sweep()
assert _N.objects.filter(user__username="harmattan", subject__startswith="Document expiring").count() == 1
before = _N.objects.filter(user__username="harmattan", subject__startswith="Document expiring").count()
_sweep()  # idempotent
assert _N.objects.filter(user__username="harmattan", subject__startswith="Document expiring").count() == before

# stalled scoring: t1 opened long ago (seed); tunde (new evaluator) hasn't scored → nudged once
_T.objects.filter(pk="t1").update(status="evaluation")  # t1 was awarded earlier in this run — restage it
from core.models import Tender as _T2
_TM.objects.filter(key__startswith="scorenudge:t1").delete()
_sweep()
assert _N.objects.filter(user__username="tunde@example.com", subject__startswith="Scores outstanding").exists()

# waiting approval: plant a stale recommendation on t2 and nudge the approver
t2 = _T.objects.get(pk="t2")
t2.status = "evaluation"
t2.award_rec = {"bidId": "x", "supplierId": "s2", "amount": 1, "by": "test", "at": _now - 3 * _D, "memo": "m"}
t2.save()
_sweep()
assert _N.objects.filter(user__username="mark", subject__startswith="Approval waiting").exists()

# unreviewed registration: age sahara's registration and nudge procurement
_S.objects.filter(contact_email="sahara@example.com").update(registered_at=_now - 4 * _D, prequalified=False, rejected_reason="")
_sweep()
assert _N.objects.filter(user__username="amara", subject__startswith="Registration awaiting review").exists()

print("REMINDER MAIL TESTS PASSED")

# ================= approval matrix, import, duplication, compliance =================
# threshold: default 50m — a 30m tender publishes straight through; a 60m routes to approval
r = call("POST", "/api/tenders/", "amara", {"title": "Small signage refresh", "type": "RFQ", "category": "Facilities",
    "budget": 30_000_000, "deadline": _now + 10 * _D, "techWeight": 60,
    "criteria": [{"name": "Quality", "weight": 60}, {"name": "Price terms", "weight": 40}],
    "invited": ["s2"], "scope": "x", "submit": True})
small = [t for t in call("GET", "/api/bootstrap/", "amara")["tenders"] if t["id"] == r["id"]][0]
assert small["status"] == "published", small["status"]
r = call("POST", "/api/tenders/", "amara", {"title": "Big fit-out", "type": "RFQ", "category": "Facilities",
    "budget": 60_000_000, "deadline": _now + 10 * _D, "techWeight": 60,
    "criteria": [{"name": "Quality", "weight": 60}, {"name": "Price terms", "weight": 40}],
    "invited": ["s2"], "scope": "x", "submit": True})
big_id = r["id"]
big = [t for t in call("GET", "/api/bootstrap/", "amara")["tenders"] if t["id"] == big_id][0]
assert big["status"] == "approval"
assert any("Publication approval needed" in n["subject"] for n in call("GET", "/api/bootstrap/", "mark")["notifications"])
# approver changes the matrix; procurement cannot
call("POST", "/api/settings/", "amara", {"approvalThreshold": 10_000_000}, expect=403)
r = call("POST", "/api/settings/", "mark", {"approvalThreshold": 100_000_000})
assert r["approvalThreshold"] == 100_000_000
r = call("POST", "/api/tenders/", "amara", {"title": "Mid-size uniforms", "type": "RFQ", "category": "Facilities",
    "budget": 80_000_000, "deadline": _now + 10 * _D, "techWeight": 60,
    "criteria": [{"name": "Quality", "weight": 60}, {"name": "Price terms", "weight": 40}],
    "invited": ["s2"], "scope": "x", "submit": True})
mid = [t for t in call("GET", "/api/bootstrap/", "amara")["tenders"] if t["id"] == r["id"]][0]
assert mid["status"] == "published", "80m must bypass a 100m threshold"
assert call("GET", "/api/bootstrap/", "amara")["org"]["approvalThreshold"] == 100_000_000

# CSV import: creates two, skips a duplicate and a blank
csvf = io.BytesIO("name,category,location,email,prequalified\nAcme Farms,Produce,Jos,acme@x.com,yes\nColdline Logistics,Logistics,Lagos,,no\nBendel Papers,Packaging,Benin,,\n,,,,\n".encode())
csvf.name = "book.csv"
r = call("POST", "/api/suppliers/import/", "amara", files={"file": csvf})
assert r["created"] == 2 and r["skipped"] == 2, r
sups = call("GET", "/api/bootstrap/", "amara")["suppliers"]
acme = [s for s in sups if s["name"] == "Acme Farms"][0]
assert acme["prequalified"] is True

# duplication: copy carries structure, clears dates, lands as draft
r = call("POST", "/api/tenders/t1/duplicate/", "amara", {})
dup = [t for t in call("GET", "/api/bootstrap/", "amara")["tenders"] if t["id"] == r["id"]][0]
assert dup["status"] == "draft" and dup["title"].endswith("(copy)") and len(dup["criteria"]) == 4 and dup["deadline"] == 0
call("POST", "/api/tenders/t1/duplicate/", "coldline", {}, expect=403)

# compliance report: auditor gets a PDF; supplier gets 403
rp = call("GET", "/api/tenders/t1/export/compliance.pdf", "aisha")
assert rp.content.startswith(b"%PDF") and len(rp.content) > 1500
call("GET", "/api/tenders/t1/export/compliance.pdf", "coldline", expect=403)

print("MATRIX + IMPORT + TEMPLATES + COMPLIANCE PASSED")

# ================= MFA + lockout + sessions =================
import pyotp as _pyotp

# lockout: 5 bad passwords lock the account, even for the right password
for i in range(5):
    r = c.post("/api/auth/login/", json.dumps({"username": "deji", "password": "nope"}), content_type=J)
    assert r.status_code == 401
r = c.post("/api/auth/login/", json.dumps({"username": "deji", "password": "docket-demo"}), content_type=J)
assert r.status_code == 429, "account should be locked"
from core.models import FailedLogin as _FL
_FL.objects.filter(username="deji").delete()  # simulate the window passing
login("deji")

# MFA: enroll ngozi, wrong-code rejected, login then requires a code
login("ngozi")
setup = call("POST", "/api/auth/mfa/setup/", "ngozi", {})
assert setup["qr"].startswith("data:image/png") and setup["secret"]
call("POST", "/api/auth/mfa/enable/", "ngozi", {"code": "000000"}, expect=400)
call("POST", "/api/auth/mfa/enable/", "ngozi", {"code": _pyotp.TOTP(setup["secret"]).now()})
r = c.post("/api/auth/login/", json.dumps({"username": "ngozi", "password": "docket-demo"}), content_type=J)
assert r.status_code == 401 and r.json().get("mfaRequired") is True
r = c.post("/api/auth/login/", json.dumps({"username": "ngozi", "password": "docket-demo", "code": "123456"}), content_type=J)
assert r.status_code == 401 and not r.json().get("mfaRequired")
r = c.post("/api/auth/login/", json.dumps({"username": "ngozi", "password": "docket-demo",
                                           "code": _pyotp.TOTP(setup["secret"]).now()}), content_type=J)
assert r.status_code == 200
TOK["ngozi"] = r.json()["token"]
assert call("GET", "/api/auth/mfa/", "ngozi")["enabled"] is True
# disable requires a current code
call("POST", "/api/auth/mfa/disable/", "ngozi", {"code": "999999"}, expect=400)
call("POST", "/api/auth/mfa/disable/", "ngozi", {"code": _pyotp.TOTP(setup["secret"]).now()})
r = c.post("/api/auth/login/", json.dumps({"username": "ngozi", "password": "docket-demo"}), content_type=J)
assert r.status_code == 200

# sign out everywhere: every session dies at once
login("bluechip"); tok1 = TOK["bluechip"]
login("bluechip"); tok2 = TOK["bluechip"]
r = call("POST", "/api/auth/logout_all/", "bluechip", {})
assert r["revoked"] >= 2
for tk in (tok1, tok2):
    assert c.get("/api/bootstrap/", HTTP_AUTHORIZATION=f"Bearer {tk}").status_code == 401
login("bluechip")

print("MFA + LOCKOUT + SESSIONS PASSED")

# ================= rename: workspace, self, company =================
# vendor cannot rename the workspace; procurement can — and the ref prefix follows
call("POST", "/api/settings/", "coldline", {"name": "Evil Corp"}, expect=403)
r = call("POST", "/api/settings/", "amara", {"name": "Savannah Retail Group", "short": "Savannah"})
assert r["name"] == "Savannah Retail Group" and r["short"] == "Savannah"
assert call("GET", "/api/bootstrap/", "amara")["org"]["name"] == "Savannah Retail Group"
r = call("POST", "/api/tenders/", "amara", {"title": "Renamed-org tender", "type": "RFQ", "category": "Facilities",
    "budget": 5_000_000, "deadline": _now + 5 * _D, "techWeight": 60,
    "criteria": [{"name": "Quality", "weight": 60}, {"name": "Terms", "weight": 40}],
    "invited": ["s2"], "scope": "x", "submit": True})
newt = [t for t in call("GET", "/api/bootstrap/", "amara")["tenders"] if t["id"] == r["id"]][0]
assert newt["ref"].startswith("SAV-"), newt["ref"]
# invitation email carries the new name (in-app notification body is the proxy)
d = call("GET", "/api/bootstrap/", "coldline")
assert any("Savannah Retail Group invites" in n["body"] for n in d["notifications"])

# rename myself (buyer persona) — audit keeps the trail
call("POST", "/api/me/", "deji", {"name": "Deji A. Balogun"})
d = call("GET", "/api/bootstrap/", "deji")
assert d["me"]["name"] == "Deji A. Balogun"
assert any(e["action"] == "Display name changed" for e in call("GET", "/api/bootstrap/", "aisha")["events"])

# vendor fixes their company details
call("POST", "/api/me/", "coldline", {"name": "Coldline Logistics Ltd", "location": "Ikeja, Lagos"})
d = call("GET", "/api/bootstrap/", "coldline")
assert d["suppliers"][0]["name"] == "Coldline Logistics Ltd" and d["me"]["name"] == "Coldline Logistics Ltd"
# name too short rejected
call("POST", "/api/me/", "deji", {"name": "D"}, expect=400)

print("RENAME TESTS PASSED")
