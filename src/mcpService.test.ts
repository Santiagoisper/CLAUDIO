import { jest } from "@jest/globals";
import { Issue, MCPService, WorkflowStatus } from "./mcpService";

// Mock global fetch para Jest
declare const global: any;

beforeAll(() => {
  global.fetch = jest.fn();
});

afterEach(() => {
  global.fetch.mockClear();
});

describe("MCPService v2", () => {
  const endpoint = "https://fake-mcp.local";
  const token = "TOK_TEST";
  const service = new MCPService(endpoint, token);

  it("devuelve los issues abiertos correctamente", async () => {
    const mockIssues: Issue[] = [{ number: 10, title: "Bug", url: "https://...", state: "open" }];
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ issues: mockIssues }),
      status: 200,
    });

    const issues = await service.getOpenIssues("Santiagoisper/CLAUDIO");
    expect(global.fetch).toHaveBeenCalledWith(
      `${endpoint}/list-issues`,
      expect.objectContaining({ method: "POST" }),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].number).toBe(10);
  });

  it("devuelve array vacio si el llamado falla", async () => {
    global.fetch.mockRejectedValueOnce(new Error("fallo de red"));
    const issues = await service.getOpenIssues("Santiagoisper/CLAUDIO");
    expect(issues).toEqual([]);
  });

  it("devuelve el estado de los workflows", async () => {
    const mockWorkflows: WorkflowStatus[] = [
      { id: 1, name: "CI", status: "completed", conclusion: "success", url: "https://..." },
    ];
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ workflows: mockWorkflows }),
      status: 200,
    });

    const workflows = await service.getWorkflowsStatus("Santiagoisper/CLAUDIO");
    expect(workflows).toHaveLength(1);
    expect(workflows[0].name).toBe("CI");
  });

  it("createIssue retorna issue si todo va bien", async () => {
    const fakeIssue: Issue = {
      number: 33,
      title: "Test Create",
      url: "https://...",
      state: "open",
    };
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ issue: fakeIssue }),
      status: 200,
    });

    const issue = await service.createIssue("Santiagoisper/CLAUDIO", "Test Create", "Cuerpo");
    expect(issue?.number).toBe(33);
  });

  it("createIssue retorna null si hay error", async () => {
    global.fetch.mockRejectedValueOnce(new Error("fail"));
    const issue = await service.createIssue("Santiagoisper/CLAUDIO", "T", "B");
    expect(issue).toBeNull();
  });
});
