"""Authentication: username/password login issuing opaque bearer tokens.

DEMO_LOGIN=1 additionally exposes one-click logins for the seeded demo
accounts (no password) so the persona-switching demo UX survives - flip the
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


def _issue(user, bidder=False):
    tok = AuthToken.objects.create(key=secrets.token_hex(32), user=user, created=now_ms(), bidder_mode=bidder)
    return {"token": tok.key, "me": user.profile.bidder_identity if bidder else user.profile.identity}


def _body(request):
    try:
        return json.loads(request.body) if request.body else {}
    except (ValueError, TypeError):
        return {}


def _demo_usernames():
    from .seed import DEMO_USERS
    return {username for username, _, _ in DEMO_USERS} | {"auctionhost", "staffbidder"}


def _demo_accounts():
    """One-click demo logins, in reading order down the org chart.

    Administrator accounts are excluded on purpose: a passwordless door into an
    account that can change everyone's permissions is not a demo convenience, it
    is a hole.

    Ordered by a walk of the reporting tree rather than by persona id, so the
    list on the sign-in page reads as the hierarchy it represents: every manager
    is followed immediately by the people who report to them. Insertion order
    put the Procurement Officer three rows below an unrelated evaluator and
    broke the one chain the list exists to show.
    """
    users = list(User.objects.filter(username__in=_demo_usernames(), profile__persona__isnull=False, is_active=True)
                 .exclude(is_superuser=True).select_related("profile__persona"))
    reports = {}
    for u in users:
        reports.setdefault(u.profile.persona.manager_id, []).append(u)
    for group in reports.values():
        group.sort(key=lambda u: u.profile.persona_id)

    from .permissions import custom_roles, role_label
    custom = custom_roles()
    short = lambda role: role_label(role, custom).split(" - ")[0].strip()
    out, seen = [], set()
    row = lambda u: {"username": u.username,
                     "label": f"{u.profile.persona.name} · {short(u.profile.persona.role)}",
                     "role": u.profile.persona.role}

    def walk(manager_id):
        for u in reports.get(manager_id, []):
            pid = u.profile.persona_id
            # Reporting lines are editable (team.org), so a cycle is reachable
            # from the console. Guard it: a sign-in page that hangs is worse
            # than one that lists somebody in the wrong place.
            if pid in seen:
                continue
            seen.add(pid)
            out.append(row(u))
            walk(pid)

    walk(None)
    # anything the walk could not reach - an orphaned line, or one in a cycle -
    # still gets a door, just at the end
    for u in sorted(users, key=lambda u: u.profile.persona_id):
        if u.profile.persona_id not in seen:
            out.append(row(u))
    for u in (User.objects.filter(username__in=_demo_usernames(), profile__supplier__isnull=False, is_active=True)
              .exclude(is_superuser=True)
              .select_related("profile__supplier").order_by("profile__supplier__id")):
        s = u.profile.supplier
        out.append({"username": u.username, "label": f"{s.name} · Bidder", "role": "supplier"})
    return out


@csrf_exempt
def auth_config(request):
    from .setup_views import needs_setup
    from .views import landing_design, org_settings, studio_accent
    return JsonResponse({
        "demoLogin": settings.DEMO_LOGIN,
        "accounts": _demo_accounts() if settings.DEMO_LOGIN else [],
        # an empty workspace sends the sign-in page to the setup wizard instead
        "needsSetup": needs_setup(),
        # Where a visitor goes to start a workspace of their own. DOCKET is
        # single-tenant, so on the demo deployment that is NOT this server -
        # running setup here would rename the demo org and hand the newcomer the
        # demo's tenders. Set SIGNUP_URL on the demo to the real deployment's
        # address; leave it unset everywhere else and the local wizard is used.
        "signupUrl": settings.SIGNUP_URL,
        # Where "see the demo" goes. The landing page only offers it when this
        # is set, so a deployment with no demo beside it simply does not mention
        # one rather than linking somewhere that does not exist.
        "demoUrl": settings.DEMO_URL,
        "orgName": org_settings()["name"],
        # Which of the four front-page designs this deployment wears. Served
        # here rather than from a settings endpoint because the landing page is
        # read by people who are not signed in and never will be, and this is
        # the one call it already makes before first paint.
        "landing": landing_design(),
        # Rides with the design because the page needs both before first paint,
        # and a second round trip for ten colour tokens would show the visitor
        # the default accent and then repaint it.
        "accent": studio_accent(),
        # Where "Contact us" and "Request a demonstration" write to, when the
        # setup wizard is not on offer to a stranger.
        "contactEmail": _contact_email(org_settings()),
    })


def _contact_email(org):
    """The company's reply-to mailbox, else the procurement email on its
    profile, else the sending address unless it is a no-reply one."""
    from email.utils import parseaddr
    for cand in list(settings.EMAIL_REPLY_TO) + [
            ((org.get("profile") or {}).get("email") or ""),
            parseaddr(settings.DEFAULT_FROM_EMAIL or "")[1]]:
        cand = str(cand).strip()
        if "@" in cand and "no-reply" not in cand and "noreply" not in cand \
                and not cand.endswith(".local"):
            return cand
    return ""


@csrf_exempt
def login(request):
    if request.method != "POST":
        return _err("Method not allowed", 405)
    body = _body(request)
    username = str(body.get("username", "")).strip().lower()
    if _locked(username):
        return _err("Too many failed attempts - this account is locked for 15 minutes.", 429)
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
            return _err("That code isn't right - check your authenticator app.", 401)
    FailedLogin.objects.filter(username=username).delete()
    bidder = body.get("asBidder") is True
    if bidder and not prof.supplier_id:
        return _err("This account has no bidder invitation yet. Open the invitation link first.", 403)
    return JsonResponse(_issue(user, bidder=bidder))


@csrf_exempt
def demo_login(request):
    if request.method != "POST":
        return _err("Method not allowed", 405)
    if not settings.DEMO_LOGIN:
        return _err("Demo logins are disabled on this deployment.", 403)
    body = _body(request)
    if str(body.get("username", "")).strip().lower() not in _demo_usernames():
        return _err("Unknown demo account.", 404)
    user = (User.objects.filter(username=str(body.get("username", "")).strip().lower(),
                                profile__isnull=False, is_active=True)
            .exclude(is_superuser=True).first())
    if not user or (not user.profile.persona_id and not user.profile.supplier_id):
        return _err("Unknown demo account.", 404)
    bidder = body.get("asBidder") is True
    if bidder and not user.profile.supplier_id:
        return _err("This account has no bidder invitation.", 403)
    return JsonResponse(_issue(user, bidder=bidder))


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
        return _err("Two-factor is already enabled - disable it first to re-enroll.", 409)
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
        return _err("That code isn't right - scan the QR again and retry.")
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


@csrf_exempt
def change_password(request):
    """Change your own password while signed in. The current one is asked for
    first, so a session left open on a shared desk cannot be used to take the
    account over. Every other session is signed out; this one stays."""
    if request.method != "POST":
        return _err("Method not allowed", 405)
    user = _current_user(request)
    if not user:
        return _err("Not signed in.", 401)
    body = _body(request)
    current, new = str(body.get("current", "")), str(body.get("password", ""))
    if _locked(user.username):
        return _err("Too many failed attempts - try again in 15 minutes.", 429)
    if not user.check_password(current):
        _fail(user.username)
        return _err("Your current password is not right.", 400)
    if len(new) < 8:
        return _err("The new password must be at least 8 characters.")
    if new == current:
        return _err("The new password is the same as the current one.")
    user.set_password(new)
    user.save()
    key = request.headers.get("Authorization", "")[7:]
    n = user.tokens.exclude(key=key).count()
    user.tokens.exclude(key=key).delete()
    ident = user.profile.identity
    record_event(actor=ident["name"], role=ident["role"], action="Password changed",
                 detail=f"Changed while signed in; {n} other session(s) signed out.")
    return JsonResponse({"ok": True, "revoked": n})
