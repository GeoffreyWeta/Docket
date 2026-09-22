"""The outbound data feed.

    python test_datafeed.py

Drives the real HTTP endpoints against a throwaway SQLite database. What is
under test is not the ORM but the three promises the feed makes to somebody
else's warehouse, each of which fails silently if it is wrong — the sync keeps
returning 200 and quietly stops being complete:

  NOTHING IS SKIPPED. A full walk at a page size smaller than the data returns
  every row exactly once. The cursor is the pair (updated_at, id), so rows
  written in the same millisecond — which a bulk vendor invite produces by the
  hundred — cannot collide into a row being dropped or repeated forever.

  EVERY CHANGE MOVES THE CURSOR, including the two that bypass save(). This
  codebase writes with `save(update_fields=[...])` in forty places and with
  queryset `.update()` in a dozen more; both would drop a naively implemented
  timestamp and neither would raise anything.

  EVERY DEATH LEAVES A BODY. A deleted row is tombstoned, cascades included,
  because a delete that leaves no trace is indistinguishable downstream from a
  row that simply stopped matching the cursor.

And the one that is not about completeness but about the product:

  THE SEAL HOLDS. A bid before its tender's recorded opening exports the fact
  that it exists and no number, and the Fernet ciphertext never appears in any
  payload in any state. A feed that could be pointed at an unopened envelope
  would make the envelope decorative.
"""
import json
import os
import sys

import django

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "docket.settings")
os.environ.setdefault("DEMO_LOGIN", "0")
django.setup()

for _stream in (sys.stdout, sys.stderr):        # Windows consoles default to cp1252
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

from django.test import Client                          # noqa: E402
from django.test.utils import setup_test_environment    # noqa: E402
from django.test.runner import DiscoverRunner           # noqa: E402

setup_test_environment()
_runner = DiscoverRunner(verbosity=0, interactive=False)
_old_db = _runner.setup_databases()

from core import datafeed, feed_views                   # noqa: E402
from core.models import (ApiKey, Bid, Contract, Persona, Supplier,  # noqa: E402
                         Tender, Tombstone)
from core.util import now_ms, record_event              # noqa: E402

c = Client()
PASSED, FAILED = [], []


def ok(label, cond, extra=""):
    (PASSED if cond else FAILED).append(label)
    print(("  PASS  " if cond else "  FAIL  ") + label
          + (f"  — {extra}" if extra and not cond else ""))


def get(path, key=None, expect=200):
    headers = {"HTTP_AUTHORIZATION": f"Bearer {key}"} if key else {}
    r = c.get(path, **headers)
    if r.status_code != expect:
        raise AssertionError(f"GET {path} -> {r.status_code} (wanted {expect}): "
                             f"{r.content[:400].decode('utf-8', 'replace')}")
    return json.loads(r.content) if r.content else {}


# The safety lag is an independent property with its own test at the bottom.
# Everywhere else it would mean sleeping five seconds per assertion, so it is
# switched off and switched back on for the one test that is about it.
REAL_LAG = datafeed.LAG_MS
datafeed.LAG_MS = 0


# ---------------------------------------------------------------- fixtures

FULL, PROC = None, None


