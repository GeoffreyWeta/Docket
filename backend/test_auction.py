"""Reverse auctions, as their own event.

    python test_auction.py

Drives the real HTTP endpoints against a throwaway SQLite database. What is
under test is not that rows can be written but that the room behaves like an
auction room, which means five things - and four of them are ways a live
auction is normally lost:

  THE SEPARATION IS REAL. An auction is not in the tender table, does not
  appear in the tender API, and nothing about it can be reached through
  /api/tenders/. If it could, the split would be cosmetic.

  THE RULES OF A BID HOLD. Above the ceiling, not clearing the decrement,
  bidding against yourself, bidding without being invited, bidding before
  accepting the terms, bidding after the close - each refused, each with a
  sentence a vendor can act on while a clock is running.

  SNIPING DOES NOT WIN. A bid inside the closing window moves the close, so the
  auction ends when bidding stops rather than when the clock happens to run
  out. Without this the winner is whoever had the better connection, and the
  buyer never learns what the second bidder would have done.

  A PROXY IS NOT A WORSE DEAL THAN BIDDING BY HAND. A standing instruction bids
  the least it needs to in order to lead, never the vendor's floor. If it spent
  the floor immediately, vendors would stop setting floors after one event.

  THE RESERVE MEANS SOMETHING. A lot whose best price never reached the reserve
  closes with no winner. Awarding it anyway would make the reserve decorative,
  which is worse than not having one.

And what a bidder may see: rank mode leaks no price and no competitor's name,
blind mode leaks not even rank, and a buyer without auction.monitor sees that a
competition is happening and nothing of its content.
"""
import json
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

from django.contrib.auth.models import User                # noqa: E402
from django.test import Client                             # noqa: E402
from django.test.utils import setup_test_environment       # noqa: E402
from django.test.runner import DiscoverRunner              # noqa: E402

setup_test_environment()
_runner = DiscoverRunner(verbosity=0, interactive=False)
_old_db = _runner.setup_databases()

from core import auction as engine                         # noqa: E402
from core.models import (Auction, AuctionLot, AuctionParticipant, AuthToken,  # noqa: E402
                         LotBid, Persona, Profile, ProxyBid, Supplier, Tender)
from core.util import now_ms, rid                          # noqa: E402

c = Client()
PASSED, FAILED = [], []
SEC, MIN = 1000, 60_000


def ok(label, cond, extra=""):
    (PASSED if cond else FAILED).append(label)
    print(("  PASS  " if cond else "  FAIL  ") + label
          + (f"  - {extra}" if extra and not cond else ""))


def call(method, path, token=None, body=None, expect=200):
    h = {"HTTP_AUTHORIZATION": f"Bearer {token}"} if token else {}
    fn = getattr(c, method.lower())
    r = (fn(path, data=json.dumps(body or {}), content_type="application/json", **h)
         if method != "GET" else fn(path, **h))
    if r.status_code != expect:
        raise AssertionError(f"{method} {path} -> {r.status_code} (wanted {expect}): "
                             f"{r.content[:400].decode('utf-8', 'replace')}")
    return json.loads(r.content) if r.content else {}


def maybe(method, path, token=None, body=None):
    """Call without asserting a status - for the refusals."""
    h = {"HTTP_AUTHORIZATION": f"Bearer {token}"} if token else {}
    fn = getattr(c, method.lower())
    r = (fn(path, data=json.dumps(body or {}), content_type="application/json", **h)
         if method != "GET" else fn(path, **h))
    try:
        return r.status_code, json.loads(r.content) if r.content else {}
    except ValueError:
        return r.status_code, {}


# ---------------------------------------------------------------- people

def buyer(name, role):
    p = Persona.objects.create(id=rid("u"), name=name, role=role, title=role.title())
    u = User.objects.create_user(username=f"{p.id}@x.test", password="x")
    Profile.objects.create(user=u, persona=p)
    t = AuthToken.objects.create(key=rid("k") + rid("k"), user=u, created=now_ms())
    return p, t.key


def vendor(name):
    s = Supplier.objects.create(id=rid("s"), name=name, category="Fuel", location="Lagos")
    u = User.objects.create_user(username=f"{s.id}@x.test", password="x")
    Profile.objects.create(user=u, supplier=s)
    t = AuthToken.objects.create(key=rid("k") + rid("k"), user=u, created=now_ms())
    return s, t.key


