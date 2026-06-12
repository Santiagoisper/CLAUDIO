import { jest } from "@jest/globals";

declare const global: Record<string, unknown>;

beforeAll(() => {
  process.env.GITHUB_TOKEN = "test-token";
  process.env.GITHUB_API_BASE_URL = "https://api.github.com";
  delete process.env.GITHUB_ALLOWED_API_HOSTS;
  global.fetch = jest.fn();
});

afterEach(() => {
  (global.fetch as ReturnType<typeof jest.fn>).mockClear();
});

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>;
}>;

function buildMockServer() {
  const handlers = new Map<string, ToolHandler>();
  const server = {
    tool: (_name: string, _desc: string, _schema: unknown, handler: ToolHandler) => {
      handlers.set(_name, handler);
    },
  };
  return { server, handlers };
}

function mockFetchOk(data: unknown) {
  (global.fetch as ReturnType<typeof jest.fn>).mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => data,
    text: async () => "",
  });
}

function mockFetchError(status: number, body = "error") {
  (global.fetch as ReturnType<typeof jest.fn>).mockResolvedValueOnce({
    ok: false,
    status,
    json: async () => ({}),
    text: async () => body,
  });
}

const fakeRepo = {
  name: "CLAUDIO",
  full_name: "santiagoisper/CLAUDIO",
  description: "Mi asistente",
  private: false,
  html_url: "https://github.com/santiagoisper/CLAUDIO",
  language: "TypeScript",
  stargazers_count: 5,
  archived: false,
  fork: false,
  updated_at: "2024-01-01T00:00:00Z",
  default_branch: "main",
  open_issues_count: 2,
  topics: ["mcp", "ai"],
};

describe("github tools", () => {
  let handlers: Map<string, ToolHandler>;

  beforeEach(async () => {
    const mock = buildMockServer();
    handlers = mock.handlers;
    const { registerGithubTools } = await import("./github");
    registerGithubTools(mock.server as never);
  });

  describe("claudio_github_repos", () => {
    it("lista repos del usuario", async () => {
      mockFetchOk([fakeRepo]);
      const handler = handlers.get("claudio_github_repos")!;
      const result = await handler({ limit: 5 });
      expect(result.content[0].text).toMatch(/santiagoisper\/CLAUDIO/);
      expect(result.content[0].text).toMatch(/TypeScript/);
    });

    it("devuelve mensaje cuando no hay repos", async () => {
      mockFetchOk([]);
      const handler = handlers.get("claudio_github_repos")!;
      const result = await handler({ limit: 5 });
      expect(result.content[0].text).toMatch(/Sin repos/);
    });

    it("propaga el error de GitHub como excepción", async () => {
      mockFetchError(401, "Unauthorized");
      const handler = handlers.get("claudio_github_repos")!;
      await expect(handler({ limit: 5 })).rejects.toThrow("GitHub 401");
    });
  });

  describe("claudio_github_search_repos", () => {
    it("busca repos y devuelve resultados formateados", async () => {
      mockFetchOk({ items: [fakeRepo] });
      const handler = handlers.get("claudio_github_search_repos")!;
      const result = await handler({ query: "topic:mcp", limit: 5, sort: "stars", order: "desc" });
      expect(result.content[0].text).toMatch(/santiagoisper\/CLAUDIO/);
    });

    it("devuelve mensaje cuando no hay resultados", async () => {
      mockFetchOk({ items: [] });
      const handler = handlers.get("claudio_github_search_repos")!;
      const result = await handler({ query: "xyz-no-match", limit: 5, sort: "stars", order: "desc" });
      expect(result.content[0].text).toMatch(/Sin resultados/);
    });
  });

  describe("claudio_github_repo", () => {
    it("devuelve detalle de un repo", async () => {
      mockFetchOk(fakeRepo);
      const handler = handlers.get("claudio_github_repo")!;
      const result = await handler({ repo: "santiagoisper/CLAUDIO" });
      expect(result.content[0].text).toMatch(/CLAUDIO/);
      expect(result.content[0].text).toMatch(/Branch por defecto: main/);
      expect(result.content[0].text).toMatch(/Issues abiertas: 2/);
    });

    it("muestra topics si existen", async () => {
      mockFetchOk({ ...fakeRepo, topics: ["mcp", "typescript"] });
      const handler = handlers.get("claudio_github_repo")!;
      const result = await handler({ repo: "santiagoisper/CLAUDIO" });
      expect(result.content[0].text).toMatch(/Topics: mcp, typescript/);
    });
  });

  describe("claudio_github_issues", () => {
    it("lista issues de un repo", async () => {
      mockFetchOk([
        { number: 1, title: "Bug crítico", state: "open" },
        { number: 2, title: "Feature request", state: "open" },
      ]);
      const handler = handlers.get("claudio_github_issues")!;
      const result = await handler({ repo: "santiagoisper/CLAUDIO", state: "open" });
      expect(result.content[0].text).toMatch(/#1/);
      expect(result.content[0].text).toMatch(/Bug crítico/);
    });

    it("filtra pull requests de la lista de issues", async () => {
      mockFetchOk([
        { number: 1, title: "Un issue", state: "open" },
        { number: 2, title: "Un PR", state: "open", pull_request: {} },
      ]);
      const handler = handlers.get("claudio_github_issues")!;
      const result = await handler({ repo: "santiagoisper/CLAUDIO", state: "open" });
      expect(result.content[0].text).toMatch(/#1/);
      expect(result.content[0].text).not.toMatch(/Un PR/);
    });

    it("devuelve mensaje cuando no hay issues", async () => {
      mockFetchOk([]);
      const handler = handlers.get("claudio_github_issues")!;
      const result = await handler({ repo: "santiagoisper/CLAUDIO", state: "open" });
      expect(result.content[0].text).toMatch(/Sin issues/);
    });
  });
});
