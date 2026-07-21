#!/usr/bin/env node
import fetch from 'node-fetch';

const analysis = `# AGORA PLATFORM - Análisis Profundo

## Concepto Central
Plataforma de "combate de IAs" - arena competitiva donde bots (agentes IA) de diferentes usuarios se enfrentan en estructurados matchs con reglas, puntuación y clasificaciones tipo Elo.

## Arquitectura Core

### Base de Datos (Drizzle ORM + PostgreSQL/Neon)
- **users**: Perfil, email, handle, wallet balance (cents), competitive score, plan
- **bots**: Bot registry con system prompt, model, tools, skills, reputation, ELO rating, estadísticas
- **rooms**: Arenas donde se juegan los matchs (debate, brainstorm, narrative, marketplace, research)
- **messages**: Turnos en un match - cada bot contribuye content que es puntuado
- **roomBots**: Mapeo bot<->room con API key management
- **matchEvents**: Event log para audit trail y replay

### Filosofía de Seguridad
1. Session-based auth con HMAC-signed cookies (SHA256)
2. Ownership-first: cada bot y room bound a owner_id (session user)
3. Secret hygiene: API keys via runtime vault references (no plaintext)
4. Timing-safe comparisons para evitar timing attacks

### Flujo de Matches
1. Usuario crea bot (system prompt + modelo)
2. Usuario crea room (arena con tipo y topic)
3. Room: draft -> locked -> waiting
4. Bots se unen (preflight validation)
5. Referee avanza turnos: bot produce message -> referee puntúa
6. Match cierra, winner declarado, ELO/stats actualizados

### API Endpoints Clave
- POST /api/auth/register, login, logout
- POST /api/bots, GET /api/bots
- POST /api/rooms, POST /api/rooms/[id]/lock, join, turn
- POST /api/rooms/[id]/messages (recolectar respuesta de bot)
- GET /api/rooms/[id]/state, events
- GET /api/cron/referee (daily 00:00 UTC - auto referee)

## Frontend (Next.js App Router + React 19)
- Landing hero: arena visuals, glassmorphism theme
- Vestuario: dashboard user (manage bots)
- Create bot/room: forms con pickers
- Leaderboard: ELO rankings
- Animated gradients, orbs, rings - CSS moderna

## Tech Stack
- Next.js 16.2.4, React 19.2.4, TypeScript 5
- Drizzle ORM 0.45.2 + @neondatabase/serverless
- Tailwind CSS 4 con postcss
- Vercel deployment (cron jobs en vercel.json)

## Patterns & Learnings

1. **Session auth sin DB**: Sign userId con HMAC, validar firma en lectura (zero latency)
2. **Middleware proxy**: intercepta ALL requests, crea anonymous session
3. **Event sourcing**: matchEvents = audit log + replay source
4. **ELO ratings**: Bots compiten, referee actualiza standings
5. **Ownership scoping**: Queries filtran owner_id (multi-tenant safety)
6. **Scheduled referee**: Cron job daily para auto-referee
7. **Multi-provider BYOK**: OpenAI, Anthropic, Gemini, DeepSeek

## Aplicable a CLAUDIO

- **Leaderboard de agentes**: similar patrón ELO para ranking
- **Event audit log**: para reproducir estado histórico
- **Session security**: HMAC-signed cookies sin DB overhead
- **Multi-tenancy**: ownership scoping pattern
- **Match/competition system**: para futuras herramientas de agents enfrentados`;

async function saveAnalysis() {
  const memory = {
    kind: "analisis",
    content: analysis,
    metadata: {
      repo: "Agora-platform",
      category: "platform-architecture",
      date: new Date().toISOString(),
      learning_focus: ["multi-user competition", "session auth", "event sourcing", "ELO rating"]
    }
  };

  try {
    const resp = await fetch("http://localhost:3737/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        "Authorization": "Bearer 5d18775be84be469c832871e7b84c478741b32af7a79b898598bc8b7821eec55",
        "mcp-protocol-version": "2025-03-26"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: {
          name: "claudio_remember",
          arguments: memory
        }
      })
    });
    const data = await resp.json();
    if (data.error) console.error("Error:", data.error.message);
    else console.log("✓ Agora análisis guardado en CLAUDIO");
  } catch(e) {
    console.error("Error:", e.message);
  }
}

saveAnalysis();
