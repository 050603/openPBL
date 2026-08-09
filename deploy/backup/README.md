# Backup and recovery

The production `backup` profile provides:

- pgBackRest full backups every Sunday, differential backups on other days,
  and continuous WAL archive push to S3-compatible storage. PostgreSQL forces
  an archive switch at least every five minutes.
- Restic snapshots of upload, whiteboard, and generated-classroom volumes every day.
- Timestamp markers in the internal `backup-status` volume after successful
  runs.

Use credentials restricted to the configured bucket. Object-store lifecycle
rules should retain a second geographic copy.

Run the isolated monthly restore drill from `/opt/openpbl`:

`CONFIRM_RESTORE_DRILL=openpbl-restore-drill-data sh deploy/backup/restore-drill.sh`

The script only recreates the explicitly named drill volume. It never mounts
or modifies the production PostgreSQL volume. After the database check, verify
one restored upload, one whiteboard snapshot, and one generated classroom
containing its media files with Restic before recording
the monthly recovery evidence. The operational target is RPO ≤ 5 minutes and
RTO ≤ 60 minutes.