def seed():
    global FULL, PROC
    for i in range(7):
        Supplier.objects.create(id=f"s{i}", name=f"Vendor {i}",
                                category="ICT", location="Lagos")
    Persona.objects.create(id="p1", name="Ada Nwosu", role="procurement",
                           title="Category Manager")
    t = Tender.objects.create(id="t1", ref="RFQ-001", title="Laptops", ttype="RFQ",
                              category="ICT", budget=10_000_000, status="published",
                              deadline=now_ms() + 86_400_000)
    Tender.objects.create(id="t2", ref="RFQ-002", title="Printers", ttype="RFQ",
                          category="ICT", budget=2_000_000, status="draft",
                          deadline=now_ms() + 86_400_000)
    for i in range(3):
        Bid.objects.create(id=f"b{i}", tender=t, supplier_id=f"s{i}",
                           submitted_at=now_ms(), amount=900_000 + i,
                           sealed_blob=b"pretend-ciphertext")
    Contract.objects.create(id="c1", ref="CON-1", title="Laptops 2026",
                            supplier_id="s0", original_value=9_000_000,
                            amount=9_000_000, status="active")
    record_event(actor="Ada Nwosu", role="procurement", action="tender.published",
                 tender_id="t1", detail="RFQ-001")

    full, _ = feed_views.mint("Warehouse (all)", list(datafeed.SCOPES))
    proc, _ = feed_views.mint("BI (procurement only)", ["feed.procurement"])
    FULL, PROC = full, proc


seed()


# ---------------------------------------------------------------- the door

print("\n=== who may knock ===")

get("/api/v1/", expect=401)
ok("no credential is refused", True)

get("/api/v1/", key="dk_live_not-a-real-key", expect=401)
ok("an unknown key is refused", True)

get("/api/v1/", key="some-user-session-token", expect=401)
ok("a login token is not a feed key", True)

_rev, _revobj = feed_views.mint("Revoked", ["feed.procurement"])
_revobj.revoked_at = now_ms()
_revobj.save(update_fields=["revoked_at"])
get("/api/v1/", key=_rev, expect=401)
ok("a revoked key stops working", True)

ok("only the hash is stored, never the key",
   not ApiKey.objects.filter(key_hash=FULL).exists()
   and ApiKey.objects.filter(key_hash=feed_views.hash_key(FULL)).exists())

r = c.post("/api/v1/tenders/", **{"HTTP_AUTHORIZATION": f"Bearer {FULL}"})
ok("the feed is read-only", r.status_code == 405, f"POST got {r.status_code}")


print("\n=== scopes ===")

get("/api/v1/contracts/", key=PROC, expect=403)
ok("a procurement-only key cannot read the ledger", True)

get("/api/v1/events/", key=PROC, expect=403)
ok("a procurement-only key cannot read the audit chain", True)

get("/api/v1/contracts/", key=FULL)
ok("a full key can", True)

idx = get("/api/v1/", key=PROC)
ok("discovery shows only what this key reaches",
   set(idx["entities"]) == {"tenders", "suppliers"}, str(sorted(idx["entities"])))


# ---------------------------------------------------------------- paging

print("\n=== nothing is skipped ===")

seen, cursor, pages = [], None, 0
while True:
    q = f"/api/v1/suppliers/?limit=2" + (f"&cursor={cursor}" if cursor else "")
    p = get(q, key=FULL)
    seen += [row["id"] for row in p["rows"]]
    cursor, pages = p["cursor"], pages + 1
    if not p["has_more"]:
        break
    if pages > 20:
        raise AssertionError("paging did not terminate")

ok("a full walk returns every row", sorted(seen) == sorted(s.id for s in Supplier.objects.all()),
   f"got {sorted(seen)}")
ok("and returns none of them twice", len(seen) == len(set(seen)), f"{len(seen)} rows, {len(set(seen))} distinct")
ok("in more than one page", pages > 1, f"{pages} pages")

p = get(f"/api/v1/suppliers/?cursor={cursor}", key=FULL)
ok("a caught-up cursor returns nothing", p["rows"] == [] and not p["has_more"])
ok("and does not rewind to the start", p["cursor"] == cursor)

get("/api/v1/suppliers/?cursor=!!!not-base64!!!", key=FULL, expect=400)
ok("a corrupt cursor is an error, not a silent full reload", True)

