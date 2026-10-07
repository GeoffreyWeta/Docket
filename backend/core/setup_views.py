"""First-run setup: one person turns an empty workspace into a working company
in a single sitting, without a console or a command line.

Five facts about the shape of this:

  IT IS GATED TWICE. On emptiness, and on a code. Emptiness is the structural
  gate - the endpoint is open while the workspace has no active buyer accounts,
  because there is nobody yet who could authorise anything, and it closes the
  moment it has one. The code is the human gate: an empty workspace reachable
  on a public address is a company waiting to be registered by whoever finds
  the URL first, and "there was nobody here yet" is not consent. SETUP_CODE is
  issued out of band, checked with the same lockout the sign-in page uses, and
  is the only thing standing between a fresh deployment and a stranger.

  THE FIRST PERSON RUNS TENDERS, AND THEY DO NOT SIGN THEIR OWN WORK.
  Separation of duties is the product, so the owner is not given sign-off:
  they draft, invite and configure, and they get `settings.threshold` and
  `team.roles` as per-person grants so they can keep the authority ladder and
  the role list right after setup. Everything they raise goes up the ladder to
  somebody else.

  THE ROLES ARE THE COMPANY'S. The wizard sends the roles it wants - the
  starter four renamed, reshaped or dropped, plus any it invents - and they
  are validated with the team (roles.plan) and written with it, in the same
  transaction. A team member's role arrives as the row's `ref`, because a
  role invented on the previous screen has no key until it is saved.

  THE ORG CHART IS BUILT BEFORE ANYBODY ACCEPTS. Personas are created for the
  whole team in this one transaction, so reporting lines and signing authority
  exist from the first minute rather than three days later once the last
  invitation is clicked. The invitation token carries the persona id; accepting
  it attaches a login to a person who was already on the chart.

  THE VENDOR REGISTER IS PART OF SETUP. A procurement workspace with no vendors
  cannot run a tender, and the register is the one thing the buyer already has,
  usually as a spreadsheet. Rows arrive parsed and are deduplicated on name.

  SETUP EMAILS NOBODY. Not the team, not the vendors. A company finishes
  setting up first and chooses afterwards when everybody hears about it: the
  team's invitations are held (HELD_INVITE) and sent from the Team page, and
  the vendor registration drive is started from the Vendors page.

  IT ENDS SIGNED IN. The response carries a bearer token, so the person lands
  on their own dashboard rather than on a sign-in page asking for the password
  they typed ninety seconds ago.
"""
from django.conf import settings
from django.contrib.auth.models import User
from django.db import transaction
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

from . import approvals, vocab
from .models import FailedLogin, OrgSetting, Persona, Profile, Supplier
from . import roles as roles_mod
from .permissions import role_label
from .util import now_ms, record_event, rid

MAX_TEAM = 60
MAX_VENDORS = 2000
# An invitation prepared during setup and not yet sent. Its own kind, so it can
# never be accepted: views.team_send_invites mints the real team_invite when
# somebody sends it, and the three-day clock starts then, not at setup.
HELD_INVITE = "team_invite_held"
CODE_ATTEMPTS = 8
CODE_WINDOW_MS = 15 * 60 * 1000
CODE_BUCKET = "__setup_code__"


def _err(msg, status=400):
    return JsonResponse({"error": msg}, status=status)


def needs_setup():
    """True while nobody on the buyer side can sign in."""
    return not User.objects.filter(profile__persona__isnull=False, is_active=True).exists()


def _open():
    return needs_setup() or settings.DEMO_LOGIN


# ------------------------------------------------------------- the access code

def setup_code():
    return (getattr(settings, "SETUP_CODE", "") or "").strip()


def _code_locked():
    since = now_ms() - CODE_WINDOW_MS
    FailedLogin.objects.filter(at__lt=since).delete()
    return FailedLogin.objects.filter(username=CODE_BUCKET, at__gte=since).count() >= CODE_ATTEMPTS


