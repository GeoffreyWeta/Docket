"""`/api/v1/` -- the outbound data feed's HTTP surface.

Everything about *what* is exported lives in datafeed.py. This file is the door:
who may knock, how often, and what the answers look like. See datafeed.py for
the consumer contract; the two rules that shape this file are that the caller is
a machine and that it is not signed in as anybody.

AUTHENTICATION IS DELIBERATELY NOT THE LOGIN TOKEN. `views.get_persona` resolves
a bearer token to a person with a role and a capability set, because every
endpoint there is somebody *acting*. Nobody is acting here. A scheduler pulls at
03:00 with no human involved, and binding that to an employee's session would
mean the pipeline breaks when they leave and their departure silently changes
what a warehouse can see. Service credentials are their own table (ApiKey) with
their own scopes, minted and revoked independently of anyone's employment.

THE KEY IS SHOWN ONCE. Only its SHA-256 is stored, so a database dump is not
also a set of working integration credentials. Losing it means minting another,
which is the correct cost.

RATE LIMITING IS A FIXED WINDOW, and the thing it defends against is a
misconfigured cron in a retry loop rather than an adversary -- a warehouse sync
runs on a timer and has no reason to ever approach the ceiling. A 429 carries
`Retry-After` so a well-behaved client backs off without guessing.
"""
import hashlib
import json
import secrets

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

from . import datafeed
from .models import ApiKey
from .util import now_ms

# Per key, per window. A five-minute sync of a dozen entities uses a couple of
# dozen calls an hour; this leaves three orders of magnitude of headroom and
# still stops a runaway loop.
RATE_WINDOW_MS = 60_000
RATE_LIMIT = 240

KEY_PREFIX = "dk_live_"


# ---------------- minting ----------------

def hash_key(raw):
    return hashlib.sha256(raw.encode()).hexdigest()


def mint(name, scopes, created_by=""):
    """Create a key and return `(raw, ApiKey)`. The raw value is never stored
    and this is the only moment it exists -- callers show it once and discard
    it."""
    bad = [s for s in scopes if s not in datafeed.SCOPES]
    if bad:
        raise ValueError(f"Unknown scope(s): {', '.join(bad)}")
    raw = KEY_PREFIX + secrets.token_urlsafe(32)
    key = ApiKey.objects.create(
        name=name, prefix=raw[: len(KEY_PREFIX) + 6], key_hash=hash_key(raw),
        scopes=list(scopes), created=now_ms(), created_by=created_by or "",
    )
    return raw, key


# ---------------- the door ----------------

def _err(msg, status=400, **extra):
    return JsonResponse({"error": msg, **extra}, status=status)


