import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const schema = `
CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  email TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  uri TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  profile_id TEXT,
  source_id TEXT,
  kind TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(profile_id) REFERENCES profiles(id),
  FOREIGN KEY(source_id) REFERENCES sources(id)
);
CREATE TABLE IF NOT EXISTS snapshots (
  id TEXT PRIMARY KEY,
  source_id TEXT,
  source_kind TEXT NOT NULL,
  snapshot_path TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  captured_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(source_id) REFERENCES sources(id)
);
CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories (created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sources_kind_external_id_unique ON sources (kind, external_id);
CREATE TABLE IF NOT EXISTS relations (
  id TEXT PRIMARY KEY,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  relation_type TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(from_id) REFERENCES memories(id) ON DELETE CASCADE,
  FOREIGN KEY(to_id) REFERENCES memories(id) ON DELETE CASCADE,
  UNIQUE(from_id, to_id, relation_type)
);
CREATE INDEX IF NOT EXISTS idx_relations_from ON relations (from_id);
CREATE INDEX IF NOT EXISTS idx_relations_to ON relations (to_id);
`;

async function main() {
  const dbPath = process.env.CLAUDIO_DB_PATH
    ? path.resolve(process.env.CLAUDIO_DB_PATH)
    : path.resolve(__dirname, "../../data/claudio.db");

  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(schema);

  // FTS5 virtual table for full-text search
  try {
    db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      content,
      kind,
      content='memories',
      content_rowid='rowid'
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
    db.exec(`INSERT OR IGNORE INTO memories_fts(memories_fts) VALUES('rebuild')`);
  } catch (e) {
    console.warn("FTS5 no disponible, búsqueda full-text deshabilitada:", e);
  }

  // Vector table para búsqueda semántica (requiere sqlite-vec)
  try {
    const { load } = await import("sqlite-vec");
    load(db);
    db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS memories_vec USING vec0(
      memory_id TEXT PRIMARY KEY,
      embedding float[1536]
    )`);
    console.log("sqlite-vec cargado: búsqueda semántica habilitada.");
  } catch (e) {
    console.warn("sqlite-vec no disponible, búsqueda semántica deshabilitada:", e);
  }

  const profile = db.prepare("SELECT id FROM profiles WHERE id = 'santiago'").get();
  if (!profile) {
    db.prepare(`
      INSERT INTO profiles (id, display_name, email)
      VALUES ('santiago', 'Santiago Jorge Isbert Perlender', 'sisbert@cinme.com.ar')
    `).run();
    console.log("Perfil de Santiago creado.");
  }

  db.prepare("INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('version', '1')").run();
  console.log("Base inicializada correctamente.");
  db.close();
}

main();
