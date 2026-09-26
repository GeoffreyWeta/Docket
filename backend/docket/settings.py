"""Django settings for DOCKET."""
import mimetypes
import os
from pathlib import Path

import dj_database_url

BASE_DIR = Path(__file__).resolve().parent.parent      # backend/
ROOT_DIR = BASE_DIR.parent                             # repo root
FRONTEND_DIST = ROOT_DIR / "frontend" / "dist"

SECRET_KEY = os.environ.get("SECRET_KEY", "dev-only-insecure-key")
DEBUG = os.environ.get("DEBUG", "0") == "1"

# ---- where this deployment lives ----------------------------------------
#
# One setting decides the public address, the CSRF origins and whether TLS is
# enforced: PUBLIC_BASE_URL. Everything used to hang off RENDER_EXTERNAL_HOSTNAME
# instead, which meant a deployment anywhere else silently ran with no HTTPS
# redirect, insecure cookies, no trusted CSRF origin, and password-reset links
# pointing at localhost. Render still fills this in for free (below); every other
# host sets it once.
RENDER_HOST = os.environ.get("RENDER_EXTERNAL_HOSTNAME")
PUBLIC_BASE_URL = os.environ.get(
    "PUBLIC_BASE_URL",
    f"https://{RENDER_HOST}" if RENDER_HOST else "http://localhost:5173",
).rstrip("/")

# `*` is the default because managed load balancers (Render, Lightsail, an ALB)
# health-check the container on an internal address whose Host header is not the
# public domain — pinning the list without including that address returns 400 to
# the health check and the deployment never goes live. Pin it only when you know
# what the prober sends, and keep the public domain in the list.
ALLOWED_HOSTS = [h.strip() for h in os.environ.get("ALLOWED_HOSTS", "*").split(",") if h.strip()]

CSRF_TRUSTED_ORIGINS = [PUBLIC_BASE_URL] if PUBLIC_BASE_URL.startswith("https://") else []
if RENDER_HOST and f"https://{RENDER_HOST}" not in CSRF_TRUSTED_ORIGINS:
    CSRF_TRUSTED_ORIGINS.append(f"https://{RENDER_HOST}")

INSTALLED_APPS = [
    # django.contrib.admin is here for direct table access at /django-admin/,
    # and it drags in three dependencies that the API itself never needed:
    # sessions (the admin signs in with a cookie, not a bearer token),
    # messages (its "1 row changed" banners) and the admin app itself. See
    # core/admin.py for what it may and may not edit.
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.messages",
    "django.contrib.sessions",
    "django.contrib.staticfiles",
    "core",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    # The bootstrap payload carries the vendor register, about 1,400 rows of
    # highly repetitive JSON: 434 KB raw, 61 KB gzipped, and it is refetched
    # after every action. Compression is the difference between an app that
    # feels instant and one that does not.
    "django.middleware.gzip.GZipMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.middleware.common.CommonMiddleware",
    # The admin's three. Session must precede Authentication, which reads it,
    # and Message must follow Session, which it stores into.
    #
    # CsrfViewMiddleware is deliberately NOT here. The API authenticates with a
    # bearer token and its views are csrf-exempt; switching global CSRF on
    # would put a cookie requirement in front of every endpoint for the sake of
    # one page. Django's admin applies csrf_protect to its own views, so it is
    # protected either way - which is worth verifying rather than trusting, and
    # was.
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
]

ROOT_URLCONF = "docket.urls"
WSGI_APPLICATION = "docket.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [FRONTEND_DIST],
        # APP_DIRS finds the admin's own templates. DIRS is searched first, so
        # the SPA shell still wins for index.html.
        "APP_DIRS": True,
        "OPTIONS": {"context_processors": [
            # The admin needs all three: request for its sidebar, auth for the
            # user menu, messages for its banners.
            "django.template.context_processors.request",
            "django.contrib.auth.context_processors.auth",
            "django.contrib.messages.context_processors.messages",
        ]},
    }
]

DATABASES = {
    "default": dj_database_url.config(
        default=f"sqlite:///{BASE_DIR / 'db.sqlite3'}",
        conn_max_age=600,
    )
}

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_DIRS = [FRONTEND_DIST] if FRONTEND_DIST.exists() else []

# Python's mimetypes table predates .webmanifest, so the PWA manifest would go
# out as application/octet-stream. WhiteNoise keeps its own media-type table and
# does not consult the mimetypes registry, so it has to be told separately.
mimetypes.add_type("application/manifest+json", ".webmanifest")
WHITENOISE_MIMETYPES = {".webmanifest": "application/manifest+json"}

