# Continuidad remota de CLAUDIO

Leer este archivo al retomar CLAUDIO desde otra máquina. No contiene secretos.

## Arranque

```bash
git pull --ff-only
node scripts/setup-machine.mjs
```

Instancia pública: `https://claudio-production-cdd0.up.railway.app`.

## Estado operativo

- Railway aloja CLAUDIO y su SQLite persistente en `/data/claudio.db`.
- Cuentaspersonales sigue en Vercel + Neon. CLAUDIO debe consumir sólo su API read-only de activos/snapshots; nunca inferir cartera desde GitHub.
- La memoria local histórica no se migra por Git. Existe una migración HTTPS idempotente en `scripts/migrate-memory-to-remote.mjs`; requiere un token temporal exclusivo y debe deshabilitarse al concluir.
- GitHub Update, análisis de correo, documentos y chat deben persistir automáticamente. Si no ocurre, comprobar primero que Railway tenga el último deploy `SUCCESS`.
- WhatsApp sólo administra contactos por ahora; falta importar chats exportados.

## Seguridad

- Nunca imprimir, commitear ni usar secretos en `VITE_*`.
- Todo token temporal de migración se borra de Railway al finalizar.
- Las integraciones financieras son de lectura; no habilitar operaciones automáticas.

## Verificación al retomar

```bash
railway deployment list --limit 10
railway status
```

Antes de ejecutar acciones sobre memoria o cartera, verificar la versión activa y el endpoint remoto.
