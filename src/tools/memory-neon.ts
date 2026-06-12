import { randomUUID } from "node:crypto";
import { ensureNeonSchema, getNeonSql } from "../db/neon.js";
import type { MemoryAdapter, MemoryRow, RelatedRow, ProfileRow, KindCount } from "./memory-adapter.js";

// Neon's sql template literal has complex generics that don't play well with our types.
// We use `as unknown as T` for all results — the runtime values are correct.

function domainForMemory(kind: string, metadata: Record<string, unknown> | undefined): string {
  const explicit = metadata?.domain;
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();
  if (kind.startsWith("bope")) return "bope";
  if (kind.startsWith("github")) return "code";
  if (kind.startsWith("biografia")) return "personal";
  return "general";
}

async function neonReady(): Promise<boolean> {
  return (await ensureNeonSchema()) && getNeonSql() !== null;
}

function notConfigured(): never {
  throw new Error("Neon no esta configurado.");
}

export function getNeonAdapter(): MemoryAdapter {
  return {
    async remember(kind, content, metadata, ttl_days) {
      if (!await neonReady()) notConfigured();
      const sql = getNeonSql()!;
      const id = randomUUID();
      const safeMetadata = metadata ?? {};
      const expires_at = ttl_days
        ? new Date(Date.now() + ttl_days * 86_400_000).toISOString().slice(0, 19).replace("T", " ")
        : null;
      await sql`
        INSERT INTO memories (id, profile_id, kind, domain, content, metadata_json, expires_at)
        VALUES (${id}::uuid, 'santiago', ${kind}, ${domainForMemory(kind, safeMetadata)}, ${content}, (${JSON.stringify(safeMetadata)})::jsonb, ${expires_at})
      `;
      const rows = await sql`
        SELECT id::text AS id, kind, content, created_at::text, expires_at::text
        FROM memories WHERE id::text = ${id}
      `;
      return (rows as unknown as Array<MemoryRow & { expires_at: string | null }>)[0]!;
    },

    async recall(query, kind, limit = 10) {
      if (!await neonReady()) notConfigured();
      const sql = getNeonSql()!;
      const p = `%${query}%`;
      const rows = kind
        ? await sql`
            SELECT id::text AS id, kind, content, created_at::text, expires_at::text
            FROM memories
            WHERE (content ILIKE ${p} OR kind ILIKE ${p}) AND kind = ${kind}
              AND (expires_at IS NULL OR expires_at > NOW())
            ORDER BY created_at DESC LIMIT ${limit}
          `
        : await sql`
            SELECT id::text AS id, kind, content, created_at::text, expires_at::text
            FROM memories
            WHERE (content ILIKE ${p} OR kind ILIKE ${p})
              AND (expires_at IS NULL OR expires_at > NOW())
            ORDER BY created_at DESC LIMIT ${limit}
          `;
      return rows as unknown as MemoryRow[];
    },

    async memories(kind) {
      if (!await neonReady()) notConfigured();
      const sql = getNeonSql()!;
      const rows = kind
        ? await sql`
            SELECT id::text AS id, kind, content, created_at::text, expires_at::text
            FROM memories WHERE kind = ${kind} AND (expires_at IS NULL OR expires_at > NOW())
            ORDER BY created_at DESC
          `
        : await sql`
            SELECT id::text AS id, kind, content, created_at::text, expires_at::text
            FROM memories WHERE (expires_at IS NULL OR expires_at > NOW())
            ORDER BY kind, created_at DESC
          `;
      return rows as unknown as MemoryRow[];
    },

    async update(id, content) {
      if (!await neonReady()) notConfigured();
      const sql = getNeonSql()!;
      const rows = await sql`
        UPDATE memories SET content = ${content} WHERE id::text = ${id} RETURNING id
      `;
      return (rows as unknown as unknown[]).length > 0;
    },

    async forget(id) {
      if (!await neonReady()) notConfigured();
      const sql = getNeonSql()!;
      const rows = await sql`
        DELETE FROM memories WHERE id::text = ${id} RETURNING id
      `;
      return (rows as unknown as unknown[]).length > 0;
    },

    async forgetByQuery(query, kind) {
      if (!await neonReady()) notConfigured();
      const sql = getNeonSql()!;
      const p = `%${query}%`;
      const rows = kind
        ? await sql`
            SELECT id::text AS id, kind, content FROM memories
            WHERE (content ILIKE ${p} OR kind ILIKE ${p}) AND kind = ${kind}
            ORDER BY created_at DESC LIMIT 20
          `
        : await sql`
            SELECT id::text AS id, kind, content FROM memories
            WHERE content ILIKE ${p} OR kind ILIKE ${p}
            ORDER BY created_at DESC LIMIT 20
          `;
      return { rows: rows as unknown as Pick<MemoryRow, "id" | "kind" | "content">[] };
    },

    async deleteByIds(ids) {
      if (!await neonReady()) notConfigured();
      const sql = getNeonSql()!;
      const rows = await sql`DELETE FROM memories WHERE id::text = ANY(${ids}) RETURNING id`;
      return (rows as unknown as unknown[]).length;
    },

    async expireSoon(days, include_expired) {
      if (!await neonReady()) notConfigured();
      const sql = getNeonSql()!;
      const rows = include_expired
        ? await sql`
            SELECT id::text AS id, kind, content, created_at::text, expires_at::text
            FROM memories
            WHERE expires_at IS NOT NULL AND expires_at <= NOW() + (${days} || ' days')::interval
            ORDER BY expires_at ASC LIMIT 30
          `
        : await sql`
            SELECT id::text AS id, kind, content, created_at::text, expires_at::text
            FROM memories
            WHERE expires_at IS NOT NULL AND expires_at > NOW()
              AND expires_at <= NOW() + (${days} || ' days')::interval
            ORDER BY expires_at ASC LIMIT 30
          `;
      return rows as unknown as Array<MemoryRow & { expires_at: string }>;
    },

    async status() {
      if (!await neonReady()) notConfigured();
      const sql = getNeonSql()!;
      const counts = await sql`
        SELECT kind, COUNT(*)::int as total FROM memories GROUP BY kind ORDER BY total DESC
      `;
      const lastRows = await sql`
        SELECT content, kind, created_at::text FROM memories ORDER BY created_at DESC LIMIT 1
      `;
      return {
        counts: counts as unknown as KindCount[],
        last: (lastRows as unknown as Array<{ kind: string; content: string; created_at: string }>)[0],
      };
    },

    async profile() {
      if (!await neonReady()) notConfigured();
      const sql = getNeonSql()!;
      const rows = await sql`
        SELECT id, display_name, email FROM profiles WHERE id = 'santiago' LIMIT 1
      `;
      return ((rows as unknown as ProfileRow[])[0]) ?? null;
    },

    async relate(from_id, to_id, relation_type) {
      if (!await neonReady()) notConfigured();
      const sql = getNeonSql()!;
      const id = randomUUID();
      await sql`
        INSERT INTO relations (id, from_id, to_id, relation_type)
        VALUES (${id}, ${from_id}, ${to_id}, ${relation_type})
        ON CONFLICT (from_id, to_id, relation_type) DO NOTHING
      `;
    },

    async context(id) {
      if (!await neonReady()) notConfigured();
      const sql = getNeonSql()!;
      const memories = await sql`
        SELECT id::text AS id, kind, content, created_at::text, expires_at::text
        FROM memories WHERE id::text = ${id} LIMIT 1
      `;
      const memory = (memories as unknown as MemoryRow[])[0];
      if (!memory) return null;
      const related = await sql`
        SELECT m.id::text AS id, m.kind, m.content, r.relation_type, 'out'::text as direction
        FROM relations r JOIN memories m ON m.id::text = r.to_id WHERE r.from_id = ${id}
        UNION ALL
        SELECT m.id::text AS id, m.kind, m.content, r.relation_type, 'in'::text as direction
        FROM relations r JOIN memories m ON m.id::text = r.from_id WHERE r.to_id = ${id}
      `;
      return { memory, related: related as unknown as RelatedRow[] };
    },
  };
}
