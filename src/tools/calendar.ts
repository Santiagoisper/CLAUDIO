import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

async function getAccessToken(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google OAuth error: ${await res.text()}`);
  const data = await res.json() as { access_token: string };
  return data.access_token;
}

function formatEvent(event: {
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  location?: string;
  description?: string;
}): string {
  const start = event.start?.dateTime ?? event.start?.date ?? "Sin fecha";
  const end = event.end?.dateTime ?? event.end?.date ?? "";
  const location = event.location ? `\n  📍 ${event.location}` : "";
  const description = event.description ? `\n  📝 ${event.description.slice(0, 100)}` : "";
  return `📅 ${event.summary ?? "(sin título)"}\n  🕐 ${start}${end ? ` → ${end}` : ""}${location}${description}`;
}

export function registerCalendarTools(server: McpServer) {
  server.tool(
    "claudio_calendar_today",
    "Lista los eventos de hoy en el calendario de Santiago (zona horaria Argentina)",
    {},
    async () => {
      const token = await getAccessToken();

      const now = new Date();
      const tzOffset = -3 * 60; // America/Argentina/Buenos_Aires (UTC-3)
      const localNow = new Date(now.getTime() + (tzOffset - now.getTimezoneOffset()) * 60000);

      const year = localNow.getFullYear();
      const month = String(localNow.getMonth() + 1).padStart(2, "0");
      const day = String(localNow.getDate()).padStart(2, "0");
      const dateStr = `${year}-${month}-${day}`;
      const timeMin = `${dateStr}T00:00:00-03:00`;
      const timeMax = `${dateStr}T23:59:59-03:00`;

      const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
      url.searchParams.set("timeMin", timeMin);
      url.searchParams.set("timeMax", timeMax);
      url.searchParams.set("singleEvents", "true");
      url.searchParams.set("orderBy", "startTime");

      const res = await fetch(url.toString(), {
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Google Calendar error: ${await res.text()}`);

      const data = await res.json() as { items?: unknown[] };
      const items = (data.items ?? []) as Parameters<typeof formatEvent>[0][];

      if (items.length === 0) {
        return { content: [{ type: "text" as const, text: "No hay eventos para hoy." }] };
      }

      const text = items.map(formatEvent).join("\n\n");
      return { content: [{ type: "text" as const, text }] };
    }
  );

  server.tool(
    "claudio_calendar_events",
    "Lista los próximos eventos del calendario de Santiago",
    {
      days_ahead: z.number().int().min(1).max(30).default(7),
      calendar_id: z.string().default("primary").optional(),
    },
    async ({ days_ahead, calendar_id }) => {
      const token = await getAccessToken();

      const timeMin = new Date().toISOString();
      const timeMax = new Date(Date.now() + days_ahead * 24 * 60 * 60 * 1000).toISOString();
      const calId = encodeURIComponent(calendar_id ?? "primary");

      const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${calId}/events`);
      url.searchParams.set("timeMin", timeMin);
      url.searchParams.set("timeMax", timeMax);
      url.searchParams.set("singleEvents", "true");
      url.searchParams.set("orderBy", "startTime");
      url.searchParams.set("maxResults", "20");

      const res = await fetch(url.toString(), {
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Google Calendar error: ${await res.text()}`);

      const data = await res.json() as { items?: unknown[] };
      const items = (data.items ?? []) as Parameters<typeof formatEvent>[0][];

      if (items.length === 0) {
        return { content: [{ type: "text" as const, text: `No hay eventos en los próximos ${days_ahead} días.` }] };
      }

      const text = items.map(formatEvent).join("\n\n");
      return { content: [{ type: "text" as const, text }] };
    }
  );

  if (process.env.CLAUDIO_ENABLE_GOOGLE_WRITE === "true") {
    server.tool(
      "claudio_calendar_create",
      "Crea un nuevo evento en el calendario de Santiago. Solo disponible si CLAUDIO_ENABLE_GOOGLE_WRITE=true",
      {
        title: z.string(),
        start: z.string(),
        end: z.string(),
        description: z.string().optional(),
        location: z.string().optional(),
      },
      async ({ title, start, end, description, location }) => {
        const token = await getAccessToken();

        const isDateTime = (s: string) => s.includes("T");
        const body: Record<string, unknown> = {
          summary: title,
          start: isDateTime(start) ? { dateTime: start } : { date: start },
          end: isDateTime(end) ? { dateTime: end } : { date: end },
        };
        if (description) body.description = description;
        if (location) body.location = location;

        const res = await fetch(
          "https://www.googleapis.com/calendar/v3/calendars/primary/events",
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          }
        );
        if (!res.ok) throw new Error(`Google Calendar create error: ${await res.text()}`);

        const event = await res.json() as { htmlLink?: string };
        return {
          content: [{
            type: "text" as const,
            text: `Evento creado: ${title} — ${start}\n${event.htmlLink ?? ""}`,
          }],
        };
      }
    );
  }
}
