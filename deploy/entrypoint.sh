#!/usr/bin/env sh
# Container start: migrate, optionally seed, then serve.
#
# This is deliberately not the Render build script. Migrations run at *start*,
# against the database this container was actually given, rather than at build
# time against whatever the builder could reach — which on Lightsail is nothing.
set -eu

cd /app/backend

# A container that cannot reach its database should die loudly at start rather
# than come up and fail every request with a 500 the health check might miss.
echo "[docket] applying migrations…"
python manage.py migrate --noinput

# SEED_DEMO=1 fills an empty workspace with the demo tenders, personas and
# suppliers. seed_demo is itself a no-op when data already exists, so this is
# safe to leave on for the demo deployment and safe to forget about — but the
# real deployment sets SEED_DEMO=0 and starts empty, so the first person through
# the door gets the setup wizard instead of somebody else's tenders.
if [ "${SEED_DEMO:-0}" = "1" ]; then
  echo "[docket] seeding demo workspace (no-op if data exists)…"
  python manage.py seed_demo
fi

# The vendor register never travels in the image: real bank details, TINs and
# contacts for ~1,400 companies. VENDORS_URL is a private, time-limited link set
# on the service; fetched here, imported, and gone when the container dies.
if [ -n "${VENDORS_URL:-}" ]; then
  echo "[docket] fetching vendor register…"
  mkdir -p data
  if curl -fsSL "$VENDORS_URL" -o data/vendors.json; then
    python manage.py import_vendors --commit
  else
    # Not fatal: a rotated link should not take the service down. The register
    # already in the database stays exactly as it was.
    echo "[docket] WARNING: VENDORS_URL fetch failed — keeping the register as it is."
  fi
fi

echo "[docket] starting gunicorn on ${PORT:-8000}…"
exec gunicorn docket.wsgi:application \
  --bind "0.0.0.0:${PORT:-8000}" \
  --workers "${WEB_CONCURRENCY:-2}" \
  --threads "${GUNICORN_THREADS:-4}" \
  --timeout "${GUNICORN_TIMEOUT:-60}" \
  --access-logfile - \
  --error-logfile -
