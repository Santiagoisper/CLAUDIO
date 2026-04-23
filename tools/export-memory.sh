#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
DB_PATH="$REPO_ROOT/data/claudio.db"

if [ ! -f "$DB_PATH" ]; then
  echo "No se encontró la base de datos: $DB_PATH" >&2
  exit 1
fi

TS=$(date +%Y%m%d-%H%M%S)
ZIP_NAME="claudio-memory-export-$TS.zip"
ZIP_PATH="$REPO_ROOT/$ZIP_NAME"

TMPDIR_WORK="$(mktemp -d)"
mkdir -p "$TMPDIR_WORK/data"
cp "$DB_PATH" "$TMPDIR_WORK/data/claudio.db"

cat > "$TMPDIR_WORK/manifest.json" <<EOF
{
  "exportedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "repo": "CLAUDIO",
  "files": ["data/claudio.db"]
}
EOF

(cd "$TMPDIR_WORK" && zip -r "$ZIP_PATH" . >/dev/null)
rm -rf "$TMPDIR_WORK"

echo "Exportado: $ZIP_NAME"
