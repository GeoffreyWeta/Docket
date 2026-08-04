"""The administration console API — the accounts-and-capabilities plane.

It is deliberately its own surface, reachable only with a superuser account:

  * the sign-in endpoint answers "Wrong username or password." to a *correct*
    password on a non-administrator account, so the console cannot be used to
    discover which accounts are administrators;
  * it shares the brute-force lockout and the TOTP requirement with the main
    sign-in, so hiding the door is not the only thing protecting it;
  * nothing in the tendering UI links here and the console never appears in the
    demo account list, but everything done here lands in AdminAudit, and the
    changes that alter who can do what are mirrored into the main audit chain.

An administrator with no persona takes no part in tendering: they cannot bid,
score, publish or award, because they have no domain identity to do it with.
Granting an existing team member the administrator flag keeps their persona and
adds the console.
"""
import json
import re
import secrets

from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.db import transaction
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

from .models import AccessRole, AdminAudit, AuthToken, FailedLogin, Persona, Profile
from .permissions import (ADMIN_ROLE, ALL_KEYS, BUYER_ROLES, CATALOGUE,
                          CUSTOM_GRANTABLE, GROUPS, RESERVED_ROLE_KEYS,
                          SUPPLIER_ROLE, assignable_roles, custom_roles,
                          defaults_for, grantable_for, resolve, role_label)
from .util import now_ms, record_event, rid

LOCKOUT_ATTEMPTS = 5
LOCKOUT_WINDOW_MS = 15 * 60 * 1000
MIN_PASSWORD = 10          # the console holds the keys: longer than the app's 8
ROLE_KEY_RE = re.compile(r"^[a-z][a-z0-9_-]{1,19}$")
PERM_LABELS = {p["key"]: p["label"] for p in CATALOGUE}


def _err(msg, status=400):
    return JsonResponse({"error": msg}, status=status)


def _body(request):
    try:
        return json.loads(request.body) if request.body else {}
    except (ValueError, TypeError):
        return {}


def _ip(request):
    fwd = request.headers.get("X-Forwarded-For", "")
    return (fwd.split(",")[0].strip() if fwd else request.META.get("REMOTE_ADDR", ""))[:64]


def _names(keys):
    return ", ".join(PERM_LABELS.get(k, k) for k in keys)


# ---------------- authentication ----------------

def _locked(username):
    since = now_ms() - LOCKOUT_WINDOW_MS
    FailedLogin.objects.filter(at__lt=since).delete()
    return FailedLogin.objects.filter(username=username, at__gte=since).count() >= LOCKOUT_ATTEMPTS


