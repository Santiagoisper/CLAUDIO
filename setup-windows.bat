@echo off
setlocal EnableDelayedExpansion

set ZIP_NAME=claudio-memory-export-*.zip

where node >nul 2>&1
if %errorlevel% neq 0 (
  echo Falta Node.js. Instalalo desde https://nodejs.org
  pause & exit /b 1
)

where pnpm >nul 2>&1
if %errorlevel% neq 0 (
  echo Instalando pnpm...
  npm install -g pnpm
)

if not exist "package.json" (
  echo Ejecuta este script desde la raiz del repo CLAUDIO.
  pause & exit /b 1
)

echo [1/6] Instalando dependencias...
pnpm install

if not exist ".env" (
  if exist ".env.example" (
    echo [2/6] Creando .env desde .env.example...
    copy .env.example .env
  )
) else (
  echo [2/6] .env ya existe, continuo.
)

for /f %%f in ('dir /b claudio-memory-export-*.zip 2^>nul') do set FOUND_ZIP=%%f
if defined FOUND_ZIP (
  where pwsh >nul 2>&1
  if !errorlevel! equ 0 (
    echo [3/6] Importando memoria con PowerShell...
    pwsh -File tools\import-memory.ps1 -ArchivePath "!FOUND_ZIP!"
  ) else (
    echo [3/6] No se encontro pwsh. Importa manualmente data\claudio.db desde el ZIP.
  )
) else (
  echo [3/6] No se encontro ZIP de memoria, saltando importacion.
)

echo [4/6] Inicializando base de datos...
pnpm db:init

echo [5/6] Compilando...
pnpm build

echo [6/6] Listo. Para levantar CLAUDIO:
echo   pnpm dev:mcp
echo   pnpm start:mcp
pause
