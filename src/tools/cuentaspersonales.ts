import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { getDb } from "../db/index.js";
import { ensureNeonSchema, getNeonSql } from "../db/neon.js";

const DEFAULT_PROJECT_PATH = "/Users/santiagoisbert/Desktop/Santiagoisper/Cuentaspersonales";

type AssetRow = {
  entidad: string;
  tipo: string;
  descripcion: string;
  monto: number | string;
  moneda: string;
};

type IolSnapshot = {
  observed_at: string;
  portfolio_json: { activos?: Array<Record<string, unknown>> } | null;
};

type IolDailySnapshot = {
  observed_at: string;
  total_ars: number | string;
  total_usd: number | string;
  ars_cash: number | string;
  usd_cash: number | string;
  positions_value_ars: number | string;
};

function cuentasDatabaseUrl(): string {
  const projectPath = path.resolve(
    process.env.CLAUDIO_CUENTAS_PERSONALES_PATH ?? DEFAULT_PROJECT_PATH,
  );
  const envPath = path.join(projectPath, ".env.local");
  const env = fs.readFileSync(envPath, "utf8");
  const match = env.match(/^DATABASE_URL=(.+)$/m);
  const value = match?.[1]?.trim().replace(/^['"]|['"]$/g, "") ?? "";
  if (!/^postgres(?:ql)?:\/\//i.test(value)) {
    throw new Error("Cuentaspersonales no tiene una DATABASE_URL local válida.");
  }
  return value;
}

function money(value: unknown): string {
  return Number(value ?? 0).toLocaleString("es-AR");
}

async function loadCuentasSnapshot(): Promise<{
  assets: AssetRow[];
  snapshots: IolSnapshot[];
  dailySnapshots: IolDailySnapshot[];
}> {
  const remoteUrl = process.env.CUENTAS_PERSONALES_API_URL?.replace(/\/$/, "");
  if (remoteUrl) {
    const token = process.env.CUENTAS_PERSONALES_API_TOKEN;
    if (!token) throw new Error("Falta CUENTAS_PERSONALES_API_TOKEN.");
    const response = await fetch(`${remoteUrl}/api/integrations/claudio/assets`, {
      headers: { "x-claudio-integration-token": token },
    });
    if (!response.ok) throw new Error(`Cuentaspersonales remoto respondió ${response.status}.`);
    const data = await response.json() as {
      activos?: AssetRow[];
      latestIolSnapshot?: IolSnapshot | null;
      dailyIolSnapshots?: IolDailySnapshot[];
    };
    return {
      assets: data.activos ?? [],
      snapshots: data.latestIolSnapshot ? [data.latestIolSnapshot] : [],
      dailySnapshots: data.dailyIolSnapshots ?? [],
    };
  }
  const sql = neon(cuentasDatabaseUrl());
  const [assets, snapshots, dailySnapshots] = await Promise.all([
    (async () => (await sql`SELECT entidad, tipo, descripcion, monto, moneda FROM activos WHERE monto > 0 ORDER BY entidad, tipo, descripcion`) as AssetRow[])(),
    (async () => (await sql`SELECT observed_at::text, portfolio_json FROM iol_account_snapshots ORDER BY observed_at DESC, id DESC LIMIT 1`.catch(() => [])) as IolSnapshot[])(),
    (async () => (await sql`SELECT DISTINCT ON ((observed_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date) observed_at::text, total_ars, total_usd, ars_cash, usd_cash, positions_value_ars FROM iol_account_snapshots ORDER BY (observed_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date DESC, observed_at DESC, id DESC LIMIT 2`.catch(() => [])) as IolDailySnapshot[])(),
  ]);
  return { assets, snapshots, dailySnapshots };
}

function formatSnapshot(
  assets: AssetRow[],
  snapshot: IolSnapshot | undefined,
  dailySnapshots: IolDailySnapshot[],
): string {
  const manual = assets.map(
    (asset) => `- ${asset.entidad} | ${asset.tipo} | ${asset.descripcion} | ${asset.moneda} ${money(asset.monto)}`,
  );
  const positions = Array.isArray(snapshot?.portfolio_json?.activos)
    ? snapshot!.portfolio_json!.activos!
    : [];
  const iol = positions.map((position) => {
    const title = (position.titulo ?? {}) as Record<string, unknown>;
    const symbol = String(title.simbolo ?? "sin símbolo");
    const description = String(title.descripcion ?? symbol);
    return `- ${symbol} | ${description} | cantidad ${money(position.cantidad)} | valorizado ${String(title.moneda ?? "")} ${money(position.valorizado)}`;
  });
  const currentDay = dailySnapshots[0];
  const previousDay = dailySnapshots[1];
  const dailyComparison = currentDay && previousDay
    ? (() => {
        const currentArs = Number(currentDay.total_ars);
        const previousArs = Number(previousDay.total_ars);
        const deltaArs = currentArs - previousArs;
        const deltaPct = previousArs > 0 ? (deltaArs / previousArs) * 100 : null;
        return [
          "Comparación diaria de cartera IOL:",
          `- Último día: ${currentDay.observed_at} | total ARS ${money(currentArs)} | total USD ${money(currentDay.total_usd)} | caja ARS ${money(currentDay.ars_cash)} | caja USD ${money(currentDay.usd_cash)}.`,
          `- Día anterior: ${previousDay.observed_at} | total ARS ${money(previousArs)} | total USD ${money(previousDay.total_usd)} | caja ARS ${money(previousDay.ars_cash)} | caja USD ${money(previousDay.usd_cash)}.`,
          `- Variación: ${deltaArs >= 0 ? "+" : ""}ARS ${money(deltaArs)}${deltaPct == null ? "" : ` (${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(2)}%)`}.`,
        ].join("\n");
      })()
    : "Comparación diaria de cartera IOL: todavía no hay dos días de snapshot disponibles.";
  return [
    "Snapshot vivo de activos personales desde Cuentaspersonales.",
    `Actualizado: ${new Date().toISOString()}.`,
    "",
    `Activos registrados (${manual.length}):`,
    manual.length ? manual.join("\n") : "- Sin activos registrados.",
    "",
    `Posiciones IOL (${iol.length}) — snapshot observado: ${snapshot?.observed_at ?? "sin snapshot"}:`,
    iol.length ? iol.join("\n") : "- Sin posiciones IOL en el último snapshot.",
    "",
    dailyComparison,
    "",
    "Las fuentes se muestran separadas: no sumar automáticamente importes porque puede haber solapamientos contables.",
  ].join("\n");
}

export async function refreshCuentasPersonalesAssetsMemory(): Promise<{
  updatedAt: string;
  manualAssetCount: number;
  iolPositionCount: number;
}> {
  const { assets, snapshots, dailySnapshots } = await loadCuentasSnapshot();
  const snapshot = snapshots[0];
  const iolPositionCount = Array.isArray(snapshot?.portfolio_json?.activos)
    ? snapshot!.portfolio_json!.activos!.length
    : 0;
  const updatedAt = new Date().toISOString();
  const metadata = JSON.stringify({
    source: "cuentaspersonales_readonly_db",
    account: "personal",
    updatedAt,
    manualAssetCount: assets.length,
    iolPositionCount,
    iolSnapshotObservedAt: snapshot?.observed_at ?? null,
  });
  const content = formatSnapshot(assets, snapshot, dailySnapshots);
  const neonSql = getNeonSql();
  if (neonSql) {
    await ensureNeonSchema();
    const previous = await neonSql`SELECT id::text FROM memories WHERE kind = 'activos_cuentaspersonales' ORDER BY created_at DESC LIMIT 1` as Array<{ id: string }>;
    if (previous[0]) {
      await neonSql`UPDATE memories SET content = ${content}, metadata_json = ${metadata}::jsonb, updated_at = NOW() WHERE id = ${previous[0].id}::uuid`;
    } else {
      await neonSql`INSERT INTO memories (id, profile_id, kind, domain, content, metadata_json) VALUES (${randomUUID()}::uuid, 'santiago', 'activos_cuentaspersonales', 'personal', ${content}, ${metadata}::jsonb)`;
    }
    return { updatedAt, manualAssetCount: assets.length, iolPositionCount };
  }
  const db = getDb();
  const previous = db.prepare(`
    SELECT id FROM memories
    WHERE kind = 'activos_cuentaspersonales'
    ORDER BY created_at DESC
    LIMIT 1
  `).get() as { id: string } | undefined;
  if (previous) {
    db.prepare("UPDATE memories SET content = ?, metadata_json = ? WHERE id = ?")
      .run(content, metadata, previous.id);
  } else {
    db.prepare(`
      INSERT INTO memories (id, profile_id, kind, content, metadata_json)
      VALUES (?, 'santiago', 'activos_cuentaspersonales', ?, ?)
    `).run(randomUUID(), content, metadata);
  }
  return { updatedAt, manualAssetCount: assets.length, iolPositionCount };
}
