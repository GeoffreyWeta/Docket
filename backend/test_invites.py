"""Bulk invitations from a spreadsheet.

    python test_invites.py

What is under test is that the preview tells the truth, because the preview is
the confirmation step: you cannot unsend an invitation to four hundred people,
so everything that would go out has to be visible, and everything that would
not has to say why. Specifically:

  REAL FILES ARE READ. .xlsx and .csv, headers in any order and any case,
  headers not necessarily on the first row, and semicolon-delimited exports
  from a locale where the comma is a decimal separator.

  A FILE WITH NO EMAIL COLUMN IS STILL READ. Half of what people have puts the
  address in a column called "Contact", or in no column at all. Refusing those
  teaches people to retype their data by hand, which is where transcription
  errors come from.

  NOTHING IS SENT TWICE. Duplicates inside the file and addresses that already
  have an account are both held back, each naming the row it clashed with.

  CONFIRMED IS NOT TRUSTED. The rows come back from an editable preview, so
  send re-validates every one of them rather than believing the client.

  PEOPLE GET A PERSONA BEFORE THEY GET AN EMAIL, so the org chart is intact
  from the first minute rather than from whenever the last person clicks.
"""
import io
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

from django.conf import settings                           # noqa: E402
from django.contrib.auth.models import User                # noqa: E402
from django.core import mail                               # noqa: E402
from django.test import Client                             # noqa: E402
from django.test.utils import setup_test_environment       # noqa: E402
from django.test.runner import DiscoverRunner              # noqa: E402

settings.EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
settings.DEMO_LOGIN = False

setup_test_environment()
_runner = DiscoverRunner(verbosity=0, interactive=False)
_old_db = _runner.setup_databases()

from core.models import ActionToken, AuthToken, Persona, Profile   # noqa: E402
from core.util import now_ms, rid                                  # noqa: E402

c = Client()
PASSED, FAILED = [], []


def ok(label, cond, extra=""):
    (PASSED if cond else FAILED).append(label)
    print(("  PASS  " if cond else "  FAIL  ") + label
          + (f"  - {extra}" if extra and not cond else ""))


p = Persona.objects.create(id=rid("u"), name="Amara Okafor", role="procurement",
                           title="Procurement")
u = User.objects.create_user(username="amara@x.test", password="x")
Profile.objects.create(user=u, persona=p)
TOK = AuthToken.objects.create(key=rid("k") + rid("k"), user=u, created=now_ms()).key
H = {"HTTP_AUTHORIZATION": f"Bearer {TOK}"}


def parse(name, data, audience="people", role="evaluator"):
    r = c.post("/api/invites/parse/",
               {"file": _as_file(name, data), "audience": audience, "role": role},
               **H)
    return r.status_code, (json.loads(r.content) if r.content else {})


def send(rows, audience="people", role="evaluator"):
    r = c.post("/api/invites/send/",
               data=json.dumps({"rows": rows, "audience": audience, "role": role}),
               content_type="application/json", **H)
    return r.status_code, (json.loads(r.content) if r.content else {})


def _as_file(name, data):
    f = io.BytesIO(data if isinstance(data, bytes) else data.encode("utf-8"))
    f.name = name
    return f


def xlsx(rows):
    from openpyxl import Workbook
    wb = Workbook()
    ws = wb.active
    for r in rows:
        ws.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ---------------------------------------------------------------- reading

print("\n=== reading what people actually have ===")

st, r = parse("team.csv", "Name,Email,Job Title\nAda Nwosu,ada@x.test,Head of Finance\n"
                          "Chidi Eze,chidi@x.test,Buyer\n")
ok("a CSV with headers is read", st == 200 and r["counts"]["ready"] == 2, str(r.get("counts")))
ok("and the header mapping is reported", r["howRead"] == "headers", str(r.get("howRead")))
ok("titles come across", r["ready"][0]["title"] == "Head of Finance", str(r["ready"][0]))

st, r = parse("team.xlsx", xlsx([
    ["Kestrel Group - staff directory", "", ""],     # a title row
    ["", "", ""],                                     # a blank row
    ["FULL NAME", "E-Mail Address", "Position"],      # the real header, row 3
    ["Ada Nwosu", "ada2@x.test", "Head of Finance"],
    ["Chidi Eze", "chidi2@x.test", "Buyer"],
]))
ok("an .xlsx whose header is not on row 1 is read",
   st == 200 and r["counts"]["ready"] == 2, str(r.get("counts")))
ok("header synonyms are matched case-insensitively",
   set(r["columns"]) >= {"email", "name", "title"}, str(r.get("columns")))

st, r = parse("semi.csv", "Name;Email\nAda;ada3@x.test\nChidi;chidi3@x.test\n")
ok("a semicolon-delimited export is read", st == 200 and r["counts"]["ready"] == 2,
   str(r.get("counts")))

st, r = parse("messy.csv", "Details\n\"Ada Nwosu (Finance) ada4@x.test 0803-111-2222\"\n"
                           "\"Chidi Eze chidi4@x.test\"\n")
