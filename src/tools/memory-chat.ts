import { callAiJson, type AiSelection } from "./ai.js";
import { randomUUID } from "node:crypto";
import { getDb } from "../db/index.js";
import { getNeonSql } from "../db/neon.js";
import { getPersonalGithubContext } from "./github.js";
import { refreshCuentasPersonalesAssetsMemory } from "./cuentaspersonales.js";

interface MemoryRow {
  id: string;
  kind: string;
  content: string;
  created_at: string;
  metadata_json?: string | Record<string, unknown>;
  domain?: string;
}

interface ProfileRow {
  id: string;
  display_name: string;
  email: string | null;
  created_at: string;
}

export interface MemoryChatSource {
  id: string;
  kind: string;
  createdAt: string;
  excerpt: string;
}

export interface MemoryChatResult {
  answer: string;
  sources: MemoryChatSource[];
}

const GRAPH_STOP_WORDS = new Set([
  "para", "como", "sobre", "desde", "entre", "actuales", "actual", "tengo", "quiero", "clauidio", "claudio", "respuesta", "consulta",
]);

function graphTerms(text: string): Set<string> {
  return new Set(
    (text.toLocaleLowerCase("es-AR").match(/[\p{L}\p{N}]{4,}/gu) ?? [])
      .filter((term) => !GRAPH_STOP_WORDS.has(term)),
  );
}

export function connectMemoryNode(
  db: ReturnType<typeof getDb>,
  id: string,
  content: string,
): void {
  const terms = graphTerms(content);
  if (terms.size === 0) return;
  const candidates = db.prepare(`
    SELECT id, content FROM memories
    WHERE id <> ?
    ORDER BY created_at DESC
    LIMIT 120
  `).all(id) as Array<{ id: string; content: string }>;
  const relation = db.prepare(`
    INSERT OR IGNORE INTO relations (id, from_id, to_id, relation_type)
    VALUES (?, ?, ?, 'related_topic')
  `);
  for (const candidate of candidates) {
    const shared = [...terms].filter((term) => graphTerms(candidate.content).has(term));
    if (shared.length >= 2) relation.run(randomUUID(), id, candidate.id);
  }
}

export function connectAllMemoryNodes(): void {
  if (getNeonSql()) return;
  const db = getDb();
  const rows = db.prepare("SELECT id, content FROM memories ORDER BY created_at ASC").all() as Array<{
    id: string;
    content: string;
  }>;
  for (const row of rows) connectMemoryNode(db, row.id, row.content);
}

function expandGraphContext(rows: MemoryRow[]): MemoryRow[] {
  if (rows.length === 0 || getNeonSql()) return rows;
  const db = getDb();
  const ids = rows.map((row) => row.id);
  const placeholders = ids.map(() => "?").join(", ");
  const related = db.prepare(`
    SELECT DISTINCT m.id, m.kind, m.content, m.created_at, m.metadata_json
    FROM relations r
    JOIN memories m ON m.id = CASE WHEN r.from_id IN (${placeholders}) THEN r.to_id ELSE r.from_id END
    WHERE r.from_id IN (${placeholders}) OR r.to_id IN (${placeholders})
    ORDER BY m.created_at DESC
    LIMIT 8
  `).all(...ids, ...ids, ...ids) as unknown as MemoryRow[];
  const seen = new Set(ids);
  return [...rows, ...related.filter((row) => !seen.has(row.id) && personalMemory(row))].slice(0, 12);
}

