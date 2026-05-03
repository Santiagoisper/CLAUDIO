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
import { Menu, X, Plus, Search, Brain, Settings, LogOut, Loader2, AlertCircle, Lock } from "lucide-react";
import { useClaudio, type Memory } from "@/hooks/useClaudio";
import { useClaudioConfig } from "@/contexts/ClaudioContext";
import { toast } from "sonner";

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

  const { memories, loading, error, isConnected, fetchMemories, searchMemories, createMemory, updateMemory, deleteMemory } = useClaudio();
  const { config } = useClaudioConfig();

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
      localStorage.setItem('claudio_token', tokenInput);
      setShowTokenForm(false);
      setTokenInput("");
      window.location.reload();
    } else {
      toast.error("Ingresa un token válido");
    }
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
          <NavItem icon={Brain} label="Memoria" active />
          <NavItem icon={Settings} label="Configuración" />
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
              Memoria
            </h2>
          </div>
          <Button
            onClick={() => setShowNewForm(!showNewForm)}
            className="gap-2 bg-primary hover:bg-primary/90"
            disabled={!isConnected}
          >
            <Plus className="w-4 h-4" />
            Nuevo Recuerdo
          </Button>
        </header>

        {/* Error Alert */}
        {error && !isConnected && (
          <div className="bg-destructive/10 border-b border-destructive/30 px-6 py-3 flex items-gap-2">
            <AlertCircle className="w-5 h-5 text-destructive mr-2 flex-shrink-0" />
            <p className="text-sm text-destructive">
              No se puede conectar a CLAUDIO. Verifica la configuración.
            </p>
          </div>
        )}

        {/* Content Area */}
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
      </main>
    </div>
  );
}

function NavItem({ icon: Icon, label, active = false }: { icon: any; label: string; active?: boolean }) {
  return (
    <button
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
