"""Create (or repair) an administration-console account.

    python manage.py create_superadmin --username you@example.com
    python manage.py create_superadmin --username you@example.com --password '...'

With no --password a strong one is generated and printed once. The account gets
a profile with no persona, so it can sign in at /superadmin and nowhere else: it
manages people and capabilities and takes no part in tendering.

Re-running it on an existing username promotes that account instead of failing,
and --password resets the password (revoking every session).
"""
import secrets
import string

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand, CommandError

from core.models import Profile

ALPHABET = string.ascii_letters + string.digits + "!@#$%^&*-_=+"


def strong_password(n=20):
    return "".join(secrets.choice(ALPHABET) for _ in range(n))


class Command(BaseCommand):
    help = "Create or promote an administration-console (superuser) account."

    def add_arguments(self, parser):
        parser.add_argument("--username", required=True, help="Sign-in name; a work email is the convention.")
        parser.add_argument("--password", default="", help="Omit to have one generated and printed once.")
        parser.add_argument("--name", default="", help="Display name shown in the console and its log.")
        parser.add_argument("--email", default="", help="Defaults to the username when it looks like an address.")
        parser.add_argument("--keep-persona", action="store_true",
                            help="Promote an existing team member without touching their workspace role.")

    def handle(self, *args, **o):
        username = o["username"].strip().lower()
        if len(username) < 3:
            raise CommandError("Pick a username of at least 3 characters.")
        password = o["password"] or strong_password()
        generated = not o["password"]
        name = o["name"].strip()
        email = o["email"].strip() or (username if "@" in username else "")

        user = User.objects.filter(username=username).first()
        created = user is None
        if created:
            user = User.objects.create_user(username=username, email=email)
        elif email:
            user.email = email
        if name:
            parts = name.split(None, 1)
            user.first_name, user.last_name = parts[0][:150], (parts[1][:150] if len(parts) > 1 else "")
        if created or o["password"]:
            user.set_password(password)
        user.is_superuser = True
        user.is_active = True
        user.save()
        if not created and o["password"]:
            user.tokens.all().delete()

        prof, _ = Profile.objects.get_or_create(user=user)
        if not o["keep_persona"] and (prof.persona_id or prof.supplier_id):
            self.stdout.write(self.style.WARNING(
                "  note: this account also has a workspace identity; it keeps it. "
                "Pass a fresh --username for a console-only administrator."))

        w = self.stdout.write
        w("")
        w(self.style.SUCCESS("  Administration console " + ("account created." if created else "access granted.")))
        w("")
        w(f"    URL       /superadmin")
        w(f"    username  {username}")
        if created or o["password"]:
            w(f"    password  {password}" + ("   (generated — store it now, it is not shown again)" if generated else ""))
        else:
            w("    password  unchanged")
        w("")
        w("  This account cannot sign in to the tendering workspace and never appears")
        w("  in the demo account list. Enable two-factor from the console once you are in.")
        w("")
