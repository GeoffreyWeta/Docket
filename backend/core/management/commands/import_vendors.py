"""Replace the supplier register with the vendor master export.

    manage.py import_vendors                      # dry run: report, change nothing
    manage.py import_vendors --commit             # do it
    manage.py import_vendors --file other.json --commit

Re-runnable: export the spreadsheet to JSON again, drop it at
backend/data/vendors.json, and run it. The register in the database is replaced
wholesale each time, so a vendor deleted from the spreadsheet disappears here
too, and nothing accumulates.

The one subtlety is that the demo tenders, bids, award letters and supplier
logins all point at the twelve seeded suppliers. Deleting those without a
thought would leave nine tenders inviting companies that no longer exist. So
each seeded supplier is mapped onto a real vendor in the same line of business,
every reference is rewritten to the new id, and only then are the old records
removed. The demo keeps working end to end; the names in it become real.
"""
import os

from django.core.management.base import BaseCommand
from django.db import transaction

from core.models import Bid, Document, Event, Profile, Supplier, Tender
from core.vendor_import import build

DEFAULT_FILE = os.path.join("data", "vendors.json")

# Each seeded supplier and the register category it should become. The name is
# a hint, not a lookup: the first prequalified vendor in that category whose
# name contains the hint wins, else the first prequalified vendor in the
# category. `keep_perf` carries the demo's delivery history onto the real
# vendor so the scorecards, evaluations and award trail still have something to
# score; every other imported vendor starts with no history, which is the truth.
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


