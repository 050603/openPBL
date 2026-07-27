#!/bin/sh
set -eu

: "${CONFIRM_RESTORE_DRILL:?Set CONFIRM_RESTORE_DRILL=openpbl-restore-drill-data}"
if [ "$CONFIRM_RESTORE_DRILL" != "openpbl-restore-drill-data" ]; then
  echo "Confirmation must exactly match openpbl-restore-drill-data." >&2
  exit 64
fi

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
ENV_FILE="$ROOT_DIR/deploy/.deploy.env"
COMPOSE_FILE="$ROOT_DIR/docker-compose.prod.yml"
DRILL_VOLUME="openpbl-restore-drill-data"

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

compose --profile restore-drill stop restore-drill-db >/dev/null 2>&1 || true
compose --profile restore-drill rm -sf restore-drill-db >/dev/null 2>&1 || true
docker volume inspect "$DRILL_VOLUME" >/dev/null 2>&1 &&
  docker volume rm "$DRILL_VOLUME" >/dev/null
docker volume create "$DRILL_VOLUME" >/dev/null

compose --profile restore-drill run --rm restore-drill
compose --profile restore-drill up -d restore-drill-db

attempt=0
until compose exec -T restore-drill-db pg_isready -U openpbl -d openpbl >/dev/null; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 24 ]; then
    echo "Restored database did not become ready." >&2
    compose --profile restore-drill stop restore-drill-db
    exit 1
  fi
  sleep 5
done

course_count="$(compose exec -T restore-drill-db \
  psql -U openpbl -d openpbl -Atc 'select count(*) from "Course";')"
migration_count="$(compose exec -T restore-drill-db \
  psql -U openpbl -d openpbl -Atc 'select count(*) from "_prisma_migrations" where finished_at is not null;')"

compose --profile restore-drill stop restore-drill-db
mkdir -p "$ROOT_DIR/deploy/reports"
date -u +%FT%TZ > "$ROOT_DIR/deploy/reports/restore-drill.last-success"
echo "Restore drill passed: courses=$course_count migrations=$migration_count"
