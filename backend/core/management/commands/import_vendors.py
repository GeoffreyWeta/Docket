"""Replace the supplier register with the vendor master export.

    manage.py import_vendors                      # dry run: report, change nothing
    manage.py import_vendors --commit             # do it
    manage.py import_vendors --file other.json --commit

Re-runnable: export the spreadsheet to JSON again, drop it at
backend/data/vendors.json, and run it. Vendor ids are slugs of the company name,
so the same company lands on the same row every time — new companies are added,
existing ones refreshed in place, and ones deleted from the spreadsheet deleted
here too. Running it twice leaves one copy of everything.

The decisions all live in core/vendor_sync.py, which the upload on the Suppliers
page also uses. This file only reads the arguments and prints the result.
"""
import os

from django.core.management.base import BaseCommand

from core import vendor_sync
from core.vendor_import import build

DEFAULT_FILE = os.path.join("data", "vendors.json")


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

        p = vendor_sync.plan(vendors)
        if p["blocked"]:
            self.stderr.write("")
            self.stderr.write("STOPPING: %s" % p["blocked"])
            return

        name = p["names"]
        w("")
        w("demo suppliers -> register vendors")
        by_id = {v["id"]: v for v in vendors}
        for demo_id, new_id in p["remap"].items():
            v = by_id[new_id]
            w("  %-4s %-26s -> %-40s %s%s"
              % (demo_id, name[demo_id][:26], v["name"][:40], v["category"],
                 "" if v["prequalified"] else "  (held out: unqualified in the register)"))
        for sid in p["outside"]:
            w("  %-4s %-26s    kept as is, not from the register" % (sid, name[sid][:26]))

        r = p["refs"]
        w("")
        w("references to rewrite: %d tender invite(s), %d award(s), %d letter(s), "
          "%d bid(s), %d document(s), %d login(s)"
          % (r["invited"], r["awarded"], r["letters"], r["bids"], r["documents"], r["logins"]))

        w("")
        w("against the register already in the database (%d supplier(s))" % p["existing"])
        w("  %d new, %d refreshed in place, %d untouched (not from the register)"
          % (len(p["new"]), len(p["refresh"]), len(p["outside"])))
        if p["drop"]:
            w("  %d gone from the spreadsheet, will be deleted: %s"
              % (len(p["drop"]), ", ".join(name[s][:34] for s in p["drop"][:5])
                 + (", ..." if len(p["drop"]) > 5 else "")))
        if p["held"]:
            w("  %d gone from the spreadsheet but KEPT, still referenced by a tender, "
              "bid or login: %s" % (len(p["held"]), ", ".join(name[s][:34] for s in p["held"][:5])))

        if p["needs_confirm"] and not opts["shrink_ok"]:
            self.stderr.write("")
            self.stderr.write("STOPPING: %s" % p["needs_confirm"])
            self.stderr.write("Check the file, then pass --shrink-ok if it really is correct.")
            return

        if not opts["commit"]:
            w("")
            w("dry run. Nothing written. Re-run with --commit to apply.")
            return

        out = vendor_sync.apply(vendors, p)
        w("")
        w("wrote %d new vendor(s), refreshed %d, removed %d seeded supplier(s) "
          "and %d no longer in the spreadsheet."
          % (out["created"], out["refreshed"], out["seeded_removed"], out["dropped"]))
        w("register now holds %d suppliers." % out["total"])
