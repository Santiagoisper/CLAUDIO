import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/**
 * fal.ai — generación de medios (imagen, video, audio) vía REST.
 * Registro opt-in: solo se activa si existe FAL_KEY en el entorno (Railway).
 * Superficie: POST https://fal.run/<model> con header `Authorization: Key <FAL_KEY>`
 * y cola https://queue.fal.run/<model> para jobs largos (video).
 */
export function registerFalTools(server: McpServer) {
  server.tool(
    "claudio_fal_status",
    "Estado real de la capacidad fal.ai: si la key está configurada y si mcp.fal.ai la acepta (verificación sin consumir inferencia)",
    {},
    async () => {
      const key = process.env.FAL_KEY?.trim();
      if (!key) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                keyPresent: false,
                verified: false,
                detail: "NO VERIFICADO: FAL_KEY ausente en el entorno de Railway",
              }),
            },
          ],
        };
      }
      try {
        const res = await fetch("https://mcp.fal.ai/mcp", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
              protocolVersion: "2025-06-18",
              capabilities: {},
              clientInfo: { name: "claudio", version: "1.0.0" },
            },
          }),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                keyPresent: true,
                verified: res.ok,
                detail: res.ok
                  ? "OK: auth contra mcp.fal.ai verificada"
                  : `NO VERIFICADO: mcp.fal.ai rechazó la auth (HTTP ${res.status})`,
              }),
            },
          ],
        };
      } catch (e) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                keyPresent: true,
                verified: false,
                detail: `NO VERIFICADO: verificación falló (${e})`,
              }),
            },
          ],
        };
      }
    },
  );

  server.tool(
    "claudio_fal_generate",
    "Genera una imagen con fal.ai (default: fal-ai/flux/dev). Devuelve las URLs de los archivos generados en el CDN de fal",
    {
      prompt: z.string().describe("Descripción de la imagen a generar"),
      model: z
        .string()
        .default("fal-ai/flux/dev")
        .describe("Endpoint de fal.run, ej: fal-ai/flux/dev, fal-ai/flux-pro/v1.1"),
      image_size: z
        .string()
        .default("landscape_16_9")
        .describe("Tamaño: square_hd, landscape_16_9, portrait_16_9, landscape_4_3"),
      num_images: z.number().int().min(1).max(4).default(1),
    },
    async ({ prompt, model, image_size, num_images }) => {
      const key = process.env.FAL_KEY?.trim();
      if (!key) {
        return {
          content: [{ type: "text" as const, text: "FAL_KEY ausente: configurá la key en Railway para usar fal.ai" }],
        };
      }
      try {
        const res = await fetch(`https://fal.run/${model}`, {
          method: "POST",
          headers: {
            Authorization: `Key ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ prompt, image_size, num_images }),
        });
        if (!res.ok) {
          return {
            content: [{ type: "text" as const, text: `fal.run HTTP ${res.status}: ${await res.text()}` }],
          };
        }
        const data = (await res.json()) as {
          images?: Array<{ url: string; width?: number; height?: number }>;
        };
        const urls = (data.images ?? []).map((img) => img.url);
        return {
          content: [
            {
              type: "text" as const,
              text: urls.length > 0 ? urls.join("\n") : "El modelo respondió sin imágenes",
            },
          ],
        };
      } catch (e) {
        return { content: [{ type: "text" as const, text: `Error llamando a fal.run: ${e}` }] };
      }
    },
  );

  server.tool(
    "claudio_fal_run",
    "Ejecuta cualquier endpoint de fal.run con input arbitrario (video, audio, 3D, upscaling). Para jobs largos usá queue: true y recibirás la status_url",
    {
      model: z.string().describe("Endpoint de fal, ej: fal-ai/kling-video/v2/master/text-to-video"),
      input: z.record(z.string(), z.unknown()).describe("Input JSON del modelo según su schema"),
      queue: z.boolean().default(false).describe("true para encolar (video/largo) vía queue.fal.run"),
    },
    async ({ model, input, queue }) => {
      const key = process.env.FAL_KEY?.trim();
      if (!key) {
        return {
          content: [{ type: "text" as const, text: "FAL_KEY ausente: configurá la key en Railway para usar fal.ai" }],
        };
      }
      const base = queue ? "https://queue.fal.run" : "https://fal.run";
      try {
        const res = await fetch(`${base}/${model}`, {
          method: "POST",
          headers: {
            Authorization: `Key ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(input),
        });
        if (!res.ok) {
          return {
            content: [{ type: "text" as const, text: `${base} HTTP ${res.status}: ${await res.text()}` }],
          };
        }
        return { content: [{ type: "text" as const, text: JSON.stringify(await res.json(), null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text" as const, text: `Error llamando a ${base}: ${e}` }] };
      }
    },
  );
}
