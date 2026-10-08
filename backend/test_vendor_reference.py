"""Exercise additive reference imports in an isolated test database."""
import csv
import io
import os
import tempfile

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "docket.settings")
import django
django.setup()

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test.runner import DiscoverRunner
from core.models import Supplier

runner = DiscoverRunner(verbosity=0)
database = runner.setup_databases()
try:
    Supplier.objects.create(id="existing", name="Existing Ltd", code="V-1", category="Legal",
                            suspended=True, suspended_reason="Recorded decision", prequalified=True,
                            docs=[{"name": "Approved document"}], perf={"onTime": 90})
    Supplier.objects.create(id="absent", name="Absent Vendor", category="Legal")
    with tempfile.TemporaryDirectory() as directory:
        path = os.path.join(directory, "vendors.csv")
        fields = ["vendor_id", "vendor_code", "vendor_name", "category", "email"]
        rows = [dict(zip(fields, ["local:1", "V-1", "Existing Renamed Ltd", "LEGAL SERVICES", "contact@example.com"])),
                dict(zip(fields, ["local:2", "V-2", "New Vendor", "PRINTING", "new@example.com"]))]
        def write():
            with open(path, "w", newline="", encoding="utf-8") as stream:
                writer = csv.DictWriter(stream, fieldnames=fields)
                writer.writeheader(); writer.writerows(rows)
        write()
        call_command("update_vendor_data", file=path, stdout=io.StringIO())
        assert Supplier.objects.count() == 2
        call_command("update_vendor_data", file=path, commit=True, stdout=io.StringIO())
        call_command("update_vendor_data", file=path, commit=True, stdout=io.StringIO())
        assert Supplier.objects.count() == 3
        supplier = Supplier.objects.get(pk="existing")
        assert supplier.name == "Existing Renamed Ltd" and supplier.contact_email == "contact@example.com"
        assert supplier.suspended and supplier.suspended_reason == "Recorded decision" and supplier.prequalified
        assert supplier.docs == [{"name": "Approved document"}] and supplier.perf == {"onTime": 90}
        rows[0]["vendor_name"] = "Changed Again"
        rows[1]["vendor_name"] = "x" * 121
        write()
        try:
            call_command("update_vendor_data", file=path, commit=True, stdout=io.StringIO())
            raise AssertionError("invalid file was accepted")
        except CommandError:
            pass
        assert Supplier.objects.get(pk="existing").name == "Existing Renamed Ltd"
    print("PASS dry run, idempotency, stable code identity, blacklist/verification/history preservation, absent vendor retention and atomic rejection")
finally:
    runner.teardown_databases(database)
