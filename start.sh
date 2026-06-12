#!/bin/bash
set -e

echo "=== CLAUDIO Setup ==="

# 1. Instalar dependencias
echo "→ Instalando dependencias..."
pnpm install

# 2. Crear .env si no existe
if [ ! -f .env ]; then
  echo "→ Creando .env..."
  cat > .env << 'ENVEOF'
CLAUDIO_DB_PATH=./data/claudio.db
PORT=3737
CLAUDIO_TOKEN=11111111111111111111111111111111
OPENAI_API_KEY=PONER_ACA_TU_KEY
VITE_CLAUDIO_API_URL=http://localhost:3737
VITE_CLAUDIO_TOKEN=11111111111111111111111111111111
CLAUDIO_ENABLE_SHELL=false
CLAUDIO_ENABLE_GOOGLE_WRITE=false
CLAUDIO_ENABLE_GITHUB_WRITE=false
ENVEOF
  echo "   ⚠️  Editá .env y poné tu OPENAI_API_KEY antes de continuar."
  echo "   Luego corré: pnpm run dev"
  exit 0
fi

# 3. Inicializar DB si está vacía o no existe
if [ ! -s data/claudio.db ]; then
  echo "→ Inicializando base de datos..."
  mkdir -p data
  pnpm run db:init
fi

# 4. Levantar servidores
echo "→ Levantando MCP (:3737) + Panel (:3000)..."
echo "   Panel: http://localhost:3000"
echo "   API:   http://localhost:3737"
echo "   Token: $(grep CLAUDIO_TOKEN .env | cut -d= -f2)"
echo ""
pnpm run dev
