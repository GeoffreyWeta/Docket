"""Self-service accounts: vendor registration + email verification, vendor and
team invitations, password reset. All links are single-use tokens delivered by
email; in demo mode (DEMO_LOGIN=1) vendor verification is skipped so the flow
can be exercised without a mailbox."""
import json
import logging
import re
import secrets

from django.conf import settings
from django.contrib.auth.models import User
from django.core.mail import EmailMessage
from django.db import transaction
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

from . import vocab
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
    """Send one message. True when it went, False when it did not. A broken
    mail setup must never break the flow that called it, but the caller has to
    know, so it can tell the person who pressed the button."""
    try:
        EmailMessage(f"[DOCKET] {subject}", body, settings.DEFAULT_FROM_EMAIL, [to],
                     reply_to=settings.EMAIL_REPLY_TO).send(fail_silently=False)
        return True
    except Exception:
        logging.getLogger("docket.mail").exception("Could not send %r to %s", subject, to)
        return False


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


def _placed(clean, value, fallback):
    """`clean(value)`, or `fallback` when the value cannot be placed. For a
    payload validated in an earlier release: the vendor has already clicked
    their link, and an account lost to a spelling rule helps nobody."""
    try:
        return clean(value) or fallback
    except vocab.Refused:
        return fallback


def _unclaimed_record(email):
    """The vendor-list row already holding this address that nobody has
    claimed, if there is one. Registering again would make a second record of
    the same company; the claim link attaches the login to the first."""
    for sup in Supplier.objects.filter(contact_email__iexact=email).order_by("id"):
        if not Profile.objects.filter(supplier=sup).exists():
            return sup
    return None


def _send_claim_link(request, sup, email):
    tok = (ActionToken.objects
           .filter(kind="vendor_claim", used_at__isnull=True,
                   created__gt=now_ms() - CAMPAIGN_TTL_MS, payload__supplierId=sup.id)
           .order_by("-created").first()) or _mint("vendor_claim", email, {"supplierId": sup.id})
    return _mail(email, "Your company is already on the vendor list",
                 f"{sup.name} is already on the vendor list, so there is no need to register again. "
                 f"Set a password with this link to claim the account and sign in:\n\n"
                 f"{_link(request, 'register', tok.token)}\n\n"
                 f"If you did not ask for this, you can ignore this email.")


