# CLAUDIO

Guia rapida para trabajar el MCP sin perder control del entorno.

## MCP: encender y apagar

### Modo local

Levantar el servidor MCP en modo `stdio`:

```bash
npm run dev:mcp
```

En este modo CLAUDIO corre localmente y no expone HTTP. Para apagarlo, corta el proceso.

### Modo remoto

Si necesitás exponer el MCP por HTTP/SSE, definí `PORT` y un `CLAUDIO_TOKEN` fuerte en el entorno antes de iniciar el servidor. Sin `PORT`, el servidor queda en modo local.

Arranque único (sin watch), útil para scripts o producción local:

```bash
npm run mcp
```

### Panel web + MCP en la misma máquina

Para `npm run dev` (Vite + servidor), el MCP tiene que estar en **modo HTTP**. Vite usa el puerto **3000** (`vite.config.ts`); el MCP no puede usar el mismo puerto, así que en `.env` definí por ejemplo `PORT=3737` y `VITE_CLAUDIO_API_URL=http://localhost:3737`, más `VITE_CLAUDIO_TOKEN` igual que `CLAUDIO_TOKEN`. Copiá el resto desde `.env.example`. Luego:

```bash
npm run dev
```

### Herramientas CLI

- **Google OAuth (Calendar/Gmail):** `node tools/get-google-token.mjs` — interactivo; no guarda secretos en el repo.
- **Memoria remota (`claudio_remember`):** `tsx tools/remember.ts <kind> <content>` — requiere `CLAUDIO_TOKEN` en el entorno; opcional `CLAUDIO_REMOTE_URL` si no querés el default del script (ver `.env.example`).

Controles recomendados:

- Mantener `CLAUDIO_ENABLE_SHELL=false` salvo que realmente quieras habilitar comandos del sistema.
- Mantener `CLAUDIO_ENABLE_GOOGLE_WRITE=false` y `CLAUDIO_ENABLE_GITHUB_WRITE=false` salvo que quieras permitir escrituras reales.
- Si integrás el MCP con comandos reales o con la interfaz de CLAUDIO, hacelo siempre detrás de esos flags/config para poder apagar la capacidad sin cambiar código.

## Tests

Correr tests:

```bash
npm test
```

Hoy `npm test` ejecuta Jest sobre los tests TypeScript del repo. El objetivo es validar comportamiento basico del MCP y de sus servicios auxiliares antes de conectar clientes reales.

Ejemplo actual:

- `src/mcpService.test.ts` verifica lecturas de issues, estado de workflows y creacion de issues, incluyendo caminos de error.

## Regla de iteracion simple

- Si sumas un comando o endpoint nuevo al MCP, agregale siempre un test basico en el mismo cambio.
- El minimo aceptable es cubrir el caso exitoso y un caso de error/control.
- Primero valida por test; despues conecta ese comando a integraciones reales o UI.
- Para integraciones reales, mantenete detras de flags/config como `CLAUDIO_ENABLE_SHELL`, `CLAUDIO_ENABLE_GOOGLE_WRITE`, `CLAUDIO_ENABLE_GITHUB_WRITE`, `PORT` y `CLAUDIO_TOKEN`.
