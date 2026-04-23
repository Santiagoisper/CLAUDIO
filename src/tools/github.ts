import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

interface GHRepo {
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  updated_at: string;
}

interface GHIssue {
  number: number;
  title: string;
  state: string;
}

async function ghFetch(path: string): Promise<unknown> {
  const base = process.env.GITHUB_API_BASE_URL ?? "https://api.github.com";
  const res = await fetch(`${base}${path}`, {
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${await res.text()}`);
  return res.json();
}

export function registerGithubTools(server: McpServer) {
  server.tool(
    "claudio_github_repos",
    "Lista los repos de GitHub de Santiago",
    {
      limit: z.number().int().min(1).max(50).default(20),
    },
    async ({ limit }) => {
      const repos = await ghFetch(`/user/repos?sort=updated&per_page=${limit}`) as GHRepo[];
      const text = repos.map(r =>
        `${r.private ? "[privado]" : "[público]"} ${r.full_name}${r.description ? ` — ${r.description}` : ""}`
      ).join("\n");
      return { content: [{ type: "text" as const, text: text || "Sin repos." }] };
    }
  );

  server.tool(
    "claudio_github_issues",
    "Lista issues de un repo de GitHub",
    {
      repo: z.string().describe("owner/repo"),
      state: z.enum(["open", "closed", "all"]).default("open"),
    },
    async ({ repo, state }) => {
      const issues = await ghFetch(`/repos/${repo}/issues?state=${state}&per_page=20`) as GHIssue[];
      if (issues.length === 0) {
        return { content: [{ type: "text" as const, text: `Sin issues ${state} en ${repo}.` }] };
      }
      const text = issues.map(i => `#${i.number} [${i.state}] ${i.title}`).join("\n");
      return { content: [{ type: "text" as const, text }] };
    }
  );
}
