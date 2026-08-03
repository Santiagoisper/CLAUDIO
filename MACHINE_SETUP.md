# Preparar CLAUDIO en una máquina nueva

Este archivo es la instrucción de arranque para una persona o agente que toma el repositorio.

## Regla de seguridad

No copiar `.env`, tokens de GitHub/Groq, secretos OAuth, refresh tokens ni bases SQLite desde otra máquina. Cada equipo crea su propio `.env` a partir de `.env.example`; los secretos se cargan localmente mediante un canal seguro.

## Arranque reproducible

1. Instalar Node.js 22 o superior y Git.
2. Clonar el repositorio y entrar a su carpeta.
3. Leer `AGENTS.md`, este archivo y `.env.example` antes de modificar nada.
4. Ejecutar:

```bash
node scripts/setup-machine.mjs
```

El bootstrap habilita pnpm, instala el lockfile exacto, crea `data/`, genera `.env` si no existe y valida `pnpm build`. No inicia procesos persistentes ni modifica servicios remotos.

## Uso local

1. Completar `.env` con un `CLAUDIO_TOKEN` aleatorio de al menos 32 caracteres.
2. Mantener las escrituras deshabilitadas salvo decisión explícita:

```dotenv
CLAUDIO_ENABLE_GOOGLE_WRITE=false
CLAUDIO_ENABLE_GITHUB_WRITE=false
CLAUDIO_ENABLE_SHELL=false
```

3. Iniciar panel y API:

```bash
pnpm dev
```

Panel: `http://localhost:3000`.

## Uso remoto

Para usar la instancia ya desplegada no hace falta clonar ni iniciar la máquina:

https://claudio-production-cdd0.up.railway.app

No guardar tokens en el repositorio ni en variables `VITE_*`: esas variables terminan dentro del navegador.

## Instrucción para un agente

Cuando se le indique "leer instrucciones y dejar CLAUDIO listo", debe ejecutar el bootstrap, verificar `pnpm build`, conservar cualquier `.env` existente y detenerse antes de pedir, imprimir o subir secretos. Un deploy o una modificación de Railway/Vercel requiere autorización explícita.
