"""In-app notifications with best-effort email dispatch.

Email uses whatever backend settings.py resolved (SMTP if EMAIL_HOST is set,
console otherwise). Failures never break the triggering request.
"""
import logging

from django.conf import settings
from django.contrib.auth.models import User
from django.core.mail import EmailMessage

from .models import Notification
from .util import base_url, now_ms, org_name, rid

log = logging.getLogger(__name__)


def _users_for_role(role):
    return User.objects.filter(profile__persona__role=role).select_related("profile")


def _users_for_perm(key):
    """Everyone on the buyer side who actually holds this capability.

    Addressing the work by capability rather than by role name is what keeps a
    granted permission honest: give someone the power to approve an award and
    the approval notices start arriving, whatever their role is called.
    """
    from .permissions import custom_roles, resolve
    custom = custom_roles()
    out = []
    for u in (User.objects.filter(is_active=True, profile__persona__isnull=False)
              .select_related("profile__persona")):
        prof = u.profile
        perms = resolve(prof.persona.role, prof.perm_extra, prof.perm_revoked,
                        superadmin=u.is_superuser, custom=custom)
        if key in perms:
            out.append(u)
    return out


def _users_for_supplier(supplier_id):
    return User.objects.filter(profile__supplier_id=supplier_id).select_related("profile")


_ID_PAGES = ("tender", "auction", "bidroom")


def app_path(destination=None, tender_id=None, supplier=False, subject=""):
    """The in-app address of a notification, in the same scheme the frontend
    writes into the address bar (App.jsx routeToPath):

        /app/tenders, /app/tender/42/eval, /app/auction/7, /app/portal/outcomes

    It mirrors the notification panel's own "Open item" choice, so the email
    and the bell lead to the same place. None when there is nowhere specific.
    """
    from urllib.parse import quote, urlencode
    d = dict(destination or {})
    if not d.get("page"):
        if not tender_id:
            return None
        # A vendor's outcome letter lives in the portal, not the bid room.
        d = ({"page": "portal", "tab": "outcomes"} if supplier and "outcome" in (subject or "").lower()
             else {"page": "bidroom" if supplier else "tender", "id": tender_id})
    page = d.pop("page")
    path = f"/app/{quote(str(page))}"
    if page in _ID_PAGES and d.get("id") is not None:
        path += f"/{quote(str(d['id']))}"
    d.pop("id", None)
    if d.get("tab"):
        path += f"/{quote(str(d['tab']))}"
    d.pop("tab", None)
    rest = {k: v for k, v in d.items() if v not in (None, "")}
    return path + (f"?{urlencode(rest)}" if rest else "")


def _with_link(body, path):
    """Append the way back into DOCKET. Skipped when this deployment has no
    public address configured: a link to nowhere is worse than none."""
    base = (base_url() or "").rstrip("/")
    if not base or not path:
        return body
    return f"{body}\n\nOpen it in DOCKET: {base}{path}"


def notify_users(users, subject, body, tender_id=None, destination=None):
    users = list(users)
    if not users:
        return
    # The company's name, not the product's: "[Acme] Bid opened" is from
    # somebody the reader works with; "[DOCKET]" reads like a vendor's robot.
    prefix = org_name() or "DOCKET"
    for u in users:
        n = Notification.objects.create(
            id=rid("n"), user=u, at=now_ms(), subject=subject, body=body, tender_id=tender_id,
            destination=destination or {},
        )
        if u.email:
            try:
                is_vendor = bool(getattr(getattr(u, "profile", None), "supplier_id", None))
                mail_body = _with_link(body, app_path(destination, tender_id, supplier=is_vendor,
                                                         subject=subject))
                EmailMessage(f"[{prefix}] {subject}", mail_body, settings.DEFAULT_FROM_EMAIL, [u.email],
                             reply_to=settings.EMAIL_REPLY_TO).send(fail_silently=False)
                n.emailed = True
                n.save(update_fields=["emailed"])
            except Exception:
                log.warning("email dispatch failed for %s", u.username, exc_info=True)


def notify_role(role, subject, body, tender_id=None):
    notify_users(_users_for_role(role), subject, body, tender_id)


