#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
ENV_FILE="$ROOT_DIR/deploy/.deploy.env"
PROD_COMPOSE="$ROOT_DIR/docker-compose.prod.yml"
IP_COMPOSE="$ROOT_DIR/docker-compose.ip.yml"
LOCK_DIR="$ROOT_DIR/.server-update.lock"

APP_CURRENT="openpbl-app:current"
MIGRATOR_CURRENT="openpbl-migrator:current"
APP_CANDIDATE="openpbl-app:update-candidate"
MIGRATOR_CANDIDATE="openpbl-migrator:update-candidate"

[ -f "$ENV_FILE" ] || {
  echo "Missing deployment environment: $ENV_FILE" >&2
  exit 1
}

public_host="$(sed -n 's/^PUBLIC_HOST=//p' "$ENV_FILE" | tail -n 1)"
[ -n "$public_host" ] || {
  echo "Missing PUBLIC_HOST in $ENV_FILE" >&2
  exit 1
}

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "Another server update is already running." >&2
  exit 1
fi

previous_app_id="$(docker image inspect "$APP_CURRENT" --format '{{.Id}}' 2>/dev/null || true)"
previous_migrator_id="$(docker image inspect "$MIGRATOR_CURRENT" --format '{{.Id}}' 2>/dev/null || true)"
candidate_app_id=""
candidate_migrator_id=""
activated=0
deployment_succeeded=0
deployment_id="$(date -u +%Y%m%dT%H%M%SZ)-$$"

compose_with_images() {
  app_image="$1"
  migrator_image="$2"
  shift 2
  OPENPBL_IMAGE="$app_image" OPENPBL_MIGRATOR_IMAGE="$migrator_image" \
    docker compose \
      --env-file "$ENV_FILE" \
      -f "$PROD_COMPOSE" \
      -f "$IP_COMPOSE" \
      --profile blue \
      "$@"
}

wait_for_app() {
  attempt=0
  while [ "$attempt" -lt 30 ]; do
    container_id="$(compose_with_images "$APP_CURRENT" "$MIGRATOR_CURRENT" ps -q app-blue)"
    if [ -n "$container_id" ]; then
      health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id" 2>/dev/null || true)"
      if [ "$health" = "healthy" ]; then
        return 0
      fi
      if [ "$health" = "unhealthy" ] || [ "$health" = "exited" ] || [ "$health" = "dead" ]; then
        return 1
      fi
    fi
    attempt=$((attempt + 1))
    sleep 4
  done
  return 1
}

wait_for_public_endpoint() {
  attempt=0
  while [ "$attempt" -lt 15 ]; do
    if curl -fsS --max-time 5 "http://127.0.0.1/api/health/live" >/dev/null; then
      return 0
    fi
    attempt=$((attempt + 1))
    sleep 1
  done
  return 1
}

remove_image_if_replaced() {
  old_id="$1"
  new_id="$2"
  if [ -n "$old_id" ] && [ "$old_id" != "$new_id" ]; then
    docker image rm "$old_id" >/dev/null 2>&1 || \
      echo "Warning: old OpenPBL image $old_id is still referenced and was not removed." >&2
  fi
}

finish() {
  status=$?
  trap - EXIT HUP INT TERM
  set +e

  if [ "$status" -ne 0 ] && [ "$activated" -eq 1 ] && [ -n "$previous_app_id" ]; then
    echo "Update failed; restoring the previous application image." >&2
    docker tag "$previous_app_id" "$APP_CURRENT"
    if [ -n "$previous_migrator_id" ]; then
      docker tag "$previous_migrator_id" "$MIGRATOR_CURRENT"
    fi
    compose_with_images "$APP_CURRENT" "$MIGRATOR_CURRENT" up -d --no-deps --force-recreate app-blue
    compose_with_images "$APP_CURRENT" "$MIGRATOR_CURRENT" up -d --no-deps --force-recreate nginx
  fi

  docker image rm "$APP_CANDIDATE" >/dev/null 2>&1 || true
  docker image rm "$MIGRATOR_CANDIDATE" >/dev/null 2>&1 || true

  if [ "$deployment_succeeded" -eq 1 ]; then
    remove_image_if_replaced "$previous_app_id" "$candidate_app_id"
    remove_image_if_replaced "$previous_migrator_id" "$candidate_migrator_id"
  elif [ "$status" -ne 0 ]; then
    remove_image_if_replaced "$candidate_app_id" "$previous_app_id"
    remove_image_if_replaced "$candidate_migrator_id" "$previous_migrator_id"
  fi

  rmdir "$LOCK_DIR" 2>/dev/null || true
  exit "$status"
}

trap finish EXIT HUP INT TERM

cd "$ROOT_DIR"

echo "[1/6] Building the application image..."
docker build \
  --network host \
  --build-arg "OPENPBL_DEPLOYMENT_ID=$deployment_id" \
  --target runner \
  -t "$APP_CANDIDATE" \
  .
candidate_app_id="$(docker image inspect "$APP_CANDIDATE" --format '{{.Id}}')"

echo "[2/6] Building the matching migration image..."
docker build --network host --target migrator -t "$MIGRATOR_CANDIDATE" .
candidate_migrator_id="$(docker image inspect "$MIGRATOR_CANDIDATE" --format '{{.Id}}')"

echo "[3/6] Applying database migrations..."
compose_with_images "$APP_CANDIDATE" "$MIGRATOR_CANDIDATE" run --rm --no-deps migrate

docker tag "$APP_CANDIDATE" "$APP_CURRENT"
docker tag "$MIGRATOR_CANDIDATE" "$MIGRATOR_CURRENT"
activated=1

echo "[4/6] Replacing the single application container..."
compose_with_images "$APP_CURRENT" "$MIGRATOR_CURRENT" up -d --no-deps --force-recreate app-blue

echo "[5/6] Waiting for the application health check..."
if ! wait_for_app; then
  compose_with_images "$APP_CURRENT" "$MIGRATOR_CURRENT" logs --tail=120 app-blue >&2
  echo "The updated application did not become healthy." >&2
  exit 1
fi

echo "[6/6] Refreshing Nginx and checking the public endpoint..."
compose_with_images "$APP_CURRENT" "$MIGRATOR_CURRENT" up -d --no-deps --force-recreate nginx
if ! wait_for_public_endpoint; then
  echo "The public health endpoint failed after the update." >&2
  exit 1
fi

deployment_succeeded=1
echo "OpenPBL update completed successfully: http://$public_host"
