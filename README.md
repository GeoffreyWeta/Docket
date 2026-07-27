# DOCKET — sealed-bid tendering, end to end

Django API + React (Vite) frontend, deployed as a single Render web service.
Demo tenant: Kestrel Hospitality Group, a 128-store multi-brand restaurant group.

**Everything that matters is enforced server-side:** real authentication, sealed
bids (including uploaded documents), blind evaluation, conflict-of-interest gates,
role-guarded actions, a tamper-evident audit trail, notifications with email
dispatch, and an idempotent background sweep — no worker dyno required.

## The full platform

* **Vendor onboarding** — self-service registration (email-verified; auto-verified in
  demo mode), compliance-document uploads with expiry dates, a prequalification
  review queue for procurement with approve / decline-with-reason, and vendor
  notifications either way. Procurement can also invite a vendor to register by email.
* **Team onboarding** — invite colleagues by email with a role (procurement,
  evaluator, approver, auditor); they set a password via a single-use link. In demo
  mode the invite link is surfaced in the UI so the flow is testable without SMTP.
* **Password reset** — emailed single-use link; resetting revokes every active session.
* **Cryptographic sealing at rest** — bid amounts, line prices and bid documents are
  Fernet-encrypted in the database from submission until the recorded opening. A DB
  dump taken early contains only ciphertext. (Key derives from `SECRET_KEY`; an
  attacker with both the DB *and* the server's env can still decrypt — dedicated key
  management is the next rung.)
* **Tamper-evident audit trail** — every event is hash-chained to the one before it.
  Auditors get a one-click integrity verification and a CSV export including the
  hashes; the smoke test proves that editing any historical row breaks the chain.
* **Rename everything from the app** — the workspace name (Team page; flows into
  invitations, letters, memos, and the reference prefix on new tenders), your own
  display name (Security panel), and a vendor's company details (their portal).
  Historical audit records always keep the name that was true at the time.
* **Two-factor authentication (TOTP)** — provider-free MFA with any authenticator
  app: QR enrollment from the Security panel, codes required at sign-in, disable
  needs a current code, enrollment recorded in the audit trail. Plus brute-force
  lockout (5 failures = 15-minute lock) and one-click sign-out of all devices.
* **Search & filters** — free-text search on tenders, suppliers, and the audit
  trail; status filters including hide-awarded and prequalified-only.
* **Getting started, built in** — a role-aware guide auto-opens on every user's first
  sign-in (and lives behind the Guide button) walking each role through their journey.
* **A real approval matrix** — the approver sets the publication threshold from the
  Approvals page; below it tenders publish instantly, at or above they route for
  sign-off. Approval belongs to the role, not a job title.
* **Supplier CSV import & tender templates** — load an existing vendor book in one
  upload; duplicate any past tender into a fresh draft with dates cleared.
* **Oversight tooling** — per-tender compliance report PDF, an anomaly scan (single-
  bidder awards, winner concentration, near-ceiling awards), approver spend view,
  evaluator inline proposal access, and a vendor win/loss record.
* **Exports** — bid comparison as Excel, award memo as PDF, audit trail as CSV, all
  generated server-side and role-guarded.
* **Two-stage envelope opening** — the strict public-sector procedure: technical
  envelopes open first for blind scoring while prices stay ciphertext; commercial
  envelopes are then decrypted only for bidders meeting the technical threshold.
  Disqualified bidders' pricing is *never* decrypted — the envelope is returned
  unopened, and the API, the exports and the database all honour that.
* **Reverse auctions** — a live, rank-visible price competition (tender type "AUC").
  Suppliers see their position, never a competitor's price; the buyer watches a live
  leaderboard. Minimum decrements are enforced, bids in the final two minutes extend
  the close (anti-sniping), every price movement is kept, and closing feeds the final
  standings straight into the standard recommendation → CFO approval → letters flow.
  The demo seeds a live auction (KST-AUC-2026-030) closing about two hours after
  seeding — sign in as coldline/harmattan/bluechip to bid against each other.

## What "sealed" means here

* Before the recorded opening, buyer roles receive only the fact that a bid exists —
  no amounts, no line prices, no documents, not even document names.
* Evaluators are only ever sent their own scores, and cannot score at all until they
  sign a conflict-of-interest declaration (recorded in the audit trail).
* Suppliers see only tenders they're invited to, their own bid and documents, their
  own award/regret letter, and anonymised answered clarifications.
* The supplier-side AI review prompt is composed on the server and never includes
  the buyer's budget ceiling.

## Deploy to Render (blueprint)

1. Push this folder to a Git repo (GitHub/GitLab).
2. On Render: **New + → Blueprint**, select the repo. Render reads `render.yaml`,
   creates the web service, generates `SECRET_KEY` and a `DEMO_PASSWORD`, builds,
   migrates and seeds automatically. Health checks hit `/api/health/`.