# Rows written in the same millisecond are the case the id tie-break exists
# for: a bulk invite writes hundreds and a timestamp-only cursor would either
# repeat one forever or step over the rest.
Supplier.objects.all().update(updated_at=5_000)
seen, cur2, guard = [], None, 0
while guard < 20:
    p = get("/api/v1/suppliers/?limit=2" + (f"&cursor={cur2}" if cur2 else ""), key=FULL)
    seen += [row["id"] for row in p["rows"]]
    cur2, guard = p["cursor"], guard + 1
    if not p["has_more"]:
        break
ok("rows sharing one millisecond still page exactly once",
   sorted(seen) == sorted(s.id for s in Supplier.objects.all()), f"got {seen}")


# ---------------------------------------------------------------- the hazards

print("\n=== every change moves the cursor ===")

after = get("/api/v1/suppliers/", key=FULL)["cursor"]

s = Supplier.objects.get(pk="s3")
s.rating = 4.5
s.save()
p = get(f"/api/v1/suppliers/?cursor={after}", key=FULL)
ok("a plain save() is picked up", [r["id"] for r in p["rows"]] == ["s3"], str(p["rows"]))
after = p["cursor"]

# Hazard 1: save(update_fields=[...]) writes only the named columns, so a
# timestamp set in save() would be computed and then dropped.
s = Supplier.objects.get(pk="s4")
s.prequalified = True
s.save(update_fields=["prequalified"])
p = get(f"/api/v1/suppliers/?cursor={after}", key=FULL)
ok("save(update_fields=...) is picked up", [r["id"] for r in p["rows"]] == ["s4"], str(p["rows"]))
after = p["cursor"]

# Hazard 2: queryset .update() compiles straight to SQL and never calls save().
Supplier.objects.filter(pk="s5").update(invite_count=3)
p = get(f"/api/v1/suppliers/?cursor={after}", key=FULL)
ok("queryset .update() is picked up", [r["id"] for r in p["rows"]] == ["s5"], str(p["rows"]))
after = p["cursor"]

Supplier.objects.filter(pk="s6").update(invite_count=9, touch=False)
p = get(f"/api/v1/suppliers/?cursor={after}", key=FULL)
ok("...unless it explicitly says touch=False", p["rows"] == [], str(p["rows"]))


print("\n=== every death leaves a body ===")

before = Tombstone.objects.count()
Supplier.objects.get(pk="s6").delete()
d = get("/api/v1/deletions/", key=FULL)
ok("a delete is tombstoned",
   any(r["entity"] == "suppliers" and r["id"] == "s6" for r in d["rows"]), str(d["rows"]))

# Hazard 3, the part no view code mentions: deleting a tender takes its bids
# with it, and those are the rows a warehouse would otherwise keep forever.
Tender.objects.get(pk="t1").delete()
d = get("/api/v1/deletions/", key=FULL)
got = {(r["entity"], r["id"]) for r in d["rows"]}
ok("a cascade is tombstoned too",
   ("tenders", "t1") in got and all(("bids", f"b{i}") in got for i in range(3)), str(sorted(got)))

dp = get("/api/v1/deletions/", key=PROC)
ok("tombstones are filtered to what the key could have read",
   all(r["entity"] in ("tenders", "suppliers") for r in dp["rows"]), str(dp["rows"]))

seq = d["rows"][0]["seq"]
d2 = get(f"/api/v1/deletions/?since_seq={seq}", key=FULL)
ok("deletions are cursored", all(r["seq"] > seq for r in d2["rows"]))
ok("the tombstone count grew", Tombstone.objects.count() > before)


# ---------------------------------------------------------------- the seal

print("\n=== the seal holds ===")

t = Tender.objects.create(id="t3", ref="RFQ-003", title="Vehicles", ttype="RFQ",
                          category="Fleet", budget=50_000_000, status="published",
                          deadline=now_ms() + 86_400_000)
Bid.objects.create(id="bx", tender=t, supplier_id="s0", submitted_at=now_ms(),
                   amount=44_000_000, sealed_blob=b"fernet-ciphertext-here")

