"""Put a parsed vendor register into the database.

`vendor_import.build()` turns the spreadsheet export into vendor dicts. This
module decides what that means for the database as it stands — what is new, what
is a refresh, what has gone from the spreadsheet, what must not be touched — and
then applies it.

It exists as its own module because there are two ways in: the management
command (`manage.py import_vendors`, used from a terminal and from the deploy
build) and the upload on the Suppliers page. Two implementations of "replace the
register" would drift, and the one that drifted would be the one nobody tested.
So both call plan() and then apply(), and the guards below hold for both.
"""
from django.db import transaction

from core.models import Bid, Document, Profile, Supplier, Tender

# Each seeded demo supplier and the register category it should become. The name
# is a hint, not a lookup: the first vendor in that category whose name contains
# the hint wins, else the first with matching prequalification.
#
# This matters because the demo tenders, bids, award letters and supplier logins
# all point at the seeded suppliers. Deleting those without a thought would
# leave tenders inviting companies that no longer exist. Each is mapped onto a
# real vendor in the same line of business, every reference is rewritten, the
# delivery history is carried across, and only then are the old rows removed.
DEMO_MAP = [
    ("s1",  "Food & ingredients",         "FRESHFARE"),
    ("s2",  "Logistics & freight",        "KENNIE O COLD CHAIN"),
    ("s3",  "Food & ingredients",         "BIGATTON"),
    ("s4",  "Equipment & assets",         "PROKITCHEN"),
    ("s5",  "Printing & packaging",       "SHONGAI"),
    ("s6",  "Cleaning, pest & waste",     "BOECKER LIMITED"),
    ("s7",  "IT & telecoms",              "THE SOURCE COMPUTERS"),
    ("s8",  "Food & ingredients",         "SARMAD"),
    ("s9",  "Equipment & assets",         "BCE FOOD SERVICE"),
    ("s10", "Construction & engineering", "SHARP & STRONG"),   # deliberately unqualified
    ("s11", "Printing & packaging",       "RECOPLASTIC"),
]

# Written from the file on every run. Everything else on a Supplier — perf,
# rating, and any document the register did not supply — is earned in DOCKET,
# not in the spreadsheet, so a re-import must not touch it. The register has no
# delivery history to offer; overwriting one with nothing would blank every
# scorecard and look like an import bug.
FROM_FILE = ("name", "category", "location", "prequalified", "rejected_reason",
             "contact_email", "code", "classification", "contact_person",
             "phone", "address", "payment_terms", "registry")

# A spreadsheet does not normally lose a fifth of its rows between exports.
# Below this, deletions go ahead; above it, the caller has to say it meant it.
SHRINK_FLOOR = 20