PROC, PROC_T = buyer("Amara Okafor", "procurement")
APPR, APPR_T = buyer("Ada Nwosu", "approver")
# Somebody who may open the auction page but not watch the prices. No built-in
# role sits there - procurement, approver and auditor all carry auction.monitor
# - so the boundary is tested by granting exactly one capability, which is also
# how an administrator would actually produce this person.
EVAL, EVAL_T = buyer("Chidi Eze", "evaluator")
_prof = Profile.objects.get(persona=EVAL)
_prof.perm_extra = ["page.auctions"]
_prof.save(update_fields=["perm_extra"])
V1, V1_T = vendor("Alpha Fuels")
V2, V2_T = vendor("Beta Energy")
V3, V3_T = vendor("Gamma Oil")
OUT, OUT_T = vendor("Not Invited Ltd")


def make(ceiling=90_000_000, decrement=500_000, reserve=None, visibility="rank",
         accept=True, minutes=60, snipe=2, extend=2, max_ext=20, vendors=(V1, V2, V3)):
    """A live auction with one lot, ready to take prices."""
    now = now_ms()
    a = Auction.objects.create(
        id=rid("a"), ref="AUC-" + rid("")[:6], title="Diesel", status="live",
        visibility=visibility, starts_at=now - MIN, ends_at=now + minutes * MIN,
        scheduled_ends_at=now + minutes * MIN, created_at=now,
        snipe_window_ms=snipe * MIN, extend_by_ms=extend * MIN, max_extensions=max_ext,
        require_acceptance=not accept)
    lot = AuctionLot.objects.create(id=rid("l"), auction=a, number=1, title="AGO",
                                    ceiling=ceiling, min_decrement=decrement, reserve=reserve)
    for s in vendors:
        AuctionParticipant.objects.create(id=rid("ap"), auction=a, supplier_id=s.id,
                                          invited_at=now, accepted_at=now if accept else None)
    return a, lot


def bid(a, lot, token, amount):
    return maybe("POST", f"/api/auctions/{a.id}/lots/{lot.id}/bid/", token, {"amount": amount})


# ---------------------------------------------------------------- separation

print("\n=== an auction is not a tender ===")

a, lot = make()
ok("auctions live in their own table", Auction.objects.count() >= 1)
ok("and not in the tender table", not Tender.objects.filter(pk=a.id).exists())
ok("Tender has no auction fields left",
   not any(f.name == "auction_min_decrement" for f in Tender._meta.get_fields()))
ok("the old AuctionBid model is gone",
   not any(m.__name__ == "AuctionBid" for m in django.apps.apps.get_models()))

st, _ = maybe("GET", f"/api/tenders/{a.id}/", PROC_T)
ok("an auction id is not reachable through the tender API", st in (404, 405), f"got {st}")


# ---------------------------------------------------------------- bid rules

print("\n=== the rules of a bid ===")

st, b = bid(a, lot, OUT_T, 80_000_000)
ok("an uninvited vendor is refused", st == 409 and "not a participant" in b.get("error", "").lower(),
   f"{st} {b}")

st, b = bid(a, lot, V1_T, 95_000_000)
ok("a first bid above the opening price is refused", st == 409, f"{st} {b}")
ok("and says what the opening price is", "90,000,000" in b.get("error", ""), b.get("error"))

st, b = bid(a, lot, V1_T, 88_000_000)
ok("a first bid at or below the opening price is taken", st == 200, f"{st} {b}")
ok("and the bidder is told they lead", b.get("leading") is True)

st, b = bid(a, lot, V2_T, 87_900_000)
ok("a bid that does not clear the decrement is refused", st == 409, f"{st} {b}")
ok("and says exactly what to bid instead", "87,500,000" in b.get("error", ""), b.get("error"))

st, b = bid(a, lot, V2_T, 87_500_000)
ok("a bid that clears it exactly is taken", st == 200, f"{st} {b}")

st, b = bid(a, lot, V2_T, 87_000_000)
ok("bidding against yourself is refused", st == 409 and "already hold" in b.get("error", ""),
   f"{st} {b}")

st, b = bid(a, lot, V1_T, 0)
ok("a zero price is refused", st == 409, f"{st} {b}")

