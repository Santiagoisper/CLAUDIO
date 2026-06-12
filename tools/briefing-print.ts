/**
 * Imprime el briefing de CLAUDIO a stdout para inyección en el contexto de sesión.
 * Usado por el SessionStart hook de Claude Code.
 */
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.CLAUDIO_DB_PATH
  ? path.resolve(process.env.CLAUDIO_DB_PATH)
  : path.resolve(__dirname, "../data/claudio.db");

interface KindCount { kind: string; total: number }
interface RecentMemory { kind: string; content: string }
interface ProjectMemory { content: string }

let db: DatabaseSync;
try {
  db = new DatabaseSync(dbPath);
} catch {
  process.exit(0);
}

const counts = db.prepare(
  "SELECT kind, COUNT(*) as total FROM memories GROUP BY kind ORDER BY total DESC"
).all() as KindCount[];

const projects = db.prepare(
  "SELECT content FROM memories WHERE kind = 'proyecto' ORDER BY created_at DESC LIMIT 5"
).all() as ProjectMemory[];

const recent = db.prepare(
  "SELECT kind, content FROM memories WHERE created_at >= datetime('now', '-1 day') ORDER BY created_at DESC LIMIT 5"
).all() as RecentMemory[];

const totalMemories = counts.reduce((acc, row) => acc + row.total, 0);

const now = new Date().toLocaleString("es-AR", {
  timeZone: "America/Argentina/Buenos_Aires",
  dateStyle: "full",
  timeStyle: "short",
});

const lines: string[] = [
  `# Briefing CLAUDIO — ${now}`,
  `\n## Memoria (${totalMemories} recuerdos)`,
];

if (counts.length > 0) {
  lines.push(counts.map((r) => `  ${r.kind}: ${r.total}`).join("\n"));
}

if (projects.length > 0) {
  lines.push(`\n## Proyectos activos`);
  lines.push(projects.map((p) => `  - ${p.content.slice(0, 120)}`).join("\n"));
}

if (recent.length > 0) {
  lines.push(`\n## Últimas 24hs`);
  lines.push(recent.map((r) => `  [${r.kind}] ${r.content.slice(0, 100)}`).join("\n"));
} else {
  lines.push(`\n## Sin actividad reciente.`);
}

console.log(lines.join("\n"));
db.close();
