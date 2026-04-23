import archiver from "archiver";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../");

function main() {
  const dbPath = process.env.CLAUDIO_DB_PATH
    ? path.resolve(process.env.CLAUDIO_DB_PATH)
    : path.join(root, "data", "claudio.db");

  if (!fs.existsSync(dbPath)) {
    console.error("No se encontró la base de datos:", dbPath);
    process.exit(1);
  }

  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const zipName = `claudio-memory-export-${ts}.zip`;
  const zipPath = path.join(root, zipName);

  const output = fs.createWriteStream(zipPath);
  const archive = archiver("zip", { zlib: { level: 9 } });

  output.on("close", () => console.log(`Exportado: ${zipName} (${archive.pointer()} bytes)`));
  archive.on("error", (err: Error) => { throw err; });
  archive.pipe(output);

  archive.append(JSON.stringify({
    exportedAt: new Date().toISOString(),
    repo: "CLAUDIO",
    files: ["data/claudio.db"],
  }, null, 2), { name: "manifest.json" });
  archive.file(dbPath, { name: "data/claudio.db" });
  archive.finalize();
}

main();
