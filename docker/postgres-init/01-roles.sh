#!/bin/bash
# Creates the two runtime database roles at cluster initialization.
#
# - domino_app:  the application role for all domain queries, fully subject to RLS
# - domino_auth: the role Better Auth uses; only granted access to auth tables
#
# Passwords come from the environment (see docker-compose files). Migrations
# create the roles as NOLOGIN if they are missing, so this script only needs to
# guarantee LOGIN + password. It is idempotent.
#
# Two things are deliberate here. The passwords are required rather than
# defaulted: a fallback of "the role name as its own password" is worse
# than a failure, because it works. And they are passed to psql as
# variables and quoted with format(%L) inside the database rather than
# pasted into SQL by the shell, so a password containing a quote breaks
# nothing and injects nothing. scripts/ensure-roles.ts does the same and
# says why.
#
# The statements are built with a plain SELECT and run with \gexec rather
# than inside a DO block: psql interpolates :'var' only outside quoted
# literals, and a DO body is one big dollar-quoted literal. An earlier
# version put the variables inside the block, which Postgres read as a
# syntax error, and the container died on the first start with nothing
# but "exited (3)" to show for it. tests/meta/postgres-init.test.ts runs
# this script for real so that cannot come back.
set -euo pipefail

: "${DOMINO_APP_PASSWORD:?set DOMINO_APP_PASSWORD}"
: "${DOMINO_AUTH_PASSWORD:?set DOMINO_AUTH_PASSWORD}"

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v app_pw="$DOMINO_APP_PASSWORD" -v auth_pw="$DOMINO_AUTH_PASSWORD" <<'EOSQL'
SELECT format(
  CASE WHEN EXISTS (SELECT FROM pg_roles WHERE rolname = 'domino_app')
    THEN 'ALTER ROLE domino_app LOGIN PASSWORD %L'
    ELSE 'CREATE ROLE domino_app LOGIN PASSWORD %L'
  END,
  :'app_pw')
\gexec

SELECT format(
  CASE WHEN EXISTS (SELECT FROM pg_roles WHERE rolname = 'domino_auth')
    THEN 'ALTER ROLE domino_auth LOGIN PASSWORD %L'
    ELSE 'CREATE ROLE domino_auth LOGIN PASSWORD %L'
  END,
  :'auth_pw')
\gexec
EOSQL
