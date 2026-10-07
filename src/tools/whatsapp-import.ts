import { randomUUID } from "node:crypto";
import { getDb } from "../db/index.js";
import { ensureNeonSchema, getNeonSql } from "../db/neon.js";
import {
  analyzeText,
  formatAnalysisSections,
  type DocumentAnalysis,
  type DocumentProgress,
} from "./documents.js";
import type { AiSelection } from "./ai.js";
import { listWhatsappWatchContacts, type WhatsappWatchContact } from "./whatsapp.js";

const SYSTEM_SENDER = "Sistema";
const MEMORY_KIND = "whatsapp_chat";

export interface WhatsappMessage {
  /** ISO timestamp (UTC) derived from the export, or null if it could not be parsed. */
  timestamp: string | null;
  /** Original label as it appears in the export, e.g. "12/03/24, 10:05:00". */
  dateLabel: string;
  sender: string;
  text: string;
}

export interface ParsedWhatsappChat {
  messages: WhatsappMessage[];
  participants: string[];
  messageCountByParticipant: Record<string, number>;
  totalMessages: number;
  firstMessageAt: string | null;
  lastMessageAt: string | null;
}

export interface MatchedWatchContact {
  contactId: string;
  phone: string;
  label: string | null;
  participant: string;
  matchType: "phone" | "label";
}

export interface ImportWhatsappChatInput {
  fileName: string;
  dataBuffer?: Buffer;
  dataBase64?: string;
  aiProvider?: AiSelection["provider"];
  aiModel?: string;
}

export interface WhatsappChatImportResult {
  fileName: string;
  totalMessages: number;
  participants: string[];
  messageCountByParticipant: Record<string, number>;
  firstMessageAt: string | null;
  lastMessageAt: string | null;
  matchedWatchContacts: MatchedWatchContact[];
  analysis: DocumentAnalysis;
  memoryContent: string;
  memory: { id: string; kind: typeof MEMORY_KIND; savedAt: string };
}

const DATE_SOURCE = String.raw`\d{1,2}\/\d{1,2}\/\d{2,4}`;
const TIME_SOURCE = String.raw`\d{1,2}:\d{2}(?::\d{2})?(?:\s?[ap]\.?\s?m\.?)?`;

// iOS style:  [12/03/24, 10:05:00] Juan Perez: hola
const BRACKET_WITH_SENDER = new RegExp(
  String.raw`^\[(${DATE_SOURCE}),?\s+(${TIME_SOURCE})\]\s*(.+?):\s([\s\S]*)$`,
  "i",
);
// Android style:  12/03/24, 10:05 - Juan Perez: hola
const DASH_WITH_SENDER = new RegExp(
  String.raw`^(${DATE_SOURCE}),?\s+(${TIME_SOURCE})\s+[-–]\s+(.+?):\s([\s\S]*)$`,
  "i",
);
// Timestamped system notes without a sender (same two prefixes).
const BRACKET_SYSTEM = new RegExp(
  String.raw`^\[(${DATE_SOURCE}),?\s+(${TIME_SOURCE})\]\s*([\s\S]+)$`,
  "i",
);
const DASH_SYSTEM = new RegExp(
  String.raw`^(${DATE_SOURCE}),?\s+(${TIME_SOURCE})\s+[-–]\s+([\s\S]+)$`,
  "i",
);

/** Strips the invisible marks and odd spaces WhatsApp injects into exports. */
function normalizeExport(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[‎‏]/g, "")
    .replace(/[  ]/g, " ");
}

function parseDateParts(datePart: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(datePart.trim());
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = Number(match[3]);
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function parseClock(timePart: string): { hour: number; minute: number; second: number } | null {
  const cleaned = timePart.replace(/\s+/g, " ").trim().toLowerCase();
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s?([ap])\.?\s?m\.?)?$/.exec(cleaned);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = match[3] ? Number(match[3]) : 0;
  const meridiem = match[4];
  if (meridiem === "p" && hour < 12) hour += 12;
  if (meridiem === "a" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59 || second > 59) return null;
  return { hour, minute, second };
}

