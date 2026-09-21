# Archive backup and restore

The new SQLite archive starts fresh on upgrade. Existing rolling history is not
imported, and Live playback rebuilds from newly acquired radar frames. Back up
first if the old history matters to you. Keep the matching old image: an old
archive backup needs compatible old software to replay it.

Back up the **whole app data directory**, not just `history.sqlite`. Images,
database sidecars, settings and archive state belong together. Stop all app
writers before copying. Keep backups outside the app data directory, protected
from other users: they contain camera credentials, API keys and PIN settings.

## Docker on Linux

From the directory containing your active Compose configuration, identify the
`radar` container and its `/data` mount. Include any overrides you normally use
with every Compose command. These commands inspect paths and image identity;
they do not print environment variables or credentials:

```sh
container=$(docker compose ps -q radar)
test -n "$container"
docker inspect "$container" --format '{{.Image}}'
docker inspect "$container" --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Type}} {{.Source}}{{end}}{{end}}'
```

Record the immutable image ID, app version and actual data path. Choose a new,
private backup directory with enough free space. Stop the app, then archive that
data path using `sudo tar --acls --xattrs -C "$data_path" -cpf "$backup/data.tar" .`.
Restart the original app even if the copy fails. Hash the completed archive with
SHA-256 and check it before restore. Preserve your Compose files, overrides and
environment files privately alongside it. Do not publish the backup.

Browser display preferences live in that browser's profile, separately from app
data. If you also back up the profile, close its browser first. Keep its original
address/origin when restoring preferences.

## Prove the restore before upgrading

Create a **new** Docker volume; never extract over the live volume. Extract the
complete backup into its mountpoint, preserving ownership. Start the recorded
compatible image with only this restored volume, `--network none`, and
`RADAR_MANUAL_REFRESH=1`. Do not publish a conflicting port. Use `docker exec`
inside that container to check `/healthz`, `/api/status`, and a known archive
window. Verify that its referenced images exist, settings were restored, and the
archive generation/history matches the backup. Isolated networking prevents
duplicate requests to your configured providers and cameras.

Stop the restore-test container afterward. Retain the protected backup and image
identity. Restoring old software onto new-format data is not a rollback: stop
writers, preserve the newer data separately, and point the compatible old image
at the tested restored old volume instead. New-format backups likewise need a
compatible app version. Do not edit schema versions to bypass compatibility
checks.

If the app preserves a failed database after corruption, include that evidence
in a complete backup. Preserved images do not guarantee manual recovery, and
restoring a corrupt backup does not repair it.
