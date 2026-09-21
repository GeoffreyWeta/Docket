#!/usr/bin/env bash
# Build, push and deploy DOCKET to an AWS Lightsail container service.
#
#   ./deploy/lightsail.sh deploy/app.env            # deploy
#   ./deploy/lightsail.sh deploy/app.env --create   # create the service first
#
# The env file holds the settings for ONE deployment. Two deployments means two
# env files and two services — see deploy/README.md for why the demo and the
# real workspace cannot share one: DOCKET is single-tenant, and a company that
# ran setup on the demo's database would inherit the demo's tenders.
#
# Needs: docker, awscli v2 configured with credentials that can reach Lightsail.
set -euo pipefail

say() { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

ENV_FILE="${1:-}"
CREATE="${2:-}"
[ -n "$ENV_FILE" ] || die "Usage: $0 <env-file> [--create]"
[ -f "$ENV_FILE" ] || die "No such env file: $ENV_FILE"

command -v docker >/dev/null || die "docker is not on PATH."
command -v aws    >/dev/null || die "aws (CLI v2) is not on PATH."
command -v python3 >/dev/null || command -v python >/dev/null || die "python is not on PATH."
PY=$(command -v python3 || command -v python)

# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a

: "${SERVICE_NAME:?SERVICE_NAME must be set in $ENV_FILE}"
: "${PUBLIC_BASE_URL:?PUBLIC_BASE_URL must be set in $ENV_FILE}"
: "${SECRET_KEY:?SECRET_KEY must be set in $ENV_FILE}"
: "${DATABASE_URL:?DATABASE_URL must be set in $ENV_FILE — a container has no durable disk, so SQLite would lose every sealed bid on redeploy}"

POWER="${POWER:-nano}"
SCALE="${SCALE:-1}"
REGION_ARG=""
[ -n "${AWS_REGION:-}" ] && REGION_ARG="--region $AWS_REGION"

# Migrations run at container start, so more than one replica means concurrent
# `migrate` on the same database. Django takes no lock across processes.
if [ "$SCALE" != "1" ]; then
  die "SCALE=$SCALE: migrations run at container start and would race. Deploy at SCALE=1, or move migrations to a one-off task first."
fi

if [ "$CREATE" = "--create" ]; then
  say "Creating container service $SERVICE_NAME ($POWER, scale $SCALE)…"
  # shellcheck disable=SC2086
  aws lightsail create-container-service $REGION_ARG \
    --service-name "$SERVICE_NAME" --power "$POWER" --scale "$SCALE" >/dev/null
  say "Waiting for the service to become READY (this takes a few minutes)…"
  while :; do
    # shellcheck disable=SC2086
    state=$(aws lightsail get-container-services $REGION_ARG --service-name "$SERVICE_NAME" \
              --query 'containerServices[0].state' --output text)
    [ "$state" = "READY" ] && break
    [ "$state" = "DISABLED" ] && die "Service entered DISABLED."
    printf '    state=%s\n' "$state"
    sleep 20
  done
fi

say "Building the image…"
docker build -t "docket-${SERVICE_NAME}:latest" .

say "Pushing to Lightsail…"
# push-container-image prints the reference to use, quoted, e.g. ":docket.web.7".
# There is no JSON output for this command, so the line is parsed.
push_out=$(aws lightsail push-container-image $REGION_ARG \
  --service-name "$SERVICE_NAME" --label web --image "docket-${SERVICE_NAME}:latest" 2>&1 | tee /dev/stderr)
IMAGE_REF=$(printf '%s' "$push_out" | grep -o '":[^"]*"' | tail -1 | tr -d '"')
[ -n "$IMAGE_REF" ] || die "Could not read the pushed image reference from the push output above."
say "Pushed as $IMAGE_REF"

# Only these reach the container. A whitelist rather than the whole env file, so
# an AWS credential or a shell variable that happens to be exported cannot end
# up readable in the Lightsail console.
PASSTHROUGH="SECRET_KEY DATABASE_URL PUBLIC_BASE_URL ALLOWED_HOSTS SECURE_SSL
DEMO_LOGIN DEMO_PASSWORD SEED_DEMO VENDORS_URL
ANTHROPIC_API_KEY AI_MODEL
EMAIL_HOST EMAIL_PORT EMAIL_HOST_USER EMAIL_HOST_PASSWORD EMAIL_USE_TLS DEFAULT_FROM_EMAIL
BC_TENANT_ID BC_COMPANY_ID BC_CLIENT_ID BC_CLIENT_SECRET BC_ENVIRONMENT
WEB_CONCURRENCY GUNICORN_THREADS GUNICORN_TIMEOUT LOG_LEVEL MAX_UPLOAD_BYTES"

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

IMAGE_REF="$IMAGE_REF" PASSTHROUGH="$PASSTHROUGH" "$PY" - "$WORK" <<'PYEOF'
import json, os, sys

work = sys.argv[1]
env = {k: os.environ[k] for k in os.environ["PASSTHROUGH"].split()
       if os.environ.get(k, "") != ""}
env.setdefault("PORT", "8000")

containers = {
    "web": {
        "image": os.environ["IMAGE_REF"],
        "environment": env,
        "ports": {"8000": "HTTP"},
    }
}
endpoint = {
    "containerName": "web",
    "containerPort": 8000,
    # The prober hits the container directly over HTTP. settings.py exempts this
    # one path from the HTTPS redirect for exactly that reason — without the
    # exemption every check reads 301 and the deployment is rolled back.
    "healthCheck": {
        "path": "/api/health/",
        "successCodes": "200",
        "intervalSeconds": 30,
        "timeoutSeconds": 5,
        "healthyThreshold": 2,
        "unhealthyThreshold": 3,
    },
}
json.dump(containers, open(f"{work}/containers.json", "w"), indent=2)
json.dump(endpoint, open(f"{work}/public-endpoint.json", "w"), indent=2)
print(f"    {len(env)} environment variable(s) passed through")
PYEOF

say "Creating the deployment…"
# shellcheck disable=SC2086
aws lightsail create-container-service-deployment $REGION_ARG \
  --service-name "$SERVICE_NAME" \
  --containers "file://$WORK/containers.json" \
  --public-endpoint "file://$WORK/public-endpoint.json" >/dev/null

say "Deploying. Watching until it settles…"
while :; do
  # shellcheck disable=SC2086
  read -r state url < <(aws lightsail get-container-services $REGION_ARG --service-name "$SERVICE_NAME" \
    --query 'containerServices[0].[state,url]' --output text)
  case "$state" in
    RUNNING) say "Live at $url"; break ;;
    READY)   die "Deployment did not take — the service fell back to READY. Check: aws lightsail get-container-log --service-name $SERVICE_NAME --container-name web" ;;
    *)       printf '    state=%s\n' "$state"; sleep 20 ;;
  esac
done

cat <<EOF

  Public URL   $url
  PUBLIC_BASE_URL in $ENV_FILE is $PUBLIC_BASE_URL

  Those two must match, or password-reset and vendor-claim links point at the
  wrong host. On the first deploy of a service you do not know the Lightsail URL
  yet: set it now and run this script again, or put your own domain in front.

  Logs:  aws lightsail get-container-log --service-name $SERVICE_NAME --container-name web
EOF
