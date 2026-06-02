import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getDb } from "../db/index.js";

interface KindCount {
  kind: string;
  total: number;
}

interface RecentMemory {
  kind: string;
  content: string;
  created_at: string;
}

interface ProjectMemory {
  content: string;
}

function buildBriefingText(): string {
  const db = getDb();

  const recent = db.prepare(`
    SELECT kind, content, created_at FROM memories
    WHERE created_at >= datetime('now', '-1 day')
    ORDER BY created_at DESC LIMIT 5
  `).all() as unknown as RecentMemory[];

  const projects = db.prepare(`
    SELECT content FROM memories WHERE kind = 'proyecto' ORDER BY created_at DESC LIMIT 5
  `).all() as unknown as ProjectMemory[];

  const counts = db.prepare(`
    SELECT kind, COUNT(*) as total FROM memories GROUP BY kind ORDER BY total DESC
  `).all() as unknown as KindCount[];

  const now = new Date().toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    dateStyle: "full",
    timeStyle: "short",
  });

  const totalMemories = counts.reduce((acc, row) => acc + row.total, 0);

  const lines: string[] = [
    `# Briefing de sesion - ${now}`,
    `\n## Memoria (${totalMemories} recuerdos)`,
    counts.map((row) => `  ${row.kind}: ${row.total}`).join("\n"),
  ];

  if (projects.length > 0) {
    lines.push(`\n## Proyectos activos`);
    lines.push(projects.map((project) => `  - ${project.content.slice(0, 120)}`).join("\n"));
  }

  if (recent.length > 0) {
    lines.push(`\n## Ultimas 24hs`);
    lines.push(recent.map((row) => `  [${row.kind}] ${row.content.slice(0, 100)}`).join("\n"));
  } else {
    lines.push(`\n## Sin actividad reciente.`);
  }

  return lines.filter(Boolean).join("\n");
}

export function registerBriefingTools(server: McpServer) {
  server.tool(
    "claudio_briefing",
    "Devuelve el briefing de inicio de sesion: memorias recientes, proyectos activos y resumen de contexto. Llamar al inicio de cada conversacion.",
    {},
    async () => {
      const text = buildBriefingText();
      return {
        content: [{ type: "text" as const, text }],
        structuredContent: { briefing: text },
      };
    }
  );
}

export function printBriefingToStderr(): void {
  try {
    const db = getDb();

    const recent = db.prepare(`
      SELECT kind, content, created_at FROM memories
      WHERE created_at >= datetime('now', '-1 day')
      ORDER BY created_at DESC LIMIT 5
    `).all() as unknown as RecentMemory[];

    const counts = db.prepare(`
      SELECT kind, COUNT(*) as total FROM memories GROUP BY kind ORDER BY total DESC
    `).all() as unknown as KindCount[];

    const now = new Date().toLocaleString("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
      dateStyle: "full",
      timeStyle: "short",
    });

    const total = counts.reduce((acc, row) => acc + row.total, 0);

    process.stderr.write(`\n=== CLAUDIO Briefing - ${now} ===\n`);
    process.stderr.write(`${total} recuerdos`);
    if (counts.length > 0) {
      process.stderr.write(` (${counts.map((row) => `${row.kind}: ${row.total}`).join(", ")})`);
    }
    process.stderr.write("\n");

    if (recent.length > 0) {
      process.stderr.write("Ultimas 24hs:\n");
      for (const row of recent) {
        process.stderr.write(`  [${row.kind}] ${row.content.slice(0, 80)}\n`);
      }
    }

    process.stderr.write("================================\n\n");
  } catch (error) {
    console.warn("printBriefingToStderr error:", error);
  }
}