export async function rememberChatExchange(
  question: string,
  result: MemoryChatResult,
  aiSelection?: AiSelection,
): Promise<void> {
  const content = `Consulta: ${question.trim()}\n\nRespuesta de CLAUDIO: ${result.answer}`;
  const metadata = {
    source: "claudio_chat",
    provider: aiSelection?.provider ?? process.env.CLAUDIO_AI_PROVIDER ?? "openai",
    model: aiSelection?.model ?? process.env.CLAUDIO_AI_MODEL ?? null,
    sourceCount: result.sources.length,
  };
  const sql = getNeonSql();
  if (sql) {
    await sql`
      INSERT INTO memories (id, profile_id, kind, domain, content, metadata_json)
      VALUES (${randomUUID()}, 'santiago', 'conversacion', 'personal', ${content}, ${JSON.stringify(metadata)}::jsonb)
    `;
    return;
  }
  const db = getDb();
  const id = randomUUID();
  db.prepare(`
    INSERT INTO memories (id, profile_id, kind, content, metadata_json)
    VALUES (?, 'santiago', 'conversacion', ?, ?)
  `).run(id, content, JSON.stringify(metadata));
  const sourceRelation = db.prepare(`
    INSERT OR IGNORE INTO relations (id, from_id, to_id, relation_type)
    VALUES (?, ?, ?, 'consulted_memory')
  `);
  for (const source of result.sources) {
    sourceRelation.run(randomUUID(), id, source.id);
  }
  connectMemoryNode(db, id, content);
}

function excerpt(text: string, max = 360): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
}

function personalMemory(row: MemoryRow): boolean {
  if (row.domain && row.domain !== "personal") return false;
  const metadata =
    typeof row.metadata_json === "string"
      ? (() => {
          try {
            return JSON.parse(row.metadata_json) as Record<string, unknown>;
          } catch {
            return {};
          }
        })()
      : (row.metadata_json ?? {});
  if (metadata.account === "cinme") return false;
  // Las memorias de Gmail antiguas no incluían cuenta: no se mezclan por defecto.
  return !(metadata.source === "gmail_analysis" && metadata.account !== "personal");
}

function ftsQuery(query: string): string {
  const words = query.match(/[\p{L}\p{N}]{2,}/gu) ?? [];
  return words.slice(0, 12).join(" OR ");
}

async function findRelevantMemories(query: string): Promise<MemoryRow[]> {
  const sql = getNeonSql();
  const pattern = `%${query.trim()}%`;
  if (sql) {
    const rows = await sql`
      SELECT id::text, kind, content, created_at::text, metadata_json, domain
      FROM memories
      WHERE (content ILIKE ${pattern} OR kind ILIKE ${pattern})
      ORDER BY created_at DESC
      LIMIT 24
    ` as MemoryRow[];
    return rows.filter(personalMemory).slice(0, 8);
  }

  const db = getDb();
  const search = ftsQuery(query);
  let rows: MemoryRow[] = [];
  if (search) {
    try {
      rows = db.prepare(`
        SELECT m.id, m.kind, m.content, m.created_at, m.metadata_json
        FROM memories_fts f
        JOIN memories m ON m.rowid = f.rowid
        WHERE memories_fts MATCH ?
        ORDER BY rank
        LIMIT 24
      `).all(search) as unknown as MemoryRow[];
    } catch {
      // El fallback por LIKE cubre instalaciones sin FTS5 o consultas no compatibles.
    }
  }
  if (rows.length === 0) {
    const terms = (query.match(/[\p{L}\p{N}]{2,}/gu) ?? []).slice(0, 12);
    const conditions = terms.length > 0
      ? terms.map(() => "(content LIKE ? OR kind LIKE ?)").join(" OR ")
      : "(content LIKE ? OR kind LIKE ? )";
    const params = terms.length > 0
      ? terms.flatMap((term) => [`%${term}%`, `%${term}%`])
      : [pattern, pattern];
    rows = db.prepare(`
      SELECT id, kind, content, created_at, metadata_json
      FROM memories
      WHERE ${conditions}
      ORDER BY created_at DESC
      LIMIT 24
    `).all(...params) as unknown as MemoryRow[];
  }
  return rows.filter(personalMemory).slice(0, 8);
}

function asksAboutProfile(query: string): boolean {
  return /\b(nombre|llamo|llamás|quien soy|quién soy|mi perfil)\b/i.test(query);
}

function asksAboutAssets(query: string): boolean {
  return /\b(activo|activos|cartera|portafolio|posición|posiciones|patrimonio|cuentas?\s+personales?)\b/i.test(query);
}

