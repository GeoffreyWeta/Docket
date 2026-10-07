"""Let whoever set a workspace up keep its role list right.

Setup now grants `team.roles` to the person who runs it, beside the
`settings.threshold` grant it always made, so they can rename and reshape the
roles they described on day one. A workspace set up before that has an owner
holding only the second grant. This gives them the first, recognising them the
same way: a buyer-side account carrying `settings.threshold` as a per-person
grant, which only setup ever handed out by default.
"""
from django.db import migrations


def grant(apps, schema_editor):
    Profile = apps.get_model("core", "Profile")
    for prof in Profile.objects.filter(persona__isnull=False):
        extra = list(prof.perm_extra or [])
        if "settings.threshold" in extra and "team.roles" not in extra:
            prof.perm_extra = extra + ["team.roles"]
            prof.save(update_fields=["perm_extra"])


class Migration(migrations.Migration):

    dependencies = [("core", "0025_vendor_location_blank_marker")]

    operations = [migrations.RunPython(grant, migrations.RunPython.noop)]
