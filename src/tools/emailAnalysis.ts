import { randomUUID } from "node:crypto";
import { callAiJson, type AiSelection } from "./ai.js";
import {
  getGoogleAccessToken,
  hasGoogleAccount,
  type GoogleAccount,
} from "./google.js";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
// 20 mensajes mantiene cada prompt dentro de un tamaño seguro y evita que una
// semana normal se convierta en decenas de llamadas secuenciales al modelo.
const EMAIL_BATCH_SIZE = Number(process.env.CLAUDIO_EMAIL_BATCH_SIZE ?? 20);
const MAX_BODY_CHARS_PER_EMAIL = Number(
  process.env.CLAUDIO_EMAIL_BODY_CHARS ?? 900,
);
const EMAIL_FETCH_CONCURRENCY = Number(process.env.CLAUDIO_EMAIL_FETCH_CONCURRENCY ?? 6);
const GMAIL_TIMEOUT_MS = Number(process.env.CLAUDIO_GMAIL_TIMEOUT_MS ?? 20_000);

export type EmailRange =
  | "last_day"
  | "last_messages"
  | "last_week"
  | "last_month"
  | "last_6_months"
  | "last_year"
  | "all";
export type EmailProgressStage =
  | "listing"
  | "fetching"
  | "analyzing"
  | "synthesizing"
  | "complete";

export interface EmailAnalysisInput {
  range: EmailRange;
  account?: GoogleAccount;
  aiProvider?: AiSelection["provider"];
  aiModel?: string;
}

export interface EmailProgressUpdate {
  progress: number;
  stage: EmailProgressStage;
  message: string;
}

export type EmailProgress = (update: EmailProgressUpdate) => void;

interface GmailMessageListItem {
  id: string;
  threadId: string;
}

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailPayload;
}

interface GmailPayload {
  mimeType?: string;
  body?: { data?: string };
  headers?: Array<{ name: string; value: string }>;
  parts?: GmailPayload[];
}

export interface EmailDigest {
  id: string;
  threadId: string;
  direction: "sent" | "received" | "mixed";
  date: string;
  from: string;
  to: string;
  subject: string;
  snippet: string;
  body: string;
}

export interface EmailAnalysisResult {
  id: string;
  account: GoogleAccount;
  range: EmailRange;
  query: string;
  messageCount: number;
  sentCount: number;
  receivedCount: number;
  threadCount: number;
  analyzedAt: string;
  analysis: {
    executiveSummary: string;
    behaviorPatterns: string[];
    communicationStyle: string[];
    priorityThemes: string[];
    urgentItems: string[];
    awaitingYourReply: string[];
    waitingOnOthers: string[];
    keyPeople: string[];
    projectsAndTopics: string[];
    risks: string[];
    opportunities: string[];
    suggestedActions: string[];
    tags: string[];
  };
}

function queryForRange(range: EmailRange): {
  query: string;
  maxMessages?: number;
} {
  switch (range) {
    case "last_day":
      return { query: "in:anywhere newer_than:1d" };
    case "last_messages":
      return { query: "in:anywhere", maxMessages: 50 };
    case "last_week":
      return { query: "in:anywhere newer_than:7d", maxMessages: 150 };
    case "last_month":
      return { query: "in:anywhere newer_than:30d" };
    case "last_6_months":
      return { query: "in:anywhere newer_than:180d" };
    case "last_year":
      return { query: "in:anywhere newer_than:365d" };
    case "all":
      return { query: "in:anywhere" };
  }
}

