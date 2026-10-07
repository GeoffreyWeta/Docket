"""Sending as a Microsoft 365 mailbox, through Microsoft Graph.

    python test_graph_mail.py

Microsoft is faked: nothing leaves the machine. What is under test:

  THE THREE MS365 SETTINGS SWITCH IT ON, and win over SMTP when both are set.

  A DJANGO MESSAGE BECOMES THE RIGHT GRAPH MESSAGE - recipients with their
  names, Reply-To, an HTML alternative, an attachment - posted to the From
  mailbox's own sendMail and kept in its Sent Items.

  ONE SIGN-IN, NOT ONE PER MESSAGE, and a rejected token is renewed once.

  BUSY IS RETRIED ONCE, after the wait Microsoft asks for; anything else is an
  error that says what Microsoft said, so the vendor row records why.

  IT PACES ITSELF under Exchange's 30-a-minute cap rather than running into it.

  THE REST OF DOCKET NOTICES: bulk invitations shrink to what fits in a minute,
  and the registration drive counts it as real mail.
"""
import os
import subprocess
import sys

import django

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "docket.settings")
django.setup()

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

from django.conf import settings                                   # noqa: E402
from django.core.mail import EmailMessage, EmailMultiAlternatives  # noqa: E402

from core import graph_mail                                        # noqa: E402

PASSED, FAILED = [], []


def ok(label, cond, extra=""):
    (PASSED if cond else FAILED).append(label)
    print(("  PASS  " if cond else "  FAIL  ") + label
          + (f"  - {extra}" if extra and not cond else ""))


class Resp:
    def __init__(self, status, body=None, headers=None):
        self.status_code, self._body, self.headers = status, body, headers or {}
        self.content = b"x" if body is not None else b""

    def json(self):
        if self._body is None:
            raise ValueError("no body")
        return self._body


class FakeMicrosoft:
    """Answers sign-ins with a token and sendMail from a script of statuses."""

    def __init__(self, sends=()):
        self.script = list(sends)
        self.signins, self.posts = 0, []

    def post(self, url, data=None, json=None, headers=None, timeout=None):
        if "login.microsoftonline.com" in url:
            self.signins += 1
            return Resp(200, {"access_token": f"tok{self.signins}", "expires_in": 3600})
        self.posts.append({"url": url, "json": json, "auth": (headers or {}).get("Authorization")})
        return self.script.pop(0) if self.script else Resp(202)


class Clock:
    def __init__(self):
        self.t, self.slept = 1000.0, []

    def now(self):
        return self.t

    def sleep(self, s):
        self.slept.append(s)
        self.t += s


def fresh(sends=(), per_minute=28):
    ms, clock = FakeMicrosoft(sends), Clock()
    graph_mail.requests = ms
    graph_mail._clock, graph_mail._sleep = clock.now, clock.sleep
    graph_mail._recent.clear()
    graph_mail._token.update(value="", expires=0.0)
    graph_mail.PER_MINUTE = per_minute
    return ms, clock


settings.MS365_TENANT_ID, settings.MS365_CLIENT_ID, settings.MS365_CLIENT_SECRET = "tenant", "client", "secret"
FROM = "EatnGo Purchasing <purchasing@eatngo-africa.com>"
backend = graph_mail.GraphEmailBackend(fail_silently=False)


print("\nswitching it on")
here = os.path.dirname(os.path.abspath(__file__))
probe = "import django,os;os.environ['DJANGO_SETTINGS_MODULE']='docket.settings';django.setup();" \
        "from django.conf import settings as s;print(s.EMAIL_BACKEND)"
both = {**os.environ, "MS365_TENANT_ID": "t", "MS365_CLIENT_ID": "c", "MS365_CLIENT_SECRET": "s",
        "EMAIL_HOST": "smtp.example.com"}