rows = {r["id"]: r for r in get("/api/v1/bids/", key=FULL)["rows"]}
bx = rows["bx"]
ok("an unopened bid reports itself sealed", bx["sealed"] is True)
ok("and carries no amount", bx["amount"] is None, str(bx["amount"]))
ok("and no line prices", bx["line_prices"] is None)
ok("but does say a bid exists, and whose",
   bx["supplier_id"] == "s0" and bx["submitted_at"] > 0)

raw = json.dumps(get("/api/v1/bids/", key=FULL))
ok("the ciphertext never appears in any payload",
   "fernet-ciphertext-here" not in raw and "sealed_blob" not in raw)

t.opened_at = now_ms()
t.save()
Bid.objects.filter(pk="bx").update(updated_at=now_ms())
bx = {r["id"]: r for r in get("/api/v1/bids/", key=FULL)["rows"]}["bx"]
ok("after the recorded opening the amount is exported",
   bx["sealed"] is False and bx["amount"] == 44_000_000, str(bx))


# ---------------------------------------------------------------- the chain

print("\n=== the audit chain travels verifiably ===")

ev = get("/api/v1/events/", key=FULL)
ok("events are exported", len(ev["rows"]) > 0)
first = ev["rows"][0]
ok("with the hash chain intact",
   all(k in first for k in ("seq", "prev_hash", "hash")), str(first.keys()))
ok("in chain order", [r["seq"] for r in ev["rows"]] == sorted(r["seq"] for r in ev["rows"]))
ev2 = get(f"/api/v1/events/?since_seq={first['seq']}", key=FULL)
ok("and are cursored by seq", all(r["seq"] > first["seq"] for r in ev2["rows"]))


# ---------------------------------------------------------------- discovery

print("\n=== discovery and the spec ===")

spec = get("/api/v1/openapi.json", key=FULL)
ok("the spec is generated from the registry",
   all(f"/api/v1/{n}/" in spec["paths"] for n in datafeed.ENTITIES), str(list(spec["paths"])))
ok("and states the delivery guarantee",
   "at-least-once" in spec["info"]["description"])

idx = get("/api/v1/", key=FULL)
ok("discovery names the lag", idx["paging"]["lag_ms"] == datafeed.LAG_MS)


# ---------------------------------------------------------------- rate limit

print("\n=== a runaway client is throttled ===")

real_limit = feed_views.RATE_LIMIT
feed_views.RATE_LIMIT = 3
burst, _ = feed_views.mint("Burst", ["feed.procurement"])
codes = [c.get("/api/v1/tenders/", HTTP_AUTHORIZATION=f"Bearer {burst}").status_code
         for _ in range(5)]
ok("the ceiling is enforced", 429 in codes, str(codes))
last = c.get("/api/v1/tenders/", HTTP_AUTHORIZATION=f"Bearer {burst}")
ok("and says when to come back", last.headers.get("Retry-After") is not None)
feed_views.RATE_LIMIT = real_limit


# ---------------------------------------------------------------- the lag

print("\n=== the safety lag ===")

datafeed.LAG_MS = REAL_LAG
Supplier.objects.create(id="s99", name="Just Written", category="ICT", location="Abuja")
ids = [r["id"] for r in get("/api/v1/suppliers/?limit=2000", key=FULL)["rows"]]
ok("a row written this instant is held back until it is certainly committed",
   "s99" not in ids)
Supplier.objects.filter(pk="s99").update(updated_at=now_ms() - REAL_LAG - 1_000)
ids = [r["id"] for r in get("/api/v1/suppliers/?limit=2000", key=FULL)["rows"]]
ok("and is served once it is older than the lag", "s99" in ids)


# ---------------------------------------------------------------- result

print(f"\n{len(PASSED)} passed, {len(FAILED)} failed")
for f in FAILED:
    print(f"  FAILED: {f}")
_runner.teardown_databases(_old_db)
sys.exit(1 if FAILED else 0)