def _authenticate(request):
    """`(ApiKey, None)` or `(None, JsonResponse)`.

    Failures are deliberately uniform: an unknown key and a revoked key produce
    the same 401 with the same wording, because telling a caller which of the
    two it holds is telling them something about a key they do not have.
    """
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None, _err("Send an API key as 'Authorization: Bearer <key>'.", 401)
    raw = auth[7:].strip()
    if not raw.startswith(KEY_PREFIX):
        return None, _err("Not a data feed key.", 401)

    key = ApiKey.objects.filter(key_hash=hash_key(raw)).first()
    if not key or not key.active:
        return None, _err("Unknown or revoked API key.", 401)

    now = now_ms()
    if now - key.window_at >= RATE_WINDOW_MS:
        key.window_at, key.window_calls = now, 0
    key.window_calls += 1
    key.calls += 1
    key.last_used = now
    key.save(update_fields=["window_at", "window_calls", "calls", "last_used"])

    if key.window_calls > RATE_LIMIT:
        retry = max(1, (RATE_WINDOW_MS - (now - key.window_at)) // 1000)
        r = _err(f"Rate limit exceeded ({RATE_LIMIT} requests per minute).", 429)
        r["Retry-After"] = str(retry)
        return None, r
    return key, None


def feed(scope=None):
    """Read-only route decorator for the feed. GET only -- this API hands data
    out and has no opinion anybody can write back."""
    def deco(fn):
        @csrf_exempt
        def wrap(request, *args, **kwargs):
            if request.method != "GET":
                return _err("The data feed is read-only.", 405)
            key, bad = _authenticate(request)
            if bad:
                return bad
            # A callable scope is resolved from the URL captures alone -- the
            # entity feeds are the only ones whose required scope depends on
            # which row set was asked for.
            need = scope(*args, **kwargs) if callable(scope) else scope
            if need and need not in (key.scopes or []):
                return _err(f"This key does not carry the '{need}' scope.", 403,
                            required_scope=need, scopes=key.scopes or [])
            resp = fn(request, key, *args, **kwargs)
            resp["X-RateLimit-Limit"] = str(RATE_LIMIT)
            resp["X-RateLimit-Remaining"] = str(max(0, RATE_LIMIT - key.window_calls))
            return resp
        return wrap
    return deco


def _limit(request):
    try:
        return int(request.GET.get("limit") or datafeed.DEFAULT_LIMIT)
    except (TypeError, ValueError):
        return datafeed.DEFAULT_LIMIT


# ---------------- endpoints ----------------

@feed()
def index(request, key):
    """What this key can see, and how to read it.

    Discovery rather than documentation: a consumer's first call tells it which
    entities its own scopes actually reach, so nobody has to reconcile a key
    against a PDF to find out why a 403 happened.
    """
    visible = {name: {"scope": e.scope, "path": f"/api/v1/{name}/"}
               for name, e in datafeed.ENTITIES.items()
               if e.scope in (key.scopes or [])}
    return JsonResponse({
        "version": "v1",
        "server_time": now_ms(),
        "key": {"name": key.name, "prefix": key.prefix, "scopes": key.scopes or []},
        "entities": visible,
        "deletions": {"path": "/api/v1/deletions/",
                      "note": "Tombstones. Ignore this and your copy keeps deleted rows forever."},
        "events": {"path": "/api/v1/events/", "scope": "feed.audit",
                   "note": "Hash-chained. Re-walk prev_hash/hash to verify what you received."},
        "openapi": "/api/v1/openapi.json",
        "paging": {
            "style": "cursor",
            "how": "Send ?cursor= from the previous response. Omit it to start from the beginning.",
            "delivery": "at-least-once -- upsert on `id`, never append blindly.",
            "lag_ms": datafeed.LAG_MS,
            "max_limit": datafeed.MAX_LIMIT,
        },
    })


@feed(scope=lambda name: (datafeed.ENTITIES[name].scope
                          if name in datafeed.ENTITIES else None))
def entity(request, key, name):
    ent = datafeed.ENTITIES.get(name)
    if not ent:
        return _err(f"No such feed: {name}.", 404,
                    entities=sorted(datafeed.ENTITIES))
    try:
        cursor = datafeed.decode_cursor(request.GET.get("cursor"))
    except ValueError as e:
        return _err(str(e), 400)
    return JsonResponse(datafeed.page(ent, cursor=cursor, limit=_limit(request)))


@feed()
def deletions(request, key):
    """Tombstones, filtered to what this key could have seen in the first place.

    Without that filter the feed would leak the shape of what it refuses to
    show: a key with no commercial scope could not read a payment but could
    watch payments being deleted, and counting those is a real disclosure.
    """
    allowed = [n for n, e in datafeed.ENTITIES.items() if e.scope in (key.scopes or [])]
    if not allowed:
        return _err("This key carries no feed scopes.", 403)
    want = [s for s in (request.GET.get("entities") or "").split(",") if s]
    entities = [w for w in want if w in allowed] if want else allowed
    return JsonResponse(datafeed.deletions_page(
        since_seq=request.GET.get("since_seq") or 0,
        limit=_limit(request), entities=entities))


@feed(scope="feed.audit")
def events(request, key):
    return JsonResponse(datafeed.events_page(
        since_seq=request.GET.get("since_seq") or 0, limit=_limit(request)))


@feed()
def openapi(request, key):
    """A machine-readable spec, generated from the same registry that serves the
    rows, so it cannot drift from them the way a hand-written one does."""
    paths = {
        "/api/v1/": {"get": {"summary": "Discovery: entities this key can read",
                             "responses": {"200": {"description": "OK"}}}},
    }
    common = [
        {"name": "cursor", "in": "query", "schema": {"type": "string"},
         "description": "From the previous response. Omit to start at the beginning."},
        {"name": "limit", "in": "query",
         "schema": {"type": "integer", "default": datafeed.DEFAULT_LIMIT,
                    "maximum": datafeed.MAX_LIMIT}},
    ]
    for name, e in datafeed.ENTITIES.items():
        paths[f"/api/v1/{name}/"] = {"get": {
            "summary": f"{name} changed since the cursor",
            "description": f"Requires the '{e.scope}' scope. At-least-once: upsert on id.",
            "parameters": common,
            "responses": {"200": {"description": "A page of rows"},
                          "403": {"description": "Key lacks the scope"}},
        }}
    paths["/api/v1/deletions/"] = {"get": {
        "summary": "Rows deleted since the sequence number",
        "parameters": [
            {"name": "since_seq", "in": "query", "schema": {"type": "integer"}},
            {"name": "entities", "in": "query", "schema": {"type": "string"},
             "description": "Comma-separated feed names. Defaults to all this key can read."},
        ],
        "responses": {"200": {"description": "A page of tombstones"}},
    }}
    paths["/api/v1/events/"] = {"get": {
        "summary": "The hash-chained audit log",
        "description": "Requires 'feed.audit'. Re-walk prev_hash/hash to verify integrity.",
        "parameters": [{"name": "since_seq", "in": "query",
                        "schema": {"type": "integer"}}],
        "responses": {"200": {"description": "A page of chain entries"}},
    }}
    return JsonResponse({
        "openapi": "3.0.3",
        "info": {
            "title": "DOCKET data feed",
            "version": "1.0.0",
            "description": (
                "Incremental, cursor-paged export of procurement data for loading "
                "into a warehouse. Delivery is at-least-once: upsert on `id`. Read "
                "/api/v1/deletions/ or your copy will keep deleted rows forever."),
        },
        "servers": [{"url": "/"}],
        "components": {"securitySchemes": {"apiKey": {
            "type": "http", "scheme": "bearer",
            "description": "A DOCKET data feed key (dk_live_...)."}}},
        "security": [{"apiKey": []}],
        "paths": paths,
    }, json_dumps_params={"indent": 2})
