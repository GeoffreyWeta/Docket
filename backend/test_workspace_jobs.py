"""Verify job recommendations and the register/account distinction in the console."""
import io
import os
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "docket.settings")
import django
django.setup()
from django.contrib.auth.models import User
from django.core.management import call_command
from django.test import Client
from django.test.runner import DiscoverRunner
from core.models import AccessRole, AuthToken, Persona, Profile, Supplier
from core.util import now_ms
from core.workspace_jobs import job_templates

runner = DiscoverRunner(verbosity=0, interactive=False)
database = runner.setup_databases()
try:
    jobs = {j["key"]:set(j["perms"]) for j in job_templates()}
    assert "tender.create" in jobs["buyer"] and "award.decide" not in jobs["buyer"]
    assert "desk.see_reports" in jobs["manager"] and "award.decide" in jobs["manager"]
    assert "team.org" in jobs["hod"] and "team.org" in jobs["csco"]
    for role in ("finance", "ceo", "auditor"):
        assert "desk.see_reports" not in jobs[role] and "award.decide" not in jobs[role]
    AccessRole.objects.create(key="manager", label="Existing manager", perms=["page.team"])
    call_command("configure_procurement_roles", stdout=io.StringIO())
    call_command("configure_procurement_roles", stdout=io.StringIO())
    assert AccessRole.objects.count() == 6
    assert AccessRole.objects.get(pk="manager").perms == ["page.team"]
    parent = None
    for i,role in enumerate(("csco","hod","manager","manager","buyer")):
        parent = Persona.objects.create(id=f"u{i}",name=f"Person {i}",role=role,title=role,manager=parent)
    assert len(list(parent.chain())) == 4
    admin = User.objects.create_superuser("root", "root@example.test", "password-for-test")
    token = AuthToken.objects.create(key="test-admin",user=admin,created=now_ms())
    Supplier.objects.create(id="v1",name="Imported only",category="Food")
    signed = Supplier.objects.create(id="v2",name="Signed up vendor",category="IT")
    user = User.objects.create_user(username="bidder",password=None)
    Profile.objects.create(user=user,supplier=signed)
    response = Client().get("/api/admin/state/",HTTP_AUTHORIZATION="Bearer "+token.key)
    assert response.status_code == 200
    state = response.json()
    assert state["counts"]["vendorTotal"] == 2 and state["counts"]["vendorSignedUp"] == 1
    assert {v["id"]:v["signedUp"] for v in state["vendors"]} == {"v1":False,"v2":True}
    assert len(state["catalogue"]["jobTemplates"]) == 7
    assert Client().get("/api/admin/state/").status_code == 401
    print("PASS procurement job defaults, independent oversight roles, existing-role preservation, repeat configuration, manager-of-manager chain, vendor register/sign-up counts and admin-only access")
finally:
    runner.teardown_databases(database)
