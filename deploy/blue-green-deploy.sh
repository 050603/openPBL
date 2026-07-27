#!/bin/sh
set -eu

if [ "$#" -ne 2 ]; then
  echo "Usage: $0 <app-image> <migrator-image>" >&2
  exit 64
fi

APP_IMAGE="$1"
MIGRATOR_IMAGE="$2"
validate_immutable_image() {
  image="$1"
  label="$2"
  if printf '%s\n' "$image" | grep -Eq '^.+@sha256:[0-9a-f]{64}$|^.+:sha-[0-9a-f]{40}$'; then
    return
  fi
  echo "$label image must use a sha256 digest or sha-<40-character-git-sha> tag." >&2
  exit 64
}
validate_immutable_image "$APP_IMAGE" "App"
validate_immutable_image "$MIGRATOR_IMAGE" "Migrator"

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
ENV_FILE="$ROOT_DIR/deploy/.deploy.env"
COMPOSE_FILE="$ROOT_DIR/docker-compose.prod.yml"
[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE" >&2; exit 1; }

CURRENT="$(sed -n 's/^OPENPBL_UPSTREAM=app-//p' "$ENV_FILE" | tail -n 1)"
case "$CURRENT" in
  blue) NEXT=green ;;
  green) NEXT=blue ;;
  *) echo "OPENPBL_UPSTREAM must be app-blue or app-green." >&2; exit 1 ;;
esac

set_env() {
  key="$1"
  value="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

rollback() {
  echo "Deployment failed; restoring app-$CURRENT." >&2
  set_env OPENPBL_UPSTREAM "app-$CURRENT"
  compose --profile "$CURRENT" up -d "app-$CURRENT"
  compose up -d --no-deps --force-recreate nginx
}
trap rollback HUP INT TERM

set_env OPENPBL_IMAGE "$APP_IMAGE"
set_env OPENPBL_MIGRATOR_IMAGE "$MIGRATOR_IMAGE"

compose --profile "$NEXT" pull migrate "app-$NEXT"
compose run --rm migrate
compose --profile "$NEXT" up -d --no-deps "app-$NEXT"

attempt=0
until compose exec -T "app-$NEXT" wget -qO- http://127.0.0.1:3000/api/health/live >/dev/null; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 24 ]; then
    rollback
    exit 1
  fi
  sleep 5
done

set_env OPENPBL_UPSTREAM "app-$NEXT"
compose --profile "$NEXT" up -d --no-deps --force-recreate nginx

PUBLIC_HOST="$(sed -n 's/^PUBLIC_HOST=//p' "$ENV_FILE" | tail -n 1)"
if ! wget -qO- --timeout=15 "https://$PUBLIC_HOST/api/health/live" >/dev/null; then
  rollback
  exit 1
fi

compose --profile "$CURRENT" stop "app-$CURRENT"
trap - HUP INT TERM
echo "Deployment switched from app-$CURRENT to app-$NEXT."