STORAGES = {
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedStaticFilesStorage"},
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
USE_TZ = True
LANGUAGE_CODE = "en-us"

# AI (optional — endpoints return 503 without a key)
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
AI_MODEL = os.environ.get("AI_MODEL", "claude-sonnet-4-6")

# ---- authentication / demo mode ----
# DEMO_LOGIN=1 exposes one-click demo logins on the sign-in screen. Set to 0
# to require passwords. DEMO_PASSWORD is the password seeded on demo accounts.
# --- the finance ledger feed -------------------------------------------------
# Business Central, via the standard API v2.0 and an Entra app registration
# using client credentials. All five must be present for a live pull; with any
# of them missing the importer stays file-based and says so, which is the right
# default for a deployment nobody has connected yet.
#
# The secret is read from the environment and never written to the database or
# returned by any endpoint — see finance_sync.bc_config().
BC_TENANT_ID = os.environ.get("BC_TENANT_ID", "")
BC_COMPANY_ID = os.environ.get("BC_COMPANY_ID", "")
BC_CLIENT_ID = os.environ.get("BC_CLIENT_ID", "")
BC_CLIENT_SECRET = os.environ.get("BC_CLIENT_SECRET", "")
BC_ENVIRONMENT = os.environ.get("BC_ENVIRONMENT", "production")

DEMO_LOGIN = os.environ.get("DEMO_LOGIN", "1") == "1"
DEMO_PASSWORD = os.environ.get("DEMO_PASSWORD", "docket-demo")

# Where somebody who has seen the demo goes to start a workspace of their own.
# DOCKET is single-tenant — one org row, no tenant key on tenders or suppliers —
# so on the demo deployment this must point at the real one. Running the setup
# wizard against the demo database renames the demo org and gives the newcomer
# the demo's tenders and suppliers as their own. Unset means "the wizard on this
# server", which is right for the real deployment and for local development.
SIGNUP_URL = os.environ.get("SIGNUP_URL", "").rstrip("/")

# The other direction: where the landing page sends somebody who wants to look
# before they commit. Set on the real deployment to the demo's address, and left
# empty on the demo itself — it is already the demo.
DEMO_URL = os.environ.get("DEMO_URL", "").rstrip("/")

# The code that has to be typed before a company can be registered on this
# deployment. An empty workspace on a public address is a company waiting to be
# claimed by whoever finds the URL first, and "nobody had set it up yet" is not
# consent — the setup wizard is the one unauthenticated endpoint that can create
# an administrator, so it gets a shared secret issued out of band.
#
# Checked case-insensitively and rate-limited (see setup_views.check_code).
# Set SETUP_CODE="" to disable the gate, which is only reasonable on a laptop.
SETUP_CODE = os.environ.get("SETUP_CODE", "ENGDOCKET1234").strip()

# ---- uploads ----
MAX_UPLOAD_BYTES = int(os.environ.get("MAX_UPLOAD_BYTES", 10 * 1024 * 1024))  # 10 MB
ALLOWED_UPLOAD_EXTENSIONS = {
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".png", ".jpg", ".jpeg", ".zip",
}
DATA_UPLOAD_MAX_MEMORY_SIZE = MAX_UPLOAD_BYTES + 1024 * 1024

# ---- email (console backend unless SMTP env is provided) ----
if os.environ.get("EMAIL_HOST"):
    EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
    EMAIL_HOST = os.environ["EMAIL_HOST"]
    EMAIL_PORT = int(os.environ.get("EMAIL_PORT", 587))
    EMAIL_HOST_USER = os.environ.get("EMAIL_HOST_USER", "")
    EMAIL_HOST_PASSWORD = os.environ.get("EMAIL_HOST_PASSWORD", "")
    EMAIL_USE_TLS = os.environ.get("EMAIL_USE_TLS", "1") == "1"
else:
    EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"
DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", "DOCKET <no-reply@docket.local>")

# ---- proxy / TLS ---------------------------------------------------------
#
# PUBLIC_BASE_URL (set at the top of this file) is what decides this: an https
# address means the deployment sits behind a TLS-terminating proxy, which is true
# of Render, Lightsail container services, an ALB and nginx alike. Override with
# SECURE_SSL=0 only when you are deliberately running plain HTTP.
SECURE_SSL = os.environ.get("SECURE_SSL", "1" if PUBLIC_BASE_URL.startswith("https://") else "0") == "1"
if SECURE_SSL:
    # Every one of those proxies terminates TLS and forwards plain HTTP with the
    # original scheme in this header. Without it Django sees http, and with
    # SECURE_SSL_REDIRECT on that is an infinite redirect loop.
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    # The health check is the exception, and it has to be. A container prober
    # hits the container directly over HTTP with no X-Forwarded-Proto, so with
    # the redirect on it gets a 301, reads it as unhealthy, and the deployment
    # is rolled back — with the application working perfectly. Patterns match
    # request.path with the leading slash stripped.
    SECURE_REDIRECT_EXEMPT = [r"^api/health/?$"]

# ---- logging ----
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": os.environ.get("LOG_LEVEL", "INFO")},
    "loggers": {
        "django.request": {"handlers": ["console"], "level": "WARNING", "propagate": False},
    },
}
