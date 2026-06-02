@echo off
echo ============================================
echo  BOPE — Levantando stack completo de agentes
echo ============================================
echo.

echo [1/2] Iniciando agentmemory en nueva ventana...
start "agentmemory" cmd /k "npx @agentmemory/agentmemory"

echo Esperando 5 segundos para que agentmemory inicialice...
timeout /t 5 /nobreak > nul

echo [2/2] Iniciando CLAUDIO MCP en nueva ventana...
start "CLAUDIO-MCP" cmd /k "cd /d C:\Users\Santiago\source\repos\Santiagoisper\CLAUDIO && npm run dev:mcp"

echo.
echo ============================================
echo  Stack levantado:
echo  - agentmemory  → http://localhost:3111
echo  - agentmemory viewer → http://localhost:3113
echo  - CLAUDIO MCP  → stdio (listo para Claude Code)
echo ============================================
echo.
echo Abre http://localhost:3113 para ver el viewer de memoria.
echo Podes cerrar esta ventana.
pause
