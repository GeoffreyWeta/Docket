"""The October 2026 team feedback, end to end through the API.

    python test_event_controls.py

  LINE MANAGER FIRST. Every tender waits for the raiser's line manager before
  any vendor hears of it, whatever its value. The people above the manager can
  sign in their place; with nobody on record above the raiser, anybody who can
  approve publication signs, never the raiser. A manager sending their own
  report's draft has signed it by sending it. The switch turns it off.

  CLOSING DATES MOVE WITH APPROVAL. Later, or earlier with a day's notice. The
  published date stands until the requester's line manager approves; then every
  invited vendor is told. Resuming a paused tender on a new date is the same.

  REMINDERS AT SET TIMES. Vendors who have not bid are reminded at each of the
  workspace's reminder times, once each, only for moments after the event went
  out, and only the latest when several fall due together.

  AUCTIONS ARE SCHEDULED. A draft goes to the line manager; once approved it is
  scheduled and every vendor is told when it opens and closes. It opens on time
  by itself, and closes by itself. Its times move only with approval.

  THE PRE-BID STAGE. While scheduled, vendors read everything, ask questions,
  and (where allowed) put in an opening price, sealed from the others until the
  room opens, when it stands as their first bid.

  BID DOCUMENTS HAVE TYPES. A quotation is sealed in the commercial envelope;
  the buyer can require particular types.

  PAYMENT TERMS AND NDA. Accepted, and signed, before a vendor sees the event
  or bids, and kept with the exact text and its digest.
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

from core import auction as engine                         # noqa: E402
from core import tasks                                     # noqa: E402
from core.models import (Acceptance, Auction, AuctionLot, AuthToken,  # noqa: E402
                         Document, Notification, OrgSetting, Persona, Profile, SignOff,
                         Supplier, Tender)
from core.util import DAY_MS, now_ms, rid                  # noqa: E402

PASSED, FAILED = [], []
c = Client()
J = "application/json"
HOUR = 3600_000


def ok(label, cond, extra=""):
    (PASSED if cond else FAILED).append(label)
    print(("  PASS  " if cond else "  FAIL  ") + label + ("" if cond else f"  - {extra}"))


def buyer(name, role, manager=None):
    p = Persona.objects.create(id=rid("u"), name=name, role=role, title=role.title(),
                               manager=manager)
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


def settings_to(**data):
    OrgSetting.objects.update_or_create(pk=1, defaults={"data": {"approvalThreshold": 0, **data}})


def mails_to(addr):
    return [m for m in mail.outbox if addr in m.to]


# The cast. Chidi reports to Amara, who reports to the CFO.
CFO, CFO_K = buyer("Mark Iyer", "approver")
AMARA, AMARA_K = buyer("Amara Okafor", "procurement", manager=CFO)
CHIDI, CHIDI_K = buyer("Chidi Nwosu", "procurement", manager=AMARA)
LONE, LONE_K = buyer("Lone Buyer", "procurement")              # nobody above them
APPR2, APPR2_K = buyer("Bisi Ogunleye", "approver")
A, A_K = vendor("Alpha Packaging")
B, B_K = vendor("Beta Packaging")

BASE = {
    "title": "Cups", "type": "RFQ", "category": "Packaging", "techWeight": 60,
    "criteria": [{"name": "Quality", "weight": 100}], "scope": "Supply of cups.",
    "invited": [A.id, B.id], "technicalDocumentRequired": False,
    "lines": [{"desc": "Cups", "qty": 100, "unit": "box"}],
}


def make(key, extra=None, submit=True):
    code, out = call("POST", "/api/tenders/", key,
                     {**BASE, "deadline": now_ms() + 5 * DAY_MS, **(extra or {}), "submit": submit})
    assert code == 200, out
    return Tender.objects.get(pk=out["id"])


# ================================================================ 1. line manager
print("\n-- every tender waits for the raiser's line manager")
settings_to()
mail.outbox = []
t = make(CHIDI_K)
ok("a tender with no threshold to meet still waits for sign-off", t.status == "approval", t.status)
steps = list(t.approval_steps.order_by("seq"))
ok("its one signature is Chidi's line manager", len(steps) == 1 and steps[0].level_id == "line"
   and steps[0].persona_id == AMARA.id, [(s.level_id, s.persona_id) for s in steps])
ok("no vendor has heard of it", not mails_to(A.contact_email) and tender_for(A_K, t.id) is None)
ok("the line manager is told", any("Publication approval needed" in n.subject
                                   for n in Notification.objects.filter(user__profile__persona=AMARA)))
ok("and has it in their queue", boot(AMARA_K)["me"]["signQueue"] >= 1)
code, out = call("POST", f"/api/tenders/{t.id}/publish_decision/", APPR2_K, {"ok": True})
ok("an approver who is not in the reporting line cannot sign it", code == 403, (code, out))
code, out = call("POST", f"/api/tenders/{t.id}/publish_decision/", CHIDI_K, {"ok": True})
ok("nor can the raiser", code == 403, code)
code, out = call("POST", f"/api/tenders/{t.id}/publish_decision/", AMARA_K, {"ok": True})
t.refresh_from_db()
ok("the line manager's yes publishes it", code == 200 and t.status == "published", (code, out, t.status))
ok("and the vendors are invited", len(mails_to(A.contact_email)) == 1)

t = make(CHIDI_K)
code, _ = call("POST", f"/api/tenders/{t.id}/publish_decision/", CFO_K, {"ok": True})
t.refresh_from_db()
ok("the manager's own manager can sign in their place", code == 200 and t.status == "published",
   (code, t.status))

t = make(CHIDI_K)
code, out = call("POST", f"/api/tenders/{t.id}/publish_decision/", AMARA_K, {"ok": False})
ok("sending it back needs a reason", code == 400, code)
code, _ = call("POST", f"/api/tenders/{t.id}/publish_decision/", AMARA_K,
               {"ok": False, "reason": "Scope or specification needs work"})
t.refresh_from_db()
ok("returned with a reason, it is a draft again", code == 200 and t.status == "draft", t.status)

draft = make(CHIDI_K, submit=False)
code, _ = call("POST", f"/api/tenders/{draft.id}/submit/", AMARA_K)
draft.refresh_from_db()
ok("a line manager submitting their report's draft has signed it by sending it",
   code == 200 and draft.status == "published", (code, draft.status))

t = make(LONE_K)
step = t.approval_steps.first()
ok("with nobody above the raiser, anybody who can approve publication signs",
   t.status == "approval" and step.level_id == "any", (t.status, step and step.level_id))
code, _ = call("POST", f"/api/tenders/{t.id}/publish_decision/", APPR2_K, {"ok": True})
t.refresh_from_db()
ok("and an approver does", code == 200 and t.status == "published", (code, t.status))

print("\n-- with a threshold, and with a ladder")
settings_to(approvalThreshold=1_000)
t = make(CHIDI_K, {"lines": [{"desc": "Cups", "qty": 100, "unit": "box", "price": 500}]})
steps = list(t.approval_steps.order_by("seq"))
ok("above the threshold, the line manager signs and then publication authority",
   [s.level_id for s in steps] == ["line", "any"], [s.level_id for s in steps])
call("POST", f"/api/tenders/{t.id}/publish_decision/", AMARA_K, {"ok": True})
t.refresh_from_db()
ok("one signature in, it still waits", t.status == "approval", t.status)
call("POST", f"/api/tenders/{t.id}/publish_decision/", APPR2_K, {"ok": True})
t.refresh_from_db()
ok("and goes out after the second", t.status == "published", t.status)
t = make(AMARA_K, {"lines": [{"desc": "Cups", "qty": 100, "unit": "box", "price": 500}]})
ok("a line manager who holds publication authority is one signature, not two",
   [s.level_id for s in t.approval_steps.all()] == ["line"], [s.level_id for s in t.approval_steps.all()])

ladder = [{"id": "lv1", "name": "Head of Procurement", "limit": 10_000_000, "role": ""},
          {"id": "lv2", "name": "CFO", "limit": 0, "role": ""}]
settings_to(approvalLevels=ladder)
Persona.objects.filter(pk=AMARA.id).update(approval_level="lv1")
Persona.objects.filter(pk=CFO.id).update(approval_level="lv2")
t = make(CHIDI_K, {"lines": [{"desc": "Cups", "qty": 100, "unit": "box", "price": 500}]})
ok("a line manager standing on the ladder's first rung is the one signature",
   [(s.level_id, s.persona_id) for s in t.approval_steps.all()] == [("lv1", AMARA.id)],
   [(s.level_id, s.persona_id) for s in t.approval_steps.all()])
t = make(CHIDI_K, {"lines": [{"desc": "Cups", "qty": 100_000, "unit": "box", "price": 500}]})
ok("a larger amount walks on up the ladder", [s.level_id for s in t.approval_steps.order_by("seq")]
   == ["lv1", "lv2"], [s.level_id for s in t.approval_steps.order_by("seq")])
Persona.objects.filter(pk__in=[AMARA.id, CFO.id]).update(approval_level="")

settings_to(lineManagerApproval=False)
t = make(CHIDI_K)
ok("switched off, a tender under the threshold publishes straight away", t.status == "published",
   t.status)

print("\n-- the switch is the approval matrix's to change")
code, _ = call("POST", "/api/settings/", CHIDI_K, {"lineManagerApproval": True})
ok("procurement cannot change it", code == 403, code)
code, out = call("POST", "/api/settings/", CFO_K, {"lineManagerApproval": True, "timelineApproval": True})
ok("an approver can", code == 200 and out["lineManagerApproval"] is True, (code, out.get("lineManagerApproval")))
code, _ = call("POST", "/api/settings/", CFO_K, {"lineManagerApproval": "yes"})
ok("and it has to be on or off", code == 400, code)

# ================================================================ 2. closing dates
print("\n-- moving a closing date waits for the line manager")
settings_to(lineManagerApproval=False)
t = make(CHIDI_K)
old = t.deadline
mail.outbox = []
code, out = call("POST", f"/api/tenders/{t.id}/extend/", CHIDI_K,
                 {"deadline": old + 3 * DAY_MS, "reason": "Two vendors asked for more time."})
t.refresh_from_db()
ok("the request is made", code == 200 and out.get("pending") and out.get("approver") == "Amara Okafor",
   (code, out))
ok("and nothing has moved yet", t.deadline == old)
ok("nor has any vendor been told", not mails_to(A.contact_email))
so = SignOff.objects.get(pk=out["signoff"]["id"])
code, _ = call("POST", f"/api/tenders/{t.id}/extend/", CHIDI_K,
               {"deadline": old + 4 * DAY_MS, "reason": "Again."})
ok("a second request while one waits is refused", code == 409, code)
code, _ = call("POST", f"/api/signoffs/{so.id}/decide/", CHIDI_K, {"ok": True})
ok("nobody approves their own request", code == 403, code)
code, _ = call("POST", f"/api/signoffs/{so.id}/decide/", APPR2_K, {"ok": True})
ok("nor somebody outside the reporting line", code == 403, code)
ok("the line manager sees it as theirs", any(x["id"] == so.id and x["mayDecide"]
                                             for x in boot(AMARA_K)["signoffs"]))
mine = next(x for x in boot(AMARA_K)["signoffs"] if x["id"] == so.id)
ok("with how far the competition has got", mine["details"] == {"invited": 2, "bids": 0, "changes": 0},
   mine.get("details"))
code, out = call("POST", f"/api/signoffs/{so.id}/decide/", AMARA_K, {"ok": True})
t.refresh_from_db()
ok("approved, the closing date moves", code == 200 and t.deadline == old + 3 * DAY_MS, (code, out))
ok("on the record with who asked and who approved",
   t.deadline_changes[-1].get("by") == "Chidi Nwosu" and t.deadline_changes[-1].get("approvedBy") == "Amara Okafor",
   t.deadline_changes)
ok("and every invited vendor is told", len(mails_to(A.contact_email)) == 1 and len(mails_to(B.contact_email)) == 1)
ok("the requester hears it was approved",
   Notification.objects.filter(user__profile__persona=CHIDI, subject__startswith="Approved:").exists())

code, out = call("POST", f"/api/tenders/{t.id}/extend/", CHIDI_K,
                 {"deadline": now_ms() + 2 * HOUR, "reason": "Urgent."})
ok("moving it earlier with less than a day's notice is refused", code == 400 and "24 hours" in out.get("error", ""),
   (code, out))
earlier = t.deadline - 2 * DAY_MS
mail.outbox = []
code, out = call("POST", f"/api/tenders/{t.id}/extend/", CHIDI_K,
                 {"deadline": earlier, "reason": "Stock is needed sooner."})
so = SignOff.objects.get(pk=out["signoff"]["id"])
code, _ = call("POST", f"/api/signoffs/{so.id}/decide/", AMARA_K, {"ok": False})
ok("turning it down needs a reason", code == 400, code)
code, _ = call("POST", f"/api/signoffs/{so.id}/decide/", AMARA_K, {"ok": False, "note": "Keep the date."})
t.refresh_from_db()
ok("turned down, nothing changes", code == 200 and t.deadline != earlier)
ok("and nobody outside is told", not mails_to(A.contact_email))
code, out = call("POST", f"/api/tenders/{t.id}/extend/", CHIDI_K,
                 {"deadline": earlier, "reason": "Stock is needed sooner."})
so = SignOff.objects.get(pk=out["signoff"]["id"])
call("POST", f"/api/signoffs/{so.id}/decide/", AMARA_K, {"ok": True})
t.refresh_from_db()
ok("moving it earlier with enough notice is allowed once approved", t.deadline == earlier)
ok("and vendors are told it was brought forward",
   any("brought forward" in m.subject for m in mails_to(A.contact_email)))

code, out = call("POST", f"/api/tenders/{t.id}/extend/", CHIDI_K,
                 {"deadline": t.deadline + DAY_MS, "reason": "More time."})
so = SignOff.objects.get(pk=out["signoff"]["id"])
code, _ = call("POST", f"/api/signoffs/{so.id}/withdraw/", AMARA_K)
ok("only the requester can withdraw it", code == 403, code)
code, _ = call("POST", f"/api/signoffs/{so.id}/withdraw/", CHIDI_K)
so.refresh_from_db()
ok("the requester can", code == 200 and so.status == "withdrawn", so.status)

print("\n-- resuming a paused tender on a new date")
call("POST", f"/api/tenders/{t.id}/pause/", CHIDI_K, {"reason": "Specification error."})
new = now_ms() + 6 * DAY_MS
code, out = call("POST", f"/api/tenders/{t.id}/resume/", CHIDI_K, {"deadline": new})
t.refresh_from_db()
ok("a new date on resume waits for approval and the event stays paused",
   code == 200 and out.get("pending") and t.status == "paused", (code, out, t.status))
so = SignOff.objects.filter(tender=t, status="pending").first()
call("POST", f"/api/signoffs/{so.id}/decide/", AMARA_K, {"ok": True})
t.refresh_from_db()
ok("approved, it resumes on that date", t.status == "published" and t.deadline == new, (t.status, t.deadline == new))

print("\n-- requests that no longer apply")
code, out = call("POST", f"/api/tenders/{t.id}/extend/", CHIDI_K,
                 {"deadline": t.deadline + DAY_MS, "reason": "More time."})
so = SignOff.objects.get(pk=out["signoff"]["id"])
call("POST", f"/api/tenders/{t.id}/cancel/", CHIDI_K, {"reason": "Requirement withdrawn."})
so.refresh_from_db()
ok("cancelling the event voids a waiting date change", so.status == "void", so.status)

settings_to(lineManagerApproval=False, timelineApproval=False)
t = make(CHIDI_K)
code, out = call("POST", f"/api/tenders/{t.id}/extend/", CHIDI_K,
                 {"deadline": t.deadline + DAY_MS, "reason": "More time."})
t.refresh_from_db()
ok("with date change approval off, it moves at once", code == 200 and not out.get("pending")
   and t.deadline == out.get("deadline"), (code, out))

# ================================================================ 3. reminders
print("\n-- reminders at the workspace's reminder times")
H = [72, 24, 2]
close = now_ms() + 100 * HOUR
ok("nothing is due 100 hours out", tasks.due_reminder(close, 0, now_ms(), H) is None)
ok("the 3-day reminder is due at 70 hours out",
   tasks.due_reminder(now_ms() + 70 * HOUR, 0, now_ms(), H) == 72)
ok("only the latest is sent when several are due",
   tasks.due_reminder(now_ms() + 1 * HOUR, 0, now_ms(), H) == 2)
ok("a moment before publication does not count",
   tasks.due_reminder(now_ms() + 30 * HOUR, now_ms() - HOUR, now_ms(), H) is None)

settings_to(lineManagerApproval=False, reminderHours=[72, 24, 2])
t = make(CHIDI_K)
Tender.objects.filter(pk=t.id).update(published_at=now_ms() - 3 * DAY_MS, deadline=now_ms() + 20 * HOUR)
up = upload(f"/api/tenders/{t.id}/bid_docs/", B_K, "q.pdf", b"%PDF-1.4", docType="Quotation")
code, _ = call("POST", f"/api/tenders/{t.id}/bids/", B_K, {"decl": True, "lines": {
    Tender.objects.get(pk=t.id).lines[0]["id"]: 10}})
ok("(Beta has bid)", code == 200, code)
mail.outbox = []
n = tasks.send_tender_reminders()
ok("the vendor who has not bid is reminded", any("Reminder:" in m.subject for m in mails_to(A.contact_email)))
ok("the one who has is not", not mails_to(B.contact_email))
ok("once", tasks.send_tender_reminders() == 0)
Tender.objects.filter(pk=t.id).update(deadline=now_ms() + 90 * 60_000)
mail.outbox = []
tasks.send_tender_reminders()
ok("and again at the next reminder time", any("Reminder:" in m.subject for m in mails_to(A.contact_email)))
code, _ = call("POST", "/api/settings/", AMARA_K, {"reminderHours": [5]})
ok("reminder times come off the list", code == 400, code)
code, out = call("POST", "/api/settings/", AMARA_K, {"reminderHours": [24, 168]})
ok("and are stored largest first", code == 200 and out["reminderHours"] == [168, 24], out.get("reminderHours"))
code, out = call("POST", "/api/settings/", AMARA_K, {"reminderHours": []})
ok("an empty list switches them off", code == 200 and tasks.send_tender_reminders() == 0)

# ================================================================ 4. auctions
print("\n-- an auction goes to the line manager, then out on a schedule")
settings_to()


def draft_auction(key, **kw):
    code, a = call("POST", "/api/auctions/new/", key, {"title": "Diesel", "terms": "Binding bids."})
    aid = a["id"]
    call("POST", f"/api/auctions/{aid}/lots/", key, {"title": "AGO 12 months", "ceiling": 1_000_000,
                                                    "minDecrement": 10_000, "qty": 1})
    call("POST", f"/api/auctions/{aid}/participants/", key, {"supplierIds": [A.id, B.id]})
    call("PATCH", f"/api/auctions/{aid}/", key, {"startsAt": now_ms() + 3 * DAY_MS,
                                                 "endsAt": now_ms() + 3 * DAY_MS + 2 * HOUR,
                                                 "requireAcceptance": True, **kw})
    return aid


aid = draft_auction(CHIDI_K, allowPrebid=True)
mail.outbox = []
code, out = call("POST", f"/api/auctions/{aid}/invite/", CHIDI_K)
ok("invitations cannot go out before approval", code == 409, code)
code, out = call("POST", f"/api/auctions/{aid}/submit/", CHIDI_K)
a = Auction.objects.get(pk=aid)
ok("sent, it waits for the line manager", code == 200 and a.status == "approval"
   and out.get("approver") == "Amara Okafor", (code, a.status, out.get("approver")))
ok("no vendor is told", not mails_to(A.contact_email))
ok("it is not in the vendor's list", aid not in [x["id"] for x in call("GET", "/api/auctions/mine/", A_K)[1]["auctions"]])
ok("nor can they open its room", call("GET", f"/api/auctions/{aid}/room/", A_K)[0] == 404)
code, _ = call("PATCH", f"/api/auctions/{aid}/", CHIDI_K, {"title": "Changed"})
ok("it cannot be edited while it waits", code == 409, code)
code, out = call("POST", f"/api/auctions/{aid}/recall/", CHIDI_K)
ok("it can be recalled to draft", code == 200 and Auction.objects.get(pk=aid).status == "draft", code)
call("POST", f"/api/auctions/{aid}/submit/", CHIDI_K)
so = SignOff.objects.get(auction_id=aid, status="pending")
mine = next(x for x in boot(AMARA_K)["signoffs"] if x["id"] == so.id)
ok("the approver sees the auction in full: its lots, vendors and terms",
   [l["title"] for l in mine["details"]["lots"]] == ["AGO 12 months"]
   and mine["details"]["vendors"] == sorted(["Alpha Packaging", "Beta Packaging"]), mine.get("details"))
code, _ = call("POST", f"/api/signoffs/{so.id}/decide/", APPR2_K, {"ok": True})
ok("somebody outside the reporting line cannot approve it", code == 403, code)
code, out = call("POST", f"/api/signoffs/{so.id}/decide/", AMARA_K, {"ok": True})
a = Auction.objects.get(pk=aid)
ok("approved with a start time ahead, it is scheduled", code == 200 and a.status == "scheduled", (code, out, a.status))
inv = mails_to(A.contact_email)
ok("and every vendor is invited with the schedule",
   inv and "opens on" in inv[0].body and "closes on" in inv[0].body and "pre-bid" in inv[0].body,
   inv and inv[0].body)
ok("it is in the vendor's list now", aid in [x["id"] for x in call("GET", "/api/auctions/mine/", A_K)[1]["auctions"]])
code, _ = call("POST", f"/api/auctions/{aid}/lots/", CHIDI_K, {"title": "More", "ceiling": 5})
ok("its lots are fixed once it has gone out", code == 409, code)

print("\n-- the pre-bid stage")
lot = AuctionLot.objects.get(auction_id=aid)
room = call("GET", f"/api/auctions/{aid}/room/", A_K)[1]
ok("the vendor can read the lots before it opens", room["lots"] and room["prebidOpen"] is True)
code, out = call("POST", f"/api/auctions/{aid}/lots/{lot.id}/bid/", A_K, {"amount": 900_000})
ok("a pre-bid waits for the rules to be accepted", code == 409 and "Accept" in out.get("error", ""), (code, out))
call("POST", f"/api/auctions/{aid}/accept/", A_K)
call("POST", f"/api/auctions/{aid}/accept/", B_K)
code, out = call("POST", f"/api/auctions/{aid}/lots/{lot.id}/bid/", A_K, {"amount": 1_200_000})
ok("it cannot be above the opening price", code == 409, (code, out))
code, out = call("POST", f"/api/auctions/{aid}/lots/{lot.id}/bid/", A_K, {"amount": 900_000})
ok("an opening price is taken", code == 200 and out.get("prebid") is True, (code, out))
code, out = call("POST", f"/api/auctions/{aid}/lots/{lot.id}/bid/", A_K, {"amount": 950_000})
ok("a new pre-bid has to improve on your own", code == 409, (code, out))
call("POST", f"/api/auctions/{aid}/lots/{lot.id}/bid/", B_K, {"amount": 880_000})
st_a = call("GET", f"/api/auctions/{aid}/room/", A_K)[1]["lotState"][0]
ok("a vendor sees their own pre-bid", [b["amount"] for b in st_a["myBids"]] == [900_000], st_a)
ok("and nothing of anyone else's: no rank, no count, no best",
   st_a.get("myRank") is None and "bidders" not in st_a and st_a.get("best") is None, st_a)
code, out = call("POST", f"/api/auctions/{aid}/lots/{lot.id}/limit/", A_K, {"floor": 500_000})
ok("automatic bidding waits for the room to open", code == 409, (code, out))
monitor = call("GET", f"/api/auctions/{aid}/room/", CHIDI_K)[1]["lotState"][0]
ok("the buyer watching sees the pre-bids", [r["amount"] for r in monitor["leaderboard"]] == [880_000, 900_000],
   monitor.get("leaderboard"))

print("\n-- questions before the room opens")
code, out = call("POST", f"/api/auctions/{aid}/questions/", A_K, {"q": "Is delivery to all sites?"})
ok("a vendor can ask a question", code == 200, (code, out))
qs_b = call("GET", f"/api/auctions/{aid}/room/", B_K)[1]["questions"]
ok("another vendor does not see an unanswered question", qs_b == [], qs_b)
qs = call("GET", f"/api/auctions/{aid}/room/", CHIDI_K)[1]["questions"]
ok("the buyer sees it, and who asked", qs and qs[0]["supplier"] == "Alpha Packaging", qs)
mail.outbox = []
code, _ = call("POST", f"/api/clarifications/{qs[0]['id']}/answer/", CHIDI_K, {"a": "Yes, all 128 sites."})
qs_b = call("GET", f"/api/auctions/{aid}/room/", B_K)[1]["questions"]
ok("once answered every vendor sees it, without who asked",
   code == 200 and qs_b and qs_b[0]["a"] and "supplier" not in qs_b[0], qs_b)
ok("and is told", any("Question answered" in m.subject for m in mails_to(B.contact_email)))

print("\n-- documents")
code, out = upload(f"/api/auctions/{aid}/docs/", CHIDI_K, "spec.pdf", b"%PDF-1.4 spec")
doc = out.get("doc", {})
ok("the buyer can add a document after it has gone out", code == 200, (code, out))
ok("and the vendors are told", any("New document" in m.subject for m in mails_to(A.contact_email)))
r = c.get(f"/api/auctions/{aid}/docs/{doc['id']}/", HTTP_AUTHORIZATION="Bearer " + A_K)
ok("an invited vendor downloads it", r.status_code == 200 and r.content.startswith(b"%PDF"), r.status_code)
ok("it is not listed among the photos", call("GET", f"/api/auctions/{aid}/room/", A_K)[1]["images"] == [])

print("\n-- times move with approval")
code, out = call("POST", f"/api/auctions/{aid}/times/", CHIDI_K,
                 {"startsAt": now_ms() + HOUR, "endsAt": now_ms() + 3 * HOUR, "reason": "Sooner."})
ok("moving the opening earlier needs a day's notice", code == 400 and "24 hours" in out.get("error", ""), (code, out))
new_start = now_ms() + 4 * DAY_MS
code, out = call("POST", f"/api/auctions/{aid}/times/", CHIDI_K,
                 {"startsAt": new_start, "endsAt": new_start + 2 * HOUR, "reason": "Board meeting clash."})
ok("a later time is a request", code == 200 and out.get("pending"), (code, out))
so = SignOff.objects.get(auction_id=aid, kind="auction_times", status="pending")
mail.outbox = []
call("POST", f"/api/signoffs/{so.id}/decide/", AMARA_K, {"ok": True})
a = Auction.objects.get(pk=aid)
ok("approved, the times move", a.starts_at == new_start and a.ends_at == new_start + 2 * HOUR)
ok("and the vendors are told", any("New times" in m.subject for m in mails_to(A.contact_email)))

print("\n-- it opens on time by itself")
Auction.objects.filter(pk=aid).update(starts_at=now_ms() - 1000, ends_at=now_ms() + HOUR)
mail.outbox = []
engine.start_due()
a = Auction.objects.get(pk=aid)
ok("at its start time the room opens", a.status == "live" and a.is_live(), a.status)
ok("and the vendors are told", any("room is open" in m.subject for m in mails_to(A.contact_email)))
st_a = call("GET", f"/api/auctions/{aid}/room/", A_K)[1]["lotState"][0]
ok("pre-bids stand as first bids: Beta leads, Alpha is second", st_a["myRank"] == 2, st_a)
code, out = call("POST", f"/api/auctions/{aid}/lots/{lot.id}/bid/", A_K, {"amount": 875_000})
ok("the first live bid has to beat the best pre-bid by the step", code == 409, (code, out))
code, out = call("POST", f"/api/auctions/{aid}/lots/{lot.id}/bid/", A_K, {"amount": 870_000})
ok("and takes the lead when it does", code == 200 and out["myRank"] == 1, (code, out))
code, out = call("POST", f"/api/auctions/{aid}/times/", CHIDI_K,
                 {"startsAt": now_ms() + DAY_MS, "reason": "x"})
ok("once open, the opening time cannot move", code == 400, (code, out))
Auction.objects.filter(pk=aid).update(ends_at=now_ms() - 1000)
engine.settle_due()
ok("and it closes by itself at its end time", Auction.objects.get(pk=aid).status == "closed")

aid2 = draft_auction(CHIDI_K, startsAt=0)
call("POST", f"/api/auctions/{aid2}/submit/", CHIDI_K)
so = SignOff.objects.get(auction_id=aid2, status="pending")
call("POST", f"/api/signoffs/{so.id}/decide/", AMARA_K, {"ok": True})
ok("with no start time, it opens as soon as it is approved", Auction.objects.get(pk=aid2).is_live())
aid3 = draft_auction(CHIDI_K)
call("POST", f"/api/auctions/{aid3}/submit/", CHIDI_K)
so = SignOff.objects.get(auction_id=aid3, status="pending")
call("POST", f"/api/signoffs/{so.id}/decide/", AMARA_K, {"ok": False, "note": "Wrong lot."})
ok("turned down, it goes back to draft", Auction.objects.get(pk=aid3).status == "draft")
code, _ = call("POST", f"/api/auctions/{aid3}/lots/{AuctionLot.objects.get(auction_id=aid3).id}/bid/",
               A_K, {"amount": 1})
ok("pre-bids are refused where they are not allowed", code in (403, 404, 409), code)

settings_to(lineManagerApproval=False)
aid4 = draft_auction(CHIDI_K)
code, out = call("POST", f"/api/auctions/{aid4}/submit/", CHIDI_K)
ok("with the switch off, it is scheduled straight away", Auction.objects.get(pk=aid4).status == "scheduled",
   (code, out))

# ================================================================ 5. documents
print("\n-- bid documents have types")
settings_to(lineManagerApproval=False)
t = make(CHIDI_K, {"requiredDocs": ["Quotation", "Product specification"]})
ok("the buyer can require document types", t.required_docs == ["Quotation", "Product specification"], t.required_docs)
code, out = call("POST", "/api/tenders/", CHIDI_K, {**BASE, "deadline": now_ms() + DAY_MS * 5,
                                                    "requiredDocs": ["Passport photo"], "submit": True})
ok("only types off the list", code == 400, (code, out))
line = t.lines[0]["id"]
code, out = call("POST", f"/api/tenders/{t.id}/bids/", A_K, {"decl": True, "lines": {line: 10}})
ok("a bid without them is refused, by name", code == 400 and "quotation" in out.get("error", "").lower(), out)
code, out = upload(f"/api/tenders/{t.id}/bid_docs/", A_K, "quote.pdf", b"%PDF-1.4", docType="Quotation")
ok("a quotation is sealed in the commercial envelope", code == 200 and out["doc"]["envelope"] == "commercial"
   and out["doc"]["docType"] == "Quotation", out)
code, out = upload(f"/api/tenders/{t.id}/bid_docs/", A_K, "x.pdf", b"%PDF-1.4", docType="Selfie")
ok("an unknown type is refused", code == 400, (code, out))
upload(f"/api/tenders/{t.id}/bid_docs/", A_K, "spec.pdf", b"%PDF-1.4", docType="Product specification")
code, out = call("POST", f"/api/tenders/{t.id}/bids/", A_K, {"decl": True, "lines": {line: 10}})
ok("with both attached, the bid goes in", code == 200, (code, out))

# ================================================================ 6. NDA and payment terms
print("\n-- payment terms and an NDA come before everything else")
settings_to(lineManagerApproval=False)
mail.outbox = []
t = make(CHIDI_K, {"ndaRequired": True, "paymentTerms": "30 days", "paymentConditions": "Paid against a goods receipt."})
ok("the standard NDA is copied onto the event, with the company's name",
   t.nda_required and "NON-DISCLOSURE" in t.nda_text and "{company}" not in t.nda_text, t.nda_text[:80])
inv = mails_to(A.contact_email)
ok("the invitation says what will be asked", inv and "non-disclosure agreement" in inv[0].body
   and "payment terms" in inv[0].body, inv and inv[0].body)
code, _ = upload(f"/api/tenders/{t.id}/docs/", CHIDI_K, "pack.pdf", b"%PDF-1.4 pack")
pack = Document.objects.filter(tender=t, kind="tender").first()
v = tender_for(A_K, t.id)
ok("before signing, the vendor sees the title and closing date", v["title"] == "Cups" and v["deadline"] == t.deadline)
ok("and not the scope or the lines", v["scope"] == "" and v["lines"] == [] and v["gated"] is True, v)
ok("the agreements are spelled out", v["agreements"]["pending"] == ["nda", "payment"]
   and "30 days after invoice" in v["agreements"]["paymentTermsLabel"], v["agreements"])
ok("the tender pack is withheld", pack.id not in [d["id"] for d in boot(A_K)["documents"]])
r = c.get(f"/api/docs/{pack.id}/download/", HTTP_AUTHORIZATION="Bearer " + A_K)
ok("and cannot be downloaded", r.status_code == 403, r.status_code)
code, out = call("POST", f"/api/tenders/{t.id}/bids/", A_K, {"decl": True, "lines": {t.lines[0]["id"]: 10}})
ok("bidding is refused", code == 403 and "non-disclosure" in out.get("error", ""), (code, out))
code, _ = call("POST", f"/api/tenders/{t.id}/clarifications/", A_K, {"q": "?"})
ok("so is asking a question", code == 403, code)
code, out = call("POST", f"/api/tenders/{t.id}/accept/", A_K, {"kind": "nda", "name": "Ada", "agree": False})
ok("signing needs the box ticked", code == 400, code)
code, out = call("POST", f"/api/tenders/{t.id}/accept/", A_K, {"kind": "nda", "name": "", "agree": True})
ok("and a name", code == 400, code)
code, out = call("POST", f"/api/tenders/{t.id}/accept/", A_K,
                 {"kind": "nda", "name": "Ada Obi", "title": "Sales Director", "agree": True})
ok("the NDA is signed", code == 200 and out["agreements"]["pending"] == ["payment"], (code, out))
v = tender_for(A_K, t.id)
ok("one of two is not enough", v["gated"] is True)
call("POST", f"/api/tenders/{t.id}/accept/", A_K, {"kind": "payment", "name": "Ada Obi", "agree": True})
v = tender_for(A_K, t.id)
ok("with both accepted, the vendor sees the whole tender", v["gated"] is False and v["scope"] and v["lines"], v)
ok("including the pack", pack.id in [d["id"] for d in boot(A_K)["documents"]])
code, out = call("POST", f"/api/tenders/{t.id}/bids/", A_K, {"decl": True, "lines": {t.lines[0]["id"]: 10}})
ok("and can bid", code == 200, (code, out))
acc = Acceptance.objects.get(tender=t, supplier_id=A.id, kind="nda")
ok("the signature is kept with the exact text and its digest",
   acc.text == t.nda_text and len(acc.digest) == 64 and acc.signed_title == "Sales Director")
rows = call("GET", f"/api/tenders/{t.id}/vendors/", CHIDI_K)[1]["vendors"]
row = next(r for r in rows if r["supplierId"] == A.id)
other = next(r for r in rows if r["supplierId"] == B.id)
ok("the buyer's vendor table shows who signed", row["agreements"]["nda"]["by"] == "Ada Obi"
   and other["agreements"]["nda"] is None, row["agreements"])
r = c.get(f"/api/acceptances/{acc.id}/", HTTP_AUTHORIZATION="Bearer " + CHIDI_K)
ok("and the signed record downloads for the file", r.status_code == 200 and b"Ada Obi" in r.content
   and acc.digest.encode() in r.content, r.status_code)
r = c.get(f"/api/acceptances/{acc.id}/", HTTP_AUTHORIZATION="Bearer " + B_K)
ok("but not by another vendor", r.status_code == 404, r.status_code)
code, out = call("POST", "/api/tenders/", CHIDI_K, {**BASE, "deadline": now_ms() + 5 * DAY_MS,
                                                    "ndaRequired": True, "ndaText": "Too short.",
                                                    "submit": True})
ok("an NDA too short to mean anything is refused at submission", code == 400, (code, out))

print("\n-- the same in an auction")
settings_to(lineManagerApproval=False)
aid5 = draft_auction(CHIDI_K, ndaRequired=True, paymentTerms="14 days")
call("POST", f"/api/auctions/{aid5}/submit/", CHIDI_K)
room = call("GET", f"/api/auctions/{aid5}/room/", A_K)[1]
ok("a vendor who has not signed sees no lots or terms", room["gated"] is True and room["lots"] == []
   and room["terms"] == "", room)
lot5 = AuctionLot.objects.get(auction_id=aid5)
code, out = call("POST", f"/api/auctions/{aid5}/lots/{lot5.id}/bid/", A_K, {"amount": 500})
ok("nor bid", code == 403, (code, out))
call("POST", f"/api/auctions/{aid5}/accept/", A_K, {"kind": "nda", "name": "Ada Obi", "agree": True})
call("POST", f"/api/auctions/{aid5}/accept/", A_K, {"kind": "payment", "name": "Ada Obi", "agree": True})
room = call("GET", f"/api/auctions/{aid5}/room/", A_K)[1]
ok("signed and accepted, the room opens up to them", room["gated"] is False and room["lots"], room.get("gated"))

_runner.teardown_databases(_old_db)
print(f"\n{len(PASSED)} passed, {len(FAILED)} failed")
for f in FAILED:
    print("  FAILED: " + f)
sys.exit(1 if FAILED else 0)
