#!/usr/bin/env bash
# Sobe um PostgreSQL temporário, aplica stub + migrações e roda os testes de RLS.
set -euo pipefail
cd "$(dirname "$0")/../.."
PGBIN=$(ls -d /usr/lib/postgresql/*/bin | tail -1)
DIR=$(mktemp -d); PORT=${PGPORT_TEST:-54329}
if [ "$(id -u)" = 0 ]; then RUN="runuser -u postgres --"; chown postgres "$DIR"; else RUN=""; fi
trap '$RUN "$PGBIN/pg_ctl" -D "$DIR" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$DIR"' EXIT
$RUN "$PGBIN/initdb" -D "$DIR" -A trust -U postgres >/dev/null
$RUN "$PGBIN/pg_ctl" -D "$DIR" -o "-p $PORT -k /tmp" -l "$DIR/log" start >/dev/null
P="psql -h /tmp -p $PORT -U postgres -v ON_ERROR_STOP=1 -q"
$P -c "create database t" >/dev/null
$P -d t -f supabase/tests/stub_supabase.sql
for f in supabase/migrations/*.sql; do $P -d t -f "$f"; done
$P -d t -f supabase/tests/rls.test.sql
echo "Banco: todos os testes passaram."
