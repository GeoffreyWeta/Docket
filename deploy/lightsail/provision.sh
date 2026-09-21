#!/usr/bin/env bash
# Turn a blank Ubuntu 24.04 Lightsail instance into a DOCKET host. Run once per
# workspace, as root, on the box itself:
#
#     sudo bash provision.sh app     [PUBLIC_IP]
#     sudo bash provision.sh demo    [PUBLIC_IP]
#
# Both can live on the same box. Everything expensive is shared — packages, swap,
# Postgres, nginx, the checkout, the virtualenv — and everything that must not be
# shared is not: a database each, an env file each, a systemd unit each, a port
# each. DOCKET is single-tenant (one org row, no tenant key on tenders), so a
# company that ran setup against the demo's database would inherit the demo's
# tenders. Two databases is what keeps that from happening.
#
# It stops deliberately before touching application data, because the ways to
# fill a database are mutually exclusive and choosing wrongly in silence is worse
# than stopping. It prints what is left at the end.
#
# Safe to run again. Every step looks for its own result first.
set -euo pipefail

ROLE="${1:-}"
case "$ROLE" in
  app|demo) ;;
  *) echo "Usage: sudo bash provision.sh <app|demo> [PUBLIC_IP]" >&2; exit 1 ;;
esac

APP_USER=docket
APP_DIR=/srv/docket
ENV_DIR=/etc/docket
LOG_DIR=/var/log/docket
ENV_FILE="$ENV_DIR/env.$ROLE"
DB_NAME="docket_$ROLE"
DB_USER=docket
REPO_URL="${REPO_URL:-https://github.com/GeoffreyWeta/Docket.git}"
BRANCH="${BRANCH:-main}"
# app on 8000, demo on 8001. nginx picks between them by server_name.
if [ "$ROLE" = app ]; then PORT=8000; else PORT=8001; fi

# The public name this workspace answers to. It lands in three places that all
# have to agree: nginx's server_name, Django's ALLOWED_HOSTS, and the links in
# email. Override either at the command line:
#
#   sudo DOMAIN=docket.eatngo-africa.com bash provision.sh app
#
# The real workspace is the front door, so it takes the bare name; the demo sits
# on a subdomain of it. Both are just defaults — DOMAIN wins.
if [ "$ROLE" = app ]; then
  DOMAIN="${DOMAIN:-docket.eatngo-africa.com}"
  # Only the real workspace is the default_server, so the bare static IP reaches
  # it while DNS spreads and anything unrecognised lands somewhere sensible.
  DEFAULT=" default_server"
  SERVER_NAME="$DOMAIN _"
else
  DOMAIN="${DOMAIN:-demo.docket.eatngo-africa.com}"
  DEFAULT=""
  SERVER_NAME="$DOMAIN"
fi

BOLD=$(printf '\033[1m')
PLAIN=$(printf '\033[0m')
say()  { printf '\n%s==> %s%s\n' "$BOLD" "$*" "$PLAIN"; }
note() { printf '    %s\n' "$*"; }

[ "$(id -u)" -eq 0 ] || { echo "Run this with sudo." >&2; exit 1; }

# ---------------------------------------------------------------- the address
# Wanted for ALLOWED_HOSTS, the setting that makes the site answer 400 to every
# request when it is wrong. From instance metadata, overridable by argument for
# the case where a static IP was attached after boot.
PUBLIC_IP="${2:-}"
if [ -z "$PUBLIC_IP" ]; then
  TOKEN="$(curl -sS --max-time 3 -X PUT http://169.254.169.254/latest/api/token \
      -H 'X-aws-ec2-metadata-token-ttl-seconds: 60' 2>/dev/null || true)"
  if [ -n "$TOKEN" ]; then
    PUBLIC_IP="$(curl -sS --max-time 3 -H "X-aws-ec2-metadata-token: $TOKEN" \
        http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || true)"
  else
    PUBLIC_IP="$(curl -sS --max-time 3 \
        http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || true)"
  fi