ok("a file with no email column is scanned rather than refused",
   st == 200 and r["counts"]["ready"] == 2, str(r.get("counts")))
ok("and says so, because that is a different level of confidence",
   r["howRead"] == "scanned", str(r.get("howRead")))

st, r = parse("bracket.csv", "Email\n\"Ada Nwosu <ada5@x.test>\"\n")
ok("an address wrapped in a display name is unwrapped",
   st == 200 and r["ready"][0]["email"] == "ada5@x.test", str(r.get("ready")))

st, r = parse("nothing.csv", "Name,Town\nAda,Lagos\n")
ok("a file with no addresses at all is refused", st == 400, f"{st} {r}")

st, r = parse("old.xls", b"\xd0\xcf\x11\xe0")
ok("the old .xls format is refused with what to do about it",
   st == 400 and "save as .xlsx" in r.get("error", ""), str(r.get("error")))


# ---------------------------------------------------------------- rejections

print("\n=== nothing is sent twice, and nothing silently ===")

User.objects.create_user(username="taken@x.test", password="x")
st, r = parse("mixed.csv",
              "Name,Email\n"
              "Ada,ada9@x.test\n"
              "Dupe,ada9@x.test\n"
              "Known,taken@x.test\n"
              "Broken,not-an-email\n"
              "Nobody,\n")
why = {x["email"] or "(blank)": x["why"] for x in r["rejected"]}
ok("one good row survives", r["counts"]["ready"] == 1, str(r["counts"]))
ok("a duplicate inside the file is held back, naming the row it clashed with",
   "Duplicate of row 2" in why.get("ada9@x.test", ""), str(why))
ok("an address that already has an account is held back",
   "Already has an account" in why.get("taken@x.test", ""), str(why))
ok("a malformed address is held back", "not a valid" in why.get("not-an-email", ""), str(why))
ok("a row with no address at all is held back", "No email" in why.get("(blank)", ""), str(why))

st, r = parse("roles.csv", "Name,Email,Role\nAda,r1@x.test,approver\nBad,r2@x.test,wizard\n",
              role="evaluator")
ok("a role column is honoured",
   any(x["email"] == "r1@x.test" and x["role"] == "approver" for x in r["ready"]), str(r["ready"]))
ok("a role that does not exist is refused, not silently defaulted",
   any("wizard" in x["why"] for x in r["rejected"]), str(r["rejected"]))


# ---------------------------------------------------------------- sending

print("\n=== sending ===")

mail.outbox = []
st, r = parse("send.csv", "Name,Email,Job Title\nAda Nwosu,s1@x.test,Head of Finance\n"
                          "Chidi Eze,s2@x.test,Buyer\n")
ok("parse sends nothing at all", len(mail.outbox) == 0, f"{len(mail.outbox)} sent")

st, out = send(r["ready"])
ok("send delivers the confirmed rows", st == 200 and out["sent"] == 2, str(out))
ok("one message each", len(mail.outbox) == 2, f"{len(mail.outbox)} sent")
ok("a persona exists for each before anybody accepts",
   Persona.objects.filter(name="Ada Nwosu").exists()
   and Persona.objects.filter(name="Chidi Eze").exists())
ok("carrying their job title",
   Persona.objects.get(name="Ada Nwosu").title == "Head of Finance")
ok("and the invitation names that persona, so the chart stays intact",
   all(ActionToken.objects.filter(kind="team_invite", email=x["email"])
       .first().payload.get("personaId") for x in out["rows"]))

mail.outbox = []
st, out = send(r["ready"])
ok("sending the same file twice sends nothing the second time",
   out["sent"] == 0 and len(mail.outbox) == 0, str(out))
ok("and says why each was skipped",
   all("Already has an account" in x["why"] for x in out["notSent"]), str(out["notSent"]))

# The preview is editable, so send must not trust what comes back.
mail.outbox = []
st, out = send([{"email": "nope", "name": "X"},
                {"email": "fine@x.test", "name": "Fine", "role": "evaluator"}])
ok("send re-validates confirmed rows rather than trusting them",
   out["sent"] == 1 and out["failed"] == 1, str(out))

st, out = send([{"email": "role-less@x.test", "name": "No Role"}], role="")
ok("a person with no role and no default is not invented into one",
   out["sent"] == 0, str(out))

mail.outbox = []
st, out = send([{"email": "v1@x.test", "company": "Alpha Fuels"}], audience="vendors")
ok("vendors get the registration invitation instead", out["sent"] == 1 and len(mail.outbox) == 1)
ok("and no persona is created for them",
   not Persona.objects.filter(name="Alpha Fuels").exists())

st, out = send([{"email": f"cap{i}@x.test", "name": f"P{i}", "role": "evaluator"}
                for i in range(600)])
ok("a send larger than the cap is refused with what to do",
   st == 400 and "at a time" in out.get("error", ""), str(out.get("error")))


print(f"\n{len(PASSED)} passed, {len(FAILED)} failed")
for f in FAILED:
    print(f"  FAILED: {f}")
_runner.teardown_databases(_old_db)
sys.exit(1 if FAILED else 0)
