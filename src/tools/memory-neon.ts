// @ts-nocheck
import { randomUUID } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ensureNeonSchema, getNeonSql } from "../db/neon.js";

interface MemoryRow {
  id: string;
  kind: string;
  content: string;
  created_at: string;
}

interface ProfileRow {
  id: string;
  display_name: string;
  email: string | null;
  created_at: string;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function formatMemoryList(rows: MemoryRow[]): string {
  return rows.map((row) => `[${row.kind}] (${row.id.slice(0, 8)})\n${row.content}`).join("\n\n---\n\n");
}

function domainForMemory(kind: string, metadata: Record<string, unknown> | undefined): string {
  const explicit = metadata?.domain;
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();
  if (kind.startsWith("bope")) return "bope";
  if (kind.startsWith("github")) return "code";
  if (kind.startsWith("biografia")) return "personal";
  return "general";
}

export function registerNeonMemoryTools(server: McpServer) {
  server.tool(
    "claudio_remember",
    "Guarda un nuevo recuerdo o dato sobre Santiago",
    {
      kind: z.string().describe("Categoria del recuerdo (ej: biografia, proyecto, contacto, nota)"),
      content: z.string().describe("Contenido del recuerdo"),
      metadata: z.record(z.unknown()).optional().describe("Metadatos adicionales"),
    },
    async ({ kind, content, metadata }) => {
      const ready = await ensureNeonSchema();
      const sql = getNeonSql();
      if (!ready || !sql) {
        return { content: [{ type: "text" as const, text: "Neon no esta configurado." }], isError: true };
      }

      const id = randomUUID();
      const safeMetadata = metadata ?? {};
      await sql`
        INSERT INTO memories (id, profile_id, kind, domain, content, metadata_json)
        VALUES (${id}::uuid, 'santiago', ${kind}, ${domainForMemory(kind, safeMetadata)}, ${content}, (${JSON.stringify(safeMetadata)})::jsonb)
      `;
      const rows = await sql<MemoryRow[]>`
        SELECT id::text AS id, kind, content, created_at::text FROM memories WHERE id::text = ${id}
      `;
      const row = rows[0]!;
      return {
        content: [{ type: "text" as const, text: `Recuerdo guardado. ID: ${id}` }],
        structuredContent: {
          id: row.id,
          kind: row.kind,
          content: row.content,
          created_at: row.created_at,
        },
      };
    }
  );

  server.tool(
    "claudio_recall",
    "Busca recuerdos por texto libre y/o categoria",
    {
      query: z.string().describe("Texto a buscar"),
      kind: z.string().optional().describe("Filtrar por categoria"),
      limit: z.number().int().min(1).max(50).default(10).describe("Maximo de resultados"),
    },
    async ({ query, kind, limit }) => {
      const ready = await ensureNeonSchema();
      const sql = getNeonSql();
      if (!ready || !sql) {
        return { content: [{ type: "text" as const, text: "Neon no esta configurado." }], isError: true };
      }

      const pattern = `%${query}%`;
      const rows = kind
        ? await sql<MemoryRow[]>`
            SELECT id::text AS id, kind, content, created_at::text
            FROM memories
            WHERE (content ILIKE ${pattern} OR kind ILIKE ${pattern})
              AND kind = ${kind}
            ORDER BY created_at DESC
            LIMIT ${limit}
          `
        : await sql<MemoryRow[]>`
            SELECT id::text AS id, kind, content, created_at::text
            FROM memories
            WHERE content ILIKE ${pattern} OR kind ILIKE ${pattern}
            ORDER BY created_at DESC
            LIMIT ${limit}
          `;

      if (rows.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No se encontraron recuerdos." }],
          structuredContent: { memories: [] as MemoryRow[] },
        };
      }
      return {
        content: [{ type: "text" as const, text: formatMemoryList(rows) }],
        structuredContent: { memories: rows },
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
      const ready = await ensureNeonSchema();
      const sql = getNeonSql();
      if (!ready || !sql) {
        return { content: [{ type: "text" as const, text: "Neon no esta configurado." }], isError: true };
      }

      const rows = kind
        ? await sql<MemoryRow[]>`
            SELECT id::text AS id, kind, content, created_at::text
            FROM memories
            WHERE kind = ${kind}
            ORDER BY created_at DESC
          `
        : await sql<MemoryRow[]>`
            SELECT id::text AS id, kind, content, created_at::text
            FROM memories
            ORDER BY kind, created_at DESC
          `;

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
        structuredContent: { memories: rows },
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
      const ready = await ensureNeonSchema();
      const sql = getNeonSql();
      if (!ready || !sql) {
        return { content: [{ type: "text" as const, text: "Neon no esta configurado." }], isError: true };
      }

      const rows = await sql<{ id: string }[]>`
        UPDATE memories SET content = ${content}
        WHERE id::text = ${id}
        RETURNING id
      `;
      if (rows.length === 0) {
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
      const ready = await ensureNeonSchema();
      const sql = getNeonSql();
      if (!ready || !sql) {
        return { content: [{ type: "text" as const, text: "Neon no esta configurado." }], isError: true };
      }

      const rows = await sql<{ id: string }[]>`
        DELETE FROM memories
        WHERE id::text = ${id}
        RETURNING id
      `;
      if (rows.length === 0) {
        return { content: [{ type: "text" as const, text: `No se encontro recuerdo con ID: ${id}` }] };
      }
      return { content: [{ type: "text" as const, text: `Recuerdo ${id.slice(0, 8)} eliminado.` }] };
    }
  );

  server.tool(
    "claudio_profile",
    "Devuelve el perfil de Santiago",
    {},
    async () => {
      const ready = await ensureNeonSchema();
      const sql = getNeonSql();
      if (!ready || !sql) {
        return { content: [{ type: "text" as const, text: "Neon no esta configurado." }], isError: true };
      }

      const rows = await sql<ProfileRow[]>`
        SELECT id, display_name, email, created_at::text
        FROM profiles
        WHERE id = 'santiago'
        LIMIT 1
      `;
      const profile = rows[0];
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
    "Crea una relacion entre dos recuerdos",
    {
      from_id: z.string().describe("ID del recuerdo origen"),
      to_id: z.string().describe("ID del recuerdo destino"),
      relation_type: z.string().describe("Tipo de relacion"),
    },
    async ({ from_id, to_id, relation_type }) => {
      const ready = await ensureNeonSchema();
      const sql = getNeonSql();
      if (!ready || !sql) {
        return { content: [{ type: "text" as const, text: "Neon no esta configurado." }], isError: true };
      }

      const id = randomUUID();
      await sql`
        INSERT INTO relations (id, from_id, to_id, relation_type)
        VALUES (${id}, ${from_id}, ${to_id}, ${relation_type})
        ON CONFLICT (from_id, to_id, relation_type) DO NOTHING
      `;
      return {
        content: [{
          type: "text" as const,
          text: `Relacion creada: ${from_id.slice(0, 8)} -> [${relation_type}] -> ${to_id.slice(0, 8)}`,
        }],
      };
    }
  );

  server.tool(
    "claudio_context",
    "Devuelve un recuerdo con todas sus relaciones conectadas",
    {
      id: z.string().describe("ID del recuerdo"),
    },
    async ({ id }) => {
      const ready = await ensureNeonSchema();
      const sql = getNeonSql();
      if (!ready || !sql) {
        return { content: [{ type: "text" as const, text: "Neon no esta configurado." }], isError: true };
      }

      const memories = await sql<MemoryRow[]>`
        SELECT id::text AS id, kind, content, created_at::text
        FROM memories
        WHERE id::text = ${id}
        LIMIT 1
      `;
      const memory = memories[0];
      if (!memory) {
        return { content: [{ type: "text" as const, text: `No se encontro recuerdo con ID: ${id}` }] };
      }

      const related = await sql<Array<{
        id: string;
        kind: string;
        content: string;
        relation_type: string;
        direction: string;
      }>>`
        SELECT m.id::text AS id, m.kind, m.content, r.relation_type, 'out'::text as direction
        FROM relations r JOIN memories m ON m.id::text = r.to_id
        WHERE r.from_id = ${id}
        UNION ALL
        SELECT m.id::text AS id, m.kind, m.content, r.relation_type, 'in'::text as direction
        FROM relations r JOIN memories m ON m.id::text = r.from_id
        WHERE r.to_id = ${id}
      `;

      let text = `[${memory.kind}] (${memory.id.slice(0, 8)})\n${memory.content}`;
      if (related.length > 0) {
        text += "\n\nRelaciones (" + related.length + "):\n";
        text += related
          .map((row) => {
            const arrow = row.direction === "out" ? "->" : "<-";
            return `  ${arrow} [${row.relation_type}] [${row.kind}] ${truncate(row.content, 80)} (${row.id.slice(0, 8)})`;
          })
          .join("\n");
      } else {
        text += "\n\n(Sin relaciones registradas)";
      }
      return { content: [{ type: "text" as const, text }] };
    }
  );

  server.tool(
    "claudio_status",
    "Devuelve estado actual de CLAUDIO",
    {},
    async () => {
      const ready = await ensureNeonSchema();
      const sql = getNeonSql();
      if (!ready || !sql) {
        return { content: [{ type: "text" as const, text: "Neon no esta configurado." }], isError: true };
      }

      const counts = await sql<Array<{ kind: string; total: string | number }>>`
        SELECT kind, COUNT(*)::int as total
        FROM memories
        GROUP BY kind
        ORDER BY total DESC
      `;
      const lastRows = await sql<Array<{ content: string; kind: string; created_at: string }>>`
        SELECT content, kind, created_at::text
        FROM memories
        ORDER BY created_at DESC
        LIMIT 1
      `;
      const last = lastRows[0];
      const total = counts.reduce((acc, row) => acc + Number(row.total), 0);
      const now = new Date().toLocaleString("es-AR", {
        timeZone: "America/Argentina/Buenos_Aires",
        dateStyle: "full",
        timeStyle: "medium",
      });

      const lines = [
        `Fecha: ${now}`,
        `Total de recuerdos: ${total}`,
        counts.length > 0
          ? `Por categoria:\n${counts.map((row) => `  ${row.kind}: ${row.total}`).join("\n")}`
          : "Sin recuerdos aun.",
        last ? `Ultimo: [${last.kind}] ${truncate(last.content, 80)} - ${last.created_at}` : "",
      ].filter(Boolean);
      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    }
  );

  if (process.env.OPENAI_API_KEY) {
    server.tool(
      "claudio_recall_semantic",
      "Busqueda semantica de recuerdos (Neon backend).",
      {
        query: z.string(),
        limit: z.number().int().min(1).max(20).default(5),
      },
      async () => {
        return {
          content: [{
            type: "text" as const,
            text: "La busqueda semantica en Neon aun no esta habilitada en esta version. Usa claudio_recall por texto.",
          }],
        };
      },
    );
  }
}
