/**
 * Contrato compartido entre los backends SQLite y Neon.
 * Cualquier nuevo backend solo necesita implementar esta interfaz.
 */

export interface MemoryRow {
  id: string;
  kind: string;
  content: string;
  created_at: string;
  expires_at?: string | null;
}

export interface RelatedRow {
  id: string;
  kind: string;
  content: string;
  relation_type: string;
  direction: "in" | "out";
}

export interface ProfileRow {
  id: string;
  display_name: string;
  email: string | null;
}

export interface KindCount {
  kind: string;
  total: number;
}

export interface MemoryAdapter {
  remember(
    kind: string,
    content: string,
    metadata?: Record<string, unknown>,
    ttl_days?: number
  ): Promise<MemoryRow & { expires_at: string | null }>;

  recall(query: string, kind?: string, limit?: number): Promise<MemoryRow[]>;

  memories(kind?: string): Promise<MemoryRow[]>;

  update(id: string, content: string): Promise<boolean>;

  forget(id: string): Promise<boolean>;

  forgetByQuery(
    query: string,
    kind?: string
  ): Promise<{ rows: Pick<MemoryRow, "id" | "kind" | "content">[] }>;

  deleteByIds(ids: string[]): Promise<number>;

  expireSoon(
    days: number,
    include_expired: boolean
  ): Promise<Array<MemoryRow & { expires_at: string }>>;

  status(): Promise<{ counts: KindCount[]; last?: { kind: string; content: string; created_at: string } }>;

  profile(): Promise<ProfileRow | null>;

  relate(from_id: string, to_id: string, relation_type: string): Promise<void>;

  context(id: string): Promise<{ memory: MemoryRow; related: RelatedRow[] } | null>;
}