a2, lot2 = make(accept=False)
st, b = bid(a2, lot2, V1_T, 80_000_000)
ok("bidding before accepting the rules is refused",
   st == 409 and "rules" in b.get("error", "").lower(), f"{st} {b}")
call("POST", f"/api/auctions/{a2.id}/accept/", V1_T)
st, b = bid(a2, lot2, V1_T, 80_000_000)
ok("and taken once they are accepted", st == 200, f"{st} {b}")

a3, lot3 = make()
Auction.objects.filter(pk=a3.id).update(ends_at=now_ms() - MIN)
st, b = bid(a3, lot3, V1_T, 80_000_000)
ok("a bid after the close is refused", st == 409 and "closed" in b.get("error", "").lower(),
   f"{st} {b}")


# ---------------------------------------------------------------- anti-sniping

print("\n=== sniping does not win ===")

a, lot = make(minutes=60)
bid(a, lot, V1_T, 88_000_000)
before = Auction.objects.get(pk=a.id).ends_at
bid(a, lot, V2_T, 87_000_000)
ok("a bid well before the close does not move it",
   Auction.objects.get(pk=a.id).ends_at == before)

# Wind the clock to 30 seconds left - inside the two-minute window.
Auction.objects.filter(pk=a.id).update(ends_at=now_ms() + 30 * SEC)
was = Auction.objects.get(pk=a.id).ends_at
st, b = bid(a, lot, V1_T, 86_000_000)
now_a = Auction.objects.get(pk=a.id)
ok("a bid inside the window moves the close out", now_a.ends_at > was, f"{was} -> {now_a.ends_at}")
ok("by the configured extension", now_a.ends_at - now_a.ends_at % 1 >= was)
ok("the response tells the bidder it extended", b.get("extended") is True, str(b))
ok("the extension is recorded with what triggered it",
   len(now_a.extensions) == 1 and now_a.extensions[0]["supplierId"] == V1.id,
   str(now_a.extensions))
ok("the published close is kept alongside the real one",
   now_a.scheduled_ends_at != now_a.ends_at)
ok("and the bid remembers the clock it landed against",
   LotBid.objects.get(pk=b["bidId"]).closes_at_bid_time == was)

# The cap.
a, lot = make(minutes=60, max_ext=1)
bid(a, lot, V1_T, 88_000_000)
Auction.objects.filter(pk=a.id).update(ends_at=now_ms() + 30 * SEC)
bid(a, lot, V2_T, 87_000_000)                       # extension 1
Auction.objects.filter(pk=a.id).update(ends_at=now_ms() + 30 * SEC)
mark = Auction.objects.get(pk=a.id).ends_at
bid(a, lot, V1_T, 86_000_000)                       # would be extension 2
ok("extensions stop at the cap", Auction.objects.get(pk=a.id).ends_at == mark)


# ---------------------------------------------------------------- proxies

print("\n=== a standing limit bids the least it needs to ===")

a, lot = make(ceiling=90_000_000, decrement=500_000)
bid(a, lot, V1_T, 88_000_000)
r = call("POST", f"/api/auctions/{a.id}/lots/{lot.id}/limit/", V2_T, {"floor": 80_000_000})
best = engine.best_bid(lot)
ok("the limit takes the lead", best.supplier_id == V2.id, f"{best.supplier_id} {best.amount}")
ok("at one decrement under the standing price, not at the floor",
   best.amount == 87_500_000, f"bid {best.amount:,}, floor was 80,000,000")
ok("and is marked as placed automatically", best.kind == "proxy", best.kind)
ok("the floor is never echoed back in the leaderboard",
   "80000000" not in json.dumps(call("GET", f"/api/auctions/{a.id}/room/", PROC_T)))

st, b = bid(a, lot, V1_T, 87_000_000)
best = engine.best_bid(lot)
ok("a rival bid provokes the limit to answer", best.supplier_id == V2.id, best.supplier_id)
ok("again by the minimum step", best.amount == 86_500_000, f"{best.amount:,}")

st, b = bid(a, lot, V1_T, 80_000_000)
best = engine.best_bid(lot)
ok("a rival who beats the floor takes the lead", best.supplier_id == V1.id, best.supplier_id)
ok("and the limit does not bid below its floor", best.amount == 80_000_000, f"{best.amount:,}")
ok("nothing was ever bid under the floor",
   min(x.amount for x in lot.bids.filter(supplier_id=V2.id)) >= 80_000_000)