function toIso(datePart: string, timePart: string): string | null {
  const date = parseDateParts(datePart);
  if (!date) return null;
  const clock = parseClock(timePart) ?? { hour: 0, minute: 0, second: 0 };
  const parsed = new Date(
    Date.UTC(date.year, date.month - 1, date.day, clock.hour, clock.minute, clock.second),
  );
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

interface TimestampMatch {
  datePart: string;
  timePart: string;
  sender: string;
  text: string;
}

function matchTimestampLine(line: string): TimestampMatch | null {
  const withSender = BRACKET_WITH_SENDER.exec(line) ?? DASH_WITH_SENDER.exec(line);
  if (withSender) {
    return {
      datePart: withSender[1],
      timePart: withSender[2],
      sender: withSender[3].trim(),
      text: withSender[4],
    };
  }
  const system = BRACKET_SYSTEM.exec(line) ?? DASH_SYSTEM.exec(line);
  if (system) {
    return {
      datePart: system[1],
      timePart: system[2],
      sender: SYSTEM_SENDER,
      text: system[3],
    };
  }
  return null;
}

/**
 * Parses a WhatsApp "Exportar chat" .txt into structured messages. A line without a
 * fresh timestamp is treated as a continuation of the previous message, so multi-line
 * messages stay together. Supports the iOS bracket format and the Android dash format.
 */
export function parseWhatsappExport(rawText: string): ParsedWhatsappChat {
  const lines = normalizeExport(rawText).split("\n");
  const messages: WhatsappMessage[] = [];
  let pending: WhatsappMessage | null = null;

  const flush = () => {
    if (!pending) return;
    pending.text = pending.text.replace(/\s+$/, "");
    messages.push(pending);
    pending = null;
  };

  for (const line of lines) {
    const match = matchTimestampLine(line);
    if (match) {
      flush();
      pending = {
        timestamp: toIso(match.datePart, match.timePart),
        dateLabel: `${match.datePart}, ${match.timePart}`.trim(),
        sender: match.sender,
        text: match.text,
      };
      continue;
    }
    // Continuation of the current message; anything before the first timestamp is the
    // export header ("Los mensajes y llamadas están cifrados...") and is ignored.
    if (pending) {
      pending.text = pending.text.length > 0 ? `${pending.text}\n${line}` : line;
    }
  }
  flush();

  const participants: string[] = [];
  const messageCountByParticipant: Record<string, number> = {};
  for (const message of messages) {
    if (message.sender === SYSTEM_SENDER) continue;
    messageCountByParticipant[message.sender] = (messageCountByParticipant[message.sender] ?? 0) + 1;
    if (!participants.includes(message.sender)) participants.push(message.sender);
  }

  const timestamps = messages
    .map((message) => message.timestamp)
    .filter((value): value is string => value !== null)
    .sort();

  return {
    messages,
    participants,
    messageCountByParticipant,
    totalMessages: messages.length,
    firstMessageAt: timestamps[0] ?? null,
    lastMessageAt: timestamps[timestamps.length - 1] ?? null,
  };
}

export function buildWhatsappTranscript(chat: ParsedWhatsappChat): string {
  return chat.messages.map((message) => `[${message.dateLabel}] ${message.sender}: ${message.text}`).join("\n");
}

function formatCounts(counts: Record<string, number>): string {
  const entries = Object.entries(counts);
  if (entries.length === 0) return "sin datos";
  return entries.map(([name, count]) => `${name}: ${count}`).join(", ");
}

function buildAnalysisContext(chat: ParsedWhatsappChat): string {
  return [
    "Es una conversación de WhatsApp exportada, no un documento formal.",
    `Participantes (${chat.participants.length}): ${chat.participants.join(", ") || "no detectados"}.`,
    `Período cubierto: ${chat.firstMessageAt ?? "desconocido"} a ${chat.lastMessageAt ?? "desconocido"}.`,
    `Mensajes totales: ${chat.totalMessages} (${formatCounts(chat.messageCountByParticipant)}).`,
    "Resumí de qué hablaron, los temas tratados, los datos importantes y los pendientes o acciones si los hay. " +
      "No repitas el transcript ni cites mensajes textuales largos.",
  ].join(" ");
}

/**
 * Same shape as a document memory but headed with the chat context: participants,
 * date range and message counts. Only this AI summary is persisted; the raw transcript
 * is never stored (it contains third-party messages).
 */
export function formatWhatsappChatMemory(
  fileName: string,
  chat: ParsedWhatsappChat,
  analysis: DocumentAnalysis,
): string {
  return [
    `Conversación de WhatsApp: ${analysis.title || fileName}`,
    `Archivo: ${fileName}`,
    `Participantes (${chat.participants.length}): ${chat.participants.join(", ") || "no detectados"}`,
    `Período: ${chat.firstMessageAt ?? "desconocido"} a ${chat.lastMessageAt ?? "desconocido"}`,
    `Mensajes: ${chat.totalMessages} (${formatCounts(chat.messageCountByParticipant)})`,
    "",
    ...formatAnalysisSections(analysis),
  ].join("\n").trim();
}

function digitsOf(value: string): string {
  return value.replace(/\D/g, "");
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Best-effort link between participants and previously saved watch contacts. Matches by
 * phone digits when the export exposes a number, otherwise by approximate name/label.
 */
export function matchWatchContacts(
  participants: string[],
  contacts: WhatsappWatchContact[],
): MatchedWatchContact[] {
  const matched: MatchedWatchContact[] = [];
  for (const participant of participants) {
    const participantDigits = digitsOf(participant);
    const participantName = normalizeName(participant);
    const byPhone =
      participantDigits.length >= 8
        ? contacts.find((contact) => {
            if (contact.phone.length < 8) return false;
            return (
              contact.phone === participantDigits ||
              participantDigits.endsWith(contact.phone) ||
              contact.phone.endsWith(participantDigits)
            );
          })
        : undefined;
    const contact =
      byPhone ??
      contacts.find((candidate) => {
        const label = normalizeName(candidate.label ?? "");
        if (label.length < 4 || participantName.length < 4) return false;
        return label === participantName || participantName.includes(label) || label.includes(participantName);
      });
    if (!contact) continue;
    matched.push({
      contactId: contact.id,
      phone: contact.phone,
      label: contact.label,
      participant,
      matchType: byPhone ? "phone" : "label",
    });
  }
  return matched;
}

function safeListWatchContacts(): WhatsappWatchContact[] {
  try {
    return listWhatsappWatchContacts();
  } catch {
    return [];
  }
}

export interface SavedWhatsappMemory {
  id: string;
  savedAt: string;
}

export async function saveWhatsappChatMemory(input: {
  content: string;
  metadata: Record<string, unknown>;
}): Promise<SavedWhatsappMemory> {
  const id = randomUUID();
  const savedAt = new Date().toISOString();
  const metadataJson = JSON.stringify({ ...input.metadata, savedAt });

  const neonSql = getNeonSql();
  if (neonSql) {
    await ensureNeonSchema();
    await neonSql`
      INSERT INTO memories (id, profile_id, kind, domain, content, metadata_json)
      VALUES (${id}::uuid, 'santiago', ${MEMORY_KIND}, 'personal', ${input.content}, ${metadataJson}::jsonb)
    `;
    return { id, savedAt };
  }

  getDb().prepare(`
    INSERT INTO memories (id, profile_id, kind, content, metadata_json)
    VALUES (?, 'santiago', ?, ?, ?)
  `).run(id, MEMORY_KIND, input.content, metadataJson);
  return { id, savedAt };
}

export async function importWhatsappChat(
  input: ImportWhatsappChatInput,
  onProgress?: DocumentProgress,
): Promise<WhatsappChatImportResult> {
  const buffer = input.dataBuffer ?? Buffer.from(input.dataBase64 ?? "", "base64");
  if (buffer.byteLength === 0) throw new Error("El archivo esta vacio.");

  const chat = parseWhatsappExport(buffer.toString("utf8"));
  if (chat.messages.length === 0) {
    throw new Error(
      'No pude detectar mensajes de WhatsApp. Exportá el chat como .txt (sin multimedia) desde "Exportar chat".',
    );
  }

  onProgress?.({
    progress: 2,
    stage: "summarizing",
    message: `${chat.totalMessages} mensajes de ${chat.participants.length} participantes; iniciando analisis`,
  });

  const { analysis } = await analyzeText({
    fileName: input.fileName,
    text: buildWhatsappTranscript(chat),
    context: buildAnalysisContext(chat),
    selection: { provider: input.aiProvider, model: input.aiModel },
    onProgress,
  });

  const matchedWatchContacts = matchWatchContacts(chat.participants, safeListWatchContacts());
  const memoryContent = formatWhatsappChatMemory(input.fileName, chat, analysis);
  const saved = await saveWhatsappChatMemory({
    content: memoryContent,
    metadata: {
      source: "whatsapp_export",
      fileName: input.fileName,
      participants: chat.participants,
      firstMessageAt: chat.firstMessageAt,
      lastMessageAt: chat.lastMessageAt,
      totalMessages: chat.totalMessages,
      messageCountByParticipant: chat.messageCountByParticipant,
      matchedWatchContacts: matchedWatchContacts.map((match) => ({
        phone: match.phone,
        label: match.label,
        participant: match.participant,
        matchType: match.matchType,
      })),
      tags: analysis.tags,
    },
  });

  onProgress?.({ progress: 100, stage: "complete", message: "Analisis completo" });

  return {
    fileName: input.fileName,
    totalMessages: chat.totalMessages,
    participants: chat.participants,
    messageCountByParticipant: chat.messageCountByParticipant,
    firstMessageAt: chat.firstMessageAt,
    lastMessageAt: chat.lastMessageAt,
    matchedWatchContacts,
    analysis,
    memoryContent,
    memory: { id: saved.id, kind: MEMORY_KIND, savedAt: saved.savedAt },
  };
}
