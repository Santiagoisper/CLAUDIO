import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { loadSqliteVec, getDb } from "../db/index.js";
import { getNeonSql } from "../db/neon.js";
import { getNeonAdapter } from "./memory-neon.js";
import { sqliteAdapter } from "./memory-sqlite.js";
import type { MemoryAdapter, MemoryRow } from "./memory-adapter.js";

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

async function embed(text: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
  });
  if (!res.ok) throw new Error(`OpenAI embeddings error (${res.status})`);
  const data = await res.json() as { data: [{ embedding: number[] }] };
  return data.data[0].embedding;
}

function registerTools(server: McpServer, adapter: MemoryAdapter): void {
  server.tool(
    "claudio_remember",
    "Guarda un nuevo recuerdo o dato sobre Santiago",
    {
      kind: z.string().describe("Categoria del recuerdo (ej: biografia, proyecto, contacto, nota)"),
      content: z.string().describe("Contenido del recuerdo"),
      metadata: z.record(z.unknown()).optional().describe("Metadatos adicionales"),
      ttl_days: z.number().int().min(1).optional().describe("Dias hasta que el recuerdo expira. Sin valor = no expira."),
    },
    async ({ kind, content, metadata, ttl_days }) => {
      const row = await adapter.remember(kind, content, metadata, ttl_days);
      const expiryNote = row.expires_at ? ` Expira: ${row.expires_at}.` : "";
      return {
        content: [{ type: "text" as const, text: `Recuerdo guardado. ID: ${row.id}.${expiryNote}` }],
        structuredContent: { ...row, created_at: String(row.created_at) },
      };
    }
  );

  server.tool(
    "claudio_recall",
    "Busca recuerdos por texto libre y/o categoria (busqueda full-text con ranking de relevancia)",
    {
      query: z.string().describe("Texto a buscar"),
      kind: z.string().optional().describe("Filtrar por categoria"),
      limit: z.number().int().min(1).max(50).default(10).describe("Maximo de resultados"),
    },
    async ({ query, kind, limit }) => {
      const rows = await adapter.recall(query, kind, limit);
      if (rows.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No se encontraron recuerdos." }],
          structuredContent: { memories: [] as MemoryRow[] },
        };
      }
      const text = rows.map((row) => `[${row.kind}] (${row.id.slice(0, 8)})\n${row.content}`).join("\n\n---\n\n");
      return {
        content: [{ type: "text" as const, text }],
        structuredContent: { memories: rows.map((r) => ({ ...r, created_at: String(r.created_at) })) },
      };
    }
  );

  server.tool(
    "claudio_memories",
    "Lista todos los recuerdos, opcionalmente filtrados por categoria",
    {
      kind: z.string().optional().describe("Filtrar por categoria"),
    },
    async ({ kind }) => {
      const rows = await adapter.memories(kind);
      if (rows.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No hay recuerdos." }],
          structuredContent: { memories: [] as MemoryRow[] },
        };
      }
      const text = rows
        .map((row) => `[${row.kind}] (${row.id.slice(0, 8)}) - ${truncate(row.content, 100)}`)
        .join("\n");
      return {
        content: [{ type: "text" as const, text: `${rows.length} recuerdos:\n\n${text}` }],
        structuredContent: { memories: rows.map((r) => ({ ...r, created_at: String(r.created_at) })) },
      };
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
      const updated = await adapter.update(id, content);
      if (!updated) {
        return { content: [{ type: "text" as const, text: `No se encontro recuerdo con ID: ${id}` }] };
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
      const deleted = await adapter.forget(id);
      if (!deleted) {
        return { content: [{ type: "text" as const, text: `No se encontro recuerdo con ID: ${id}` }] };
      }
      return { content: [{ type: "text" as const, text: `Recuerdo ${id.slice(0, 8)} eliminado.` }] };
    }
  );

  server.tool(
    "claudio_forget_by_query",
    "Elimina recuerdos que coincidan con una busqueda de texto libre. Muestra una preview antes de eliminar a menos que confirm=true",
    {
      query: z.string().describe("Texto a buscar en los recuerdos a eliminar"),
      kind: z.string().optional().describe("Filtrar por categoria antes de eliminar"),
      confirm: z.boolean().default(false).describe("Si es false (default), solo muestra los recuerdos que se eliminarian. Si es true, los elimina."),
    },
    async ({ query, kind, confirm }) => {
      const { rows } = await adapter.forgetByQuery(query, kind);
      if (rows.length === 0) {
        return { content: [{ type: "text" as const, text: `No se encontraron recuerdos para: "${query}"` }] };
      }
      if (!confirm) {
        const preview = rows.map((row) => `  [${row.kind}] (${row.id.slice(0, 8)}) ${truncate(row.content, 80)}`).join("\n");
        return {
          content: [{
            type: "text" as const,
            text: `Se eliminarian ${rows.length} recuerdo(s):\n\n${preview}\n\nLlama de nuevo con confirm=true para confirmar.`,
          }],
        };
      }
      const deleted = await adapter.deleteByIds(rows.map((r) => r.id));
      return {
        content: [{
          type: "text" as const,
          text: `${deleted} recuerdo(s) eliminado(s) para la búsqueda: "${query}"`,
        }],
      };
    }
  );

  server.tool(
    "claudio_expire_soon",
    "Lista recuerdos que van a expirar pronto o que ya expiraron. Útil para revisar y renovar contexto temporal.",
    {
      days: z.number().int().min(1).max(90).default(7).describe("Mostrar recuerdos que expiran en los próximos N días"),
      include_expired: z.boolean().default(false).describe("Incluir recuerdos ya expirados"),
    },
    async ({ days, include_expired }) => {
      const rows = await adapter.expireSoon(days, include_expired);
      if (rows.length === 0) {
        return {
          content: [{
            type: "text" as const,
            text: `No hay recuerdos que expiren en los próximos ${days} día(s).`,
          }],
        };
      }
      const now = new Date();
      const text = rows.map((row) => {
        const exp = new Date(row.expires_at);
        const diffDays = Math.ceil((exp.getTime() - now.getTime()) / 86_400_000);
        const status = diffDays <= 0 ? "EXPIRADO" : `expira en ${diffDays}d`;
        return `[${row.kind}] (${row.id.slice(0, 8)}) [${status}]\n${truncate(row.content, 100)}`;
      }).join("\n\n---\n\n");
      return { content: [{ type: "text" as const, text }] };
    }
  );

  server.tool(
    "claudio_profile",
    "Devuelve el perfil de Santiago",
    {},
    async () => {
      const profile = await adapter.profile();
      if (!profile) {
        return { content: [{ type: "text" as const, text: "Perfil no encontrado." }] };
      }
      return {
        content: [{
          type: "text" as const,
          text: `Nombre: ${profile.display_name}\nEmail: ${profile.email ?? ""}`.trim(),
        }],
      };
    }
  );

  server.tool(
    "claudio_relate",
    "Crea una relacion entre dos recuerdos (ej: 'santiago' trabaja_en 'CLAUDIO')",
    {
      from_id: z.string().describe("ID del recuerdo origen"),
      to_id: z.string().describe("ID del recuerdo destino"),
      relation_type: z.string().describe("Tipo de relacion (ej: trabaja_en, conoce_a, parte_de, usa)"),
    },
    async ({ from_id, to_id, relation_type }) => {
      try {
        await adapter.relate(from_id, to_id, relation_type);
        return {
          content: [{
            type: "text" as const,
            text: `Relacion creada: ${from_id.slice(0, 8)} -> [${relation_type}] -> ${to_id.slice(0, 8)}`,
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text" as const,
            text: `Error al crear relacion: ${error instanceof Error ? error.message : String(error)}`,
          }],
        };
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
      const result = await adapter.context(id);
      if (!result) {
        return { content: [{ type: "text" as const, text: `No se encontro recuerdo con ID: ${id}` }] };
      }
      const { memory, related } = result;
      let text = `[${memory.kind}] (${memory.id.slice(0, 8)})\n${memory.content}`;
      if (related.length > 0) {
        text += `\n\nRelaciones (${related.length}):\n`;
        text += related
          .map((row) => `  ${row.direction === "out" ? "->" : "<-"} [${row.relation_type}] [${row.kind}] ${truncate(row.content, 80)} (${row.id.slice(0, 8)})`)
          .join("\n");
      } else {
        text += "\n\n(Sin relaciones registradas)";
      }
      return { content: [{ type: "text" as const, text }] };
    }
  );

  server.tool(
    "claudio_status",
    "Devuelve estado actual de CLAUDIO: fecha/hora Argentina, cantidad de recuerdos por categoria, ultimo recuerdo registrado",
    {},
    async () => {
      const { counts, last } = await adapter.status();
      const total = counts.reduce((acc, row) => acc + row.total, 0);
      const now = new Date().toLocaleString("es-AR", {
        timeZone: "America/Argentina/Buenos_Aires",
        dateStyle: "full",
        timeStyle: "medium",
      });
      const lines = [
        `Fecha: ${now}`,
        `Total de recuerdos: ${total}`,
        counts.length > 0
          ? `Por categoria:\n${counts.map((row) => `   ${row.kind}: ${row.total}`).join("\n")}`
          : "Sin recuerdos aun.",
        last ? `Ultimo: [${last.kind}] ${truncate(last.content, 80)} - ${last.created_at}` : "",
      ].filter(Boolean);
      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    }
  );

  if (process.env.OPENAI_API_KEY) {
    server.tool(
      "claudio_recall_semantic",
      "Busca recuerdos por significado semantico (no por palabras exactas). Ideal para temas y relaciones conceptuales. Usa embeddings de OpenAI.",
      {
        query: z.string(),
        limit: z.number().int().min(1).max(20).default(5),
      },
      async ({ query, limit }) => {
        const db = getDb();
        const vecAvailable = await loadSqliteVec(db);
        if (!vecAvailable) {
          return {
            content: [{
              type: "text" as const,
              text: "sqlite-vec no esta disponible. La busqueda semantica no puede ejecutarse. Usa claudio_recall para busqueda por texto.",
            }],
          };
        }
        let embedding: number[];
        try {
          embedding = await embed(query);
        } catch (error) {
          return {
            content: [{
              type: "text" as const,
              text: `Error generando embedding: ${error instanceof Error ? error.message : String(error)}`,
            }],
          };
        }
        try {
          const rows = db.prepare(`
            SELECT m.id, m.kind, m.content, v.distance
            FROM memories_vec v JOIN memories m ON m.id = v.memory_id
            WHERE v.embedding MATCH ? AND k = ?
            ORDER BY v.distance
          `).all(JSON.stringify(embedding), limit) as Array<{ id: string; kind: string; content: string; distance: number }>;
          if (rows.length === 0) {
            return { content: [{ type: "text" as const, text: "No se encontraron recuerdos semanticamente similares." }] };
          }
          const text = rows
            .map((row) => `[${row.kind}] (${row.id.slice(0, 8)}) - similitud: ${(1 - row.distance).toFixed(3)}\n${row.content}`)
            .join("\n\n---\n\n");
          return { content: [{ type: "text" as const, text }] };
        } catch (error) {
          return {
            content: [{
              type: "text" as const,
              text: `Error en busqueda semantica: ${error instanceof Error ? error.message : String(error)}`,
            }],
          };
        }
      }
    );
  }
}

export function registerMemoryTools(server: McpServer): void {
  const adapter = getNeonSql() ? getNeonAdapter() : sqliteAdapter;
  registerTools(server, adapter);
}
