import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerWebTools(server: McpServer) {
  server.tool(
    "claudio_fetch",
    "Descarga el contenido de una URL (HTML, JSON, texto plano) y lo devuelve como texto limpio",
    {
      url: z.string().url(),
      max_chars: z.number().int().default(8000).optional(),
    },
    async ({ url, max_chars }) => {
      let res: Response;
      try {
        res = await fetch(url, { headers: { "User-Agent": "CLAUDIO/1.0" } });
      } catch (e) {
        return { content: [{ type: "text" as const, text: `Error al conectar con ${url}: ${e}` }] };
      }
      if (!res.ok) {
        return { content: [{ type: "text" as const, text: `HTTP ${res.status} al descargar ${url}` }] };
      }
      const raw = await res.text();
      const clean = raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      return { content: [{ type: "text" as const, text: clean.slice(0, max_chars ?? 8000) }] };
    }
  );

  if (process.env.BRAVE_API_KEY) {
    server.tool(
      "claudio_web_search",
      "Busca en internet usando Brave Search y devuelve los resultados más relevantes",
      {
        query: z.string(),
        count: z.number().int().min(1).max(10).default(5),
      },
      async ({ query, count }) => {
        let res: Response;
        try {
          res = await fetch(
            `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`,
            {
              headers: {
                "Accept": "application/json",
                "X-Subscription-Token": process.env.BRAVE_API_KEY!,
              },
            }
          );
        } catch (e) {
          return { content: [{ type: "text" as const, text: `Error al conectar con Brave Search: ${e}` }] };
        }
        if (!res.ok) {
          return { content: [{ type: "text" as const, text: `Brave Search error HTTP ${res.status}: ${await res.text()}` }] };
        }
        const data = await res.json() as { web?: { results?: Array<{ title: string; url: string; description: string }> } };
        const results = data.web?.results ?? [];
        if (results.length === 0) {
          return { content: [{ type: "text" as const, text: `Sin resultados para: ${query}` }] };
        }
        const text = results
          .map((r) => `${r.title}\n${r.url}\n${r.description}`)
          .join("\n\n---\n\n");
        return { content: [{ type: "text" as const, text }] };
      }
    );
  }
}
