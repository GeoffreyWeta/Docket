"""First-run setup: one person turns an empty workspace into a company with a
team, in a single sitting, without a console or a command line.

Three facts about the shape of this:

  IT IS GATED ON EMPTINESS, NOT ON A SECRET. The endpoint is open when the
  workspace has no active buyer accounts - there is nobody yet who could
  authorise anything - and closed the moment it has one. Reopening it means
  clearing the demo from the administration console (see seed.clear_demo),
  which is the one act that legitimately empties a workspace. In demo mode it
  stays open so the flow can be walked without wiping anything first; that
  creates a real account alongside the demo ones, which reset_demo removes.

  THE FIRST PERSON IS PROCUREMENT, PLUS THE THRESHOLD. Separation of duties is
  the product, so the owner is not made an approver: they can draft, invite
  and rename, and they get `settings.threshold` as a per-person grant so the
  wizard can set the sign-off rule. Awards and publication above that rule
  still need an approver, which is why the team step nudges them to invite one.

  IT ENDS SIGNED IN. The response carries a bearer token, so the person lands
  on their own dashboard rather than on a sign-in page asking for the
  password they typed thirty seconds ago."""
from django.conf import settings
from django.contrib.auth.models import User
from django.db import transaction
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

from .models import OrgSetting, Persona, Profile
from .permissions import BUYER_ROLES, role_label
from .util import record_event, rid


def _err(msg, status=400):
    return JsonResponse({"error": msg}, status=status)


def needs_setup():
    """True while nobody on the buyer side can sign in."""
    return not User.objects.filter(profile__persona__isnull=False, is_active=True).exists()


def _open():
    return needs_setup() or settings.DEMO_LOGIN


@csrf_exempt
def setup_workspace(request):
    from .account_views import EMAIL_RE, _body, _link, _mail, _mint
    from .auth_views import _issue
    from .views import org_settings

    if request.method == "GET":
        return JsonResponse({"needsSetup": needs_setup(), "open": _open(),
                             "demo": settings.DEMO_LOGIN, "orgName": org_settings()["name"]})
    if request.method != "POST":
        return _err("Method not allowed", 405)
    if not _open():
        return _err("This workspace is already set up. Ask a colleague to invite you.", 403)

    b = _body(request)
    name = str(b.get("name", "")).strip()
    email = str(b.get("email", "")).strip().lower()
    pw = str(b.get("password", ""))
    company = str(b.get("company", "")).strip()
    short = str(b.get("short", "")).strip()[:24]
    team = b.get("team") or []

    if len(name) < 2:
        return _err("Enter your name.")
    if not EMAIL_RE.match(email):
        return _err("Enter a valid work email address.")
    if len(pw) < 8:
        return _err("Choose a password of at least 8 characters.")
    if len(company) < 2:
        return _err("Enter your company's name.")
    try:
        threshold = int(b.get("approvalThreshold", 0) or 0)
        if threshold < 0:
            raise ValueError
    except (TypeError, ValueError):
        return _err("The sign-off threshold must be a whole number of naira.")
    if User.objects.filter(username=email).exists():
        return _err("That email already has an account. Sign in instead.", 409)
    if not isinstance(team, list) or len(team) > 25:
        return _err("Invite up to 25 people to begin with.")

    roles = set(BUYER_ROLES)
    cleaned = []
    for row in team:
        e = str((row or {}).get("email", "")).strip().lower()
        r = str((row or {}).get("role", "")).strip()
        if not e:
            continue
        if not EMAIL_RE.match(e):
            return _err(f"{e} is not a valid email address.")
        if e == email:
            return _err("You do not need to invite yourself.")
        if r not in roles:
            return _err(f"Pick a role for {e}.")
        if any(x["email"] == e for x in cleaned):
            continue
        if User.objects.filter(username=e).exists():
            return _err(f"{e} already has an account.", 409)
        cleaned.append({"email": e, "role": r})

    with transaction.atomic():
        persona = Persona.objects.create(id=rid("u"), name=name[:120], role="procurement",
                                         title="Head of Procurement")
        user = User.objects.create_user(username=email, email=email, password=None)
        user.set_password(pw)
        parts = name.split(None, 1)
        user.first_name = parts[0][:150]
        user.last_name = parts[1][:150] if len(parts) > 1 else ""
        user.save()
        Profile.objects.create(user=user, persona=persona, perm_extra=["settings.threshold"])

        row, _ = OrgSetting.objects.get_or_create(pk=1)
        data = dict(row.data or {})
        data["name"] = company[:120]
        data["short"] = short or company.split()[0][:24]
        if threshold:
            data["approvalThreshold"] = threshold
        row.data = data
        row.save()

    rule = (f"Publication at or above {threshold:,} needs approver sign-off."
            if threshold else "The default sign-off threshold applies.")
    record_event(actor=name, role="procurement", action="Workspace set up",
                 detail=f"{company} was set up by {name}. {rule}")

    links = []
    for m in cleaned:
        tok = _mint("team_invite", m["email"], {"role": m["role"], "title": "", "name": ""})
        link = _link(request, "itoken", tok.token)
        _mail(m["email"], f"You're invited to {company}'s DOCKET workspace",
              f"{name} invited you as {role_label(m['role'])}. Set your password here:\n\n{link}\n\n"
              f"The link is valid for 3 days.")
        record_event(actor=name, role="procurement", action="Team member invited",
                     detail=f"{m['email']} invited as {role_label(m['role'])}.")
        links.append({"email": m["email"], "role": m["role"], "roleLabel": role_label(m["role"]),
                      "link": link if settings.DEMO_LOGIN else None})

    out = _issue(user)
    out["invited"] = links
    out["company"] = company
    return JsonResponse(out)
