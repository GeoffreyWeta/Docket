"""Inviting auction bidders from an uploaded list of names and emails.

    python test_invite_list.py

Runs against a throwaway database seeded with the demo, and walks the whole
path through the real endpoints: a buyer uploads a spreadsheet to the live
diesel auction, reads the preview, adds and emails the people on it; one of
them - a company the register had never heard of - claims the login the email
offers, finds the auction on their portal and bids in it.

What has to hold:

  THE PREVIEW WRITES NOTHING. An invitation cannot be unsent, so reading the
  file is its own step and touches no vendor, participant or mailbox.

  THE REGISTER IS NOT DUPLICATED. An address the register already knows is
  that vendor; two people from one new company are one new vendor; running the
  same list twice changes nothing and mails nobody twice.

  EVERYBODY IT CLAIMS TO REACH IS REACHED. A vendor with a login is told
  through it, one without gets the claim link with the invitation, and a
  register record with no address picks up the one from the file.

  ONLY THE PEOPLE WHO MAY INVITE CAN, AND ONLY WHILE THERE IS A ROOM.
"""
import io
import json
import os
import sys

import django

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "docket.settings")
os.environ.setdefault("DEMO_LOGIN", "1")
django.setup()

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

from django.core import mail                               # noqa: E402
from django.test import Client                             # noqa: E402
from django.test.utils import setup_test_environment       # noqa: E402
from django.test.runner import DiscoverRunner              # noqa: E402

setup_test_environment()
_runner = DiscoverRunner(verbosity=0, interactive=False)
_old_db = _runner.setup_databases()

from core.models import Auction, AuctionParticipant, Event, Supplier  # noqa: E402
from core.seed import seed_all                                        # noqa: E402

seed_all()
c = Client()
PASSED, FAILED = [], []


def ok(label, cond, extra=""):
    (PASSED if cond else FAILED).append(label)
    print(("  PASS  " if cond else "  FAIL  ") + label
          + (f"  - {extra}" if extra and not cond else ""))


def tok(username):
    r = c.post("/api/auth/demo/", json.dumps({"username": username}), content_type="application/json")
    return r.json()["token"]


def call(method, path, token=None, body=None):
    h = {"HTTP_AUTHORIZATION": f"Bearer {token}"} if token else {}
    fn = getattr(c, method.lower())
    r = (fn(path, data=json.dumps(body or {}), content_type="application/json", **h)
         if method != "GET" else fn(path, **h))
    return r.status_code, (r.json() if r.content and r["Content-Type"].startswith("application/json") else {})


def upload(token, aid, text, name="bidders.csv"):
    f = io.BytesIO(text.encode("utf-8"))
    f.name = name
    r = c.post(f"/api/auctions/{aid}/invite_list/parse/", {"file": f},
               HTTP_AUTHORIZATION=f"Bearer {token}")
    return r.status_code, r.json()


AID = "a1"   # the seeded live diesel auction
LIST = """Name,Company,Email
Ada Obi,Coldline Logistics,coldline@example.com
Tolu Bakare,Sahel Fuels Ltd,tolu@sahelfuels.example
Kemi Ade,Sahel Fuels Ltd,kemi@sahelfuels.example
Musa Bello,,musa.bello@mail.example
Wrong Row,Nowhere Ltd,not-an-email
Tolu again,Sahel Fuels Ltd,TOLU@sahelfuels.example
Sales desk,Zenith Kitchen Systems,sales@zenith.example
"""

AMARA = tok("amara")

print("\n=== the preview ===")
vendors_before = Supplier.objects.count()
parts_before = AuctionParticipant.objects.filter(auction_id=AID).count()
mail.outbox.clear()
st, pv = upload(AMARA, AID, LIST)
ok("the list is read", st == 200, f"{st} {pv}")
rows = {r["email"]: r for r in pv.get("rows", [])}
ok("five usable rows, two turned away", pv["counts"]["ready"] == 5 and pv["counts"]["rejected"] == 2,
   pv.get("counts"))
why = " | ".join(r["why"] for r in pv["rejected"])
ok("a bad address says so", "not a valid email" in why, why)
ok("a repeated address is named as a duplicate", "Duplicate of row" in why, why)
ok("a vendor's login address finds that vendor",
   rows["coldline@example.com"]["supplierId"] == "s2" and rows["coldline@example.com"]["inAuction"])
ok("an exact company name finds the register record",
   rows["sales@zenith.example"]["supplierId"] == "s4" and rows["sales@zenith.example"]["matchedBy"] == "name")
ok("people the register does not know are marked new",
   rows["tolu@sahelfuels.example"]["supplierId"] is None and rows["musa.bello@mail.example"]["supplierId"] is None)
ok("a second person at the same new company is told where the one invitation goes",
   rows["kemi@sahelfuels.example"]["sendsTo"] == "tolu@sahelfuels.example"
   and "Same company" in rows["kemi@sahelfuels.example"]["note"])
ok("counts: three new, one known, one already in",
   (pv["counts"]["new"], pv["counts"]["known"], pv["counts"]["inAuction"]) == (3, 1, 1), pv["counts"])
ok("reading the file writes no vendor", Supplier.objects.count() == vendors_before)
ok("and adds nobody to the auction",
   AuctionParticipant.objects.filter(auction_id=AID).count() == parts_before)
ok("and emails nobody", len(mail.outbox) == 0, len(mail.outbox))

print("\n=== who may ===")
st, _ = upload(tok("deji"), AID, LIST)
ok("an evaluator cannot invite bidders", st == 403, st)
st, _ = upload(tok("coldline"), AID, LIST)
ok("nor can a vendor", st == 403, st)
st, b = upload(AMARA, AID, "just some text with no addresses at all\n")
ok("a file with no addresses is refused with a reason", st == 400 and "No email" in b.get("error", ""), b)

