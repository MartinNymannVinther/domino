#!/usr/bin/env bash
#
# Nightly encrypted backup of the Domino database to EU object storage.
#
# Runs on the VPS, not in the container. Install as /root/backup-domino.sh
# (chmod 700) and schedule it from cron; see docs/deploy.md.
#
# The dump is encrypted before it ever leaves the machine, with a public
# key. The matching private key belongs in your password manager and
# nowhere else: a backup an attacker on the server can read is a copy of
# every project, plan and decision you have.
#
# Requires: docker, age, rclone (with an EU remote configured).

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/root/backups}"
RECIPIENT_FILE="${RECIPIENT_FILE:-/root/domino-backup.pub}"
REMOTE="${REMOTE:-eu-storage:domino-backups}"
# What the terms page promises a workspace: thirty days, here and in the
# bucket. Both ends are applied below, because a retention policy that
# only prunes the copy you can see is not a retention policy.
KEEP_DAYS="${KEEP_DAYS:-30}"
# On a server that also runs Haij there is more than one "db" container,
# so name Domino's explicitly (docker ps, then DB_CONTAINER=<id> in cron).
DB_CONTAINER="${DB_CONTAINER:-$(docker ps -qf name=db | head -1)}"

if [[ -z "$DB_CONTAINER" ]]; then
  echo "backup-domino: no database container found" >&2
  exit 1
fi
if [[ ! -r "$RECIPIENT_FILE" ]]; then
  echo "backup-domino: no age recipient at $RECIPIENT_FILE" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
STAMP=$(date +%F-%H%M)
TARGET="$BACKUP_DIR/domino-$STAMP.dump.age"

# Write to a temporary name first: a half-written file that looks like a
# backup is worse than no file at all, because you will trust it.
docker exec "$DB_CONTAINER" pg_dump -U postgres -Fc domino \
  | age -r "$(cat "$RECIPIENT_FILE")" \
  > "$TARGET.partial"
mv "$TARGET.partial" "$TARGET"

rclone copy "$TARGET" "$REMOTE/"

find "$BACKUP_DIR" -name 'domino-*.dump.age' -mtime "+$KEEP_DAYS" -delete
rclone delete --min-age "${KEEP_DAYS}d" "$REMOTE/"

echo "backup-domino: $TARGET ($(stat -c %s "$TARGET") bytes) -> $REMOTE/"
