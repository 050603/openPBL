#!/bin/bash
#
# openPBL 数据库备份 cron 调用脚本(非 K8s 部署使用)
#
# 用法(crontab -e 添加):
#   0 2 * * * /app/deploy/backup-cron.sh >> /var/log/openpbl-backup.log 2>&1
#
# 前置条件:
#   - 已安装 pnpm、Node.js、PostgreSQL 客户端工具(pg_dump)
#   - 应用部署在 /app 目录(可通过 APP_DIR 环境变量覆盖)
#   - .env 文件位于 ${APP_DIR}/.env 或通过环境变量直接提供 DATABASE_URL

set -euo pipefail

# 应用根目录(默认 /app,可通过环境变量覆盖)
APP_DIR="${APP_DIR:-/app}"

# 日志文件路径
LOG_FILE="${LOG_FILE:-/var/log/openpbl-backup.log}"

# 备份保留天数
RETAIN_DAYS="${RETAIN_DAYS:-7}"

log() {
  echo "[$(date -Iseconds)] $*"
}

# 切换到应用目录
cd "${APP_DIR}" || {
  log "ERROR: 应用目录不存在 ${APP_DIR}"
  exit 1
}

# 加载 .env(如果存在)
if [ -f "${APP_DIR}/.env" ]; then
  # shellcheck disable=SC1090
  set -a
  . "${APP_DIR}/.env" || true
  set +a
fi

# 检查 DATABASE_URL
if [ -z "${DATABASE_URL:-}" ]; then
  log "ERROR: DATABASE_URL 环境变量未配置"
  exit 1
fi

# 检查 pg_dump 是否可用
if ! command -v pg_dump >/dev/null 2>&1; then
  log "ERROR: pg_dump 未安装或不在 PATH 中"
  exit 1
fi

# 检查 tsx/pnpm 是否可用
if ! command -v pnpm >/dev/null 2>&1; then
  log "ERROR: pnpm 未安装或不在 PATH 中"
  exit 1
fi

log "===== openPBL 数据库备份开始 ====="
log "应用目录:${APP_DIR}"
log "保留天数:${RETAIN_DAYS}"

# 调用 tsx 执行备份脚本
# stderr 同时写到日志和终端(便于 cron 邮件告警)
if ! pnpm exec tsx scripts/backup-db.ts --retain-days="${RETAIN_DAYS}"; then
  log "ERROR: 备份失败"
  exit 1
fi

log "===== openPBL 数据库备份结束 ====="
