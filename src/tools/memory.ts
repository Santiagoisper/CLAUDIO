import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { getDb, loadSqliteVec } from "../db/index.js";

interface MemoryRow {
  id: string;
  kind: string;
  content: string;
  created_at: string;
}

interface ProfileRow {
  id: string;
  display_name: string;
  email: string;
  created_at: string;
}

async function embed(text: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
  });
  if (!res.ok) throw new Error(`OpenAI embeddings error: ${await res.text()}`);
  const data = await res.json() as { data: [{ embedding: number[] }] };
  return data.data[0].embedding;
}

async function maybeStoreEmbedding(id: string, content: string): Promise<void> {
  if (!process.env.OPENAI_API_KEY) return;
  try {
    const embedding = await embed(content);
    const db = getDb();
    db.prepare(`INSERT OR REPLACE INTO memories_vec (memory_id, embedding) VALUES (?, ?)`)
      .run(id, JSON.stringify(embedding));
  } catch (e) {
    console.error("Error storing embedding:", e);
  }
}

export function registerMemoryTools(server: McpServer) {
  server.tool(
    "claudio_remember",
    "Guarda un nuevo recuerdo o dato sobre Santiago",
    {
      kind: z.string().describe("Categoría del recuerdo (ej: biografia, proyecto, contacto, nota)"),
      content: z.string().describe("Contenido del recuerdo"),
      metadata: z.record(z.unknown()).optional().describe("Metadatos adicionales"),
    },
    async ({ kind, content, metadata }) => {
      const db = getDb();
      const id = randomUUID();
      db.prepare(`
        INSERT INTO memories (id, profile_id, kind, content, metadata_json)
        VALUES (?, 'santiago', ?, ?, ?)
      `).run(id, kind, content, JSON.stringify(metadata ?? {}));
      if (process.env.OPENAI_API_KEY) {
        maybeStoreEmbedding(id, content).catch(console.error);
      }
      return { content: [{ type: "text" as const, text: `Recuerdo guardado. ID: ${id}` }] };
    }
  );

  server.tool(
    "claudio_recall",
    "Busca recuerdos por texto libre y/o categoría (búsqueda full-text con ranking de relevancia)",
    {
      query: z.string().describe("Texto a buscar"),
      kind: z.string().optional().describe("Filtrar por categoría"),
      limit: z.number().int().min(1).max(50).default(10).describe("Máximo de resultados"),
    },
    async ({ query, kind, limit }) => {
      const db = getDb();
      let rows: MemoryRow[];
      try {
        if (kind) {
          rows = db.prepare(`
            SELECT m.id, m.kind, m.content, m.created_at
            FROM memories_fts f
            JOIN memories m ON m.rowid = f.rowid
            WHERE memories_fts MATCH ? AND m.kind = ?
            ORDER BY rank LIMIT ?
          `).all(query, kind, limit) as unknown as MemoryRow[];
        } else {
          rows = db.prepare(`
            SELECT m.id, m.kind, m.content, m.created_at
            FROM memories_fts f
            JOIN memories m ON m.rowid = f.rowid
            WHERE memories_fts MATCH ?
            ORDER BY rank LIMIT ?
          `).all(query, limit) as unknown as MemoryRow[];
        }
      } catch (e) {
        // Fallback a LIKE si la query contiene caracteres especiales de FTS
        console.error("FTS5 query failed, falling back to LIKE:", e);
        const pattern = `%${query}%`;
        if (kind) {
          rows = db.prepare(`
            SELECT id, kind, content, created_at FROM memories
            WHERE (content LIKE ? OR kind LIKE ?) AND kind = ?
            ORDER BY created_at DESC LIMIT ?
          `).all(pattern, pattern, kind, limit) as unknown as MemoryRow[];
        } else {
          rows = db.prepare(`
            SELECT id, kind, content, created_at FROM memories
            WHERE content LIKE ? OR kind LIKE ?
            ORDER BY created_at DESC LIMIT ?
          `).all(pattern, pattern, limit) as unknown as MemoryRow[];
        }
      }
      if (rows.length === 0) {
        return { content: [{ type: "text" as const, text: "No se encontraron recuerdos." }] };
      }
      const text = rows.map(r => `[${r.kind}] (${r.id.slice(0, 8)})\n${r.content}`).join("\n\n---\n\n");
      return { content: [{ type: "text" as const, text }] };
    }
  );

  server.tool(
    "claudio_memories",
    "Lista todos los recuerdos, opcionalmente filtrados por categoría",
    {
      kind: z.string().optional().describe("Filtrar por categoría"),
    },
    async ({ kind }) => {
      const db = getDb();
      let rows: MemoryRow[];
      if (kind) {
        rows = db.prepare(`
          SELECT id, kind, content, created_at FROM memories WHERE kind = ? ORDER BY created_at DESC
        `).all(kind) as unknown as MemoryRow[];
      } else {
        rows = db.prepare(`
          SELECT id, kind, content, created_at FROM memories ORDER BY kind, created_at DESC
        `).all() as unknown as MemoryRow[];
      }
      if (rows.length === 0) {
        return { content: [{ type: "text" as const, text: "No hay recuerdos." }] };
      }
      const text = rows.map(r =>
        `[${r.kind}] (${r.id.slice(0, 8)}) — ${r.content.slice(0, 100)}${r.content.length > 100 ? "…" : ""}`
      ).join("\n");
      return { content: [{ type: "text" as const, text: `${rows.length} recuerdos:\n\n${text}` }] };
    }
  );

  server.tool(
    "claudio_update",
    "Actualiza el contenido de un recuerdo existente",
    {
      id: z.string().describe("ID del recuerdo"),
      content: z.string().describe("Nuevo contenido"),
    },
    async ({ id, content }) => {
      const db = getDb();
      const result = db.prepare("UPDATE memories SET content = ? WHERE id = ?").run(content, id);
      if (result.changes === 0) {
        return { content: [{ type: "text" as const, text: `No se encontró recuerdo con ID: ${id}` }] };
      }
      return { content: [{ type: "text" as const, text: `Recuerdo ${id.slice(0, 8)} actualizado.` }] };
    }
  );

  server.tool(
    "claudio_forget",
    "Elimina un recuerdo por ID",
    {
      id: z.string().describe("ID del recuerdo a eliminar"),
    },
    async ({ id }) => {
      const db = getDb();
      const result = db.prepare("DELETE FROM memories WHERE id = ?").run(id);
      if (result.changes === 0) {
        return { content: [{ type: "text" as const, text: `No se encontró recuerdo con ID: ${id}` }] };
      }
      return { content: [{ type: "text" as const, text: `Recuerdo ${id.slice(0, 8)} eliminado.` }] };
    }
  );

  server.tool(
    "claudio_profile",
    "Devuelve el perfil de Santiago",
    {},
    async () => {
      const db = getDb();
      const profile = db.prepare("SELECT * FROM profiles WHERE id = 'santiago'").get() as ProfileRow | undefined;
      if (!profile) {
        return { content: [{ type: "text" as const, text: "Perfil no encontrado." }] };
      }
      return {
        content: [{
          type: "text" as const,
          text: `Nombre: ${profile.display_name}\nEmail: ${profile.email}`,
        }],
      };
    }
  );

  server.tool(
    "claudio_relate",
    "Crea una relación entre dos recuerdos (ej: 'santiago' trabaja_en 'CLAUDIO')",
    {
      from_id: z.string().describe("ID del recuerdo origen"),
      to_id: z.string().describe("ID del recuerdo destino"),
      relation_type: z.string().describe("Tipo de relación (ej: trabaja_en, conoce_a, parte_de, usa)"),
    },
    async ({ from_id, to_id, relation_type }) => {
      const db = getDb();
      const id = randomUUID();
      try {
        db.prepare(`
          INSERT OR IGNORE INTO relations (id, from_id, to_id, relation_type)
          VALUES (?, ?, ?, ?)
        `).run(id, from_id, to_id, relation_type);
        return { content: [{ type: "text" as const, text: `Relación creada: ${from_id.slice(0, 8)} → [${relation_type}] → ${to_id.slice(0, 8)}` }] };
      } catch (e) {
        return { content: [{ type: "text" as const, text: `Error al crear relación: ${e}` }] };
      }
    }
  );

  server.tool(
    "claudio_context",
    "Devuelve un recuerdo con todas sus relaciones conectadas (contexto completo del grafo)",
    {
      id: z.string().describe("ID del recuerdo"),
    },
    async ({ id }) => {
      const db = getDb();
      const memory = db.prepare("SELECT * FROM memories WHERE id = ?").get(id) as MemoryRow | undefined;
      if (!memory) {
        return { content: [{ type: "text" as const, text: `No se encontró recuerdo con ID: ${id}` }] };
      }
      const related = db.prepare(`
        SELECT m.id, m.kind, m.content, r.relation_type, 'out' as direction
        FROM relations r JOIN memories m ON m.id = r.to_id WHERE r.from_id = ?
        UNION ALL
        SELECT m.id, m.kind, m.content, r.relation_type, 'in' as direction
        FROM relations r JOIN memories m ON m.id = r.from_id WHERE r.to_id = ?
      `).all(id, id) as Array<{ id: string; kind: string; content: string; relation_type: string; direction: string }>;

      let text = `[${memory.kind}] (${memory.id.slice(0, 8)})\n${memory.content}`;
      if (related.length > 0) {
        text += `\n\nRelaciones (${related.length}):\n` + related.map(r =>
          `  ${r.direction === 'out' ? '→' : '←'} [${r.relation_type}] [${r.kind}] ${r.content.slice(0, 80)}${r.content.length > 80 ? '…' : ''} (${r.id.slice(0, 8)})`
        ).join('\n');
      } else {
        text += `\n\n(Sin relaciones registradas)`;
      }
      return { content: [{ type: "text" as const, text }] };
    }
  );

  server.tool(
    "claudio_status",
    "Devuelve estado actual de CLAUDIO: fecha/hora Argentina, cantidad de recuerdos por categoría, último recuerdo registrado",
    {},
    async () => {
      const db = getDb();
      const counts = db.prepare(`
        SELECT kind, COUNT(*) as total FROM memories GROUP BY kind ORDER BY total DESC
      `).all() as Array<{ kind: string; total: number }>;
      const last = db.prepare(`
        SELECT content, kind, created_at FROM memories ORDER BY created_at DESC LIMIT 1
      `).get() as { content: string; kind: string; created_at: string } | undefined;
      const total = counts.reduce((acc, r) => acc + r.total, 0);
      const now = new Date().toLocaleString("es-AR", {
        timeZone: "America/Argentina/Buenos_Aires",
        dateStyle: "full",
        timeStyle: "medium",
      });
      const lines = [
        `📅 ${now}`,
        `🧠 Total de recuerdos: ${total}`,
        counts.length > 0
          ? `📂 Por categoría:\n${counts.map(r => `   ${r.kind}: ${r.total}`).join('\n')}`
          : `📂 Sin recuerdos aún.`,
        last
          ? `🕐 Último: [${last.kind}] ${last.content.slice(0, 80)}${last.content.length > 80 ? '…' : ''} — ${last.created_at}`
          : "",
      ].filter(Boolean);
      return { content: [{ type: "text" as const, text: lines.join('\n') }] };
    }
  );

  if (process.env.OPENAI_API_KEY) {
    server.tool(
      "claudio_recall_semantic",
      "Busca recuerdos por SIGNIFICADO semántico (no por palabras exactas). Ideal para: '¿qué sé sobre finanzas?', 'proyectos relacionados con IA'. Usa embeddings de OpenAI.",
      {
        query: z.string(),
        limit: z.number().int().min(1).max(20).default(5),
      },
      async ({ query, limit }) => {
        const db = getDb();

        // Verificar que sqlite-vec esté disponible
        const vecAvailable = await loadSqliteVec(db);
        if (!vecAvailable) {
          return {
            content: [{
              type: "text" as const,
              text: "sqlite-vec no está disponible. La búsqueda semántica no puede ejecutarse. Usa claudio_recall para búsqueda por texto.",
            }],
          };
        }

        let embedding: number[];
        try {
          embedding = await embed(query);
        } catch (e) {
          return {
            content: [{
              type: "text" as const,
              text: `Error generando embedding: ${e}`,
            }],
          };
        }

        let rows: Array<{ id: string; kind: string; content: string; distance: number }>;
        try {
          rows = db.prepare(`
            SELECT m.id, m.kind, m.content, v.distance
            FROM memories_vec v
            JOIN memories m ON m.id = v.memory_id
            WHERE v.embedding MATCH ? AND k = ?
            ORDER BY v.distance
          `).all(JSON.stringify(embedding), limit) as Array<{ id: string; kind: string; content: string; distance: number }>;
        } catch (e) {
          return {
            content: [{
              type: "text" as const,
              text: `Error en búsqueda semántica: ${e}. Es posible que sqlite-vec no esté correctamente instalado.`,
            }],
          };
        }

        if (rows.length === 0) {
          return {
            content: [{
              type: "text" as const,
              text: "No se encontraron recuerdos semánticamente similares.",
            }],
          };
        }

        const text = rows
          .map((r) => `[${r.kind}] (${r.id.slice(0, 8)}) — similitud: ${(1 - r.distance).toFixed(3)}\n${r.content}`)
          .join("\n\n---\n\n");
        return { content: [{ type: "text" as const, text }] };
      }
    );
  }
}
