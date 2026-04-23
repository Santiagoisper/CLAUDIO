import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { registerMemoryTools } from "./tools/memory.js";
import { registerGithubTools } from "./tools/github.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function git(cmd: string) {
  try {
    execSync(`git ${cmd}`, { cwd: ROOT, stdio: "pipe" });
  } catch {
    // sin internet o sin cambios — continúa igual
  }
}

function syncPull() {
  git("pull --ff-only --quiet");
}

function syncPush() {
  git("add data/claudio.db");
  try {
    execSync('git diff --cached --quiet', { cwd: ROOT, stdio: "pipe" });
    // sin cambios, no hay nada que pushear
  } catch {
    const ts = new Date().toISOString().slice(0, 16).replace("T", " ");
    git(`commit -m "sync: ${ts}" --quiet`);
    git("push --quiet");
  }
}

// Al arrancar: traer la última versión de la DB
syncPull();

const server = new McpServer({
  name: "claudio",
  version: "1.0.0",
  description: "CLAUDIO — Asistente personal de Santiago",
});

registerMemoryTools(server);

if (process.env.GITHUB_TOKEN) {
  registerGithubTools(server);
}

// Al cerrar: guardar la DB en GitHub
function shutdown() {
  syncPush();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

const transport = new StdioServerTransport();
await server.connect(transport);