# ---------------------------------------------------------------- visibility

print("\n=== what a bidder may see ===")

a, lot = make(visibility="rank")
bid(a, lot, V1_T, 88_000_000)
bid(a, lot, V2_T, 87_000_000)

r = call("GET", f"/api/auctions/{a.id}/room/", V1_T)
s = r["lotState"][0]
raw = json.dumps(r)
ok("rank mode tells a vendor their position", s["myRank"] == 2, str(s.get("myRank")))
ok("and withholds the best price", s.get("best") is None, str(s.get("best")))
ok("and never names a competitor", V2.name not in raw and V2.id not in raw)
ok("but does say what it would take to lead", s.get("toLead") == 86_500_000, str(s.get("toLead")))

a, lot = make(visibility="price")
bid(a, lot, V1_T, 88_000_000)
bid(a, lot, V2_T, 87_000_000)
s = call("GET", f"/api/auctions/{a.id}/room/", V1_T)["lotState"][0]
ok("price mode shows the standing best", s.get("best") == 87_000_000, str(s.get("best")))
ok("still without a name",
   V2.name not in json.dumps(call("GET", f"/api/auctions/{a.id}/room/", V1_T)))

a, lot = make(visibility="blind")
bid(a, lot, V1_T, 88_000_000)
bid(a, lot, V2_T, 87_000_000)
s = call("GET", f"/api/auctions/{a.id}/room/", V1_T)["lotState"][0]
ok("blind mode gives no rank", s.get("myRank") is None, str(s.get("myRank")))
ok("no best price", s.get("best") is None)
ok("and not even the number of bidders", "bidders" not in s, str(s.keys()))
ok("but still the vendor's own bids", len(s.get("myBids") or []) == 1)

a, lot = make()
bid(a, lot, V1_T, 88_000_000)
s = call("GET", f"/api/auctions/{a.id}/room/", PROC_T)["lotState"][0]
ok("a buyer with auction.monitor sees the whole leaderboard", "leaderboard" in s)
ok("with vendor names", s["leaderboard"][0]["supplier"] == V1.name)

s = call("GET", f"/api/auctions/{a.id}/room/", EVAL_T)["lotState"][0]
ok("a buyer without it sees no leaderboard", "leaderboard" not in s, str(s.keys()))
ok("and no prices at all", "88000000" not in json.dumps(s))

st, _ = maybe("GET", f"/api/auctions/{a.id}/room/", OUT_T)
ok("an uninvited vendor cannot open the room", st == 403, f"got {st}")


# ---------------------------------------------------------------- the reserve

print("\n=== the reserve means something ===")

a, lot = make(reserve=80_000_000)
bid(a, lot, V1_T, 88_000_000)
r = call("POST", f"/api/auctions/{a.id}/close/", PROC_T)
res = r["outcome"][0]
ok("a lot that never met its reserve closes with no winner",
   res["result"] == "reserve not met", str(res))
ok("and the lot records no award", AuctionLot.objects.get(pk=lot.id).awarded_to == "")
st, b = maybe("POST", f"/api/auctions/{a.id}/award/", APPR_T)
ok("and cannot be awarded", st == 409, f"{st} {b}")

a, lot = make(reserve=80_000_000)
bid(a, lot, V1_T, 88_000_000)
bid(a, lot, V2_T, 79_000_000)
r = call("POST", f"/api/auctions/{a.id}/close/", PROC_T)
ok("a lot that met it has a winner", r["outcome"][0]["result"] == "winner", str(r["outcome"]))
ok("the winner is the lowest price", AuctionLot.objects.get(pk=lot.id).awarded_to == V2.id)
ok("savings are measured from the opening price",
   r["savings"]["saved"] == 90_000_000 - 79_000_000, str(r["savings"]))

ok("the reserve is never sent to a bidder",
   "80000000" not in json.dumps(call("GET", f"/api/auctions/{a.id}/room/", V1_T)))


# ---------------------------------------------------------------- separation of duties

print("\n=== who may commit the money ===")

