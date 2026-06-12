/**
 * Logger estructurado para CLAUDIO.
 *
 * En modo stdio (Claude Code local): escribe en stderr para no contaminar el
 * protocolo MCP que va por stdout.
 * En modo HTTP (Railway/Vercel): escribe en stderr también (stdout es para Express).
 *
 * Formato: JSON en una línea para facilitar grep/ingest en producción.
 * Niveles: info | warn | error
 */

export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  ts: string;
  level: LogLevel;
  msg: string;
  [key: string]: unknown;
}

function write(level: LogLevel, msg: string, extra?: Record<string, unknown>): void {
  const entry: LogEntry = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...extra,
  };
  process.stderr.write(JSON.stringify(entry) + "\n");
}

export const log = {
  info: (msg: string, extra?: Record<string, unknown>) => write("info", msg, extra),
  warn: (msg: string, extra?: Record<string, unknown>) => write("warn", msg, extra),
  error: (msg: string, extra?: Record<string, unknown>) => write("error", msg, extra),
};
