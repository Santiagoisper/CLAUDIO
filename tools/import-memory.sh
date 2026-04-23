#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Uso: $0 <ruta-al-zip>"
  exit 1
fi

ZIP_PATH="$1"

if [ ! -f "$ZIP_PATH" ]; then
  echo "No se encontró el archivo: $ZIP_PATH" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
DB_DIR="$REPO_ROOT/data"
DB_PATH="$DB_DIR/claudio.db"
BACKUP_DIR="$DB_DIR/backups"
EXTRACT_TMP="$(mktemp -d)"

mkdir -p "$BACKUP_DIR"

if [ -f "$DB_PATH" ]; then
  TS=$(date +%Y%m%d-%H%M%S)
  cp "$DB_PATH" "$BACKUP_DIR/claudio-backup-$TS.db"
  echo "Backup creado: claudio-backup-$TS.db"
fi

unzip -o "$ZIP_PATH" -d "$EXTRACT_TMP" >/dev/null 2>&1 || true

if [ -f "$EXTRACT_TMP/data/claudio.db" ]; then
  cp "$EXTRACT_TMP/data/claudio.db" "$DB_PATH"
elif [ -f "$EXTRACT_TMP/data\\claudio.db" ]; then
  cp "$EXTRACT_TMP/data\\claudio.db" "$DB_PATH"
else
  FOUND=$(find "$EXTRACT_TMP" -name "claudio.db" | head -1)
  if [ -z "$FOUND" ]; then
    echo "No se encontró claudio.db dentro del ZIP." >&2
    rm -rf "$EXTRACT_TMP"
    exit 1
  fi
  cp "$FOUND" "$DB_PATH"
fi

rm -rf "$EXTRACT_TMP"
echo "Memoria importada correctamente desde $ZIP_PATH"
