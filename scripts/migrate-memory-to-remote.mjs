#!/usr/bin/env node
/**
 * Migra la memoria local al servidor remoto por HTTPS.
 * Requiere un CLAUDIO_MIGRATION_TOKEN temporal; no imprime contenido ni secretos.
 */
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

const args = process.argv.slice(2);
const remoteFlagIndex = args.indexOf("--remote");
const remoteRaw = remoteFlagIndex >= 0 ? args[remoteFlagIndex + 1] : process.env.CLAUDIO_REMOTE_URL;
const migrationToken = process.env.CLAUDIO_MIGRATION_TOKEN;

if (!remoteRaw || !migrationToken || migrationToken.length < 32) {
  console.error("Usá --remote https://... y definí un CLAUDIO_MIGRATION_TOKEN temporal de al menos 32 caracteres.");
  process.exit(1);
}

let remote;
try {
  remote = new URL(remoteRaw);
  if (remote.protocol !== "https:" && remote.hostname !== "localhost" && remote.hostname !== "127.0.0.1") {
    throw new Error("La migración remota exige HTTPS.");
  }
  remote.username = "";
  remote.password = "";
} catch (error) {
  console.error(error instanceof Error ? error.message : "URL remota inválida.");
  process.exit(1);
}

const dbPath = path.resolve(process.env.CLAUDIO_DB_PATH || "./data/claudio.db");
const db = new DatabaseSync(dbPath, { readOnly: true });
const tables = {
  profiles: ["id", "display_name", "email", "metadata_json", "created_at", "updated_at"],
  sources: ["id", "kind", "external_id", "title", "uri", "metadata_json", "created_at"],
  memories: ["id", "profile_id", "source_id", "kind", "content", "metadata_json", "created_at"],
  snapshots: ["id", "source_id", "source_kind", "snapshot_path", "metadata_json", "captured_at"],
  relations: ["id", "from_id", "to_id", "relation_type", "created_at"],
  whatsapp_watch_contacts: ["id", "phone", "label", "created_at"],
};

try {
  let copied = 0;
  for (const [table, columns] of Object.entries(tables)) {
    const rows = db.prepare(`SELECT ${columns.join(", ")} FROM ${table}`).all();
    let inserted = 0;
    for (let offset = 0; offset < rows.length; offset += 100) {
      const records = rows.slice(offset, offset + 100);
      const response = await fetch(new URL("/api/admin/memory-import", remote), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CLAUDIO-Migration-Token": migrationToken,
        },
        body: JSON.stringify({ table, records }),
      });
      if (!response.ok) throw new Error(`Falló ${table}: HTTP ${response.status}`);
      const result = await response.json();
      inserted += Number(result.inserted) || 0;
    }
    copied += inserted;
    console.log(`${table}: ${inserted}/${rows.length} registros nuevos`);
  }
  console.log(`Migración finalizada: ${copied} registros nuevos.`);
} finally {
  db.close();
}
