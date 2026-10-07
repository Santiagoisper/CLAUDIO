import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

interface GHRepo {
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  html_url: string;
  language: string | null;
  stargazers_count: number;
  archived: boolean;
  fork: boolean;
  updated_at: string;
}

interface GHRepoDetails extends GHRepo {
  default_branch: string;
  open_issues_count: number;
  topics?: string[];
}

interface GHIssue {
  number: number;
  title: string;
  state: string;
  pull_request?: unknown;
}

interface GHSearchReposResponse {
  items: GHRepo[];
}

interface GHUser {
  login: string;
  name: string | null;
}

interface PersonalGithubCache {
  user: GHUser;
  repos: GHRepo[];
  updatedAt: string;
}

let personalGithubCache: PersonalGithubCache | null = null;

function getGithubApiBaseUrl(): URL {
  const base = new URL(process.env.GITHUB_API_BASE_URL ?? "https://api.github.com");
  const allowedHosts = (process.env.GITHUB_ALLOWED_API_HOSTS ?? "")
    .split(",")
    .map(host => host.trim())
    .filter(Boolean);

  if (allowedHosts.length > 0 && !allowedHosts.includes(base.host)) {
    throw new Error(`GitHub API host not allowed: ${base.host}`);
  }

  return base;
}

export async function ghFetch(path: string): Promise<unknown> {
  const base = getGithubApiBaseUrl();
  const res = await fetch(new URL(path, base), {
    signal: AbortSignal.timeout(30_000),
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${await res.text()}`);
  return res.json();
}

async function fetchAllPersonalRepos(): Promise<GHRepo[]> {
  const repos: GHRepo[] = [];
  for (let page = 1; page <= 100; page += 1) {
    const batch = await ghFetch(
      `/user/repos?sort=updated&direction=desc&per_page=100&page=${page}`,
    ) as GHRepo[];
    repos.push(...batch);
    if (batch.length < 100) break;
  }
  return repos;
}

function githubSearchTerms(question: string): string[] {
  return (question.toLocaleLowerCase("es-AR").match(/[\p{L}\p{N}]{3,}/gu) ?? [])
    .filter((term) => !["github", "repositorio", "repositorios", "tengo", "sobre", "para", "cuales"].includes(term));
}

export async function refreshPersonalGithubContext(): Promise<{
  updatedAt: string;
  repoCount: number;
}> {
  if (!process.env.GITHUB_TOKEN) {
    throw new Error("GitHub no está configurado en CLAUDIO.");
  }
  const [user, repos] = await Promise.all([
    ghFetch("/user") as Promise<GHUser>,
    fetchAllPersonalRepos(),
  ]);
  personalGithubCache = {
    user,
    repos,
    updatedAt: new Date().toISOString(),
  };
  return {
    updatedAt: personalGithubCache.updatedAt,
    repoCount: personalGithubCache.repos.length,
  };
}

export async function getPersonalGithubContext(question: string): Promise<string> {
  await refreshPersonalGithubContext();
  const cache = personalGithubCache!;
  const terms = githubSearchTerms(question);
  const rankedRepos = [...cache.repos].sort((a, b) => {
    const aText = `${a.full_name} ${a.description ?? ""} ${a.language ?? ""}`.toLocaleLowerCase("es-AR");
    const bText = `${b.full_name} ${b.description ?? ""} ${b.language ?? ""}`.toLocaleLowerCase("es-AR");
    const aScore = terms.filter((term) => aText.includes(term)).length;
    const bScore = terms.filter((term) => bText.includes(term)).length;
    return bScore - aScore;
  });
  const selectedRepos = rankedRepos.slice(0, 60);
  const repoList = selectedRepos
    .map((repo) => {
      const details = [
        repo.full_name,
        repo.private ? "privado" : "público",
        repo.language ?? "sin lenguaje detectado",
        repo.description ?? "sin descripción",
        `actualizado: ${repo.updated_at}`,
      ];
      return details.join(" · ");
    })
    .join("\n");
  const selectionLabel = terms.length > 0 ? "Repositorios más relevantes" : "Repositorios más recientes";
  return `Cuenta GitHub personal: ${cache.user.name ?? cache.user.login} (@${cache.user.login})\nRepositorios actualizados en inventario: ${cache.repos.length}\n${selectionLabel} para esta consulta (máximo 60):\n${repoList || "Sin repositorios disponibles."}`;
}

function formatRepo(repo: GHRepo): string {
  const details = [
    repo.private ? "privado" : "público",
    repo.archived ? "archivado" : null,
    repo.fork ? "fork" : null,
    repo.language ?? null,
    `★${repo.stargazers_count}`,
  ].filter(Boolean).join(" · ");

  return `[${details}] ${repo.full_name}${repo.description ? ` — ${repo.description}` : ""}\n${repo.html_url}\nActualizado: ${repo.updated_at}`;
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
      const text = repos.map(formatRepo).join("\n\n");
      return { content: [{ type: "text" as const, text: text || "Sin repos." }] };
    }
  );

  server.tool(
    "claudio_github_search_repos",
    "Busca repositorios públicos interesantes en GitHub usando el buscador nativo",
    {
      query: z.string().describe("Consulta GitHub search, por ejemplo: topic:mcp language:TypeScript stars:>100"),
      limit: z.number().int().min(1).max(20).default(5),
      sort: z.enum(["stars", "updated"]).default("stars"),
      order: z.enum(["desc", "asc"]).default("desc"),
    },
    async ({ query, limit, sort, order }) => {
      const params = new URLSearchParams({
        q: query,
        per_page: String(limit),
        sort,
        order,
      });
      const result = await ghFetch(`/search/repositories?${params.toString()}`) as GHSearchReposResponse;
      const text = result.items.map(formatRepo).join("\n\n");
      return {
        content: [{
          type: "text" as const,
          text: text || `Sin resultados para: ${query}`,
        }],
      };
    }
  );

  server.tool(
    "claudio_github_repo",
    "Devuelve un resumen de un repositorio de GitHub para revisarlo rápido",
    {
      repo: z.string().describe("owner/repo"),
    },
    async ({ repo }) => {
      const details = await ghFetch(`/repos/${repo}`) as GHRepoDetails;
      const lines = [
        formatRepo(details),
        `Branch por defecto: ${details.default_branch}`,
        `Issues abiertas: ${details.open_issues_count}`,
        details.topics && details.topics.length > 0 ? `Topics: ${details.topics.join(", ")}` : null,
      ].filter(Boolean);
      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
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
      const issues = (await ghFetch(`/repos/${repo}/issues?state=${state}&per_page=20`) as GHIssue[])
        .filter(issue => !issue.pull_request);
      if (issues.length === 0) {
        return { content: [{ type: "text" as const, text: `Sin issues ${state} en ${repo}.` }] };
      }
      const text = issues.map(issue => `#${issue.number} [${issue.state}] ${issue.title}`).join("\n");
      return { content: [{ type: "text" as const, text }] };
    }
  );
}
