"""The registration drive: inviting an imported register to come and sign up.

Importing 1,436 vendors gives you a list. It does not give you 1,436 vendors who
can log in, upload a tax clearance, or receive an invitation to bid — for that
each one has to register, and somebody has to ask them to.

Four things make this different from a loop over `send_mail`:

* **It cannot run in a request.** 1,353 SMTP round trips is minutes of work.
  A web request that takes minutes is a timeout, and a timeout halfway through
  a send is the worst possible outcome: some vendors mailed, no record of which.
  Sending happens in the background sweep, a bounded batch at a time.

* **Nobody is mailed twice.** `Supplier.invited_at` is set in the same
  transaction as the send, and the query that picks the next batch excludes
  anyone who has it. Two people starting a drive a week apart is a normal thing
  to happen; mailing the register twice because of it is not.

* **It is previewable.** `preview()` answers "who exactly would this contact,
  and who would it skip, and why" without sending anything. A campaign against
  a register this size is not something to discover the shape of afterwards.

* **A failure is recorded as a failure.** A bad address lands in `invite_error`
  and stays visible. Silent `except: pass` around a send is how a register ends
  up with 200 vendors nobody realises were never contacted.

What this deliberately does not do: it does not send to a vendor who already has
a login, it does not send to a vendor held out of the register with a rejection
reason, and it has no "send to everyone again" switch. The last one is not an
oversight — see `reset_campaign`, which is admin-only and logs loudly.
"""
import logging

from django.conf import settings
from django.core.mail import get_connection
from django.core.mail.message import EmailMessage
from django.db.models import Q

from .models import ActionToken, Profile, Supplier, TaskMark
from .util import now_ms, rid

log = logging.getLogger(__name__)

# One sweep sends at most this many. Small enough that a batch finishes inside a
# sweep even on a slow relay, large enough that a 1,400-vendor register clears
# in a couple of days of ordinary traffic. Raise it only alongside a real ESP:
# the number that breaks is not this one, it is the provider's rate limit.
BATCH = 40

CAMPAIGN_KEY = "vendor_campaign"     # TaskMark row holding the campaign's state
# Its own kind, not the "vendor_invite" the single-vendor invite endpoint uses.
# That one mints a token with an empty payload and mails a bare ?register=1 flag;
# a claim token names the supplier it was minted for. Sharing a kind would mean
# claim_vendor could be handed a token with no supplier behind it and would have
# to guess what the sender meant.
TOKEN_KIND = "vendor_claim"


# ---------------------------------------------------------------- eligibility

def eligible():
    """Vendors it would be correct to email, as a queryset.

    Excluded, in order of how much it would matter to get wrong:
      * no email address — nothing to send to
      * already invited — `invited_at` is set
      * already has a login — they have registered; asking again is noise
      * held out with a rejection reason — the organisation has said no to
        this vendor, and inviting them to register anyway is the system
        contradicting a decision somebody made
    """
    registered = set(Profile.objects.filter(supplier__isnull=False)
                     .values_list("supplier_id", flat=True))
    return (Supplier.objects
            .exclude(contact_email="")
            .filter(invited_at__isnull=True, rejected_reason="")
            .exclude(id__in=registered)
            .order_by("name"))


def preview():
    """What a drive would do, touching nothing. Every number here is a count of
    a real query, not an estimate."""
    total = Supplier.objects.count()
    registered = set(Profile.objects.filter(supplier__isnull=False)
                     .values_list("supplier_id", flat=True))
    q = eligible()
    # Distinct addresses, because the register genuinely holds the same mailbox
    # under two vendor names and one company should get one email.
    addresses = set(q.values_list("contact_email", flat=True))
    return {
        "total": total,
        "toSend": q.count(),
        "distinctAddresses": len(addresses),
        "skipped": {
            "noEmail": Supplier.objects.filter(contact_email="").count(),
            "alreadyInvited": Supplier.objects.filter(invited_at__isnull=False).count(),
            "alreadyRegistered": len(registered),
            "heldOut": Supplier.objects.exclude(rejected_reason="").count(),
        },
        "batch": BATCH,
        "live": is_live(),
        "state": state(),
    }


# Backends that deliver nothing: everything else is assumed to reach real
# mailboxes. Named explicitly rather than testing for "console", because the
# question the UI asks is "will 1,300 real companies receive this", and the
# honest default for an unrecognised backend is yes.
INERT_BACKENDS = (
    "django.core.mail.backends.console.EmailBackend",
    "django.core.mail.backends.locmem.EmailBackend",
    "django.core.mail.backends.dummy.EmailBackend",
    "django.core.mail.backends.filebased.EmailBackend",
)


def is_live():
    """Whether mail actually leaves the building.

    Not read off EMAIL_HOST: Django defaults that to "localhost", so a truthiness
    test there would tell an operator on a console-only workspace that they were
    about to mail the whole register. This is the single most important fact on
    the campaign screen and it must not be inferred from a setting that is always
    populated.
    """
    return getattr(settings, "EMAIL_BACKEND", "") not in INERT_BACKENDS


