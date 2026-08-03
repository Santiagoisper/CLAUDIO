import { DatabaseSync } from "node:sqlite";

const schema = `
CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY, display_name TEXT NOT NULL, email TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, external_id TEXT NOT NULL,
  title TEXT NOT NULL, uri TEXT, metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY, profile_id TEXT, source_id TEXT, kind TEXT NOT NULL,
  content TEXT NOT NULL, metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(profile_id) REFERENCES profiles(id),
  FOREIGN KEY(source_id) REFERENCES sources(id)
);
CREATE TABLE IF NOT EXISTS snapshots (
  id TEXT PRIMARY KEY, source_id TEXT, source_kind TEXT NOT NULL,
  snapshot_path TEXT NOT NULL, metadata_json TEXT NOT NULL DEFAULT '{}',
  captured_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(source_id) REFERENCES sources(id)
);
CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories (created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sources_kind_external_id_unique ON sources (kind, external_id);
CREATE TABLE IF NOT EXISTS relations (
  id TEXT PRIMARY KEY, from_id TEXT NOT NULL, to_id TEXT NOT NULL,
  relation_type TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(from_id) REFERENCES memories(id) ON DELETE CASCADE,
  FOREIGN KEY(to_id) REFERENCES memories(id) ON DELETE CASCADE,
  UNIQUE(from_id, to_id, relation_type)
);
CREATE INDEX IF NOT EXISTS idx_relations_from ON relations (from_id);
CREATE INDEX IF NOT EXISTS idx_relations_to ON relations (to_id);
`;

/** Makes an empty durable volume usable on its first server start. */
export function ensureSqliteSchema(db: DatabaseSync): void {
  db.exec(schema);
  try {
    db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      content, kind, content='memories', content_rowid='rowid'
    )`);
    db.exec(`CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
      INSERT INTO memories_fts(rowid, content, kind) VALUES (new.rowid, new.content, new.kind);
    END`);
    db.exec(`CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, content, kind) VALUES('delete', old.rowid, old.content, old.kind);
    END`);
    db.exec(`CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, content, kind) VALUES('delete', old.rowid, old.content, old.kind);
      INSERT INTO memories_fts(rowid, content, kind) VALUES (new.rowid, new.content, new.kind);
    END`);
  } catch {
    // FTS is an optimization; the basic memory store remains available.
  }

  db.prepare(`INSERT OR IGNORE INTO profiles (id, display_name, email)
    VALUES ('santiago', 'Santiago Jorge Isbert Perlender', 'santiagoip1973@gmail.com')`).run();
  db.prepare("INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('version', '1')").run();
}
