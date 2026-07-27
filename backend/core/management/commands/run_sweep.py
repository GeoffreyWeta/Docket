from django.core.management.base import BaseCommand

from core.tasks import run_sweep


class Command(BaseCommand):
    help = "Run the idempotent background sweep (sealing events, reminders, expiry alerts)."

    def handle(self, *args, **opts):
        run_sweep()
        self.stdout.write(self.style.SUCCESS("Sweep complete."))
