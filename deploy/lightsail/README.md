# Deploying DOCKET on AWS Lightsail

One Ubuntu instance running nginx, gunicorn and Postgres, with the background
sweep on cron. The same shape as the ENG-Analytics host, with the differences
this application forces.

**Two workspaces on one box.** `app` is the real one; `demo` is the one you hand
the link to. They share the packages, the swap, the Postgres server, the
checkout and the virtualenv, and share nothing else: a database each, an env
file each, a systemd unit each, a port each.

That separation is not tidiness. DOCKET is single-tenant — one `OrgSetting` row,
no tenant key on tenders or suppliers — so a company that ran the setup wizard
against the demo's database would rename the demo organisation and inherit its
seven seeded tenders as their own. Two databases is what prevents it.

---

## First run

On a fresh **Ubuntu 24.04** Lightsail instance — the $12 plan, 2 GB and 2 vCPUs,
carries both workspaces — attach a **static IP** first, in Networking. Do it
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
sudo certbot --nginx -d app.yourdomain -d demo.yourdomain
```

Then in each env file set `PUBLIC_BASE_URL` to the `https://` address and add
the domain to `ALLOWED_HOSTS`, and `systemctl restart docket@app docket@demo`.

The application follows the certificate with no code change: nginx forwards
`X-Forwarded-Proto`, and `settings.py` turns on the HTTPS redirect and secure
cookies as soon as `PUBLIC_BASE_URL` is https.

Until you do this, every emailed link — password resets, team invitations,
vendor claim links — points at the bare IP. Those links are the whole vendor
onboarding path, so this is not cosmetic.

Once the real workspace has a domain, set `SIGNUP_URL` in **`env.demo`** to it.
That sends "Set up your company" on `/demo` to the real deployment instead of
running the wizard against the demo database.

---

## Things that will bite you

**Two firewalls.** `ufw` on the box, and the Lightsail console's IPv4 firewall in
front of it. Open 443 from the start — certbot issues over port 80 and says
Congratulations, so a shut 443 reads as a broken certificate rather than a shut
port.

**Do not overwrite nginx.conf after certbot.** certbot rewrites
`/etc/nginx/sites-available/docket` in place to add the 443 block. `provision.sh`
greps for certbot's own marker and leaves the file alone if it is there —
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
`swappiness=10`, and the `npm run build` on deploy is what needs it: without
swap, a vite build on a 2 GB box competing with Postgres is a plausible way to
have the OOM killer take the database instead.

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