def plan(vendors):
    """Work out what this file would do, touching nothing.

    Returns a dict the CLI prints, the API returns as JSON, and apply() acts on.
    `blocked` is set when the file should not be applied at all; `needs_confirm`
    when it should only be applied by someone who has read the numbers."""
    by_id = {v["id"]: v for v in vendors}
    by_cat = {}
    for v in vendors:
        by_cat.setdefault(v["category"], []).append(v)

    existing = {s.id: s for s in Supplier.objects.all()}
    from_register = [sid for sid, s in existing.items() if s.registry]

    # Every return below has the same shape — callers read these keys without
    # checking which branch produced them, and an early return with half the
    # keys is a 500 waiting to happen.
    p = {"blocked": None, "needs_confirm": None, "vendors": len(vendors),
         "existing": len(existing), "from_register": len(from_register),
         "new": [], "refresh": [], "outside": [], "drop": [], "held": [],
         "remap": {}, "unmapped": [], "names": {},
         "refs": dict(invited=0, awarded=0, letters=0, bids=0, documents=0, logins=0)}

    # A file that yields nothing is never a legitimate update: it is a partial
    # download or the wrong file. This runs unattended in the deploy build, so
    # the refusal has to live here rather than in the caller.
    if not vendors:
        p["blocked"] = ("That file yielded no vendors, so it would empty the register. "
                        "Check it is the register export and not a partial download.")
        return p

    remap, unmapped = {}, []
    for demo_id, category, hint in DEMO_MAP:
        if demo_id not in existing:
            continue
        pool = by_cat.get(category, [])
        pick = next((v for v in pool if hint.upper() in v["name"].upper()), None)
        if pick is None:
            want = existing[demo_id].prequalified
            pick = next((v for v in pool if v["prequalified"] == want), None) or (pool[0] if pool else None)
        if pick is None:
            unmapped.append(demo_id)
        else:
            remap[demo_id] = pick["id"]

    # Suppliers that did not come from the register — the self-registered test
    # company, anything added through the UI — have an empty `registry` and are
    # never written to or deleted. They were not in the file, so the file has no
    # business replacing them.
    outside = [sid for sid, s in existing.items() if not s.registry and sid not in remap]
    # Suppliers that DID come from the register but are no longer in the file.
    stale = [sid for sid, s in existing.items()
             if s.registry and sid not in by_id and sid not in remap]
    held = referenced(stale)
    drop = [sid for sid in stale if sid not in held]

    p.update({
        "new": [v["id"] for v in vendors if v["id"] not in existing],
        "refresh": [v["id"] for v in vendors if v["id"] in existing],
        "outside": outside,
        "drop": drop,
        "held": held,
        "remap": remap,
        "unmapped": unmapped,
        "names": {sid: existing[sid].name for sid in set(outside) | set(drop) | set(held) | set(remap)},
        "refs": count_refs(remap),
    })
    if unmapped:
        p["blocked"] = ("No register vendor matches seeded supplier(s) %s, so applying this "
                        "would leave a tender pointing at a company that does not exist."
                        % ", ".join(unmapped))
    elif from_register and len(drop) > max(SHRINK_FLOOR, len(from_register) // 5):
        p["needs_confirm"] = ("This file would delete %d of the %d vendors on the register. "
                              "That usually means a partial download or the wrong sheet rather "
                              "than %d companies closing."
                              % (len(drop), len(from_register), len(drop)))
    return p


def referenced(sids):
    """Which of these suppliers something still points at.

    A vendor deleted from the spreadsheet is deleted here too — unless a tender
    invited it, a bid came from it, or somebody logs in as it. Then the record
    stays, because a tender that invited a company is a fact about what
    happened, and the spreadsheet losing a row does not unhappen it."""
    if not sids:
        return []
    want = set(sids)
    hit = set()
    for t in Tender.objects.all():
        hit |= want & set(t.invited or [])
        hit |= want & set(t.letters or {})
        if t.awarded_to in want:
            hit.add(t.awarded_to)
        if (t.award_rec or {}).get("supplierId") in want:
            hit.add(t.award_rec["supplierId"])
    hit |= set(Bid.objects.filter(supplier_id__in=want).values_list("supplier_id", flat=True))
    hit |= set(Document.objects.filter(supplier_id__in=want).values_list("supplier_id", flat=True))
    hit |= set(Profile.objects.filter(supplier_id__in=want).values_list("supplier_id", flat=True))
    return [s for s in sids if s in hit]


def count_refs(remap):
    n = dict(invited=0, awarded=0, letters=0, bids=0, documents=0, logins=0)
    for t in Tender.objects.all():
        n["invited"] += sum(1 for s in (t.invited or []) if s in remap)
        if t.awarded_to in remap:
            n["awarded"] += 1
        n["letters"] += sum(1 for s in (t.letters or {}) if s in remap)
        if (t.award_rec or {}).get("supplierId") in remap:
            n["awarded"] += 1
    n["bids"] = Bid.objects.filter(supplier_id__in=remap).count()
    n["documents"] = Document.objects.filter(supplier_id__in=remap).count()
    n["logins"] = Profile.objects.filter(supplier_id__in=remap).count()
    return n


def apply(vendors, p):
    """Apply a plan. One transaction: either the whole register lands or none of
    it does. Never call this with a plan whose `blocked` is set."""
    if p.get("blocked"):
        raise ValueError(p["blocked"])
    existing = {s.id: s for s in Supplier.objects.all()}
    with transaction.atomic():
        created, refreshed = _write(vendors, existing, protect=set(p["outside"]))
        _rewrite_refs(p["remap"])
        _carry_history(p["remap"], existing)
        seeded = Supplier.objects.filter(pk__in=list(p["remap"])).count()
        Supplier.objects.filter(pk__in=list(p["remap"])).delete()
        dropped = Supplier.objects.filter(pk__in=p["drop"]).delete()[0] if p["drop"] else 0
    return {"created": created, "refreshed": refreshed, "seeded_removed": seeded,
            "dropped": dropped, "total": Supplier.objects.count()}


def _write(vendors, existing, protect):
    """Upsert. Ids are slugs of the company name, so the same company lands on
    the same row every run: new vendors are inserted, vendors already here are
    refreshed in place (keeping the tenders, bids and logins that point at
    them), and nothing is duplicated."""
    insert, update = [], []
    for v in vendors:
        if v["id"] in protect:          # a slug colliding with a non-register id
            v["id"] = v["id"] + "-r"
        fields = {k: v[k] for k in FROM_FILE}
        row = existing.get(v["id"])
        if row is None:
            insert.append(Supplier(id=v["id"], registered_at=v["registered_at"],
                                   rating=v["rating"], docs=v["docs"], perf=v["perf"],
                                   **fields))
            continue
        for k, val in fields.items():
            setattr(row, k, val)
        # the register's paperwork, plus anything uploaded here since
        have = {d.get("name") for d in row.docs}
        row.docs = list(row.docs) + [d for d in v["docs"] if d.get("name") not in have]
        update.append(row)

    Supplier.objects.bulk_create(insert, batch_size=400)
    if update:
        Supplier.objects.bulk_update(update, list(FROM_FILE) + ["docs"], batch_size=400)
    return len(insert), len(update)


def _rewrite_refs(remap):
    for t in Tender.objects.all():
        dirty = False
        if t.invited:
            new = [remap.get(s, s) for s in t.invited]
            if new != t.invited:
                t.invited, dirty = new, True
        if t.awarded_to in remap:
            t.awarded_to, dirty = remap[t.awarded_to], True
        if t.letters:
            new = {remap.get(k, k): v for k, v in t.letters.items()}
            if new != t.letters:
                t.letters, dirty = new, True
        if t.award_rec and t.award_rec.get("supplierId") in remap:
            t.award_rec = dict(t.award_rec, supplierId=remap[t.award_rec["supplierId"]])
            dirty = True
        if dirty:
            t.save()

    for b in Bid.objects.filter(supplier_id__in=remap):
        b.supplier_id = remap[b.supplier_id]
        b.save(update_fields=["supplier_id"])
    for d in Document.objects.filter(supplier_id__in=remap):
        d.supplier_id = remap[d.supplier_id]
        d.save(update_fields=["supplier_id"])
    for pr in Profile.objects.filter(supplier_id__in=remap):
        pr.supplier_id = remap[pr.supplier_id]
        pr.save(update_fields=["supplier_id"])


def _carry_history(remap, existing):
    """The register records no deliveries, so the mapped vendors inherit the
    demo's delivery and quality history. Without it every scorecard in the app
    would be blank, which would say more about the import than about the
    vendors."""
    for demo_id, new_id in remap.items():
        old = existing[demo_id]
        s = Supplier.objects.filter(pk=new_id).first()
        if not s:
            continue
        s.perf = old.perf
        s.rating = old.rating
        have = {d.get("name") for d in s.docs}
        s.docs = list(s.docs) + [d for d in old.docs if d.get("name") not in have]
        s.save(update_fields=["perf", "rating", "docs"])
