import { jest } from "@jest/globals";
import { DatabaseSync } from "node:sqlite";

// --- In-memory DB setup ---

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
      expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE relations (
      id TEXT PRIMARY KEY,
      from_id TEXT NOT NULL,
      to_id TEXT NOT NULL,
      relation_type TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(from_id, to_id, relation_type)
    );
  `);
  try {
    db.exec(`CREATE VIRTUAL TABLE memories_fts USING fts5(
      content, kind, content='memories', content_rowid='rowid'
    )`);
    db.exec(`CREATE TRIGGER memories_ai AFTER INSERT ON memories BEGIN
      INSERT INTO memories_fts(rowid, content, kind) VALUES (new.rowid, new.content, new.kind);
    END`);
    db.exec(`CREATE TRIGGER memories_ad AFTER DELETE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, content, kind) VALUES('delete', old.rowid, old.content, old.kind);
    END`);
    db.exec(`CREATE TRIGGER memories_au AFTER UPDATE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, content, kind) VALUES('delete', old.rowid, old.content, old.kind);
      INSERT INTO memories_fts(rowid, content, kind) VALUES (new.rowid, new.content, new.kind);
    END`);
  } catch {
    // FTS5 not available in this env — recall will fallback to LIKE
  }
  db.prepare(
    "INSERT INTO profiles (id, display_name, email) VALUES ('santiago', 'Santiago Test', 'test@test.com')"
  ).run();
  return db;
}

let testDb: DatabaseSync;

jest.unstable_mockModule("../db/index", () => ({
  getDb: () => testDb,
  loadSqliteVec: jest.fn(async () => false),
}));

jest.unstable_mockModule("../db/neon", () => ({
  getNeonSql: jest.fn(() => null),
  ensureNeonSchema: jest.fn(async () => false),
}));

// --- Mock MCP server ---

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

// --- Tests ---

describe("memory tools", () => {
  let handlers: Map<string, ToolHandler>;

  beforeEach(async () => {
    testDb = createTestDb();
    const mock = buildMockServer();
    handlers = mock.handlers;
    const { registerMemoryTools } = await import("./memory");
    registerMemoryTools(mock.server as never);
  });

  afterEach(() => {
    testDb.close();
  });

  describe("claudio_remember", () => {
    it("guarda un recuerdo y devuelve su ID", async () => {
      const handler = handlers.get("claudio_remember")!;
      const result = await handler({ kind: "nota", content: "Comprar leche" });
      expect(result.content[0].text).toMatch(/Recuerdo guardado/);
      expect(result.structuredContent?.id).toBeTruthy();
      expect(result.structuredContent?.kind).toBe("nota");
    });

    it("persiste en la base de datos", async () => {
      const handler = handlers.get("claudio_remember")!;
      await handler({ kind: "proyecto", content: "CLAUDIO v2" });
      const row = testDb.prepare("SELECT * FROM memories WHERE kind = 'proyecto'").get() as { content: string } | undefined;
      expect(row?.content).toBe("CLAUDIO v2");
    });

    it("acepta metadata opcional", async () => {
      const handler = handlers.get("claudio_remember")!;
      const result = await handler({ kind: "nota", content: "Con meta", metadata: { source: "test" } });
      expect(result.content[0].text).toMatch(/Recuerdo guardado/);
    });
  });

  describe("claudio_recall", () => {
    beforeEach(() => {
      testDb.prepare(
        "INSERT INTO memories (id, profile_id, kind, content, metadata_json) VALUES ('aaa-1', 'santiago', 'nota', 'Aprender TypeScript', '{}')"
      ).run();
      testDb.prepare(
        "INSERT INTO memories (id, profile_id, kind, content, metadata_json) VALUES ('bbb-2', 'santiago', 'proyecto', 'CLAUDIO asistente personal', '{}')"
      ).run();
      try {
        testDb.exec("INSERT INTO memories_fts(memories_fts) VALUES('rebuild')");
      } catch { /* FTS5 not available */ }
    });

    it("retorna resultados cuando encuentra coincidencia", async () => {
      const handler = handlers.get("claudio_recall")!;
      const result = await handler({ query: "TypeScript", limit: 10 });
      expect(result.content[0].text).toMatch(/TypeScript/);
    });

    it("filtra por kind cuando se especifica", async () => {
      const handler = handlers.get("claudio_recall")!;
      const result = await handler({ query: "CLAUDIO", kind: "proyecto", limit: 10 });
      expect(result.content[0].text).toMatch(/CLAUDIO/);
    });

    it("devuelve mensaje cuando no hay resultados", async () => {
      const handler = handlers.get("claudio_recall")!;
      const result = await handler({ query: "xyznosuchterm12345", limit: 10 });
      expect(result.content[0].text).toMatch(/No se encontraron/);
    });
  });

  describe("claudio_memories", () => {
    beforeEach(() => {
      testDb.prepare(
        "INSERT INTO memories (id, profile_id, kind, content, metadata_json) VALUES ('m1', 'santiago', 'nota', 'Primer nota', '{}')"
      ).run();
      testDb.prepare(
        "INSERT INTO memories (id, profile_id, kind, content, metadata_json) VALUES ('m2', 'santiago', 'proyecto', 'Mi proyecto', '{}')"
      ).run();
    });

    it("lista todos los recuerdos", async () => {
      const handler = handlers.get("claudio_memories")!;
      const result = await handler({});
      expect(result.content[0].text).toMatch(/2 recuerdos/);
    });

    it("filtra por kind", async () => {
      const handler = handlers.get("claudio_memories")!;
      const result = await handler({ kind: "nota" });
      expect(result.content[0].text).toMatch(/1 recuerdos/);
    });

    it("devuelve mensaje cuando no hay recuerdos del kind", async () => {
      const handler = handlers.get("claudio_memories")!;
      const result = await handler({ kind: "inexistente" });
      expect(result.content[0].text).toMatch(/No hay recuerdos/);
    });
  });

  describe("claudio_update", () => {
    beforeEach(() => {
      testDb.prepare(
        "INSERT INTO memories (id, profile_id, kind, content, metadata_json) VALUES ('upd-1', 'santiago', 'nota', 'Contenido original', '{}')"
      ).run();
    });

    it("actualiza el contenido de un recuerdo existente", async () => {
      const handler = handlers.get("claudio_update")!;
      const result = await handler({ id: "upd-1", content: "Contenido nuevo" });
      expect(result.content[0].text).toMatch(/actualizado/);
      const row = testDb.prepare("SELECT content FROM memories WHERE id = 'upd-1'").get() as { content: string };
      expect(row.content).toBe("Contenido nuevo");
    });

    it("devuelve error si el ID no existe", async () => {
      const handler = handlers.get("claudio_update")!;
      const result = await handler({ id: "no-existe", content: "X" });
      expect(result.content[0].text).toMatch(/No se encontro/);
    });
  });

  describe("claudio_forget", () => {
    beforeEach(() => {
      testDb.prepare(
        "INSERT INTO memories (id, profile_id, kind, content, metadata_json) VALUES ('del-1', 'santiago', 'nota', 'Borrar esto', '{}')"
      ).run();
    });

    it("elimina un recuerdo por ID", async () => {
      const handler = handlers.get("claudio_forget")!;
      const result = await handler({ id: "del-1" });
      expect(result.content[0].text).toMatch(/eliminado/);
      const row = testDb.prepare("SELECT * FROM memories WHERE id = 'del-1'").get();
      expect(row).toBeUndefined();
    });

    it("devuelve error si el ID no existe", async () => {
      const handler = handlers.get("claudio_forget")!;
      const result = await handler({ id: "fantasma" });
      expect(result.content[0].text).toMatch(/No se encontro/);
    });
  });

  describe("claudio_status", () => {
    it("devuelve estado con 0 recuerdos en DB limpia", async () => {
      const handler = handlers.get("claudio_status")!;
      const result = await handler({});
      expect(result.content[0].text).toMatch(/Total de recuerdos: 0/);
    });

    it("incluye conteo por categoria", async () => {
      testDb.prepare(
        "INSERT INTO memories (id, profile_id, kind, content, metadata_json) VALUES ('s1', 'santiago', 'nota', 'Test', '{}')"
      ).run();
      const handler = handlers.get("claudio_status")!;
      const result = await handler({});
      expect(result.content[0].text).toMatch(/nota: 1/);
    });

    it("incluye fecha en formato Argentina", async () => {
      const handler = handlers.get("claudio_status")!;
      const result = await handler({});
      expect(result.content[0].text).toMatch(/Fecha:/);
    });
  });

  describe("claudio_remember con TTL", () => {
    it("acepta ttl_days y guarda expires_at", async () => {
      const handler = handlers.get("claudio_remember")!;
      const result = await handler({ kind: "nota", content: "Nota temporal", ttl_days: 7 });
      expect(result.content[0].text).toMatch(/Expira:/);
      const row = testDb.prepare("SELECT expires_at FROM memories WHERE kind = 'nota'").get() as { expires_at: string | null };
      expect(row?.expires_at).not.toBeNull();
    });

    it("sin ttl_days el expires_at queda null", async () => {
      const handler = handlers.get("claudio_remember")!;
      await handler({ kind: "nota", content: "Nota permanente" });
      const row = testDb.prepare("SELECT expires_at FROM memories WHERE content = 'Nota permanente'").get() as { expires_at: string | null };
      expect(row?.expires_at).toBeNull();
    });
  });

  describe("claudio_expire_soon", () => {
    beforeEach(() => {
      testDb.prepare(
        "INSERT INTO memories (id, profile_id, kind, content, metadata_json, expires_at) VALUES ('e1', 'santiago', 'nota', 'Expira mañana', '{}', datetime('now', '+1 days'))"
      ).run();
      testDb.prepare(
        "INSERT INTO memories (id, profile_id, kind, content, metadata_json, expires_at) VALUES ('e2', 'santiago', 'nota', 'Expira en 30 dias', '{}', datetime('now', '+30 days'))"
      ).run();
      testDb.prepare(
        "INSERT INTO memories (id, profile_id, kind, content, metadata_json, expires_at) VALUES ('e3', 'santiago', 'nota', 'Ya expiró', '{}', datetime('now', '-1 days'))"
      ).run();
      testDb.prepare(
        "INSERT INTO memories (id, profile_id, kind, content, metadata_json) VALUES ('e4', 'santiago', 'nota', 'Sin expiración', '{}')"
      ).run();
    });

    it("muestra solo los que expiran pronto (default 7 días)", async () => {
      const handler = handlers.get("claudio_expire_soon")!;
      const result = await handler({ days: 7, include_expired: false });
      expect(result.content[0].text).toMatch(/Expira mañana/);
      expect(result.content[0].text).not.toMatch(/Expira en 30 dias/);
      expect(result.content[0].text).not.toMatch(/Ya expiró/);
    });

    it("include_expired=true muestra también los expirados", async () => {
      const handler = handlers.get("claudio_expire_soon")!;
      const result = await handler({ days: 7, include_expired: true });
      expect(result.content[0].text).toMatch(/EXPIRADO/);
      expect(result.content[0].text).toMatch(/Ya expiró/);
    });

    it("devuelve mensaje cuando no hay recuerdos por expirar", async () => {
      testDb.exec("DELETE FROM memories WHERE expires_at IS NOT NULL");
      const handler = handlers.get("claudio_expire_soon")!;
      const result = await handler({ days: 7, include_expired: false });
      expect(result.content[0].text).toMatch(/No hay recuerdos/);
    });
  });

  describe("claudio_forget_by_query", () => {
    beforeEach(() => {
      testDb.prepare(
        "INSERT INTO memories (id, profile_id, kind, content, metadata_json) VALUES ('fq1', 'santiago', 'nota', 'Revisar PR de CLAUDIO', '{}')"
      ).run();
      testDb.prepare(
        "INSERT INTO memories (id, profile_id, kind, content, metadata_json) VALUES ('fq2', 'santiago', 'nota', 'Revisar documentacion', '{}')"
      ).run();
      testDb.prepare(
        "INSERT INTO memories (id, profile_id, kind, content, metadata_json) VALUES ('fq3', 'santiago', 'proyecto', 'CLAUDIO v2', '{}')"
      ).run();
    });

    it("devuelve preview sin eliminar cuando confirm=false", async () => {
      const handler = handlers.get("claudio_forget_by_query")!;
      const result = await handler({ query: "Revisar", confirm: false });
      expect(result.content[0].text).toMatch(/Se eliminarian 2/);
      expect(result.content[0].text).toMatch(/confirm=true/);
      const count = testDb.prepare("SELECT COUNT(*) as n FROM memories").get() as { n: number };
      expect(count.n).toBe(3);
    });

    it("elimina cuando confirm=true", async () => {
      const handler = handlers.get("claudio_forget_by_query")!;
      const result = await handler({ query: "Revisar", confirm: true });
      expect(result.content[0].text).toMatch(/2 recuerdo\(s\) eliminado/);
      const count = testDb.prepare("SELECT COUNT(*) as n FROM memories").get() as { n: number };
      expect(count.n).toBe(1);
    });

    it("filtra por kind antes de eliminar", async () => {
      const handler = handlers.get("claudio_forget_by_query")!;
      const result = await handler({ query: "CLAUDIO", kind: "proyecto", confirm: true });
      expect(result.content[0].text).toMatch(/1 recuerdo\(s\) eliminado/);
      const remaining = testDb.prepare("SELECT COUNT(*) as n FROM memories").get() as { n: number };
      expect(remaining.n).toBe(2);
    });

    it("devuelve mensaje cuando no hay coincidencias", async () => {
      const handler = handlers.get("claudio_forget_by_query")!;
      const result = await handler({ query: "nada-que-no-existe", confirm: false });
      expect(result.content[0].text).toMatch(/No se encontraron/);
    });
  });

  describe("claudio_relate + claudio_context", () => {
    beforeEach(() => {
      testDb.prepare(
        "INSERT INTO memories (id, profile_id, kind, content, metadata_json) VALUES ('rel-a', 'santiago', 'persona', 'Santiago', '{}')"
      ).run();
      testDb.prepare(
        "INSERT INTO memories (id, profile_id, kind, content, metadata_json) VALUES ('rel-b', 'santiago', 'proyecto', 'CLAUDIO', '{}')"
      ).run();
    });

    it("crea una relacion entre dos recuerdos", async () => {
      const handler = handlers.get("claudio_relate")!;
      const result = await handler({ from_id: "rel-a", to_id: "rel-b", relation_type: "trabaja_en" });
      expect(result.content[0].text).toMatch(/Relacion creada/);
    });

    it("claudio_context muestra las relaciones", async () => {
      testDb.prepare(
        "INSERT INTO relations (id, from_id, to_id, relation_type) VALUES ('r1', 'rel-a', 'rel-b', 'trabaja_en')"
      ).run();
      const handler = handlers.get("claudio_context")!;
      const result = await handler({ id: "rel-a" });
      expect(result.content[0].text).toMatch(/trabaja_en/);
    });

    it("claudio_context devuelve sin relaciones si no existen", async () => {
      const handler = handlers.get("claudio_context")!;
      const result = await handler({ id: "rel-a" });
      expect(result.content[0].text).toMatch(/Sin relaciones/);
    });
  });
});
