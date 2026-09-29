from django.conf import settings
from django.http import JsonResponse
from django.urls import include, path, re_path

# The admin site is Docket's own subclass, not django.contrib.admin.site: see
# core/admin.py for what it gates on and what it refuses to edit.
from core.admin import site as django_admin
from django.views.decorators.cache import never_cache
from django.views.generic import TemplateView

# The SPA shell must never be cached, and this is not a preference.
#
# Vite content-hashes every bundle, so each deploy produces a new
# assets/index-<hash>.js and the previous one stops existing. index.html is the
# only thing that knows which hash is current. Served without cache headers it
# gets HEURISTIC caching — a browser is free to reuse it for as long as it
# likes — so a returning visitor asks for the hash from the build before last,
# gets a 404, and React never mounts. The page is blank, the server is healthy,
# and nothing in the logs says anything is wrong.
#
# never_cache sends no-store/no-cache/must-revalidate, so the shell is always
# refetched and always names a bundle that exists. The hashed assets it points
# at are immutable by construction and keep their own caching.
class SpaShell(TemplateView):
    """The SPA shell, with the deployment's appearance already stamped on it.

    WHY THE SERVER HAS TO DO THIS. The layout and the accent are deployment
    settings, not the reader's: they live in OrgSetting and arrive with
    /api/auth/config/. That is a fetch, so the page paints once before it
    lands — in the default blue — and repaints when it does. On a fast
    connection that is a flicker; on a slow one it is a second of the wrong
    brand, on the front page, to somebody seeing the product for the first
    time.

    localStorage cannot fix it the way it fixes the theme. A theme is the
    reader's own and they chose it in this browser, so it is already there to
    be read before first paint. An accent belongs to the deployment and a
    first-time visitor has never stored anything, which is exactly the visit
    that matters most.

    So the shell is rendered with the attributes already on <html>. No fetch,
    no flash, and the bundle's applyLayout/applyAccent become confirmation of
    what is already painted rather than the thing that paints it.

    never_cache below is what makes this safe to do per-deployment: the shell
    is already uncacheable because it names a content-hashed bundle, so
    stamping a per-deployment value into it adds no new caching hazard.
    """

    template_name = "index.html"

    def get_context_data(self, **kw):
        ctx = super().get_context_data(**kw)
        try:
            from core.views import landing_design, studio_accent
            layout = landing_design()
            ctx["layout"] = layout if layout == "studio" else ""
            # Blue is the block already written on the layout, applied by the
            # ABSENCE of the attribute — see applyAccent in studio.js. Emitting
            # it would mean two places decide what blue is.
            accent = studio_accent()
            ctx["accent"] = accent if accent and accent != "blue" else ""
        except Exception:
            # A shell that renders unstyled is recoverable; one that 500s is a
            # blank page. The bundle still applies both from the config fetch.
            ctx["layout"] = ctx["accent"] = ""
        return ctx


index = never_cache(SpaShell.as_view())


def no_demo(request):
    """/demo-api/ on a deployment that is not a demo.

    JSON rather than the SPA shell, so the demo door reads it as "no demo here"
    instead of parsing a page of HTML as the config and sitting on Loading…
    for ever."""
    return JsonResponse({"error": "There is no demo on this deployment."}, status=404)


# /demo points the browser at /demo-api/ (see frontend/src/api.js). Behind the
# Lightsail nginx that prefix is proxied to the demo's own gunicorn and never
# reaches this process. Everywhere else — Render, a laptop, the container on
# its own — nothing was answering it, so the demo door never opened. A
# deployment with the one-click personas switched on IS the demo, so here the
# prefix is simply this workspace's own API again. A deployment with them off
# answers "no demo", and its data stays behind /api/ where it always was.
demo_api = (path("demo-api/", include("core.urls")) if settings.DEMO_LOGIN
            else re_path(r"^demo-api/", no_demo))

urlpatterns = [
    path("api/", include("core.urls")),
    demo_api,
    # Direct table access. NOT /admin/ and not /superadmin/: the first is the
    # path every scanner on the internet tries first, and the second is already
    # the workspace's own administration console, which is a different thing
    # with a different sign-in.
    path("django-admin/", django_admin.urls),
    # The catch-all has to skip it too, or the negative lookahead hands
    # /django-admin/ to the SPA and the page renders the front door instead.
    re_path(r"^(?!api/|demo-api/|static/|django-admin/).*$", index),
]