3. Set `DATABASE_URL` on the service to the **Internal Database URL** of your
   Postgres instance, with a database dedicated to DOCKET. If that instance
   already hosts another Django app, give DOCKET its own database first —
   sharing one is not safe, because both apps have an app labelled `core` and
   their migration histories collide on `core.0001_initial`:

       -- connected to the instance as a role with CREATEDB
       CREATE DATABASE docket_db;

   Then point `DATABASE_URL` at `.../docket_db`. Use the internal hostname (no
   `.<region>-postgres.render.com` suffix) when the web service sits in the same
   region and account as the database; the external hostname requires
   `?sslmode=require`.
4. Optional env vars on the service:
   * `ANTHROPIC_API_KEY` — enables the six AI features (scope drafting, criteria
     suggestion, clarification answers, comparison brief, supplier bid review,
     portfolio insights). Without it those buttons return a friendly message.
   * `EMAIL_HOST` / `EMAIL_HOST_USER` / `EMAIL_HOST_PASSWORD` / `DEFAULT_FROM_EMAIL`
     — every in-app notification is also emailed. Without SMTP, emails print to
     the server log so you can still see exactly what would have been sent.
   * `DEMO_LOGIN=0` — removes one-click demo logins and requires passwords.

## Accounts

Seeded accounts (password = the `DEMO_PASSWORD` env var; locally `docket-demo`):

| username  | who                              | role        |
|-----------|----------------------------------|-------------|
| amara     | Amara Okafor — Head of Procurement | procurement |
| deji      | Deji Balogun — Supply Quality      | evaluator   |
| ngozi     | Ngozi Eze — Finance                | evaluator   |
| mark      | Mark Iyer — CFO                    | approver    |
| aisha     | Aisha Bello — Internal Audit       | auditor     |
| coldline  | Coldline Logistics                 | supplier    |
| harmattan | Harmattan Foods Ltd                | supplier    |
| bluechip  | BlueChip POS Africa                | supplier    |

While `DEMO_LOGIN=1`, the sign-in screen shows one-click buttons for these accounts
and the top bar has a quick account switcher. Sign-in issues an opaque bearer token;
sign-out revokes it server-side. New accounts arrive two ways: vendors via
**Register your company** on the sign-in screen, teammates via **Team → Invite**.

## Run locally

Backend (terminal 1):

    pip install -r requirements.txt
    cd backend
    python manage.py migrate
    python manage.py seed_demo
    python manage.py runserver 8000

Frontend with hot reload (terminal 2):

    cd frontend
    npm install
    npm run dev        # http://localhost:5173, proxies /api to :8000

Or serve the built app straight from Django (what production does):

    cd frontend && npm run build && cd ../backend
    python manage.py collectstatic --noinput
    python manage.py runserver 8000   # open http://localhost:8000

API smoke test (auth, sealing, blindness, uploads, COI, notifications, awards):

    cd backend && python smoke.py

Test company + test user — a self-registered vendor ("Test Company Ltd",
`testco@example.com`) and an invited teammate ("Test User", procurement,
`test.user@example.com`), both created through the same endpoints the UI calls,
plus an open sandbox tender so the vendor portal has a live bid room:

    cd backend && python test_org.py           # idempotent; never wipes data
    cd backend && python test_org.py --full    # reseeds, then tests everything
                                               # through those two accounts

## Background jobs

The sweep (deadline sealing events, bid-deadline reminders, compliance-document
expiry alerts) is idempotent and runs two ways:

* opportunistically — at most every 10 minutes, piggybacking on traffic; and
* on a schedule — `python manage.py run_sweep` from any cron (Render cron job,
  GitHub Action, etc.) if you want it firing even with zero traffic.

## Files

Uploads (tender packs, technical/commercial proposals) are stored in Postgres so
they survive deploys with no object-storage setup; 10 MB per file, safe-extension
whitelist. A supplier's documents are locked while their bid is sealed and can be
swapped only by withdrawing the bid first — all before the deadline.

## A good end-to-end run

1. **amara** — open the sealed equipment tender: break the seals, download the
   technical proposals, see the line-item comparison.
2. **deji** — sign the conflict-of-interest declaration, score blind, add a written
   justification.
3. **amara** — recommend the dairy award; **mark** approves it; letters are issued
   and every bidder is notified.
4. **harmattan** — read your award letter. **coldline** — upload a technical
   proposal, price the cold-chain lines, seal the bid, watch the buyer get notified.
5. **bluechip** — note you cannot seal a bid without acknowledging Addendum 01 and
   uploading a technical proposal.
6. **coldline vs harmattan** — open the diesel reverse auction and outbid each other;
   watch your rank move, then sign in as **amara** to see the live leaderboard they can't.

## Still on the list before real production

SSO/SAML (needs an identity provider — TOTP MFA is already built in), virus scanning
on uploads (needs ClamAV or a scanning service), qualified e-signatures on letters
(needs a signature provider), true multi-tenancy (today: one deployment per client,
which is a fine way to start), server-side pagination for very large portfolios, and
a legal review of the letter templates. The role checks and data model are structured
so none of these require a rewrite.
