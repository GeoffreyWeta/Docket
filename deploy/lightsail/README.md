# Deploying DOCKET on AWS Lightsail

One Ubuntu instance running nginx, gunicorn and Postgres, with the background
sweep on cron. The same shape as the ENG-Analytics host, with the differences
this application forces.

**Two workspaces on one box, two names.**

| | workspace | port | what it serves |
| --- | --- | --- | --- |
| `docket.eatngo-africa.com` | `app` | 8000 | the landing page, then the real workspace |
| `demo.docket.eatngo-africa.com` | `demo` | 8001 | the demo, personas at `/demo` |

Both names are just defaults — pass `DOMAIN=` to override either. They share the
packages, the swap, the Postgres server, the checkout and the virtualenv, and
share nothing else: a database each, an env file each, a systemd unit each, a
port each.

**DNS, before you provision.** Two A records, both at the instance's static IP:

```
docket.eatngo-africa.com.        A   <static IP>
demo.docket.eatngo-africa.com.   A   <static IP>
```

The bare IP also reaches the real workspace on its own — only `app` is nginx's
`default_server` — so you can provision and test before DNS propagates.

## The landing page

While no company has registered, `docket.eatngo-africa.com` shows a **landing
page**, not a sign-in form: an empty workspace has no password to type. It says
what DOCKET is and offers two doors — *Set up your company*, which runs the
wizard, and *See it working first*, which leaves for the demo (that button only
appears when `DEMO_URL` is set).

The moment a company completes setup, the landing page gives way to the ordinary
sign-in screen. It is gated on the same `needsSetup` as the wizard, so the front
door is showing exactly while there is nobody behind it. *Sign in* and *Register
as a vendor* stay in the footer throughout, for the administrator account that
can exist before any company does.

The two deployments point at each other through two settings, and both are
written by `provision.sh`:

* `DEMO_URL` on **app** — where "See it working first" goes.
* `SIGNUP_URL` on **demo** — where "Set up your company" goes, which must leave
  for the real deployment. DOCKET is single-tenant, so running the wizard
  against the demo database would rename the demo organisation and hand the
  newcomer its seeded tenders.

---

## Which plan

| plan | RAM | builds on the box? | workspaces |
| --- | --- | --- | --- |
| **$12** | 2 GB | yes | app + demo |
| **$7** | 1 GB | **no — use `--no-build`** | app only, `WEB_CONCURRENCY=1` |

**A vite build of this app peaks at about 1.4 GB resident.** That is measured,
not estimated, and it is more than the whole $7 instance. On 1 GB node either
dies with "JavaScript heap out of memory" or swaps for ten minutes while the OOM
killer looks at Postgres — which is the worst outcome available, because the
database is the largest process and losing it is not a failed deploy, it is a
restore.

So on the $7 plan the bundle is built somewhere with memory and copied up. It is
1.2 MB; the copy is faster than the build would have been on any plan. See
**Deploying to the $7 instance** below.

The other 1 GB adjustments, both in `/etc/docket/env.<role>`:

* `WEB_CONCURRENCY=1` — the default of 2 is sized for the $12 plan's two cores,
  and four gunicorn workers across two workspaces will not fit in 1 GB beside
  Postgres.
* Run **`app` only.** Two workspaces means two gunicorn services and two
  databases. If you want the demo as well, that is the $12 plan.

## First run

On a fresh **Ubuntu 24.04** Lightsail instance, attach a **static IP** first, in
Networking. Do it
before provisioning, not after: the address goes into `ALLOWED_HOSTS`, and
changing it later means editing the env file and restarting. Allow **HTTP (80)**
and **HTTPS (443)** in the console's IPv4 firewall while you are there; that one
sits in front of the box's own `ufw`, and `provision.sh` only configures the
second.

```bash
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/GeoffreyWeta/Docket.git /tmp/docket
sudo bash /tmp/docket/deploy/lightsail/provision.sh app
sudo bash /tmp/docket/deploy/lightsail/provision.sh demo    # optional
```

To use different names:

```bash
sudo DOMAIN=tenders.example.com bash /tmp/docket/deploy/lightsail/provision.sh app
```

On a **private repository** both clones need a key, and the second needs it to
belong to `docket` rather than to you: `deploy.sh` fetches as `docket` on every
deploy, so a credential only your login holds gets the box built and then leaves
it stuck on that commit. `provision.sh` generates the key and, if the clone
fails, prints the public half with the one instruction that fixes it.

Provisioning stops with the database empty. Then:

```bash
sudo bash /srv/docket/deploy/lightsail/deploy.sh app  --bootstrap
sudo bash /srv/docket/deploy/lightsail/deploy.sh demo --bootstrap
```

`--bootstrap` seeds the demo and imports the vendor register if `VENDORS_URL` is
set. On `app` it seeds nothing: the real workspace starts empty on purpose, and
the first person to open it gets the setup wizard and becomes the owner.

## Every deploy after that

```bash
sudo bash /srv/docket/deploy/lightsail/deploy.sh --all
```

Fetch, `npm ci && npm run build`, `pip install`, migrate, collectstatic,
restart, then check `/api/health/` through nginx the way a visitor would.

## Deploying to the $7 instance

Build on your own machine, send the bundle up, then deploy without building:

