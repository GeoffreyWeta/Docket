# DOCKET — single image: the React bundle baked in, served by Django/WhiteNoise.
#
# Two stages, because the node toolchain is ~400 MB and none of it is needed at
# runtime: stage one builds frontend/dist, stage two copies the built files into
# a slim Python image and throws node away.

# ---- stage 1: the React bundle ------------------------------------------
FROM node:22-slim AS web

WORKDIR /build/frontend
# package files first, so an edit to src/ does not re-run npm ci
COPY frontend/package.json frontend/package-lock.json* ./
# `npm ci` when there is a lockfile (reproducible), `npm install` when there is
# not. A build that silently resolves different dependency versions than the one
# you tested is not a build you can roll back to.
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY frontend/ ./
RUN npm run build

# ---- stage 2: the runtime ------------------------------------------------
FROM python:3.12-slim AS runtime

# PYTHONUNBUFFERED so logs reach CloudWatch as they happen rather than when the
# buffer fills; PYTHONDONTWRITEBYTECODE because the filesystem is ephemeral.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    DJANGO_SETTINGS_MODULE=docket.settings

# libpq for psycopg2, curl for the container health check. Nothing else: no
# compiler, since every wheel we need ships built.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq5 curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/
COPY deploy/entrypoint.sh ./deploy/entrypoint.sh
RUN chmod +x ./deploy/entrypoint.sh

# settings.py looks for the bundle at ROOT_DIR/frontend/dist — the repo layout,
# preserved here so nothing in Django needs a Docker-specific path.
COPY --from=web /build/frontend/dist ./frontend/dist

# collectstatic at build time, not start time: it is deterministic, it is slow,
# and doing it here means a container that starts is a container that can serve.
# SECRET_KEY is a throwaway for this step alone — it never reaches the image,
# and the real one arrives as an environment variable at run time.
RUN cd backend && SECRET_KEY=build-only-not-used python manage.py collectstatic --noinput

# Not root. The app writes nothing to disk it cannot lose.
RUN useradd --system --create-home --uid 10001 docket \
    && chown -R docket:docket /app
USER docket

EXPOSE 8000

# The same check Lightsail is configured to run, so `docker run` locally fails
# the same way a bad deployment would rather than looking fine.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD curl -fsS http://127.0.0.1:${PORT:-8000}/api/health/ || exit 1

ENTRYPOINT ["./deploy/entrypoint.sh"]