fi
[ -n "$PUBLIC_IP" ] || {
  echo "Could not detect the public IP. Pass it: sudo bash provision.sh $ROLE 12.34.56.78" >&2
  exit 1
}
say "Provisioning the $ROLE workspace — $DOMAIN at $PUBLIC_IP"

# ---------------------------------------------------------------- packages
say "Installing packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
# Ubuntu 24.04 carries Python 3.12, which is what this project is developed
# against. build-essential and libpq-dev are insurance: every wheel this project
# needs is prebuilt today, and a source build failing on a box with no compiler
# is a bad morning for the sake of a few hundred megabytes.
apt-get install -y -qq \
  python3 python3-venv python3-dev build-essential libpq-dev \
  postgresql postgresql-client \
  nginx git curl ca-certificates ufw cron openssl

# Node, for the React bundle. The sister project commits its built bundle and so
# needs no toolchain on the box; DOCKET gitignores frontend/dist, and changing
# that would mean remembering to rebuild and commit before every deploy — which
# when forgotten ships a stale interface and says nothing. One source of truth is
# worth the 200MB, and the swap below is what makes the build safe on 2GB.
if ! command -v node >/dev/null 2>&1; then
  say "Installing Node 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs
fi
note "node $(node --version), npm $(npm --version)"

say "Setting the clock to Africa/Lagos"
timedatectl set-timezone Africa/Lagos

# ---------------------------------------------------------------- swap
#
# A Lightsail instance has no swap, and this box needs some. Postgres, two
# gunicorn workers per workspace, and — for a minute at a time — a vite build
# holding the whole module graph. With no swap there is nothing between a peak
# and the OOM killer, and what it takes is whichever process is largest. The
# instance then stops answering ssh as well as http, which from outside is
# indistinguishable from it being switched off.
#
# swappiness=10 so it stays a safety net rather than something the kernel reaches
# for while there is still real memory.
say "Adding swap"
if [ -f /swapfile ]; then
  note "/swapfile already present"
else
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  note "/swapfile created"
fi
swapon --show=NAME --noheadings | grep -q '^/swapfile$' || swapon /swapfile
grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
sysctl -q -w vm.swappiness=10
grep -q '^vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf
note "swap: $(free -h | awk '/^Swap:/{print $2}') total, swappiness 10"

# ---------------------------------------------------------------- user and dirs
say "Creating $APP_USER and its directories"
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"
install -d -o "$APP_USER" -g "$APP_USER" -m 755 "$APP_DIR"
install -d -o root -g "$APP_USER" -m 750 "$ENV_DIR"
install -d -o "$APP_USER" -g "$APP_USER" -m 755 "$LOG_DIR"

# ---------------------------------------------------------------- the code
#
# The key has to belong to $APP_USER, not to whoever is running this. deploy.sh
# fetches as $APP_USER on every deploy, so a credential only root or the login
# user holds gets the first clone through and then breaks every update after it.
if [ -d "$APP_DIR/.git" ]; then
  say "Repository already present, leaving it alone"
else
  say "Cloning $REPO_URL"
  SSH_DIR="$(getent passwd "$APP_USER" | cut -d: -f6)/.ssh"
  install -d -o "$APP_USER" -g "$APP_USER" -m 700 "$SSH_DIR"
  if [ ! -f "$SSH_DIR/id_ed25519" ]; then
    sudo -u "$APP_USER" ssh-keygen -t ed25519 -N "" \
      -C "docket@$(hostname)" -f "$SSH_DIR/id_ed25519" >/dev/null
    note "generated a deploy key for $APP_USER"
  fi
  if [ ! -s "$SSH_DIR/known_hosts" ]; then
    ssh-keyscan -H github.com > "$SSH_DIR/known_hosts" 2>/dev/null || true
    chown "$APP_USER:$APP_USER" "$SSH_DIR/known_hosts"
    chmod 600 "$SSH_DIR/known_hosts"
  fi
  if ! sudo -u "$APP_USER" git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"; then
    cat <<CLONE_FAILED

${BOLD}The clone failed, and a private repository is the usual reason.${PLAIN}

