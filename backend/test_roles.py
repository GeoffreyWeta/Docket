"""Every company names its own roles.

    python test_roles.py

Drives the real HTTP endpoints against a throwaway SQLite database, the same
way test_approvals.py does.

What is asserted:

  SETUP TAKES THE COMPANY'S WORDS. The starter roles are renamed, one is
  dropped, one is invented, and a team member and a ladder rung point at the
  invented one by its local ref. Nothing the company did not choose is shown
  back to it, and the invitation email uses the company's name for the role.

  THE ROLE LIST IS EDITABLE AFTERWARDS, from the Team page, by whoever set the
  workspace up: rename, re-scope, add, remove.

  WHAT IS REFUSED, AND WHY. Removing a role somebody holds; two roles with one
  name; changing what your own role can do (or the person who sets up roles
  could hand themselves the power to sign); anybody without the right to set
  up roles; and removing your own role at setup.

  CAPABILITY, NOT NAME. A scoring role the company invented shows up as a
  scorer, because the screens ask who can score rather than who is called
  "evaluator".

  THE CONSOLE AGREES. The administration console renames a starter role
  through the same rules.
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
from django.core import mail                            # noqa: E402
from django.test import Client                          # noqa: E402
from django.test.runner import DiscoverRunner           # noqa: E402
from django.test.utils import setup_test_environment    # noqa: E402

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
    print(("  PASS  " if cond else "  FAIL  ") + label + (f"  - {extra}" if extra and not cond else ""))


def call(method, path, token=None, body=None, expect=200):
    headers = {"HTTP_AUTHORIZATION": f"Bearer {token}"} if token else {}
    fn = getattr(c, method.lower())
    r = (fn(path, data=json.dumps(body or {}), content_type=J, **headers)
         if method in ("POST", "PATCH", "DELETE") else fn(path, **headers))
    if r.status_code != expect:
        raise AssertionError(f"{method} {path} -> {r.status_code} (wanted {expect}): "
                             f"{r.content[:400].decode('utf-8', 'replace')}")
    return json.loads(r.content) if r.content else {}


def refused(method, path, token, body, status=400):
    """The refusal's sentence, so a test can check it says why."""
    return call(method, path, token, body, expect=status).get("error", "")


# ---------------------------------------------------------------- setup

ROLES = [
    {"ref": "procurement", "key": "procurement", "label": "Tender Desk", "kind": "procurement"},
    {"ref": "approver", "key": "approver", "label": "Finance Director", "kind": "approver"},
    {"ref": "evaluator", "key": "evaluator", "label": "Technical Panel", "kind": "evaluator"},
    {"key": "auditor", "remove": True},
    {"ref": "newlegal", "label": "Legal Review", "kind": "evaluator"},
]
LEVELS = [
    {"id": "L1", "name": "Head of Department", "limit": 50_000_000, "role": "newlegal", "holders": []},
    {"id": "L2", "name": "Managing Director", "limit": 0, "role": "", "holders": []},
]
BASE = {
    "code": "ENGDOCKET1234",
    "name": "Ada Nwosu", "email": "ada@kestrel.test", "password": "correct-horse",
    "company": "Kestrel Hospitality Group", "short": "Kestrel",
    "approvalLevels": LEVELS, "ownerLevel": "",
    "team": [
        {"key": "md", "name": "Dele Ogun", "email": "dele@kestrel.test", "role": "approver",
         "title": "Managing Director", "reportsTo": "", "level": "L2"},
        {"key": "law", "name": "Kemi Lawal", "email": "kemi@kestrel.test", "role": "newlegal",
         "title": "", "reportsTo": "md", "level": ""},
    ],
}

print("\n=== setup refuses what would strand the workspace ===")

msg = refused("POST", "/api/setup/", None, {**BASE, "roles": [
    {"key": "procurement", "remove": True}, *ROLES[1:]]})
ok("your own role cannot be removed at setup", "own role" in msg, msg)
msg = refused("POST", "/api/setup/", None, {**BASE, "roles": [
    *ROLES[:2], {"ref": "evaluator", "key": "evaluator", "label": "finance director", "kind": "evaluator"},
    *ROLES[3:]]})
ok("two roles cannot share a name", "two roles" in msg.lower(), msg)
msg = refused("POST", "/api/setup/", None, {**BASE, "roles": [
    *ROLES[:4], {"ref": "newlegal", "label": "Legal Review", "kind": "astronaut"}]})
ok("a role must say what it does", "Legal Review" in msg, msg)

print("\n=== setup takes the company's own words ===")

mail.outbox.clear()
setup = call("POST", "/api/setup/", body={**BASE, "roles": ROLES})
owner = setup["token"]
ok("the workspace is created", bool(owner))

from core.models import Persona   # noqa: E402

listing = call("GET", "/api/team/roles/", owner)
labels = [r["label"] for r in listing["roles"]]
ok("the roles are the ones the company named",
   sorted(labels) == ["Finance Director", "Legal Review", "Technical Panel", "Tender Desk"], str(labels))
ok("no starter name the company replaced is shown back to it",
   not {"Procurement", "Approver", "Evaluator", "Auditor"} & set(labels), str(labels))
legal = next(r for r in listing["roles"] if r["label"] == "Legal Review")
ok("the invented role carries the kind of work it was given",
   "bid.score" in legal["perms"] and "award.decide" not in legal["perms"], str(legal["perms"]))
ok("the person invited onto it is on it, by its real key",
   Persona.objects.get(name="Kemi Lawal").role == legal["key"])
