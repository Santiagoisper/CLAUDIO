import { jest } from "@jest/globals";
import { DatabaseSync } from "node:sqlite";

let testDb: DatabaseSync;

function createTestDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(`
    CREATE TABLE profiles (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      email TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE memories (
      id TEXT PRIMARY KEY,
      profile_id TEXT,
      source_id TEXT,
      kind TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  db.prepare(
    "INSERT INTO profiles (id, display_name, email) VALUES ('santiago', 'Santiago', 'test@test.com')"
  ).run();
  return db;
}

jest.unstable_mockModule("../db/index", () => ({
  getDb: () => testDb,
  loadSqliteVec: jest.fn(async () => false),
}));

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>;
  structuredContent?: Record<string, unknown>;
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

describe("briefing tools", () => {
  let handlers: Map<string, ToolHandler>;

  beforeEach(async () => {
    testDb = createTestDb();
    const mock = buildMockServer();
    handlers = mock.handlers;
    const { registerBriefingTools } = await import("./briefing");
    registerBriefingTools(mock.server as never);
  });

  afterEach(() => {
    testDb.close();
  });

  describe("claudio_briefing", () => {
    it("devuelve briefing con DB vacía", async () => {
      const handler = handlers.get("claudio_briefing")!;
      const result = await handler({});
      expect(result.content[0].text).toMatch(/Briefing de sesion/);
      expect(result.content[0].text).toMatch(/Memoria \(0 recuerdos\)/);
    });

    it("incluye proyectos activos cuando existen", async () => {
      testDb.prepare(
        "INSERT INTO memories (id, profile_id, kind, content, metadata_json) VALUES ('p1', 'santiago', 'proyecto', 'CLAUDIO asistente personal', '{}')"
      ).run();
      const handler = handlers.get("claudio_briefing")!;
      const result = await handler({});
      expect(result.content[0].text).toMatch(/Proyectos activos/);
      expect(result.content[0].text).toMatch(/CLAUDIO asistente personal/);
    });

    it("muestra actividad reciente del último día", async () => {
      testDb.prepare(
        "INSERT INTO memories (id, profile_id, kind, content, metadata_json, created_at) VALUES ('r1', 'santiago', 'nota', 'Nota reciente de hoy', '{}', datetime('now'))"
      ).run();
      const handler = handlers.get("claudio_briefing")!;
      const result = await handler({});
      expect(result.content[0].text).toMatch(/Ultimas 24hs/);
      expect(result.content[0].text).toMatch(/Nota reciente de hoy/);
    });

    it("muestra Sin actividad reciente cuando no hay entradas del último día", async () => {
      testDb.prepare(
        "INSERT INTO memories (id, profile_id, kind, content, metadata_json, created_at) VALUES ('old1', 'santiago', 'nota', 'Nota vieja', '{}', datetime('now', '-3 days'))"
      ).run();
      const handler = handlers.get("claudio_briefing")!;
      const result = await handler({});
      expect(result.content[0].text).toMatch(/Sin actividad reciente/);
    });

    it("el structuredContent incluye el briefing como string", async () => {
      const handler = handlers.get("claudio_briefing")!;
      const result = await handler({});
      expect(typeof result.structuredContent?.briefing).toBe("string");
      expect((result.structuredContent?.briefing as string).length).toBeGreaterThan(0);
    });

    it("contabiliza recuerdos por categoría correctamente", async () => {
      testDb.prepare(
        "INSERT INTO memories (id, profile_id, kind, content, metadata_json) VALUES ('c1', 'santiago', 'nota', 'A', '{}')"
      ).run();
      testDb.prepare(
        "INSERT INTO memories (id, profile_id, kind, content, metadata_json) VALUES ('c2', 'santiago', 'nota', 'B', '{}')"
      ).run();
      testDb.prepare(
        "INSERT INTO memories (id, profile_id, kind, content, metadata_json) VALUES ('c3', 'santiago', 'proyecto', 'P', '{}')"
      ).run();
      const handler = handlers.get("claudio_briefing")!;
      const result = await handler({});
      expect(result.content[0].text).toMatch(/Memoria \(3 recuerdos\)/);
      expect(result.content[0].text).toMatch(/nota: 2/);
      expect(result.content[0].text).toMatch(/proyecto: 1/);
    });
  });
});
