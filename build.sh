#!/usr/bin/env bash
# Render build script — installs deps, builds the React app, prepares Django.
set -o errexit

pip install -r requirements.txt

cd frontend
npm install
npm run build
cd ..

cd backend
python manage.py collectstatic --noinput
python manage.py migrate
python manage.py seed_demo

# The vendor register is deliberately not in this repo: it carries real bank
# details, TINs, emails and phone numbers for about 1,400 companies, and git
# history is forever (see .gitignore). Two ways to get it onto a deployment,
# both keeping it out of the repository:
#
#   VENDORS_URL — a private, time-limited link to the JSON export, set in the
#                 Render dashboard. Fetched here, imported, and gone with the
#                 build container. The link lives in an env var, not in git.
#   a mounted disk holding backend/data/vendors.json, uploaded out of band.
#
# With neither, this is a no-op: the deployment keeps its seeded demo suppliers,
# which is the right default for a build that was given no register.
if [ -n "${VENDORS_URL:-}" ]; then
  mkdir -p data
  curl -fsSL "$VENDORS_URL" -o data/vendors.json
fi
if [ -f data/vendors.json ]; then
  python manage.py import_vendors --commit
else
  echo "No vendor register present — keeping the seeded demo suppliers."
fi
cd ..