def check_code(given):
    """(ok, error). Case-insensitive and whitespace-tolerant, because this gets
    read off a slide, retyped from a WhatsApp message and pasted with a space
    on the end. Rate-limited, because it is a short shared secret on a public
    address and eight guesses a quarter of an hour is the difference between a
    code and a formality."""
    wanted = setup_code()
    if not wanted:
        return True, None
    if _code_locked():
        return False, ("Too many incorrect codes. Setup is locked for 15 minutes - "
                       "ask whoever gave you the code to confirm it.")
    if str(given or "").strip().upper() != wanted.upper():
        FailedLogin.objects.create(username=CODE_BUCKET, at=now_ms())
        return False, "That setup code is not right. Check it with whoever sent it to you."
    FailedLogin.objects.filter(username=CODE_BUCKET).delete()
    return True, None


@csrf_exempt
def setup_verify_code(request):
    """Let the wizard unlock its first step without submitting the whole form.

    Worth its own endpoint: asking somebody to fill in five screens before
    telling them the code on the first one was wrong is the kind of form people
    abandon, and the check is cheap.
    """
    from .account_views import _body
    if request.method != "POST":
        return _err("Method not allowed", 405)
    if not _open():
        return _err("This workspace is already set up.", 403)
    ok, msg = check_code(_body(request).get("code"))
    if not ok:
        return _err(msg, 429 if "locked" in msg else 403)
    return JsonResponse({"ok": True})


# ------------------------------------------------------------------ the wizard

def _clean_team(rows, owner_email, role_plan=None):
    """Validate the team, resolve the reporting lines, and return them in an
    order that can actually be created: a manager before anyone who reports to
    them. Returns (people, error).

    `role_plan` is the role list about to be saved (roles.plan); a person's
    role may name one of its rows by `ref`."""
    if not isinstance(rows, list):
        return None, "The team must be a list of people."
    if len(rows) > MAX_TEAM:
        return None, f"Invite up to {MAX_TEAM} people to begin with; add the rest from the Team page."

    from .account_views import EMAIL_RE
    from .permissions import assignable_roles
    refs = (role_plan or {}).get("refs") or {}
    roles = set((role_plan or {}).get("keys") or ()) or {r["key"] for r in assignable_roles()}
    levels = {lvl["id"] for lvl in approvals.ladder()}

    people, by_key, seen_email = [], {}, {owner_email}
    for i, row in enumerate(rows):
        if not isinstance(row, dict):
            return None, "Each team member must be a set of fields."
        email = str(row.get("email", "")).strip().lower()
        if not email:
            continue
        if not EMAIL_RE.match(email):
            return None, f"{email} is not a valid email address."
        if email in seen_email:
            return None, (f"{email} is on the list twice." if email != owner_email
                          else "You do not need to invite yourself.")
        seen_email.add(email)
        if User.objects.filter(username=email).exists():
            return None, f"{email} already has an account."
        role = str(row.get("role", "")).strip()
        role = refs.get(role, role)
        if role not in roles:
            return None, f"Pick a role for {email}."
        level = str(row.get("level", "") or "")
        if level and level not in levels:
            return None, f"{email} is assigned to an approval level that is not in the ladder."
        key = str(row.get("key") or f"t{i}")
        if key in by_key or key == "owner":
            return None, "Two people on the team list share an id. Reload and try again."
        person = {"key": key, "email": email, "role": role, "level": level,
                  "name": str(row.get("name", "")).strip()[:120],
                  "title": str(row.get("title", "")).strip()[:80],
                  "reportsTo": str(row.get("reportsTo", "") or "") or None}
        by_key[key] = person
        people.append(person)

    # Reporting lines must point at somebody on this chart, and must not loop.
    for person in people:
        target = person["reportsTo"]
        if target in (None, "", "owner"):
            person["reportsTo"] = "owner" if target == "owner" else None
            continue
        if target not in by_key:
            return None, f"{person['email']} is set to report to somebody who is not on this list."
        if target == person["key"]:
            return None, f"{person['email']} cannot report to themselves."

    # Topological order, so a manager's persona exists before their report's.
    ordered, placed, guard = [], {"owner"}, 0
    remaining = list(people)
    while remaining:
        guard += 1
        if guard > len(people) + 2:
            names = ", ".join(r["email"] for r in remaining)
            return None, f"The reporting lines form a loop ({names}). Somebody must sit at the top."
        progressed = []
        for person in remaining:
            target = person["reportsTo"]
            if target is None or target in placed:
                ordered.append(person)
                placed.add(person["key"])
            else:
                progressed.append(person)
        if len(progressed) == len(remaining):
            names = ", ".join(r["email"] for r in remaining)
            return None, f"The reporting lines form a loop ({names}). Somebody must sit at the top."
        remaining = progressed
    return ordered, None


