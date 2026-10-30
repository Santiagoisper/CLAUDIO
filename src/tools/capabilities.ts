import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

type CapabilityStatus = "registered" | "disabled" | "not_registered";

interface McpModuleCapability {
  name: string;
  status: CapabilityStatus;
  configured: boolean;
  access: "read" | "write" | "mixed";
  note: string;
}

interface ApiOnlyCapability {
  name: string;
  status: "http_api_only";
  note: string;
}

export interface CapabilityInventory {
  generated_at: string;
  server: {
    name: string;
    transports: string[];
  };
  counts: {
    mcp_servers: number;
    mcp_modules_registered: number;
    http_api_only: number;
    known_gaps: number;
  };
  mcp_modules: McpModuleCapability[];
  http_api_only: ApiOnlyCapability[];
  known_gaps: Array<{ name: string; reason: string }>;
}

function hasAnyGoogleAccount(): boolean {
  return Boolean(
    process.env.GOOGLE_REFRESH_TOKEN?.trim() ||
      process.env.CINME_GOOGLE_REFRESH_TOKEN?.trim(),
  );
}

export function getCapabilityInventory(): CapabilityInventory {
  const githubConfigured = Boolean(process.env.GITHUB_TOKEN?.trim());
  const shellEnabled = process.env.CLAUDIO_ENABLE_SHELL === "true";
  const googleConfigured = hasAnyGoogleAccount();
  const braveConfigured = Boolean(process.env.BRAVE_API_KEY?.trim());

  const mcpModules: McpModuleCapability[] = [
    {
      name: "capabilities",
      status: "registered",
      configured: true,
      access: "read",
      note: "Inventario de capacidades sin exponer secretos.",
    },
    {
      name: "memory",
      status: "registered",
      configured: true,
      access: "mixed",
      note: "Memoria local o Neon según la configuración de base de datos.",
    },
    {
      name: "github",
      status: githubConfigured ? "registered" : "disabled",
      configured: githubConfigured,
      access: "read",
      note: githubConfigured
        ? "Herramientas GitHub de lectura registradas."
        : "Requiere GITHUB_TOKEN.",
    },
    {
      name: "shell",
      status: shellEnabled ? "registered" : "disabled",
      configured: shellEnabled,
      access: "read",
      note: shellEnabled
        ? "Habilitado con lista de comandos permitidos."
        : "Deshabilitado por CLAUDIO_ENABLE_SHELL.",
    },
    {
      name: "web",
      status: "registered",
      configured: true,
      access: "read",
      note: braveConfigured
        ? "Fetch web y búsqueda Brave disponibles."
        : "Fetch web disponible; búsqueda Brave requiere BRAVE_API_KEY.",
    },
    {
      name: "briefing",
      status: "registered",
      configured: true,
      access: "read",
      note: "Briefings registrados en el servidor MCP.",
    },
    {
      name: "calendar",
      status: googleConfigured ? "registered" : "disabled",
      configured: googleConfigured,
      access: process.env.CLAUDIO_ENABLE_GOOGLE_WRITE === "true" ? "mixed" : "read",
      note: googleConfigured
        ? "Lectura disponible; escritura solo con CLAUDIO_ENABLE_GOOGLE_WRITE=true."
        : "Requiere GOOGLE_REFRESH_TOKEN o CINME_GOOGLE_REFRESH_TOKEN.",
    },
    {
      name: "gmail",
      status: googleConfigured ? "registered" : "disabled",
      configured: googleConfigured,
      access: process.env.CLAUDIO_ENABLE_GMAIL_WRITE === "true" ? "mixed" : "read",
      note: googleConfigured
        ? "Borradores disponibles; envío directo solo con CLAUDIO_ENABLE_GMAIL_WRITE=true."
        : "Requiere GOOGLE_REFRESH_TOKEN o CINME_GOOGLE_REFRESH_TOKEN.",
    },
  ];

  const httpApiOnly: ApiOnlyCapability[] = [
    {
      name: "documents",
      status: "http_api_only",
      note: "Análisis de documentos expuesto por /api/documents.",
    },
    {
      name: "email_analysis",
      status: "http_api_only",
      note: "Análisis de correo expuesto por /api/email.",
    },
    {
      name: "chat_memory",
      status: "http_api_only",
      note: "Chat con memoria expuesto por /api/chat/memory.",
    },
    {
      name: "whatsapp_contacts",
      status: "http_api_only",
      note: "Contactos de WhatsApp expuestos por /api/whatsapp/contacts.",
    },
  ];

  const knownGaps = [
    {
      name: "portfolio",
      reason:
        "El módulo existe pero no se registra: usa una ruta Windows hardcodeada y necesita una raíz configurable con límites de lectura.",
    },
  ];

  return {
    generated_at: new Date().toISOString(),
    server: {
      name: "claudio",
      transports: ["stdio", "sse", "streamable_http"],
    },
    counts: {
      mcp_servers: 1,
      mcp_modules_registered: mcpModules.filter((module) => module.status === "registered").length,
      http_api_only: httpApiOnly.length,
      known_gaps: knownGaps.length,
    },
    mcp_modules: mcpModules,
    http_api_only: httpApiOnly,
    known_gaps: knownGaps,
  };
}

export function registerCapabilityTools(server: McpServer): void {
  server.tool(
    "claudio_capabilities",
    "Enumera servidores, módulos MCP, APIs HTTP y brechas conocidas de CLAUDIO sin exponer secretos.",
    {},
    async () => {
      const inventory = getCapabilityInventory();
      return {
        content: [{ type: "text" as const, text: JSON.stringify(inventory, null, 2) }],
        structuredContent: inventory as unknown as Record<string, unknown>,
      };
    },
  );
}
