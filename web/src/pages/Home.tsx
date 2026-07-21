/**
 * CLAUDIO Panel - Página Principal
 * 
 * Diseño: Minimalismo Técnico
 * - Sidebar fijo izquierdo con navegación
 * - Contenido principal con dos columnas (lista + detalle)
 * - Tipografía: Serif para títulos, Monospace para datos
 * - Paleta: Blanco, negro, azul técnico
 * 
 * Conectado al servidor MCP CLAUDIO real
 */

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Menu, X, Plus, Search, Brain, Settings, LogOut, Loader2, AlertCircle, Lock, FileText, Upload, Save, Mail } from "lucide-react";
import { useClaudio, type AiProvider, type AiSelection, type DocumentAnalysisResult, type DocumentAnalyzeProgress, type EmailAnalysisResult, type EmailAnalyzeProgress, type EmailRange, type Memory } from "@/hooks/useClaudio";
import { useClaudioConfig } from "@/contexts/ClaudioContext";
import { toast } from "sonner";

const AI_MODEL_PRESETS: Record<AiProvider, string[]> = {
  openai: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini"],
  groq: ["llama-3.3-70b-versatile", "deepseek-r1-distill-llama-70b", "qwen/qwen3-32b", "openai/gpt-oss-120b"],
  deepseek: ["deepseek-chat", "deepseek-reasoner"],
  anthropic: ["claude-3-5-haiku-latest", "claude-sonnet-4-5", "claude-haiku-4-5"],
  gemini: ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro"],
  ollama: ["llama3.1:8b", "llama3.1:70b", "qwen2.5:14b", "deepseek-r1:14b", "mistral:7b"],
};

