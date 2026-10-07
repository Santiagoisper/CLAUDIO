import { jest } from "@jest/globals";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getNotionPageText, registerNotionTools, resolveNotionPageId, searchNotion } from "./notion";

declare const global: any;

// Mismo stub mínimo que src/tools/portfolio.test.ts: captura los handlers
// registrados por `server.tool(name, description, schema, handler)` para
// poder invocarlos directo, sin levantar un McpServer/transport real.
function createCapturingServer() {
  const handlers = new Map<string, (input: any) => Promise<any>>();
  const stub = {
    tool: (name: string, _description: string, _schema: unknown, handler: (input: any) => Promise<any>) => {
      handlers.set(name, handler);
    },
  };
  return { stub: stub as unknown as McpServer, handlers };
}

describe("notion tools (solo lectura)", () => {
  const ORIGINAL_TOKEN = process.env.NOTION_TOKEN;

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    if (ORIGINAL_TOKEN === undefined) delete process.env.NOTION_TOKEN;
    else process.env.NOTION_TOKEN = ORIGINAL_TOKEN;
    jest.resetAllMocks();
  });

  describe("sin NOTION_TOKEN", () => {
    it("claudio_notion_search devuelve el mensaje de error claro sin llamar a fetch", async () => {
      delete process.env.NOTION_TOKEN;
      const { stub, handlers } = createCapturingServer();
      await registerNotionTools(stub);

      const result = await handlers.get("claudio_notion_search")!({ query: "algo", limit: 10 });

      expect(result.content[0].text).toBe("Notion no está configurado en CLAUDIO.");
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("claudio_notion_page devuelve el mensaje de error claro sin llamar a fetch", async () => {
      delete process.env.NOTION_TOKEN;
      const { stub, handlers } = createCapturingServer();
      await registerNotionTools(stub);

      const result = await handlers.get("claudio_notion_page")!({ page: "abc123" });

      expect(result.content[0].text).toBe("Notion no está configurado en CLAUDIO.");
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe("resolveNotionPageId", () => {
    it("extrae el id desde una URL con título tipo notion.so/Titulo-<id>", () => {
      const url = "https://www.notion.so/Mi-Pagina-de-Prueba-abc123def456abc123def456abc123de";
      expect(resolveNotionPageId(url)).toBe("abc123def456abc123def456abc123de");
    });

    it("extrae el id desde una URL app.notion.com/p/<id>", () => {
      const url = "https://app.notion.com/p/9f8e7d6c5b4a39281716152413121110";
      expect(resolveNotionPageId(url)).toBe("9f8e7d6c5b4a39281716152413121110");
    });

    it("acepta un id ya en formato UUID con guiones", () => {
      const id = "abc12345-6789-4abc-9def-012345678901";
      expect(resolveNotionPageId(id)).toBe(id);
    });

    it("acepta un id crudo de 32 hex sin guiones", () => {
      const id = "abc123def456abc123def456abc123de";
      expect(resolveNotionPageId(id)).toBe(id);
    });
  });

  describe("searchNotion / claudio_notion_search", () => {
    it("devuelve título, url e id correctos para páginas y bases de datos", async () => {
      process.env.NOTION_TOKEN = "fake-token";
      global.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            {
              id: "page-1",
              object: "page",
              url: "https://notion.so/page-1",
              last_edited_time: "2026-10-01T00:00:00.000Z",
              properties: {
                Name: { type: "title", title: [{ plain_text: "Mi página" }] },
                Status: { type: "select" },
              },
            },
            {
              id: "db-1",
              object: "database",
              url: "https://notion.so/db-1",
              last_edited_time: "2026-09-15T00:00:00.000Z",
              title: [{ plain_text: "Mi base de datos" }],
            },
          ],
        }),
      });

      const results = await searchNotion("prueba", 5);

      expect(results).toEqual([
        { id: "page-1", title: "Mi página", url: "https://notion.so/page-1", lastEditedTime: "2026-10-01T00:00:00.000Z" },
        { id: "db-1", title: "Mi base de datos", url: "https://notion.so/db-1", lastEditedTime: "2026-09-15T00:00:00.000Z" },
      ]);

      const [calledUrl, calledOptions] = global.fetch.mock.calls[0];
      expect(String(calledUrl)).toBe("https://api.notion.com/v1/search");
      expect(calledOptions.method).toBe("POST");
      expect(JSON.parse(calledOptions.body)).toEqual({ query: "prueba", page_size: 5 });
      expect(calledOptions.headers.Authorization).toBe("Bearer fake-token");
      expect(calledOptions.headers["Notion-Version"]).toBe("2022-06-28");
    });

    it("la tool devuelve los resultados como JSON en el content", async () => {
      process.env.NOTION_TOKEN = "fake-token";
      global.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          results: [{
            id: "page-1",
            object: "page",
            url: "https://notion.so/page-1",
            last_edited_time: "2026-10-01T00:00:00.000Z",
            properties: { Name: { type: "title", title: [{ plain_text: "Mi página" }] } },
          }],
        }),
      });

      const { stub, handlers } = createCapturingServer();
      await registerNotionTools(stub);
      const result = await handlers.get("claudio_notion_search")!({ query: "x", limit: 10 });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed).toHaveLength(1);
      expect(parsed[0].title).toBe("Mi página");
    });
  });

  describe("getNotionPageText / claudio_notion_page", () => {
    it("arma el texto completo con heading, párrafo, lista y bloques hijos recursivos", async () => {
      process.env.NOTION_TOKEN = "fake-token";
      const rootId = "aaaa1111bbbb2222cccc3333dddd4444";

      global.fetch.mockImplementation((url: unknown) => {
        const href = String(url);

        if (href.includes(`/pages/${rootId}`)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              id: rootId,
              url: `https://notion.so/${rootId}`,
              properties: { title: { type: "title", title: [{ plain_text: "Página de prueba" }] } },
            }),
          });
        }

        if (href.includes("/blocks/parent-block/children")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              results: [{ id: "child-1", type: "paragraph", paragraph: { rich_text: [{ plain_text: "Hijo anidado" }] } }],
              has_more: false,
              next_cursor: null,
            }),
          });
        }

        if (href.includes(`/blocks/${rootId}/children`)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              results: [
                { id: "b1", type: "heading_1", heading_1: { rich_text: [{ plain_text: "Título principal" }] } },
                { id: "b2", type: "paragraph", paragraph: { rich_text: [{ plain_text: "Un párrafo normal." }] } },
                { id: "b3", type: "bulleted_list_item", bulleted_list_item: { rich_text: [{ plain_text: "Item de lista" }] } },
                {
                  id: "parent-block",
                  type: "paragraph",
                  paragraph: { rich_text: [{ plain_text: "Tiene hijos" }] },
                  has_children: true,
                },
                { id: "b5", type: "unsupported_block_type", unsupported_block_type: {} },
              ],
              has_more: false,
              next_cursor: null,
            }),
          });
        }

        return Promise.resolve({ ok: false, status: 404, text: async () => "not found" });
      });

      const result = await getNotionPageText(rootId);

      expect(result.title).toBe("Página de prueba");
      expect(result.url).toBe(`https://notion.so/${rootId}`);
      expect(result.text).toBe(
        [
          "# Título principal",
          "Un párrafo normal.",
          "- Item de lista",
          "Tiene hijos",
          "Hijo anidado",
        ].join("\n"),
      );
    });

    it("resuelve el id desde una URL antes de pedir la página", async () => {
      process.env.NOTION_TOKEN = "fake-token";
      global.fetch.mockImplementation((url: unknown) => {
        const href = String(url);
        if (href.includes("/pages/")) {
          expect(href).toContain("abc123def456abc123def456abc123de");
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ id: "x", url: "https://notion.so/x", properties: {} }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ results: [], has_more: false, next_cursor: null }),
        });
      });

      await getNotionPageText("https://www.notion.so/Titulo-abc123def456abc123def456abc123de");

      expect(global.fetch).toHaveBeenCalled();
    });
  });
});