def current_admin(request):
    """The signed-in administrator, or None. Authority is is_superuser — never
    a URL, a header or a client-side flag."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    tok = AuthToken.objects.select_related("user").filter(key=auth[7:]).first()
    if not tok or not tok.user.is_active or not tok.user.is_superuser:
        return None
    if now_ms() - tok.last_used > 60_000:
        tok.last_used = now_ms()
        tok.save(update_fields=["last_used"])
    return tok.user


def _log(request, admin, action, target="", detail="", mirror=False):
    """Console ledger, plus the main audit chain for anything that changes what
    a person is able to do."""
    AdminAudit.objects.create(id=rid("a"), at=now_ms(), actor=admin.username, action=action,
                              target=target[:200], detail=detail, ip=_ip(request))
    if mirror:
        record_event(actor=admin.get_full_name() or admin.username, role="administrator",
                     action=action, detail=(f"{target} — " if target else "") + detail)


def guard(methods):
    """Method check + administrator check + JSON body, for every console view."""
    def deco(fn):
        @csrf_exempt
        def wrap(request, *args, **kwargs):
            if request.method not in methods:
                return _err("Method not allowed", 405)
            admin = current_admin(request)
            if not admin:
                return _err("Administrator sign-in required.", 401)
            return fn(request, admin, _body(request), *args, **kwargs)
        return wrap
    return deco


@csrf_exempt
def admin_login(request):
    if request.method != "POST":
        return _err("Method not allowed", 405)
    b = _body(request)
    username = str(b.get("username", "")).strip().lower()
    if _locked(username):
        return _err("Too many failed attempts — this account is locked for 15 minutes.", 429)
    user = authenticate(username=username, password=str(b.get("password", "")))
    # A correct password on a non-administrator account gets the same answer as
    # a wrong one: this endpoint must not identify who the administrators are.
    if not user or not user.is_superuser:
        FailedLogin.objects.create(username=username, at=now_ms())
        return _err("Wrong username or password.", 401)
    prof = getattr(user, "profile", None)
    if prof and prof.totp_confirmed:
        import pyotp
        code = str(b.get("code", "")).strip()
        if not code:
            return JsonResponse({"mfaRequired": True,
                                 "error": "Enter the 6-digit code from your authenticator app."}, status=401)
        if not pyotp.TOTP(prof.totp_secret).verify(code, valid_window=1):
            FailedLogin.objects.create(username=username, at=now_ms())
            return _err("That code isn't right — check your authenticator app.", 401)
    FailedLogin.objects.filter(username=username).delete()
    tok = AuthToken.objects.create(key=secrets.token_hex(32), user=user, created=now_ms())
    _log(request, user, "Administrator signed in")
    return JsonResponse({"token": tok.key, "admin": _admin_view(user)})


@csrf_exempt
def admin_logout(request):
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        AuthToken.objects.filter(key=auth[7:]).delete()
    return JsonResponse({"ok": True})


def _admin_view(user):
    prof = getattr(user, "profile", None)
    return {"username": user.username, "name": user.get_full_name() or user.username,
            "email": user.email, "mfa": bool(prof and prof.totp_confirmed),
            "userId": user.id}


# ---------------- state ----------------

def _user_view(u, custom=None):
    custom = custom_roles() if custom is None else custom
    prof = getattr(u, "profile", None)
    persona = prof.persona if prof else None
    supplier = prof.supplier if prof else None
    if persona:
        role, name, title = persona.role, persona.name, persona.title
    elif supplier:
        role, name, title = SUPPLIER_ROLE, supplier.name, "Supplier"
    else:
        role, name, title = ADMIN_ROLE, (u.get_full_name() or u.username), "System administrator"
    extra = list((prof.perm_extra if prof else []) or [])
    revoked = list((prof.perm_revoked if prof else []) or [])
    toks = list(u.tokens.all())
    return {
        "id": u.id, "username": u.username, "email": u.email, "name": name, "title": title,
        "role": role, "roleLabel": role_label(role, custom),
        "customRole": role in custom,
        "isAdmin": u.is_superuser, "active": u.is_active,
        "mfa": bool(prof and prof.totp_confirmed),
        "supplierId": supplier.id if supplier else None,
        "personaId": persona.id if persona else None,
        "joined": int(u.date_joined.timestamp() * 1000),
        "lastSeen": max([t.last_used or t.created for t in toks], default=0),
        "sessions": len(toks),
        "defaults": sorted(defaults_for(role, custom)),
        "grantable": sorted(grantable_for(role)),
        "extra": sorted(set(extra) & ALL_KEYS),
        "revoked": sorted(set(revoked) & ALL_KEYS),
        "perms": sorted(resolve(role, extra, revoked, superadmin=u.is_superuser, custom=custom)),
    }


def _role_view(r, counts):
    return {"key": r["key"], "label": r["label"], "title": r.get("title", ""),
            "note": r.get("note", ""), "builtin": r["builtin"],
            "perms": sorted(r["perms"]), "people": counts.get(r["key"], 0),
            "created": r.get("created", 0), "createdBy": r.get("createdBy", "")}


@guard(["GET"])
def admin_state(request, admin, body):
    custom = custom_roles()
    users = (User.objects
             .select_related("profile__persona", "profile__supplier")
             .prefetch_related("tokens")
             .order_by("-is_superuser", "profile__supplier_id", "username"))
    rows = [_user_view(u, custom) for u in users]
    counts = {}
    for r in rows:
        counts[r["role"]] = counts.get(r["role"], 0) + 1
    return JsonResponse({
        "admin": _admin_view(admin),
        "catalogue": {
            "groups": [{"id": g, "title": t, "blurb": b} for g, t, b in GROUPS],
            "permissions": CATALOGUE,
            "customGrantable": sorted(CUSTOM_GRANTABLE),
        },
        "roles": [_role_view(r, counts) for r in assignable_roles(custom)],
        "users": rows,
        "counts": {
            "total": len(rows),
            "admins": sum(1 for r in rows if r["isAdmin"]),
            "team": sum(1 for r in rows if r["role"] not in (SUPPLIER_ROLE, ADMIN_ROLE)),
            "suppliers": sum(1 for r in rows if r["role"] == SUPPLIER_ROLE),
            "disabled": sum(1 for r in rows if not r["active"]),
            "customised": sum(1 for r in rows if r["extra"] or r["revoked"]),
            "customRoles": len(custom),
        },
        "demoLogin": settings.DEMO_LOGIN,
    })


@guard(["GET"])
def admin_log(request, admin, body):
    rows = [{"id": a.id, "at": a.at, "actor": a.actor, "action": a.action,
             "target": a.target, "detail": a.detail, "ip": a.ip}
            for a in AdminAudit.objects.all()[:300]]
    return JsonResponse({"entries": rows})


# ---------------- roles ----------------

def _slug(label):
    s = re.sub(r"[^a-z0-9]+", "-", label.lower()).strip("-")
    return s[:20].rstrip("-") or "role"


@guard(["POST"])
def admin_create_role(request, admin, body):
    """Invent a role — "CEO", "Legal", "Board observer" — and hand it a set of
    capabilities out of the catalogue."""
    label = str(body.get("label", "")).strip()
    if len(label) < 2:
        return _err("Give the role a name.")
    key = str(body.get("key", "")).strip().lower() or _slug(label)
    if not ROLE_KEY_RE.match(key):
        return _err("The role's id must start with a letter and use only letters, numbers, - or _ (2–20 characters).")
    if key in RESERVED_ROLE_KEYS:
        return _err(f"“{key}” is a built-in role — choose another id.", 409)
    if AccessRole.objects.filter(pk=key).exists():
        return _err("A role with that id already exists.", 409)
    perms = sorted({str(k) for k in (body.get("perms") or [])} & CUSTOM_GRANTABLE)
    r = AccessRole.objects.create(
        key=key, label=label[:80], title=str(body.get("title", "")).strip()[:80] or label[:80],
        note=str(body.get("note", "")).strip()[:200], perms=perms,
        created=now_ms(), created_by=admin.username)
    _log(request, admin, "Role created", f"{r.label} ({r.key})",
         (f"Carries: {_names(perms)}." if perms else "Created with no capabilities yet."), mirror=True)
    return JsonResponse({"ok": True, "role": _role_view(custom_roles()[key], {})})


@guard(["POST", "PATCH"])
def admin_update_role(request, admin, body, key):
    r = AccessRole.objects.filter(pk=key).first()
    if not r:
        return _err("No such role — the built-in four cannot be edited.", 404)
    changes = []
    if "label" in body:
        label = str(body["label"]).strip()
        if len(label) < 2:
            return _err("Give the role a name.")
        if label != r.label:
            changes.append(f"renamed to {label}")
        r.label = label[:80]
    if "title" in body:
        r.title = str(body["title"]).strip()[:80]
    if "note" in body:
        r.note = str(body["note"]).strip()[:200]
    if "perms" in body:
        want = {str(k) for k in (body.get("perms") or [])} & CUSTOM_GRANTABLE
        was = set(r.perms or [])
        added, dropped = sorted(want - was), sorted(was - want)
        if added:
            changes.append("added " + _names(added))
        if dropped:
            changes.append("removed " + _names(dropped))
        r.perms = sorted(want)
    r.save()
    n = Profile.objects.filter(persona__role=key).count()
    if changes:
        _log(request, admin, "Role changed", f"{r.label} ({r.key})",
             "; ".join(changes).capitalize() + f". Applies to {n} account(s) on this role.", mirror=True)
    return JsonResponse({"ok": True, "role": _role_view(custom_roles()[key], {key: n})})


@guard(["POST", "DELETE"])
def admin_delete_role(request, admin, body, key):
    r = AccessRole.objects.filter(pk=key).first()
    if not r:
        return _err("No such role.", 404)
    n = Profile.objects.filter(persona__role=key).count()
    if n:
        return _err(f"{n} account(s) are on this role — move them to another role first.", 409)
    label = f"{r.label} ({r.key})"
    r.delete()
    _log(request, admin, "Role deleted", label, "No accounts were on it.", mirror=True)
    return JsonResponse({"ok": True})


# ---------------- people ----------------

def _target(uid):
    return (User.objects.select_related("profile__persona", "profile__supplier")
            .prefetch_related("tokens").filter(pk=uid).first())


def _label(u):
    v = _user_view(u)
    return f"{v['name']} ({u.username})"


def _assignable(custom):
    return {r["key"]: r for r in assignable_roles(custom)}


@guard(["POST"])
def admin_create_user(request, admin, body):
    """Create a team member or another administrator directly, password and all.
    Vendors are not created here — they register themselves and are prequalified
    in the workspace, which is the trail that makes a vendor legitimate."""
    from .account_views import EMAIL_RE
    custom = custom_roles()
    roles = _assignable(custom)
    username = str(body.get("username", "")).strip().lower()
    role = str(body.get("role", "")).strip()
    password = str(body.get("password", ""))
    name = str(body.get("name", "")).strip()
    make_admin = bool(body.get("isAdmin"))
    if not username or (not EMAIL_RE.match(username) and len(username) < 3):
        return _err("Enter a work email address (or a username of at least 3 characters).")
    if User.objects.filter(username=username).exists():
        return _err("That username already has an account.", 409)
    if len(password) < MIN_PASSWORD:
        return _err(f"Password must be at least {MIN_PASSWORD} characters.")
    if role == ADMIN_ROLE:
        make_admin = True
    elif role not in roles:
        return _err("Pick a role for this account.")
    if len(name) < 2:
        return _err("Enter the person's name.")
    with transaction.atomic():
        user = User.objects.create_user(username=username, email=str(body.get("email", "")).strip() or username)
        user.set_password(password)
        user.is_superuser = make_admin
        parts = name.split(None, 1)
        user.first_name, user.last_name = parts[0][:150], (parts[1][:150] if len(parts) > 1 else "")
        user.save()
        persona = None
        if role in roles:
            persona = Persona.objects.create(
                id=rid("u"), name=name[:120], role=role,
                title=str(body.get("title", "")).strip()[:80] or roles[role].get("title") or roles[role]["label"][:80])
        Profile.objects.create(user=user, persona=persona)
    _log(request, admin, "Account created", f"{name} ({username})",
         f"Created as {role_label(role, custom) if role in roles else 'administrator (console only)'}."
         + (" Administrator access granted." if make_admin else ""), mirror=True)
    return JsonResponse({"ok": True, "user": _user_view(_target(user.id), custom)})


@guard(["POST", "PATCH"])
def admin_update_user(request, admin, body, uid):
    """Identity and role. Changing a role keeps this person's individual
    deviations but re-resolves them against the new role's defaults, so the
    console shows honestly what carried over."""
    custom = custom_roles()
    roles = _assignable(custom)
    u = _target(uid)
    if not u:
        return _err("No such account.", 404)
    prof = getattr(u, "profile", None)
    changes = []

    if "name" in body:
        name = str(body["name"]).strip()
        if len(name) < 2:
            return _err("Enter the person's name.")
        parts = name.split(None, 1)
        u.first_name, u.last_name = parts[0][:150], (parts[1][:150] if len(parts) > 1 else "")
        if prof and prof.persona_id:
            prof.persona.name = name[:120]
            prof.persona.save(update_fields=["name"])
        changes.append(f"name set to {name}")
    if "email" in body:
        u.email = str(body["email"]).strip()[:254]
        changes.append("email updated")
    if "title" in body and prof and prof.persona_id:
        prof.persona.title = str(body["title"]).strip()[:80]
        prof.persona.save(update_fields=["title"])
        changes.append(f"title set to {prof.persona.title or '—'}")
    if "role" in body:
        role = str(body["role"]).strip()
        if role not in roles:
            return _err("Unknown role.")
        if not prof:
            return _err("This account has no profile to attach a role to.", 409)
        if prof.supplier_id:
            return _err("A vendor account cannot be given a buyer-side role.", 409)
        if prof.persona_id:
            was = prof.persona.role
            if was != role:
                prof.persona.role = role
                prof.persona.save(update_fields=["role"])
                changes.append(f"role changed from {role_label(was, custom)} to {role_label(role, custom)}")
        else:
            prof.persona = Persona.objects.create(
                id=rid("u"), name=(u.get_full_name() or u.username)[:120], role=role,
                title=str(body.get("title", "")).strip()[:80] or roles[role].get("title") or roles[role]["label"][:80])
            prof.save(update_fields=["persona"])
            changes.append(f"given the {role_label(role, custom)} role in the workspace")
    if "active" in body:
        active = bool(body["active"])
        if not active and u.id == admin.id:
            return _err("You cannot disable your own administrator account.", 409)
        if u.is_active != active:
            u.is_active = active
            if not active:
                u.tokens.all().delete()   # a disabled account is signed out everywhere, now
            changes.append("account enabled" if active else "account disabled and signed out")
    if "isAdmin" in body:
        want = bool(body["isAdmin"])
        if not want and u.id == admin.id:
            return _err("You cannot remove your own administrator access.", 409)
        if not want and u.is_superuser and User.objects.filter(is_superuser=True, is_active=True).count() <= 1:
            return _err("This is the last administrator — promote someone else first.", 409)
        if u.is_superuser != want:
            u.is_superuser = want
            changes.append("administrator access granted" if want else "administrator access removed")
    u.save()
    if not changes:
        return _err("Nothing to change.")
    _log(request, admin, "Account updated", _label(u), "; ".join(changes).capitalize() + ".", mirror=True)
    return JsonResponse({"ok": True, "user": _user_view(_target(uid), custom)})


@guard(["POST"])
def admin_set_perms(request, admin, body):
    """Replace one person's deviations from their role. The client sends the two
    lists whole, so a stale tab cannot silently re-grant something."""
    custom = custom_roles()
    uid = body.get("userId")
    u = _target(uid) if uid is not None else None
    if not u:
        return _err("No such account.", 404)
    prof = getattr(u, "profile", None)
    if not prof:
        return _err("This account has no profile to hold permissions.", 409)
    before = _user_view(u, custom)
    role = before["role"]
    if role == SUPPLIER_ROLE:
        return _err("Vendor accounts sit on the other side of the seal — they hold no buyer-side capabilities.", 409)
    grantable = grantable_for(role)
    base = defaults_for(role, custom)
    extra = {str(k) for k in (body.get("extra") or [])} & grantable
    revoked = {str(k) for k in (body.get("revoked") or [])} & ALL_KEYS
    extra -= base            # granting what the role already has is a no-op, not a grant
    revoked &= base | extra  # revoking what they never had is noise in the ledger
    extra -= revoked
    prof.perm_extra, prof.perm_revoked = sorted(extra), sorted(revoked)
    prof.save(update_fields=["perm_extra", "perm_revoked"])
    after = _user_view(_target(uid), custom)

    gained = sorted(set(after["perms"]) - set(before["perms"]))
    lost = sorted(set(before["perms"]) - set(after["perms"]))
    if not gained and not lost:
        return JsonResponse({"ok": True, "user": after})
    bits = []
    if gained:
        bits.append("granted " + _names(gained))
    if lost:
        bits.append("withdrew " + _names(lost))
    _log(request, admin, "Permissions changed", _label(u), "; ".join(bits) + ".", mirror=True)
    return JsonResponse({"ok": True, "user": after})


@guard(["POST"])
def admin_reset_password(request, admin, body, uid):
    u = _target(uid)
    if not u:
        return _err("No such account.", 404)
    pw = str(body.get("password", ""))
    if len(pw) < MIN_PASSWORD:
        return _err(f"Password must be at least {MIN_PASSWORD} characters.")
    u.set_password(pw)
    u.save(update_fields=["password"])
    revoked = u.tokens.count()
    u.tokens.all().delete()   # every existing session dies with the old password
    _log(request, admin, "Password reset", _label(u),
         f"Password set by an administrator; {revoked} session(s) revoked.")
    return JsonResponse({"ok": True, "revoked": revoked})


@guard(["POST", "DELETE"])
def admin_sessions(request, admin, body, uid):
    u = _target(uid)
    if not u:
        return _err("No such account.", 404)
    n = u.tokens.count()
    u.tokens.all().delete()
    _log(request, admin, "Sessions revoked", _label(u), f"{n} session(s) signed out.")
    return JsonResponse({"ok": True, "revoked": n})


@guard(["POST"])
def admin_reset_mfa(request, admin, body, uid):
    u = _target(uid)
    if not u:
        return _err("No such account.", 404)
    prof = getattr(u, "profile", None)
    if not prof or not prof.totp_confirmed:
        return _err("Two-factor is not enabled on that account.", 409)
    prof.totp_secret, prof.totp_confirmed = "", False
    prof.save(update_fields=["totp_secret", "totp_confirmed"])
    _log(request, admin, "Two-factor reset", _label(u),
         "Authenticator enrolment cleared — they can re-enrol from their own security panel.")
    return JsonResponse({"ok": True})


@guard(["POST", "DELETE"])
def admin_delete_user(request, admin, body, uid):
    u = _target(uid)
    if not u:
        return _err("No such account.", 404)
    if u.id == admin.id:
        return _err("You cannot delete the account you are signed in with.", 409)
    if u.is_superuser and User.objects.filter(is_superuser=True, is_active=True).count() <= 1:
        return _err("This is the last administrator — promote someone else first.", 409)
    prof = getattr(u, "profile", None)
    if prof and prof.supplier_id:
        # The vendor's register entry, bids and documents outlive their login:
        # deleting the account must not delete the tendering record.
        return _err("Vendor accounts are part of the tendering record. Disable the sign-in instead of deleting it.", 409)
    label = _label(u)
    u.delete()   # cascades the profile, its persona link, tokens and notifications
    _log(request, admin, "Account deleted", label,
         "Sign-in removed. Audit events already recorded under this name are unaffected.", mirror=True)
    return JsonResponse({"ok": True})
