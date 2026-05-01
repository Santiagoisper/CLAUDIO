import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { execFile } from "node:child_process";

const SAFE_COMMANDS = new Set(["git", "ls", "cat", "pwd", "echo", "which", "date", "whoami"]);
const SHELL_UNSAFE_ARG_PATTERN = /[;&|`$<>]/;

export function registerShellTools(server: McpServer) {
  // Deshabilitado por defecto; requiere opt-in explícito.
  if (process.env.CLAUDIO_ENABLE_SHELL !== "true") return;

  server.tool(
    "claudio_shell",
    "Ejecuta un comando de terminal en la máquina de Santiago. Solo comandos de la lista permitida.",
    {
      command: z.string().describe("Comando a ejecutar"),
      cwd: z.string().optional().describe("Directorio de trabajo (default: directorio actual)"),
    },
    async ({ command, cwd }) => {
      const parts = command.trim().split(/\s+/).filter(Boolean);
      if (parts.length === 0) {
        return {
          content: [{
            type: "text" as const,
            text: "Comando vacío.",
          }],
        };
      }

      const [executable, ...args] = parts;
      if (!SAFE_COMMANDS.has(executable)) {
        return {
          content: [{
            type: "text" as const,
            text: `Comando no permitido: "${executable}". Permitidos: ${Array.from(SAFE_COMMANDS).join(", ")}`,
          }],
        };
      }
      if (args.some(arg => SHELL_UNSAFE_ARG_PATTERN.test(arg))) {
        return {
          content: [{
            type: "text" as const,
            text: "Argumentos no permitidos: contiene metacaracteres peligrosos.",
          }],
        };
      }

      try {
        const output = await new Promise<string>((resolve, reject) => {
          execFile(executable, args, {
            cwd: cwd ?? process.cwd(),
            encoding: "utf-8",
            timeout: 10_000,
          }, (error, stdout, stderr) => {
            if (error) {
              const err = new Error(`Error (${(error as NodeJS.ErrnoException).name ?? "?"}): ${(error as Error).message}\n${stderr ?? ""}`.trim());
              reject(err);
              return;
            }
            resolve((stdout ?? "").toString());
          });
        });
        return { content: [{ type: "text" as const, text: output.trim() || "(sin output)" }] };
      } catch (e: any) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [{
            type: "text" as const,
            text: message.trim(),
          }],
        };
      }
    }
  );
}
