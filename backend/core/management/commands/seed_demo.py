from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from core.models import Tender
from core.seed import seed_all


class Command(BaseCommand):
    help = "Seed the demo workspace (skips if data exists unless --force)."

    def add_arguments(self, parser):
        parser.add_argument("--force", action="store_true")

    def handle(self, *args, **opts):
        if Tender.objects.exists() and not opts["force"]:
            self.stdout.write("Data already present - skipping seed (use --force to reseed).")
            return
        # --force deletes everything first. On the demo that is the nightly
        # reset; on a real workspace it is the company's whole record replaced
        # with an invented one, from one mistyped cron line. Same gate as the
        # reset endpoint: the demo is the deployment with DEMO_LOGIN=1.
        if Tender.objects.exists() and not settings.DEMO_LOGIN:
            raise CommandError("DEMO_LOGIN is off, so this is a real workspace. "
                               "Refusing to wipe it and reseed the demo.")
        seed_all()
        self.stdout.write(self.style.SUCCESS("Demo workspace seeded."))
