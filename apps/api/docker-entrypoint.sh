#!/bin/sh
set -e
# Migrations use the direct connection; fall back to DATABASE_URL when there is no pooler.
export DIRECT_URL="${DIRECT_URL:-$DATABASE_URL}"
./node_modules/.bin/prisma migrate deploy
exec node main.js
