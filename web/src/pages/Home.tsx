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
import { Menu, X, Plus, Search, Brain, Settings, LogOut, Loader2, AlertCircle } from "lucide-react";
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

  const { memories, loading, error, isConnected, fetchMemories, searchMemories, createMemory, updateMemory, deleteMemory } = useClaudio();
  const { config } = useClaudioConfig();

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

  const filteredMemories = memories.filter(
    (m) =>
      m.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.kind.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
          <NavItem icon={LogOut} label="Desconectar" />
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
                <div className="mb-6">
                  <div className="text-xs font-mono text-muted-foreground mb-2">
                    TIPO: {selectedMemory.kind.toUpperCase()}
                  </div>
                  <h3
                    className="text-3xl font-bold mb-2"
                    style={{ fontFamily: "Merriweather" }}
                  >
                    {selectedMemory.content}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Creado:{" "}
                    {new Date(selectedMemory.created_at).toLocaleString("es-AR")}
                  </p>
                </div>

                <Tabs defaultValue="detalles" className="mt-8">
                  <TabsList className="border-b border-border bg-transparent p-0">
                    <TabsTrigger
                      value="detalles"
                      className="border-b-2 border-transparent data-[state=active]:border-primary rounded-none"
                    >
                      Detalles
                    </TabsTrigger>
                    <TabsTrigger
                      value="editar"
                      className="border-b-2 border-transparent data-[state=active]:border-primary rounded-none"
                    >
                      Editar
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="detalles" className="mt-6">
                    <Card className="p-6 border border-border">
                      <div className="space-y-4">
                        <div>
                          <label className="text-sm font-mono text-muted-foreground">
                            Contenido
                          </label>
                          <p className="mt-2 text-base leading-relaxed">
                            {selectedMemory.content}
                          </p>
                        </div>
                        <div className="pt-4 border-t border-border flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditingId(selectedMemory.id);
                              setEditContent(selectedMemory.content);
                            }}
                          >
                            Editar
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive hover:bg-destructive/10"
                            onClick={() => handleDeleteMemory(selectedMemory.id)}
                          >
                            Eliminar
                          </Button>
                        </div>
                      </div>
                    </Card>
                  </TabsContent>

                  <TabsContent value="editar" className="mt-6">
                    {editingId === selectedMemory.id ? (
                      <Card className="p-6 border border-border space-y-4">
                        <Textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className="min-h-48 font-mono text-sm"
                        />
                        <div className="flex gap-2">
                          <Button
                            onClick={() => handleEditMemory(selectedMemory.id)}
                            disabled={loading}
                            className="flex-1"
                          >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar"}
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => setEditingId(null)}
                            className="flex-1"
                          >
                            Cancelar
                          </Button>
                        </div>
                      </Card>
                    ) : (
                      <Card className="p-6 border border-border">
                        <p className="text-sm text-muted-foreground">
                          Haz click en "Editar" en la pestaña anterior para modificar este recuerdo.
                        </p>
                      </Card>
                    )}
                  </TabsContent>
                </Tabs>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground">
                  {isConnected ? "Selecciona un recuerdo" : "No conectado"}
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function NavItem({
  icon: Icon,
  label,
  active = false,
}: {
  icon: React.ComponentType<{ className: string }>;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      className={`w-full flex items-center gap-3 px-4 py-2 rounded transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "text-foreground hover:bg-secondary"
      }`}
    >
      <Icon className="w-5 h-5" />
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}
