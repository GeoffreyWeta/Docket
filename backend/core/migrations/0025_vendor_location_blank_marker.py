"""A vendor with no recorded location used to be stored with an em dash as its
location. The marker is now a plain hyphen (see vocab.location), so the old rows
are moved across. `updated_at` is bumped so the data feed sends them again.

The old character is written as an escape on purpose: this codebase does not
use the em dash, and the build refuses one (frontend/tools/no-em-dash.mjs).
"""
from django.db import migrations

OLD = "\u2014"
NEW = "-"


def forward(apps, schema_editor):
    import time
    Supplier = apps.get_model("core", "Supplier")
    Supplier.objects.filter(location=OLD).update(location=NEW, updated_at=int(time.time() * 1000))


class Migration(migrations.Migration):

    dependencies = [("core", "0024_document_auction")]

    operations = [migrations.RunPython(forward, migrations.RunPython.noop)]
