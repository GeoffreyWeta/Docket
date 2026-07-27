"""Self-service accounts: vendor registration + email verification, vendor and
team invitations, password reset. All links are single-use tokens delivered by
email; in demo mode (DEMO_LOGIN=1) vendor verification is skipped so the flow
can be exercised without a mailbox."""
import json
import re
import secrets

from django.conf import settings
from django.contrib.auth.models import User
from django.core.mail import send_mail
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

from .models import ActionToken, Persona, Profile, Supplier
from .notify import notify_role
from .util import now_ms, record_event, rid

TOKEN_TTL_MS = 3 * 24 * 60 * 60 * 1000  # 3 days
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _err(msg, status=400):
    return JsonResponse({"error": msg}, status=status)


def _body(request):
    try:
        return json.loads(request.body) if request.body else {}
    except (ValueError, TypeError):
        return {}


def _mail(to, subject, body):
    try:
        send_mail(f"[DOCKET] {subject}", body, settings.DEFAULT_FROM_EMAIL, [to], fail_silently=False)
    except Exception:
        pass  # console/misconfigured SMTP must never break the flow


def _mint(kind, email, payload):
    return ActionToken.objects.create(token=secrets.token_urlsafe(32), kind=kind,
                                      email=email, payload=payload, created=now_ms())


def _take(token, kind):
    t = ActionToken.objects.filter(pk=token, kind=kind, used_at__isnull=True).first()
    if not t or now_ms() - t.created > TOKEN_TTL_MS:
        return None
    t.used_at = now_ms()
    t.save(update_fields=["used_at"])
    return t


def _link(request, param, token):
    base = request.build_absolute_uri("/").rstrip("/")
    return f"{base}/?{param}={token}"


def _finish_vendor(payload):
    """Create the supplier + login once identity is trusted (verified or invited)."""
    email = payload["email"]
    if User.objects.filter(username=email).exists():
        return None, "An account with this email already exists."
    sup = Supplier.objects.create(
        id=rid("s"), name=payload["company"][:120], category=payload.get("category", "General")[:60],
        location=payload.get("location", "")[:60] or "—", prequalified=False,
        contact_email=email, registered_at=now_ms(), docs=[], perf={},
    )
    user = User.objects.create_user(username=email, email=email, password=None)
    user.set_password(payload["_pw"])
    user.save()
    Profile.objects.create(user=user, supplier=sup)
    record_event(actor=sup.name, role="supplier", action="Vendor registered",
                 detail="Self-service registration completed; awaiting prequalification review.")
    notify_role("procurement", f"New vendor registration: {sup.name}",
                "A vendor completed registration. Review their compliance documents and "
                "prequalify (or decline) them from the Suppliers page.")
    return sup, None


@csrf_exempt
def register_vendor(request):
    if request.method != "POST":
        return _err("Method not allowed", 405)
    b = _body(request)
    email = str(b.get("email", "")).strip().lower()
    company = str(b.get("company", "")).strip()
    pw = str(b.get("password", ""))
    if not EMAIL_RE.match(email):
        return _err("Enter a valid email address.")
    if len(company) < 2:
        return _err("Enter your registered company name.")
    if len(pw) < 8:
        return _err("Password must be at least 8 characters.")
    if User.objects.filter(username=email).exists():
        return _err("An account with this email already exists.", 409)
    payload = {"email": email, "company": company, "_pw": pw,
               "category": str(b.get("category", "")).strip() or "General",
               "location": str(b.get("location", "")).strip()}
    if settings.DEMO_LOGIN:  # demo: skip the mailbox round-trip
        sup, msg = _finish_vendor(payload)
        if msg:
            return _err(msg, 409)
        return JsonResponse({"verified": True})
    tok = _mint("vendor_verify", email, payload)
    _mail(email, "Confirm your DOCKET registration",
          f"Confirm your email to finish registering {company}:\n\n{_link(request, 'vtoken', tok.token)}\n\n"
          "The link is valid for 3 days.")
    return JsonResponse({"verified": False})


@csrf_exempt
def verify_vendor(request):
    if request.method != "POST":
        return _err("Method not allowed", 405)
    t = _take(str(_body(request).get("token", "")), "vendor_verify")
    if not t:
        return _err("This link is invalid or has expired.", 410)
    sup, msg = _finish_vendor(t.payload)
    if msg:
        return _err(msg, 409)
    return JsonResponse({"ok": True})


@csrf_exempt
def accept_invite(request):
    """Team invites: set your name + password and you're in with the assigned role."""
    if request.method != "POST":
        return _err("Method not allowed", 405)
    b = _body(request)
    token, pw = str(b.get("token", "")), str(b.get("password", ""))
    if len(pw) < 8:
        return _err("Password must be at least 8 characters.")
    t = _take(token, "team_invite")
    if not t:
        return _err("This invitation is invalid or has expired.", 410)
    if User.objects.filter(username=t.email).exists():
        return _err("An account with this email already exists.", 409)
    name = str(b.get("name", "")).strip() or t.payload.get("name") or t.email.split("@")[0].title()
    persona = Persona.objects.create(id=rid("u"), name=name[:120],
                                     role=t.payload["role"], title=t.payload.get("title", "")[:120] or t.payload["role"].title())
    user = User.objects.create_user(username=t.email, email=t.email, password=None)
    user.set_password(pw)
    user.save()
    Profile.objects.create(user=user, persona=persona)
    record_event(actor=name, role=t.payload["role"], action="Team member joined",
                 detail=f"Accepted an invitation as {t.payload['role']}.")
    return JsonResponse({"ok": True})


@csrf_exempt
def forgot_password(request):
    if request.method != "POST":
        return _err("Method not allowed", 405)
    email = str(_body(request).get("email", "")).strip().lower()
    user = User.objects.filter(username=email).first()
    if user:  # deliberately identical response either way — no account enumeration
        tok = _mint("reset", email, {})
        _mail(email, "Reset your DOCKET password",
              f"Reset your password here:\n\n{_link(request, 'rtoken', tok.token)}\n\n"
              "If you didn't ask for this, ignore this email.")
    return JsonResponse({"ok": True})


@csrf_exempt
def reset_password(request):
    if request.method != "POST":
        return _err("Method not allowed", 405)
    b = _body(request)
    pw = str(b.get("password", ""))
    if len(pw) < 8:
        return _err("Password must be at least 8 characters.")
    t = _take(str(b.get("token", "")), "reset")
    if not t:
        return _err("This link is invalid or has expired.", 410)
    user = User.objects.filter(username=t.email).first()
    if not user:
        return _err("Account no longer exists.", 410)
    user.set_password(pw)
    user.save()
    user.tokens.all().delete()  # revoke every session
    return JsonResponse({"ok": True})