Add this as a read-only deploy key on the repository:

  GitHub > the repo > Settings > Deploy keys > Add deploy key
  Leave "Allow write access" unticked.

$(cat "$SSH_DIR/id_ed25519.pub")

Then run this again over SSH rather than https, which is what the key is for:

  sudo REPO_URL=git@github.com:GeoffreyWeta/Docket.git bash $0 $ROLE $PUBLIC_IP

Nothing above this point is undone by running it again.
CLONE_FAILED
    exit 1
  fi
fi

# ---------------------------------------------------------------- postgres
# On this same instance, over the loopback. The disk persists, so the database
# sits beside the app: one socket hop away, and inside the same snapshot.
say "Creating the $ROLE database"
DB_PASSWORD=""
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1; then
  note "role $DB_USER already exists, keeping its password"
else
  # Hex, so the value is safe unquoted in a systemd EnvironmentFile, safe when
  # docket-manage sources that same file, and safe inside a URL. A generated
  # password carrying a '#' or an '@' breaks all three, in three different places.
  DB_PASSWORD="$(openssl rand -hex 24)"
  sudo -u postgres psql -qc "CREATE ROLE $DB_USER LOGIN PASSWORD '$DB_PASSWORD'"
  note "role $DB_USER created"
fi
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1; then
  note "database $DB_NAME already exists"
else
  sudo -u postgres createdb -O "$DB_USER" "$DB_NAME"
  note "database $DB_NAME created"
fi

# ---------------------------------------------------------------- environment
#
# ***THE ONE THING THIS SCRIPT MUST NEVER DO TWICE.***
#
# SECRET_KEY is not only a session signing key here: bid amounts, line prices and
# uploaded documents are encrypted at rest with a Fernet key derived from it (see
# backend/core/util.py). Generate a second one on a workspace holding sealed bids
# and every one of them becomes permanently unreadable. There is no recovery, by
# design — it is the same property that makes a stolen database dump useless.
#
# So the env file is written once and never rewritten, a fingerprint of the key is
# recorded beside it, and deploy.sh refuses to start if the two stop agreeing.
if [ -f "$ENV_FILE" ]; then
  say "$ENV_FILE already exists, leaving it alone"
  note "Its SECRET_KEY is the encryption key for every sealed bid in $DB_NAME."
  note "Deleting this file and running again generates a new one, and that"
  note "destroys the readability of every bid already stored. Do not."
else
  say "Writing $ENV_FILE"
  if [ -z "$DB_PASSWORD" ]; then
    echo "The role exists but there is no env file for $ROLE, so its password is not knowable." >&2
    echo "Set a new one and run this again:" >&2
    echo "  sudo -u postgres psql -c \"ALTER ROLE $DB_USER PASSWORD 'something'\"" >&2
    exit 1
  fi
  SECRET="$(openssl rand -hex 48)"
  # The two workspaces point at each other, and neither can serve the other's
  # job: DOCKET is single-tenant, so "set up your company" on the demo has to
  # leave for the real deployment rather than write to the demo's database, and
  # "see the demo" on the landing page has to leave for the demo.
  if [ "$ROLE" = demo ]; then
    DEMO_LOGIN=1; DEMO_PASSWORD="$(openssl rand -hex 8)"
    SIGNUP_URL="${SIGNUP_URL:-http://docket.eatngo-africa.com}"; DEMO_URL=""
  else
    DEMO_LOGIN=0; DEMO_PASSWORD=""
    SIGNUP_URL=""; DEMO_URL="${DEMO_URL:-http://demo.docket.eatngo-africa.com}"
  fi
  umask 027
  # QUOTING RULE, and it is not cosmetic. This file is read two ways: systemd
  # parses it directly for the service, and docket-manage sources it with a
  # shell for migrations and collectstatic. A value holding a space, an angle
  # bracket or an ampersand is fine to systemd and a syntax error to the shell —
  # so gunicorn comes up healthy while every management command dies. Anything
  # a person might paste arbitrary text into is therefore quoted; systemd strips
  # the quotes and so does the shell, so both read the same value.
  cat > "$ENV_FILE" <<ENVFILE
