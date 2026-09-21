"""The setup gate, the org chart, and the delegation-of-authority chain.

    python test_approvals.py

Drives the real HTTP endpoints against a throwaway SQLite database, because
the thing under test is not the ORM — it is that a tender raised by a buyer
collects the right signatures from the right people in the right order, and
that nobody else can sign in their place. An ORM-level test would pass while
the endpoint let any approver jump the queue.

What is asserted, in the order it matters:

  THE CODE GATE actually gates: the wrong code is refused, the right one is
  accepted whatever its case, and repeated guessing locks setup.

  THE CHAIN IS THE REPORTING LINE. A buyer three levels down raises an amount
  only the top can carry, and the chain that opens is their own managers, in
  order, ending at the first one whose limit covers it.

  ORDER IS ENFORCED. The person at step 3 cannot sign while step 1 is
  outstanding, even though they hold more authority than step 1 does.

  A SMALL AMOUNT STOPS EARLY. The same buyer raising a small tender gets one
  signature, not four.

  A REJECTION ANYWHERE ENDS IT. The tender goes back to draft and the chain
  is cleared rather than left half-signed.

  THE FALLBACK COVERS A GAP. Somebody with no manager still cannot publish
  unsigned: the chain lands on the lowest rung that covers the amount.
"""
import json
import os
import sys

import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "docket.settings")
os.environ.setdefault("DEMO_LOGIN", "0")
os.environ.setdefault("SETUP_CODE", "ENGDOCKET1234")
django.setup()

for _stream in (sys.stdout, sys.stderr):        # Windows consoles default to cp1252
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

from django.conf import settings                        # noqa: E402
from django.test import Client                          # noqa: E402
from django.test.utils import setup_test_environment    # noqa: E402
from django.test.runner import DiscoverRunner           # noqa: E402

settings.EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
settings.DEMO_LOGIN = False
settings.SETUP_CODE = "ENGDOCKET1234"

setup_test_environment()
_runner = DiscoverRunner(verbosity=0, interactive=False)
_old_db = _runner.setup_databases()

J = "application/json"
c = Client()
PASSED, FAILED = [], []


def ok(label, cond, extra=""):
    (PASSED if cond else FAILED).append(label)
    print(("  PASS  " if cond else "  FAIL  ") + label + (f"  — {extra}" if extra and not cond else ""))


def call(method, path, token=None, body=None, expect=200):
    headers = {"HTTP_AUTHORIZATION": f"Bearer {token}"} if token else {}
    fn = getattr(c, method.lower())
    r = (fn(path, data=json.dumps(body or {}), content_type=J, **headers)
         if method in ("POST", "PATCH", "DELETE") else fn(path, **headers))
    if r.status_code != expect:
        raise AssertionError(f"{method} {path} -> {r.status_code} (wanted {expect}): "
                             f"{r.content[:400].decode('utf-8', 'replace')}")
    return json.loads(r.content) if r.content else {}


print("\n=== the access code ===")

call("POST", "/api/setup/code/", body={"code": "nope"}, expect=403)
ok("a wrong code is refused", True)
call("POST", "/api/setup/code/", body={"code": " engdocket1234 "})
ok("the right code is accepted, case- and space-insensitively", True)

for _ in range(9):
    c.post("/api/setup/code/", data=json.dumps({"code": "wrong"}), content_type=J)
r = c.post("/api/setup/code/", data=json.dumps({"code": "ENGDOCKET1234"}), content_type=J)
ok("repeated guessing locks setup", r.status_code == 429, f"got {r.status_code}")

from core.models import FailedLogin   # noqa: E402
FailedLogin.objects.all().delete()    # release the lock for the rest of the run


print("\n=== setting the workspace up ===")

LEVELS = [
    {"id": "L1", "name": "Line Manager",   "limit": 5_000_000,   "role": "approver", "holders": []},
    {"id": "L2", "name": "Head of Dept",   "limit": 50_000_000,  "role": "approver", "holders": []},
    {"id": "L3", "name": "Director",       "limit": 500_000_000, "role": "approver", "holders": []},
    {"id": "L4", "name": "Chief Executive", "limit": 0,          "role": "approver", "holders": []},
]

