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
        id UUID PRIMARY KEY,
        profile_id TEXT,
        source_id TEXT,
        kind TEXT NOT NULL,
        domain TEXT NOT NULL DEFAULT 'personal',
        subdomain TEXT,
        summary TEXT,
        salience DOUBLE PRECISION NOT NULL DEFAULT 0.5,
        confidence DOUBLE PRECISION NOT NULL DEFAULT 1,
        state TEXT NOT NULL DEFAULT 'active',
        visibility TEXT NOT NULL DEFAULT 'assistant',
        sensitivity TEXT NOT NULL DEFAULT 'medium',
        cross_domain_policy TEXT NOT NULL DEFAULT 'forbidden',
        occurred_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ,
        embedding_status TEXT NOT NULL DEFAULT 'pending',
        embedding_attempt_count INTEGER NOT NULL DEFAULT 0,
        embedding_next_attempt_at TIMESTAMPTZ,
        embedding_model TEXT,
        embedding_dimensions INTEGER,
        embedding_updated_at TIMESTAMPTZ,
        embedding_error JSONB,
        content TEXT NOT NULL,
        metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await sql`ALTER TABLE memories ADD COLUMN IF NOT EXISTS domain TEXT NOT NULL DEFAULT 'personal'`;
    await sql`ALTER TABLE memories ADD COLUMN IF NOT EXISTS subdomain TEXT`;
    await sql`ALTER TABLE memories ADD COLUMN IF NOT EXISTS summary TEXT`;
    await sql`ALTER TABLE memories ADD COLUMN IF NOT EXISTS salience DOUBLE PRECISION NOT NULL DEFAULT 0.5`;
    await sql`ALTER TABLE memories ADD COLUMN IF NOT EXISTS confidence DOUBLE PRECISION NOT NULL DEFAULT 1`;
    await sql`ALTER TABLE memories ADD COLUMN IF NOT EXISTS state TEXT NOT NULL DEFAULT 'active'`;
    await sql`ALTER TABLE memories ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'assistant'`;
    await sql`ALTER TABLE memories ADD COLUMN IF NOT EXISTS sensitivity TEXT NOT NULL DEFAULT 'medium'`;
    await sql`ALTER TABLE memories ADD COLUMN IF NOT EXISTS cross_domain_policy TEXT NOT NULL DEFAULT 'forbidden'`;
    await sql`ALTER TABLE memories ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMPTZ`;
    await sql`ALTER TABLE memories ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ`;
    await sql`ALTER TABLE memories ADD COLUMN IF NOT EXISTS embedding_status TEXT NOT NULL DEFAULT 'pending'`;
    await sql`ALTER TABLE memories ADD COLUMN IF NOT EXISTS embedding_attempt_count INTEGER NOT NULL DEFAULT 0`;
    await sql`ALTER TABLE memories ADD COLUMN IF NOT EXISTS embedding_next_attempt_at TIMESTAMPTZ`;
    await sql`ALTER TABLE memories ADD COLUMN IF NOT EXISTS embedding_model TEXT`;
    await sql`ALTER TABLE memories ADD COLUMN IF NOT EXISTS embedding_dimensions INTEGER`;
    await sql`ALTER TABLE memories ADD COLUMN IF NOT EXISTS embedding_updated_at TIMESTAMPTZ`;
    await sql`ALTER TABLE memories ADD COLUMN IF NOT EXISTS embedding_error JSONB`;

    await sql`
      CREATE TABLE IF NOT EXISTS relations (
        id TEXT PRIMARY KEY,
        from_id TEXT NOT NULL,
        to_id TEXT NOT NULL,
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
      VALUES ('santiago', 'Santiago Jorge Isbert Perlender', 'santiagoip1973@gmail.com')
      ON CONFLICT (id) DO UPDATE
      SET email = EXCLUDED.email, updated_at = NOW()
      WHERE profiles.email = 'sisbert@cinme.com.ar'
    `;

    _schemaReady = true;
  })().finally(() => {
    _schemaInitPromise = null;
  });

  await _schemaInitPromise;
  return true;
}