# DOCKET — the $ROLE workspace. Written once by provision.sh.
#
# Values that could contain spaces or shell metacharacters are quoted. Keep them
# that way, and quote anything you add: systemd tolerates bare ones, the shell
# does not, and the failure lands only on management commands.
#
# SECRET_KEY IS THE BID ENCRYPTION KEY. Changing it makes every sealed bid in
# $DB_NAME permanently unreadable. Back this file up; never regenerate it.
SECRET_KEY=$SECRET
DEBUG=0
PORT=$PORT
DATABASE_URL="postgres://$DB_USER:$DB_PASSWORD@127.0.0.1:5432/$DB_NAME"

# The public address. Decides the HTTPS redirect, the CSRF origin, and the links
# in every email sent without a request — password resets, team invitations,
# vendor claim links. Set it to the real domain before handing the address out;
# an http:// value keeps TLS enforcement off, which is right until certbot runs.
# http until certbot runs; flip both to https then. The domain comes FIRST in
# ALLOWED_HOSTS because deploy.sh's health check introduces itself by that name,
# and after certbot nginx answers 404 to any name it does not recognise.
PUBLIC_BASE_URL="http://$DOMAIN"
ALLOWED_HOSTS="$DOMAIN,$PUBLIC_IP,127.0.0.1,localhost"

# Demo mode. On the demo workspace the one-click personas live at /demo, not on
# the sign-in screen. SIGNUP_URL sends "set up your company" to the real
# deployment instead of the wizard here — DOCKET is single-tenant, so running
# setup against this database would rename this org and hand over its tenders.
DEMO_LOGIN=$DEMO_LOGIN
DEMO_PASSWORD="$DEMO_PASSWORD"
SIGNUP_URL="$SIGNUP_URL"
# Where the landing page sends "See the demo". Empty on the demo itself.
DEMO_URL="$DEMO_URL"

# Optional. Without ANTHROPIC_API_KEY the six AI features return "not
# configured" and everything else works. Without EMAIL_HOST every notification
# prints to the journal instead of being sent — which on the real workspace
# means invitations silently go nowhere.
ANTHROPIC_API_KEY=""
EMAIL_HOST=""
EMAIL_PORT=587
EMAIL_HOST_USER=""
EMAIL_HOST_PASSWORD=""
EMAIL_USE_TLS=1
DEFAULT_FROM_EMAIL="DOCKET <no-reply@$PUBLIC_IP>"

# A private, time-limited link to the vendor register JSON. Never committed:
# real bank details, TINs and contacts for about 1,400 companies.
VENDORS_URL=""

WEB_CONCURRENCY=2
LOG_LEVEL=INFO
ENVFILE
  chown root:"$APP_USER" "$ENV_FILE"
  chmod 640 "$ENV_FILE"

  # The fingerprint deploy.sh checks against. Root-only: it proves the key has
  # not changed without being a second copy of the key.
  printf '%s' "$SECRET" | sha256sum | cut -d' ' -f1 > "$ENV_DIR/.secret-fingerprint.$ROLE"
  chmod 600 "$ENV_DIR/.secret-fingerprint.$ROLE"
  note "SECRET_KEY generated and fingerprinted. Back up $ENV_FILE now."
fi

# ---------------------------------------------------------------- python
say "Building the virtualenv"
if [ ! -x "$APP_DIR/.venv/bin/python" ]; then
  sudo -u "$APP_USER" python3 -m venv "$APP_DIR/.venv"
fi
sudo -u "$APP_USER" "$APP_DIR/.venv/bin/pip" install --quiet --upgrade pip
sudo -u "$APP_USER" "$APP_DIR/.venv/bin/pip" install --quiet -r "$APP_DIR/requirements.txt"

# ---------------------------------------------------------------- system units
say "Installing the service, the proxy and the schedule"
install -m 755 "$APP_DIR/deploy/lightsail/docket-manage" /usr/local/bin/docket-manage
install -m 644 "$APP_DIR/deploy/lightsail/docket@.service" /etc/systemd/system/docket@.service
install -m 644 "$APP_DIR/deploy/lightsail/crontab" /etc/cron.d/docket

