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
from .notify import notify_perm
from .util import now_ms, record_event, rid

TOKEN_TTL_MS = 3 * 24 * 60 * 60 * 1000  # 3 days
# A registration drive is a slower thing than a password reset. The mail sits in
# a shared info@ mailbox, somebody forwards it to whoever handles tenders, and
# that person gets to it the following week. Three days would expire most of the
# register before it was read.
CAMPAIGN_TTL_MS = 60 * 24 * 60 * 60 * 1000  # 60 days
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
    notify_perm("supplier.prequalify", f"New vendor registration: {sup.name}",
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
def claim_vendor(request):
    """Finish registration against a vendor record that already exists.

    This is the other half of the registration drive. Without it, a vendor
    invited off the imported register would arrive at the ordinary sign-up form
    and create a *second* record for a company already on the register — and at
    the scale a drive operates on, that is not an edge case, it is 1,300 of
    them. The emailed token names the supplier it was minted for, so the account
    attaches to the row the buyer already has: same id, same NAV code, same
    history, same category.

    GET  resolves a token to what the register already knows, so the form can
         show the vendor who they are registering as before they type anything.
    POST sets the password and creates the login.

    The token is single-use and carries the supplier id itself, so possession of
    a link cannot be turned into a claim on a different company by editing a
    form field: `supplierId` is read from the token, never from the body.
    """
    token = str(request.GET.get("token") or _body(request).get("token", ""))
    t = ActionToken.objects.filter(pk=token, kind="vendor_claim",
                                   used_at__isnull=True).first()
    if not t or now_ms() - t.created > CAMPAIGN_TTL_MS:
        return _err("This link is invalid or has expired. Ask your buyer contact "
                    "to send a new invitation.", 410)
    sup = Supplier.objects.filter(pk=t.payload.get("supplierId")).first()
    if not sup:
        return _err("The vendor record this link points at no longer exists.", 410)

    if request.method == "GET":
        return JsonResponse({"supplier": {
            "name": sup.name, "code": sup.code, "category": sup.category,
            "subcategory": sup.subcategory, "location": sup.location,
            "email": sup.contact_email, "contactPerson": sup.contact_person,
        }})
    if request.method != "POST":
        return _err("Method not allowed", 405)

    b = _body(request)
    pw = str(b.get("password", ""))
    if len(pw) < 8:
        return _err("Password must be at least 8 characters.")
    email = (sup.contact_email or t.email or "").strip().lower()
    if not EMAIL_RE.match(email):
        return _err("The register holds no usable email address for this company.")
    if User.objects.filter(username=email).exists():
        return _err("An account with this email already exists. Sign in instead, "
                    "or use the password-reset link.", 409)
    if Profile.objects.filter(supplier=sup).exists():
        return _err("This company already has an account.", 409)

    # Only now is the token spent: a validation failure above must not burn the
    # vendor's one link and leave them unable to try again.
    t.used_at = now_ms()
    t.save(update_fields=["used_at"])

    user = User.objects.create_user(username=email, email=email, password=None)
    user.set_password(pw)
    user.save()
    Profile.objects.create(user=user, supplier=sup)
    # `registered_at` is when they actually claimed the account. The import may
    # have set it from the register's own NAV date; this is the truer fact.
    Supplier.objects.filter(pk=sup.id).update(registered_at=now_ms())
    record_event(actor=sup.name, role="supplier", action="Vendor claimed register account",
                 detail="Registered from a registration-drive invitation against an "
                        "existing register record.")
    notify_perm("supplier.prequalify", f"Vendor registered: {sup.name}",
                f"{sup.name} completed registration from the register drive. They are on "
                f"the register already; prequalification is what is still outstanding.")
    return JsonResponse({"ok": True})


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
