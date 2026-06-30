#!/usr/bin/env bash
# Local bring-up for the real-backend U7 e2e suite in THIS constrained container, where the
# agent proxy cannot stream Docker's large postgres:17 image layer (so Spring Boot's
# docker-compose support can't start Postgres). Instead we run the host's PostgreSQL 16 as the
# `postgres` user with the same db/user/password the app's datasource expects, then start the
# backend with docker-compose disabled and pointed at it. The committed playwright.config.ts
# still uses `./gradlew bootRun` + docker-compose (the real design); this script just makes the
# backend reachable so `reuseExistingServer` lets Playwright drive it here.
#
# NOT part of the deliverable's normal run path — a container-local workaround only.
set -euo pipefail

PGBIN=/usr/lib/postgresql/16/bin
PGDATA=/tmp/e2e-pgdata
PGRUN=/tmp/e2e-pgrun
OPERATOR_PW=e2e-operator-secret

mkdir -p "$PGRUN"; chown postgres:postgres "$PGRUN"

if [ ! -f "$PGDATA/PG_VERSION" ]; then
  printf 'secret' > /tmp/e2e-pgpw; chown postgres:postgres /tmp/e2e-pgpw; chmod 644 /tmp/e2e-pgpw
  rm -rf "$PGDATA"; mkdir -p "$PGDATA"; chown -R postgres:postgres "$PGDATA"
  su postgres -c "$PGBIN/initdb -D $PGDATA -U myuser --auth=scram-sha-256 --pwfile=/tmp/e2e-pgpw"
fi

if ! PGPASSWORD=secret psql -h 127.0.0.1 -p 5432 -U myuser -d postgres -tc 'select 1' >/dev/null 2>&1; then
  su postgres -c "$PGBIN/pg_ctl -D $PGDATA -o '-p 5432 -c listen_addresses=127.0.0.1 -k $PGRUN' -l $PGDATA/server.log -w start"
fi

PGPASSWORD=secret psql -h 127.0.0.1 -p 5432 -U myuser -d postgres -tc \
  "SELECT 1 FROM pg_database WHERE datname='mydatabase'" | grep -q 1 \
  || PGPASSWORD=secret psql -h 127.0.0.1 -p 5432 -U myuser -d postgres -c "CREATE DATABASE mydatabase OWNER myuser;"

echo "Postgres 16 ready on 127.0.0.1:5432 (db=mydatabase user=myuser)."

cd "$(dirname "$0")/../platform"
SPRING_DOCKER_COMPOSE_ENABLED=false \
SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5432/mydatabase \
SPRING_DATASOURCE_USERNAME=myuser \
SPRING_DATASOURCE_PASSWORD=secret \
RIVIERA_OPERATOR_PASSWORD="$OPERATOR_PW" \
APP_WEB_CORS_ALLOWED_ORIGINS=http://localhost:4200 \
exec ./gradlew bootRun --console=plain
