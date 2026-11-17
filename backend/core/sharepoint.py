"""Copies of DOCKET's documents in SharePoint, through Microsoft Graph.

WHAT IS FILED. Two kinds of document, each where the company's own people look
for it:

  * a vendor's company documents (tax clearance, CAC certificate, licences),
    as soon as the vendor uploads them;
  * bid documents, but only once the recorded opening has unsealed them. A bid
    document is stored encrypted from the moment it is uploaded, and nothing
    encrypted is ever sent: before the opening there is nothing to file, a
    commercial envelope returned unopened at the technical stage stays sealed
    for good, and a bid audit turned down is never opened at all.

DOCKET KEEPS ITS OWN COPY. The app runs on the copy in its database; the
SharePoint copy is for the people who work in SharePoint. If SharePoint is down
or not set up, nothing in DOCKET stops: the background sweep (tasks.py) files
what is waiting next time round, retrying a failed file a few times and keeping
the last error on the document.

Where things go, under SHAREPOINT_FOLDER (default "Docket"):

  Vendors/<vendor> (<code>)/Company documents/<type> - <file name>
  Tenders/<ref> <title>/Bids/<vendor>/<Technical|Commercial>/<type> - <file name>

SETTINGS (environment):
  SHAREPOINT_SITE      the site as host and path, e.g. eatngo.sharepoint.com:/sites/Procurement
  SHAREPOINT_LIBRARY   the document library; default the site's main one ("Documents")
  SHAREPOINT_FOLDER    the folder inside it; default "Docket"
  SHAREPOINT_TENANT_ID, SHAREPOINT_CLIENT_ID, SHAREPOINT_CLIENT_SECRET
                       an Entra app registration with the Microsoft Graph
                       application permission Sites.Selected, granted write
                       access on that one site (or Sites.ReadWrite.All). Falls
                       back to the MS365_* values when these are not set.
With SHAREPOINT_SITE blank, filing is off and this module does nothing.
"""
import logging
import os
import re
import time
from urllib.parse import quote

import requests

log = logging.getLogger(__name__)

GRAPH = "https://graph.microsoft.com/v1.0"
SIMPLE_MAX = 4 * 1024 * 1024        # Graph's limit for a one-request upload
CHUNK = 320 * 1024 * 10             # upload-session chunks must be multiples of 320 KiB
MAX_TRIES = 5
PER_SWEEP = 25

_cache = {"token": "", "expires": 0.0, "drive": ""}


def _env(name):
    return os.environ.get(name, "").strip()


def config():
    return {
        "site": _env("SHAREPOINT_SITE"),
        "library": _env("SHAREPOINT_LIBRARY"),
        "folder": _env("SHAREPOINT_FOLDER") or "Docket",
        "tenant": _env("SHAREPOINT_TENANT_ID") or _env("MS365_TENANT_ID"),
        "client": _env("SHAREPOINT_CLIENT_ID") or _env("MS365_CLIENT_ID"),
        "secret": _env("SHAREPOINT_CLIENT_SECRET") or _env("MS365_CLIENT_SECRET"),
    }


def enabled():
    c = config()
    return bool(c["site"] and c["tenant"] and c["client"] and c["secret"])


# ------------------------------------------------------------------ Graph

def _token(force=False):
    if not force and _cache["token"] and time.monotonic() < _cache["expires"]:
        return _cache["token"]
    c = config()
    r = requests.post(f"https://login.microsoftonline.com/{c['tenant']}/oauth2/v2.0/token",
                      data={"grant_type": "client_credentials", "client_id": c["client"],
                            "client_secret": c["secret"], "scope": "https://graph.microsoft.com/.default"},
                      timeout=30)
    payload = r.json() if r.content else {}
    tok = payload.get("access_token")
    if not tok:
        raise RuntimeError("SharePoint sign-in failed: "
                           + (payload.get("error_description") or payload.get("error") or f"HTTP {r.status_code}")[:250])
    _cache["token"] = tok
    _cache["expires"] = time.monotonic() + int(payload.get("expires_in", 3600)) - 300
    return tok


def _call(method, url, **kw):
    headers = kw.pop("headers", {})
    for attempt in (0, 1):
        r = requests.request(method, url, headers={"Authorization": f"Bearer {_token(force=attempt == 1)}",
                                                   **headers}, timeout=60, **kw)
        if r.status_code != 401:
            return r
    return r


def _error(r):
    try:
        e = r.json().get("error", {})
        return f"SharePoint refused it ({r.status_code} {e.get('code', '')}): {e.get('message', '')}"[:300]
    except ValueError:
        return f"SharePoint refused it (HTTP {r.status_code})"


def _drive():
    """The id of the document library files go into."""
    if _cache["drive"]:
        return _cache["drive"]
    c = config()
    host, _, path = c["site"].partition(":")
    site_ref = f"{host}:{path}" if path else host
    r = _call("GET", f"{GRAPH}/sites/{site_ref}")
    if r.status_code != 200:
        raise RuntimeError(_error(r))
    site_id = r.json()["id"]
    r = _call("GET", f"{GRAPH}/sites/{site_id}/drives")
    if r.status_code != 200:
        raise RuntimeError(_error(r))
    drives = r.json().get("value", [])
    want = (c["library"] or "").casefold()
    pick = next((d for d in drives if want and d.get("name", "").casefold() == want), None)
    if pick is None and want:
        raise RuntimeError(f'No document library called "{c["library"]}" on that site.')
    pick = pick or next((d for d in drives if d.get("name") in ("Documents", "Shared Documents")), None) \
        or (drives[0] if drives else None)
    if not pick:
        raise RuntimeError("That SharePoint site has no document library.")
    _cache["drive"] = pick["id"]
    return pick["id"]