# ------------------------------------------------------------------- the state

def state():
    """{running, sent, failed, startedAt}.

    Only `running` is stored — one TaskMark row holding the epoch the drive was
    armed, or 0 for disarmed. The counters are *derived* from the Supplier rows
    themselves, because `invited_at` and `invite_error` are set in the same
    update as the send. A stored counter and a set of sends are two records of
    one fact, and the day they disagree there is no way to tell which lied.
    """
    row = TaskMark.objects.filter(pk=CAMPAIGN_KEY).first()
    return {
        "running": bool(row and row.at > 0),
        "startedAt": row.at if row and row.at > 0 else None,
        "sent": Supplier.objects.filter(invited_at__isnull=False).count(),
        "failed": Supplier.objects.exclude(invite_error="").count(),
    }


def start(actor):
    """Arm the campaign. The sweep does the sending."""
    TaskMark.objects.update_or_create(pk=CAMPAIGN_KEY, defaults={"at": now_ms()})
    log.info("vendor registration drive armed by %s", actor)
    return preview()


def stop():
    """Disarm. In-flight batches are atomic, so stopping is immediate: the next
    sweep simply finds the campaign disarmed and does nothing."""
    TaskMark.objects.filter(pk=CAMPAIGN_KEY).update(at=0)


def is_running():
    row = TaskMark.objects.filter(pk=CAMPAIGN_KEY).first()
    return bool(row and row.at > 0)


# ------------------------------------------------------------------- the send

def _message(supplier, token, base_url, org):
    link = f"{base_url}/?register={token}"
    subject = f"{org} — register as a supplier on DOCKET"
    body = (
        f"Dear {supplier.contact_person or supplier.name},\n\n"
        f"{org} now runs its tendering through DOCKET, a sealed-bid procurement "
        f"system. Your company is already on our vendor register"
        + (f" (code {supplier.code})" if supplier.code else "")
        + ".\n\n"
        f"To be invited to tenders you need an account. Registering takes a few "
        f"minutes and lets you keep your compliance documents current, receive "
        f"invitations, ask questions during a tender, and submit sealed bids:\n\n"
        f"    {link}\n\n"
        f"This link is for {supplier.name} and can be used once.\n\n"
        f"If you believe you received this in error, ignore it — no account is "
        f"created until you complete registration.\n\n"
        f"{org} Procurement"
    )
    return subject, body


def send_batch(base_url, org, limit=BATCH):
    """Send up to `limit` invitations. Returns (sent, failed).

    One SMTP connection for the whole batch rather than one per message: opening
    a TLS session 40 times to the same relay is most of the wall-clock time, and
    some relays treat it as abuse.
    """
    if not is_running():
        return 0, 0
    batch = list(eligible()[:limit])
    if not batch:
        stop()   # nothing left — disarm so the sweep stops looking
        return 0, 0

    sent = failed = 0
    seen = set()
    try:
        conn = get_connection(fail_silently=False)
        conn.open()
    except Exception:
        log.warning("registration drive: could not open a mail connection", exc_info=True)
        return 0, 0

    for s in batch:
        addr = (s.contact_email or "").strip().lower()
        # Same mailbox twice in the register: mark the duplicate as handled
        # rather than mailing it, so the campaign still terminates.
        if not addr or addr in seen:
            Supplier.objects.filter(pk=s.id).update(
                invited_at=now_ms(), invite_error="Duplicate address in this batch — not sent.")
            continue
        seen.add(addr)
        try:
            tok = ActionToken.objects.create(
                token=rid("vi") + rid("vi"), kind=TOKEN_KIND, email=addr,
                payload={"supplierId": s.id, "campaign": True}, created=now_ms())
            subject, body = _message(s, tok.token, base_url, org)
            msg = EmailMessage(f"[{org}] {subject}", body,
                               settings.DEFAULT_FROM_EMAIL, [addr], connection=conn)
            msg.send(fail_silently=False)
            Supplier.objects.filter(pk=s.id).update(
                invited_at=now_ms(), invite_count=s.invite_count + 1, invite_error="")
            sent += 1
        except Exception as e:
            # Recorded on the vendor, not swallowed. `invited_at` is left null so
            # a fixed address is retried; the error is what makes it findable.
            Supplier.objects.filter(pk=s.id).update(invite_error=str(e)[:200])
            failed += 1
            log.warning("registration drive: send to %s failed", addr, exc_info=True)

    try:
        conn.close()
    except Exception:
        pass
    return sent, failed


def reset_campaign():
    """Clear every invitation mark so the register can be contacted again.

    Deliberately hard to reach and never wired to a button in the tendering UI.
    Re-running a drive against 1,400 addresses that were already contacted is
    how a sending domain gets blocked, and the only legitimate reason to do it
    is that the first run went out with something wrong in it.
    """
    n = Supplier.objects.filter(invited_at__isnull=False).count()
    Supplier.objects.all().update(invited_at=None, invite_error="")
    ActionToken.objects.filter(kind=TOKEN_KIND, used_at__isnull=True).delete()
    stop()
    return n
