#!/bin/sh
set -eu

/usr/local/bin/openpbl-configure-pgbackrest
chown -R postgres:postgres /var/lib/postgresql/data
exec gosu postgres pgbackrest --stanza=openpbl --delta restore
