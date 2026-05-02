import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

function sanitizeHeaderValue(value: string, fieldName: string): string {
  if (/[\r\n\u0000]/.test(value)) {
    throw new Error(`Invalid ${fieldName}: header injection attempt blocked.`);
  }
  return value;
}

async function getAccessToken(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    signal: AbortSignal.timeout(30_000),
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google OAuth error (${res.status})`);
  const data = await res.json() as { access_token: string };
  return data.access_token;
}

function buildRawMessage(params: {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  replyToMessageId?: string;
}): string {
  const safeTo = params.to.map((value) => sanitizeHeaderValue(value, "to"));
  const safeCc = params.cc?.map((value) => sanitizeHeaderValue(value, "cc"));
  const safeBcc = params.bcc?.map((value) => sanitizeHeaderValue(value, "bcc"));
  const safeSubject = sanitizeHeaderValue(params.subject, "subject");
  const safeReplyToMessageId = params.replyToMessageId
    ? sanitizeHeaderValue(params.replyToMessageId, "replyToMessageId")
    : undefined;

  const lines: string[] = [
    `To: ${safeTo.join(", ")}`,
    `Subject: ${safeSubject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: quoted-printable",
  ];
  if (safeCc?.length) lines.push(`Cc: ${safeCc.join(", ")}`);
  if (safeBcc?.length) lines.push(`Bcc: ${safeBcc.join(", ")}`);
  if (safeReplyToMessageId) lines.push(`In-Reply-To: ${safeReplyToMessageId}`, `References: ${safeReplyToMessageId}`);
  lines.push("", params.body);

  return Buffer.from(lines.join("\r\n"))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function registerGmailTools(server: McpServer) {
  server.tool(
    "claudio_gmail_draft",
    "Crea un borrador de email en Gmail. No lo envia; queda guardado en Drafts para que Santiago lo revise y lo envie manualmente.",
    {
      to: z.array(z.string().email()),
      subject: z.string(),
      body: z.string(),
      cc: z.array(z.string().email()).optional(),
      bcc: z.array(z.string().email()).optional(),
    },
    async ({ to, subject, body, cc, bcc }) => {
      const token = await getAccessToken();
      const raw = buildRawMessage({ to, subject, body, cc, bcc });

      const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(30_000),
        body: JSON.stringify({ message: { raw } }),
      });
      if (!res.ok) throw new Error(`Gmail draft error (${res.status})`);

      return { content: [{ type: "text" as const, text: `Borrador creado -> Para: ${to.join(", ")} | Asunto: ${subject}` }] };
    }
  );

  if (process.env.CLAUDIO_ENABLE_GMAIL_WRITE === "true") {
    server.tool(
      "claudio_gmail_send",
      "Envia un email directamente desde Gmail de Santiago. Solo disponible si CLAUDIO_ENABLE_GMAIL_WRITE=true.",
      {
        to: z.array(z.string().email()),
        subject: z.string(),
        body: z.string(),
        cc: z.array(z.string().email()).optional(),
        bcc: z.array(z.string().email()).optional(),
      },
      async ({ to, subject, body, cc, bcc }) => {
        const token = await getAccessToken();
        const raw = buildRawMessage({ to, subject, body, cc, bcc });

        const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          signal: AbortSignal.timeout(30_000),
          body: JSON.stringify({ raw }),
        });
        if (!res.ok) throw new Error(`Gmail send error (${res.status})`);

        const data = await res.json() as { id: string };
        return { content: [{ type: "text" as const, text: `Email enviado | Para: ${to.join(", ")} | Asunto: ${subject} | ID: ${data.id}` }] };
      }
    );
  }
}
