#!/bin/sh
set -eu

UNIT_NAME="openpbl-fast-production.service"
SCRIPT_PATH="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/$(basename -- "$0")"
PROJECT_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
FAST_PORT="${OPENPBL_FAST_PORT:-3100}"

prepare_runtime_assets() {
  standalone_root="$PROJECT_ROOT/.next-build/standalone"
  mkdir -p "$standalone_root/.next-build"
  if [ ! -e "$standalone_root/public" ]; then
    ln -s ../../public "$standalone_root/public"
  fi
  if [ ! -e "$standalone_root/.next-build/static" ]; then
    ln -s ../../static "$standalone_root/.next-build/static"
  fi
}

start_service() {
  if [ ! -f "$PROJECT_ROOT/.next-build/standalone/server.js" ]; then
    echo "未找到生产构建，请先在项目目录运行：pnpm build" >&2
    exit 1
  fi
  if systemctl --user is-active --quiet "$UNIT_NAME"; then
    echo "OpenPBL 快速生产服务已经在运行。"
    exit 0
  fi
  prepare_runtime_assets
  systemctl --user reset-failed "$UNIT_NAME" 2>/dev/null || true
  systemd-run --user \
    --unit="$UNIT_NAME" \
    --collect \
    --property="WorkingDirectory=$PROJECT_ROOT" \
    --property="Restart=on-failure" \
    --property="RestartSec=2" \
    --property="SuccessExitStatus=143" \
    --setenv="OPENPBL_FAST_PORT=$FAST_PORT" \
    "$SCRIPT_PATH" run >/dev/null
  echo "OpenPBL 快速生产服务正在启动：http://127.0.0.1:$FAST_PORT"
}

run_server() {
  runtime_container="$(docker ps --format '{{.Names}}' | sed -n '/^openpbl-app-\(blue\|green\)-1$/p' | head -n 1)"
  if [ -z "$runtime_container" ]; then
    echo "未找到运行中的 OpenPBL 应用容器，无法读取生产连接配置。" >&2
    exit 1
  fi

  export DATABASE_URL="$(docker exec "$runtime_container" cat /run/secrets/database_url)"
  export JWT_SECRET="$(docker exec "$runtime_container" cat /run/secrets/jwt_secret)"
  export PROVIDER_ENCRYPTION_KEY="$(docker exec "$runtime_container" cat /run/secrets/provider_encryption_key)"
  export INTERNAL_MONITOR_TOKEN="$(docker exec "$runtime_container" cat /run/secrets/monitor_token)"
  export REDIS_URL="redis://127.0.0.1:16379"
  host_address="$(hostname -I | awk '{ print $1 }')"
  export PUBLIC_BASE_URL="http://${host_address:-127.0.0.1}:$FAST_PORT"
  export TRUST_PROXY_HEADERS="true"
  export NEXT_TELEMETRY_DISABLED="1"
  export COURSE_GENERATION_BACKGROUND_ENABLED="false"
  export ENABLE_WEBSOCKET="false"
  export UPLOAD_DIR="$PROJECT_ROOT/.openpbl-data/uploads"
  export WHITEBOARD_DATA_DIR="$PROJECT_ROOT/.openpbl-data/whiteboards"

  export CODE_RUNNER_URL="http://127.0.0.1:3101"
  export CODE_RUNNER_TOKEN="$INTERNAL_MONITOR_TOKEN"

  node "$PROJECT_ROOT/scripts/code-runner-server.mjs" &
  code_runner_pid=$!
  cleanup_runner() {
    kill "$code_runner_pid" 2>/dev/null || true
    wait "$code_runner_pid" 2>/dev/null || true
  }
  trap cleanup_runner EXIT INT TERM

  env HOSTNAME=0.0.0.0 PORT="$FAST_PORT" node "$PROJECT_ROOT/.next-build/standalone/server.js"
}

case "${1:-status}" in
  start)
    start_service
    ;;
  restart)
    systemctl --user stop "$UNIT_NAME" 2>/dev/null || true
    start_service
    ;;
  stop)
    systemctl --user stop "$UNIT_NAME" 2>/dev/null || true
    echo "OpenPBL 快速生产服务已停止。"
    ;;
  status)
    systemctl --user --no-pager --full status "$UNIT_NAME" || true
    ;;
  logs)
    journalctl --user -u "$UNIT_NAME" -n 100 --no-pager
    ;;
  run)
    run_server
    ;;
  *)
    echo "用法：$0 {start|restart|stop|status|logs}" >&2
    exit 2
    ;;
esac