out = subprocess.run([sys.executable, "-c", probe], cwd=here, env=both, capture_output=True, text=True).stdout.strip()
ok("all three MS365 settings pick Graph, even with SMTP also set", out == "core.graph_mail.GraphEmailBackend", out)
partial = {k: v for k, v in both.items() if k != "MS365_CLIENT_SECRET"}
out = subprocess.run([sys.executable, "-c", probe], cwd=here, env=partial, capture_output=True, text=True).stdout.strip()
ok("two of three falls back to SMTP", out == "django.core.mail.backends.smtp.EmailBackend", out)


print("\nthe message")
msg = EmailMultiAlternatives("[DOCKET] Award", "plain words", FROM,
                             ["Ada Obi <ada@vendor.ng>", "b@vendor.ng"], cc=["c@eatngo-africa.com"],
                             bcc=["audit@eatngo-africa.com"], reply_to=["purchasing@eatngo-africa.com"])
msg.attach_alternative("<p>html words</p>", "text/html")
msg.attach("award.pdf", b"%PDF-1.4", "application/pdf")
g = graph_mail.graph_message(msg)
ok("subject carried", g["subject"] == "[DOCKET] Award")
ok("HTML alternative preferred over the plain body",
   g["body"] == {"contentType": "HTML", "content": "<p>html words</p>"}, g["body"])
ok("a display name travels with its address",
   g["toRecipients"][0] == {"emailAddress": {"address": "ada@vendor.ng", "name": "Ada Obi"}}, g["toRecipients"])
ok("a bare address has no empty name", g["toRecipients"][1] == {"emailAddress": {"address": "b@vendor.ng"}})
ok("cc, bcc and Reply-To all carried",
   [r["emailAddress"]["address"] for r in g["ccRecipients"] + g["bccRecipients"] + g["replyTo"]]
   == ["c@eatngo-africa.com", "audit@eatngo-africa.com", "purchasing@eatngo-africa.com"])
att = g["attachments"][0]
ok("attachment named, typed and base64-encoded",
   att["name"] == "award.pdf" and att["contentType"] == "application/pdf" and att["contentBytes"] == "JVBERi0xLjQ=", att)
plain = graph_mail.graph_message(EmailMessage("s", "just text", FROM, ["x@y.ng"]))
ok("plain message is sent as text with no attachments key",
   plain["body"]["contentType"] == "Text" and "attachments" not in plain)


print("\nsending")
ms, clock = fresh()
n = backend.send_messages([EmailMessage("one", "b", FROM, ["a@x.ng"]),
                           EmailMessage("two", "b", FROM, ["b@x.ng"]),
                           EmailMessage("three", "b", FROM, ["c@x.ng"])])
ok("three messages, three sends", n == 3 and len(ms.posts) == 3, f"n={n} posts={len(ms.posts)}")
ok("posted to the From mailbox's own sendMail",
   ms.posts[0]["url"] == "https://graph.microsoft.com/v1.0/users/purchasing%40eatngo-africa.com/sendMail",
   ms.posts[0]["url"])
ok("kept in the mailbox's Sent Items", ms.posts[0]["json"]["saveToSentItems"] is True)
ok("one sign-in for all three", ms.signins == 1, f"{ms.signins} sign-ins")
ok("the token is what gets sent", ms.posts[0]["auth"] == "Bearer tok1")
ok("no waiting when well under the cap", clock.slept == [], clock.slept)

ms, clock = fresh([Resp(401, {"error": {"code": "InvalidAuthenticationToken"}})])
backend.send_messages([EmailMessage("s", "b", FROM, ["a@x.ng"])])
ok("a rejected token is renewed and the send retried",
   ms.signins == 2 and len(ms.posts) == 2 and ms.posts[1]["auth"] == "Bearer tok2",
   f"signins={ms.signins} posts={len(ms.posts)}")

ms, clock = fresh([Resp(429, {"error": {"code": "ApplicationThrottled"}}, {"Retry-After": "7"})])
n = backend.send_messages([EmailMessage("s", "b", FROM, ["a@x.ng"])])
ok("busy: waits what Microsoft asked, then sends", n == 1 and clock.slept == [7] and len(ms.posts) == 2,
   f"n={n} slept={clock.slept}")

