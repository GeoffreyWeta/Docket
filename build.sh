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
cd ..