def _finish_vendor(payload, request=None):
    """Create the supplier + login once identity is trusted (verified or invited)."""
    email = payload["email"]
    if User.objects.filter(username=email).exists():
        return None, "An account with this email already exists."
    # Imported onto the vendor list after this registration was started: send
    # the claim link rather than a second record of the same company.
    existing = _unclaimed_record(email) if request is not None else None
    if existing:
        _send_claim_link(request, existing, email)
        return None, ("Your company is already on the vendor list. We have emailed you a link "
                      "to claim it. Check your email.")
    sup = Supplier.objects.create(
        id=rid("s"), name=payload["company"][:120],
        # A token minted before the dropdowns carries whatever was typed, so
        # it is placed here too rather than trusted.
        category=_placed(vocab.category, payload.get("category"), "Uncategorised"),
        location=_placed(vocab.location, payload.get("location"), "-"), prequalified=False,
        contact_email=email, registered_at=now_ms(), docs=[], perf={},
        source=payload.get("_source", "self"),
        contact_person=payload.get("contactPerson", "")[:140],
        phone=_placed(vocab.phone, payload.get("phone"), ""),
        address=payload.get("address", "")[:300],
    )
    user = User.objects.create_user(username=email, email=email, password=None)
    user.set_password(payload["_pw"])
    user.save()
    Profile.objects.create(user=user, supplier=sup)
    record_event(actor=sup.name, role="supplier", action="Vendor registered",
                 detail="Self-service registration completed; awaiting prequalification review.")
    # The vendor hears from us first. A registration that produces silence is a
    # registration the company assumes failed, and they register again.
    _mail(email, "Registration received",
          f"Thank you for registering {sup.name}.\n\n"
          f"Your company is on the register and you can sign in now. You are not yet verified: "
          f"a buyer reviews your compliance documents and you will be told the outcome. "
          f"Being unverified does not stop you being invited to bid.\n\n"
          f"Upload your compliance documents from your company profile to speed the review up.")
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
    # Already on the vendor list (imported, or added by a buyer) and not yet
    # claimed: the claim link goes to that address, and no second record is made.
    # The reply does not say which company, only to check the mailbox.
    existing = _unclaimed_record(email)
    if existing:
        _send_claim_link(request, existing, email)
        return JsonResponse({"verified": False, "claim": True})
    try:
        category = vocab.category(b.get("category"))
        location = vocab.location(b.get("location"))
    except vocab.Refused as e:
        return _err(str(e))
    payload = {"email": email, "company": company, "_pw": pw,
               "category": category, "location": location}
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
@transaction.atomic
def claim_vendor(request):
    """Finish registration against a vendor record that already exists.

    This is the other half of the registration drive. Without it, a vendor
    invited off the imported register would arrive at the ordinary sign-up form
    and create a *second* record for a company already on the register - and at
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
    t = ActionToken.objects.select_for_update().filter(pk=token, kind="vendor_claim",
                                   used_at__isnull=True).first()
    if not t or now_ms() - t.created > CAMPAIGN_TTL_MS:
        return _err("This link is invalid or has expired. Ask your buyer contact "
                    "to send a new invitation.", 410)
    sup = Supplier.objects.select_for_update().filter(pk=t.payload.get("supplierId")).first()
    if not sup:
        return _err("The vendor record this link points at no longer exists.", 410)

    if request.method == "GET":
        return JsonResponse({"supplier": {
            "existingAccount": User.objects.filter(username=(sup.contact_email or t.email).strip().lower()).exists(),
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
    existing = User.objects.filter(username=email).select_related("profile").first()
    if existing:
        from .auth_views import _locked, _fail
        if _locked(email):
            return _err("Too many failed attempts. Try again in 15 minutes.", 429)
        if not existing.is_active or not existing.check_password(pw):
            _fail(email)
            return _err("Enter your existing DOCKET password to join as a bidder.", 401)
        if not hasattr(existing, "profile") or existing.profile.supplier_id:
            return _err("This account already has a bidder identity, or cannot join this event.", 409)
    if Profile.objects.filter(supplier=sup).exists():
        return _err("This company already has an account.", 409)

    # Only now is the token spent: a validation failure above must not burn the
    # vendor's one link and leave them unable to try again.
    t.used_at = now_ms()
    t.save(update_fields=["used_at"])

    if existing:
        user = existing
        user.profile.supplier = sup
        user.profile.save(update_fields=["supplier"])
    else:
        user = User.objects.create_user(username=email, email=email, password=None)
        user.set_password(pw)
        user.save()
        Profile.objects.create(user=user, supplier=sup)
    # `registered_at` is when they actually claimed the account. The import may
    # have set it from the register's own NAV date; this is the truer fact.
    Supplier.objects.filter(pk=sup.id).update(registered_at=now_ms(),
                                              source=sup.source or "invite")
    _mail(email, "Registration complete",
          f"Your account for {sup.name} is active and you can sign in now.\n\n"
          f"You were already on the register; verification is what is still outstanding, "
          f"and it does not stop you being invited to bid.")
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
    sup, msg = _finish_vendor(t.payload, request)
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

    # The setup wizard draws the whole org chart before anybody accepts, so the
    # invitation may already name a person: reporting line, job title, signing
    # authority and all. Attaching the login to that persona is what keeps the
    # chart intact - creating a second one would leave a manager reporting to a
    # ghost and an approval level held by nobody. A persona that has already
    # been claimed is not reused, because that would be two logins for one
    # person on the chart.
    persona = None
    pid = t.payload.get("personaId")
    if pid:
        persona = Persona.objects.filter(pk=pid, profile__isnull=True).first()
    if persona:
        if name and name != persona.name:
            persona.name = name[:120]
            persona.save(update_fields=["name"])
        name = persona.name
    else:
        persona = Persona.objects.create(
            id=rid("u"), name=name[:120], role=t.payload["role"],
            title=t.payload.get("title", "")[:120] or t.payload["role"].title())

    user = User.objects.create_user(username=t.email, email=t.email, password=None)
    user.set_password(pw)
    user.save()
    Profile.objects.create(user=user, persona=persona)
    manager = persona.manager.name if persona.manager_id else None
    record_event(actor=name, role=persona.role, action="Team member joined",
                 detail=f"Accepted an invitation as {persona.role}"
                        + (f", reporting to {manager}." if manager else "."))
    # Signed straight in, the same token the sign-in form would have issued:
    # they have just chosen the password, asking for it again proves nothing.
    from .auth_views import _issue
    return JsonResponse({"ok": True, **_issue(user)})


@csrf_exempt
def invite_info(request):
    """What an invitation link is for, read before the form is shown and
    without using the link up: the company, the role, who sent it and to
    which address. Says plainly when the link has expired or was already used."""
    from .permissions import role_label
    from .views import org_name
    token = str(request.GET.get("token", "") or _body(request).get("token", ""))
    t = ActionToken.objects.filter(pk=token, kind="team_invite").first() if token else None
    if not t:
        return JsonResponse({"state": "invalid"})
    out = {"company": org_name(), "email": t.email,
           "role": role_label(t.payload.get("role", "")).split(" - ")[0].strip(),
           "name": t.payload.get("name", ""), "invitedBy": t.payload.get("invitedBy", "")}
    if User.objects.filter(username=t.email).exists():
        out["state"] = "used"
    elif t.used_at or now_ms() - t.created > TOKEN_TTL_MS:
        # used without an account means it was withdrawn or replaced by a resend
        out["state"] = "expired"
    else:
        out["state"] = "ok"
    return JsonResponse(out)


@csrf_exempt
def forgot_password(request):
    if request.method != "POST":
        return _err("Method not allowed", 405)
    email = str(_body(request).get("email", "")).strip().lower()
    user = User.objects.filter(username=email).first()
    # A switched-off account would only reach "Wrong username or password"
    # after resetting, so it is not sent a link. The response stays identical
    # either way - no account enumeration.
    if user and user.is_active:
        tok = _mint("reset", email, {})
        _mail(email, "Reset your DOCKET password",
              f"Reset your password here:\n\n{_link(request, 'rtoken', tok.token)}\n\n"
              "If you didn't ask for this, ignore this email.")
    return JsonResponse({"ok": True})


@csrf_exempt
@transaction.atomic
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
    if hasattr(user, "profile") and user.profile.must_change_password and user.check_password(pw):
        transaction.set_rollback(True)
        return _err("Choose a different password from the temporary password.")
    user.set_password(pw)
    user.save()
    if hasattr(user, "profile"):
        user.profile.must_change_password = False
        user.profile.save(update_fields=["must_change_password"])
    user.tokens.all().delete()  # revoke every session
    return JsonResponse({"ok": True})
