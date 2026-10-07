import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Integración de solo lectura con Notion. A propósito no hay ninguna
// operación de escritura (crear/editar/borrar páginas o bloques) ni aunque
// la API de Notion lo permita — el token que usa Santiago es de lectura.

const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

interface NotionRichText {
  plain_text: string;
}

interface NotionTitleProperty {
  type: "title";
  title: NotionRichText[];
}

interface NotionSearchResultRaw {
  id: string;
  object: "page" | "database";
  url: string;
  title?: NotionRichText[];
  properties?: Record<string, NotionTitleProperty | { type: string; [key: string]: unknown }>;
  last_edited_time: string;
}

interface NotionSearchResponse {
  results: NotionSearchResultRaw[];
}

interface NotionSearchResult {
  id: string;
  title: string;
  url: string;
  lastEditedTime: string;
}

interface NotionPageRaw {
  id: string;
  url: string;
  title?: NotionRichText[];
  properties?: Record<string, NotionTitleProperty | { type: string; [key: string]: unknown }>;
}

interface NotionBlock {
  id: string;
  type: string;
  has_children?: boolean;
  [key: string]: unknown;
}

interface NotionBlocksResponse {
  results: NotionBlock[];
  has_more: boolean;
  next_cursor: string | null;
}

function missingNotionTokenResult() {
  return {
    content: [{
      type: "text" as const,
      text: "Notion no está configurado en CLAUDIO.",
    }],
  };
}

async function notionFetch(path: string, options: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`${NOTION_API_BASE}${path}`, {
    signal: AbortSignal.timeout(30_000),
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`Notion ${res.status}: ${await res.text()}`);
  return res.json();
}

// Una página trae el título en una property cuyo `type === "title"`; una
// base de datos lo trae en un array `title` de primer nivel. Cubrimos ambos
// casos sin asumir exhaustividad perfecta sobre todas las formas posibles.
function extractTitle(result: { title?: NotionRichText[]; properties?: NotionSearchResultRaw["properties"] }): string {
  if (Array.isArray(result.title) && result.title.length > 0) {
    const text = result.title.map((rt) => rt.plain_text).join("");
    if (text) return text;
  }
  if (result.properties) {
    for (const value of Object.values(result.properties)) {
      if (value && (value as NotionTitleProperty).type === "title" && Array.isArray((value as NotionTitleProperty).title)) {
        const text = (value as NotionTitleProperty).title.map((rt) => rt.plain_text).join("");
        if (text) return text;
      }
    }
  }
  return "(sin título)";
}

export async function searchNotion(query: string, limit = 10): Promise<NotionSearchResult[]> {
  const data = await notionFetch("/search", {
    method: "POST",
    body: JSON.stringify({ query, page_size: limit }),
  }) as NotionSearchResponse;

  return data.results.map((result) => ({
    id: result.id,
    title: extractTitle(result),
    url: result.url,
    lastEditedTime: result.last_edited_time,
  }));
}

// Acepta un id crudo (32 hex, con o sin guiones) o una URL de Notion
// (notion.so/Titulo-abc123... o app.notion.com/p/abc123...) y devuelve
// siempre el id de 32 hex (Notion acepta ambos formatos indistintamente en
// la API, así que no hace falta normalizar guiones).
export function resolveNotionPageId(pageIdOrUrl: string): string {
  const input = pageIdOrUrl.trim();
  const bareHex = input.replace(/-/g, "");
  if (!input.includes("/") && !input.includes(".") && /^[0-9a-f]{32}$/i.test(bareHex)) {
    return input;
  }

  const matches = [...input.matchAll(/[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}/gi)];
  if (matches.length > 0) {
    return matches[matches.length - 1][0];
  }

  throw new Error(`No se pudo extraer un id de página de Notion de: ${pageIdOrUrl}`);
}

