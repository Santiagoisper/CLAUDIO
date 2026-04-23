import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { getDb } from "../db/index.js";

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
      return { content: [{ type: "text" as const, text: `Recuerdo guardado. ID: ${id}` }] };
    }
  );

  server.tool(
    "claudio_recall",
    "Busca recuerdos por texto libre y/o categoría",
    {
      query: z.string().describe("Texto a buscar"),
      kind: z.string().optional().describe("Filtrar por categoría"),
      limit: z.number().int().min(1).max(50).default(10).describe("Máximo de resultados"),
    },
    async ({ query, kind, limit }) => {
      const db = getDb();
      const pattern = `%${query}%`;
      let rows: MemoryRow[];
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
}
