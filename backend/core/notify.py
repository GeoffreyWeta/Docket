"""In-app notifications with best-effort email dispatch.

Email uses whatever backend settings.py resolved (SMTP if EMAIL_HOST is set,
console otherwise). Failures never break the triggering request.
"""
import logging

from django.conf import settings
from django.contrib.auth.models import User
from django.core.mail import send_mail

from .models import Notification
from .util import now_ms, rid

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


def notify_supplier(supplier_id, subject, body, tender_id=None):
    notify_users(_users_for_supplier(supplier_id), subject, body, tender_id)


def notify_suppliers(supplier_ids, subject, body, tender_id=None):
    for sid in supplier_ids:
        notify_supplier(sid, subject, body, tender_id)
