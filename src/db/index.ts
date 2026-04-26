import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUNDLED = path.resolve(__dirname, "../../data/claudio.db");

let _db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (!_db) {
    const dbPath = process.env.CLAUDIO_DB_PATH
      ? path.resolve(process.env.CLAUDIO_DB_PATH)
      : BUNDLED;

    // En Railway: si el volumen está vacío, arranca con la DB del repo
    if (dbPath !== BUNDLED && !fs.existsSync(dbPath) && fs.existsSync(BUNDLED)) {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      fs.copyFileSync(BUNDLED, dbPath);
    }

    _db = new DatabaseSync(dbPath);
    _db.exec("PRAGMA journal_mode = WAL");
    _db.exec("PRAGMA foreign_keys = ON");
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