# ------------------------------------------------------------------ names

_BAD = re.compile(r'["*:<>?/\\|#%\x00-\x1f]')


def safe(name, limit=120):
    """A file or folder name SharePoint accepts: no reserved characters, no
    leading or trailing dots and spaces, not too long."""
    out = _BAD.sub(" ", str(name or "")).strip(" .")
    out = re.sub(r"\s+", " ", out)[:limit].strip(" .")
    return out or "untitled"


def file_name(prefix, name):
    base = safe(name, 150)
    return safe(f"{prefix} - {base}", 180) if prefix and not base.startswith(prefix) else base


def folder_for(doc):
    """[folder, ...] for one document, or None when it is not filed."""
    from .models import Supplier
    c = config()
    root = [safe(c["folder"])]
    sup = Supplier.objects.filter(pk=doc.supplier_id).first() if doc.supplier_id else None
    vendor = safe(f"{sup.name} ({sup.code})" if sup and sup.code else (sup.name if sup else doc.supplier_id or "Vendor"))
    if doc.kind == "supplier":
        return root + ["Vendors", vendor, "Company documents"]
    if doc.kind == "bid" and doc.tender_id:
        t = doc.tender
        return root + ["Tenders", safe(f"{t.ref} {t.title}"), "Bids", vendor,
                       "Commercial" if doc.envelope == "commercial" else "Technical"]
    return None


def label_for(doc):
    """What the document is, as the vendor said: "Tax clearance", "Quotation"."""
    if doc.kind == "supplier":
        from .models import Supplier
        sup = Supplier.objects.filter(pk=doc.supplier_id).only("docs").first()
        meta = next((x for x in (sup.docs or []) if x.get("docId") == doc.id), {}) if sup else {}
        return meta.get("name") or ""
    if doc.doc_type:
        from .vocab import VOCAB
        return next((lb for v, lb, _e in VOCAB["bidDocTypes"] if v == doc.doc_type), doc.doc_type)
    return ""


# ------------------------------------------------------------------ upload

def upload(folders, name, data, content_type="application/octet-stream"):
    """Put one file in the library at folders/name. Returns its web link.
    A file of the same name already there is kept, and this one renamed."""
    drive = _drive()
    path = "/".join(quote(x) for x in folders + [name])
    if len(data) <= SIMPLE_MAX:
        r = _call("PUT", f"{GRAPH}/drives/{drive}/root:/{path}:/content"
                         f"?@microsoft.graph.conflictBehavior=rename",
                  data=data, headers={"Content-Type": content_type or "application/octet-stream"})
        if r.status_code not in (200, 201):
            raise RuntimeError(_error(r))
        return r.json().get("webUrl", "")
    r = _call("POST", f"{GRAPH}/drives/{drive}/root:/{path}:/createUploadSession",
              json={"item": {"@microsoft.graph.conflictBehavior": "rename"}})
    if r.status_code != 200:
        raise RuntimeError(_error(r))
    session = r.json()["uploadUrl"]
    total, done = len(data), 0
    while done < total:
        part = data[done:done + CHUNK]
        # The session URL is pre-authorised: no bearer token on these.
        r = requests.put(session, data=part, timeout=120, headers={
            "Content-Length": str(len(part)),
            "Content-Range": f"bytes {done}-{done + len(part) - 1}/{total}"})
        if r.status_code not in (200, 201, 202):
            raise RuntimeError(_error(r))
        done += len(part)
    return (r.json() or {}).get("webUrl", "") if r.content else ""


def eligible():
    """Documents waiting to be filed, oldest first. Encrypted ones never are."""
    from .models import Document
    return (Document.objects.select_related("tender")
            .filter(kind__in=("supplier", "bid"), encrypted=False, sharepoint_at__isnull=True,
                    sharepoint_tries__lt=MAX_TRIES)
            .order_by("uploaded_at"))


def file_one(doc):
    """File one document. True when filed; the error is kept on it otherwise."""
    from .util import now_ms
    folders = folder_for(doc)
    if not folders or doc.encrypted:
        return False
    try:
        url = upload(folders, file_name(label_for(doc), doc.name), bytes(doc.data), doc.content_type)
    except Exception as e:                                        # noqa: BLE001
        doc.sharepoint_tries += 1
        doc.sharepoint_error = str(e)[:300]
        doc.save(update_fields=["sharepoint_tries", "sharepoint_error"])
        log.warning("SharePoint filing failed for %s: %s", doc.id, e)
        return False
    doc.sharepoint_url, doc.sharepoint_at, doc.sharepoint_error = url[:1000], now_ms(), ""
    doc.save(update_fields=["sharepoint_url", "sharepoint_at", "sharepoint_error"])
    return True


def sweep(limit=PER_SWEEP):
    """File what is waiting, a few at a time. Returns how many were filed."""
    if not enabled():
        return 0
    filed = 0
    for doc in eligible()[:limit]:
        if file_one(doc):
            filed += 1
    return filed


def status():
    """For the settings page: is it on, and how far behind is it."""
    if not enabled():
        return {"enabled": False}
    from .models import Document
    return {
        "enabled": True, "site": config()["site"], "folder": config()["folder"],
        "waiting": eligible().count(),
        "failed": Document.objects.filter(sharepoint_at__isnull=True, sharepoint_tries__gte=MAX_TRIES).count(),
        "filed": Document.objects.filter(sharepoint_at__isnull=False).count(),
    }
