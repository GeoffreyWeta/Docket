#!/usr/bin/env bash
# Bring a running instance up to the current commit. The command for every
# change after the first:
#
#     sudo bash /srv/docket/deploy/lightsail/deploy.sh app
#     sudo bash /srv/docket/deploy/lightsail/deploy.sh demo --bootstrap
#     sudo bash /srv/docket/deploy/lightsail/deploy.sh --all
#
# --bootstrap additionally seeds the workspace and imports the vendor register.
# It is for a database that starts empty and nothing else: on the real workspace
# seeding would put invented tenders beside real ones.
#
# The steps are the ones a deploy has to do in order: fetch, install, rebuild the
# interface, migrate, collect static, restart, then check it actually answers.
set -euo pipefail

APP_USER=docket
APP_DIR=/srv/docket
ENV_DIR=/etc/docket
BRANCH="${BRANCH:-main}"

BOLD=$(printf '\033[1m')
PLAIN=$(printf '\033[0m')
say()  { printf '\n%s==> %s%s\n' "$BOLD" "$*" "$PLAIN"; }
note() { printf '    %s\n' "$*"; }

[ "$(id -u)" -eq 0 ] || { echo "Run this with sudo." >&2; exit 1; }

ROLES=""
BOOTSTRAP=no
for arg in "$@"; do
  case "$arg" in
    app|demo)    ROLES="$ROLES $arg" ;;
    --all)       ROLES="app demo" ;;
    --bootstrap) BOOTSTRAP=yes ;;
    *) echo "Unknown argument: $arg" >&2; exit 1 ;;
  esac
done
[ -n "$ROLES" ] || { echo "Usage: sudo bash deploy.sh <app|demo|--all> [--bootstrap]" >&2; exit 1; }

# --all with --bootstrap would seed the real workspace too. Refuse rather than
# ask: the damage is invented tenders sitting beside real ones in an audit trail
# that is supposed to be evidence.
if [ "$BOOTSTRAP" = yes ] && [ "$(echo "$ROLES" | wc -w)" -gt 1 ]; then
  echo "--bootstrap takes one role at a time. Name it: deploy.sh demo --bootstrap" >&2
  exit 1
fi

# Only provisioned roles. Naming one that was never provisioned would otherwise
# fail deep inside a management command with a confusing error.
for role in $ROLES; do
  [ -r "$ENV_DIR/env.$role" ] || {
    echo "No $ENV_DIR/env.$role — run provision.sh $role first." >&2; exit 1; }
done

# `sudo -u` does not reliably hand the target user their own HOME, and npm
# without a writable HOME tries to cache under root's and dies on EACCES —
# halfway through, leaving node_modules in a state `npm ci` has to redo.
APP_HOME="$(getent passwd "$APP_USER" | cut -d: -f6)"

run()    { sudo -u "$APP_USER" "$@"; }
manage() { sudo -u "$APP_USER" /usr/local/bin/docket-manage "$@"; }

# ---------------------------------------------------------------- the key
#
# Checked before anything else touches a database. SECRET_KEY is the Fernet key
# protecting every sealed bid at rest (backend/core/util.py), so a changed one
# does not throw an error — it silently makes existing bids undecryptable while
# the app carries on looking healthy. The fingerprint is written once by
# provision.sh; if it stops matching, something has rewritten the env file and
# the right move is to put the old key back, not to deploy over it.
say "Verifying the encryption key"
for role in $ROLES; do
  fp_file="$ENV_DIR/.secret-fingerprint.$role"
  current="$(awk -F= '/^SECRET_KEY=/{sub(/^SECRET_KEY=/,""); print; exit}' "$ENV_DIR/env.$role" | tr -d '\r')"
  now="$(printf '%s' "$current" | sha256sum | cut -d' ' -f1)"
  if [ ! -f "$fp_file" ]; then
    printf '%s' "$now" > "$fp_file"; chmod 600 "$fp_file"
    note "$role: no fingerprint on file, recording the current key"
  elif [ "$now" != "$(cat "$fp_file")" ]; then
    cat >&2 <<KEYCHANGED

${BOLD}STOP. The SECRET_KEY for the $role workspace has changed.${PLAIN}

That key is what bid amounts, line prices and uploaded documents are encrypted
with. Deploying now leaves the application healthy and every sealed bid already
in docket_$role permanently unreadable.

  * If you restored $ENV_DIR/env.$role from a backup, put the ORIGINAL key back.
  * If this workspace holds no bids yet and the change was deliberate, clear the
    fingerprint and run again:  sudo rm $fp_file

KEYCHANGED
    exit 1
  else
    note "$role: key unchanged"
  fi
done

# ---------------------------------------------------------------- the code
say "Fetching $BRANCH"
run git -C "$APP_DIR" fetch --quiet origin "$BRANCH"
# Hard reset rather than pull: the box is a checkout, not a workspace, and a
# merge conflict at deploy time on a machine nobody is sitting at has no good
# ending. Local edits here are a mistake by definition, so they lose.
run git -C "$APP_DIR" reset --hard --quiet "origin/$BRANCH"
note "now at $(run git -C "$APP_DIR" log -1 --pretty='%h %s')"

