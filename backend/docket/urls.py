from django.urls import include, path, re_path
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
index = never_cache(TemplateView.as_view(template_name="index.html"))

urlpatterns = [
    path("api/", include("core.urls")),
    re_path(r"^(?!api/|static/).*$", index),
]
