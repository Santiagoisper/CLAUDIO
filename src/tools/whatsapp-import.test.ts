import { describe, expect, it } from "@jest/globals";
import {
  matchWatchContacts,
  parseWhatsappExport,
  type ParsedWhatsappChat,
} from "./whatsapp-import.js";

const IOS_CHAT = [
  "Los mensajes y las llamadas están cifrados de extremo a extremo.",
  "[12/03/24, 09:15:00] Juan Perez: Hola, ¿cómo va el proyecto?",
  "[12/03/24, 09:17:32] Maria Lopez: Todo bien. Te paso el presupuesto mañana.",
  "[12/03/24, 09:18:05] Juan Perez: Perfecto, quedo atento.",
  "Te mando también el detalle de costos",
  "y el cronograma tentativo.",
  "[13/03/24, 10:00:00] Maria Lopez: Listo, enviado.",
].join("\n");

const ANDROID_CHAT = [
  "14/03/24, 08:05 - Carlos: Buen día",
  "14/03/24, 08:06 - Ana: Buen día Carlos",
  "14/03/24, 08:07 - Carlos: Nos juntamos hoy?",
].join("\n");

function senders(chat: ParsedWhatsappChat): string[] {
  return chat.messages.map((message) => message.sender);
}

describe("parseWhatsappExport", () => {
  it("reconoce el formato iOS con corchetes y separa participantes", () => {
    const chat = parseWhatsappExport(IOS_CHAT);

    expect(chat.totalMessages).toBe(4);
    expect(chat.participants).toEqual(["Juan Perez", "Maria Lopez"]);
    expect(chat.messageCountByParticipant).toEqual({ "Juan Perez": 2, "Maria Lopez": 2 });
  });

  it("reconoce el formato Android con guion", () => {
    const chat = parseWhatsappExport(ANDROID_CHAT);

    expect(senders(chat)).toEqual(["Carlos", "Ana", "Carlos"]);
    expect(chat.participants).toEqual(["Carlos", "Ana"]);
    expect(chat.messageCountByParticipant).toEqual({ Carlos: 2, Ana: 1 });
  });

  it("agrupa los mensajes multilinea en un solo mensaje", () => {
    const chat = parseWhatsappExport(IOS_CHAT);
    const multiline = chat.messages.find((message) => message.sender === "Juan Perez" && message.text.includes("detalle"));

    expect(multiline).toBeDefined();
    expect(multiline?.text).toBe(
      "Perfecto, quedo atento.\nTe mando también el detalle de costos\ny el cronograma tentativo.",
    );
  });

  it("calcula el rango de fechas entre el primer y el último mensaje", () => {
    const chat = parseWhatsappExport(IOS_CHAT);

    expect(chat.firstMessageAt).toBe("2024-03-12T09:15:00.000Z");
    expect(chat.lastMessageAt).toBe("2024-03-13T10:00:00.000Z");
  });

  it("trata las notas de sistema como remitente propio y las excluye de participantes", () => {
    const chat = parseWhatsappExport(
      "[12/03/24, 09:14:00] Los mensajes están cifrados de extremo a extremo.\n" +
        "[12/03/24, 09:15:00] Juan Perez: Hola",
    );

    expect(chat.messages[0].sender).toBe("Sistema");
    expect(chat.participants).toEqual(["Juan Perez"]);
    expect(chat.messageCountByParticipant).toEqual({ "Juan Perez": 1 });
  });

  it("interpreta el horario de 12 horas con a. m. / p. m.", () => {
    const chat = parseWhatsappExport("[12/03/24, 09:15:00 p. m.] Juan Perez: Buenas noches");

    expect(chat.messages[0].timestamp).toBe("2024-03-12T21:15:00.000Z");
  });

  it("devuelve un chat vacío cuando el archivo no tiene mensajes con timestamp", () => {
    const chat = parseWhatsappExport("Esto no es un export de WhatsApp");

    expect(chat.totalMessages).toBe(0);
    expect(chat.participants).toEqual([]);
    expect(chat.firstMessageAt).toBeNull();
    expect(chat.lastMessageAt).toBeNull();
  });
});

describe("matchWatchContacts", () => {
  const contacts = [
    { id: "c1", phone: "5491155551234", label: null, created_at: "2026-01-01T00:00:00.000Z" },
    { id: "c2", phone: "5491100000000", label: "Maria Lopez", created_at: "2026-01-01T00:00:00.000Z" },
  ];

  it("matchea por teléfono cuando el participante es un número", () => {
    const matched = matchWatchContacts(["+54 9 11 5555-1234"], contacts);

    expect(matched).toHaveLength(1);
    expect(matched[0]).toMatchObject({ contactId: "c1", matchType: "phone" });
  });

  it("matchea por nombre aproximado contra la etiqueta del contacto", () => {
    const matched = matchWatchContacts(["María López"], contacts);

    expect(matched).toHaveLength(1);
    expect(matched[0]).toMatchObject({ contactId: "c2", matchType: "label" });
  });

  it("no matchea participantes desconocidos", () => {
    expect(matchWatchContacts(["Juan Perez"], contacts)).toEqual([]);
  });
});