say "Installing Python dependencies"
run "$APP_DIR/.venv/bin/pip" install --quiet -r "$APP_DIR/requirements.txt"

# ---------------------------------------------------------------- the interface
#
# frontend/dist is gitignored, so it does not arrive with the fetch and has to be
# built here. `npm ci` rather than `npm install`: a deploy that silently resolves
# different dependency versions than the one you tested is not a deploy you can
# roll back to.
#
# This is the memory-hungry step on a 2GB box. provision.sh adds 2GB of swap for
# it; without that, a vite build is a plausible way to have the OOM killer take
# Postgres instead.
say "Building the interface"
run env -C "$APP_DIR/frontend" HOME="$APP_HOME" npm ci --silent --no-audit --no-fund
run env -C "$APP_DIR/frontend" HOME="$APP_HOME" npm run build
note "bundle: $(du -sh "$APP_DIR/frontend/dist" | cut -f1)"

# ---------------------------------------------------------------- per workspace
for role in $ROLES; do
  say "[$role] Migrating"
  manage "$role" migrate --noinput

  if [ "$BOOTSTRAP" = yes ]; then
    if [ "$role" = demo ]; then
      say "[$role] Seeding the demo workspace"
      manage "$role" seed_demo
    else
      # Nothing to seed. The real workspace starts empty on purpose: the first
      # person through the door gets the setup wizard and becomes the owner.
      say "[$role] Real workspace — starting empty, no seed"
      note "The first visitor gets the setup wizard. Nothing to do here."
    fi
    # The register is the exception: it is reference data either workspace can
    # legitimately hold, and it never travels in the repo.
    vendors_url="$(awk -F= '/^VENDORS_URL=/{sub(/^VENDORS_URL=/,""); print; exit}' "$ENV_DIR/env.$role" | tr -d '\r')"
    if [ -n "$vendors_url" ]; then
      say "[$role] Importing the vendor register"
      tmp="$(mktemp -d)"
      if curl -fsSL "$vendors_url" -o "$tmp/vendors.json"; then
        install -o "$APP_USER" -g "$APP_USER" -m 600 -D "$tmp/vendors.json" "$APP_DIR/backend/data/vendors.json"
        manage "$role" import_vendors --commit
        # Gone the moment it has been read. Real bank details and TINs for ~1,400
        # companies do not sit on disk waiting for the next person with a shell.
        rm -f "$APP_DIR/backend/data/vendors.json"
      else
        note "VENDORS_URL fetch failed — keeping the register as it is."
      fi
      rm -rf "$tmp"
    fi
  fi

  say "[$role] Collecting static files"
  manage "$role" collectstatic --noinput --verbosity 0

  say "[$role] Restarting"
  systemctl restart "docket@$role"
done

# ---------------------------------------------------------------- did it work
#
# systemctl returning happily means the process started, not that the application
# can serve anything: a missing ALLOWED_HOSTS entry is a healthy process
# answering 400 to the world. So ask over port 80, the way a visitor would, which
# tests nginx and gunicorn and the settings together.
#
# The Host header has to be a name the site answers to. Once certbot has been
# here nginx 404s anything it does not recognise, including 127.0.0.1, so a check
# that does not give the real name fails a deploy that in fact worked. The first
# ALLOWED_HOSTS entry is that name.
#
# 200 and 301 are both a pass, and the difference is only TLS: with an https
# PUBLIC_BASE_URL the app redirects before it does anything else, so a 301 is the
# whole chain working. Insisting on 200 would fail every deploy from the day the
# certificate is installed.
failed=no
for role in $ROLES; do
  say "[$role] Checking"
  host="$(awk -F= '/^ALLOWED_HOSTS=/{split($2,a,","); print a[1]; exit}' "$ENV_DIR/env.$role" | tr -d '\r')"
  host="${host:-127.0.0.1}"
  code=""
  for _ in $(seq 1 20); do
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 \
              -H "Host: $host" http://127.0.0.1/api/health/ || true)"
    case "$code" in 200|301) break ;; esac
    sleep 1
  done
  case "$code" in
    200) note "/api/health/ answered 200. Deployed." ;;
    301) note "/api/health/ answered 301 to https, which is TLS working. Deployed." ;;
    *)
      failed=yes
      printf '    /api/health/ answered %s for %s.\n\n' "${code:-nothing}" "$host"
      echo "      400  ALLOWED_HOSTS in $ENV_DIR/env.$role does not list $host."
      echo "      404  nginx has no server block for it:  nginx -T | grep server_name"
      echo "      502  gunicorn is not up:  journalctl -u docket@$role -n 50 --no-pager"
      echo "      000  nginx is not up:     systemctl status nginx"
      ;;
  esac
done
[ "$failed" = no ] || exit 1
printf '\n'
