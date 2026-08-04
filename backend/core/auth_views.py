"""Authentication: username/password login issuing opaque bearer tokens.

DEMO_LOGIN=1 additionally exposes one-click logins for the seeded demo
accounts (no password) so the persona-switching demo UX survives — flip the
env var to 0 to require passwords everywhere.
"""
import json
import secrets

from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

from .models import AuthToken, FailedLogin, Persona, Supplier
from .util import now_ms, record_event

LOCKOUT_ATTEMPTS = 5
LOCKOUT_WINDOW_MS = 15 * 60 * 1000


def _locked(username):
    since = now_ms() - LOCKOUT_WINDOW_MS
    FailedLogin.objects.filter(at__lt=since).delete()
    return FailedLogin.objects.filter(username=username, at__gte=since).count() >= LOCKOUT_ATTEMPTS


def _fail(username):
    FailedLogin.objects.create(username=username, at=now_ms())


def _err(msg, status=400):
    return JsonResponse({"error": msg}, status=status)


def _issue(user):
    tok = AuthToken.objects.create(key=secrets.token_hex(32), user=user, created=now_ms())
    return {"token": tok.key, "me": user.profile.identity}


def _body(request):
    try:
        return json.loads(request.body) if request.body else {}
    except (ValueError, TypeError):
        return {}


def _demo_accounts():
    """One-click demo logins. Administrator accounts are excluded on purpose: a
    passwordless door into an account that can change everyone's permissions is
    not a demo convenience, it is a hole."""
    out = []
    for u in (User.objects.filter(profile__persona__isnull=False, is_active=True)
              .exclude(is_superuser=True)
              .select_related("profile__persona").order_by("profile__persona__id")):
        p = u.profile.persona
        out.append({"username": u.username, "label": f"{p.name} — {p.title}", "role": p.role})
    for u in (User.objects.filter(profile__supplier__isnull=False, is_active=True)
              .exclude(is_superuser=True)
              .select_related("profile__supplier").order_by("profile__supplier__id")):
        s = u.profile.supplier
        out.append({"username": u.username, "label": f"{s.name} — Supplier", "role": "supplier"})
    return out


@csrf_exempt
def auth_config(request):
    return JsonResponse({
        "demoLogin": settings.DEMO_LOGIN,
        "accounts": _demo_accounts() if settings.DEMO_LOGIN else [],
    })


@csrf_exempt
def login(request):
    if request.method != "POST":
        return _err("Method not allowed", 405)
    body = _body(request)
    username = str(body.get("username", "")).strip().lower()
    if _locked(username):
        return _err("Too many failed attempts — this account is locked for 15 minutes.", 429)
    user = authenticate(username=username, password=str(body.get("password", "")))
    if not user or not hasattr(user, "profile"):
        _fail(username)
        return _err("Wrong username or password.", 401)
    prof = user.profile
    if not prof.persona_id and not prof.supplier_id:
        # No domain identity, so nothing to be in the workspace as. Deliberately
        # says nothing about where such an account does sign in.
        return _err("This account has no workspace access.", 403)
    if prof.totp_confirmed:
        import pyotp
        code = str(body.get("code", "")).strip()
        if not code:
            return JsonResponse({"mfaRequired": True, "error": "Enter the 6-digit code from your authenticator app."}, status=401)
        if not pyotp.TOTP(prof.totp_secret).verify(code, valid_window=1):
            _fail(username)
            return _err("That code isn't right — check your authenticator app.", 401)
    FailedLogin.objects.filter(username=username).delete()
    return JsonResponse(_issue(user))


@csrf_exempt
def demo_login(request):
    if request.method != "POST":
        return _err("Method not allowed", 405)
    if not settings.DEMO_LOGIN:
        return _err("Demo logins are disabled on this deployment.", 403)
    body = _body(request)
    user = (User.objects.filter(username=str(body.get("username", "")).strip().lower(),
                                profile__isnull=False, is_active=True)
            .exclude(is_superuser=True).first())
    if not user or (not user.profile.persona_id and not user.profile.supplier_id):
        return _err("Unknown demo account.", 404)
    return JsonResponse(_issue(user))


