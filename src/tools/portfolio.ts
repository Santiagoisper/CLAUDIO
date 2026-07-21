import fs from "node:fs";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

interface RepoIndex {
  name: string;
  description: string;
  tech_stack: string[];
  key_features: string[];
  files_scanned: number;
  location: string;
  last_updated: string;
}

export async function registerPortfolioTools(s: McpServer) {
  s.tool(
    "scan_repos_portfolio",
    "Scan all repos in C:\\Users\\Santiago\\source\\repos\\Santiagoisper and return indexed knowledge",
    {
      base_path: z.string().optional().describe("Base path to scan (default: user's repos folder)"),
    },
    async (input) => {
    const basePath = input.base_path || "C:\\Users\\Santiago\\source\\repos\\Santiagoisper";
    const repos: RepoIndex[] = [];
    
    try {
      const entries = fs.readdirSync(basePath, { withFileTypes: true })
        .filter(e => e.isDirectory() && !e.name.startsWith("."))
        .slice(0, 20);

      for (const entry of entries) {
        const repoPath = path.join(basePath, entry.name);
        const repoIndex = await scanRepoFolder(repoPath, entry.name);
        if (repoIndex) repos.push(repoIndex);
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify(repos, null, 2)
        }]
      };
    } catch (e) {
      return {
        content: [{
          type: "text",
          text: `Error scanning repos: ${(e as Error).message}`
        }]
      };
    }
  });

  s.tool(
    "get_repo_details",
    "Get detailed information about a specific repo including README, package.json, and tech analysis",
    {
      repo_name: z.string().describe("Name of the repo to analyze"),
    },
    async (input) => {
    const basePath = "C:\\Users\\Santiago\\source\\repos\\Santiagoisper";
    const repoPath = path.join(basePath, input.repo_name);

    try {
      const details = {
        name: input.repo_name,
        readme: null as string | null,
        package_json: null as Record<string, any> | null,
        structure: [] as string[],
        analysis: ""
      };

      const readmePath = path.join(repoPath, "README.md");
      if (fs.existsSync(readmePath)) {
        details.readme = fs.readFileSync(readmePath, "utf-8").slice(0, 2000);
      }

      const pkgPath = path.join(repoPath, "package.json");
      if (fs.existsSync(pkgPath)) {
        details.package_json = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      }

      const dirs = fs.readdirSync(repoPath).filter(f => 
        !f.startsWith(".") && fs.statSync(path.join(repoPath, f)).isDirectory()
      ).slice(0, 10);
      details.structure = dirs;

      details.analysis = generateAnalysis(details);

      return {
        content: [{
          type: "text",
          text: JSON.stringify(details, null, 2)
        }]
      };
    } catch (e) {
      return {
        content: [{
          type: "text",
          text: `Error reading repo: ${(e as Error).message}`
        }]
      };
    }
  });
}

async function scanRepoFolder(repoPath: string, name: string): Promise<RepoIndex | null> {
  try {
    const readmePath = path.join(repoPath, "README.md");
    const pkgPath = path.join(repoPath, "package.json");
    
    let description = "";
    const tech_stack: string[] = [];
    const key_features: string[] = [];

    if (fs.existsSync(readmePath)) {
      const content = fs.readFileSync(readmePath, "utf-8");
      description = content.split("\n")[0].replace(/^#+\s*/, "");
      
      if (content.includes("Next.js")) tech_stack.push("Next.js");
      if (content.includes("React")) tech_stack.push("React");
      if (content.includes("TypeScript")) tech_stack.push("TypeScript");
      if (content.includes("Python")) tech_stack.push("Python");
      if (content.includes("Node")) tech_stack.push("Node.js");
      if (content.includes("API")) key_features.push("API Backend");
      if (content.includes("Database")) key_features.push("Database");
      if (content.includes("Auth")) key_features.push("Authentication");
    }

    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      
      if (pkg.dependencies) {
        if (pkg.dependencies.next) tech_stack.push("Next.js");
        if (pkg.dependencies.react) tech_stack.push("React");
        if (pkg.dependencies["@neondatabase/serverless"]) tech_stack.push("Neon DB");
        if (pkg.dependencies["drizzle-orm"]) tech_stack.push("Drizzle ORM");
        if (pkg.dependencies.tailwindcss) tech_stack.push("Tailwind CSS");
        if (pkg.dependencies["react-dom"]) tech_stack.push("React DOM");
      }

      if (pkg.scripts) {
        if (pkg.scripts.dev) key_features.push("Local Development");
        if (pkg.scripts.build) key_features.push("Production Build");
        if (pkg.scripts.test) key_features.push("Testing");
      }
    }

    const files = fs.readdirSync(repoPath).length;

    return {
      name,
      description: description || name,
      tech_stack: [...new Set(tech_stack)],
      key_features: [...new Set(key_features)],
      files_scanned: files,
      location: repoPath,
      last_updated: new Date().toISOString().slice(0, 10)
    };
  } catch {
    return null;
  }
}

function generateAnalysis(details: any): string {
  const parts: string[] = [];
  
  if (details.package_json?.name) {
    parts.push(`Project: ${details.package_json.name}`);
  }
  
  if (details.package_json?.scripts) {
    const scripts = Object.keys(details.package_json.scripts);
    parts.push(`Available scripts: ${scripts.join(", ")}`);
  }

  if (details.package_json?.dependencies) {
    const depCount = Object.keys(details.package_json.dependencies).length;
    parts.push(`Dependencies: ${depCount} packages`);
  }

  if (details.readme) {
    parts.push("README found with documentation");
  }

  return parts.join(" | ");
}