setup = call("POST", "/api/setup/", body={
    "code": "ENGDOCKET1234",
    "name": "Ada Nwosu", "email": "ada@kestrel.test", "password": "correct-horse",
    "title": "Head of Procurement",
    "company": "Kestrel Hospitality Group", "short": "Kestrel",
    "profile": {"legalName": "Kestrel Hospitality Group Ltd", "rcNumber": "RC 998877",
                "city": "Lagos", "email": "tenders@kestrel.test"},
    "approvalLevels": LEVELS,
    "ownerLevel": "",
    "team": [
        {"key": "ceo",   "name": "Dele Ogun",  "email": "dele@kestrel.test",
         "role": "approver", "title": "Chief Executive", "reportsTo": "", "level": "L4"},
        {"key": "dir",   "name": "Chidi Eze",  "email": "chidi@kestrel.test",
         "role": "approver", "title": "Finance Director", "reportsTo": "ceo", "level": "L3"},
        {"key": "head",  "name": "Bola Adeyemi", "email": "bola@kestrel.test",
         "role": "approver", "title": "Head of Procurement Ops", "reportsTo": "dir", "level": "L2"},
        {"key": "mgr",   "name": "Ngozi Bello", "email": "ngozi@kestrel.test",
         "role": "approver", "title": "Category Manager", "reportsTo": "head", "level": "L1"},
        {"key": "buyer", "name": "Tunde Alabi", "email": "tunde@kestrel.test",
         "role": "procurement", "title": "Buyer", "reportsTo": "mgr", "level": ""},
        {"key": "orph",  "name": "Ify Okafor",  "email": "ify@kestrel.test",
         "role": "procurement", "title": "Buyer, projects", "reportsTo": "", "level": ""},
    ],
    "vendors": [
        {"name": "Coldline Logistics Ltd", "category": "Logistics", "email": "bids@coldline.test"},
        {"name": "PackRight Industries", "category": "Packaging", "email": "tenders@packright.test"},
        {"name": "Coldline Logistics Ltd", "category": "Logistics", "email": "dup@coldline.test"},
        {"name": "No Mail Traders", "category": "General", "email": ""},
    ],
    "inviteVendors": True,
})

owner_token = setup["token"]
ok("setup returns a signed-in token", bool(owner_token))
ok("the company is named", setup["company"] == "Kestrel Hospitality Group")
ok("six invitations went out", len(setup["invited"]) == 6, str(len(setup["invited"])))
ok("three vendors created, one duplicate skipped",
   setup["vendors"]["created"] == 3 and setup["vendors"]["skipped"] == 1, str(setup["vendors"]))
ok("the vendor drive was armed", setup["vendors"]["invited"] is True)

call("POST", "/api/setup/", body={"code": "ENGDOCKET1234", "name": "Someone Else",
                                  "email": "x@y.test", "password": "correct-horse",
                                  "company": "Hijack Ltd"}, expect=403)
ok("setup closes once there is somebody to authorise things", True)

boot = call("GET", "/api/bootstrap/", owner_token)
ok("the company profile is on the payload",
   boot["org"]["profile"]["rcNumber"] == "RC 998877", str(boot["org"].get("profile")))
ok("the ladder is on the payload", len(boot["org"]["approvalLevels"]) == 4)


print("\n=== the org chart before anybody accepts ===")

from core.models import ActionToken, Persona, Tender   # noqa: E402

people = {p.name: p for p in Persona.objects.all()}
ok("everybody is on the chart already", len(people) == 7, str(sorted(people)))
ok("the line runs buyer -> manager -> head -> director -> ceo",
   people["Tunde Alabi"].manager.name == "Ngozi Bello"
   and people["Ngozi Bello"].manager.name == "Bola Adeyemi"
   and people["Bola Adeyemi"].manager.name == "Chidi Eze"
   and people["Chidi Eze"].manager.name == "Dele Ogun")
