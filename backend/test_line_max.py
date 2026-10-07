"""The most the buyer will pay, line by line.

    python test_line_max.py

A tender no longer has a "most you can spend" box. Each line carries the most
the buyer will pay per unit, and what is under test is everything that hangs
off that one number:

  THE CEILING IS THE LINES. Quantity times maximum, summed, whatever the form
  sent as a budget. A line missing its maximum cannot be submitted.

  VENDORS DO NOT SEE IT. Not per line, and not added up as a ceiling.

  BIDS ARE GRADED ON IT. Line by line, each line weighted by quantity times
  maximum. A rate above the maximum scores nothing on that line; at or under,
  the lowest rate on the line gets full marks.

  THE DEMO SHOWS IT. Every demo tender is priced, every opened demo bid adds
  up from its line rates, and some go over a maximum so the flag is visible.
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
from django.test import Client                             # noqa: E402
from django.test.utils import setup_test_environment       # noqa: E402
from django.test.runner import DiscoverRunner              # noqa: E402

settings.EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
settings.DEMO_LOGIN = False

setup_test_environment()
_runner = DiscoverRunner(verbosity=0, interactive=False)
_old_db = _runner.setup_databases()

from core.models import AuthToken, Bid, Profile, Tender            # noqa: E402
from core.seed import seed_all                                      # noqa: E402
from core.util import (DAY_MS, comm_score, lines_ceiling,           # noqa: E402
                       lines_over_max, now_ms, rid)
from core.views import tender_view                                  # noqa: E402

PASSED, FAILED = [], []


def ok(label, cond, extra=""):
    (PASSED if cond else FAILED).append(label)
    print(("  PASS  " if cond else "  FAIL  ") + label
          + (f"  - {extra}" if extra and not cond else ""))


seed_all()

# ------------------------------------------------------------------ the demo

print("\nthe demo")
for t in Tender.objects.filter(id__in=["t1", "t2", "t3", "t4", "t5", "t6"]).order_by("id"):
    ok(f"{t.id} has a maximum on every line",
       bool(t.lines) and all(l.get("price", 0) > 0 for l in t.lines), t.lines)
    ok(f"{t.id}'s ceiling is what its lines add up to", t.budget == lines_ceiling(t.lines),
       f"{t.budget} vs {lines_ceiling(t.lines)}")
ok("the ceilings the demo's own text quotes are unchanged",
   [Tender.objects.get(pk=k).budget for k in ("t1", "t2", "t4", "t5", "t6")]
   == [480_000_000, 620_000_000, 210_000_000, 96_000_000, 240_000_000])

for b in Bid.objects.filter(tender_id__in=["t1", "t4"]):
    t = b.tender
    ok(f"{b.id}'s line rates add up to its amount",
       sum(b.lines[l["id"]] * l["qty"] for l in t.lines) == b.amount, b.lines)

# ------------------------------------------------------------------ grading

print("\ngrading")
t1 = Tender.objects.get(pk="t1")
bids = list(t1.bids.all())
by = {b.id: b for b in bids}
over = lines_over_max(t1, by["b2"])
ok("a rate above the maximum is caught on its line", [l["id"] for l in over] == ["l2"], over)
ok("a bid under every maximum has nothing flagged", lines_over_max(t1, by["b1"]) == [])

scores = {b.id: comm_score(b, bids, t1) for b in bids}
# b2's cheddar (l2, 78m of the 480m ceiling) is above the maximum, so it loses
# that line entirely; b3 is lowest on mozzarella and cheddar and so scores
# almost everything.
ok("the over-maximum line scores nothing", abs(scores["b2"] - (360 * 2600 / 4500 + 42) / 480 * 100) < 0.01,
   scores)
ok("the lowest compliant rate gets full marks on its line",
   abs(scores["b3"] - (360 + 78 + 42 * 3800 / 4000) / 480 * 100) < 0.01, scores)
ok("a rate above the maximum cannot be the one others are measured against",
   abs(scores["b1"] - (360 * 2600 / 4700 + 78 * 4150 / 6200 + 42 * 3800 / 5600) / 480 * 100) < 0.01,
   scores)
lump = Tender(lines=[], budget=100)
ok("a tender with no maximums is graded on the total as before",
   abs(comm_score(by["b1"], bids, lump) - 265_000_000 / 452_000_000 * 100) < 0.01)

# ------------------------------------------------------------------ vendors

print("\nwhat vendors see")
seen = tender_view(Tender.objects.get(pk="t2"), {"role": "supplier", "supplierId": "s2"})
ok("vendors see the lines", len(seen["lines"]) == 3)
ok("but not the maximum on any of them", all("price" not in l for l in seen["lines"]), seen["lines"])
ok("and not the ceiling they add up to", seen["budget"] is None)
buyer = tender_view(Tender.objects.get(pk="t2"), {"role": "procurement", "id": "u1", "perms": set()})
ok("the buyer still sees both", buyer["budget"] == 620_000_000 and buyer["lines"][0]["price"] == 32_500)

# ------------------------------------------------------------------ the endpoint

print("\nthe endpoint")
u = User.objects.create_user(username="maxtest@x.test", password="x")
Profile.objects.create(user=u, persona_id="u1")
H = {"HTTP_AUTHORIZATION": "Bearer " + AuthToken.objects.create(
    key=rid("k") + rid("k"), user=u, created=now_ms()).key}
c = Client()

base = {"title": "Line max test", "type": "RFQ", "category": "Packaging",
        "deadline": now_ms() + 10 * DAY_MS, "techWeight": 60, "invited": ["s5"],
        "criteria": [{"name": "Quality", "weight": 100}],
        "budget": 1,   # what an old form would have sent; the lines overrule it
        "lines": [{"desc": "Cups", "qty": 2000, "unit": "sleeve", "price": 6_000},
                  {"desc": "Boxes", "qty": 1000, "unit": "box", "price": 12_000}]}
r = c.post("/api/tenders/", base, content_type="application/json", **H)
ok("a priced draft saves", r.status_code == 200, r.content)
if r.status_code == 200:
    t = Tender.objects.get(pk=r.json()["id"])
    ok("its ceiling is quantity times maximum, not the budget sent",
       t.budget == 2000 * 6_000 + 1000 * 12_000, t.budget)

half = {**base, "submit": True,
        "lines": [{"desc": "Cups", "qty": 2000, "unit": "sleeve", "price": 6_000},
                  {"desc": "Boxes", "qty": 1000, "unit": "box"}]}
r = c.post("/api/tenders/", half, content_type="application/json", **H)
ok("a line without its maximum cannot be submitted",
   r.status_code == 400 and "most you will pay" in r.json().get("error", ""), r.content)

_runner.teardown_databases(_old_db)
print(f"\n{len(PASSED)} passed, {len(FAILED)} failed")
for f in FAILED:
    print("  FAILED: " + f)
sys.exit(1 if FAILED else 0)
