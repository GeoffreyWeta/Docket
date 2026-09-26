"""In-app notifications with best-effort email dispatch.

Email uses whatever backend settings.py resolved (SMTP if EMAIL_HOST is set,
console otherwise). Failures never break the triggering request.
"""
import logging

from django.conf import settings
from django.contrib.auth.models import User
from django.core.mail import send_mail

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


def notify_users(users, subject, body, tender_id=None):
    for u in users:
        n = Notification.objects.create(
            id=rid("n"), user=u, at=now_ms(), subject=subject, body=body, tender_id=tender_id,
        )
        if u.email:
            try:
                send_mail(f"[DOCKET] {subject}", body, settings.DEFAULT_FROM_EMAIL, [u.email], fail_silently=False)
                n.emailed = True
                n.save(update_fields=["emailed"])
            except Exception:
                log.warning("email dispatch failed for %s", u.username, exc_info=True)


def notify_role(role, subject, body, tender_id=None):
    notify_users(_users_for_role(role), subject, body, tender_id)


def notify_perm(key, subject, body, tender_id=None):
    notify_users(_users_for_perm(key), subject, body, tender_id)


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


def _mail_unclaimed(supplier_id, subject, body):
    """Reach a vendor who is on the register but holds no account yet.

    A buyer can put a company on the register from inside a draft — they know
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
          f"Set a password to sign in, read the full terms and submit a sealed bid:\n\n"
          f"{base_url()}/?register={tok.token}")
    return True


def notify_supplier(supplier_id, subject, body, tender_id=None):
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
        notify_users(users, subject, body, tender_id)
        return True
    try:
        return bool(_mail_unclaimed(supplier_id, subject, body))
    except Exception:
        log.warning("could not reach unclaimed vendor %s", supplier_id, exc_info=True)
        return False


def notify_suppliers(supplier_ids, subject, body, tender_id=None):
    for sid in supplier_ids:
        notify_supplier(sid, subject, body, tender_id)
