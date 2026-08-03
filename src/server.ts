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
import { refreshPersonalGithubContext, registerGithubTools } from "./tools/github.js";
import { registerShellTools } from "./tools/shell.js";
import { registerWebTools } from "./tools/web.js";
import {
  addWhatsappWatchContact,
  listWhatsappWatchContacts,
  removeWhatsappWatchContact,
} from "./tools/whatsapp.js";
import {
  registerBriefingTools,
  printBriefingToStderr,
} from "./tools/briefing.js";
import { registerCalendarTools } from "./tools/calendar.js";
import { registerGmailTools } from "./tools/gmail.js";
import { hasGoogleAccount, type GoogleAccount } from "./tools/google.js";
import { registerPortfolioTools } from "./tools/portfolio.js";
import {
  analyzeDocument,
  type DocumentAnalysisResult,
  type DocumentProgressStage,
} from "./tools/documents.js";
import {
  analyzeEmail,
  type EmailAnalysisResult,
  type EmailProgressStage,
} from "./tools/emailAnalysis.js";
import {
  answerFromMemory,
  connectAllMemoryNodes,
  rememberChatExchange,
} from "./tools/memory-chat.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAX_HTTP_BODY_BYTES = Number(
  process.env.CLAUDIO_MAX_HTTP_BODY_BYTES ?? 40 * 1024 * 1024,
);

interface DocumentJob {
  id: string;
  status: "queued" | "running" | "complete" | "error";
  progress: number;
  stage: DocumentProgressStage | "queued";
  message: string;
  result?: DocumentAnalysisResult;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

interface EmailJob {
  id: string;
  status: "queued" | "running" | "complete" | "error";
  progress: number;
  stage: EmailProgressStage | "queued";
  message: string;
  result?: EmailAnalysisResult;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

const documentJobs = new Map<string, DocumentJob>();
const emailJobs = new Map<string, EmailJob>();

function updateDocumentJob(id: string, patch: Partial<DocumentJob>): void {
  const current = documentJobs.get(id);
  if (!current) return;
  documentJobs.set(id, {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  });
}

function pruneDocumentJobs(): void {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [id, job] of documentJobs) {
    if (Date.parse(job.updatedAt) < cutoff) {
      documentJobs.delete(id);
    }
  }
}

function updateEmailJob(id: string, patch: Partial<EmailJob>): void {
  const current = emailJobs.get(id);
  if (!current) return;
  emailJobs.set(id, {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  });
}

function pruneEmailJobs(): void {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [id, job] of emailJobs) {
    if (Date.parse(job.updatedAt) < cutoff) {
      emailJobs.delete(id);
    }
  }
}

function git(cmd: string) {
  try {
    execSync(`git ${cmd}`, { cwd: ROOT, stdio: "pipe" });
  } catch {
    /* sin internet o sin cambios */
  }
}

function syncPull() {
  git("pull --ff-only --quiet");
}

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
  if (hasGoogleAccount("personal") || hasGoogleAccount("cinme"))
    registerCalendarTools(s);
  if (hasGoogleAccount("personal") || hasGoogleAccount("cinme"))
    registerGmailTools(s);
  return s;
}

function logLocalDebug(message: string): void {
  try {
    fs.writeFileSync(path.resolve(process.cwd(), "mcp-debug.log"), message, {
      flag: "a",
    });
  } catch {
    // No romper el arranque por logging auxiliar.
  }
}

function assertStrongToken(token: string): void {
  if (token.length < 32) {
    throw new Error(
      "CLAUDIO_TOKEN must be at least 32 characters in HTTP mode.",
    );
  }
}