async function gmailFetch<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${GMAIL_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(GMAIL_TIMEOUT_MS),
  });
  if (!res.ok)
    throw new Error(`Gmail API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function listMessages(
  token: string,
  query: string,
  maxMessages?: number,
  onProgress?: EmailProgress,
) {
  const messages: GmailMessageListItem[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(`${GMAIL_API}/messages`);
    url.searchParams.set("q", query);
    url.searchParams.set("maxResults", "500");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const path = `${url.pathname}${url.search}`;
    const data = await gmailFetch<{
      messages?: GmailMessageListItem[];
      nextPageToken?: string;
    }>(token, path.replace("/gmail/v1/users/me", ""));
    messages.push(...(data.messages ?? []));
    pageToken = data.nextPageToken;
    onProgress?.({
      progress: 3,
      stage: "listing",
      message: `Encontrados ${messages.length} mails`,
    });
    if (maxMessages && messages.length >= maxMessages) break;
  } while (pageToken);
  return maxMessages ? messages.slice(0, maxMessages) : messages;
}

function decodeBase64Url(data: string): string {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

function header(payload: GmailPayload | undefined, name: string): string {
  const found = payload?.headers?.find(
    (item) => item.name.toLowerCase() === name.toLowerCase(),
  );
  return found?.value ?? "";
}

function extractPayloadText(payload?: GmailPayload): string {
  if (!payload) return "";
  const ownText =
    payload.body?.data &&
    (payload.mimeType?.startsWith("text/plain") ||
      payload.mimeType?.startsWith("text/html"))
      ? decodeBase64Url(payload.body.data)
      : "";
  const childText =
    payload.parts?.map(extractPayloadText).filter(Boolean).join("\n") ?? "";
  return `${ownText}\n${childText}`
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function digestMessage(message: GmailMessage): EmailDigest {
  const labels = new Set(message.labelIds ?? []);
  const direction = labels.has("SENT")
    ? "sent"
    : labels.has("INBOX")
      ? "received"
      : "mixed";
  const body = extractPayloadText(message.payload).slice(
    0,
    MAX_BODY_CHARS_PER_EMAIL,
  );
  return {
    id: message.id,
    threadId: message.threadId,
    direction,
    date:
      header(message.payload, "Date") ||
      (message.internalDate
        ? new Date(Number(message.internalDate)).toISOString()
        : ""),
    from: header(message.payload, "From"),
    to: header(message.payload, "To"),
    subject: header(message.payload, "Subject") || "(sin asunto)",
    snippet: message.snippet ?? "",
    body,
  };
}

function chunkEmails(emails: EmailDigest[]): EmailDigest[][] {
  const chunks: EmailDigest[][] = [];
  for (let i = 0; i < emails.length; i += EMAIL_BATCH_SIZE)
    chunks.push(emails.slice(i, i + EMAIL_BATCH_SIZE));
  return chunks;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is string =>
          typeof item === "string" && item.trim() !== "",
      )
    : [];
}

function normalizeFinalAnalysis(
  value: unknown,
): EmailAnalysisResult["analysis"] {
  const obj =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return {
    executiveSummary:
      typeof obj.executiveSummary === "string" ? obj.executiveSummary : "",
    behaviorPatterns: asStringArray(obj.behaviorPatterns),
    communicationStyle: asStringArray(obj.communicationStyle),
    priorityThemes: asStringArray(obj.priorityThemes),
    urgentItems: asStringArray(obj.urgentItems),
    awaitingYourReply: asStringArray(obj.awaitingYourReply),
    waitingOnOthers: asStringArray(obj.waitingOnOthers),
    keyPeople: asStringArray(obj.keyPeople),
    projectsAndTopics: asStringArray(obj.projectsAndTopics),
    risks: asStringArray(obj.risks),
    opportunities: asStringArray(obj.opportunities),
    suggestedActions: asStringArray(obj.suggestedActions),
    tags: asStringArray(obj.tags).map((tag) => tag.toLowerCase()),
  };
}

function formatEmailBatch(emails: EmailDigest[]): string {
  return emails
    .map((email, index) =>
      [
        `#${index + 1}`,
        `Direccion: ${email.direction}`,
        `Fecha: ${email.date}`,
        `De: ${email.from}`,
        `Para: ${email.to}`,
        `Asunto: ${email.subject}`,
        `Snippet: ${email.snippet}`,
        `Texto: ${email.body}`,
      ].join("\n"),
    )
    .join("\n\n---\n\n");
}

async function analyzeEmailBatch(
  emails: EmailDigest[],
  batchIndex: number,
  totalBatches: number,
  selection?: AiSelection,
): Promise<unknown> {
  return callAiJson(
    [
      {
        role: "system",
        content:
          "Sos CLAUDIO analizando correo de Santiago. Analiza recibidos y enviados. Responde solo JSON valido y TODO el contenido textual en español claro con: summary, behaviorPatterns, communicationStyle, priorityThemes, urgentItems, awaitingYourReply, waitingOnOthers, keyPeople, projectsAndTopics, risks, opportunities, suggestedActions, tags.",
      },
      {
        role: "user",
        content:
          `Lote ${batchIndex + 1} de ${totalBatches}. Analiza profundamente estos mails. ` +
          "Distingui comportamientos de Santiago en enviados, demandas externas en recibidos y compromisos pendientes. No inventes. Escribi todos los hallazgos en español, aunque los mails estén en inglés.\n\n" +
          formatEmailBatch(emails),
      },
    ],
    selection,
  );
}

