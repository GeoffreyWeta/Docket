"""File every document that is waiting into SharePoint now, rather than a few
per background sweep. Run once after SharePoint is first set up:

    python manage.py sharepoint_sync            # everything waiting
    python manage.py sharepoint_sync --retry    # also those that failed five times
"""
from django.core.management.base import BaseCommand

from core import sharepoint
from core.models import Document


class Command(BaseCommand):
    help = "File waiting vendor company documents and opened bid documents into SharePoint."

    def add_arguments(self, parser):
        parser.add_argument("--retry", action="store_true",
                            help="Try again the documents that already failed five times.")

    def handle(self, *args, **opts):
        if not sharepoint.enabled():
            self.stderr.write("SharePoint is not set up: set SHAREPOINT_SITE and the app registration "
                              "(SHAREPOINT_TENANT_ID, SHAREPOINT_CLIENT_ID, SHAREPOINT_CLIENT_SECRET).")
            return
        if opts["retry"]:
            Document.objects.filter(sharepoint_at__isnull=True).update(sharepoint_tries=0)
        filed = failed = 0
        for doc in sharepoint.eligible().iterator():
            if sharepoint.file_one(doc):
                filed += 1
            else:
                failed += 1
        self.stdout.write(f"Filed {filed} document(s) in SharePoint; {failed} failed "
                          f"(the reason is kept on each one and shown to buyers).")