@csrf_exempt
def logout(request):
    if request.method != "POST":
        return _err("Method not allowed", 405)
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        AuthToken.objects.filter(key=auth[7:]).delete()
    return JsonResponse({"ok": True})



def _current_user(request):
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    tok = AuthToken.objects.select_related("user__profile").filter(key=auth[7:]).first()
    if not tok or not hasattr(tok.user, "profile") or not tok.user.is_active:
        return None
    return tok.user


@csrf_exempt
def mfa_setup(request):
    """Generate a fresh TOTP secret and its QR code (nothing is enforced until enable)."""
    if request.method != "POST":
        return _err("Method not allowed", 405)
    user = _current_user(request)
    if not user:
        return _err("Not signed in.", 401)
    import base64
    import io

    import pyotp
    import qrcode
    prof = user.profile
    if prof.totp_confirmed:
        return _err("Two-factor is already enabled — disable it first to re-enroll.", 409)
    prof.totp_secret = pyotp.random_base32()
    prof.totp_confirmed = False
    prof.save(update_fields=["totp_secret", "totp_confirmed"])
    uri = pyotp.TOTP(prof.totp_secret).provisioning_uri(name=user.username, issuer_name="DOCKET")
    buf = io.BytesIO()
    qrcode.make(uri).save(buf, format="PNG")
    return JsonResponse({"secret": prof.totp_secret, "uri": uri,
                         "qr": "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()})


@csrf_exempt
def mfa_enable(request):
    if request.method != "POST":
        return _err("Method not allowed", 405)
    user = _current_user(request)
    if not user:
        return _err("Not signed in.", 401)
    import pyotp
    prof = user.profile
    if not prof.totp_secret:
        return _err("Run setup first.", 409)
    code = str(_body(request).get("code", "")).strip()
    if not pyotp.TOTP(prof.totp_secret).verify(code, valid_window=1):
        return _err("That code isn't right — scan the QR again and retry.")
    prof.totp_confirmed = True
    prof.save(update_fields=["totp_confirmed"])
    record_event(actor=prof.identity["name"], role=prof.identity["role"],
                 action="Two-factor authentication enabled",
                 detail="Sign-in now requires an authenticator code in addition to the password.")
    return JsonResponse({"ok": True})


@csrf_exempt
def mfa_disable(request):
    if request.method != "POST":
        return _err("Method not allowed", 405)
    user = _current_user(request)
    if not user:
        return _err("Not signed in.", 401)
    import pyotp
    prof = user.profile
    if not prof.totp_confirmed:
        return JsonResponse({"ok": True})
    code = str(_body(request).get("code", "")).strip()
    if not pyotp.TOTP(prof.totp_secret).verify(code, valid_window=1):
        return _err("Confirm with a current code to disable two-factor.")
    prof.totp_secret = ""
    prof.totp_confirmed = False
    prof.save(update_fields=["totp_secret", "totp_confirmed"])
    record_event(actor=prof.identity["name"], role=prof.identity["role"],
                 action="Two-factor authentication disabled", detail="")
    return JsonResponse({"ok": True})


@csrf_exempt
def mfa_status(request):
    user = _current_user(request)
    if not user:
        return _err("Not signed in.", 401)
    return JsonResponse({"enabled": user.profile.totp_confirmed,
                         "sessions": user.tokens.count()})


@csrf_exempt
def logout_all(request):
    if request.method != "POST":
        return _err("Method not allowed", 405)
    user = _current_user(request)
    if not user:
        return _err("Not signed in.", 401)
    n = user.tokens.count()
    user.tokens.all().delete()
    return JsonResponse({"ok": True, "revoked": n})