```bash
# on your machine, from the repo root
npm --prefix frontend ci
npm --prefix frontend run build
rsync -av --delete frontend/dist/ ubuntu@<static-ip>:/tmp/dist/

# on the box
ssh ubuntu@<static-ip> 'sudo rsync -av --delete --chown=docket:docket     /tmp/dist/ /srv/docket/frontend/dist/ &&     sudo bash /srv/docket/deploy/lightsail/deploy.sh app --no-build'
```

`--no-build` skips npm entirely and uses whatever is in `frontend/dist`. It
refuses to run if `dist/index.html` is not there, because the failure it makes
possible is serving yesterday's interface against today's API — quieter than a
crash and harder to notice. It prints the bundle's build time on every deploy so
a stale one is visible.

Everything else about the deploy is unchanged: migrations, collectstatic,
restart and the health check all still run.

---

## ⚠ SECRET_KEY is the bid encryption key

Bid amounts, line prices and uploaded documents are encrypted at rest with a
Fernet key derived from `SECRET_KEY` (`backend/core/util.py`). This is the one
setting that cannot be regenerated: a new key does not raise an error, it
silently makes every sealed bid in that workspace permanently unreadable while
the application carries on looking healthy.

Three things follow, and all three are already built in:

* `provision.sh` writes each env file **once** and refuses to rewrite it.
* It records a SHA-256 fingerprint of the key in `/etc/docket/.secret-fingerprint.<role>`.
* `deploy.sh` checks that fingerprint **before it touches a database** and stops
  with an explanation if it has changed.

**Back up `/etc/docket/env.app` the moment it is written.** Losing it loses every
bid in that workspace, and no backup of the database alone will bring them back.

---

## Where things are

| | |
| --- | --- |
| Code | `/srv/docket` (one checkout, both workspaces) |
| Environment | `/etc/docket/env.app`, `/etc/docket/env.demo` |
| Databases | `docket_app`, `docket_demo` on the local Postgres |
| Services | `docket@app` (port 8000), `docket@demo` (port 8001) |
| Logs | `journalctl -u docket@app -f` |
| Sweep log | `/var/log/docket/sweep.log` |
| Management | `sudo -u docket docket-manage app migrate` |

`docket-manage` takes the workspace as its first argument, and exists so cron
and a person at the keyboard run commands the same way. Running `manage.py`
directly with no `DATABASE_URL` in the shell falls back to SQLite and writes to
a file nothing serves, reporting success throughout.

---

## Going to https

```bash
sudo apt-get install -y certbot python3-certbot-nginx
```

```bash
sudo certbot --nginx -d docket.eatngo-africa.com -d demo.docket.eatngo-africa.com
```

Then in each env file set `PUBLIC_BASE_URL` to the `https://` address (the
domain is already first in `ALLOWED_HOSTS`), and also flip `DEMO_URL` on app and
`SIGNUP_URL` on demo to their `https://` forms. Then
`systemctl restart docket@app docket@demo`.

The application follows the certificate with no code change: nginx forwards
`X-Forwarded-Proto`, and `settings.py` turns on the HTTPS redirect and secure
cookies as soon as `PUBLIC_BASE_URL` is https.

Until you do this, every emailed link — password resets, team invitations,
vendor claim links — points at the bare IP. Those links are the whole vendor
onboarding path, so this is not cosmetic.

---

## Things that will bite you

**Two firewalls.** `ufw` on the box, and the Lightsail console's IPv4 firewall in
front of it. Open 443 from the start — certbot issues over port 80 and says
Congratulations, so a shut 443 reads as a broken certificate rather than a shut
port.

**Do not overwrite the nginx site after certbot.** certbot rewrites
`/etc/nginx/sites-available/docket-<role>` in place to add the 443 block. There
is a file per workspace precisely so this guard can be per-site: `provision.sh`
greps for certbot's own marker and leaves that file alone if it is there —
reinstalling the repo copy would take the site off https quietly, since nginx
reloads happily and only visitors notice.

**Quote env values that could contain anything.** The env file is read twice: by
systemd for the service, and by a shell for `docket-manage`. A value with a
space, an angle bracket or an ampersand is fine to systemd and a syntax error to
the shell — so gunicorn stays healthy while every migration fails. The generated
file quotes everything a person might paste into. Keep it that way.

**The health check sends a real `Host` header.** After certbot, nginx answers 404
to any name it does not recognise, including `127.0.0.1`. `deploy.sh` reads the
first `ALLOWED_HOSTS` entry and asks as that. It accepts 200 **or** 301, because
301 is TLS working.

**Swap is not optional.** Lightsail gives you none. `provision.sh` adds 2 GB with
`swappiness=10`, and the `npm run build` on deploy is what needs it: the build
peaks around 1.4 GB, so on a 2 GB box competing with Postgres, no swap is a
plausible way to have the OOM killer take the database instead. On 1 GB, swap is
not enough either — build elsewhere and use `--no-build`.

**The vendor register never travels in the repo or on disk.** Real bank details,
TINs and contacts for ~1,400 companies. `VENDORS_URL` is fetched at bootstrap,
imported, and deleted in the same step.

---

## Containers

There is also a `Dockerfile` and `deploy/lightsail.sh` in this repo for Lightsail
**Containers**. It works, but it needs Docker, the AWS CLI and `lightsailctl` on
your machine and a separate managed Postgres (~$15/mo on top). The instance path
documented here is the one modelled on a host you already run, and it is
cheaper. Pick one; do not run both against the same database.
