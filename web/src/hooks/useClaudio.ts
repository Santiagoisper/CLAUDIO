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

function normalizeBaseUrl(url: string): string {
  const t = url.trim();
  return t.endsWith("/") ? t.slice(0, -1) : t;
}

function readAuthToken(configToken: string): string {
  if (typeof window === "undefined") return "";
  return (
    localStorage.getItem("claudio_token") ||
    configToken ||
    import.meta.env.VITE_CLAUDIO_TOKEN ||
    ""
  );
}

export function useClaudio() {
  const { config } = useClaudioConfig();
  const apiUrl = normalizeBaseUrl(
    config.apiUrl || import.meta.env.VITE_CLAUDIO_API_URL || "http://localhost:3737",
  );

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
            ...(token && { Authorization: `Bearer ${token}` }),
            "mcp-session-id": `session-${Date.now()}`,
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: Math.random(),
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

        const data = await response.json();
        return data.result?.data || null;
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
    getBriefing,
    checkConnection,
  };
}
