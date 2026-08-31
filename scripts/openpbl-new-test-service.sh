#!/bin/sh
set -eu

PROJECT_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
SECRET_DIR="${OPENPBL_SECRET_DIR:-$PROJECT_ROOT/deploy/secrets}"
APP_PORT="${OPENPBL_NEW_PORT:-3200}"
RUNNER_PORT="${OPENPBL_NEW_RUNNER_PORT:-3201}"

read_secret() {
  secret_path="$SECRET_DIR/$1"
  if [ ! -r "$secret_path" ] || [ ! -s "$secret_path" ]; then
    echo "OpenPBL 配置文件不可读或为空：$secret_path" >&2
    exit 1
  fi
  tr -d '\r\n' < "$secret_path"
}

wait_for_tcp() {
  dependency_name="$1"
  dependency_host="$2"
  dependency_port="$3"
  attempt=0

  while [ "$attempt" -lt 60 ]; do
    if /usr/bin/node -e '
      const net = require("node:net");
      const socket = net.connect(Number(process.argv[2]), process.argv[1]);
      socket.setTimeout(1000);
      socket.once("connect", () => { socket.end(); process.exit(0); });
      socket.once("error", () => process.exit(1));
      socket.once("timeout", () => { socket.destroy(); process.exit(1); });
    ' "$dependency_host" "$dependency_port"; then
      return 0
    fi

    attempt=$((attempt + 1))
    if [ "$attempt" -eq 1 ]; then
      echo "等待 $dependency_name（$dependency_host:$dependency_port）就绪……"
    fi
    sleep 2
  done

  echo "$dependency_name 在 120 秒内未就绪。" >&2
  return 1
}

load_shared_environment() {
  export DATABASE_URL="$(read_secret database_url.txt)"
  export JWT_SECRET="$(read_secret jwt_secret.txt)"
  export PROVIDER_ENCRYPTION_KEY="$(read_secret provider_encryption_key.txt)"
  export INTERNAL_MONITOR_TOKEN="$(read_secret monitor_token.txt)"
  export REDIS_URL="redis://127.0.0.1:16379"
  export NEXT_TELEMETRY_DISABLED="1"
}

run_app() {
  if [ ! -f "$PROJECT_ROOT/.next-new/standalone/server.js" ]; then
    echo "未找到新版平台生产构建，请先运行：pnpm build:new" >&2
    exit 1
  fi

  load_shared_environment
  wait_for_tcp "PostgreSQL" "127.0.0.1" "15432"
  wait_for_tcp "Redis" "127.0.0.1" "16379"

  mkdir -p \
    "$PROJECT_ROOT/.openpbl-data/uploads" \
    "$PROJECT_ROOT/.openpbl-data/whiteboards"

  export PUBLIC_BASE_URL="${OPENPBL_PUBLIC_BASE_URL:-http://172.16.185.157:$APP_PORT}"
  export TRUST_PROXY_HEADERS="true"
  export COURSE_GENERATION_BACKGROUND_ENABLED="false"
  export ENABLE_WEBSOCKET="false"
  export UPLOAD_DIR="$PROJECT_ROOT/.openpbl-data/uploads"
  export WHITEBOARD_DATA_DIR="$PROJECT_ROOT/.openpbl-data/whiteboards"
  export CODE_RUNNER_URL="http://127.0.0.1:$RUNNER_PORT"
  export CODE_RUNNER_TOKEN="$INTERNAL_MONITOR_TOKEN"

  cd "$PROJECT_ROOT"
  exec /usr/bin/node scripts/run-openpbl-mode.mjs new start \
    --port "$APP_PORT" \
    --hostname 0.0.0.0
}

run_code_runner() {
  export CODE_RUNNER_TOKEN="$(read_secret monitor_token.txt)"
  export CODE_RUNNER_HOST="127.0.0.1"
  export CODE_RUNNER_PORT="$RUNNER_PORT"

  cd "$PROJECT_ROOT"
  exec /usr/bin/node scripts/code-runner-server.mjs
}

case "${1:-}" in
  run-app)
    run_app
    ;;
  run-code-runner)
    run_code_runner
    ;;
  *)
    echo "用法：$0 {run-app|run-code-runner}" >&2
    exit 2
    ;;
esac
