#!/usr/bin/env node
import fetch from 'node-fetch';

const repos = [
  {
    name: "CLAUDIO",
    kind: "proyecto",
    content: `Personal AI Assistant with Model Context Protocol (MCP)
- Full-stack TypeScript: React frontend (Vite) + Node.js MCP server
- SQLite database with semantic search embeddings
- Tools: Memory management, GitHub integration, Google Calendar/Gmail, web scraping
- Panel UI at localhost:3001 with auth token
- Deployable to Railway/Vercel
- Key files: src/server.ts (MCP bootstrap), web/src/App.tsx (React UI), src/tools/* (MCP tools)`
  },
  {
    name: "BOPE",
    kind: "proyecto",
    content: `Batallon de Operaciones - Multi-agent Coordination Framework
- Framework for Claude/Codex with multi-agent roster system
- Agents: JOHN RAMBO (command), PIXEL (frontend), FORGE (backend), CERBERUS (security), WINSTON (docs), etc.
- Git-based mission tracking and closure verification
- Tech: Next.js, React, Multica platform, TypeScript
- Command structure: SANTIAGO -> JOHN RAMBO -> specialists
- Two implementations: Claude Code (.claude/) and Codex (CODEX.md, codex-logs/)`
  },
  {
    name: "Ichtys-facturador",
    kind: "proyecto",
    content: `Invoice System for Veritas Lux Capital LLC
- Next.js 16 + TypeScript + Neon PostgreSQL
- Features: Client management, protocol-based pricing, on-site/remote visit tracking, volume discounts
- AFIP integration (Argentinian tax authority) with audit logging
- Auth: Local environment-based (ADMIN_EMAIL, ADMIN_PASSWORD)
- Tailwind CSS + shadcn/ui
- Node 22 recommended (Node 24 has App Router crash bug)
- Vercel deployment ready`
  },
  {
    name: "Asistente-CRF",
    kind: "proyecto",
    content: `Clinical Research Form (CRF) Assistant - Unified Next.js App
- Combined frontend + API backend in single Next.js app
- Features: Auth, protocol/submission management, EDC automation, OCR proxy, RAVE XML submission
- Database: Neon PostgreSQL with migrations
- API: 16+ endpoints for health, auth, protocols, submissions, EDC models, OCR
- Testing: Vitest
- Environment: DATABASE_URL, OCR_SERVICE_URL, MEDIDATA_RWS_ENABLED`
  },
  {
    name: "Agora-platform",
    kind: "proyecto",
    content: `Next.js 16 Platform with Database ORM
- Tech: Next.js, React 19, Drizzle ORM, Neon serverless DB, Tailwind CSS
- Built-in auth support
- Uses Neon @neondatabase/serverless for edge-compatible DB access
- Development server on localhost:3000
- Deploy: Vercel platform`
  },
  {
    name: "Cuentaspersonales",
    kind: "proyecto",
    content: `Personal Finance Dashboard
- Next.js 16 + React 19 + TypeScript + Neon DB
- Features: Portfolio monitoring, investment tracking, daily checks, Cinme/Goals migrations
- Integration: Mindee OCR for invoice/receipt scanning
- Tech: Tailwind CSS, Framer Motion, Recharts (charts), Lucide icons
- Scripts: health checks, production sync, full deployments, e2e tests`
  },
  {
    name: "cocos_bot",
    kind: "proyecto",
    content: `Cocos Capital Data Exporter - Python Tool
- Read-only personal account data exporter using Playwright headless browser
- Features: Network inspection (captures XHR/fetch endpoints), portfolio export, MEP export
- No trading/order automation - manual login only
- Environment: COCOS_USERNAME, COCOS_PASSWORD, COCOS_HEADLESS, COCOS_TIMEOUT_MS
- Session state saved to .local/session_state.json
- Exports to exports/ folder (JSON format)`
  },
  {
    name: "Radar-diario-ia",
    kind: "proyecto",
    content: `Daily AI Radar System
- Node.js + Next.js backend service
- Purpose: Daily intelligence gathering and reporting
- Architecture: API-driven radar monitoring`
  }
];

async function importRepos() {
  const token = process.env.VITE_CLAUDIO_TOKEN || process.env.CLAUDIO_TOKEN;
  const apiUrl = process.env.VITE_CLAUDIO_API_URL || "http://localhost:3737";

  if (!token) {
    console.error("Error: VITE_CLAUDIO_TOKEN not set");
    process.exit(1);
  }

  for (const repo of repos) {
    try {
      const response = await fetch(`${apiUrl}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json, text/event-stream",
          "Authorization": `Bearer ${token}`,
          "mcp-protocol-version": "2025-03-26"
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now(),
          method: "tools/call",
          params: {
            name: "claudio_remember",
            arguments: {
              kind: repo.kind,
              content: `${repo.name}\n${repo.content}`,
              metadata: {
                category: "portfolio",
                source: "repos-import",
                import_date: new Date().toISOString()
              }
            }
          }
        })
      });

      const data = await response.json();
      if (data.error) {
        console.error(`Error saving ${repo.name}:`, data.error.message);
      } else {
        console.log(`✓ ${repo.name} importado`);
      }
    } catch (e) {
      console.error(`Error with ${repo.name}:`, e);
    }
  }

  console.log("\n✓ Todos los repos importados a CLAUDIO");
}

importRepos();
