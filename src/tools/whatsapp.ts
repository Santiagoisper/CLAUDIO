import { randomUUID } from "node:crypto";
import { getDb } from "../db/index.js";

export interface WhatsappWatchContact {
  id: string;
  phone: string;
  label: string | null;
  created_at: string;
}

function ensureWhatsappTables(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS whatsapp_watch_contacts (
      id TEXT PRIMARY KEY,
      phone TEXT NOT NULL UNIQUE,
      label TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

export function listWhatsappWatchContacts(): WhatsappWatchContact[] {
  ensureWhatsappTables();
  return getDb().prepare(`
    SELECT id, phone, label, created_at
    FROM whatsapp_watch_contacts
    ORDER BY created_at ASC
  `).all() as unknown as WhatsappWatchContact[];
}

export function addWhatsappWatchContact(phoneInput: string, labelInput?: string): WhatsappWatchContact {
  ensureWhatsappTables();
  const phone = phoneInput.replace(/\D/g, "");
  if (phone.length < 8 || phone.length > 15) {
    throw new Error("Ingresá un celular con código de país, entre 8 y 15 dígitos.");
  }
  const label = labelInput?.trim() || null;
  const db = getDb();
  const existing = db.prepare(`
    SELECT id, phone, label, created_at FROM whatsapp_watch_contacts WHERE phone = ?
  `).get(phone) as WhatsappWatchContact | undefined;
  if (existing) return existing;
  const id = randomUUID();
  db.prepare(`
    INSERT INTO whatsapp_watch_contacts (id, phone, label) VALUES (?, ?, ?)
  `).run(id, phone, label);
  return db.prepare(`
    SELECT id, phone, label, created_at FROM whatsapp_watch_contacts WHERE id = ?
  `).get(id) as unknown as WhatsappWatchContact;
}

export function removeWhatsappWatchContact(id: string): boolean {
  ensureWhatsappTables();
  return getDb().prepare("DELETE FROM whatsapp_watch_contacts WHERE id = ?").run(id).changes > 0;
}