ladder = call("GET", "/api/bootstrap/", owner)["org"]["approvalLevels"]
ok("the ladder rung falls back to it by its real key", ladder[0]["role"] == legal["key"], str(ladder))
# Setup holds the invitations; the owner sends them when ready.
call("POST", "/api/team/send_invites/", owner, {})
kemi_mail = next(m for m in mail.outbox if "kemi@kestrel.test" in m.to)
ok("the invitation uses the company's name for the role",
   "Legal Review" in kemi_mail.body and "Evaluator" not in kemi_mail.body, kemi_mail.body[:200])
ok("whoever set the workspace up may change the roles", listing["editable"] is True)
invite_roles = [r["label"] for r in call("GET", "/api/team/", owner)["roles"]]
ok("the invitation picker offers the same list", invite_roles == labels, str(invite_roles))


print("\n=== the list stays editable ===")

roles = {r["label"]: r for r in listing["roles"]}


def row(r, **patch):
    return {"key": r["key"], "label": r["label"], "note": r["note"], "perms": r["perms"], **patch}


fd = roles["Finance Director"]
out = call("POST", "/api/team/roles/", owner, {"roles": [
    row(fd, label="Finance Committee", perms=[p for p in fd["perms"] if p != "settings.rename"]),
]})
fc = next(r for r in out["roles"] if r["key"] == "approver")
ok("a starter role can be renamed", fc["label"] == "Finance Committee", fc["label"])
ok("and what it can do changed", "settings.rename" not in fc["perms"] and "award.decide" in fc["perms"])

out = call("POST", "/api/team/roles/", owner, {"roles": [
    {"ref": "x1", "label": "Board Observer", "note": "Reads, never acts",
     "perms": ["page.audit", "audit.export"]},
]})
ok("a role can be added", any(r["label"] == "Board Observer" for r in out["roles"]))
board = next(r for r in out["roles"] if r["label"] == "Board Observer")

out = call("POST", "/api/team/roles/", owner, {"roles": [{"key": board["key"], "remove": True}]})
ok("and removed again while nobody is on it", all(r["key"] != board["key"] for r in out["roles"]))
call("POST", "/api/team/invite/", owner, {"email": "late@kestrel.test", "role": board["key"]}, expect=400)
ok("a removed role cannot be invited to", True)

out = call("POST", "/api/team/roles/", owner, {"roles": [row(roles["Tender Desk"], label="Sourcing Desk")]})
ok("you can rename your own role", any(r["label"] == "Sourcing Desk" for r in out["roles"]))
td = next(r for r in out["roles"] if r["key"] == "procurement")

print("\n=== and refuses what would strand or promote somebody ===")

msg = refused("POST", "/api/team/roles/", owner, {"roles": [
    row(td, perms=td["perms"] + ["award.decide"])]})
ok("nobody can change what their own role can do", "your own role" in msg, msg)
msg = refused("POST", "/api/team/roles/", owner, {"roles": [{"key": legal["key"], "remove": True}]})
ok("a role somebody is on cannot be removed", "Kemi Lawal" in msg, msg)
msg = refused("POST", "/api/team/roles/", owner, {"roles": [row(roles["Technical Panel"], label="Legal Review")]})
ok("a second role cannot take an existing name", "Legal Review" in msg, msg)


def accept(email, name, pw="correct-horse"):
    from core.models import ActionToken
    tok = ActionToken.objects.filter(kind="team_invite", email=email, used_at__isnull=True).first()
    call("POST", "/api/register/accept_invite/", body={"token": tok.token, "password": pw, "name": name})
    return call("POST", "/api/auth/login/", body={"username": email, "password": pw})["token"]


kemi = accept("kemi@kestrel.test", "Kemi Lawal")
call("POST", "/api/team/roles/", kemi, {"roles": [row(roles["Technical Panel"], label="Panel")]}, expect=403)
ok("somebody without the right to set up roles cannot change them", True)

print("\n=== the screens ask what people can do, not what they are called ===")

boot = call("GET", "/api/bootstrap/", owner)
kemi_id = Persona.objects.get(name="Kemi Lawal").id
ok("a scorer on an invented role is counted as a scorer",
   kemi_id in boot["capHolders"].get("bid.score", []), str(boot["capHolders"].get("bid.score")))
me = call("GET", "/api/bootstrap/", kemi)["me"]
ok("and holds what the role gives, under the company's name for it",
   "bid.score" in me["perms"] and "tender.create" not in me["perms"])


print("\n=== the console agrees ===")

from django.contrib.auth.models import User   # noqa: E402

User.objects.create_superuser("root@kestrel.test", "root@kestrel.test", "console-password-1")
admin = call("POST", "/api/admin/login/",
             body={"username": "root@kestrel.test", "password": "console-password-1"})["token"]
st = call("GET", "/api/admin/state/", admin)
ok("the console shows the company's names",
   {"Sourcing Desk", "Finance Committee", "Technical Panel", "Legal Review"}
   <= {r["label"] for r in st["roles"]}, str([r["label"] for r in st["roles"]]))
call("POST", "/api/admin/roles/evaluator/", admin, {"label": "Scoring Panel"})
ok("the console can rename a starter role",
   any(r["label"] == "Scoring Panel" for r in call("GET", "/api/team/roles/", owner)["roles"]))
call("POST", f"/api/admin/roles/{legal['key']}/delete/", admin, {}, expect=409)
ok("and is refused removing one somebody is on", True)


print("\n" + "=" * 62)
print(f"  {len(PASSED)} passed, {len(FAILED)} failed")
if FAILED:
    for f in FAILED:
        print("   FAILED: " + f)
print("=" * 62 + "\n")

_runner.teardown_databases(_old_db)
sys.exit(1 if FAILED else 0)
