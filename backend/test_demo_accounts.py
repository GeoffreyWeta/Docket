"""Passwordless demo access is limited to prepared accounts."""
import os
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "docket.settings")
import django
django.setup()
from django.contrib.auth.models import User
from django.test import Client, override_settings
from django.test.runner import DiscoverRunner
from core.models import Persona, Profile, Supplier

runner = DiscoverRunner(verbosity=0, interactive=False)
database = runner.setup_databases()
try:
    for username in ("amara", "real.staff@example.test", "auctionhost"):
        user = User.objects.create_user(username=username,password="ExamplePass!2026")
        persona = Persona.objects.create(id=username[:16],name=username,role="procurement",title="Staff")
        Profile.objects.create(user=user,persona=persona)
    vendor = Supplier.objects.create(id="new-vendor",name="New company",category="IT")
    user = User.objects.create_user(username="new.vendor@example.test",password="ExamplePass!2026")
    Profile.objects.create(user=user,supplier=vendor)
    staff = Supplier.objects.create(id="demo-staff",name="Demo staff",category="Individual bidders")
    user = User.objects.create_user(username="staffbidder",password=None)
    Profile.objects.create(user=user,supplier=staff)
    client = Client()
    with override_settings(DEMO_LOGIN=True):
        accounts = client.get("/api/auth/config/").json()["accounts"]
        assert {a["username"] for a in accounts} == {"amara","auctionhost","staffbidder"}
        for username in ("real.staff@example.test", "new.vendor@example.test"):
            assert client.post("/api/auth/demo/",{"username":username},content_type="application/json").status_code == 404
        for username in ("amara", "auctionhost", "staffbidder"):
            assert client.post("/api/auth/demo/",{"username":username},content_type="application/json").status_code == 200
        assert client.post("/api/auth/login/",{"username":"new.vendor@example.test","password":"ExamplePass!2026","asBidder":True},content_type="application/json").status_code == 200
        user.is_superuser = True; user.save()
        assert client.post("/api/auth/demo/",{"username":"staffbidder"},content_type="application/json").status_code == 404
    with override_settings(DEMO_LOGIN=False):
        assert client.post("/api/auth/demo/",{"username":"amara"},content_type="application/json").status_code == 403
    print("PASS only prepared staff/bidder personas listed; direct passwordless access refused for other users/admins; password login works for new bidders; live demo login disabled")
finally:
    runner.teardown_databases(database)
