import { randomUUID } from "node:crypto";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import { callAiJson, type AiSelection } from "./ai.js";

const DOCUMENT_CHUNK_CHARS = Number(process.env.CLAUDIO_DOCUMENT_CHUNK_CHARS ?? 90_000);

export interface DocumentAnalysis {
  title: string;
  summary: string;
  keyIdeas: string[];
  importantFacts: string[];
  actionItems: string[];
  tags: string[];
  suggestedKind: string;
}

export interface AnalyzeDocumentInput {
  fileName: string;
  mimeType?: string;
  dataBase64?: string;
  dataBuffer?: Buffer;
  aiProvider?: AiSelection["provider"];
  aiModel?: string;
}

export interface DocumentAnalysisResult {
  id: string;
  fileName: string;
  mimeType: string;
  extractedCharCount: number;
  analyzedCharCount: number;
  chunkCount: number;
  extractedPreview: string;
  analysis: DocumentAnalysis;
  memoryContent: string;
}

export type DocumentProgressStage = "extracting" | "summarizing" | "synthesizing" | "complete";

export type DocumentProgress = (update: {
  progress: number;
  stage: DocumentProgressStage;
  message: string;
}) => void;

function cleanText(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getExtension(fileName: string): string {
  const match = /\.([^.]+)$/.exec(fileName.toLowerCase());
  return match?.[1] ?? "";
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return cleanText(result.text);
  } finally {
    await parser.destroy();
  }
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return cleanText(result.value);
}

async function extractText(input: AnalyzeDocumentInput): Promise<string> {
  const buffer = input.dataBuffer ?? Buffer.from(input.dataBase64 ?? "", "base64");
  if (buffer.byteLength === 0) throw new Error("El archivo esta vacio.");

  const extension = getExtension(input.fileName);
  const mimeType = input.mimeType ?? "";
  if (extension === "pdf" || mimeType === "application/pdf") {
    return extractPdfText(buffer);
  }
  if (
    extension === "docx" ||
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return extractDocxText(buffer);
  }
  if (extension === "txt" || mimeType.startsWith("text/") || mimeType === "") {
    return cleanText(buffer.toString("utf8"));
  }

  throw new Error("Formato no soportado. Subi un PDF, DOCX o TXT.");
}

function parseJsonObject(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const match = /\{[\s\S]*\}/.exec(text);
    if (!match) throw new Error("OpenAI no devolvio JSON valido.");
    return JSON.parse(match[0]);
  }
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim() !== "");
}

function chunkText(text: string, chunkSize: number): string[] {
  const chunks: string[] = [];
  for (let start = 0; start < text.length; start += chunkSize) {
    chunks.push(text.slice(start, start + chunkSize));
  }
  return chunks;
}

function normalizeAnalysis(value: unknown, fallbackTitle: string): DocumentAnalysis {
  const obj = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    title: typeof obj.title === "string" && obj.title.trim() ? obj.title.trim() : fallbackTitle,
    summary: typeof obj.summary === "string" ? obj.summary.trim() : "",
    keyIdeas: stringArray(obj.keyIdeas).slice(0, 8),
    importantFacts: stringArray(obj.importantFacts).slice(0, 10),
    actionItems: stringArray(obj.actionItems).slice(0, 8),
    tags: stringArray(obj.tags).map((tag) => tag.toLowerCase()).slice(0, 8),
    suggestedKind: typeof obj.suggestedKind === "string" && obj.suggestedKind.trim()
      ? obj.suggestedKind.trim().toLowerCase()
      : "documento",
  };
}

async function summarizeChunk(
  fileName: string,
  chunk: string,
  index: number,
  total: number,
  selection?: AiSelection,
): Promise<DocumentAnalysis> {
  const parsed = await callAiJson([
    {
      role: "system",
      content:
        "Sos CLAUDIO. Analiza un bloque de un documento largo. Responde solo JSON valido con: title, summary, keyIdeas, importantFacts, actionItems, tags, suggestedKind.",
    },
    {
      role: "user",
      content:
        `Archivo: ${fileName}\nBloque: ${index + 1} de ${total}\n\n` +
        "Resume este bloque con detalle suficiente para que otra pasada pueda reconstruir la idea completa del documento. " +
        "Inclui ideas, datos, acciones y etiquetas que aparezcan en este bloque. No inventes informacion.\n\n" +
        chunk,
    },
  ], selection);
  return normalizeAnalysis(parsed, `${fileName} - bloque ${index + 1}`);
}

