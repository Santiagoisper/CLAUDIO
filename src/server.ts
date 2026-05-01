import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { execSync } from "node:child_process";
import { timingSafeEqual } from "node:crypto";
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

const PORT = process.env.PORT ? parseInt(process.env.PORT) : null;

if (PORT) {
  // ── Modo remoto: HTTP/SSE para Railway ──────────────────────────────────
  const TOKEN = process.env.CLAUDIO_TOKEN;
  if (TOKEN) assertStrongToken(TOKEN);
  const sessions = new Map<string, SSEServerTransport>();

  function authed(req: IncomingMessage): boolean {
    if (!TOKEN) return true;
    const bearer = req.headers.authorization;
    const param = new URL(req.url!, "http://x").searchParams.get("token");
    const bearerToken = bearer?.startsWith("Bearer ") ? bearer.slice("Bearer ".length) : null;
    return safeTokenEquals(TOKEN, bearerToken) || safeTokenEquals(TOKEN, param);
  }

  createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url!, "http://x");

    if (url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: true }));
    }

    if (!authed(req)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Unauthorized" }));
    }

    if (req.method === "POST") {
      const contentLengthHeader = req.headers["content-length"];
      const contentLength = Number(contentLengthHeader ?? "0");
      if (Number.isFinite(contentLength) && contentLength > MAX_HTTP_BODY_BYTES) {
        res.writeHead(413, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Payload too large" }));
      }
    }

    if (req.method === "GET" && url.pathname === "/sse") {
      const transport = new SSEServerTransport("/messages", res);
      sessions.set(transport.sessionId, transport);
      res.on("close", () => sessions.delete(transport.sessionId));
      await buildServer().connect(transport);

    } else if (req.method === "POST" && url.pathname === "/messages") {
      const t = sessions.get(url.searchParams.get("sessionId") ?? "");
      if (!t) return res.writeHead(404).end();
      await t.handlePostMessage(req, res);

    } else {
      res.writeHead(404).end();
    }
  }).listen(PORT, () => console.log(`CLAUDIO escuchando en :${PORT}`));

} else {
  // ── Modo local: stdio para Claude Code ──────────────────────────────────
  syncPull();
  printBriefingToStderr();

  const server = buildServer();

  function shutdown() { syncPush(); process.exit(0); }
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await server.connect(new StdioServerTransport());
}