def notify_perm(key, subject, body, tender_id=None):
    target = None
    if not tender_id:
        page = "suppliers" if key.startswith("supplier.") else "finance" if key == "page.finance" else None
        target = {"page": page} if page else None
    elif key in ("bid.score", "bid.open", "clarification.answer", "award.recommend",
                 "bid.approve_new_vendor"):
        target = {"page": "tender", "id": tender_id,
                  "tab": {"bid.score": "eval", "bid.open": "bids",
                          "clarification.answer": "clar", "award.recommend": "bids",
                          "bid.approve_new_vendor": "bids"}[key]}
    notify_users(_users_for_perm(key), subject, body, tender_id, destination=target)


def notify_personas(persona_ids, subject, body, tender_id=None):
    """Named people rather than a capability.

    An approval chain addresses a person the reporting line picked out, not
    everyone who could in principle sign. Mailing the whole approver pool about
    a signature only one of them owes is how a queue stops being read.
    """
    ids = [i for i in (persona_ids or []) if i]
    if not ids:
        return
    notify_users(User.objects.filter(is_active=True, profile__persona_id__in=ids)
                 .select_related("profile"), subject, body, tender_id)


def _mail_unclaimed(supplier_id, subject, body, ask="read the full terms and submit a sealed bid"):
    """Reach a vendor who is on the register but holds no account yet.

    A buyer can put a company on the register from inside a draft - they know
    the company, and waiting for it to find the registration form is a week of
    nothing. Until somebody at that company sets a password there is no `User`
    row, so the per-user notification above reaches nobody, and an invitation to
    tender addressed to a vendor with no account was silence.

    So the register's own contact address is the fallback, and the mail carries
    the claim link with it: the invitation and the way to act on it arrive
    together, which is the only version of this that is any use to them.

    The link is reused while it is still good rather than minted per message, or
    a chatty event would leave a vendor holding five links and wondering which
    one is live.
    """
    from .models import ActionToken, Supplier

    s = Supplier.objects.filter(pk=supplier_id).first()
    email = (s.contact_email or "").strip().lower() if s else ""
    if not email:
        return False

    from .account_views import CAMPAIGN_TTL_MS, _mail, _mint

    fresh = now_ms() - CAMPAIGN_TTL_MS
    tok = (ActionToken.objects
           .filter(kind="vendor_claim", used_at__isnull=True, created__gt=fresh,
                   payload__supplierId=supplier_id)
           .order_by("-created").first())
    if tok is None:
        tok = _mint("vendor_claim", email, {"supplierId": supplier_id})

    _mail(email, subject,
          f"{body}\n\n"
          f"{s.name} is on {org_name()}'s vendor register but nobody has claimed the account yet. "
          f"Set a password to sign in, {ask}:\n\n"
          f"{base_url()}/?register={tok.token}")
    return True


def notify_supplier(supplier_id, subject, body, tender_id=None, destination=None):
    """Tell a vendor. Returns whether anybody was actually reachable.

    THE RETURN VALUE IS NOT DECORATION. This function is silent in two ways
    that look identical to the caller: a vendor with no account and no contact
    address on the register, and an unclaimed vendor whose mail threw. Both
    used to return None, exactly like success, so a caller counting how many
    vendors it had told counted the ones it had not - and in an auction that
    count is written to the row that answers "were they asked?".

    So it says. True means a notification or an email went out; False means
    nobody was reachable and the caller should record that rather than assume.
    """
    users = list(_users_for_supplier(supplier_id))
    if users:
        notify_users(users, subject, body, tender_id,
                     destination=destination or ({} if tender_id else {"page": "portal", "tab": "company"}))
        return True
    try:
        # An auction is bid in a live room, not by sealed envelope.
        if (destination or {}).get("page") == "auction":
            return bool(_mail_unclaimed(supplier_id, subject, body,
                                        ask="read the auction rules and bid in the live room"))
        return bool(_mail_unclaimed(supplier_id, subject, body))
    except Exception:
        log.warning("could not reach unclaimed vendor %s", supplier_id, exc_info=True)
        return False


def notify_suppliers(supplier_ids, subject, body, tender_id=None):
    for sid in supplier_ids:
        notify_supplier(sid, subject, body, tender_id)