export default function Home() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [newMemoryKind, setNewMemoryKind] = useState("nota");
  const [newMemoryContent, setNewMemoryContent] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [showTokenForm, setShowTokenForm] = useState(false);
  const [section, setSection] = useState<"memoria" | "documentos" | "correo" | "configuracion">("memoria");
  const [settingsUrl, setSettingsUrl] = useState("");
  const [settingsToken, setSettingsToken] = useState("");
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentResult, setDocumentResult] = useState<DocumentAnalysisResult | null>(null);
  const [documentMemoryContent, setDocumentMemoryContent] = useState("");
  const [documentKind, setDocumentKind] = useState("documento");
  const [documentProgress, setDocumentProgress] = useState<DocumentAnalyzeProgress | null>(null);
  const [emailRange, setEmailRange] = useState<EmailRange>("last_day");
  const [emailProgress, setEmailProgress] = useState<EmailAnalyzeProgress | null>(null);
  const [emailResult, setEmailResult] = useState<EmailAnalysisResult | null>(null);
  const [emailMemoryContent, setEmailMemoryContent] = useState("");
  const [aiProvider, setAiProvider] = useState<AiProvider>("openai");
  const [aiModel, setAiModel] = useState("gpt-4o-mini");

  const { memories, loading, error, isConnected, fetchMemories, searchMemories, createMemory, updateMemory, deleteMemory, analyzeDocument, analyzeEmail, checkConnection } = useClaudio();
  const { config, saveConfig } = useClaudioConfig();

  useEffect(() => {
    setSettingsUrl(config.apiUrl);
    setSettingsToken(localStorage.getItem("claudio_token") || config.token || "");
  }, [config.apiUrl, config.token, section]);

  // Verificar si hay token guardado
  useEffect(() => {
    const savedToken = localStorage.getItem('claudio_token');
    if (!savedToken) {
      setShowTokenForm(true);
    }
  }, []);

  // Cargar memorias al montar el componente
  useEffect(() => {
    if (isConnected) {
      fetchMemories();
    }
  }, [isConnected, fetchMemories]);

  // Seleccionar la primera memoria cuando se carguen
  useEffect(() => {
    if (memories.length > 0 && !selectedMemory) {
      setSelectedMemory(memories[0]);
    }
  }, [memories, selectedMemory]);

  const handleSetToken = () => {
    if (tokenInput.trim()) {
      localStorage.setItem('claudio_token', tokenInput.trim());
      saveConfig(config.apiUrl, tokenInput.trim());
      setShowTokenForm(false);
      setTokenInput("");
      window.location.reload();
    } else {
      toast.error("Ingresa un token válido");
    }
  };

  const handleSaveSettings = () => {
    const url = settingsUrl.trim();
    const tok = settingsToken.trim();
    if (!url) {
      toast.error("La URL del API no puede estar vacía");
      return;
    }
    saveConfig(url.replace(/\/$/, ""), tok);
    if (tok) localStorage.setItem("claudio_token", tok);
    else localStorage.removeItem("claudio_token");
    toast.success("Configuración guardada");
    void checkConnection();
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (query.trim()) {
      searchMemories(query);
    } else {
      fetchMemories();
    }
  };

  const handleAddMemory = async () => {
    if (!newMemoryContent.trim()) {
      toast.error("El contenido no puede estar vacío");
      return;
    }

    const memory = await createMemory(newMemoryKind, newMemoryContent);
    if (memory) {
      toast.success("Recuerdo creado");
      setNewMemoryContent("");
      setNewMemoryKind("nota");
      setShowNewForm(false);
      setSelectedMemory(memory);
    } else {
      toast.error(error || "Error al crear recuerdo");
    }
  };

  const handleEditMemory = async (id: string) => {
    if (!editContent.trim()) {
      toast.error("El contenido no puede estar vacío");
      return;
    }

    await updateMemory(id, editContent);
    if (!error) {
      toast.success("Recuerdo actualizado");
      setEditingId(null);
      setSelectedMemory((prev) =>
        prev && prev.id === id ? { ...prev, content: editContent } : prev
      );
    } else {
      toast.error(error);
    }
  };

  const handleDeleteMemory = async (id: string) => {
    if (!confirm("¿Eliminar este recuerdo?")) return;

    await deleteMemory(id);
    if (!error) {
      toast.success("Recuerdo eliminado");
      if (selectedMemory?.id === id) {
        setSelectedMemory(memories.find((m) => m.id !== id) || null);
      }
    } else {
      toast.error(error);
    }
  };

  const handleAnalyzeDocument = async () => {
    if (!documentFile) {
      toast.error("Seleccioná un PDF, DOCX o TXT");
      return;
    }
    setDocumentResult(null);
    setDocumentMemoryContent("");
    setDocumentProgress({
      status: "queued",
      progress: 0,
      stage: "reading",
      message: "Leyendo archivo",
    });
    const result = await analyzeDocument(documentFile, { provider: aiProvider, model: aiModel }, setDocumentProgress);
    if (!result) {
      toast.error(error || "Error al analizar documento");
      return;
    }
    setDocumentResult(result);
    setDocumentMemoryContent(result.memoryContent);
    setDocumentKind(result.analysis.suggestedKind || "documento");
    setDocumentProgress({
      status: "complete",
      progress: 100,
      stage: "complete",
      message: "Documento analizado",
    });
    toast.success("Documento analizado");
  };

  const handleSaveDocumentMemory = async () => {
    if (!documentResult || !documentMemoryContent.trim()) {
      toast.error("No hay resumen para guardar");
      return;
    }
    const memory = await createMemory(documentKind || "documento", documentMemoryContent, {
      source: "document_upload",
      fileName: documentResult.fileName,
      mimeType: documentResult.mimeType,
      extractedCharCount: documentResult.extractedCharCount,
      analyzedCharCount: documentResult.analyzedCharCount,
      chunkCount: documentResult.chunkCount,
      tags: documentResult.analysis.tags,
    });
    if (memory) {
      toast.success("Resumen guardado en memoria");
      setSelectedMemory(memory);
      setSection("memoria");
    } else {
      toast.error(error || "No pude guardar el resumen");
    }
  };

  const handleAnalyzeEmail = async () => {
    setEmailResult(null);
    setEmailMemoryContent("");
    setEmailProgress({
      status: "queued",
      progress: 0,
      stage: "queued",
      message: "Iniciando analisis de correo",
    });
    const result = await analyzeEmail(emailRange, { provider: aiProvider, model: aiModel }, setEmailProgress);
    if (!result) {
      toast.error(error || "No pude analizar el correo");
      return;
    }
    setEmailResult(result);
    setEmailMemoryContent(formatEmailMemory(result));
    setEmailProgress({
      status: "complete",
      progress: 100,
      stage: "complete",
      message: "Analisis completo",
    });
    toast.success("Correo analizado");
  };

  const handleSaveEmailMemory = async () => {
    if (!emailResult || !emailMemoryContent.trim()) {
      toast.error("No hay análisis para guardar");
      return;
    }
    const memory = await createMemory("analisis_correo", emailMemoryContent, {
      source: "gmail_analysis",
      range: emailResult.range,
      query: emailResult.query,
      messageCount: emailResult.messageCount,
      sentCount: emailResult.sentCount,
      receivedCount: emailResult.receivedCount,
      threadCount: emailResult.threadCount,
      analyzedAt: emailResult.analyzedAt,
      tags: emailResult.analysis.tags,
    });
    if (memory) {
      toast.success("Análisis de correo guardado en memoria");
      setSelectedMemory(memory);
      setSection("memoria");
    } else {
      toast.error(error || "No pude guardar el análisis");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('claudio_token');
    setShowTokenForm(true);
    toast.success("Sesión cerrada");
  };

  const filteredMemories = memories.filter(
    (m) =>
      m.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.kind.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Pantalla de login
  if (showTokenForm) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <Card className="w-full max-w-md p-8 space-y-6">
          <div className="text-center space-y-2">
            <div className="flex justify-center mb-4">
              <Lock className="w-12 h-12 text-primary" />
            </div>
            <h1 className="text-2xl font-bold" style={{ fontFamily: "Merriweather" }}>
              CLAUDIO
            </h1>
            <p className="text-sm text-muted-foreground">Ingresa tu token de autenticación</p>
          </div>

          <div className="space-y-4">
            <Input
              type="password"
              placeholder="Token de CLAUDIO"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSetToken()}
              className="bg-secondary border-border"
              autoFocus
            />
            <Button
              onClick={handleSetToken}
              disabled={!tokenInput.trim()}
              className="w-full bg-primary hover:bg-primary/90"
            >
              Conectar
            </Button>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            El token se guardará localmente en tu navegador
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? "w-64" : "w-0"
        } border-r border-border bg-sidebar transition-all duration-200 overflow-hidden flex flex-col`}
      >
        <div className="p-6 border-b border-border">
          <h1 className="text-2xl font-bold" style={{ fontFamily: "Merriweather" }}>
            CLAUDIO
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Panel de Control</p>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <NavItem
            icon={Brain}
            label="Memoria"
            active={section === "memoria"}
            onClick={() => setSection("memoria")}
          />
          <NavItem
            icon={FileText}
            label="Documentos"
            active={section === "documentos"}
            onClick={() => setSection("documentos")}
          />
          <NavItem
            icon={Mail}
            label="Correo"
            active={section === "correo"}
            onClick={() => setSection("correo")}
          />
          <NavItem
            icon={Settings}
            label="Configuración"
            active={section === "configuracion"}
            onClick={() => setSection("configuracion")}
          />
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded hover:bg-secondary transition-colors text-foreground"
          >
            <LogOut className="w-4 h-4" />
            <span className="text-sm">Desconectar</span>
          </button>
        </nav>

        <div className="p-4 border-t border-border text-xs text-muted-foreground space-y-2">
          <div>
            <p className="font-mono">Estado:</p>
            <p className={isConnected ? "text-green-600" : "text-red-600"}>
              {isConnected ? "✓ Conectado" : "✗ Desconectado"}
            </p>
          </div>
          <div>
            <p className="font-mono">Recuerdos: {memories.length}</p>
          </div>
          {config.apiUrl && (
            <div className="pt-2 border-t border-border">
              <p className="font-mono text-xs break-all">{config.apiUrl}</p>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="border-b border-border bg-card px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 hover:bg-secondary rounded transition-colors"
            >
              {sidebarOpen ? (
                <X className="w-5 h-5" />
              ) : (
                <Menu className="w-5 h-5" />
              )}
            </button>
            <h2 className="text-xl font-semibold" style={{ fontFamily: "Merriweather" }}>
              {section === "memoria" ? "Memoria" : section === "documentos" ? "Documentos" : section === "correo" ? "Correo" : "Configuración"}
            </h2>
          </div>
          {section === "memoria" && (
            <Button
              onClick={() => setShowNewForm(!showNewForm)}
              className="gap-2 bg-primary hover:bg-primary/90"
              disabled={!isConnected}
            >
              <Plus className="w-4 h-4" />
              Nuevo Recuerdo
            </Button>
          )}
        </header>

        {/* Error Alert */}
        {error && !isConnected && section === "memoria" && (
          <div className="bg-destructive/10 border-b border-destructive/30 px-6 py-3 flex items-gap-2">
            <AlertCircle className="w-5 h-5 text-destructive mr-2 flex-shrink-0" />
            <p className="text-sm text-destructive">
              No se puede conectar a CLAUDIO. Verifica la configuración.
            </p>
          </div>
        )}

        {/* Content Area */}
        {section === "configuracion" ? (
          <div className="flex-1 overflow-y-auto p-8 max-w-xl">
            <Card className="p-6 space-y-4">
              <p className="text-sm text-muted-foreground">
                URL base del servidor MCP (mismo host y puerto donde responde <span className="font-mono">/health</span> y{" "}
                <span className="font-mono">/mcp</span>). En local suele ser <span className="font-mono">http://localhost:3737</span> si el MCP corre ahí y Vite en 3000.
              </p>
              <div className="space-y-2">
                <label className="text-sm font-medium">URL del API</label>
                <Input
                  value={settingsUrl}
                  onChange={(e) => setSettingsUrl(e.target.value)}
                  className="bg-secondary border-border font-mono text-sm"
                  placeholder="http://localhost:3737"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Token (CLAUDIO_TOKEN)</label>
                <Input
                  type="password"
                  value={settingsToken}
                  onChange={(e) => setSettingsToken(e.target.value)}
                  className="bg-secondary border-border font-mono text-sm"
                  placeholder="Token Bearer"
                  autoComplete="off"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <Button type="button" onClick={handleSaveSettings} className="bg-primary">
                  Guardar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setSettingsUrl(config.apiUrl);
                    setSettingsToken(localStorage.getItem("claudio_token") || config.token || "");
                  }}
                >
                  Revertir
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Estado: {isConnected ? "conectado al servidor" : "sin conexión"} — probá Guardar y revisá que la URL sea correcta.
              </p>
            </Card>
          </div>
        ) : section === "documentos" ? (
          <div className="flex-1 overflow-y-auto p-8">
            <div className="max-w-5xl space-y-6">
              <Card className="p-6 space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold" style={{ fontFamily: "Merriweather" }}>
                      Subir documento
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Acepta PDF, DOCX o TXT. Claudio analiza el texto y te deja confirmar qué se guarda.
                    </p>
                  </div>
                  <Upload className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                  <Input
                    type="file"
                    accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      setDocumentFile(file);
                      setDocumentResult(null);
                      setDocumentMemoryContent("");
                      setDocumentProgress(null);
                    }}
                    className="bg-secondary border-border"
                    disabled={!isConnected || loading}
                  />
                  <Button
                    type="button"
                    onClick={handleAnalyzeDocument}
                    disabled={!isConnected || !documentFile || loading}
                    className="gap-2 bg-primary hover:bg-primary/90"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                    Analizar
                  </Button>
                </div>
                <AiSelector
                  provider={aiProvider}
                  model={aiModel}
                  onProviderChange={(provider) => {
                    setAiProvider(provider);
                    setAiModel(AI_MODEL_PRESETS[provider][0]);
                  }}
                  onModelChange={setAiModel}
                />
                {documentFile && (
                  <p className="text-xs text-muted-foreground font-mono">
                    {documentFile.name} · {(documentFile.size / 1024).toFixed(1)} KB
                  </p>
                )}
                {documentProgress && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-mono text-muted-foreground">
                      <span>{documentProgress.message}</span>
                      <span>{Math.min(100, Math.max(0, documentProgress.progress))}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded bg-secondary">
                      <div
                        className="h-full bg-primary transition-all duration-300"
                        style={{ width: `${Math.min(100, Math.max(0, documentProgress.progress))}%` }}
                      />
                    </div>
                  </div>
                )}
              </Card>

              {documentResult && (
                <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
                  <Card className="p-6 space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-mono text-muted-foreground">Resumen a guardar</p>
                        <h3 className="text-xl font-semibold mt-1" style={{ fontFamily: "Merriweather" }}>
                          {documentResult.analysis.title}
                        </h3>
                      </div>
                      <Button
                        type="button"
                        onClick={handleSaveDocumentMemory}
                        disabled={loading || !documentMemoryContent.trim()}
                        className="gap-2 bg-primary hover:bg-primary/90"
                      >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Guardar
                      </Button>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Tipo de recuerdo</label>
                      <Input
                        value={documentKind}
                        onChange={(e) => setDocumentKind(e.target.value)}
                        className="bg-secondary border-border max-w-xs"
                      />
                    </div>
                    <Textarea
                      value={documentMemoryContent}
                      onChange={(e) => setDocumentMemoryContent(e.target.value)}
                      className="min-h-96 bg-secondary border-border font-mono text-sm"
                    />
                  </Card>

                  <div className="space-y-6">
                    <Card className="p-5 space-y-3">
                      <p className="text-xs font-mono text-muted-foreground">Extracción</p>
                      <div className="text-sm space-y-1">
                        <p>Caracteres extraídos: {documentResult.extractedCharCount.toLocaleString("es-AR")}</p>
                        <p>Caracteres analizados: {documentResult.analyzedCharCount.toLocaleString("es-AR")}</p>
                        <p>Bloques analizados: {documentResult.chunkCount.toLocaleString("es-AR")}</p>
                      </div>
                      <div className="pt-2 border-t border-border">
                        <p className="text-xs font-mono text-muted-foreground mb-2">Vista previa</p>
                        <p className="text-xs whitespace-pre-wrap max-h-72 overflow-auto text-muted-foreground">
                          {documentResult.extractedPreview}
                        </p>
                      </div>
                    </Card>
                    <Card className="p-5 space-y-3">
                      <p className="text-xs font-mono text-muted-foreground">Etiquetas</p>
                      <div className="flex flex-wrap gap-2">
                        {documentResult.analysis.tags.length > 0 ? (
                          documentResult.analysis.tags.map((tag) => (
                            <span key={tag} className="px-2 py-1 rounded bg-secondary text-xs">
                              {tag}
                            </span>
                          ))
                        ) : (
                          <span className="text-sm text-muted-foreground">Sin etiquetas</span>
                        )}
                      </div>
                    </Card>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : section === "correo" ? (
          <div className="flex-1 overflow-y-auto p-8">
            <div className="max-w-6xl space-y-6">
              <Card className="p-6 space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold" style={{ fontFamily: "Merriweather" }}>
                      Analizar correo
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Incluye recibidos y enviados. Es solo lectura: no archiva, no borra y no envía.
                    </p>
                  </div>
                  <Mail className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                  <select
                    value={emailRange}
                    onChange={(e) => setEmailRange(e.target.value as EmailRange)}
                    className="w-full px-3 py-2 border border-border rounded bg-secondary text-sm"
                    disabled={!isConnected || loading}
                  >
                    <option value="last_day">Último día</option>
                    <option value="last_messages">Últimos mensajes</option>
                    <option value="last_week">Última semana</option>
                    <option value="last_month">Último mes</option>
                    <option value="last_6_months">Últimos 6 meses</option>
                    <option value="last_year">Último año</option>
                    <option value="all">Todos los mails</option>
                  </select>
                  <Button
                    type="button"
                    onClick={handleAnalyzeEmail}
                    disabled={!isConnected || loading}
                    className="gap-2 bg-primary hover:bg-primary/90"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    Analizar
                  </Button>
                </div>
                <AiSelector
                  provider={aiProvider}
                  model={aiModel}
                  onProviderChange={(provider) => {
                    setAiProvider(provider);
                    setAiModel(AI_MODEL_PRESETS[provider][0]);
                  }}
                  onModelChange={setAiModel}
                />
                {emailProgress && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-mono text-muted-foreground">
                      <span>{emailProgress.message}</span>
                      <span>{Math.min(100, Math.max(0, emailProgress.progress))}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded bg-secondary">
                      <div
                        className="h-full bg-primary transition-all duration-300"
                        style={{ width: `${Math.min(100, Math.max(0, emailProgress.progress))}%` }}
                      />
                    </div>
                  </div>
                )}
              </Card>

              {emailResult && (
                <div className="space-y-6">
                  <Card className="p-6 space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-mono text-muted-foreground">Qué conviene guardar</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Guardá patrones, pendientes, personas y temas recurrentes. No hace falta guardar el contenido completo de los mails.
                        </p>
                      </div>
                      <Button
                        type="button"
                        onClick={handleSaveEmailMemory}
                        disabled={loading || !emailMemoryContent.trim()}
                        className="gap-2 bg-primary hover:bg-primary/90"
                      >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Guardar
                      </Button>
                    </div>
                    <div className="grid gap-3 md:grid-cols-4">
                      <Metric label="Mails" value={emailResult.messageCount} />
                      <Metric label="Enviados" value={emailResult.sentCount} />
                      <Metric label="Recibidos" value={emailResult.receivedCount} />
                      <Metric label="Hilos" value={emailResult.threadCount} />
                    </div>
                    <div>
                      <p className="text-xs font-mono text-muted-foreground mb-2">Síntesis</p>
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{emailResult.analysis.executiveSummary}</p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-mono text-muted-foreground">Recuerdo editable</p>
                      <Textarea
                        value={emailMemoryContent}
                        onChange={(e) => setEmailMemoryContent(e.target.value)}
                        className="min-h-72 bg-secondary border-border font-mono text-sm"
                      />
                    </div>
                  </Card>

                  <div className="grid gap-6 lg:grid-cols-2">
                    <AnalysisCard title="Pendiente de tu respuesta" items={emailResult.analysis.awaitingYourReply} />
                    <AnalysisCard title="Esperando de otros" items={emailResult.analysis.waitingOnOthers} />
                    <AnalysisCard title="Urgente" items={emailResult.analysis.urgentItems} />
                    <AnalysisCard title="Acciones sugeridas" items={emailResult.analysis.suggestedActions} />
                    <AnalysisCard title="Patrones de comportamiento" items={emailResult.analysis.behaviorPatterns} />
                    <AnalysisCard title="Estilo de comunicación" items={emailResult.analysis.communicationStyle} />
                    <AnalysisCard title="Temas prioritarios" items={emailResult.analysis.priorityThemes} />
                    <AnalysisCard title="Personas clave" items={emailResult.analysis.keyPeople} />
                    <AnalysisCard title="Proyectos y temas" items={emailResult.analysis.projectsAndTopics} />
                    <AnalysisCard title="Riesgos" items={emailResult.analysis.risks} />
                    <AnalysisCard title="Oportunidades" items={emailResult.analysis.opportunities} />
                    <AnalysisCard title="Etiquetas" items={emailResult.analysis.tags} />
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
        <div className="flex-1 flex overflow-hidden">
          {/* List Panel */}
          <div className="w-80 border-r border-border bg-card overflow-y-auto flex flex-col">
            <div className="p-4 border-b border-border sticky top-0 bg-card space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar recuerdos..."
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="pl-9 bg-secondary border-border"
                  disabled={!isConnected}
                />
              </div>

              {/* New Memory Form */}
              {showNewForm && (
                <div className="space-y-2 p-3 bg-secondary rounded border border-border">
                  <select
                    value={newMemoryKind}
                    onChange={(e) => setNewMemoryKind(e.target.value)}
                    className="w-full text-sm px-2 py-1 border border-border rounded bg-background"
                  >
                    <option value="nota">Nota</option>
                    <option value="proyecto">Proyecto</option>
                    <option value="contacto">Contacto</option>
                    <option value="biografia">Biografía</option>
                  </select>
                  <textarea
                    value={newMemoryContent}
                    onChange={(e) => setNewMemoryContent(e.target.value)}
                    placeholder="Contenido del recuerdo..."
                    className="w-full text-sm px-2 py-1 border border-border rounded bg-background resize-none h-20"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleAddMemory}
                      disabled={loading}
                      className="flex-1"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowNewForm(false)}
                      className="flex-1"
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Memory List */}
            <div className="flex-1 overflow-y-auto space-y-1 p-2">
              {loading && memories.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : filteredMemories.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-sm text-muted-foreground">No hay recuerdos</p>
                </div>
              ) : (
                filteredMemories.map((memory) => (
                  <button
                    key={memory.id}
                    onClick={() => setSelectedMemory(memory)}
                    className={`w-full text-left p-3 rounded transition-colors ${
                      selectedMemory?.id === memory.id
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-secondary text-foreground"
                    }`}
                  >
                    <div className="text-xs font-mono opacity-70 mb-1">
                      [{memory.kind}]
                    </div>
                    <div className="text-sm line-clamp-2">{memory.content}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {new Date(memory.created_at).toLocaleDateString("es-AR")}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Detail Panel */}
          <div className="flex-1 overflow-y-auto">
            {selectedMemory ? (
              <div className="p-8 max-w-4xl">
                <div className="space-y-6">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <div className="text-xs font-mono text-muted-foreground mb-2">
                          [{selectedMemory.kind}]
                        </div>
                        <h3 className="text-2xl font-bold" style={{ fontFamily: "Merriweather" }}>
                          {selectedMemory.content.split('\n')[0]}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-2">
                          {new Date(selectedMemory.created_at).toLocaleString("es-AR")}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingId(selectedMemory.id);
                            setEditContent(selectedMemory.content);
                          }}
                          disabled={editingId === selectedMemory.id}
                        >
                          Editar
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDeleteMemory(selectedMemory.id)}
                        >
                          Eliminar
                        </Button>
                      </div>
                    </div>

                    {editingId === selectedMemory.id ? (
                      <div className="space-y-3">
                        <Textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className="min-h-64 bg-secondary border-border"
                        />
                        <div className="flex gap-2">
                          <Button
                            onClick={() => handleEditMemory(selectedMemory.id)}
                            disabled={loading}
                            className="bg-primary hover:bg-primary/90"
                          >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar"}
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => setEditingId(null)}
                          >
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="prose prose-sm max-w-none">
                        <p className="whitespace-pre-wrap text-foreground font-mono text-sm leading-relaxed">
                          {selectedMemory.content}
                        </p>
                      </div>
                    )}
                  </div>

                  {selectedMemory.metadata_json && (
                    <div className="p-4 bg-secondary rounded border border-border">
                      <p className="text-xs font-mono text-muted-foreground mb-2">Metadata:</p>
                      <pre className="text-xs font-mono overflow-auto">
                        {JSON.stringify(JSON.parse(selectedMemory.metadata_json), null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground">Selecciona un recuerdo para ver detalles</p>
              </div>
            )}
          </div>
        </div>
        )}
      </main>
    </div>
  );
}

function NavItem({
  icon: Icon,
  label,
  active = false,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "text-foreground hover:bg-secondary"
      }`}
    >
      <Icon className="w-4 h-4" />
      <span className="text-sm">{label}</span>
    </button>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-border bg-secondary p-3">
      <p className="text-xs font-mono text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold mt-1">{value.toLocaleString("es-AR")}</p>
    </div>
  );
}