ok("the chief executive sits at the top", people["Dele Ogun"].manager_id is None)
ok("signing authority was recorded with the chart",
   people["Chidi Eze"].approval_level == "L3" and people["Tunde Alabi"].approval_level == "")


def accept(email, name, pw="correct-horse"):
    """Take the invitation and set a password, the way the link does."""
    tok = (ActionToken.objects
           .filter(kind="team_invite", email=email, used_at__isnull=True).first())
    assert tok, f"no invitation for {email}"
    call("POST", "/api/register/accept_invite/", body={"token": tok.token, "password": pw, "name": name})
    r = call("POST", "/api/auth/login/", body={"username": email, "password": pw})
    return r["token"]


tokens = {
    "ceo":   accept("dele@kestrel.test", "Dele Ogun"),
    "dir":   accept("chidi@kestrel.test", "Chidi Eze"),
    "head":  accept("bola@kestrel.test", "Bola Adeyemi"),
    "mgr":   accept("ngozi@kestrel.test", "Ngozi Bello"),
    "buyer": accept("tunde@kestrel.test", "Tunde Alabi"),
    "orph":  accept("ify@kestrel.test", "Ify Okafor"),
}
ok("accepting an invitation creates no second person", Persona.objects.count() == 7,
   str(Persona.objects.count()))
ok("the reporting line survived acceptance",
   Persona.objects.get(name="Tunde Alabi").manager.name == "Ngozi Bello")
ok("a ladder holder can reach the approvals queue",
   "page.approvals" in call("GET", "/api/bootstrap/", tokens["dir"])["me"]["perms"])


print("\n=== the chain follows the reporting line ===")


def draft(token, title, budget):
    t = call("POST", "/api/tenders/", token, {
        "title": title, "type": "RFQ", "category": "Logistics", "budget": budget,
        "scope": "A scope long enough to pass validation, describing what is being bought "
                 "and on what terms, in more than the handful of words a draft check wants.",
        "criteria": [{"id": "c1", "name": "Technical merit", "weight": 100}],
        "deadline": 4102444800000,
        "invited": [s["id"] for s in call("GET", "/api/bootstrap/", token)["suppliers"][:2]],
    })
    return t["tender"]["id"] if "tender" in t else t["id"]


big = draft(tokens["buyer"], "Cold chain fit-out", 240_000_000)
call("POST", f"/api/tenders/{big}/submit/", tokens["buyer"])
t = next(x for x in call("GET", "/api/bootstrap/", tokens["buyer"])["tenders"] if x["id"] == big)
chain = t["publishChain"]
ok("a submitted tender waits rather than publishing", t["status"] == "approval")
ok("the chain is three long for 240m under a 500m director",
   chain["total"] == 3, str(chain and chain["total"]))
ok("the chain is the buyer's own managers, in order",
   [s["personaName"] for s in chain["steps"]] == ["Ngozi Bello", "Bola Adeyemi", "Chidi Eze"],
   str([s["personaName"] for s in chain["steps"]]))
ok("it stops at the first limit that covers the amount",
   chain["steps"][-1]["level"] == "Director")

call("POST", f"/api/tenders/{big}/publish_decision/", tokens["dir"], {"ok": True}, expect=403)
ok("somebody further up cannot jump the queue", True)
call("POST", f"/api/tenders/{big}/publish_decision/", tokens["orph"], {"ok": True}, expect=403)
ok("somebody off the chain cannot sign at all", True)

call("POST", f"/api/tenders/{big}/publish_decision/", tokens["mgr"], {"ok": True})
t = next(x for x in call("GET", "/api/bootstrap/", tokens["buyer"])["tenders"] if x["id"] == big)
ok("one signature does not publish it", t["status"] == "approval")
ok("the first step is recorded as signed",
   t["publishChain"]["signed"] == 1 and t["publishChain"]["steps"][0]["decidedBy"] == "Ngozi Bello")