async function profileMemory(): Promise<MemoryRow | null> {
  const sql = getNeonSql();
  if (sql) {
    const rows = await sql`
      SELECT id, display_name, email, created_at::text
      FROM profiles
      WHERE id = 'santiago'
      LIMIT 1
    ` as ProfileRow[];
    const profile = rows[0];
    if (!profile) return null;
    return {
      id: `profile:${profile.id}`,
      kind: "perfil",
      content: `Nombre: ${profile.display_name}${profile.email ? `\nEmail: ${profile.email}` : ""}`,
      created_at: profile.created_at,
    };
  }

  const profile = getDb()
    .prepare("SELECT id, display_name, email, created_at FROM profiles WHERE id = 'santiago'")
    .get() as unknown as ProfileRow | undefined;
  if (!profile) return null;
  return {
    id: `profile:${profile.id}`,
    kind: "perfil",
    content: `Nombre: ${profile.display_name}${profile.email ? `\nEmail: ${profile.email}` : ""}`,
    created_at: String(profile.created_at),
  };
}

export async function answerFromMemory(
  message: string,
  aiSelection?: AiSelection,
  options: { includeGithub?: boolean } = {},
): Promise<MemoryChatResult> {
  const question = message.trim();
  if (!question) throw new Error("Escribí una pregunta para consultar la memoria.");
  if (question.length > 4_000) throw new Error("La pregunta es demasiado larga.");

  const assetQuestion = asksAboutAssets(question);
  if (assetQuestion) {
    await refreshCuentasPersonalesAssetsMemory();
  }
  let rows = await findRelevantMemories(question);
  if (assetQuestion) {
    rows = rows.filter((row) => row.kind === "activos_cuentaspersonales");
    const db = getDb();
    for (const row of rows) connectMemoryNode(db, row.id, row.content);
  }
  rows = expandGraphContext(rows);
  if (rows.length === 0 && asksAboutProfile(question)) {
    const profile = await profileMemory();
    if (profile) rows.push(profile);
  }
  const githubContext = options.includeGithub
    ? await getPersonalGithubContext(question)
    : null;
  const sources = rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    createdAt: String(row.created_at),
    excerpt: excerpt(row.content),
  }));
  if (rows.length === 0 && !githubContext) {
    return {
      answer: "No poseo esa información en mi memoria.",
      sources,
    };
  }

  const memoryContext = rows
    .map((row) => `[${row.id.slice(0, 8)}] tipo: ${row.kind}\n${excerpt(row.content, 2_000)}`)
    .join("\n\n---\n\n");
  const context = [
    memoryContext ? `Memoria personal:\n${memoryContext}` : null,
    githubContext ? `GitHub personal (solo lectura):\n${githubContext}` : null,
  ]
    .filter(Boolean)
    .join("\n\n---\n\n");
  const response = await callAiJson(
    [
      {
        role: "system",
        content:
          "Respondés en español como asistente de memoria personal. Usá únicamente el contexto provisto. Si el contexto no alcanza, respondé exactamente: 'No poseo esa información en mi memoria.' No inventes ni menciones fuentes. Escribí con prosa clara y ordenada: empezá por una respuesta directa, seguí con párrafos breves y usá listas sólo si enumerar elementos concretos mejora la lectura. Para activos, distinguí activos registrados de posiciones IOL y no sumes ambas fuentes. Devolvé exclusivamente JSON válido con esta forma: {\"answer\":\"respuesta clara en texto plano\"}.",
      },
      {
        role: "user",
        content: `Pregunta:\n${question}\n\nContexto disponible:\n${context}`,
      },
    ],
    aiSelection,
  );
  const answer =
    typeof response === "object" && response !== null && "answer" in response &&
    typeof (response as { answer?: unknown }).answer === "string"
      ? (response as { answer: string }).answer.trim()
      : "No pude interpretar la respuesta del modelo.";
  return { answer, sources };
}