function AnalysisCard({ title, items }: { title: string; items: string[] }) {
  return (
    <Card className="p-5 space-y-3">
      <p className="text-xs font-mono text-muted-foreground">{title}</p>
      {items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((item, index) => (
            <li key={`${title}-${index}`} className="text-sm leading-relaxed">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Sin hallazgos.</p>
      )}
    </Card>
  );
}

function AiSelector({
  provider,
  model,
  onProviderChange,
  onModelChange,
}: {
  provider: AiProvider;
  model: string;
  onProviderChange: (provider: AiProvider) => void;
  onModelChange: (model: string) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-[180px_260px_1fr]">
      <div className="space-y-1">
        <label className="text-xs font-mono text-muted-foreground">Proveedor IA</label>
        <select
          value={provider}
          onChange={(e) => onProviderChange(e.target.value as AiProvider)}
          className="w-full px-3 py-2 border border-border rounded bg-secondary text-sm"
        >
          <option value="openai">OpenAI</option>
          <option value="groq">Groq</option>
          <option value="deepseek">DeepSeek</option>
          <option value="anthropic">Anthropic</option>
          <option value="gemini">Gemini</option>
          <option value="ollama">Ollama local</option>
        </select>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-mono text-muted-foreground">Preset</label>
        <select
          value={AI_MODEL_PRESETS[provider].includes(model) ? model : ""}
          onChange={(e) => e.target.value && onModelChange(e.target.value)}
          className="w-full px-3 py-2 border border-border rounded bg-secondary text-sm"
        >
          {!AI_MODEL_PRESETS[provider].includes(model) && <option value="">Modelo personalizado</option>}
          {AI_MODEL_PRESETS[provider].map((preset) => (
            <option key={preset} value={preset}>
              {preset}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-mono text-muted-foreground">Modelo</label>
        <Input
          value={model}
          onChange={(e) => onModelChange(e.target.value)}
          className="bg-secondary border-border font-mono text-sm"
          placeholder="nombre-del-modelo"
          autoComplete="off"
        />
      </div>
    </div>
  );
}

function formatEmailMemory(result: EmailAnalysisResult): string {
  const a = result.analysis;
  const lines = [
    `Analisis de correo: ${labelEmailRange(result.range)}`,
    `Fecha de analisis: ${new Date(result.analyzedAt).toLocaleString("es-AR")}`,
    `Mails analizados: ${result.messageCount} (${result.receivedCount} recibidos, ${result.sentCount} enviados, ${result.threadCount} hilos)`,
    "",
    "Sintesis:",
    a.executiveSummary,
  ];

  addSection(lines, "Pendiente de respuesta de Santiago", a.awaitingYourReply);
  addSection(lines, "Santiago espera de otros", a.waitingOnOthers);
  addSection(lines, "Urgente", a.urgentItems);
  addSection(lines, "Acciones sugeridas", a.suggestedActions);
  addSection(lines, "Patrones de comportamiento", a.behaviorPatterns);
  addSection(lines, "Estilo de comunicacion", a.communicationStyle);
  addSection(lines, "Temas prioritarios", a.priorityThemes);
  addSection(lines, "Personas clave", a.keyPeople);
  addSection(lines, "Proyectos y temas", a.projectsAndTopics);
  addSection(lines, "Riesgos", a.risks);
  addSection(lines, "Oportunidades", a.opportunities);

  if (a.tags.length > 0) {
    lines.push("", `Etiquetas: ${a.tags.join(", ")}`);
  }

  return lines.join("\n").trim();
}

function addSection(lines: string[], title: string, items: string[]) {
  if (items.length === 0) return;
  lines.push("", `${title}:`, ...items.map((item) => `- ${item}`));
}

function labelEmailRange(range: EmailRange): string {
  const labels: Record<EmailRange, string> = {
    last_day: "ultimo dia",
    last_messages: "ultimos mensajes",
    last_week: "ultima semana",
    last_month: "ultimo mes",
    last_6_months: "ultimos 6 meses",
    last_year: "ultimo año",
    all: "todos los mails",
  };
  return labels[range];
}
