# OpenPBL single-server production deployment

The production stack is intentionally independent from the development
Compose file. Only Nginx publishes ports (`80` and `443`); Grafana binds to
loopback and is reached through an SSH tunnel.

1. Install Docker Engine with the Compose plugin on Ubuntu 24.04.
2. Copy `.deploy.env.example` to `.deploy.env`, fill immutable image tags,
   and create the files documented in `secrets.example/README.md`.
   Keep the existing `PROVIDER_ENCRYPTION_KEY` when migrating an installation;
   replacing it makes stored Provider credentials unreadable.
3. Export `LETSENCRYPT_EMAIL` and run `deploy/bootstrap-certificate.sh`.
4. Start the first slot:

   `docker compose --env-file deploy/.deploy.env -f docker-compose.prod.yml --profile blue --profile certificate --profile observability --profile backup up -d`

   The production stack enables durable course generation. It requires the
   long-lived app process, PostgreSQL, and the shared `classrooms` volume at
   `/app/data/classrooms`. Do not remove named volumes during upgrades.

5. Initialize the first teacher once with the migrator image:

   `docker compose --env-file deploy/.deploy.env -f docker-compose.prod.yml run --rm -e OPENPBL_INITIAL_TEACHER_PASSWORD migrate pnpm exec tsx scripts/init-teacher.ts --username teacher --display-name "Teacher"`

   Export `OPENPBL_INITIAL_TEACHER_PASSWORD` (at least 10 characters) in the
   operator shell first and replace the example names. The command deliberately
   refuses to run once any teacher exists and reads the database URL from the
   same Docker secret as the migration command.
6. Later releases use `deploy/blue-green-deploy.sh <app-image> <migrator-image>`.

The certificate renewer checks twice per day. Nginx reloads every six hours
so a renewed certificate is picked up without dropping active connections.
Backups and restore drills are described under `deploy/backup/`.
