"""Imported live reference vendors cannot be selected for demo bids/invitations."""
import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'docket.settings')
import django
django.setup()
from django.test import override_settings
from django.test.runner import DiscoverRunner
from core.models import Supplier

runner = DiscoverRunner(verbosity=0, interactive=False)
database = runner.setup_databases()
try:
    with override_settings(DEMO_LOGIN=False):
        Supplier.objects.create(id='real-vendor', name='Real imported company', category='IT',
                                registry={'referenceSource':'vendors_import.csv'})
        Supplier.objects.create(id='demo-vendor', name='Demo bidder', category='IT')
        Supplier.objects.create(id='new-demo', name='New demo company', category='IT', registry={'source':'invite'})
        assert Supplier.objects.count() == 3
    with override_settings(DEMO_LOGIN=True):
        assert set(Supplier.objects.values_list('id',flat=True)) == {'demo-vendor','new-demo'}
        assert not Supplier.objects.filter(pk='real-vendor').exists()
        assert Supplier._base_manager.filter(pk='real-vendor').exists()
    with override_settings(DEMO_LOGIN=False):
        assert Supplier.objects.count() == 3
    print('PASS demo excludes imported real vendors; fixtures/new demo bidders remain; live data retained')
finally:
    runner.teardown_databases(database)