def vendor_fields(row):
    """Supplier fields for one row of a vendor spreadsheet, keyed as the model
    names them. The columns are the template's (frontend/src/csvguide.jsx):
    email, category, location, contact, phone; `name` and duplicates are the
    caller's business. Used by setup and by the Vendors page import, so one
    file means the same thing in both places."""
    from .account_views import EMAIL_RE

    def placed(clean, raw, fallback):
        # A spreadsheet is not a dropdown: wording the rules cannot place
        # falls back rather than failing the whole file, and the typed cell is
        # kept on the record (below) so nothing is silently rewritten.
        try:
            return clean(raw) or fallback
        except vocab.Refused:
            return fallback

    email = str(row.get("email", "")).strip().lower()[:200]
    if email and not EMAIL_RE.match(email):
        # A bad address is not a reason to lose the company: the vendor lands
        # on the register unreachable, which is visible and fixable, rather
        # than silently dropped.
        email = ""
    typed_loc = str(row.get("location", "")).strip()
    typed_phone = str(row.get("phone", "")).strip()
    loc = placed(vocab.location, typed_loc, "-")
    tel = placed(vocab.phone, typed_phone, "")
    registry = {}
    if typed_loc and typed_loc != loc:
        registry["locationTyped"] = typed_loc[:120]
    if typed_phone and typed_phone != tel:
        registry["phoneTyped"] = typed_phone[:120]
    contact = (row.get("contact") or row.get("contactPerson") or row.get("contact person")
               or row.get("contactperson") or "")
    return {
        "contact_email": email,
        # An unrecognised word lands in "Uncategorised", which is a real bucket
        # on the register rather than an invented default nobody can filter
        # on. `classification` keeps what was typed.
        "category": placed(vocab.category, row.get("category"), "Uncategorised"),
        "classification": str(row.get("category", "")).strip()[:140],
        "location": loc,
        "contact_person": str(contact).strip()[:140],
        "phone": tel,
        "registry": registry,
    }


def _clean_vendors(rows):
    """(vendors, skipped, error). Deduplicated on name within the upload as
    well as against the register, because the same spreadsheet usually holds a
    company twice under two spellings of the same address."""
    if not isinstance(rows, list):
        return None, 0, "The vendor list must be a list of rows."
    if len(rows) > MAX_VENDORS:
        return None, 0, (f"That is {len(rows):,} vendors, and setup takes at most {MAX_VENDORS:,}. "
                         f"Finish setting up and use the Vendors page, which imports the full register.")

    seen = {s.name.strip().lower() for s in Supplier.objects.all()}
    out, skipped = [], 0
    for row in rows:
        if not isinstance(row, dict):
            skipped += 1
            continue
        name = str(row.get("name", "")).strip()[:120]
        if not name or name.lower() in seen:
            skipped += 1
            continue
        seen.add(name.lower())
        out.append({"name": name, **vendor_fields(row)})
    return out, skipped, None