async function fetchBlockChildren(blockId: string): Promise<NotionBlock[]> {
  const all: NotionBlock[] = [];
  let cursor: string | undefined;
  // Tope de páginas defensivo: no hay razón para que un solo nivel de
  // bloques tenga más de 2000 hijos directos en una página normal.
  for (let page = 0; page < 20; page += 1) {
    const qs = new URLSearchParams({ page_size: "100" });
    if (cursor) qs.set("start_cursor", cursor);
    const data = await notionFetch(`/blocks/${blockId}/children?${qs.toString()}`) as NotionBlocksResponse;
    all.push(...data.results);
    if (!data.has_more || !data.next_cursor) break;
    cursor = data.next_cursor;
  }
  return all;
}

function blockRichText(block: NotionBlock): string {
  const data = block[block.type] as { rich_text?: NotionRichText[] } | undefined;
  if (!data || !Array.isArray(data.rich_text)) return "";
  return data.rich_text.map((rt) => rt.plain_text).join("");
}

// Tipos de bloque más comunes convertidos a texto plano. Lo que no está
// cubierto simplemente se ignora (no hace falta el 100% del catálogo de
// Notion). `numbered` lleva la cuenta del número actual dentro de una
// corrida consecutiva de numbered_list_item.
function blockToLine(block: NotionBlock, numbered: { n: number }): string | null {
  const text = blockRichText(block);
  if (block.type !== "numbered_list_item") numbered.n = 0;

  switch (block.type) {
    case "paragraph":
      return text;
    case "heading_1":
      return `# ${text}`;
    case "heading_2":
      return `## ${text}`;
    case "heading_3":
      return `### ${text}`;
    case "bulleted_list_item":
      return `- ${text}`;
    case "numbered_list_item":
      numbered.n += 1;
      return `${numbered.n}. ${text}`;
    case "to_do": {
      const checked = (block.to_do as { checked?: boolean } | undefined)?.checked;
      return `[${checked ? "x" : " "}] ${text}`;
    }
    case "quote":
      return `> ${text}`;
    case "callout":
      return text;
    case "code":
      return `\n\`\`\`\n${text}\n\`\`\`\n`;
    default:
      return null;
  }
}

const MAX_BLOCK_DEPTH = 4;

async function collectBlockLines(
  blockId: string,
  depth: number,
  numbered: { n: number },
  lines: string[],
): Promise<void> {
  const children = await fetchBlockChildren(blockId);
  for (const block of children) {
    const line = blockToLine(block, numbered);
    if (line !== null) lines.push(line);
    if (block.has_children && depth < MAX_BLOCK_DEPTH) {
      await collectBlockLines(block.id, depth + 1, numbered, lines);
    }
  }
}

export async function getNotionPageText(
  pageIdOrUrl: string,
): Promise<{ title: string; url: string; text: string }> {
  const id = resolveNotionPageId(pageIdOrUrl);
  const page = await notionFetch(`/pages/${id}`) as NotionPageRaw;

  const lines: string[] = [];
  await collectBlockLines(id, 0, { n: 0 }, lines);

  return {
    title: extractTitle(page),
    url: page.url,
    text: lines.join("\n"),
  };
}

export function registerNotionTools(s: McpServer) {
  s.tool(
    "claudio_notion_search",
    "Busca páginas y bases de datos en Notion (solo lectura)",
    {
      query: z.string().describe("Texto a buscar en Notion"),
      limit: z.number().int().min(1).max(50).default(10),
    },
    async ({ query, limit }) => {
      if (!process.env.NOTION_TOKEN) return missingNotionTokenResult();
      try {
        const results = await searchNotion(query, limit);
        return { content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }] };
      } catch (e) {
        return {
          content: [{
            type: "text" as const,
            text: `Error buscando en Notion: ${(e as Error).message}`,
          }],
        };
      }
    },
  );

  s.tool(
    "claudio_notion_page",
    "Devuelve el texto completo de una página de Notion (solo lectura), por id o por URL",
    {
      page: z.string().describe("Id de página de Notion, o su URL (notion.so / app.notion.com)"),
    },
    async ({ page }) => {
      if (!process.env.NOTION_TOKEN) return missingNotionTokenResult();
      try {
        const result = await getNotionPageText(page);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return {
          content: [{
            type: "text" as const,
            text: `Error leyendo página de Notion: ${(e as Error).message}`,
          }],
        };
      }
    },
  );
}
