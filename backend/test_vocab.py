"""Fixed answers: the dropdown lists and the server that holds data to them.

    python test_vocab.py

What is under test is that a value reaching the register is spelled one way,
whatever way it was sent:

  ONE NUMBER, ONE SHAPE. A Nigerian number typed with or without its 0, its
  +234 or its spaces is stored +2348031234567. Two numbers in one field, or a
  number too short to dial, are refused with a sentence, not truncated.

  WORDING THE RULES CAN PLACE IS PLACED. "Ikeja, Lagos" is Lagos, "FCT" is
  Abuja, "Packaging" is Printing & packaging, PCS is a unit, Net 30 is 30 days.
  Only what nothing can place is refused.

  AN UNTOUCHED OLD VALUE IS LEFT ALONE. A record typed before the lists existed
  can be saved again without its old spelling failing the save.

  THE LISTS AGREE. Every place the importer can produce is on the location
  dropdown, and every category the importer can produce is in a family.

  THE ENDPOINTS ENFORCE IT, not only the forms that call them.
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

from core import taxonomy, vocab                                   # noqa: E402
from core.models import AuthToken, Persona, Profile, Supplier      # noqa: E402
from core.util import now_ms, rid                                  # noqa: E402
from core.vendor_import import PLACES                              # noqa: E402

PASSED, FAILED = [], []


def ok(label, cond, extra=""):
    (PASSED if cond else FAILED).append(label)
    print(("  PASS  " if cond else "  FAIL  ") + label
          + (f"  - {extra}" if extra and not cond else ""))


def cleaned(fn, value, **kw):
    try:
        return fn(value, **kw)
    except vocab.Refused:
        return "REFUSED"


print("\nphone numbers")
for typed in ("0803 123 4567", "+234 803 123 4567", "2348031234567", "8031234567",
              "+234 (0) 803-123-4567"):
    ok(f"{typed!r} is +2348031234567", cleaned(vocab.phone, typed) == "+2348031234567",
       cleaned(vocab.phone, typed))
ok("a Lagos landline keeps its area code", cleaned(vocab.phone, "01 234 5678") == "+23412345678")
ok("a foreign number keeps its country code", cleaned(vocab.phone, "0044 20 7946 0958") == "+442079460958")
ok("blank stays blank", cleaned(vocab.phone, "  ") == "")
ok("two numbers in one field are refused", cleaned(vocab.phone, "0803 123 4567, 0805 765 4321") == "REFUSED")
ok("a number too short to dial is refused", cleaned(vocab.phone, "12345") == "REFUSED")
ok("an old typed value passes when unchanged",
   cleaned(vocab.phone, "0803..., ask for Tunde", keep="0803..., ask for Tunde") == "0803..., ask for Tunde")

print("\nlocations")
ok("a suburb lands on its city", cleaned(vocab.location, "Ikeja, Lagos") == "Lagos")
ok("FCT is Abuja", cleaned(vocab.location, "FCT") == "Abuja")
ok("case does not make a new place", cleaned(vocab.location, "lagos") == "Lagos")
ok("every state is offered", cleaned(vocab.location, "Sokoto") == "Sokoto")
ok("somewhere unknown is refused", cleaned(vocab.location, "Atlantis") == "REFUSED")
ok("blank is refused where a location is required", cleaned(vocab.location, "") == "REFUSED")
ok("blank is 'not recorded' where it is optional", cleaned(vocab.location, "", blank="-") == "-")
missing = [label for label, _p in PLACES if label not in vocab.LOCATIONS]
ok("every place the importer produces is on the dropdown", not missing, missing)
ok("and so is International", "International" in vocab.LOCATIONS)

print("\ncategories")
ok("a legacy tender word is placed", cleaned(vocab.category, "Packaging") == "Printing & packaging")
ok("free wording is placed by the importer's rules",
   cleaned(vocab.category, "cold chain logistics") == "Logistics & freight")
ok("case does not make a new category", cleaned(vocab.category, "food & ingredients") == "Food & ingredients")
ok("wording nothing can place is refused", cleaned(vocab.category, "Widgets") == "REFUSED")
ok("an old category passes when unchanged", cleaned(vocab.category, "Widgets", keep="Widgets") == "Widgets")
ok("every importer category sits in a family", taxonomy._check() == {"missing": [], "extra": [], "duplicated": []},
   taxonomy._check())

print("\nunits and payment terms")
for typed, want in (("PCS", "unit"), ("CTNS", "carton"), ("boxes", "box"), ("Litres", "litre"),
                    ("kgs", "kg"), ("store set", "store set")):
    ok(f"{typed!r} is {want!r}", cleaned(vocab.unit, typed) == want, cleaned(vocab.unit, typed))
ok("an unknown unit is refused", cleaned(vocab.unit, "furlong") == "REFUSED")
ok("an old unit on the draft passes", cleaned(vocab.unit, "sleeve of 50", keep={"sleeve of 50"}) == "sleeve of 50")
for typed, want in (("Net 30", "30 days"), ("30DAYS", "30 days"), ("100% advance", "Payment in advance"),
                    ("COD", "Cash on delivery")):
    ok(f"{typed!r} is {want!r}", cleaned(vocab.payment_terms, typed) == want)
ok("unknown terms are refused", cleaned(vocab.payment_terms, "whenever") == "REFUSED")

print("\nthe company profile")
ok("an RC number gets its prefix", vocab.profile_field("rcNumber", "998877") == "RC 998877")
ok("a website loses its scheme and case", vocab.profile_field("website", "https://WWW.Kestrel.com/") == "www.kestrel.com")
ok("'Lagos State' is Lagos", vocab.profile_field("state", "Lagos State", country="Nigeria") == "Lagos")
ok("a state abroad is typed freely", vocab.profile_field("state", "Greater Accra", country="Ghana") == "Greater Accra")
ok("the description keeps its line breaks", vocab.profile_field("description", "one\ntwo") == "one\ntwo")

# ------------------------------------------------------------------ endpoints

print("\nthe endpoints")
p = Persona.objects.create(id=rid("u"), name="Amara Okafor", role="procurement", title="Procurement")
u = User.objects.create_user(username="amara@x.test", password="x")
Profile.objects.create(user=u, persona=p)
H = {"HTTP_AUTHORIZATION": "Bearer " + AuthToken.objects.create(
    key=rid("k") + rid("k"), user=u, created=now_ms()).key}
c = Client()


def post(path, body, **kw):
    return c.post("/api" + path, body, content_type="application/json", **kw)


r = post("/suppliers/register/", {"name": "Adeola Industrial Services Ltd", "category": "Logistics",
                                   "location": "Ikeja, Lagos", "phone": "0803 123 4567",
                                   "paymentTerms": "net 30", "invite": False}, **H)
s = Supplier.objects.filter(name="Adeola Industrial Services Ltd").first()
ok("a buyer registers a vendor", r.status_code == 200 and s is not None, r.content)
if s:
    ok("its category is the register's spelling", s.category == "Logistics & freight", s.category)
    ok("its location is the city", s.location == "Lagos", s.location)
    ok("its phone is in the stored shape", s.phone == "+2348031234567", s.phone)
    ok("its payment terms are on the list", s.payment_terms == "30 days", s.payment_terms)

r = post("/suppliers/register/", {"name": "Bad Phone Ltd", "phone": "12", "invite": False}, **H)
ok("a bad phone is refused with a sentence", r.status_code == 400 and "phone" in r.json().get("error", ""),
   r.content)
ok("and nothing was saved", not Supplier.objects.filter(name="Bad Phone Ltd").exists())

r = post("/register/vendor/", {"company": "Sahara Fresh Farms", "email": "sahara@x.test",
                               "password": "SaharaFresh!1", "category": "Widgets", "location": "Kano"})
ok("self-registration refuses a category off the list", r.status_code == 400, r.content)
r = post("/register/vendor/", {"company": "Sahara Fresh Farms", "email": "sahara@x.test",
                               "password": "SaharaFresh!1", "category": "Food & ingredients"})
ok("and needs a location", r.status_code == 400, r.content)

r = post("/settings/", {"profile": {"phone": "0803 123 4567", "country": "Nigeria", "state": "fct",
                                    "currency": "ngn"}}, **H)
prof = c.get("/api/settings/", **H).json().get("profile", {})
ok("the company profile is cleaned on save", r.status_code == 200
   and prof.get("phone") == "+2348031234567" and prof.get("state") == "Federal Capital Territory"
   and prof.get("currency") == "NGN", prof)
r = post("/settings/", {"profile": {"timezone": "Mars/Olympus"}}, **H)
ok("a time zone off the list is refused", r.status_code == 400, r.content)

# ------------------------------------------------------------- spreadsheets

print("\nthe upload templates")
from django.core.files.uploadedfile import SimpleUploadedFile  # noqa: E402


def upload(path, name, text, **extra):
    f = SimpleUploadedFile(name, text.encode("utf-8"), content_type="text/csv")
    return c.post("/api" + path, {"file": f, **extra}, **H)


# The Vendors page template (frontend/src/csvguide.jsx, VENDOR_IMPORT_CSV),
# with one row in older wording.
r = upload("/suppliers/import/", "docket-vendors-template.csv",
           "name,category,location,email,contact,phone,prequalified\n"
           "Coldline Logistics Ltd,Logistics & freight,Lagos,tenders@coldline.example,Ada Obi,0803 123 4567,yes\n"
           "PackRight Industries,Packaging,\"Ikeja, Lagos\",bids@packright.example,Musa Bello,0802 555 0101,\n"
           "Harmattan Foods Ltd,Widgets,Atlantis,,,,\n")
ok("the vendor template imports", r.status_code == 200 and r.json().get("created") == 3, r.content)
cold = Supplier.objects.filter(name="Coldline Logistics Ltd").first()
pack = Supplier.objects.filter(name="PackRight Industries").first()
harm = Supplier.objects.filter(name="Harmattan Foods Ltd").first()
ok("contact and phone columns are read", cold and cold.contact_person == "Ada Obi"
   and cold.phone == "+2348031234567", cold and (cold.contact_person, cold.phone))
ok("prequalified: yes marks the vendor verified", cold and cold.prequalified and pack and not pack.prequalified)
ok("older wording is placed as the forms place it", pack and pack.category == "Printing & packaging"
   and pack.location == "Lagos", pack and (pack.category, pack.location))
ok("what cannot be placed falls back, and the typed cell is kept", harm and harm.category == "Uncategorised"
   and harm.location in ("-", "\u2014") and harm.registry.get("locationTyped") == "Atlantis"
   and harm.classification == "Widgets", harm and (harm.category, harm.location, harm.registry))

# The staff template (staffCsv): roles written as the company names them.
r = upload("/invites/parse/", "docket-staff-template.csv",
           "name,email,role,title\n"
           "Amara Ede,amara.ede@yourcompany.example,Procurement,Category Manager\n"
           "Chidi Eze,chidi.eze@yourcompany.example,approver,Finance Director\n"
           "Bola Adeyemi,bola.adeyemi@yourcompany.example,,Quality Lead\n",
           audience="people", role="evaluator")
ready = {x["email"]: x["role"] for x in r.json().get("ready", [])} if r.status_code == 200 else {}
ok("a role written by its name is read as that role", ready.get("amara.ede@yourcompany.example") == "procurement",
   r.content)
ok("a role written by its key still works", ready.get("chidi.eze@yourcompany.example") == "approver")
ok("a blank role takes the default chosen", ready.get("bola.adeyemi@yourcompany.example") == "evaluator")

_runner.teardown_databases(_old_db)
print(f"\n{len(PASSED)} passed, {len(FAILED)} failed")
for f in FAILED:
    print("  FAILED: " + f)
sys.exit(1 if FAILED else 0)
