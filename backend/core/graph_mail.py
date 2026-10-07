"""Email through Microsoft 365, sent by the From mailbox itself, via Microsoft Graph.

Settings: MS365_TENANT_ID, MS365_CLIENT_ID, MS365_CLIENT_SECRET - an Entra app
registration that Exchange allows to send as that one mailbox (see the README).
With all three set, settings.py picks this backend over SMTP.

Why Graph and not smtp.office365.com: Microsoft is retiring password sign-in
for SMTP, and an app registration is the supported way for a server to send as
a mailbox. Exchange itself sends each message, so it passes the domain's own
SPF and DKIM with no DNS changes, and it lands in the mailbox's Sent Items
where the people who own that address can see what DOCKET said.

THE 30-A-MINUTE CAP. Exchange lets one mailbox send 30 messages a minute, and
going over does not fail cleanly: Graph answers 429 or 503, and the message may
or may not have gone. So this paces itself under the cap instead of retrying
into it. The pacing is per process - two gunicorn workers and a sweep sending
at once could still meet the cap, which is what the one retry is for.
"""
import base64
import logging
import threading
import time
from collections import deque
from email.utils import getaddresses, parseaddr
from urllib.parse import quote

import requests
from django.conf import settings
from django.core.mail.backends.base import BaseEmailBackend

log = logging.getLogger(__name__)

GRAPH = "https://graph.microsoft.com/v1.0"
PER_MINUTE = 28          # under Exchange's 30, leaving room for a person in Outlook
RETRY_STATUSES = (429, 503, 504)
MAX_WAIT = 60            # seconds; a Retry-After longer than this is not worth holding a request for

# Swapped out by the tests.
_clock = time.monotonic
_sleep = time.sleep

_slot_lock = threading.Lock()     # held while waiting, so not shared with the token
_token_lock = threading.Lock()
_recent = deque()        # monotonic times of this process's sends in the last minute
_token = {"value": "", "expires": 0.0}


def _wait_for_slot():
    with _slot_lock:
        while True:
            now = _clock()
            while _recent and now - _recent[0] >= 60:
                _recent.popleft()
            if len(_recent) < PER_MINUTE:
                _recent.append(now)
                return
            _sleep(60 - (now - _recent[0]))


def _get_token(force=False):
    """A bearer token from the Entra client-credentials flow.

    Kept in memory for its hour, unlike finance_sync's per-run token: a sync
    asks once, but mail asks once per message, and five hundred invitations
    should not be five hundred sign-ins.
    """
    with _token_lock:
        if not force and _token["value"] and _clock() < _token["expires"]:
            return _token["value"]
    r = requests.post(
        f"https://login.microsoftonline.com/{settings.MS365_TENANT_ID}/oauth2/v2.0/token",
        data={"grant_type": "client_credentials",
              "client_id": settings.MS365_CLIENT_ID,
              "client_secret": settings.MS365_CLIENT_SECRET,
              "scope": "https://graph.microsoft.com/.default"},
        timeout=30)
    payload = r.json() if r.content else {}
    tok = payload.get("access_token")
    if not tok:
        raise RuntimeError("Microsoft 365 sign-in failed: "
                           + (payload.get("error_description") or payload.get("error") or f"HTTP {r.status_code}")[:300])
    with _token_lock:
        _token["value"] = tok
        _token["expires"] = _clock() + int(payload.get("expires_in", 3600)) - 300
    return tok


def _recipients(addrs):
    out = []
    for name, addr in getaddresses(addrs or []):
        if addr:
            out.append({"emailAddress": {"address": addr, **({"name": name} if name else {})}})
    return out


def _attachment(att):
    if isinstance(att, tuple):
        filename, content, mimetype = att
        data = content.encode() if isinstance(content, str) else content
    else:   # a MIMEBase part
        filename, mimetype, data = att.get_filename(), att.get_content_type(), att.get_payload(decode=True)
    return {"@odata.type": "#microsoft.graph.fileAttachment", "name": filename or "attachment",
            "contentType": mimetype or "application/octet-stream",
            "contentBytes": base64.b64encode(data or b"").decode()}


def graph_message(msg):
    """The Graph JSON for one Django EmailMessage."""
    body, kind = msg.body, "Text"
    for content, mimetype in getattr(msg, "alternatives", None) or []:
        if mimetype == "text/html":
            body, kind = content, "HTML"
    out = {
        "subject": msg.subject,
        "body": {"contentType": kind, "content": body},
        "toRecipients": _recipients(msg.to),
        "ccRecipients": _recipients(msg.cc),
        "bccRecipients": _recipients(msg.bcc),
        "replyTo": _recipients(msg.reply_to),
    }
    if msg.attachments:
        out["attachments"] = [_attachment(a) for a in msg.attachments]
    return out


def _error(r):
    try:
        e = r.json().get("error", {})
        return f"Microsoft 365 refused the message ({r.status_code} {e.get('code', '')}): {e.get('message', '')}"[:300]
    except ValueError:
        return f"Microsoft 365 refused the message (HTTP {r.status_code})"


class GraphEmailBackend(BaseEmailBackend):

    def open(self):
        # Fail at open, not halfway through a batch: the registration drive opens
        # once and records "could not open a mail connection" when this raises.
        try:
            _get_token()
        except Exception:
            if not self.fail_silently:
                raise
        return False

    def send_messages(self, email_messages):
        sent = 0
        for msg in email_messages or []:
            if not msg.recipients():
                continue
            try:
                self._send(msg)
                sent += 1
            except Exception:
                if not self.fail_silently:
                    raise
                log.warning("Microsoft 365 send failed", exc_info=True)
        return sent

    def _send(self, msg):
        sender = parseaddr(msg.from_email or settings.DEFAULT_FROM_EMAIL)[1]
        url = f"{GRAPH}/users/{quote(sender)}/sendMail"
        payload = {"message": graph_message(msg), "saveToSentItems": True}
        _wait_for_slot()
        retried_auth = retried_busy = False
        while True:
            r = requests.post(url, json=payload, timeout=30,
                              headers={"Authorization": f"Bearer {_get_token(force=retried_auth)}"})
            if r.status_code == 202:
                return
            if r.status_code == 401 and not retried_auth:
                retried_auth = True
                continue
            if r.status_code in RETRY_STATUSES and not retried_busy:
                # One retry only. A 429 does not prove the message stayed home,
                # and a second copy of an invitation is better than none.
                retried_busy = True
                try:
                    wait = int(r.headers.get("Retry-After", 10))
                except ValueError:
                    wait = 10
                _sleep(min(max(wait, 1), MAX_WAIT))
                continue
            raise RuntimeError(_error(r))
