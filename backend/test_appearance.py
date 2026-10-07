"""The site's look is chosen once, in the console, and survives demo resets.

    python test_appearance.py

Runs against a throwaway SQLite database. The accent and layout are the
deployment's, not demo content: resetting the demo to its seed, or clearing
the demo out, must leave them as the console set them. Before this, every
reset put the demo back to the default blue.

The other half of the fix - the screens reading the look from the main site
even inside the demo - is in frontend/src/api.js (siteAppearance).
"""
import json
import os
import sys

import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "docket.settings")
os.environ.setdefault("DEMO_LOGIN", "0")
django.setup()

for _stream in (sys.stdout, sys.stderr):        # Windows consoles default to cp1252
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

from django.conf import settings                        # noqa: E402
from django.test import Client                          # noqa: E402
from django.test.runner import DiscoverRunner           # noqa: E402
from django.test.utils import setup_test_environment    # noqa: E402

settings.EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"

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
         if method == "POST" else fn(path, **headers))
    if r.status_code != expect:
        raise AssertionError(f"{method} {path} -> {r.status_code} (wanted {expect}): "
                             f"{r.content[:300].decode('utf-8', 'replace')}")
    return json.loads(r.content) if r.content else {}


from django.contrib.auth.models import User   # noqa: E402

from core.seed import clear_demo, seed_all    # noqa: E402

print("\n=== the console sets the look for the whole site ===")

seed_all()
User.objects.create_superuser("root@site.test", "root@site.test", "console-password-1")
admin = call("POST", "/api/admin/login/",
             body={"username": "root@site.test", "password": "console-password-1"})["token"]
call("POST", "/api/admin/appearance/", admin, {"accent": "teal"})
call("POST", "/api/admin/appearance/", admin, {"landing": "studio"})
cfg = call("GET", "/api/auth/config/")
ok("the site answers teal", cfg["accent"] == "teal", cfg.get("accent"))

print("\n=== and a demo reset keeps it ===")

seed_all()
cfg = call("GET", "/api/auth/config/")
ok("resetting the demo to its seed keeps the accent", cfg["accent"] == "teal", cfg.get("accent"))
ok("and the layout", cfg["landing"] == "studio", cfg.get("landing"))

clear_demo(reset_settings=True)
cfg = call("GET", "/api/auth/config/")
ok("clearing the demo out keeps the accent", cfg["accent"] == "teal", cfg.get("accent"))

call("POST", "/api/admin/appearance/", admin, {"accent": "gold"})
seed_all()
ok("a later choice is the one kept", call("GET", "/api/auth/config/")["accent"] == "gold")


print("\n" + "=" * 62)
print(f"  {len(PASSED)} passed, {len(FAILED)} failed")
if FAILED:
    for f in FAILED:
        print("   FAILED: " + f)
print("=" * 62 + "\n")

_runner.teardown_databases(_old_db)
sys.exit(1 if FAILED else 0)
