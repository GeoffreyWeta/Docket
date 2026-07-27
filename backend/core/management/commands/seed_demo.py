from django.core.management.base import BaseCommand

from core.models import Tender
from core.seed import seed_all


class Command(BaseCommand):
    help = "Seed the demo workspace (skips if data exists unless --force)."

    def add_arguments(self, parser):
        parser.add_argument("--force", action="store_true")

    def handle(self, *args, **opts):
        if Tender.objects.exists() and not opts["force"]:
            self.stdout.write("Data already present — skipping seed (use --force to reseed).")
            return
        seed_all()
        self.stdout.write(self.style.SUCCESS("Demo workspace seeded."))
