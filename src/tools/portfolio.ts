import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ghFetch } from "./github.js";

// Escanea el portfolio de repos de Santiago via la API real de GitHub, no el
// filesystem local: este servidor corre en Railway (la nube), sin acceso al
// disco de su Mac/Windows. Antes leía C:\Users\Santiago\source\repos\... con
// fs.readdirSync, lo que nunca pudo funcionar fuera de esa máquina puntual.

interface RepoIndex {
  name: string;
  description: string;
  tech_stack: string[];
  key_features: string[];
  files_scanned: number;
  location: string;
  last_updated: string;
}

interface GHRepoMeta {
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  language: string | null;
  updated_at: string;
  default_branch: string;
}

interface GHTreeEntry {
  path: string;
  type: "blob" | "tree" | "commit";
}

interface GHTreeResponse {
  tree: GHTreeEntry[];
  truncated?: boolean;
}

// Presencia de estos archivos (en cualquier profundidad) delata el stack
// técnico sin tener que clonar ni abrir el repo. No hace falta exhaustividad
// perfecta, solo cubrir los ecosistemas más comunes.
const TECH_STACK_MARKERS: Array<{ file: string; tech: string }> = [
  { file: "package.json", tech: "Node.js" },
  { file: "requirements.txt", tech: "Python" },
  { file: "pyproject.toml", tech: "Python" },
  { file: "go.mod", tech: "Go" },
  { file: "cargo.toml", tech: "Rust" },
  { file: "pom.xml", tech: "Java" },
  { file: "build.gradle", tech: "Java/Kotlin" },
  { file: "gemfile", tech: "Ruby" },
  { file: "composer.json", tech: "PHP" },
  { file: "tsconfig.json", tech: "TypeScript" },
];

function missingGithubTokenResult() {
  return {
    content: [{
      type: "text" as const,
      text: "GitHub no está configurado en CLAUDIO.",
    }],
  };
}

async function fetchRepoMeta(repoFullName: string): Promise<GHRepoMeta> {
  return ghFetch(`/repos/${repoFullName}`) as Promise<GHRepoMeta>;
}

async function fetchRepoTree(repoFullName: string, sha: string): Promise<GHTreeResponse> {
  return ghFetch(`/repos/${repoFullName}/git/trees/${sha}?recursive=1`) as Promise<GHTreeResponse>;
}

function detectTechStack(paths: string[], primaryLanguage: string | null): string[] {
  const stack = new Set<string>();
  if (primaryLanguage) stack.add(primaryLanguage);
  const lowerPaths = paths.map((p) => p.toLowerCase());
  for (const marker of TECH_STACK_MARKERS) {
    if (lowerPaths.some((p) => p === marker.file || p.endsWith(`/${marker.file}`))) {
      stack.add(marker.tech);
    }
  }
  return [...stack];
}

function detectKeyFeatures(paths: string[]): string[] {
  const features: string[] = [];
  const lowerPaths = paths.map((p) => p.toLowerCase());

  if (lowerPaths.some((p) => p.includes("/test") || p.startsWith("test") || p.includes("/spec") || p.includes(".test.") || p.includes(".spec."))) {
    features.push("Tiene tests");
  }
  if (lowerPaths.some((p) => p === "dockerfile" || p.endsWith("/dockerfile") || p === "docker-compose.yml" || p.endsWith("/docker-compose.yml"))) {
    features.push("Tiene Docker");
  }
  if (lowerPaths.some((p) => p.startsWith(".github/workflows/"))) {
    features.push("Tiene CI (GitHub Actions)");
  }
  if (lowerPaths.some((p) => p === "readme.md")) {
    features.push("Tiene README");
  }
  if (lowerPaths.some((p) => p.includes("/migrations/") || p.startsWith("migrations/"))) {
    features.push("Tiene migraciones de DB");
  }
  return features;
}

async function buildRepoIndexFromMeta(meta: GHRepoMeta): Promise<RepoIndex> {
  let paths: string[] = [];
  let truncated = false;
  try {
    const tree = await fetchRepoTree(meta.full_name, meta.default_branch);
    paths = tree.tree.filter((entry) => entry.type === "blob").map((entry) => entry.path);
    truncated = Boolean(tree.truncated);
  } catch {
    // Repo vacío, rama por defecto sin árbol accesible, etc. — seguimos solo con metadata.
  }

  const key_features = detectKeyFeatures(paths);
  if (truncated) key_features.push("Árbol de archivos truncado por GitHub (repo muy grande)");

  return {
    name: meta.name,
    description: meta.description || meta.name,
    tech_stack: detectTechStack(paths, meta.language),
    key_features,
    files_scanned: paths.length,
    location: meta.html_url,
    last_updated: meta.updated_at.slice(0, 10),
  };
}

async function buildRepoIndex(repoFullName: string): Promise<RepoIndex> {
  const meta = await fetchRepoMeta(repoFullName);
  return buildRepoIndexFromMeta(meta);
}

export async function registerPortfolioTools(s: McpServer) {
  s.tool(
    "scan_repos_portfolio",
    "Escanea los repos de GitHub de Santiago (vía API, no filesystem local) y devuelve conocimiento indexado: stack técnico, features y metadata",
    {
      limit: z.number().int().min(1).max(50).default(20).describe("Cantidad de repos a escanear, ordenados por última actualización"),
      repo: z.string().optional().describe("owner/repo puntual a escanear, en vez de listar los más recientes"),
    },
    async ({ limit, repo }) => {
      if (!process.env.GITHUB_TOKEN) return missingGithubTokenResult();

      try {
        const repos: RepoIndex[] = [];
        if (repo) {
          repos.push(await buildRepoIndex(repo));
        } else {
          const list = await ghFetch(
            `/user/repos?sort=updated&direction=desc&per_page=${limit}`,
          ) as GHRepoMeta[];
          for (const meta of list) {
            repos.push(await buildRepoIndexFromMeta(meta));
          }
        }

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(repos, null, 2),
          }],
        };
      } catch (e) {
        return {
          content: [{
            type: "text" as const,
            text: `Error scanning repos: ${(e as Error).message}`,
          }],
        };
      }
    },
  );

  s.tool(
    "get_repo_details",
    "Devuelve información detallada de un repo de GitHub puntual: metadata, stack técnico y features detectados en el árbol de archivos",
    {
      repo: z.string().describe("owner/repo"),
    },
    async ({ repo }) => {
      if (!process.env.GITHUB_TOKEN) return missingGithubTokenResult();

      try {
        const index = await buildRepoIndex(repo);
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(index, null, 2),
          }],
        };
      } catch (e) {
        return {
          content: [{
            type: "text" as const,
            text: `Error reading repo: ${(e as Error).message}`,
          }],
        };
      }
    },
  );
}