st, b = maybe("POST", f"/api/auctions/{a.id}/award/", PROC_T)
ok("the person who ran the room cannot award it", st == 403, f"{st} {b}")
r = call("POST", f"/api/auctions/{a.id}/award/", APPR_T, {"memo": "Best price, reserve met."})
ok("the approver can", r["ok"] is True)
ok("and the auction records it", Auction.objects.get(pk=a.id).status == "awarded")


# ---------------------------------------------------------------- pause

print("\n=== a pause gives the time back ===")

a, lot = make(minutes=30)
ends = Auction.objects.get(pk=a.id).ends_at
call("POST", f"/api/auctions/{a.id}/pause/", PROC_T, {"reason": "Specification query"})
st, b = bid(a, lot, V1_T, 80_000_000)
ok("no prices are taken while paused", st == 409 and "paused" in b.get("error", "").lower(),
   f"{st} {b}")
call("POST", f"/api/auctions/{a.id}/resume/", PROC_T)
ok("and the close moves out by the length of the pause",
   Auction.objects.get(pk=a.id).ends_at >= ends, str(Auction.objects.get(pk=a.id).ends_at - ends))
st, _ = bid(a, lot, V1_T, 80_000_000)
ok("bidding works again after resuming", st == 200)


# ---------------------------------------------------------------- the record

print("\n=== the record of what happened ===")

a, lot = make()
bid(a, lot, V1_T, 88_000_000)
bid(a, lot, V2_T, 87_000_000)
bid(a, lot, V1_T, 86_000_000)

r = call("GET", f"/api/auctions/{a.id}/replay/", PROC_T)
ok("every movement is in the replay", len(r["movements"]) == 3, str(len(r["movements"])))
ok("in order", [m["at"] for m in r["movements"]] == sorted(m["at"] for m in r["movements"]))
ok("saying which bids took the lead",
   [m["tookLead"] for m in r["movements"]] == [True, True, True])
ok("and what the best was after each",
   [m["bestAfter"] for m in r["movements"]] == [88_000_000, 87_000_000, 86_000_000])

top = engine.best_bid(lot)
call("POST", f"/api/auctions/{a.id}/bids/{top.id}/retract/", PROC_T, {"reason": "Priced in error"})
ok("a voided bid leaves the standings",
   engine.best_bid(lot).amount == 87_000_000, str(engine.best_bid(lot).amount))
ok("but stays on the record with its reason",
   LotBid.objects.get(pk=top.id).retracted_reason == "Priced in error")
ok("voiding without a reason is refused",
   maybe("POST", f"/api/auctions/{a.id}/bids/{engine.best_bid(lot).id}/retract/", PROC_T, {})[0] == 400)


# ---------------------------------------------------------------- opening checks

print("\n=== opening the room ===")

a = Auction.objects.create(id=rid("a"), ref="AUC-" + rid("")[:6], title="Empty",
                           status="draft", created_at=now_ms())
st, b = maybe("POST", f"/api/auctions/{a.id}/open/", PROC_T)
ok("an auction with no lots will not open", st == 409 and "lot" in b.get("error", "").lower(),
   f"{st} {b}")
AuctionLot.objects.create(id=rid("l"), auction=a, number=1, title="X", ceiling=1_000_000)
st, b = maybe("POST", f"/api/auctions/{a.id}/open/", PROC_T)
ok("nor one with no vendors", st == 409 and "vendor" in b.get("error", "").lower(), f"{st} {b}")
AuctionParticipant.objects.create(id=rid("ap"), auction=a, supplier_id=V1.id)
st, b = maybe("POST", f"/api/auctions/{a.id}/open/", PROC_T)
ok("nor one with no closing time", st == 409 and "clos" in b.get("error", "").lower(), f"{st} {b}")
Auction.objects.filter(pk=a.id).update(ends_at=now_ms() + 30 * MIN)
st, b = maybe("POST", f"/api/auctions/{a.id}/open/", PROC_T)
ok("and opens once it has all three", st == 200, f"{st} {b}")

st, b = maybe("POST", f"/api/auctions/{a.id}/", PROC_T, {"title": "Changed"})
ok("a live auction's rules cannot be edited", st == 409, f"{st} {b}")


# ---------------------------------------------------------------- result

print(f"\n{len(PASSED)} passed, {len(FAILED)} failed")
for f in FAILED:
    print(f"  FAILED: {f}")
_runner.teardown_databases(_old_db)
sys.exit(1 if FAILED else 0)
