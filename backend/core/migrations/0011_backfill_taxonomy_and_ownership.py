"""Fill the three new facts from evidence already in the database.

Nothing here invents data. Each step has a source it can be checked against:

  subcategory  the register's own classification wording, through the same
               rules the importer will use from now on
  category     the seven hardcoded tender words mapped onto the register's
               vocabulary, so both sides finally count the same buckets
  owner        the audit chain — the first buyer-side actor on a tender is the
               person who was running it, and the chain is tamper-evident

Where the evidence is silent the field stays empty. An unowned tender is a
visible gap somebody can fix; a tender attributed to a guessed owner is a wrong
number in somebody's appraisal.
"""
from django.db import migrations


def forwards(apps, schema_editor):
    Supplier = apps.get_model("core", "Supplier")
    Tender = apps.get_model("core", "Tender")
    Persona = apps.get_model("core", "Persona")
    Event = apps.get_model("core", "Event")

    from core.taxonomy import canonical, subcategory_for

    # 1) Vendors: derive the second layer from the classification already stored.
    bulk = []
    for s in Supplier.objects.all():
        sub = subcategory_for(s.category, s.classification, s.name)
        if sub != s.subcategory:
            s.subcategory = sub
            bulk.append(s)
    if bulk:
        Supplier.objects.bulk_update(bulk, ["subcategory"], batch_size=500)

    # 2) Tenders: move the seven invented words onto the register's 23.
    for t in Tender.objects.all():
        fixed = canonical(t.category)
        if fixed != t.category:
            Tender.objects.filter(pk=t.pk).update(category=fixed)

    # 3) Tenders: owner from the audit chain. The earliest event by someone who
    #    is not a supplier and not the system — whoever first moved this tender
    #    is who was running it. Ties broken by sequence, which is total.
    by_name = {p.name: p for p in Persona.objects.all()}
    if by_name:
        for t in Tender.objects.filter(owner__isnull=True):
            ev = (Event.objects.filter(tender_id=t.id)
                  .exclude(role__in=("supplier", "system"))
                  .order_by("seq").first())
            person = by_name.get(ev.actor) if ev else None
            if person:
                Tender.objects.filter(pk=t.pk).update(owner=person.id)


def backwards(apps, schema_editor):
    """Deliberately not reversible in the data sense: the old category words
    carried less information than the ones replacing them, and restoring them
    would mean choosing which of "Dairy" or "Food & Produce" a row used to say.
    The schema migration below this one still reverses cleanly."""
    pass


class Migration(migrations.Migration):

    dependencies = [("core", "0010_persona_manager_supplier_invite_count_and_more")]

    operations = [migrations.RunPython(forwards, backwards)]