async function synthesizeEmailAnalysis(
  partials: unknown[],
  range: EmailRange,
  selection?: AiSelection,
): Promise<EmailAnalysisResult["analysis"]> {
  const parsed = await callAiJson(
    [
      {
        role: "system",
        content:
          "Sos CLAUDIO. Tenes analisis parciales de correo de Santiago. Integra todo en un diagnostico profundo, accionable y prudente. Responde solo JSON valido y TODO el contenido textual en español claro con: executiveSummary, behaviorPatterns, communicationStyle, priorityThemes, urgentItems, awaitingYourReply, waitingOnOthers, keyPeople, projectsAndTopics, risks, opportunities, suggestedActions, tags.",
      },
      {
        role: "user",
        content:
          `Rango analizado: ${range}\n\n` +
          "Sintetiza estos analisis parciales en español. Priorizá: qué requiere respuesta, qué espera Santiago de otros, patrones de comportamiento, temas repetidos, riesgos y acciones concretas. Si los parciales están en inglés, traducilos y normalizalos al español.\n\n" +
          JSON.stringify(partials).slice(0, 120_000),
      },
    ],
    selection,
  );
  return normalizeFinalAnalysis(parsed);
}

export async function analyzeEmail(
  input: EmailAnalysisInput,
  onProgress?: EmailProgress,
): Promise<EmailAnalysisResult> {
  const account = input.account ?? "personal";
  if (!hasGoogleAccount(account))
    throw new Error(`Falta configurar la cuenta Google '${account}'.`);
  const token = await getGoogleAccessToken(account);
  const { query, maxMessages } = queryForRange(input.range);
  const selection = { provider: input.aiProvider, model: input.aiModel };

  onProgress?.({ progress: 1, stage: "listing", message: "Buscando mails" });
  const refs = await listMessages(token, query, maxMessages, onProgress);
  if (refs.length === 0)
    throw new Error("No se encontraron mails para ese rango.");

  let fetched = 0;
  let activeFetches = 0;
  const emails = await Promise.all(refs.map(async (ref) => {
    // El pequeño pool evita una espera secuencial de cientos de requests.
    while (activeFetches >= EMAIL_FETCH_CONCURRENCY) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    activeFetches += 1;
    try {
      const msg = await gmailFetch<GmailMessage>(token, `/messages/${ref.id}?format=full`);
      return digestMessage(msg);
    } finally {
      activeFetches -= 1;
      fetched += 1;
      if (fetched % 10 === 0 || fetched === refs.length) {
      onProgress?.({
        progress: 5 + Math.round((fetched / refs.length) * 45),
        stage: "fetching",
        message: `Leyendo mails ${fetched} de ${refs.length}`,
      });
    }
    }
  }));

  const batches = chunkEmails(emails);
  const partials: unknown[] = [];
  for (let i = 0; i < batches.length; i += 1) {
    onProgress?.({
      progress: 50 + Math.round((i / batches.length) * 35),
      stage: "analyzing",
      message: `Analizando lote ${i + 1} de ${batches.length}`,
    });
    partials.push(
      await analyzeEmailBatch(batches[i], i, batches.length, selection),
    );
  }

  onProgress?.({
    progress: 92,
    stage: "synthesizing",
    message: "Generando sintesis final",
  });
  const analysis = await synthesizeEmailAnalysis(
    partials,
    input.range,
    selection,
  );
  const sentCount = emails.filter((email) => email.direction === "sent").length;
  const receivedCount = emails.filter(
    (email) => email.direction === "received",
  ).length;

  onProgress?.({
    progress: 100,
    stage: "complete",
    message: "Analisis completo",
  });
  return {
    id: randomUUID(),
    account,
    range: input.range,
    query,
    messageCount: emails.length,
    sentCount,
    receivedCount,
    threadCount: new Set(emails.map((email) => email.threadId)).size,
    analyzedAt: new Date().toISOString(),
    analysis,
  };
}
