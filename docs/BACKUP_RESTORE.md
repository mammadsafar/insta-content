# Coordinated backup and restore

Database rows and media references form one consistency unit. Keep encrypted backups outside the application volumes, restrict access, retain multiple generations and periodically restore into a separate clean environment. Backups can contain private media and personal data; never use them as Graphify inputs.

## Backup

Operator-only commands below stop writers while preserving volumes. Plan a maintenance window. For production, add `--env-file .env.production` and use `-f compose.production.yml` consistently; do not combine the Compose files.

```sh
mkdir -p backups
chmod 700 backups
docker compose -f compose.local.yml stop app worker
docker compose -f compose.local.yml exec -T db pg_dump -U rooz -d rooz -Fc > backups/database.dump
docker compose -f compose.local.yml run --rm --no-deps --entrypoint tar app -C /app/media -czf - . > backups/media.tar.gz
chmod 600 backups/database.dump backups/media.tar.gz
docker compose -f compose.local.yml start app worker
```

Use unique timestamped backup directories in regular operation instead of overwriting the example names. Check command exit statuses and nonempty output; checksum and encrypt both files together. Retain the deployed image tag, migration state and protected configuration separately. Do not expose passwords in shell history. `pg_dump` does not back up environment files, filesystem media or external proxy configuration.

The backup helper uses the already built app image's tar; it does not require an extra public storage service. Do not back up only the database while uploads or cleanup can mutate the media tree.

## Restore drill

1. Prepare a **separate empty** Compose project/volumes, configured secrets and matching application artifact. Never restore on top of live data by default.
2. Start only its PostgreSQL service. Keep app and worker stopped.
3. Restore the database into the empty `rooz` database, then restore media into the empty media volume:

```sh
docker compose -f compose.local.yml exec -T db pg_restore -U rooz -d rooz --no-owner --exit-on-error < backups/database.dump
docker compose -f compose.local.yml run --rm --no-deps --entrypoint tar app -C /app/media -xzf - < backups/media.tar.gz
```

4. Confirm files are readable by the non-root runtime user, migration names match the backed-up artifact, counts are plausible and storage paths resolve. Run migration only when intentionally upgrading the restored version.
5. Start app, inspect login, previews and original downloads, then start worker and inspect retry/heartbeat state. Confirm UTC instants and Tehran periods are unchanged.
6. Record the drill result and recovery duration. Only switch real ingress after explicit operator authorization.

An existing database must be separately archived before an intentional replacement; destructive drop/clean commands are deliberately not provided as routine startup. Never run bootstrap after restoring an existing owner. Volume retention across application container recreation is a required operator acceptance check; it is not proven merely by Compose validation. `docker compose down -v` removes retained data and must not be part of normal upgrades.

## Retention

Trash is soft deletion and restore is explicit. Historical revisions, referenced assets, publication timestamps and audit records are retained. Unattached uploads expire after a default 24-hour grace period. There is no automatic permanent purge of content/history in this version. Monitor volume growth and define a separate reviewed archival policy before deleting retained records or original media.