async function synthesizeFinalAnalysis(
  fileName: string,
  partials: DocumentAnalysis[],
  selection?: AiSelection,
): Promise<DocumentAnalysis> {
  if (partials.length === 1) {
    return partials[0];
  }

  const partialText = partials.map((partial, index) => {
    const lines = [
      `Bloque ${index + 1}: ${partial.title}`,
      `Resumen: ${partial.summary}`,
      `Ideas: ${partial.keyIdeas.join("; ")}`,
      `Datos: ${partial.importantFacts.join("; ")}`,
      `Acciones: ${partial.actionItems.join("; ")}`,
      `Etiquetas: ${partial.tags.join(", ")}`,
    ];
    return lines.join("\n");
  }).join("\n\n---\n\n");

  const parsed = await callAiJson([
    {
      role: "system",
      content:
        "Sos CLAUDIO. Tenes resúmenes parciales de todo un documento. Integralos, elimina duplicados y genera una sintesis final. Responde solo JSON valido con: title, summary, keyIdeas, importantFacts, actionItems, tags, suggestedKind.",
    },
    {
      role: "user",
      content:
        `Archivo: ${fileName}\n\n` +
        "Estos son los resúmenes de todos los bloques del documento. Regurgitalos en una síntesis final coherente, completa y sin repeticiones. " +
        "No inventes informacion; si hay acciones o fechas, preservalas.\n\n" +
        partialText,
    },
  ], selection);

  return normalizeAnalysis(parsed, fileName);
}

async function analyzeWithOpenAI(
  fileName: string,
  text: string,
  selection?: AiSelection,
  onProgress?: DocumentProgress,
): Promise<{ analysis: DocumentAnalysis; chunkCount: number }> {
  const chunks = chunkText(text, DOCUMENT_CHUNK_CHARS);
  const partials: DocumentAnalysis[] = [];

  for (let index = 0; index < chunks.length; index += 1) {
    onProgress?.({
      progress: Math.max(2, Math.round((index / chunks.length) * 85)),
      stage: "summarizing",
      message: `Analizando bloque ${index + 1} de ${chunks.length}`,
    });
    partials.push(await summarizeChunk(fileName, chunks[index], index, chunks.length, selection));
    onProgress?.({
      progress: Math.max(2, Math.round(((index + 1) / chunks.length) * 85)),
      stage: "summarizing",
      message: `Bloque ${index + 1} de ${chunks.length} analizado`,
    });
  }

  onProgress?.({
    progress: 90,
    stage: "synthesizing",
    message: "Generando sintesis final",
  });
  const analysis = await synthesizeFinalAnalysis(fileName, partials, selection);
  return { analysis, chunkCount: chunks.length };
}

export function formatDocumentMemory(fileName: string, analysis: DocumentAnalysis): string {
  const lines = [
    `Documento: ${analysis.title || fileName}`,
    `Archivo: ${fileName}`,
    "",
    "Resumen:",
    analysis.summary,
  ];

  if (analysis.keyIdeas.length > 0) {
    lines.push("", "Ideas principales:", ...analysis.keyIdeas.map((idea) => `- ${idea}`));
  }
  if (analysis.importantFacts.length > 0) {
    lines.push("", "Datos importantes:", ...analysis.importantFacts.map((fact) => `- ${fact}`));
  }
  if (analysis.actionItems.length > 0) {
    lines.push("", "Acciones posibles:", ...analysis.actionItems.map((item) => `- ${item}`));
  }
  if (analysis.tags.length > 0) {
    lines.push("", `Etiquetas: ${analysis.tags.join(", ")}`);
  }

  return lines.join("\n").trim();
}

export async function analyzeDocument(
  input: AnalyzeDocumentInput,
  onProgress?: DocumentProgress,
): Promise<DocumentAnalysisResult> {
  if (!input.fileName || (!input.dataBase64 && !input.dataBuffer)) {
    throw new Error("Faltan fileName o datos del archivo.");
  }

  onProgress?.({
    progress: 1,
    stage: "extracting",
    message: "Extrayendo texto del documento",
  });
  const text = await extractText(input);
  if (!text) {
    throw new Error("No pude extraer texto del documento.");
  }

  onProgress?.({
    progress: 2,
    stage: "summarizing",
    message: "Texto extraido; iniciando analisis por bloques",
  });
  const { analysis, chunkCount } = await analyzeWithOpenAI(
    input.fileName,
    text,
    { provider: input.aiProvider, model: input.aiModel },
    onProgress,
  );
  onProgress?.({
    progress: 100,
    stage: "complete",
    message: "Analisis completo",
  });

  return {
    id: randomUUID(),
    fileName: input.fileName,
    mimeType: input.mimeType ?? "",
    extractedCharCount: text.length,
    analyzedCharCount: text.length,
    chunkCount,
    extractedPreview: text.slice(0, 1_200),
    analysis,
    memoryContent: formatDocumentMemory(input.fileName, analysis),
  };
}
