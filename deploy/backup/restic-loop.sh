#!/bin/sh
set -eu

export AWS_ACCESS_KEY_ID="$(cat /run/secrets/s3_access_key)"
export AWS_SECRET_ACCESS_KEY="$(cat /run/secrets/s3_secret_key)"
export RESTIC_PASSWORD_FILE=/run/secrets/restic_password

restic snapshots >/dev/null 2>&1 || restic init

while :; do
  if restic backup /data/uploads /data/whiteboards /data/classrooms \
    --tag openpbl-production \
    --exclude-caches; then
    restic forget --keep-daily 14 --keep-weekly 8 --keep-monthly 12 --prune
    date -u +%FT%TZ > /status/volumes.last-success
    printf 'openpbl_backup_last_success_timestamp_seconds{kind="volumes"} %s\n' \
      "$(date +%s)" > /status/volumes.prom.tmp
    mv /status/volumes.prom.tmp /status/volumes.prom
  fi
  sleep 86400 &
  wait $!
done
