#!/usr/bin/env node
/**
 * CLI unificada de CLAUDIO
 *
 * Uso:
 *   tsx tools/claudio.ts remember <kind> <content>
 *   tsx tools/claudio.ts recall <query> [--kind=<kind>] [--limit=<n>]
 *   tsx tools/claudio.ts forget <id>
 *   tsx tools/claudio.ts briefing
 *   tsx tools/claudio.ts status
 *
 * Variables de entorno:
 *   CLAUDIO_REMOTE_URL  — URL del servidor (default: https://claudio-production-759b.up.railway.app)
 *   CLAUDIO_TOKEN       — Token de autenticación (≥32 caracteres)
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

const BASE_URL = process.env.CLAUDIO_REMOTE_URL ?? "https://claudio-production-759b.up.railway.app";
const TOKEN = process.env.CLAUDIO_TOKEN;

const COMMANDS = ["remember", "recall", "forget", "briefing", "status"] as const;
type Command = typeof COMMANDS[number];

function printUsage(): void {
  console.error(`
CLAUDIO CLI

Uso:
  claudio remember <kind> <content>       Guarda un recuerdo
  claudio recall <query> [opciones]       Busca recuerdos
    --kind=<kind>                           Filtrar por categoría
    --limit=<n>                             Máximo de resultados (default: 10)
  claudio forget <id>                     Elimina un recuerdo por ID
  claudio briefing                        Muestra el briefing de sesión
  claudio status                          Estado del sistema

Variables de entorno requeridas:
  CLAUDIO_TOKEN       Token de autenticación (≥32 caracteres)
  CLAUDIO_REMOTE_URL  URL del servidor (opcional)
`.trim());
}

function parseFlags(args: string[]): { flags: Record<string, string>; positional: string[] } {
  const flags: Record<string, string> = {};
  const positional: string[] = [];
  for (const arg of args) {
    if (arg.startsWith("--")) {
      const [key, value] = arg.slice(2).split("=");
      flags[key] = value ?? "true";
    } else {
      positional.push(arg);
    }
  }
  return { flags, positional };
}

async function connectClient(): Promise<Client> {
  if (!TOKEN || TOKEN.length < 32) {
    console.error("Error: definí CLAUDIO_TOKEN (≥32 caracteres) en tu entorno.");
    process.exit(1);
  }
  const transport = new SSEClientTransport(new globalThis.URL(`${BASE_URL}/sse`), {
    requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
  });
  const client = new Client({ name: "claudio-cli", version: "1.0.0" });
  await client.connect(transport);
  return client;
}

function printResult(result: unknown): void {
  const content = (result as { content: Array<{ text: string }> }).content;
  console.log(content?.[0]?.text ?? JSON.stringify(result, null, 2));
}

const [,, command, ...rest] = process.argv;

if (!command || !COMMANDS.includes(command as Command)) {
  printUsage();
  process.exit(command ? 1 : 0);
}

const { flags, positional } = parseFlags(rest);
const client = await connectClient();

try {
  switch (command as Command) {
    case "remember": {
      const [kind, ...contentParts] = positional;
      const content = contentParts.join(" ");
      if (!kind || !content) {
        console.error("Uso: claudio remember <kind> <content>");
        process.exit(1);
      }
      printResult(await client.callTool({ name: "claudio_remember", arguments: { kind, content } }));
      break;
    }

    case "recall": {
      const [query] = positional;
      if (!query) {
        console.error("Uso: claudio recall <query> [--kind=<kind>] [--limit=<n>]");
        process.exit(1);
      }
      const args: Record<string, unknown> = { query, limit: flags.limit ? parseInt(flags.limit, 10) : 10 };
      if (flags.kind) args.kind = flags.kind;
      printResult(await client.callTool({ name: "claudio_recall", arguments: args }));
      break;
    }

    case "forget": {
      const [id] = positional;
      if (!id) {
        console.error("Uso: claudio forget <id>");
        process.exit(1);
      }
      printResult(await client.callTool({ name: "claudio_forget", arguments: { id } }));
      break;
    }

    case "briefing": {
      printResult(await client.callTool({ name: "claudio_briefing", arguments: {} }));
      break;
    }

    case "status": {
      printResult(await client.callTool({ name: "claudio_status", arguments: {} }));
      break;
    }
  }
} finally {
  await client.close();
}
