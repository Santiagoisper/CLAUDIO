import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { execSync } from "node:child_process";

// Lista blanca de prefijos de comandos permitidos
const ALLOWED_PREFIXES = [
  "git ", "ls ", "ls\n", "cat ", "pwd", "echo ",
  "node ", "pnpm ", "npm ", "which ", "date", "whoami",
];

export function registerShellTools(server: McpServer) {
  // Solo registrar en modo local (sin PORT — no exponer en Railway)
  if (process.env.PORT) return;

  server.tool(
    "claudio_shell",
    "Ejecuta un comando de terminal en la máquina de Santiago. Solo comandos de la lista permitida.",
    {
      command: z.string().describe("Comando a ejecutar"),
      cwd: z.string().optional().describe("Directorio de trabajo (default: directorio actual)"),
    },
    async ({ command, cwd }) => {
      const allowed = ALLOWED_PREFIXES.some(p =>
        command.trim() === p.trim() || command.trim().startsWith(p)
      );
      if (!allowed) {
        return {
          content: [{
            type: "text" as const,
            text: `Comando no permitido: "${command.trim()}"\nComandos permitidos: ${ALLOWED_PREFIXES.map(p => p.trim()).join(", ")}`,
          }],
        };
      }
      try {
        const output = execSync(command, {
          cwd: cwd ?? process.cwd(),
          encoding: "utf-8",
          timeout: 10_000,
        });
        return { content: [{ type: "text" as const, text: output.trim() || "(sin output)" }] };
      } catch (e: any) {
        return {
          content: [{
            type: "text" as const,
            text: `Error (${e.status ?? "?"}): ${e.message}\n${e.stderr ?? ""}`.trim(),
          }],
        };
      }
    }
  );
}
