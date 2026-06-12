import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUNDLED = path.resolve(__dirname, "../../data/claudio.db");
const TMP_FALLBACK = "/tmp/claudio.db";

let _db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (!_db) {
    const preferredDbPath = process.env.CLAUDIO_DB_PATH
      ? path.resolve(process.env.CLAUDIO_DB_PATH)
      : BUNDLED;

    const ensureSeededDb = (dbPath: string) => {
      if (dbPath !== BUNDLED && !fs.existsSync(dbPath) && fs.existsSync(BUNDLED)) {
        fs.mkdirSync(path.dirname(dbPath), { recursive: true });
        fs.copyFileSync(BUNDLED, dbPath);
      }
    };

    const runMigrations = (db: DatabaseSync) => {
      // Add expires_at column if missing (migration for existing DBs)
      try {
        db.exec("ALTER TABLE memories ADD COLUMN expires_at TEXT");
      } catch {
        // Column already exists — safe to ignore
      }
    };

    const openDb = (dbPath: string) => {
      ensureSeededDb(dbPath);
      const db = new DatabaseSync(dbPath);
      db.exec("PRAGMA journal_mode = WAL");
      db.exec("PRAGMA foreign_keys = ON");
      runMigrations(db);
      return db;
    };

    try {
      _db = openDb(preferredDbPath);
    } catch (error) {
      if (preferredDbPath === TMP_FALLBACK) {
        throw error;
      }
      // Hosted free tiers sometimes deny custom volume paths; fall back to /tmp.
      // console.warn(
      //   `[CLAUDIO] Cannot use CLAUDIO_DB_PATH="${preferredDbPath}". Falling back to ${TMP_FALLBACK}.`,
      //   error instanceof Error ? error.message : String(error),
      // );
      _db = openDb(TMP_FALLBACK);
    }
  }
  return _db;
}

export async function loadSqliteVec(db: DatabaseSync): Promise<boolean> {
  try {
    const { load } = await import("sqlite-vec");
    load(db);
    return true;
  } catch {
    return false;
  }
}
