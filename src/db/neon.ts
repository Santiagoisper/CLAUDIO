import "dotenv/config";
import { neon } from "@neondatabase/serverless";

type NeonSql = ReturnType<typeof neon>;

let _sql: NeonSql | null | undefined;
let _schemaReady = false;
let _schemaInitPromise: Promise<void> | null = null;

function getNeonUrl(): string | null {
  const raw = process.env.DATABASE_URL?.trim() || process.env.NEON_DATABASE_URL?.trim();
  return raw || null;
}

export function getNeonSql(): NeonSql | null {
  if (_sql !== undefined) return _sql;
  const url = getNeonUrl();
  _sql = url ? neon(url) : null;
  return _sql;
}

export async function ensureNeonSchema(): Promise<boolean> {
  const sql = getNeonSql();
  if (!sql) return false;
  if (_schemaReady) return true;
  if (_schemaInitPromise) {
    await _schemaInitPromise;
    return true;
  }

  _schemaInitPromise = (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        email TEXT,
        metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        profile_id TEXT,
        source_id TEXT,
        kind TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS relations (
        id TEXT PRIMARY KEY,
        from_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
        to_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
        relation_type TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(from_id, to_id, relation_type)
      )
    `;

    await sql`CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories (created_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_memories_kind_created_at ON memories (kind, created_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_relations_from ON relations (from_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_relations_to ON relations (to_id)`;

    await sql`
      INSERT INTO profiles (id, display_name, email)
      VALUES ('santiago', 'Santiago Jorge Isbert Perlender', 'sisbert@cinme.com.ar')
      ON CONFLICT (id) DO NOTHING
    `;

    _schemaReady = true;
  })().finally(() => {
    _schemaInitPromise = null;
  });

  await _schemaInitPromise;
  return true;
}
