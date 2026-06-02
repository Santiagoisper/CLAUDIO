# Setup agentmemory en Windows

Guía para levantar el stack completo (CLAUDIO + agentmemory) en Windows.

## Requisitos previos

- Node.js >= 20 instalado
- Repo CLAUDIO clonado en `C:\Users\Santiago\source\repos\Santiagoisper\CLAUDIO`
- Claude Code instalado

## Paso 1 — Configurar el .env de agentmemory

```powershell
# Crear carpeta de config
mkdir "$env:USERPROFILE\.agentmemory"

# Copiar el ejemplo y editarlo
copy agentmemory.env.example "$env:USERPROFILE\.agentmemory\.env"
notepad "$env:USERPROFILE\.agentmemory\.env"
```

Cambiá al menos `AGENTMEMORY_SECRET` por un token propio de 32+ caracteres.

## Paso 2 — Primera vez: verificar iii-engine

Corré en PowerShell:

```powershell
npx @agentmemory/agentmemory
```

Si ves `Could not start iii-engine`:

1. Entrá a: https://github.com/iii-hq/iii/releases/tag/iii%2Fv0.11.2
2. Descargá `iii-x86_64-pc-windows-msvc.zip`
3. Extraé `iii.exe` y copialo a:
   ```powershell
   mkdir "$env:USERPROFILE\.local\bin"
   # copiá iii.exe ahí
   ```
4. Volvé a correr `npx @agentmemory/agentmemory`

## Paso 3 — Levantar el stack completo

Doble-click en **`start-all.bat`** en la raíz del repo.

Abre dos ventanas:
- `agentmemory` en `localhost:3111`
- `CLAUDIO-MCP` en modo stdio

Viewer de memoria en tiempo real: http://localhost:3113

## Paso 4 — Configurar Claude Code

El archivo `.mcp.json` ya está en la raíz del repo con ambos servidores configurados.
Claude Code lo detecta automáticamente al abrir el proyecto.

Verificá dentro de Claude Code con `/mcp` — deberías ver tools de `claudio` y de `agentmemory`.

## División de responsabilidades

| Capacidad | Servidor |
|---|---|
| GitHub, Gmail, Calendar, Shell | CLAUDIO |
| Memoria semántica + búsqueda híbrida | agentmemory |
| Captura automática de sesiones | agentmemory |
| Knowledge graph | agentmemory |
| Viewer tiempo real | agentmemory :3113 |

## Privacidad

Para proyectos con datos sensibles (CINME, Innova Trials), mantené:
```
AGENTMEMORY_AUTO_COMPRESS=false
```
Esto evita que agentmemory mande observaciones a LLMs externos automáticamente.