call("POST", f"/api/tenders/{big}/publish_decision/", tokens["head"], {"ok": True})
call("POST", f"/api/tenders/{big}/publish_decision/", tokens["dir"], {"ok": True})
t = next(x for x in call("GET", "/api/bootstrap/", tokens["buyer"])["tenders"] if x["id"] == big)
ok("the last signature publishes it", t["status"] == "published", t["status"])
ok("the signed chain is kept as a record", t["publishChain"]["signed"] == 3)


print("\n=== a small amount stops early ===")

small = draft(tokens["buyer"], "Replacement pallet jacks", 2_000_000)
call("POST", f"/api/tenders/{small}/submit/", tokens["buyer"])
t = next(x for x in call("GET", "/api/bootstrap/", tokens["buyer"])["tenders"] if x["id"] == small)
ok("2m needs one signature, not four", t["publishChain"]["total"] == 1,
   str(t["publishChain"]["total"]))
ok("and it is the line manager", t["publishChain"]["steps"][0]["personaName"] == "Ngozi Bello")
call("POST", f"/api/tenders/{small}/publish_decision/", tokens["mgr"], {"ok": True})
t = next(x for x in call("GET", "/api/bootstrap/", tokens["buyer"])["tenders"] if x["id"] == small)
ok("one signature is enough", t["status"] == "published")


print("\n=== a rejection ends the chain ===")

bad = draft(tokens["buyer"], "Questionable spend", 90_000_000)
call("POST", f"/api/tenders/{bad}/submit/", tokens["buyer"])
call("POST", f"/api/tenders/{bad}/publish_decision/", tokens["mgr"], {"ok": True})
call("POST", f"/api/tenders/{bad}/publish_decision/", tokens["head"],
     {"ok": False, "note": "The specification names one manufacturer."})
t = next(x for x in call("GET", "/api/bootstrap/", tokens["buyer"])["tenders"] if x["id"] == bad)
ok("a rejection sends it back to draft", t["status"] == "draft", t["status"])
ok("and clears the chain rather than leaving it half-signed", not t["publishChain"])


print("\n=== a gap in the chart is not a way out ===")

orphan = draft(tokens["orph"], "Site office refit", 300_000_000)
call("POST", f"/api/tenders/{orphan}/submit/", tokens["orph"])
t = next(x for x in call("GET", "/api/bootstrap/", tokens["orph"])["tenders"] if x["id"] == orphan)
chain = t["publishChain"]
ok("somebody with no manager still needs a signature", t["status"] == "approval")
ok("the chain falls back to the rung that covers the amount",
   chain["total"] == 1 and chain["steps"][0]["level"] == "Director", str(chain))
ok("the fallback names no individual", chain["steps"][0]["personaId"] is None)
call("POST", f"/api/tenders/{orphan}/publish_decision/", tokens["mgr"], {"ok": True}, expect=403)
ok("and the wrong level still cannot sign it", True)
call("POST", f"/api/tenders/{orphan}/publish_decision/", tokens["dir"], {"ok": True})
t = next(x for x in call("GET", "/api/bootstrap/", tokens["orph"])["tenders"] if x["id"] == orphan)
ok("anybody holding that rung can", t["status"] == "published", t["status"])


print("\n=== the ladder refuses an unsignable shape ===")

bad_ladder = [{"id": "x1", "name": "Manager", "limit": 5_000_000, "role": "approver"}]
r = c.post("/api/settings/", data=json.dumps({"approvalLevels": bad_ladder}),
           content_type=J, HTTP_AUTHORIZATION=f"Bearer {tokens['dir']}")
ok("a ladder with no unlimited top is refused", r.status_code == 400, str(r.status_code))
ok("and it says why",
   b"unlimited" in r.content.lower(), r.content[:200].decode("utf-8", "replace"))


print("\n" + "=" * 62)
print(f"  {len(PASSED)} passed, {len(FAILED)} failed")
if FAILED:
    for f in FAILED:
        print("   FAILED: " + f)
print("=" * 62 + "\n")

_runner.teardown_databases(_old_db)
sys.exit(1 if FAILED else 0)
