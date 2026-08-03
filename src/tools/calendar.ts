import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  GOOGLE_ACCOUNTS,
  getGoogleAccessToken,
  type GoogleAccount,
} from "./google.js";

function formatEvent(event: {
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  location?: string;
  description?: string;
}): string {
  const start = event.start?.dateTime ?? event.start?.date ?? "Sin fecha";
  const end = event.end?.dateTime ?? event.end?.date ?? "";
  const location = event.location ? `\n  Lugar: ${event.location}` : "";
  const description = event.description
    ? `\n  Nota: ${event.description.slice(0, 100)}`
    : "";
  return `Evento: ${event.summary ?? "(sin titulo)"}\n  Hora: ${start}${end ? ` -> ${end}` : ""}${location}${description}`;
}

export function registerCalendarTools(server: McpServer) {
  server.tool(
    "claudio_calendar_today",
    "Lista los eventos de hoy en el calendario de Santiago (zona horaria Argentina)",
    { account: z.enum(GOOGLE_ACCOUNTS).default("personal") },
    async ({ account }) => {
      const token = await getGoogleAccessToken(account as GoogleAccount);

      const now = new Date();
      const tzOffset = -3 * 60;
      const localNow = new Date(
        now.getTime() + (tzOffset - now.getTimezoneOffset()) * 60000,
      );

      const year = localNow.getFullYear();
      const month = String(localNow.getMonth() + 1).padStart(2, "0");
      const day = String(localNow.getDate()).padStart(2, "0");
      const dateStr = `${year}-${month}-${day}`;
      const timeMin = `${dateStr}T00:00:00-03:00`;
      const timeMax = `${dateStr}T23:59:59-03:00`;

      const url = new URL(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      );
      url.searchParams.set("timeMin", timeMin);
      url.searchParams.set("timeMax", timeMax);
      url.searchParams.set("singleEvents", "true");
      url.searchParams.set("orderBy", "startTime");

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Google Calendar error (${res.status})`);

      const data = (await res.json()) as { items?: unknown[] };
      const items = (data.items ?? []) as Parameters<typeof formatEvent>[0][];

      if (items.length === 0) {
        return {
          content: [
            { type: "text" as const, text: "No hay eventos para hoy." },
          ],
        };
      }

      const text = items.map(formatEvent).join("\n\n");
      return { content: [{ type: "text" as const, text }] };
    },
  );

  server.tool(
    "claudio_calendar_events",
    "Lista los proximos eventos del calendario de Santiago",
    {
      days_ahead: z.number().int().min(1).max(30).default(7),
      calendar_id: z.string().default("primary").optional(),
      account: z.enum(GOOGLE_ACCOUNTS).default("personal"),
    },
    async ({ days_ahead, calendar_id, account }) => {
      const token = await getGoogleAccessToken(account as GoogleAccount);

      const timeMin = new Date().toISOString();
      const timeMax = new Date(
        Date.now() + days_ahead * 24 * 60 * 60 * 1000,
      ).toISOString();
      const calId = encodeURIComponent(calendar_id ?? "primary");

      const url = new URL(
        `https://www.googleapis.com/calendar/v3/calendars/${calId}/events`,
      );
      url.searchParams.set("timeMin", timeMin);
      url.searchParams.set("timeMax", timeMax);
      url.searchParams.set("singleEvents", "true");
      url.searchParams.set("orderBy", "startTime");
      url.searchParams.set("maxResults", "20");

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Google Calendar error (${res.status})`);

      const data = (await res.json()) as { items?: unknown[] };
      const items = (data.items ?? []) as Parameters<typeof formatEvent>[0][];

      if (items.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No hay eventos en los proximos ${days_ahead} dias.`,
            },
          ],
        };
      }

      const text = items.map(formatEvent).join("\n\n");
      return { content: [{ type: "text" as const, text }] };
    },
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
        account: z.enum(GOOGLE_ACCOUNTS).default("personal"),
      },
      async ({ title, start, end, description, location, account }) => {
        const token = await getGoogleAccessToken(account as GoogleAccount);

        const isDateTime = (value: string) => value.includes("T");
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
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          },
        );
        if (!res.ok)
          throw new Error(`Google Calendar create error (${res.status})`);

        const event = (await res.json()) as { htmlLink?: string };
        return {
          content: [
            {
              type: "text" as const,
              text: `Evento creado: ${title} - ${start}\n${event.htmlLink ?? ""}`,
            },
          ],
        };
      },
    );
  }
}
