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
`;

function main() {
  const dbPath = process.env.CLAUDIO_DB_PATH
    ? path.resolve(process.env.CLAUDIO_DB_PATH)
    : path.resolve(__dirname, "../../data/claudio.db");

  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(schema);

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
