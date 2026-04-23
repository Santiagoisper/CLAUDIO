#!/usr/bin/env bash
set -euo pipefail

ZIP_NAME="claudio-memory-export-20260423-095037.zip"

if ! command -v node >/dev/null 2>&1; then
  echo "Falta Node.js en la Mac. Instalalo primero." >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "Falta pnpm. Instalalo primero." >&2
  exit 1
fi

if [ ! -f "package.json" ]; then
  echo "Ejecuta este script desde la raiz del repo CLAUDIO." >&2
  exit 1
fi

echo "[1/6] Instalando dependencias..."
pnpm install

if [ ! -f ".env" ] && [ -f ".env.mac-template" ]; then
  echo "[2/6] Creando .env desde .env.mac-template..."
  cp .env.mac-template .env
else
  echo "[2/6] .env ya existe o no hay template local; sigo."
fi

if [ -f "$ZIP_NAME" ]; then
  if command -v pwsh >/dev/null 2>&1; then
    echo "[3/6] Importando memoria con PowerShell 7..."
    pwsh -File tools/import-memory.ps1 -ArchivePath "./$ZIP_NAME"
  else
    echo "[3/6] No encuentro pwsh. Salto import automatico de memoria."
    echo "     Instala PowerShell 7 o importa manualmente data/claudio.db desde el ZIP."
  fi
else
  echo "[3/6] No encuentro $ZIP_NAME en la raiz del repo; salto import de memoria."
fi

echo "[4/6] Inicializando/verificando base local..."
pnpm db:init

echo "[5/6] Compilando workspace..."
pnpm build

echo "[6/6] Listo. Para levantar CLAUDIO usa:"
echo "  pnpm dev:mcp"
echo "o"
echo "  pnpm start:mcp"
