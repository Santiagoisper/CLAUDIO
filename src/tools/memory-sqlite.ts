import { randomUUID } from "node:crypto";
import { getDb } from "../db/index.js";
import { log } from "../logger.js";
import type { MemoryAdapter, MemoryRow, RelatedRow, ProfileRow, KindCount } from "./memory-adapter.js";

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

async function maybeStoreEmbedding(id: string, content: string): Promise<void> {
  if (!process.env.OPENAI_API_KEY) return;
  try {
    const embedding = await embed(content);
    const db = getDb();
    db.prepare("INSERT OR REPLACE INTO memories_vec (memory_id, embedding) VALUES (?, ?)")
      .run(id, JSON.stringify(embedding));
  } catch (error) {
    log.error("Error storing embedding", { error: String(error) });
  }
}

export const sqliteAdapter: MemoryAdapter = {
  async remember(kind, content, metadata, ttl_days) {
    const db = getDb();
    const id = randomUUID();
    const expires_at = ttl_days
      ? new Date(Date.now() + ttl_days * 86_400_000).toISOString().replace("T", " ").slice(0, 19)
      : null;
    db.prepare(`
      INSERT INTO memories (id, profile_id, kind, content, metadata_json, expires_at)
      VALUES (?, 'santiago', ?, ?, ?, ?)
    `).run(id, kind, content, JSON.stringify(metadata ?? {}), expires_at);
    if (process.env.OPENAI_API_KEY) {
      maybeStoreEmbedding(id, content).catch(console.error);
    }
    return db.prepare(
      "SELECT id, kind, content, created_at, expires_at FROM memories WHERE id = ?"
    ).get(id) as unknown as MemoryRow & { expires_at: string | null };
  },

  async recall(query, kind, limit = 10) {
    const db = getDb();
    const notExpired = "(m.expires_at IS NULL OR m.expires_at > datetime('now'))";
    try {
      if (kind) {
        return db.prepare(`
          SELECT m.id, m.kind, m.content, m.created_at, m.expires_at
          FROM memories_fts f JOIN memories m ON m.rowid = f.rowid
          WHERE memories_fts MATCH ? AND m.kind = ? AND ${notExpired}
          ORDER BY rank LIMIT ?
        `).all(query, kind, limit) as unknown as MemoryRow[];
      }
      return db.prepare(`
        SELECT m.id, m.kind, m.content, m.created_at, m.expires_at
        FROM memories_fts f JOIN memories m ON m.rowid = f.rowid
        WHERE memories_fts MATCH ? AND ${notExpired}
        ORDER BY rank LIMIT ?
      `).all(query, limit) as unknown as MemoryRow[];
    } catch (error) {
      log.warn("FTS5 query failed, falling back to LIKE", { error: String(error) });
      const p = `%${query}%`;
      const notExpiredM = "(expires_at IS NULL OR expires_at > datetime('now'))";
      if (kind) {
        return db.prepare(`
          SELECT id, kind, content, created_at, expires_at FROM memories
          WHERE (content LIKE ? OR kind LIKE ?) AND kind = ? AND ${notExpiredM}
          ORDER BY created_at DESC LIMIT ?
        `).all(p, p, kind, limit) as unknown as MemoryRow[];
      }
      return db.prepare(`
        SELECT id, kind, content, created_at, expires_at FROM memories
        WHERE (content LIKE ? OR kind LIKE ?) AND ${notExpiredM}
        ORDER BY created_at DESC LIMIT ?
      `).all(p, p, limit) as unknown as MemoryRow[];
    }
  },

  async memories(kind) {
    const db = getDb();
    const notExpired = "(expires_at IS NULL OR expires_at > datetime('now'))";
    if (kind) {
      return db.prepare(`
        SELECT id, kind, content, created_at, expires_at FROM memories
        WHERE kind = ? AND ${notExpired} ORDER BY created_at DESC
      `).all(kind) as unknown as MemoryRow[];
    }
    return db.prepare(`
      SELECT id, kind, content, created_at, expires_at FROM memories
      WHERE ${notExpired} ORDER BY kind, created_at DESC
    `).all() as unknown as MemoryRow[];
  },

  async update(id, content) {
    const db = getDb();
    return getDb().prepare("UPDATE memories SET content = ? WHERE id = ?").run(content, id).changes > 0;
  },

  async forget(id) {
    return getDb().prepare("DELETE FROM memories WHERE id = ?").run(id).changes > 0;
  },

  async forgetByQuery(query, kind) {
    const db = getDb();
    const p = `%${query}%`;
    if (kind) {
      return {
        rows: db.prepare(`
          SELECT id, kind, content FROM memories
          WHERE (content LIKE ? OR kind LIKE ?) AND kind = ?
          ORDER BY created_at DESC LIMIT 20
        `).all(p, p, kind) as Pick<MemoryRow, "id" | "kind" | "content">[],
      };
    }
    return {
      rows: db.prepare(`
        SELECT id, kind, content FROM memories
        WHERE content LIKE ? OR kind LIKE ?
        ORDER BY created_at DESC LIMIT 20
      `).all(p, p) as Pick<MemoryRow, "id" | "kind" | "content">[],
    };
  },

  async deleteByIds(ids) {
    const db = getDb();
    const placeholders = ids.map(() => "?").join(", ");
    return Number(db.prepare(`DELETE FROM memories WHERE id IN (${placeholders})`).run(...ids).changes);
  },

  async expireSoon(days, include_expired) {
    const db = getDb();
    if (include_expired) {
      return db.prepare(`
        SELECT id, kind, content, created_at, expires_at FROM memories
        WHERE expires_at IS NOT NULL AND expires_at <= datetime('now', '+' || ? || ' days')
        ORDER BY expires_at ASC LIMIT 30
      `).all(days) as unknown as Array<MemoryRow & { expires_at: string }>;
    }
    return db.prepare(`
      SELECT id, kind, content, created_at, expires_at FROM memories
      WHERE expires_at IS NOT NULL
        AND expires_at > datetime('now')
        AND expires_at <= datetime('now', '+' || ? || ' days')
      ORDER BY expires_at ASC LIMIT 30
    `).all(days) as unknown as Array<MemoryRow & { expires_at: string }>;
  },

  async status() {
    const db = getDb();
    return {
      counts: db.prepare(
        "SELECT kind, COUNT(*) as total FROM memories GROUP BY kind ORDER BY total DESC"
      ).all() as unknown as KindCount[],
      last: db.prepare(
        "SELECT content, kind, created_at FROM memories ORDER BY created_at DESC LIMIT 1"
      ).get() as { kind: string; content: string; created_at: string } | undefined,
    };
  },

  async profile() {
    return getDb().prepare("SELECT * FROM profiles WHERE id = 'santiago'").get() as unknown as ProfileRow | null;
  },

  async relate(from_id, to_id, relation_type) {
    const id = randomUUID();
    getDb().prepare(`
      INSERT OR IGNORE INTO relations (id, from_id, to_id, relation_type)
      VALUES (?, ?, ?, ?)
    `).run(id, from_id, to_id, relation_type);
  },

  async context(id) {
    const db = getDb();
    const memory = db.prepare("SELECT id, kind, content, created_at, expires_at FROM memories WHERE id = ?").get(id) as MemoryRow | undefined;
    if (!memory) return null;
    const related = db.prepare(`
      SELECT m.id, m.kind, m.content, r.relation_type, 'out' as direction
      FROM relations r JOIN memories m ON m.id = r.to_id WHERE r.from_id = ?
      UNION ALL
      SELECT m.id, m.kind, m.content, r.relation_type, 'in' as direction
      FROM relations r JOIN memories m ON m.id = r.from_id WHERE r.to_id = ?
    `).all(id, id) as unknown as RelatedRow[];
    return { memory, related };
  },
};
