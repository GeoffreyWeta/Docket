"""Mint, list and revoke data feed keys.

    docket-manage app apikey list
    docket-manage app apikey new "Finance warehouse" --scopes feed.procurement,feed.commercial
    docket-manage app apikey revoke <prefix-or-id>

A command rather than a console screen because issuing a credential to another
company's data pipeline is an act of provisioning, not day-to-day workspace
administration: it is done once per integration, by whoever runs the
deployment, and there is no reason for it to be reachable from a browser
session that an attacker could ride.
"""
from django.core.management.base import BaseCommand, CommandError

from core.datafeed import SCOPES
from core.feed_views import mint
from core.models import ApiKey
from core.util import fmt_date_ms, now_ms


class Command(BaseCommand):
    help = "Manage outbound data feed API keys."

    def add_arguments(self, parser):
        parser.add_argument("action", choices=["list", "new", "revoke", "scopes"])
        parser.add_argument("target", nargs="?", default="",
                            help="Key name (new) or prefix/id (revoke).")
        parser.add_argument("--scopes", default="feed.procurement",
                            help="Comma-separated. 'apikey scopes' lists them.")
        parser.add_argument("--by", default="", help="Who issued it, for the record.")

    def handle(self, *a, **o):
        return getattr(self, f"_{o['action']}")(o)

    def _scopes(self, o):
        for k, v in SCOPES.items():
            self.stdout.write(f"  {k:<20} {v}")

    def _list(self, o):
        keys = list(ApiKey.objects.all())
        if not keys:
            self.stdout.write("No API keys. Mint one with: apikey new \"<name>\"")
            return
        for k in keys:
            state = "revoked" if not k.active else "active"
            used = fmt_date_ms(k.last_used) if k.last_used else "never used"
            self.stdout.write(
                f"  {k.prefix}..  {state:<8} {k.name}\n"
                f"      scopes: {', '.join(k.scopes or []) or '(none)'}\n"
                f"      {k.calls} calls, last {used}")

    def _new(self, o):
        name = (o.get("target") or "").strip()
        if not name:
            raise CommandError('A name is required: apikey new "Finance warehouse"')
        scopes = [s.strip() for s in (o["scopes"] or "").split(",") if s.strip()]
        try:
            raw, key = mint(name, scopes, created_by=o.get("by") or "")
        except ValueError as e:
            raise CommandError(f"{e}\nKnown scopes: {', '.join(SCOPES)}")

        # Printed once, here, and never recoverable. Said plainly because the
        # person reading this is about to close the terminal.
        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS(raw))
        self.stdout.write("")
        self.stdout.write(f"  {key.name} - scopes: {', '.join(key.scopes)}")
        self.stdout.write("  This is the only time the key is shown. Store it now;")
        self.stdout.write("  only its hash is kept here and it cannot be recovered.")

    def _revoke(self, o):
        t = (o.get("target") or "").strip()
        if not t:
            raise CommandError("Which key? Give its prefix or id (see: apikey list).")
        key = (ApiKey.objects.filter(pk=t).first()
               or ApiKey.objects.filter(prefix__startswith=t).first())
        if not key:
            raise CommandError(f"No key matching {t!r}.")
        if not key.active:
            self.stdout.write(f"{key.prefix}.. was already revoked.")
            return
        key.revoked_at = now_ms()
        key.save(update_fields=["revoked_at"])
        self.stdout.write(self.style.SUCCESS(f"Revoked {key.prefix}.. ({key.name})."))
