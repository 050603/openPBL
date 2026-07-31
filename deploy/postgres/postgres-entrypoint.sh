#!/bin/sh
set -eu

/usr/local/bin/openpbl-configure-pgbackrest
exec /usr/local/bin/docker-entrypoint.sh "$@"