@csrf_exempt
def setup_workspace(request):
    from .account_views import EMAIL_RE, _body, _mint
    from .auth_views import _issue
    from .views import DEFAULT_PROFILE, clean_profile, org_settings

    if request.method == "GET":
        return JsonResponse({
            "needsSetup": needs_setup(), "open": _open(), "demo": settings.DEMO_LOGIN,
            "orgName": org_settings()["name"],
            # Whether a code is wanted, never the code itself.
            "codeRequired": bool(setup_code()),
            "codeLocked": bool(setup_code()) and _code_locked(),
            "roles": roles_mod.listing(), "kinds": roles_mod.kinds(),
            "maxTeam": MAX_TEAM, "maxVendors": MAX_VENDORS,
        })
    if request.method != "POST":
        return _err("Method not allowed", 405)
    if not _open():
        return _err("This workspace is already set up. Ask a colleague to invite you.", 403)

    b = _body(request)
    ok, msg = check_code(b.get("code"))
    if not ok:
        return _err(msg, 429 if "locked" in msg else 403)

    name = str(b.get("name", "")).strip()
    email = str(b.get("email", "")).strip().lower()
    pw = str(b.get("password", ""))
    company = str(b.get("company", "")).strip()
    short = str(b.get("short", "")).strip()[:24]
    title = str(b.get("title", "")).strip()[:80] or "Head of Procurement"

    if len(name) < 2:
        return _err("Enter your name.")
    if not EMAIL_RE.match(email):
        return _err("Enter a valid work email address.")
    if len(pw) < 8:
        return _err("Choose a password of at least 8 characters.")
    if len(company) < 2:
        return _err("Enter your company's name.")
    if User.objects.filter(username=email).exists():
        return _err("That email already has an account. Sign in instead.", 409)

    try:
        threshold = int(b.get("approvalThreshold", 0) or 0)
        if threshold < 0:
            raise ValueError
    except (TypeError, ValueError):
        return _err("The sign-off threshold must be a whole number.")

    levels, msg = approvals.normalise(b.get("approvalLevels"))
    if msg:
        return _err(msg)

    try:
        profile = clean_profile(b.get("profile") or {}, DEFAULT_PROFILE)
    except vocab.Refused as e:
        return _err(str(e))

    logo = str(b.get("logo", "") or "")
    if logo and not logo.startswith("data:image/"):
        return _err("The logo must be an image.")
    if len(logo) > 360_000:          # ~256 KB once base64 is unwound
        return _err("That logo is too large. Use an image under 256 KB, or an SVG.")

    # The company's roles. Planned now, so the ladder and the team can be
    # checked against them; written below with everything else. The ladder
    # being replaced does not hold a role in place - the one arriving does.
    role_plan = None
    if b.get("roles") is not None:
        role_plan, msg = roles_mod.plan(b.get("roles"), ladder=levels)
        if msg:
            return _err(msg)
        if (role_plan["starters"].get("procurement") or {}).get("hidden"):
            return _err("Your own role cannot be removed - you need it to run the workspace.")
        for lvl in levels:
            if lvl.get("role"):
                lvl["role"] = role_plan["refs"].get(lvl["role"], lvl["role"])
                if lvl["role"] not in role_plan["keys"]:
                    return _err(f"The {lvl['name']} level falls back to a role that is not on your "
                                f"list. Pick another, or let it wait for somebody to be placed on it.")

    # The ladder has to be on the settings row before the team is validated
    # against it, and before a persona can be placed on a rung.
    row, _created = OrgSetting.objects.get_or_create(pk=1)
    data = dict(row.data or {})
    data["approvalLevels"] = levels
    row.data = data
    row.save()

    team, msg = _clean_team(b.get("team") or [], email, role_plan)
    if msg:
        return _err(msg)
    vendors, vendor_skipped, msg = _clean_vendors(b.get("vendors") or [])
    if msg:
        return _err(msg)

    owner_level = str(b.get("ownerLevel", "") or "")
    if owner_level and owner_level not in {lvl["id"] for lvl in levels}:
        return _err("Your own approval level is not in the ladder.")

    with transaction.atomic():
        if role_plan:
            roles_mod.apply(role_plan, actor=name)
            # The role names live on the same settings row this view saves
            # again below; re-read it, or that save puts the old copy back.
            row.refresh_from_db()
        owner = Persona.objects.create(id=rid("u"), name=name[:120], role="procurement",
                                       title=title, approval_level=owner_level)
        user = User.objects.create_user(username=email, email=email, password=None)
        user.set_password(pw)
        parts = name.split(None, 1)
        user.first_name = parts[0][:150]
        user.last_name = parts[1][:150] if len(parts) > 1 else ""
        user.save()
        Profile.objects.create(user=user, persona=owner,
                               perm_extra=["settings.threshold", "team.roles"])

        # The chart, in dependency order - see _clean_team.
        persona_for = {"owner": owner}
        for person in team:
            manager = persona_for.get(person["reportsTo"]) if person["reportsTo"] else None
            persona_for[person["key"]] = Persona.objects.create(
                id=rid("u"),
                name=person["name"] or person["email"].split("@")[0].replace(".", " ").title()[:120],
                role=person["role"],
                title=person["title"] or role_label(person["role"]).split(" - ")[0].strip(),
                manager=manager, approval_level=person["level"])

        data = dict(row.data or {})
        data["name"] = company[:120]
        data["short"] = short or company.split()[0][:24]
        data["profile"] = profile
        if logo:
            data["logo"] = logo
        if threshold:
            data["approvalThreshold"] = threshold
        row.data = data
        row.save()

        created_vendors = [
            Supplier(id=rid("s"), prequalified=False, docs=[], perf={}, source="import", **v)
            for v in vendors
        ]
        Supplier.objects.bulk_create(created_vendors)

    # --- what was set up, on the record -----------------------------------
    if levels:
        rungs = "; ".join(
            f"{lvl['name']} " + ("unlimited" if not lvl["limit"] else f"up to {lvl['limit']:,}")
            for lvl in levels)
        rule = (f"Delegation of authority, {len(levels)} level(s): {rungs}. Requests follow the "
                f"raiser's reporting line upward until a manager whose limit covers the amount.")
    elif threshold:
        rule = f"Publication at or above {threshold:,} needs sign-off."
    else:
        rule = "The default sign-off threshold applies."
    record_event(actor=name, role="procurement", action="Workspace set up",
                 detail=f"{company} was set up by {name}. {rule}")
    if team:
        record_event(actor=name, role="procurement", action="Org chart created",
                     detail=f"{len(team)} people placed on the chart with their reporting lines "
                            f"and signing authority, ahead of accepting their invitations.")
    if created_vendors:
        record_event(actor=name, role="procurement", action="Vendor register loaded",
                     detail=f"{len(created_vendors)} vendor(s) added during setup"
                            + (f"; {vendor_skipped} blank or duplicate row(s) skipped." if vendor_skipped else "."))

    # --- invitations, held --------------------------------------------------
    # Setup emails nobody. A company finishes setting up first and decides
    # afterwards when its people and its vendors hear about it: the list can be
    # loaded today and the invitations sent next week, once the roles and the
    # ladder have been looked over. Each person is already on the chart; what
    # is kept here is only the address the invitation will go to, and the Team
    # page sends it (views.team_send_invites) when somebody presses the button.
    held = []
    for person in team:
        persona = persona_for[person["key"]]
        _mint(HELD_INVITE, person["email"],
              {"role": person["role"], "title": persona.title,
               "name": persona.name, "personaId": persona.id})
        held.append({"email": person["email"], "name": persona.name, "role": person["role"],
                     "roleLabel": role_label(person["role"]),
                     "reportsTo": persona.manager.name if persona.manager_id else name})
    if held:
        record_event(actor=name, role="procurement", action="Team invitations held",
                     detail=f"{len(held)} invitation(s) prepared and not sent. They go out "
                            f"from the Team page when somebody chooses to send them.")

    # The vendor registration drive is not started here either. The register
    # is loaded; the drive is started from the Vendors page when the company
    # is ready (campaign.start, behind its own preview and confirmation).

    out = _issue(user)
    out["company"] = company
    out["held"] = held
    out["vendors"] = {"created": len(created_vendors), "skipped": vendor_skipped,
                      "withEmail": sum(1 for v in created_vendors if v.contact_email)}
    out["levels"] = levels
    return JsonResponse(out)
