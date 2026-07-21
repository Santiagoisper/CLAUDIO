import { useState, useCallback, useEffect } from "react";
import { useClaudioConfig } from "@/contexts/ClaudioContext";

export interface Memory {
  id: string;
  kind: string;
  content: string;
  created_at: string;
  metadata_json?: string;
}

export interface ClaudioResponse<T> {
  content: Array<{ type: string; text: string }>;
  data?: T;
}

export interface DocumentAnalysis {
  title: string;
  summary: string;
  keyIdeas: string[];
  importantFacts: string[];
  actionItems: string[];
  tags: string[];
  suggestedKind: string;
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

export interface DocumentAnalyzeProgress {
  status: "queued" | "running" | "complete" | "error";
  progress: number;
  stage: string;
  message: string;
}

interface DocumentAnalyzeJob extends DocumentAnalyzeProgress {
  id: string;
  result?: DocumentAnalysisResult;
  error?: string;
}

export type EmailRange = "last_day" | "last_messages" | "last_week" | "last_month" | "last_6_months" | "last_year" | "all";
export type AiProvider = "openai" | "groq" | "deepseek" | "anthropic" | "gemini" | "ollama";

export interface AiSelection {
  provider: AiProvider;
  model: string;
}

export interface EmailAnalyzeProgress {
  status: "queued" | "running" | "complete" | "error";
  progress: number;
  stage: string;
  message: string;
}

export interface EmailAnalysisResult {
  id: string;
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

interface EmailAnalyzeJob extends EmailAnalyzeProgress {
  id: string;
  result?: EmailAnalysisResult;
  error?: string;
}

function normalizeBaseUrl(url: string): string {
  const t = url.trim();
  return t.endsWith("/") ? t.slice(0, -1) : t;
}

/** Base del API: env Vite > mismo origen en prod > localhost dev (Vite en :3000). */
function defaultApiBase(): string {
  const env = import.meta.env.VITE_CLAUDIO_API_URL;
  if (typeof env === "string" && env.trim() !== "") {
    return env.trim();
  }
  if (import.meta.env.PROD && typeof window !== "undefined") {
    return window.location.origin;
  }
  return "http://localhost:3737";
}

function readAuthToken(configToken: string): string {
  if (typeof window === "undefined") return "";
  const envToken = import.meta.env.VITE_CLAUDIO_TOKEN;
  const storedToken = localStorage.getItem("claudio_token");
  return storedToken || configToken || (typeof envToken === "string" ? envToken : "") || "";
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  if (!contentType.includes("application/json")) {
    const head = text.slice(0, 120).replace(/\s+/g, " ");
    throw new Error(`Respuesta no JSON desde ${response.url}: ${head || response.statusText}`);
  }
  return JSON.parse(text) as T;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function uploadDocumentFile(
  apiUrl: string,
  token: string,
  file: File,
  aiSelection: AiSelection,
  onProgress?: (progress: DocumentAnalyzeProgress) => void,
): Promise<DocumentAnalyzeJob> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${apiUrl}/api/documents/analyze-upload`);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
    xhr.setRequestHeader("X-Mime-Type", file.type || "");
    xhr.setRequestHeader("X-AI-Provider", aiSelection.provider);
    xhr.setRequestHeader("X-AI-Model", encodeURIComponent(aiSelection.model));
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) {
        onProgress?.({
          status: "queued",
          progress: 1,
          stage: "uploading",
          message: "Subiendo archivo",
        });
        return;
      }
      const uploadProgress = Math.max(1, Math.min(10, Math.round((event.loaded / event.total) * 10)));
      onProgress?.({
        status: "queued",
        progress: uploadProgress,
        stage: "uploading",
        message: `Subiendo archivo ${uploadProgress * 10}%`,
      });
    };

    xhr.onerror = () => reject(new Error("No pude subir el archivo"));
    xhr.onload = () => {
      const contentType = xhr.getResponseHeader("content-type") || "";
      if (!contentType.includes("application/json")) {
        reject(new Error(`Respuesta no JSON desde ${apiUrl}: ${xhr.responseText.slice(0, 120).replace(/\s+/g, " ")}`));
        return;
      }
      const payload = JSON.parse(xhr.responseText) as DocumentAnalyzeJob | { error?: string };
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error("error" in payload && payload.error ? payload.error : `HTTP ${xhr.status}`));
        return;
      }
      resolve(payload as DocumentAnalyzeJob);
    };

    xhr.send(file);
  });
}

export function useClaudio() {
  const { config } = useClaudioConfig();
  const apiUrl = normalizeBaseUrl(config.apiUrl || defaultApiBase());

  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const checkConnection = useCallback(async () => {
    try {
      const response = await fetch(`${apiUrl}/health`);
      setIsConnected(response.ok);
    } catch {
      setIsConnected(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  const callMcpTool = useCallback(
    async <T,>(toolName: string, params: Record<string, unknown>): Promise<T | null> => {
      try {
        setLoading(true);
        setError(null);

        const token = readAuthToken(config.token);

        const response = await fetch(`${apiUrl}/mcp`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
            "mcp-protocol-version": "2025-03-26",
            ...(token && { Authorization: `Bearer ${token}` }),
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            // MCP: id debe ser string o entero (Math.random() es float → 400 Invalid JSON-RPC).
            id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Date.now(),
            method: "tools/call",
            params: {
              name: toolName,
              arguments: params,
            },
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await readJsonResponse<{
          result?: { structuredContent?: unknown; data?: unknown; isError?: boolean };
          error?: { message?: string };
        }>(response);
        if (data.error) {
          throw new Error(data.error.message || "Error JSON-RPC");
        }
        const r = data.result;
        if (r?.isError) {
          throw new Error("La herramienta devolvió error");
        }
        // MCP usa `structuredContent`; el panel antiguo esperaba `data`.
        const payload = (r?.structuredContent ?? r?.data) as T | null | undefined;
        return payload ?? null;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Error desconocido";
        setError(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [apiUrl, config.token],
  );

  const fetchMemories = useCallback(
    async (kind?: string) => {
      try {
        setLoading(true);
        setError(null);

        const result = await callMcpTool<{ memories: Memory[] }>("claudio_memories", {
          ...(kind && { kind }),
          limit: 50,
        });

        if (result?.memories) {
          setMemories(result.memories);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Error al cargar memorias";
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [callMcpTool]
  );

  const searchMemories = useCallback(
    async (query: string, kind?: string) => {
      try {
        setLoading(true);
        setError(null);

        const result = await callMcpTool<{ memories: Memory[] }>("claudio_recall", {
          query,
          ...(kind && { kind }),
          limit: 50,
        });

        if (result?.memories) {
          setMemories(result.memories);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Error en búsqueda";
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [callMcpTool]
  );

  const createMemory = useCallback(
    async (kind: string, content: string, metadata?: Record<string, unknown>) => {
      try {
        setLoading(true);
        setError(null);

        const result = await callMcpTool<Memory>("claudio_remember", {
          kind,
          content,
          ...(metadata && { metadata }),
        });

        if (result) {
          setMemories((prev) => [result, ...prev]);
          return result;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Error al crear recuerdo";
        setError(message);
      } finally {
        setLoading(false);
      }
      return null;
    },
    [callMcpTool]
  );

  const updateMemory = useCallback(
    async (id: string, content: string) => {
      try {
        setLoading(true);
        setError(null);

        await callMcpTool("claudio_update", { id, content });

        setMemories((prev) =>
          prev.map((m) => (m.id === id ? { ...m, content } : m))
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Error al actualizar";
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [callMcpTool]
  );

  const deleteMemory = useCallback(
    async (id: string) => {
      try {
        setLoading(true);
        setError(null);

        await callMcpTool("claudio_forget", { id });

        setMemories((prev) => prev.filter((m) => m.id !== id));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Error al eliminar";
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [callMcpTool]
  );

  const analyzeDocument = useCallback(
    async (
      file: File,
      aiSelection: AiSelection,
      onProgress?: (progress: DocumentAnalyzeProgress) => void,
    ): Promise<DocumentAnalysisResult | null> => {
      try {
        setLoading(true);
        setError(null);
        onProgress?.({
          status: "queued",
          progress: 0,
          stage: "reading",
          message: "Preparando archivo",
        });

        const token = readAuthToken(config.token);
        const startPayload = await uploadDocumentFile(apiUrl, token, file, aiSelection, onProgress);
        const jobId = startPayload.id;
        if (!jobId) throw new Error("El servidor no devolvio jobId de analisis");

        for (;;) {
          await wait(900);
          const statusResponse = await fetch(`${apiUrl}/api/documents/analyze/${jobId}`, {
            headers: {
              ...(token && { Authorization: `Bearer ${token}` }),
            },
          });
          const job = await readJsonResponse<DocumentAnalyzeJob | { error?: string }>(statusResponse);
          if (!statusResponse.ok) {
            throw new Error("error" in job && job.error ? job.error : `HTTP ${statusResponse.status}`);
          }
          const progressJob = job as DocumentAnalyzeJob;
          onProgress?.({
            status: progressJob.status,
            progress: progressJob.progress,
            stage: progressJob.stage,
            message: progressJob.message,
          });
          if (progressJob.status === "complete") {
            if (!progressJob.result) throw new Error("Analisis completo sin resultado");
            return progressJob.result;
          }
          if (progressJob.status === "error") {
            throw new Error(progressJob.error || "Error al analizar documento");
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Error al analizar documento";
        setError(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [apiUrl, config.token],
  );

  const analyzeEmail = useCallback(
    async (
      range: EmailRange,
      aiSelection: AiSelection,
      onProgress?: (progress: EmailAnalyzeProgress) => void,
    ): Promise<EmailAnalysisResult | null> => {
      try {
        setLoading(true);
        setError(null);
        onProgress?.({
          status: "queued",
          progress: 0,
          stage: "queued",
          message: "Iniciando analisis de correo",
        });

        const token = readAuthToken(config.token);
        const startResponse = await fetch(`${apiUrl}/api/email/analyze`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token && { Authorization: `Bearer ${token}` }),
          },
          body: JSON.stringify({ range, aiProvider: aiSelection.provider, aiModel: aiSelection.model }),
        });
        const startPayload = await readJsonResponse<EmailAnalyzeJob | { error?: string }>(startResponse);
        if (!startResponse.ok) {
          throw new Error("error" in startPayload && startPayload.error ? startPayload.error : `HTTP ${startResponse.status}`);
        }
        const jobId = (startPayload as EmailAnalyzeJob).id;
        if (!jobId) throw new Error("El servidor no devolvio jobId de correo");

        for (;;) {
          await wait(1200);
          const statusResponse = await fetch(`${apiUrl}/api/email/analyze/${jobId}`, {
            headers: {
              ...(token && { Authorization: `Bearer ${token}` }),
            },
          });
          const job = await readJsonResponse<EmailAnalyzeJob | { error?: string }>(statusResponse);
          if (!statusResponse.ok) {
            throw new Error("error" in job && job.error ? job.error : `HTTP ${statusResponse.status}`);
          }
          const progressJob = job as EmailAnalyzeJob;
          onProgress?.({
            status: progressJob.status,
            progress: progressJob.progress,
            stage: progressJob.stage,
            message: progressJob.message,
          });
          if (progressJob.status === "complete") {
            if (!progressJob.result) throw new Error("Analisis de correo completo sin resultado");
            return progressJob.result;
          }
          if (progressJob.status === "error") {
            throw new Error(progressJob.error || "Error al analizar correo");
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Error al analizar correo";
        setError(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [apiUrl, config.token],
  );

  const getBriefing = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const result = await callMcpTool<{ briefing: string }>("claudio_briefing", {});
      return result?.briefing || null;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al obtener briefing";
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [callMcpTool]);

  return {
    memories,
    loading,
    error,
    isConnected,
    fetchMemories,
    searchMemories,
    createMemory,
    updateMemory,
    deleteMemory,
    analyzeDocument,
    analyzeEmail,
    getBriefing,
    checkConnection,
  };
}
