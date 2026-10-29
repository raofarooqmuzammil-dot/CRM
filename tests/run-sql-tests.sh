#!/usr/bin/env bash
# Runs every supabase/*.sql file in order on a scratch Postgres database, then tests the database rules
# (call totals, follow-up dates, privacy). Needs a local Postgres where you can run psql as a superuser.
# Usage: PSQL="psql" bash tests/run-sql-tests.sh      (set PSQL if you need extra connection options)
set -e
PSQL=${PSQL:-psql}; here=$(cd "$(dirname "$0")" && pwd); sql="$here/../supabase"
$PSQL -q -c 'drop database if exists crm_test' -c 'create database crm_test' 2>&1 | grep -v NOTICE || true
run() { $PSQL -d crm_test -v ON_ERROR_STOP=1 -q -f "$1"; }
$PSQL -d crm_test -q -f "$here/sql/stub.sql" 2>&1 | grep -v "already exists" || true
for f in schema phase1b phase1c phase1d phase2a phase3a phase3b phase4a phase5a phase6a phase7a; do run "$sql/$f.sql" && echo "migration ok  $f"; done
$PSQL -d crm_test -q -f "$here/sql/call-flow.sql" 2>&1 | grep -v '^$'
$PSQL -d crm_test -q -f "$here/sql/next-followup.sql" 2>&1 | grep -v '^$'
