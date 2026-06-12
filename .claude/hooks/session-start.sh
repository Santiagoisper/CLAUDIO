#!/bin/bash
set -euo pipefail

# Solo correr en sesiones remotas de Claude Code on the web
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Instalar dependencias
pnpm install

# Imprimir briefing al contexto de sesión (falla silenciosamente si no hay DB)
./node_modules/.bin/tsx tools/briefing-print.ts 2>/dev/null || true
