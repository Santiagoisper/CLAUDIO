// src/mcpService.ts v2 - Servicio MCP desacoplado y facil de testear

export interface Issue {
  number: number;
  title: string;
  url: string;
  state: string;
}

export interface WorkflowStatus {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  url: string;
}

export class MCPService {
  private endpoint: string;
  private token: string;

  constructor(endpoint: string, token: string) {
    this.endpoint = endpoint;
    this.token = token;
  }

  private async mcpFetch<T = any>(path: string, body: object): Promise<T> {
    try {
      const response = await fetch(`${this.endpoint}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        console.error(`[MCP] Error HTTP ${response.status} en ${path}`);
        throw new Error(`HTTP ${response.status}`);
      }
      return (await response.json()) as T;
    } catch (error) {
      console.error(`[MCP] Falla en ${path}:`, error);
      throw error;
    }
  }

  async getOpenIssues(repo: string): Promise<Issue[]> {
    try {
      const data = await this.mcpFetch<{ issues: Issue[] }>("/list-issues", {
        repo,
        state: "open",
      });
      return data.issues || [];
    } catch {
      return [];
    }
  }

  async getWorkflowsStatus(repo: string): Promise<WorkflowStatus[]> {
    try {
      const data = await this.mcpFetch<{ workflows: WorkflowStatus[] }>("/workflows-status", {
        repo,
      });
      return data.workflows || [];
    } catch {
      return [];
    }
  }

  async createIssue(repo: string, title: string, body: string): Promise<Issue | null> {
    try {
      const data = await this.mcpFetch<{ issue: Issue }>("/create-issue", {
        repo,
        title,
        body,
      });
      return data.issue ?? null;
    } catch {
      return null;
    }
  }
}
