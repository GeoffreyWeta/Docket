"""Give every row that predates the data feed a starting cursor.

`updated_at` is a change cursor, not a business timestamp. Its only contract is
that it does not go backwards and that a row which changed later carries a
larger value — which is what lets a consumer say "everything after this point"
and be sure of getting it.

For rows that existed before this migration we genuinely do not know when they
last changed, and the shapes of the two available lies are worth naming:

  * Deriving one from business fields — a tender's `awarded_at`, a vendor's
    `registered_at` — looks more informative and asserts something false, that
    the row has not been touched since. Tenders acquire documents, addenda and
    corrections long after award.

  * Leaving them at 0 dates every pre-existing row to 1970 in the customer's
    warehouse, where `updated_at` will be read as a modification time by the
    first analyst who finds it.

So they are all stamped with this migration's own timestamp, which is the one
true statement available: this row changed at some point at or before the
feature that started recording it. The pair `(updated_at, id)` remains a total
order, so the first sync walks them in id order and pages correctly. Every one
of them is exported on that first pull, which is exactly right — an initial
load is supposed to be everything.
"""
from django.db import migrations


MODELS = ["Bid", "Contract", "GoodsReceipt", "Invoice", "Item", "Payment",
          "Persona", "PurchaseOrder", "Supplier", "Tender"]


def stamp(apps, schema_editor):
    import time
    now = int(time.time() * 1000)
    for name in MODELS:
        model = apps.get_model("core", name)
        # The historical model has a plain manager, so this is Django's own
        # bulk UPDATE and not SyncableQuerySet.update() — which is what we
        # want here: one statement, one value, no per-row timestamp drift.
        model.objects.filter(updated_at=0).update(updated_at=now)


def unstamp(apps, schema_editor):
    for name in MODELS:
        apps.get_model("core", name).objects.update(updated_at=0)


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0018_apikey_tombstone_bid_updated_at_contract_updated_at_and_more"),
    ]

    operations = [migrations.RunPython(stamp, unstamp)]
