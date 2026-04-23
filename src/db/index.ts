import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let _db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (!_db) {
    const dbPath = process.env.CLAUDIO_DB_PATH
      ? path.resolve(process.env.CLAUDIO_DB_PATH)
      : path.resolve(__dirname, "../../data/claudio.db");
    _db = new DatabaseSync(dbPath);
    _db.exec("PRAGMA journal_mode = WAL");
    _db.exec("PRAGMA foreign_keys = ON");
  }
  return _db;
}
