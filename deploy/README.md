# Deploying DOCKET to AWS Lightsail — container services

> **There are two paths in this repo, and `lightsail/` is the recommended one.**
> `deploy/lightsail/` deploys to a Lightsail *instance* — nginx, gunicorn and
> Postgres on one Ubuntu box — modelled on the ENG-Analytics host. It is cheaper
> (~$12/mo all in), needs nothing installed locally but ssh, and carries both
> the demo and the real workspace on the same instance.
>
> This file covers Lightsail **Containers**, which needs Docker, the AWS CLI and
> `lightsailctl` on your machine plus a separate managed Postgres (~$22/mo).
> Pick one. Do not run both against the same database.


Two container services, two databases: **demo** and **app**. Read the next
section before deciding you only need one.

---

## Why two deployments and not one

DOCKET is single-tenant. `OrgSetting` is a single row (`id=1`), and no tender,
bid or supplier carries a tenant key — see `backend/core/models.py`, and the
"still on the list" section of the root README, which says so outright.

So a company that ran the setup wizard against the demo's database would:

* rename the shared org row, replacing the demo organisation with theirs,
* inherit the seven seeded tenders and ~1,400 demo suppliers as their own,
* and put their real sealed bids in the database you reset whenever a demo
  goes sideways.

That is not something the wizard can guard against — it is the data model. Until
real multi-tenancy exists, one deployment serves one workspace.

The two are joined at the front end instead: the demo's `SIGNUP_URL` points at
the real deployment, so "Set up your company" on `/demo` leaves for `app` rather
than writing to the demo database.

---

## What you need

* `docker` and `aws` (CLI v2), with credentials that can reach Lightsail.
* The **`lightsailctl` plugin**, which `aws lightsail push-container-image`
  shells out to and which does not ship with the CLI. Without it the push fails
  with an unhelpful message about an unrecognised command. Install:
  <https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-install-software.html>
* A Postgres database per deployment — Lightsail managed database or RDS.
  **Not SQLite.** A container has no durable disk: uploads and sealed bids both
  live in Postgres, so SQLite-in-a-container destroys every tender on redeploy.

## First deploy

```sh
cp deploy/app.env.example deploy/app.env      # then fill it in
./deploy/lightsail.sh deploy/app.env --create
```

`--create` makes the container service and waits for it to come up, which takes
a few minutes. Afterwards, deploying again is just:

```sh
./deploy/lightsail.sh deploy/app.env
```

Same for the demo with `deploy/demo.env`.

### The chicken and egg on the very first deploy

`PUBLIC_BASE_URL` decides the HTTPS redirect, the CSRF origins and the links in
every email sent without a request — password resets, team invitations, vendor
claim links. On the first deploy you do not yet know the Lightsail URL. So:
deploy once, read the URL off the output, put it in the env file, deploy again.
Or point your own domain at the service and use that from the start.

The script prints both values at the end so a mismatch is visible.

---

## The one thing you cannot get wrong

**`SECRET_KEY` is the encryption key.** Bid amounts, line prices and uploaded
documents are encrypted at rest with a Fernet key derived from it
(`backend/core/util.py`). Generate it once:

```sh
python -c "import secrets; print(secrets.token_urlsafe(64))"
```

Then keep it where you cannot lose it. Change it on a deployment holding sealed
bids and every one of them becomes permanently unreadable. There is no recovery
path, and that is deliberate — it is the same property that makes a database
dump taken by someone else useless.

---

## Demo versus real, in settings

|                   | demo            | app                       |
| ----------------- | --------------- | ------------------------- |
| `DEMO_LOGIN`      | `1`             | `0`                       |
| `SEED_DEMO`       | `1`             | `0`                       |
| `DEMO_PASSWORD`   | generate one    | unused                    |
| `SIGNUP_URL`      | the app's URL   | unset                     |
| database          | its own         | its own                   |

With `DEMO_LOGIN=1` the one-click personas live at **`/demo`**, not on the
sign-in screen. A password-free door is fine on a workspace of invented tenders
and wrong on one holding real bids, and the difference is one environment
variable — so the sign-in screen of the real deployment has nothing on it that
would have to be hidden.

With `SEED_DEMO=0` the app deployment starts empty, and the first person through
the door gets the setup wizard and becomes the owner. Everyone after that
arrives by invitation.

---

## Things that will bite you

**The health check must not be redirected.** Lightsail probes the container
directly over HTTP with no `X-Forwarded-Proto`. With `SECURE_SSL_REDIRECT` on,
that probe gets a 301, reads it as unhealthy, and rolls the deployment back —
while the application works perfectly. `settings.py` exempts `/api/health/` for
exactly this reason. Do not remove it.

**Do not pin `ALLOWED_HOSTS` carelessly.** The same prober sends an internal
`Host` header, not your domain. Pin the list only if you know what it sends, and
keep the public domain in it. The default is `*`, which is safe behind a load
balancer that only routes your domain.

**Scale stays at 1.** Migrations run at container start (`deploy/entrypoint.sh`),
and Django takes no cross-process lock, so two replicas starting together would
race on the same database. The deploy script refuses `SCALE` above 1 rather than
letting you find this out in production. To scale up, move `migrate` to a
one-off task first.

**The vendor register never goes in the image.** It holds real bank details,
TINs, emails and phone numbers for about 1,400 companies. An image layer is as
permanent as a git commit. Use `VENDORS_URL` — a private, time-limited link
fetched at container start, imported, and gone when the container dies. A failed
fetch logs a warning and leaves the existing register alone rather than taking
the service down.

---

## Logs and rollback

```sh
aws lightsail get-container-log --service-name docket-app --container-name web
aws lightsail get-container-service-deployments --service-name docket-app
```

Lightsail keeps previous deployments; a failed one rolls back to the last
healthy version on its own.

---

## Render

`render.yaml` still works and is unchanged in behaviour. `settings.py` now reads
`PUBLIC_BASE_URL` first and falls back to `RENDER_EXTERNAL_HOSTNAME`, so a Render
deployment keeps configuring itself with no new variables.
