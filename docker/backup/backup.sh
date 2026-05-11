#!/bin/bash
set -e

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="/tmp/gf_atendimento_${TIMESTAMP}.sql.gz"

pg_dump \
  -h "$POSTGRES_HOST" \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  --no-password \
  | gzip > "$BACKUP_FILE"

mc alias set minio "https://${MINIO_ENDPOINT}" "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY"
mc cp "$BACKUP_FILE" "minio/${BACKUP_BUCKET}/$(basename "$BACKUP_FILE")"

mc rm --older-than 7d --recursive --force "minio/${BACKUP_BUCKET}/" || true

rm -f "$BACKUP_FILE"