class Command(BaseCommand):
    help = "Replace the supplier register from the vendor master export."

    def add_arguments(self, parser):
        parser.add_argument("--file", default=DEFAULT_FILE,
                            help="Register export as JSON (default: %s)" % DEFAULT_FILE)
        parser.add_argument("--commit", action="store_true",
                            help="Write to the database. Without it, this only reports.")
        parser.add_argument("--shrink-ok", action="store_true",
                            help="Allow a run that would delete a large part of the register. "
                                 "Needed only when the spreadsheet genuinely got much smaller.")

    def handle(self, *args, **opts):
        path = opts["file"]
        if not os.path.exists(path):
            self.stderr.write("No such file: %s" % path)
            return

        vendors, report = build(path)
        w = self.stdout.write

        # This runs unattended in build.sh, so a truncated download or the wrong
        # file must not be allowed to empty the register. A file that yields no
        # vendors is never a legitimate update.
        if not vendors:
            self.stderr.write("That file yielded no vendors. Refusing to touch the register.")
            self.stderr.write("Check it is the register export and not a partial download.")
            return

        w("")
        w("register: %s" % path)
        w("  %d rows -> %d vendors (%d duplicate vendor(s) merged)"
          % (report["rows"], report["vendors"], len(report["merged"])))
        w("  %d prequalified, %d held out of tendering"
          % (report["vendors"] - report["not_prequalified"], report["not_prequalified"]))
        if report["uncategorised"]:
            w("  %d with no category the register or the name could supply"
              % len(report["uncategorised"]))
        if report["no_location"]:
            w("  %d with no recognisable place in the address" % len(report["no_location"]))
        if report["unparsed_dates"]:
            w("  %d registration date(s) left unset, unparseable: %s"
              % (len(report["unparsed_dates"]),
                 ", ".join(d["value"] for d in report["unparsed_dates"][:4])))
        for m in report["merged"]:
            w("  merged: %s (%s) <- %s" % (m["kept"], m["kept_code"] or "no code",
                                           ", ".join("%s (%s)" % (a["name"], a["code"] or "no code")
                                                     for a in m["also"])))

        by_id = {v["id"]: v for v in vendors}
        by_cat = {}
        for v in vendors:
            by_cat.setdefault(v["category"], []).append(v)

        # Choose a real vendor for each seeded one, so nothing is left pointing
        # at a company that is about to be deleted.
        existing = {s.id: s for s in Supplier.objects.all()}
        remap, unmapped = {}, []
        for demo_id, category, hint in DEMO_MAP:
            if demo_id not in existing:
                continue
            pool = by_cat.get(category, [])
            pick = next((v for v in pool if hint.upper() in v["name"].upper()), None)
            if pick is None:
                want_pq = existing[demo_id].prequalified
                pick = next((v for v in pool if v["prequalified"] == want_pq), None) or (pool[0] if pool else None)
            if pick is None:
                unmapped.append(demo_id)
            else:
                remap[demo_id] = pick["id"]

        # Suppliers that did not come from the register — the self-registered
        # test company, anything added through the UI — are identified by an
        # empty `registry`, and are never written to or deleted. They were not
        # in the file, so the file has no business replacing them.
        outside = [sid for sid, s in existing.items() if not s.registry and sid not in remap]
        # Suppliers that DID come from the register but are no longer in the
        # file: the company was removed from the spreadsheet.
        stale = [sid for sid, s in existing.items()
                 if s.registry and sid not in by_id and sid not in remap]
        stale_held = self._referenced(stale)
        stale_drop = [sid for sid in stale if sid not in stale_held]
        fresh = [v["id"] for v in vendors if v["id"] not in existing]
        update = [v["id"] for v in vendors if v["id"] in existing]

        w("")
        w("demo suppliers -> register vendors")
        for demo_id, new_id in remap.items():
            v = by_id[new_id]
            w("  %-4s %-26s -> %-40s %s%s"
              % (demo_id, existing[demo_id].name[:26], v["name"][:40], v["category"],
                 "" if v["prequalified"] else "  (held out: unqualified in the register)"))
        for sid in outside:
            w("  %-4s %-26s    kept as is, not from the register" % (sid, existing[sid].name[:26]))
        if unmapped:
            w("  NO MATCH for %s: aborting rather than leaving a dangling reference" % ", ".join(unmapped))
            return

        refs = self._count_refs(remap)
        w("")
        w("references to rewrite: %d tender invite(s), %d award(s), %d letter(s), "
          "%d bid(s), %d document(s), %d login(s), %d event(s)"
          % (refs["invited"], refs["awarded"], refs["letters"], refs["bids"],
             refs["documents"], refs["logins"], refs["events"]))

        w("")
        w("against the register already in the database (%d supplier(s))" % len(existing))
        w("  %d new, %d refreshed in place, %d untouched (not from the register)"
          % (len(fresh), len(update), len(outside)))
        if stale_drop:
            w("  %d gone from the spreadsheet, will be deleted: %s"
              % (len(stale_drop), ", ".join(existing[s].name[:34] for s in stale_drop[:5])
                 + (", ..." if len(stale_drop) > 5 else "")))
        if stale_held:
            w("  %d gone from the spreadsheet but KEPT, still referenced by a tender, "
              "bid or login: %s" % (len(stale_held),
                                    ", ".join(existing[s].name[:34] for s in stale_held[:5])))

        # A spreadsheet does not normally lose a fifth of its rows between
        # exports. When it looks like it has, the likelier explanation is a
        # partial download or the wrong sheet, and this runs unattended in a
        # deploy, so it stops and says so rather than deleting the register.
        from_register = sum(1 for s in existing.values() if s.registry)
        if from_register and len(stale_drop) > max(20, from_register // 5) and not opts["shrink_ok"]:
            self.stderr.write("")
            self.stderr.write(
                "STOPPING: this file would delete %d of the %d vendors on the register."
                % (len(stale_drop), from_register))
            self.stderr.write(
                "That usually means a partial download or the wrong file rather than %d "
                "companies closing. Check the file, then pass --shrink-ok if it really is "
                "correct." % len(stale_drop))
            return

        if not opts["commit"]:
            w("")
            w("dry run. Nothing written. Re-run with --commit to apply.")
            return

        with transaction.atomic():
            created, refreshed = self._write_vendors(vendors, existing, protect=set(outside))
            self._rewrite_refs(remap)
            self._carry_history(remap, existing)
            gone = self._drop_demo(remap)
            dropped = Supplier.objects.filter(pk__in=stale_drop).delete()[0] if stale_drop else 0

        w("")
        w("wrote %d new vendor(s), refreshed %d, removed %d seeded supplier(s) "
          "and %d no longer in the spreadsheet." % (created, refreshed, gone, dropped))
        w("register now holds %d suppliers." % Supplier.objects.count())

    # ------------------------------------------------------------------ steps

    def _count_refs(self, remap):
        n = dict(invited=0, awarded=0, letters=0, bids=0, documents=0, logins=0, events=0)
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
        n["events"] = Event.objects.filter(detail__in=[]).count()  # events carry names, not ids
        return n

    # Written from the file on every run. Everything else on a Supplier —
    # perf, rating, and any document the register did not supply — is earned in
    # DOCKET, not in the spreadsheet, so a re-import must not touch it. The
    # register has no delivery history to offer; overwriting one with nothing
    # would blank every scorecard and look like an import bug.
    FROM_FILE = ("name", "category", "location", "prequalified", "rejected_reason",
                 "contact_email", "code", "classification", "contact_person",
                 "phone", "address", "payment_terms", "registry")

    def _referenced(self, sids):
        """Which of these suppliers something still points at.

        A vendor deleted from the spreadsheet is deleted here too — unless a
        tender invited it, a bid came from it, or somebody logs in as it. Then
        the record stays, because a tender that invited a company is a fact
        about what happened, and the spreadsheet losing a row does not unhappen
        it. The dry run says which, so the choice is visible."""
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

    def _write_vendors(self, vendors, existing, protect):
        """Upsert the register. Ids are slugs of the company name, so the same
        company lands on the same row every run: new vendors are inserted,
        vendors already here are refreshed in place (keeping the tenders, bids
        and logins that point at them), and nothing is duplicated."""
        insert, update = [], []
        for v in vendors:
            if v["id"] in protect:      # a slug colliding with a non-register id
                v["id"] = v["id"] + "-r"
            fields = {k: v[k] for k in self.FROM_FILE}
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
            Supplier.objects.bulk_update(update, list(self.FROM_FILE) + ["docs"], batch_size=400)
        return len(insert), len(update)

    def _rewrite_refs(self, remap):
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
        for p in Profile.objects.filter(supplier_id__in=remap):
            p.supplier_id = remap[p.supplier_id]
            p.save(update_fields=["supplier_id"])

    def _carry_history(self, remap, existing):
        """The register records no deliveries, so the mapped vendors inherit the
        demo's delivery and quality history. Without it every scorecard in the
        app would be blank, which would say more about the import than about
        the vendors."""
        for demo_id, new_id in remap.items():
            old = existing[demo_id]
            s = Supplier.objects.filter(pk=new_id).first()
            if not s:
                continue
            s.perf = old.perf
            s.rating = old.rating
            # keep the register's own paperwork, add the demo's dated documents
            # so the expiry radar still has something to warn about
            have = {d.get("name") for d in s.docs}
            s.docs = list(s.docs) + [d for d in old.docs if d.get("name") not in have]
            s.save(update_fields=["perf", "rating", "docs"])

    def _drop_demo(self, remap):
        n = Supplier.objects.filter(pk__in=list(remap)).count()
        Supplier.objects.filter(pk__in=list(remap)).delete()
        return n