function safeTokenEquals(
  expectedToken: string,
  candidate: string | null | undefined,
): boolean {
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
  // Backfill de grafo al arrancar: todos los recuerdos existentes quedan listos
  // para expansión contextual aunque hayan sido creados antes de esta versión.
  try {
    connectAllMemoryNodes();
  } catch (error) {
    console.error("[memory-graph] no se pudo enlazar memoria existente:", error);
  }

  function authed(req: IncomingMessage): boolean {
    if (!TOKEN) return true;
    const bearer = req.headers.authorization;
    const param = new URL(req.url!, "http://x").searchParams.get("token");
    const bearerToken = bearer?.startsWith("Bearer ")
      ? bearer.slice("Bearer ".length)
      : null;
    return safeTokenEquals(TOKEN, bearerToken) || safeTokenEquals(TOKEN, param);
  }

  function getMcpSessionId(req: IncomingMessage): string | undefined {
    const raw = req.headers["mcp-session-id"];
    if (Array.isArray(raw)) return raw[0];
    return raw;
  }

  async function createStreamableSession(): Promise<StreamableHTTPServerTransport> {
    // Modo stateless + JSON: cada POST /mcp es autocontenido (panel Vite no mantiene sesión MCP).
    // Sin esto, un `mcp-session-id` inventado en el cliente produce 404 ("Unknown MCP session").
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await buildServer().connect(transport);
    return transport;
  }

  const app = express();
  const webPath = path.resolve(ROOT, "dist", "public");
  const indexHtmlPath = path.join(webPath, "index.html");
  const hasBuiltWeb = fs.existsSync(indexHtmlPath);

  // CORS: por defecto solo se habilita el panel local. Los orígenes remotos
  // adicionales deben declararse explícitamente, separados por comas.
  const allowedOrigins = new Set([
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    ...(process.env.CLAUDIO_ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  ]);
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (typeof origin === "string" && allowedOrigins.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-File-Name, X-Mime-Type, X-AI-Provider, X-AI-Model, mcp-session-id, Mcp-Session-Id, Accept, mcp-protocol-version, Mcp-Protocol-Version",
    );
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

  // Middleware para parsear JSON en requests POST
  app.use(express.json({ limit: `${MAX_HTTP_BODY_BYTES}b` }));
  app.use((error: any, req: any, res: any, next: any) => {
    if (!error) {
      next();
      return;
    }
    if (req.path.startsWith("/api/documents")) {
      const message =
        error.type === "entity.too.large"
          ? `El archivo es demasiado grande para subirlo. Limite HTTP: ${Math.round(MAX_HTTP_BODY_BYTES / 1024 / 1024)} MB.`
          : error.message || "Request JSON invalido";
      res.status(error.status || 400).json({ error: message });
      return;
    }
    next(error);
  });

  // Health check (sin autenticación)
  app.get("/health", (req, res) => {
    res.json({ ok: true });
  });

  // SPA empaquetada (solo tras `npm run build`). En dev el panel va por Vite en :3000.
  if (hasBuiltWeb) {
    app.use(express.static(webPath));
  }

  // Rutas de la API MCP - requieren autenticación
  app.use(async (req: any, res: any, next: any) => {
    // Solo proteger rutas MCP
    if (
      req.path.startsWith("/api/mcp") ||
      req.path.startsWith("/api/documents") ||
      req.path.startsWith("/api/email") ||
      req.path.startsWith("/api/chat") ||
      req.path.startsWith("/api/github") ||
      req.path.startsWith("/api/whatsapp") ||
      req.path === "/mcp" ||
      req.path === "/sse" ||
      req.path === "/messages"
    ) {
      if (!authed(req)) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
    }
    next();
  });

  async function readRequestBuffer(req: IncomingMessage): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  function createDocumentJob(): DocumentJob {
    pruneDocumentJobs();
    const id = randomUUID();
    const now = new Date().toISOString();
    const job: DocumentJob = {
      id,
      status: "queued",
      progress: 0,
      stage: "queued",
      message: "Analisis en cola",
      createdAt: now,
      updatedAt: now,
    };
    documentJobs.set(id, job);
    return job;
  }

  function runDocumentJob(
    id: string,
    input: Parameters<typeof analyzeDocument>[0],
  ): void {
    void analyzeDocument(input, (update) => {
      updateDocumentJob(id, {
        status: "running",
        progress: update.progress,
        stage: update.stage,
        message: update.message,
      });
    })
      .then((result) => {
        updateDocumentJob(id, {
          status: "complete",
          progress: 100,
          stage: "complete",
          message: "Analisis completo",
          result,
        });
      })
      .catch((error) => {
        updateDocumentJob(id, {
          status: "error",
          progress: 100,
          stage: "complete",
          message: "Error al analizar documento",
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }

  app.post("/api/documents/analyze-upload", async (req: any, res: any) => {
    try {
      const rawFileName = req.headers["x-file-name"];
      const rawMimeType = req.headers["x-mime-type"];
      const rawAiProvider = req.headers["x-ai-provider"];
      const rawAiModel = req.headers["x-ai-model"];
      const fileName =
        typeof rawFileName === "string"
          ? decodeURIComponent(rawFileName)
          : "documento";
      const mimeType =
        typeof rawMimeType === "string"
          ? rawMimeType
          : (req.headers["content-type"] ?? "");
      const aiProvider =
        typeof rawAiProvider === "string" ? (rawAiProvider as any) : undefined;
      const aiModel =
        typeof rawAiModel === "string"
          ? decodeURIComponent(rawAiModel)
          : undefined;
      const dataBuffer = await readRequestBuffer(req);
      const job = createDocumentJob();
      res.status(202).json(job);
      runDocumentJob(job.id, {
        fileName,
        mimeType,
        dataBuffer,
        aiProvider,
        aiModel,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ error: message });
    }
  });

  app.post("/api/documents/analyze", async (req: any, res: any) => {
    try {
      const job = createDocumentJob();
      res.status(202).json(job);
      runDocumentJob(job.id, req.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ error: message });
    }
  });

  app.get("/api/documents/analyze/:id", (req: any, res: any) => {
    const job = documentJobs.get(req.params.id);
    if (!job) {
      res.status(404).json({ error: "Trabajo de analisis no encontrado" });
      return;
    }
    res.json(job);
  });

  function createEmailJob(): EmailJob {
    pruneEmailJobs();
    const id = randomUUID();
    const now = new Date().toISOString();
    const job: EmailJob = {
      id,
      status: "queued",
      progress: 0,
      stage: "queued",
      message: "Analisis en cola",
      createdAt: now,
      updatedAt: now,
    };
    emailJobs.set(id, job);
    return job;
  }

  app.post("/api/email/analyze", async (req: any, res: any) => {
    try {
      const range = req.body?.range ?? "last_day";
      const account: GoogleAccount =
        req.body?.account === "cinme" ? "cinme" : "personal";
      const aiProvider = req.body?.aiProvider;
      const aiModel = req.body?.aiModel;
      const job = createEmailJob();
      res.status(202).json(job);
      void analyzeEmail({ range, account, aiProvider, aiModel }, (update) => {
        updateEmailJob(job.id, {
          status: "running",
          progress: update.progress,
          stage: update.stage,
          message: update.message,
        });
      })
        .then((result) => {
          updateEmailJob(job.id, {
            status: "complete",
            progress: 100,
            stage: "complete",
            message: "Analisis completo",
            result,
          });
        })
        .catch((error) => {
          updateEmailJob(job.id, {
            status: "error",
            progress: 100,
            stage: "complete",
            message: "Error al analizar correo",
            error: error instanceof Error ? error.message : String(error),
          });
        });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ error: message });
    }
  });

  app.get("/api/email/analyze/:id", (req: any, res: any) => {
    const job = emailJobs.get(req.params.id);
    if (!job) {
      res
        .status(404)
        .json({ error: "Trabajo de analisis de correo no encontrado" });
      return;
    }
    res.json(job);
  });

  app.post("/api/chat/memory", async (req: any, res: any) => {
    try {
      const message = typeof req.body?.message === "string" ? req.body.message : "";
      const aiProvider = typeof req.body?.aiProvider === "string" ? req.body.aiProvider : undefined;
      const aiModel = typeof req.body?.aiModel === "string" ? req.body.aiModel : undefined;
      const result = await answerFromMemory(message, {
        provider: aiProvider as any,
        model: aiModel,
      }, { includeGithub: req.body?.includeGithub === true });
      await rememberChatExchange(message, result, {
        provider: aiProvider as any,
        model: aiModel,
      }).catch((error) => {
        console.error("[chat/memory] no se pudo guardar el intercambio:", error);
      });
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ error: message });
    }
  });

  app.post("/api/github/update", async (_req: any, res: any) => {
    try {
      const result = await refreshPersonalGithubContext();
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ error: message });
    }
  });

  app.get("/api/whatsapp/contacts", (_req: any, res: any) => {
    res.json({ contacts: listWhatsappWatchContacts() });
  });

  app.post("/api/whatsapp/contacts", (req: any, res: any) => {
    try {
      const contact = addWhatsappWatchContact(req.body?.phone ?? "", req.body?.label);
      res.status(201).json(contact);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.delete("/api/whatsapp/contacts/:id", (req: any, res: any) => {
    if (!removeWhatsappWatchContact(req.params.id)) {
      res.status(404).json({ error: "Contacto no encontrado" });
      return;
    }
    res.status(204).end();
  });

  app.post("/mcp", async (req: any, res: any) => {
    const body = req.body;
    if (body == null || typeof body !== "object" || body.method == null) {
      res.status(400).json({
        error: "Cuerpo JSON-RPC inválido o vacío",
        hint: 'POST con Content-Type: application/json. Ejemplo: {"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"claudio_memories","arguments":{}}}',
      });
      return;
    }
    const sessionId = getMcpSessionId(req);
    if (sessionId && !streamableSessions.has(sessionId)) {
      res.status(404).json({ error: "Unknown MCP session" });
      return;
    }
    const transport = sessionId
      ? streamableSessions.get(sessionId)!
      : await createStreamableSession();
    await transport.handleRequest(req, res, body);
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

  // Sin build del front: cualquier GET que no sea otra ruta definida responde ayuda (evita "404" al abrir :3737 en el navegador).
  app.get("*", (req: any, res: any) => {
    if (hasBuiltWeb) {
      res.sendFile(indexHtmlPath);
      return;
    }
    res
      .status(200)
      .type("json")
      .send({
        ok: true,
        service: "claudio-mcp",
        endpoints: { health: "GET /health", mcp: "POST /mcp" },
        panel:
          "En desarrollo el UI corre con Vite: http://localhost:3000 (npm run dev). Este puerto es solo API salvo que ejecutes npm run build.",
      });
  });

  return app;
}

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const SHOULD_RUN_HTTP = Boolean(
  process.env.PORT ||
  process.env.VERCEL ||
  process.env.NODE_ENV === "production",
);
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
    logLocalDebug(
      `[${new Date().toISOString()}] Arrancando servidor en stdio mode...\n`,
    );

    // syncPull();
    // printBriefingToStderr();

    const server = buildServer();
    logLocalDebug(`[${new Date().toISOString()}] buildServer completado.\n`);

    function shutdown() {
      try {
        syncPush();
      } catch (e) {
        logLocalDebug(
          `[${new Date().toISOString()}] Error en shutdown syncPush: ${e}\n`,
        );
      }
      process.exit(0);
    }

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    logLocalDebug(
      `[${new Date().toISOString()}] Conectando StdioServerTransport...\n`,
    );
    await server.connect(new StdioServerTransport());
    logLocalDebug(
      `[${new Date().toISOString()}] Transporte conectado. Escuchando a Codex.\n`,
    );

    setInterval(() => {}, 1000);
  } catch (error) {
    logLocalDebug(
      `[${new Date().toISOString()}] ERROR FATAL CAPTURADO: ${error}\n${(error as Error).stack}\n`,
    );
    process.exit(1);
  }
}
