"""Open/closed tenders, the visible ceiling, offered quantities, and audit
review for bids from companies not on the vendor register.

Every vendor already in Docket is on the register: the ~1,400 came from the
company's own vendor list, and the ones that read "Pending registration" were
added before the flag existed or imported without a register date. They are
marked registered here. Each one also gets its "registration awaiting review"
reminder marked as already sent, or audit would receive one per unverified
vendor three days after this runs.
"""
from django.db import migrations, models

NEW_CAP = "bid.approve_new_vendor"


def forwards(apps, schema_editor):
    import time
    Supplier = apps.get_model("core", "Supplier")
    TaskMark = apps.get_model("core", "TaskMark")
    OrgSetting = apps.get_model("core", "OrgSetting")
    now = int(time.time() * 1000)

    ids = list(Supplier.objects.filter(registered_at__isnull=True).values_list("id", flat=True))
    Supplier.objects.filter(id__in=ids).update(registered_at=now)
    have = set(TaskMark.objects.filter(key__startswith="regnudge:").values_list("key", flat=True))
    TaskMark.objects.bulk_create(
        [TaskMark(key=f"regnudge:{sid}", at=now) for sid in ids if f"regnudge:{sid}" not in have],
        batch_size=500)

    # A company that changed what its audit role carries keeps its own list;
    # this adds the new approval to it. Untouched starter roles pick it up from
    # the shipped defaults with no row to change.
    row = OrgSetting.objects.filter(pk=1).first()
    if row and isinstance((row.data or {}).get("roles"), dict):
        data = dict(row.data)
        roles = dict(data["roles"])
        auditor = dict(roles.get("auditor") or {})
        if isinstance(auditor.get("perms"), list) and NEW_CAP not in auditor["perms"]:
            auditor["perms"] = sorted(auditor["perms"] + [NEW_CAP])
            roles["auditor"] = auditor
            data["roles"] = roles
            row.data = data
            row.save(update_fields=["data"])


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0030_tender_commercial_document_required_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="tender",
            name="bid_mode",
            field=models.CharField(choices=[("closed", "Closed (sealed)"), ("open", "Open (vendors see their position)")],
                                   default="closed", max_length=8),
        ),
        migrations.AddField(
            model_name="tender",
            name="budget_visible",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="bid",
            name="qtys",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="bid",
            name="review",
            field=models.CharField(blank=True, default="", max_length=10),
        ),
        migrations.AddField(
            model_name="bid",
            name="review_by",
            field=models.CharField(blank=True, default="", max_length=120),
        ),
        migrations.AddField(
            model_name="bid",
            name="review_at",
            field=models.BigIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="bid",
            name="review_note",
            field=models.CharField(blank=True, default="", max_length=300),
        ),
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
