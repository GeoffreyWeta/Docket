from django.core.management.base import BaseCommand
from django.db import transaction
from core.models import AccessRole
from core.util import now_ms, record_event
from core.workspace_jobs import job_templates


class Command(BaseCommand):
    help = "Add procurement job roles without changing existing roles, accounts or reporting lines."

    @transaction.atomic
    def handle(self, *args, **options):
        added = []
        for job in job_templates():
            if job["key"] == "auditor":  # existing starter remains customisable
                continue
            _, created = AccessRole.objects.get_or_create(key=job["key"], defaults={
                "label":job["label"], "title":job["label"], "note":job["note"],
                "perms":job["perms"], "created":now_ms(), "created_by":"Workspace setup"})
            if created:
                added.append(job["label"])
        if added:
            record_event(actor="Workspace setup", role="system", action="Procurement roles configured",
                         detail="Added " + ", ".join(added) + ". Staff assignments and approval limits remain unchanged.")
        self.stdout.write(f"Added {len(added)} job roles. Existing assignments retained.")
