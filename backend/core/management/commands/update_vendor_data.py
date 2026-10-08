"""Add/update vendor reference data from a flat CSV without replacing the register."""
import csv
import hashlib
from collections import Counter, defaultdict

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from core.models import Supplier
from core.taxonomy import subcategory_for
from core.vendor_import import category_for, first_email, location_for


class Command(BaseCommand):
    help = "Update initial vendor reference data from CSV; preserve workflow state and absent vendors."

    def add_arguments(self, parser):
        parser.add_argument("--file", required=True)
        parser.add_argument("--commit", action="store_true")

    @transaction.atomic
    def handle(self, *args, **opts):
        with open(opts["file"], encoding="utf-8-sig", newline="") as stream:
            reader = csv.DictReader(stream)
            required = {"vendor_id", "vendor_code", "vendor_name", "category", "email"}
            if not required.issubset(reader.fieldnames or []):
                raise CommandError("Missing CSV columns: " + ", ".join(sorted(required - set(reader.fieldnames or []))))
            rows = list(reader)
        if not rows:
            raise CommandError("The file contains no vendors.")
        existing = list(Supplier.objects.select_for_update().all())
        by_name, by_code = defaultdict(list), defaultdict(list)
        normalize = lambda text: " ".join(text.casefold().split())
        for supplier in existing:
            by_name[normalize(supplier.name)].append(supplier)
            if supplier.code:
                by_code[supplier.code.casefold()].append(supplier)
        created = updated = merged = 0
        incoming_codes = Counter((row.get("vendor_code") or "").strip().casefold() for row in rows)
        changed = {}
        seen = set()
        for number, row in enumerate(rows, 2):
            row = {k: (v or "").strip() for k, v in row.items() if k}
            name, code = row.get("vendor_name", ""), row.get("vendor_code", "")
            if not name or not row.get("vendor_id"):
                raise CommandError(f"Row {number}: vendor name and source ID are required.")
            key = normalize(name)
            if key in seen:
                merged += 1
            seen.add(key)
            candidates = by_name[key]
            if len(candidates) > 1:
                candidates = [s for s in candidates if s.code.casefold() == code.casefold()]
            if not candidates and code:
                # Repeated codes in the export are not a reliable identity.
                codes = by_code[code.casefold()]
                if len(codes) == 1 and incoming_codes[code.casefold()] == 1:
                    candidates = codes
            if len(candidates) > 1:
                raise CommandError(f"Row {number}: ambiguous existing vendor; no data was written.")
            if candidates:
                supplier = candidates[0]
                if supplier not in by_name[key]:
                    by_name[key].append(supplier)
            else:
                sid = "vc" + hashlib.sha256(key.encode()).hexdigest()[:14]
                if any(s.id == sid for s in existing):
                    raise CommandError(f"Row {number}: vendor ID collision.")
                supplier = Supplier(id=sid)
                existing.append(supplier)
                by_name[key].append(supplier)
                if code:
                    by_code[code.casefold()].append(supplier)
                created += 1
            raw_category = row.get("category", "")
            category = category_for(raw_category, name)
            email, others = first_email(row.get("email"))
            values = {"name": name, "code": code, "classification": raw_category,
                      "category": category, "subcategory": subcategory_for(category, raw_category, name),
                      "contact_person": row.get("contact_person", ""), "contact_email": email,
                      "phone": row.get("phone", ""), "address": row.get("address", ""),
                      "payment_terms": row.get("payment_terms", ""),
                      "location": location_for(row.get("address", ""), row.get("phone", ""))}
            for field, value in values.items():
                limit = Supplier._meta.get_field(field).max_length
                if len(value) > limit:
                    raise CommandError(f"Row {number}: {field} exceeds {limit} characters; no data was written.")
                if value:  # missing cells do not erase details already recorded
                    setattr(supplier, field, value)
            registry = dict(supplier.registry or {})
            registry.update({"referenceSource": "vendors_import.csv", "vendorType": row.get("vendor_type", ""),
                             "referenceIds": list(dict.fromkeys(registry.get("referenceIds", []) + [row["vendor_id"]]))})
            if others:
                registry["otherEmails"] = list(dict.fromkeys(registry.get("otherEmails", []) + others))
            supplier.registry = registry
            changed[supplier.id] = supplier
        updated = len(changed) - created
        if opts["commit"]:
            for supplier in changed.values():
                supplier.save()
        self.stdout.write(f"{len(rows)} rows; {len(changed)} distinct vendors; {created} new; {updated} existing; {merged} repeated-name rows.")
        self.stdout.write("Applied. Existing workflow state and absent vendors retained." if opts["commit"] else "Dry run. Nothing written.")
