import { jest } from "@jest/globals";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerPortfolioTools } from "./portfolio";

declare const global: any;

// Stub mínimo de McpServer que solo captura los handlers registrados por
// `server.tool(name, description, schema, handler)`, para poder invocarlos
// directamente sin levantar un McpServer/transport real.
function createCapturingServer() {
  const handlers = new Map<string, (input: any) => Promise<any>>();
  const stub = {
    tool: (name: string, _description: string, _schema: unknown, handler: (input: any) => Promise<any>) => {
      handlers.set(name, handler);
    },
  };
  return { stub: stub as unknown as McpServer, handlers };
}

describe("registerPortfolioTools", () => {
  const ORIGINAL_TOKEN = process.env.GITHUB_TOKEN;

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    if (ORIGINAL_TOKEN === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = ORIGINAL_TOKEN;
    jest.resetAllMocks();
  });

  it("devuelve un error claro cuando falta GITHUB_TOKEN, sin llamar a fetch", async () => {
    delete process.env.GITHUB_TOKEN;
    const { stub, handlers } = createCapturingServer();
    await registerPortfolioTools(stub);

    const result = await handlers.get("scan_repos_portfolio")!({ limit: 20 });

    expect(result.content[0].text).toContain("GitHub no está configurado en CLAUDIO");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("get_repo_details también falla claro sin GITHUB_TOKEN", async () => {
    delete process.env.GITHUB_TOKEN;
    const { stub, handlers } = createCapturingServer();
    await registerPortfolioTools(stub);

    const result = await handlers.get("get_repo_details")!({ repo: "Santiagoisper/demo-repo" });

    expect(result.content[0].text).toContain("GitHub no está configurado en CLAUDIO");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("escanea un repo puntual vía la API de GitHub y detecta stack y features reales", async () => {
    process.env.GITHUB_TOKEN = "fake-token";
    const { stub, handlers } = createCapturingServer();
    await registerPortfolioTools(stub);

    const repoMeta = {
      name: "demo-repo",
      full_name: "Santiagoisper/demo-repo",
      description: "Repo de prueba",
      html_url: "https://github.com/Santiagoisper/demo-repo",
      language: "TypeScript",
      updated_at: "2026-10-01T12:00:00Z",
      default_branch: "main",
    };
    const tree = {
      tree: [
        { path: "package.json", type: "blob" },
        { path: "src/index.ts", type: "blob" },
        { path: "tests/index.test.ts", type: "blob" },
        { path: ".github/workflows/ci.yml", type: "blob" },
        { path: "Dockerfile", type: "blob" },
        { path: "README.md", type: "blob" },
        { path: "src", type: "tree" },
      ],
      truncated: false,
    };

    global.fetch.mockImplementation((url: unknown) => {
      const href = String(url);
      if (href.includes("/git/trees/")) {
        return Promise.resolve({ ok: true, status: 200, json: async () => tree });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => repoMeta });
    });

    const result = await handlers.get("scan_repos_portfolio")!({
      limit: 20,
      repo: "Santiagoisper/demo-repo",
    });
    const [parsed] = JSON.parse(result.content[0].text);

    expect(parsed.name).toBe("demo-repo");
    expect(parsed.description).toBe("Repo de prueba");
    expect(parsed.location).toBe("https://github.com/Santiagoisper/demo-repo");
    expect(parsed.last_updated).toBe("2026-10-01");
    expect(parsed.tech_stack).toEqual(expect.arrayContaining(["TypeScript", "Node.js"]));
    expect(parsed.key_features).toEqual(expect.arrayContaining([
      "Tiene tests",
      "Tiene Docker",
      "Tiene CI (GitHub Actions)",
      "Tiene README",
    ]));
    // Solo los 6 blobs cuentan como archivos; el entry "src" es type "tree" (carpeta).
    expect(parsed.files_scanned).toBe(6);
  });

  it("escanea la lista de repos recientes cuando no se pasa `repo`", async () => {
    process.env.GITHUB_TOKEN = "fake-token";
    const { stub, handlers } = createCapturingServer();
    await registerPortfolioTools(stub);

    const repoList = [
      {
        name: "repo-uno",
        full_name: "Santiagoisper/repo-uno",
        description: null,
        html_url: "https://github.com/Santiagoisper/repo-uno",
        language: "Python",
        updated_at: "2026-09-20T08:00:00Z",
        default_branch: "main",
      },
    ];

    global.fetch.mockImplementation((url: unknown) => {
      const href = String(url);
      if (href.includes("/user/repos")) {
        return Promise.resolve({ ok: true, status: 200, json: async () => repoList });
      }
      if (href.includes("/git/trees/")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ tree: [{ path: "requirements.txt", type: "blob" }], truncated: false }),
        });
      }
      return Promise.resolve({ ok: false, status: 404, text: async () => "not found" });
    });

    const result = await handlers.get("scan_repos_portfolio")!({ limit: 20 });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe("repo-uno");
    expect(parsed[0].description).toBe("repo-uno"); // sin description: cae al nombre
    expect(parsed[0].tech_stack).toEqual(expect.arrayContaining(["Python"]));
  });

  it("no revienta el servidor si GitHub responde con error: devuelve mensaje en el content", async () => {
    process.env.GITHUB_TOKEN = "fake-token";
    const { stub, handlers } = createCapturingServer();
    await registerPortfolioTools(stub);

    global.fetch.mockResolvedValue({ ok: false, status: 404, text: async () => "Not Found" });

    const result = await handlers.get("get_repo_details")!({ repo: "Santiagoisper/no-existe" });

    expect(result.content[0].text).toContain("Error reading repo");
  });
});