# Not overwritten once certbot has been here. certbot rewrites this file in place
# to add the 443 block and the redirect, so installing the repo copy over it on a
# re-run takes the site off https — quietly, since nginx reloads happily and only
# the visitors notice. The marker is certbot's own.
SITE="/etc/nginx/sites-available/docket-$ROLE"
if grep -q "managed by Certbot" "$SITE" 2>/dev/null; then
  note "nginx site for $ROLE left as certbot configured it."
else
  sed -e "s|__DOMAIN__|$SERVER_NAME|g"       -e "s|__PORT__|$PORT|g"       -e "s|__ROLE__|$ROLE|g"       -e "s|__DEFAULT__|$DEFAULT|g"       "$APP_DIR/deploy/lightsail/nginx-site.template" > "$SITE"
  chmod 644 "$SITE"
  note "nginx site for $ROLE -> $SERVER_NAME on port $PORT"
fi
ln -sfn "$SITE" "/etc/nginx/sites-enabled/docket-$ROLE"
# nginx's own default site is also a default_server on port 80, so leaving it
# enabled makes which of the two answers a question of load order.
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
systemctl daemon-reload
systemctl enable --quiet "docket@$ROLE"

# ---------------------------------------------------------------- firewall
# OpenSSH first, always. Enabling ufw before allowing it closes the session you
# are typing into, and the way back is the browser console.
say "Firewall"
ufw allow OpenSSH >/dev/null
# Both ports from the start. 443 with nothing listening is closed either way, and
# opening it later is the step that gets missed: certbot issues over port 80 and
# says Congratulations, so the certificate is real and the site is unreachable,
# which reads like a broken certificate rather than a shut port.
ufw allow 'Nginx Full' >/dev/null
ufw --force enable >/dev/null
note "The Lightsail console keeps a second firewall in front of this one:"
note "Networking -> IPv4 Firewall must also allow HTTP (80) and HTTPS (443)."

# ---------------------------------------------------------------- what is left
cat <<SUMMARY

${BOLD}The box is ready for the $ROLE workspace. Its database is empty.${PLAIN}

  Address        http://$DOMAIN   (http://$PUBLIC_IP until DNS points here)
  Environment    $ENV_FILE
  Database       $DB_NAME
  Code           $APP_DIR
  Logs           journalctl -u docket@$ROLE -f

Left to do:

  1. Back up $ENV_FILE somewhere you cannot lose it. Its SECRET_KEY
     is the encryption key for every sealed bid this workspace will hold.

  2. Fill the database and start it:

       sudo bash $APP_DIR/deploy/lightsail/deploy.sh $ROLE --bootstrap

SUMMARY

if [ "$ROLE" = app ]; then cat <<'APPNOTE'
  3. This is the real workspace, so it starts empty and DEMO_LOGIN=0. The first
     person to open it gets the setup wizard and becomes the owner; everyone
     after that arrives by invitation.

APPNOTE
else cat <<DEMONOTE
  3. This is the demo. The one-click personas are at http://$PUBLIC_IP/demo —
     not on the sign-in screen, so the address can be handed out without the
     first thing a stranger sees being a way in. The seeded password is in
     $ENV_FILE as DEMO_PASSWORD.

  4. Once the real workspace has a domain, put it in SIGNUP_URL in $ENV_FILE so
     "Set up your company" on /demo leaves for it rather than writing here.

DEMONOTE
fi

cat <<'TLS'
  When DNS points at this box, take it to https — the app follows the
  certificate with no code change, because nginx forwards the scheme:

      sudo apt-get install -y certbot python3-certbot-nginx
      sudo certbot --nginx -d your.domain

  Then set PUBLIC_BASE_URL to https://your.domain and add the domain to
  ALLOWED_HOSTS in the env file, and restart. Until you do, emailed links
  point at the bare IP.

TLS
