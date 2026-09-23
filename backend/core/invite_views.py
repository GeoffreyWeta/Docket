"""Bulk invitations: upload a spreadsheet, check it, then send.

Two endpoints on purpose, and the split is the safety feature - see the module
docstring in bulk_invite.py. `parse` shows exactly who would be written to and
why each rejected row was rejected; `send` takes back only the rows a person
confirmed. You cannot unsend an invitation, so the preview is the confirmation
step rather than a convenience.

PEOPLE GET A PERSONA BEFORE THEY GET AN EMAIL. The setup wizard already draws
the whole org chart before anybody accepts, so that reporting lines work from
the first minute rather than from whenever the last person clicks their link
(see account_views.accept_invite). A bulk import that created logins without
personas would produce exactly the gap that design exists to prevent, so this
creates the persona, then mints the invitation against it.
"""
from django.conf import settings
from django.contrib.auth.models import User
from django.http import JsonResponse

from . import bulk_invite
from .models import ActionToken, Persona
from .permissions import assignable_roles, role_label
from .util import now_ms, rid
from .views import err, log, org_name, route

# One request sends at most this many. Not a limit on the file - the preview
# will happily show two thousand rows - but on how many messages one HTTP call
# will sit and push through SMTP before something upstream gives up on it.
SEND_CAP = 500


def _known_emails():
    """Everyone this workspace has already contacted or signed up.

    An account is not enough on its own. An invited person has no User row
    until they set a password, so a list checked only against accounts would
    treat every pending invitation as new - and running the same spreadsheet
    twice, which is exactly what somebody does when they are not sure the first
    one worked, would mail everybody again and create a second persona for each
    of them. Pending invitations count as known until they are used or expire.
    """
    from .account_views import TOKEN_TTL_MS

    known = set(User.objects.values_list("username", flat=True))
    fresh = now_ms() - TOKEN_TTL_MS
    known |= set(ActionToken.objects
                 .filter(kind__in=("team_invite", "vendor_invite"),
                         used_at__isnull=True, created__gte=fresh)
                 .values_list("email", flat=True))
    return {e for e in known if e}


@route(["POST"], perm="team.invite")
def invite_parse(request, p, body):
    """Read an uploaded file and report what would happen. Sends nothing.

    Takes `audience=people|vendors` and, for people, an optional `role` used
    for any row whose own role column is blank.
    """
    f = request.FILES.get("file")
    if not f:
        return err("Attach a .xlsx or .csv file.")
    audience = (request.POST.get("audience") or "people").strip().lower()
    if audience not in ("people", "vendors"):
        return err("Audience must be people or vendors.")
    if audience == "vendors" and not _may(p, "supplier.invite"):
        return err("You don't have permission to invite vendors.", 403)

    rows, bad = bulk_invite.read_table(f.name, f.read())
    if bad:
        return err(bad)
    if not rows:
        return err("That file is empty.")

    candidates, notes = bulk_invite.extract(rows, audience=audience)
    if not candidates:
        return err("No email addresses found in that file. Check it has a column of "
                   "addresses, or that the addresses are not inside images.")

    default_role = (request.POST.get("role") or "").strip().lower()
    valid = {r["key"] for r in assignable_roles()} if audience == "people" else None
    if audience == "people" and default_role and default_role not in valid:
        return err("Pick a role that exists in this workspace.")

    ready, rejected = bulk_invite.classify(
        candidates, known_emails=_known_emails(),
        valid_roles=valid, default_role=default_role)

    return JsonResponse({
        "audience": audience,
        "howRead": notes.get("mode"),          # "headers" or "scanned"
        "columns": notes.get("columns", []),
        "ready": ready[:bulk_invite.MAX_ROWS],
        "rejected": rejected,
        "counts": {"found": notes.get("found", 0), "ready": len(ready),
                   "rejected": len(rejected)},
        "sendCap": SEND_CAP,
        "roles": [{"key": r["key"], "label": r["label"]} for r in assignable_roles()]
        if audience == "people" else [],
    })


def _may(p, cap):
    from .permissions import has
    return has(p, cap)


@route(["POST"], perm="team.invite")
def invite_send(request, p, body):
    """Send the invitations a person confirmed in the preview.

    The rows come back from the client because the preview is editable - a name
    guessed from a scanned cell is meant to be corrected before it goes out -
    so every one of them is re-validated here. A confirmed row is not a trusted
    row: the preview is a courtesy to the person, not an authorisation.
    """
    from .account_views import _link, _mail, _mint

    audience = str(body.get("audience", "people")).strip().lower()
    if audience not in ("people", "vendors"):
        return err("Audience must be people or vendors.")
    if audience == "vendors" and not _may(p, "supplier.invite"):
        return err("You don't have permission to invite vendors.", 403)

    rows = body.get("rows") or []
    if not isinstance(rows, list) or not rows:
        return err("Nothing to send.")
    if len(rows) > SEND_CAP:
        return err(f"That is {len(rows)} invitations. Send them {SEND_CAP} at a time - "
                   f"one request pushing more than that through SMTP will time out "
                   f"before it finishes, and you will not know which ones went.")

    default_role = str(body.get("role", "")).strip().lower()
    valid = {r["key"] for r in assignable_roles()} if audience == "people" else None
    ready, rejected = bulk_invite.classify(
        rows, known_emails=_known_emails(), valid_roles=valid, default_role=default_role)

    sent, failed = [], list(rejected)
    for r in ready:
        email = r["email"]
        try:
            if audience == "people":
                # The persona first, so the chart exists before the login does.
                persona = Persona.objects.create(
                    id=rid("u"), name=(r.get("name") or email.split("@")[0].title())[:80],
                    role=r["role"], title=(r.get("title") or "")[:80])
                tok = _mint("team_invite", email,
                            {"role": r["role"], "title": persona.title,
                             "name": persona.name, "personaId": persona.id})
                _mail(email, f"You're invited to {org_name()}'s DOCKET workspace",
                      f"{p['name']} invited you as {role_label(r['role'])}.\n\n"
                      f"Set your password here:\n{_link(request, 'itoken', tok.token)}\n\n"
                      f"The link is valid for 3 days.")
                sent.append({"email": email, "personaId": persona.id, "role": r["role"]})
            else:
                _mint("vendor_invite", email, {})
                _mail(email, f"{org_name()} invites you to register on DOCKET",
                      f"{org_name()} uses DOCKET for sealed-bid tendering and reverse "
                      f"auctions.\n\nRegister your company here:\n"
                      f"{_link(request, 'register', '1')}\n\n"
                      f"Once registered and prequalified you can be invited to bid.")
                sent.append({"email": email})
        except Exception as e:
            # One bad address must not abandon the other four hundred, and the
            # caller needs to know precisely which ones did not go.
            failed.append({**r, "why": f"Could not send: {str(e)[:120]}"})

    log(p, "Bulk invitations sent",
        f"{len(sent)} {'team member' if audience == 'people' else 'vendor'} "
        f"invitation(s) sent from an uploaded file; {len(failed)} not sent.")

    out = {"ok": True, "sent": len(sent), "failed": len(failed),
           "rows": sent, "notSent": failed}
    if settings.DEMO_LOGIN and audience == "people":
        out["note"] = "Demo mode: invitation links are printed to the server log."
    return JsonResponse(out)
