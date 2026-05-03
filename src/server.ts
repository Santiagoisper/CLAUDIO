import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import express from "express";
import { execSync } from "node:child_process";
import fs from "node:fs";
import { randomUUID, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { registerMemoryTools } from "./tools/memory.js";
import { registerGithubTools } from "./tools/github.js";
import { registerShellTools } from "./tools/shell.js";
import { registerWebTools } from "./tools/web.js";
import { registerBriefingTools, printBriefingToStderr } from "./tools/briefing.js";
import { registerCalendarTools } from "./tools/calendar.js";
import { registerGmailTools } from "./tools/gmail.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAX_HTTP_BODY_BYTES = Number(process.env.CLAUDIO_MAX_HTTP_BODY_BYTES ?? 1_048_576);

function git(cmd: string) {
  try {
    execSync(`git ${cmd}`, { cwd: ROOT, stdio: "pipe" });
  } catch { /* sin internet o sin cambios */ }
}

function syncPull() { git("pull --ff-only --quiet"); }

function syncPush() {
  git("add data/claudio.db");
  try {
    execSync("git diff --cached --quiet", { cwd: ROOT, stdio: "pipe" });
  } catch {
    const ts = new Date().toISOString().slice(0, 16).replace("T", " ");
    git(`commit -m "sync: ${ts}" --quiet`);
    git("push --quiet");
  }
}

function buildServer() {
  const s = new McpServer({ name: "claudio", version: "1.0.0" });
  registerMemoryTools(s);
  if (process.env.GITHUB_TOKEN) registerGithubTools(s);
  registerShellTools(s);
  registerWebTools(s);
  registerBriefingTools(s);
  if (process.env.GOOGLE_REFRESH_TOKEN) registerCalendarTools(s);
  if (process.env.GOOGLE_REFRESH_TOKEN) registerGmailTools(s);
  return s;
}

function logLocalDebug(message: string): void {
  try {
    fs.writeFileSync(path.resolve(process.cwd(), "mcp-debug.log"), message, { flag: "a" });
  } catch {
    // No romper el arranque por logging auxiliar.
  }
}

function assertStrongToken(token: string): void {
  if (token.length < 32) {
    throw new Error("CLAUDIO_TOKEN must be at least 32 characters in HTTP mode.");
  }
}

function safeTokenEquals(expectedToken: string, candidate: string | null | undefined): boolean {
  if (!candidate) return false;
  const expected = Buffer.from(expectedToken, "utf8");
  const received = Buffer.from(candidate, "utf8");
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}

function createRemoteApp() {
  const TOKEN = process.env.CLAUDIO_TOKEN;
  if (TOKEN) assertStrongToken(TOKEN);
  const sessions = new Map<string, SSEServerTransport>();
  const streamableSessions = new Map<string, StreamableHTTPServerTransport>();

  function authed(req: IncomingMessage): boolean {
    if (!TOKEN) return true;
    const bearer = req.headers.authorization;
    const param = new URL(req.url!, "http://x").searchParams.get("token");
    const bearerToken = bearer?.startsWith("Bearer ") ? bearer.slice("Bearer ".length) : null;
    return safeTokenEquals(TOKEN, bearerToken) || safeTokenEquals(TOKEN, param);
  }

  function getMcpSessionId(req: IncomingMessage): string | undefined {
    const raw = req.headers["mcp-session-id"];
    if (Array.isArray(raw)) return raw[0];
    return raw;
  }

  async function createStreamableSession(): Promise<StreamableHTTPServerTransport> {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });
    await buildServer().connect(transport);
    return transport;
  }

  const app = express();
  const webPath = path.resolve(ROOT, "dist", "public");

  // Middleware para parsear JSON en requests POST
  app.use(express.json({ limit: `${MAX_HTTP_BODY_BYTES}b` }));

  // Health check (sin autenticación)
  app.get("/health", (req, res) => {
    res.json({ ok: true });
  });

  // Servir archivos estáticos del frontend PRIMERO (sin autenticación)
  app.use(express.static(webPath));

  // Rutas de la API MCP - requieren autenticación
  app.use(async (req: any, res: any, next: any) => {
    // Solo proteger rutas MCP
    if (req.path.startsWith("/api/mcp") || req.path === "/mcp" || req.path === "/sse" || req.path === "/messages") {
      if (!authed(req)) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
    }
    next();
  });

  app.post("/mcp", async (req: any, res: any) => {
    const sessionId = getMcpSessionId(req);
    if (sessionId && !streamableSessions.has(sessionId)) {
      res.status(404).json({ error: "Unknown MCP session" });
      return;
    }
    const transport = sessionId
      ? streamableSessions.get(sessionId)!
      : await createStreamableSession();
    await transport.handleRequest(req, res);
    if (!sessionId && transport.sessionId) {
      streamableSessions.set(transport.sessionId, transport);
    }
  });

  app.get("/sse", (req: any, res: any) => {
    const transport = new SSEServerTransport("/messages", res);
    sessions.set(transport.sessionId, transport);
    res.on("close", () => sessions.delete(transport.sessionId));
    buildServer().connect(transport);
  });

  app.post("/messages", async (req: any, res: any) => {
    const t = sessions.get(req.query.sessionId ?? "");
    if (!t) return res.status(404).end();
    await t.handlePostMessage(req, res);
  });

  // SPA fallback: servir index.html para todas las rutas no encontradas
  app.get("*", (req: any, res: any) => {
    res.sendFile(path.join(webPath, "index.html"));
  });

  return app;
}

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const SHOULD_RUN_HTTP = Boolean(process.env.PORT || process.env.VERCEL || process.env.NODE_ENV === "production");
const remoteApp = createRemoteApp();

export default remoteApp;

if (SHOULD_RUN_HTTP) {
  // ── Modo remoto: HTTP (Express) para Railway/Vercel ────────────────────
  if (!process.env.VERCEL) {
    remoteApp.listen(PORT, () => console.log(`CLAUDIO escuchando en :${PORT}`));
  }

} else {
  // ── Modo local: stdio para Claude Code ──────────────────────────────────
  try {
    logLocalDebug(`[${new Date().toISOString()}] Arrancando servidor en stdio mode...\n`);
    
    // syncPull();
    // printBriefingToStderr(); 

    const server = buildServer();
    logLocalDebug(`[${new Date().toISOString()}] buildServer completado.\n`);

    function shutdown() {
      try {
        syncPush();
      } catch (e) {
        logLocalDebug(`[${new Date().toISOString()}] Error en shutdown syncPush: ${e}\n`);
      }
      process.exit(0);
    }

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    logLocalDebug(`[${new Date().toISOString()}] Conectando StdioServerTransport...\n`);
    await server.connect(new StdioServerTransport());
    logLocalDebug(`[${new Date().toISOString()}] Transporte conectado. Escuchando a Codex.\n`);
    
    setInterval(() => {}, 1000);
  } catch (error) {
    logLocalDebug(`[${new Date().toISOString()}] ERROR FATAL CAPTURADO: ${error}\n${(error as Error).stack}\n`);
    process.exit(1);
  }
}
