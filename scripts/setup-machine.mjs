#!/usr/bin/env node
/**
 * Bootstrap reproducible para una máquina nueva.
 * No descarga, imprime ni copia secretos: crea .env únicamente desde .env.example.
 */
import { chmodSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const command = process.platform === "win32" ? (name) => `${name}.cmd` : (name) => name;

function run(name, args) {
  execFileSync(command(name), args, { cwd: root, stdio: "inherit" });
}

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (!Number.isInteger(nodeMajor) || nodeMajor < 22) {
  console.error(`CLAUDIO requiere Node.js 22 o superior. Detectado: ${process.version}`);
  process.exit(1);
}

const envPath = path.join(root, ".env");
const examplePath = path.join(root, ".env.example");
if (!existsSync(examplePath)) {
  console.error("No se encontró .env.example; no es seguro crear un entorno sin plantilla.");
  process.exit(1);
}

mkdirSync(path.join(root, "data"), { recursive: true });
if (!existsSync(envPath)) {
  copyFileSync(examplePath, envPath);
  if (process.platform !== "win32") chmodSync(envPath, 0o600);
  console.log("Se creó .env desde .env.example. Completá tus credenciales localmente antes de usar integraciones.");
} else {
  console.log("Se preservó el .env existente.");
}

run("corepack", ["enable"]);
run("corepack", ["prepare", "pnpm@10.16.1", "--activate"]);
run("pnpm", ["install", "--frozen-lockfile"]);
run("pnpm", ["build"]);

console.log("\nCLAUDIO quedó instalado y compilado.");
console.log("Siguiente paso: revisá .env y ejecutá 'pnpm dev' para uso local, o abrí la URL de Railway para uso remoto.");
