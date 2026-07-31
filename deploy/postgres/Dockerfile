FROM postgres:16.9-alpine

RUN apk add --no-cache pgbackrest

COPY configure-pgbackrest.sh /usr/local/bin/openpbl-configure-pgbackrest
COPY postgres-entrypoint.sh /usr/local/bin/openpbl-postgres-entrypoint
COPY backup-loop.sh /usr/local/bin/openpbl-pgbackrest-backup
RUN chmod 0555 /usr/local/bin/openpbl-configure-pgbackrest \
    /usr/local/bin/openpbl-postgres-entrypoint \
    /usr/local/bin/openpbl-pgbackrest-backup

ENTRYPOINT ["/usr/local/bin/openpbl-postgres-entrypoint"]
CMD ["postgres"]
