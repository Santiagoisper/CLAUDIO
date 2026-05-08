import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

const URL =
  process.env.CLAUDIO_REMOTE_URL ?? "https://claudio-production-759b.up.railway.app";
const TOKEN = process.env.CLAUDIO_TOKEN;
if (!TOKEN || TOKEN.length < 32) {
  console.error("Definí CLAUDIO_TOKEN (≥32 caracteres), igual que en el servidor.");
  process.exit(1);
}
const [,, kind, content] = process.argv;

if (!kind || !content) {
  console.error("Uso: tsx tools/remember.ts <kind> <content>");
  process.exit(1);
}

const transport = new SSEClientTransport(new globalThis.URL(`${URL}/sse`), {
  requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
});

const client = new Client({ name: "cli", version: "1.0.0" });
await client.connect(transport);

const result = await client.callTool({ name: "claudio_remember", arguments: { kind, content } });
console.log((result.content as { text: string }[])[0]?.text);
await client.close();
