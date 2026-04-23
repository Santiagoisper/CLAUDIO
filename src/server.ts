import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import "dotenv/config";
import { registerMemoryTools } from "./tools/memory.js";
import { registerGithubTools } from "./tools/github.js";

const server = new McpServer({
  name: "claudio",
  version: "1.0.0",
  description: "CLAUDIO — Asistente personal de Santiago",
});

registerMemoryTools(server);

if (process.env.GITHUB_TOKEN) {
  registerGithubTools(server);
}

const transport = new StdioServerTransport();
await server.connect(transport);
