"""Temporary passwords cannot grant business access before replacement."""
import os
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "docket.settings")
import django
django.setup()
from django.contrib.auth.models import User
from django.test import Client
from django.test.runner import DiscoverRunner
from core.models import ActionToken, AuthToken, Persona, Profile
from core.util import now_ms

runner = DiscoverRunner(verbosity=0, interactive=False)
database = runner.setup_databases()
try:
    user = User.objects.create_user(username="test.staff@example.test",password="1234test")
    person = Persona.objects.create(id="u-test",name="Test Staff",role="procurement",title="Buyer")
    profile = Profile.objects.create(user=user,persona=person,must_change_password=True)
    client = Client()
    login = client.post("/api/auth/login/",{"username":user.username,"password":"1234test"},content_type="application/json")
    assert login.status_code == 200 and login.json()["passwordChangeRequired"]
    headers = {"HTTP_AUTHORIZATION":"Bearer "+login.json()["token"]}
    assert client.get("/api/bootstrap/",**headers).json()["passwordChangeRequired"]
    assert client.post("/api/auctions/new/",{"title":"Blocked"},content_type="application/json",**headers).status_code == 403
    assert client.get("/api/auth/mfa/",**headers).status_code == 403
    body = {"current":"1234test","password":"1234test"}
    assert client.post("/api/auth/change_password/",body,content_type="application/json",**headers).status_code == 400
    body["password"]="ChangedPass!2026"
    other = AuthToken.objects.create(key="other-session",user=user,created=now_ms())
    assert client.post("/api/auth/change_password/",body,content_type="application/json",**headers).status_code == 200
    profile.refresh_from_db(); assert not profile.must_change_password
    assert not AuthToken.objects.filter(pk=other.key).exists()
    assert client.get("/api/bootstrap/",**headers).status_code == 200
    assert client.post("/api/auth/login/",{"username":user.username,"password":"1234test"},content_type="application/json").status_code == 401
    user.set_password("1234test");user.save();profile.must_change_password=True;profile.save()
    token=ActionToken.objects.create(token="test-reset",kind="reset",email=user.username,payload={},created=now_ms())
    assert client.post("/api/auth/reset_password/",{"token":token.token,"password":"1234test"},content_type="application/json").status_code == 400
    token.refresh_from_db();assert token.used_at is None
    assert client.post("/api/auth/reset_password/",{"token":token.token,"password":"AnotherPass!2026"},content_type="application/json").status_code == 200
    profile.refresh_from_db();assert not profile.must_change_password
    print("PASS first-login gate, API/MFA blocking, changed password required, session revocation, old password refusal and password-reset gate clearance")
finally:
    runner.teardown_databases(database)