print("\n=== adding and sending ===")
st, res = call("POST", f"/api/auctions/{AID}/invite_list/", AMARA,
               {"rows": pv["rows"], "send": True})
ok("the confirmed rows are added", st == 200, f"{st} {res}")
ok("two new vendors, not three: one company, two people", res.get("created") == 2, res)
ok("four vendors on the auction from five rows", res.get("added") == 4, res)
sahel = Supplier.objects.filter(name="Sahel Fuels Ltd").first()
ok("the new vendor is unverified and unregistered, and says a buyer added it",
   sahel and not sahel.prequalified and sahel.registered_at is None and sahel.source == "buyer")
ok("a person with no company becomes a vendor under their own name",
   Supplier.objects.filter(name="Musa Bello", contact_email="musa.bello@mail.example").exists())
ok("a register record with no address picks up the one from the file",
   Supplier.objects.get(pk="s4").contact_email == "sales@zenith.example")
ok("three invitations: the two new vendors and Zenith; Coldline was told already",
   res.get("sent") == 3, res)
to = {m.to[0]: m for m in mail.outbox}
ok("the new vendor's email carries the claim link",
   "tolu@sahelfuels.example" in to and "?register=" in to["tolu@sahelfuels.example"].body,
   list(to))
ok("the second person at that company is not mailed a second link",
   "kemi@sahelfuels.example" not in to)
ok("the demo is shown the links it has no mailbox for",
   len(res.get("demoLinks", [])) == 3 and all(x["url"].startswith("/?register=") for x in res["demoLinks"]),
   res.get("demoLinks"))
ok("it is on the audit trail",
   Event.objects.filter(action="Auction vendors invited from a list").exists())

st, again = call("POST", f"/api/auctions/{AID}/invite_list/", AMARA,
                 {"rows": pv["rows"], "send": True})
ok("the same list twice creates nobody and mails nobody",
   st == 200 and again.get("created") == 0 and again.get("sent") == 0, again)
ok("and leaves one Sahel Fuels on the register",
   Supplier.objects.filter(name="Sahel Fuels Ltd").count() == 1)

print("\n=== the other side ===")
link = next(x for x in res["demoLinks"] if x["name"] == "Sahel Fuels Ltd")["url"]
token = link.split("register=")[1]
st, look = call("GET", f"/api/register/claim/?token={token}")
ok("the link names the company it was sent for",
   st == 200 and look["supplier"]["name"] == "Sahel Fuels Ltd", look)
st, b = call("POST", "/api/register/claim/", None, {"token": token, "password": "Sahel!2026"})
ok("the vendor sets a password", st == 200, b)
TOLU = tok("tolu@sahelfuels.example")
st, mine = call("GET", "/api/auctions/mine/", TOLU)
ok("and finds the auction on their portal",
   st == 200 and any(x["id"] == AID for x in mine["auctions"]), mine)
st, room = call("GET", f"/api/auctions/{AID}/room/", TOLU)
lot = room["lots"][0]["id"] if st == 200 and room.get("lots") else "l1"
st, bid = call("POST", f"/api/auctions/{AID}/lots/{lot}/bid/", TOLU, {"amount": 85_500_000})
ok("and can bid in it", st == 200 and bid.get("ok"), f"{st} {bid}")

print("\n=== individual bidders ===")
individuals = "Name,Company,Email\nAlex Doe,,alex.one@example.com\nAlex Doe,,alex.two@example.com\n"
st, individual_preview = upload(AMARA, AID, individuals)
ok("same-name individuals each receive their own invitation",
   st == 200 and all(r["sendsTo"] == r["email"] for r in individual_preview.get("rows", [])))
st, individual_result = call("POST", f"/api/auctions/{AID}/invite_list/", AMARA,
                             {"rows": individual_preview["rows"], "send": True})
ok("same-name individuals get separate bidder records and activation links",
   st == 200 and individual_result.get("created") == 2
   and len(individual_result.get("demoLinks", [])) == 2, individual_result)
st, repeat = call("POST", f"/api/auctions/{AID}/invite_list/", AMARA,
                 {"rows": individual_preview["rows"], "send": True})
ok("reimporting individuals matches by email without duplicates",
   st == 200 and repeat.get("created") == 0 and repeat.get("sent") == 0, repeat)
individual_token = individual_result["demoLinks"][0]["url"].split("register=")[1]
st, claimed = call("POST", "/api/register/claim/", None,
                   {"token": individual_token, "password": "Individual!2026"})
ok("an individual activates their account without a company", st == 200, claimed)
individual_auth = tok(individual_result["demoLinks"][0]["email"])
st, bid = call("POST", f"/api/auctions/{AID}/lots/{lot}/bid/", individual_auth,
               {"amount": 84_000_000})
ok("the activated individual can bid", st == 200 and bid.get("ok"), bid)
st, denied = call("POST", f"/api/auctions/{AID}/lots/{lot}/bid/", None,
                  {"amount": 83_000_000})
ok("bidding still requires an authenticated account", st in (401, 403), denied)

print("\n=== only while there is a room ===")
Auction.objects.filter(pk=AID).update(status="closed")
st, b = upload(AMARA, AID, LIST)
ok("a closed auction takes no list", st == 409, f"{st} {b}")
st, b = call("POST", f"/api/auctions/{AID}/invite_list/", AMARA, {"rows": pv["rows"]})
ok("and adds nobody to it", st == 409, f"{st} {b}")

print(f"\n{len(PASSED)} passed, {len(FAILED)} failed")
for f in FAILED:
    print(f"  FAILED: {f}")
_runner.teardown_databases(_old_db)
sys.exit(1 if FAILED else 0)