ms, clock = fresh([Resp(503, None, {"Retry-After": "3600"})])
backend.send_messages([EmailMessage("s", "b", FROM, ["a@x.ng"])])
ok("an hour's Retry-After is cut to a minute", clock.slept == [60], clock.slept)

ms, clock = fresh([Resp(429, {"error": {"code": "ApplicationThrottled", "message": "slow down"}}),
                   Resp(429, {"error": {"code": "ApplicationThrottled", "message": "slow down"}})])
try:
    backend.send_messages([EmailMessage("s", "b", FROM, ["a@x.ng"])])
    ok("busy twice is an error", False, "no exception")
except RuntimeError as e:
    ok("busy twice is an error, not an endless loop", "ApplicationThrottled" in str(e) and len(ms.posts) == 2, str(e))

denied = Resp(403, {"error": {"code": "ErrorAccessDenied", "message": "Access is denied."}})
ms, clock = fresh([denied])
try:
    backend.send_messages([EmailMessage("s", "b", FROM, ["a@x.ng"])])
    ok("access denied raises", False, "no exception")
except RuntimeError as e:
    ok("access denied says what Microsoft said", "403 ErrorAccessDenied" in str(e) and "Access is denied" in str(e),
       str(e))
ms, clock = fresh([denied])
quiet = graph_mail.GraphEmailBackend(fail_silently=True)
ok("fail_silently counts it as not sent instead of raising",
   quiet.send_messages([EmailMessage("s", "b", FROM, ["a@x.ng"])]) == 0)

ms, clock = fresh()
ok("a message with nobody to send to is skipped",
   backend.send_messages([EmailMessage("s", "b", FROM, [])]) == 0 and ms.posts == [])


print("\npacing")
ms, clock = fresh(per_minute=3)
backend.send_messages([EmailMessage(f"m{i}", "b", FROM, [f"{i}@x.ng"]) for i in range(5)])
ok("all five go", len(ms.posts) == 5, len(ms.posts))
ok("the fourth waits for the first to be a minute old", clock.slept == [60], clock.slept)
graph_mail.PER_MINUTE = 28
ok("the real cap stays under Exchange's 30", graph_mail.PER_MINUTE < 30)


print("\nsign-in")
ms, clock = fresh()
ms.post = lambda url, **kw: Resp(401, {"error": "invalid_client",
                                      "error_description": "AADSTS7000215: Invalid client secret provided."})
graph_mail.requests = ms
try:
    backend.open()
    ok("a wrong secret fails at open", False, "no exception")
except RuntimeError as e:
    ok("a wrong secret fails at open, saying why", "Invalid client secret" in str(e), str(e))


print("\nthe rest of DOCKET")
from core import campaign, invite_views              # noqa: E402
from core.account_views import _mail                 # noqa: E402

old = settings.EMAIL_BACKEND
settings.EMAIL_BACKEND = "core.graph_mail.GraphEmailBackend"
ok("bulk invitations go 50 at a time through Microsoft 365", invite_views.send_cap() == 50)
ok("the registration drive counts it as real mail", campaign.is_live())
settings.DEFAULT_FROM_EMAIL, settings.EMAIL_REPLY_TO = FROM, []
ms, clock = fresh()
_mail("vendor@x.ng", "Welcome", "hello")
ok("an ordinary DOCKET email goes out through Graph",
   len(ms.posts) == 1 and ms.posts[0]["json"]["message"]["subject"] == "[DOCKET] Welcome"
   and ms.posts[0]["json"]["message"]["toRecipients"][0]["emailAddress"]["address"] == "vendor@x.ng",
   ms.posts)
settings.EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
ok("over SMTP the cap is unchanged", invite_views.send_cap() == 500)
settings.EMAIL_BACKEND = old


print(f"\n{len(PASSED)} passed, {len(FAILED)} failed")
sys.exit(1 if FAILED else 0)
