"""Django's admin, over Docket's tables.

   WHAT THIS IS FOR, AND WHAT IT IS NOT. /superadmin is the administration
   console: accounts, roles, capabilities, appearance. It is the supported way
   to run the deployment and it goes through the same rules everybody else
   does. This is the other thing — raw table access, for the times when
   something has to be looked at or repaired directly and there is no screen
   for it.

   THE DIFFERENCE MATTERS, because the admin does not go through procurement.py
   or auction.py. It writes to columns. Nothing it does is checked against an
   approval limit, a sealing deadline or a conflict-of-interest declaration,
   and nothing it does is announced to anybody. A tender moved to "awarded"
   from here is awarded with no recommendation, no approval and no letter.

   SO THE RECORD ITSELF IS READ-ONLY HERE. Every model in READ_ONLY below is
   either the tamper-evident chain or something the chain attests to, and the
   product's whole claim is that those cannot be quietly edited. Django's admin
   would edit them quietly and the next integrity check would fail with no
   explanation of why — which is worse than the edit, because it destroys trust
   in a verification that was working. They are visible, searchable, and not
   writable.

   That is a decision, not a law. If you need to repair a chain row, do it in a
   shell where you can also re-link the hashes, or take this model out of
   READ_ONLY deliberately and know what you are doing.
"""
from django.apps import apps
from django.contrib import admin
from django.contrib.admin import AdminSite
from django.contrib.admin.forms import AdminAuthenticationForm
from django.core.exceptions import ValidationError


class SuperuserLoginForm(AdminAuthenticationForm):
    """The login form gates on is_staff too, and it gets there first.

    Overriding AdminSite.has_permission is not enough on its own: the sign-in
    form runs confirm_login_allowed before the site is ever consulted, and the
    stock one rejects anybody without is_staff with "please enter the correct
    username and password for a staff account". The credentials were right, the
    message said they were wrong, and the site's own rule never ran. Both have
    to agree, so both are overridden.
    """

    def confirm_login_allowed(self, user):
        if not user.is_active or not user.is_superuser:
            raise ValidationError(
                "That account cannot open the tables. Administration-console "
                "accounts are made with manage.py create_superadmin.",
                code="not_superuser",
            )


class DocketAdmin(AdminSite):
    """Access is being a Docket superadmin, not Django's is_staff.

    create_superadmin sets is_superuser and deliberately does not set is_staff,
    so out of the box every administration-console account was refused here
    with "please enter the correct username and password for a staff account" -
    which is a confusing thing to read when the password was right.

    Rather than start setting is_staff, which would hand table access to every
    console account quietly and on somebody else's schedule, the site says what
    it means: an active superuser, which is exactly the set of people who can
    already sign in to /superadmin. Granting or revoking one grants or revokes
    the other, and there is one thing to reason about instead of two.
    """

    login_form = SuperuserLoginForm

    def has_permission(self, request):
        return bool(request.user.is_active and request.user.is_superuser)


site = DocketAdmin(name="docketadmin")

# The tamper-evident record and the rows it attests to. Visible, never editable
# from here — see the module docstring.
READ_ONLY = {"Event", "ChainHead", "AdminAudit", "Bid", "LotBid", "ProxyBid"}

# Rows nobody should be reading out of a web page. Tokens are bearer
# credentials: the hash is the secret's equal for anyone who can copy it.
HIDDEN = {"AuthToken", "ActionToken", "ApiKey"}


class Base(admin.ModelAdmin):
    """Enough columns to find a row without knowing the schema.

    Django's default admin shows __str__ and nothing else, which for models
    keyed on short ids means a list of opaque strings. This picks the first few
    concrete fields instead, so every table is legible without writing a
    ModelAdmin for all thirty of them.
    """

    list_per_page = 50

    def __init__(self, model, site):
        names = [f.name for f in model._meta.concrete_fields]
        self.list_display = names[:6]
        # Only text-ish fields are searchable: search_fields on an integer
        # raises at query time rather than at startup, so a careless entry here
        # is a 500 on the search box and nowhere else.
        self.search_fields = [
            f.name for f in model._meta.concrete_fields
            if f.get_internal_type() in ("CharField", "TextField")
        ][:6]
        super().__init__(model, site)


class ReadOnly(Base):
    def has_add_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def get_readonly_fields(self, request, obj=None):
        return [f.name for f in self.model._meta.fields]


# Registered by walking the app rather than by listing thirty imports, so a
# model added next month appears here without anybody remembering to come back.
for model in apps.get_app_config("core").get_models():
    name = model.__name__
    if name in HIDDEN:
        continue
    site.register(model, ReadOnly if name in READ_ONLY else Base)

site.site_header = "Docket — direct table access"
site.site_title = "Docket admin"
site.index_title = "Tables. For the workspace itself, use /superadmin."
