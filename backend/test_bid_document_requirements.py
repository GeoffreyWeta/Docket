"""Exercise optional/required submission documents through the bid API."""
import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE','docket.settings')
import django
django.setup()
from django.contrib.auth.models import User
from django.test import Client, override_settings
from django.test.runner import DiscoverRunner
from core.models import Supplier, Profile, Tender, Document
from core.views import _apply_tender_payload
from core.util import now_ms

runner=DiscoverRunner(verbosity=0,interactive=False)
database=runner.setup_databases()
try:
    with override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend'):
        supplier=Supplier.objects.create(id='testbidder',name='Test bidder',category='IT')
        user=User.objects.create_user(username='testbidder',password='ExamplePass!2026')
        Profile.objects.create(user=user,supplier=supplier)
        client=Client()
        auth=client.post('/api/auth/login/',{'username':'testbidder','password':'ExamplePass!2026'},content_type='application/json').json()
        client.defaults['HTTP_AUTHORIZATION']='Bearer '+auth['token']
        for index,(technical,commercial) in enumerate(((False,False),(True,False),(False,True),(True,True))):
            tender=Tender.objects.create(id=f'doc{index}',ref=f'DOC-{index}',title='Document test',category='IT',status='published',
                published_at=now_ms()-1000,deadline=now_ms()+86400000,invited=[supplier.id],budget=1000,
                technical_document_required=technical,commercial_document_required=commercial)
            url=f'/api/tenders/{tender.id}/bids/'
            body={'amount':100,'decl':True}
            response=client.post(url,body,content_type='application/json')
            if technical or commercial:
                assert response.status_code==400,response.content
                for envelope,required in (('technical',technical),('commercial',commercial)):
                    if required:
                        Document.objects.create(id=f'd{index}{envelope}',kind='bid',tender=tender,supplier_id=supplier.id,envelope=envelope,
                            name='test.pdf',size=1,data=b'x',uploaded_by='Test',uploaded_at=now_ms())
                response=client.post(url,body,content_type='application/json')
            assert response.status_code==200,response.content
        tender= Tender()
        _apply_tender_payload(tender,{'title':'Draft','technicalDocumentRequired':False,'commercialDocumentRequired':True})
        assert not tender.technical_document_required and tender.commercial_document_required
        _apply_tender_payload(tender,{'title':'Older client'})
        assert not tender.technical_document_required and tender.commercial_document_required
        assert Tender().technical_document_required and not Tender().commercial_document_required
        print('PASS all four document requirement combinations enforced through bid API; draft choices and legacy defaults preserved')
finally:
    runner.teardown_databases(database)
