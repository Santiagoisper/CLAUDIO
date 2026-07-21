/**
 * agent-lab-test — Gestión de decisiones de arquitectura con Supermemory
 *
 * Uso:
 *   SUPERMEMORY_API_KEY=<key> node agent-memory.mjs save
 *   SUPERMEMORY_API_KEY=<key> node agent-memory.mjs recall
 *   SUPERMEMORY_API_KEY=<key> node agent-memory.mjs chat
 */

import OpenAI from "openai";
import { supermemoryTools, getToolDefinitions, createToolCallExecutor } from "@supermemory/tools/openai";

const CONTAINER_TAG = "agent-lab-test";
const API_KEY = process.env.SUPERMEMORY_API_KEY;

if (!API_KEY) {
  console.error("Error: falta SUPERMEMORY_API_KEY en el entorno.");
  process.exit(1);
}

const toolOptions = { containerTags: [CONTAINER_TAG] };
const executor = createToolCallExecutor(API_KEY, toolOptions);
const tools = getToolDefinitions();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "sk-placeholder" });

// ─── Decisiones a guardar ────────────────────────────────────────────────────

const ARCHITECTURE_DECISIONS = [
  {
    title: "Plan antes de código — agent-lab-test",
    content: `Proyecto: agent-lab-test
Regla vigente: El agente debe escribir un plan corto antes de modificar código.
Excepción: No necesita aprobación explícita para cambios menores y reversibles.
Revisión obligatoria: arquitectura, seguridad, datos sensibles, migraciones destructivas o producción.
Fecha: 2026-06-01`,
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function runToolLoop(messages) {
  while (true) {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      tools,
      tool_choice: "auto",
    });

    const msg = response.choices[0].message;
    messages.push(msg);

    if (!msg.tool_calls?.length) {
      return msg.content;
    }

    for (const call of msg.tool_calls) {
      const result = await executor(call);
      messages.push({ role: "tool", tool_call_id: call.id, content: result });
    }
  }
}

// ─── Comandos ────────────────────────────────────────────────────────────────

async function save() {
  console.log("Guardando decisiones de arquitectura en Supermemory…\n");
  const { createDocumentAddFunction } = await import("@supermemory/tools/openai");
  const addDocument = createDocumentAddFunction(API_KEY, toolOptions);

  for (const decision of ARCHITECTURE_DECISIONS) {
    const result = await addDocument({
      content: decision.content,
      title: decision.title,
      description: `Decisión de arquitectura — ${CONTAINER_TAG}`,
    });
    if (result.success) {
      console.log(`✓ Guardado: "${decision.title}"`);
      console.log(`  ID: ${result.document?.id ?? "(sin id)"}`);
    } else {
      console.error(`✗ Error al guardar "${decision.title}":`, result.error);
    }
  }
}

async function recall() {
  console.log("Recuperando decisiones de arquitectura de Supermemory…\n");
  const { createSearchMemoriesFunction } = await import("@supermemory/tools/openai");
  const search = createSearchMemoriesFunction(API_KEY, toolOptions);

  const result = await search({
    informationToGet: "decisiones de arquitectura agent-lab-test plan código revisión",
    includeFullDocs: true,
    limit: 10,
  });

  if (!result.success) {
    console.error("Error:", result.error);
    return;
  }

  console.log(`Encontrados: ${result.count} resultados\n`);
  for (const r of result.results ?? []) {
    console.log("─".repeat(60));
    console.log(r.content ?? r.document?.content ?? JSON.stringify(r, null, 2));
  }
}

async function chat() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("Error: falta OPENAI_API_KEY para el modo chat.");
    process.exit(1);
  }

  console.log("Consultando reglas de arquitectura via agente…\n");

  const messages = [
    {
      role: "system",
      content: `Eres un asistente técnico para el proyecto "${CONTAINER_TAG}".
Tienes acceso a una memoria persistente con decisiones de arquitectura.
Antes de responder, busca en memoria las reglas relevantes y aplícalas en tu respuesta.`,
    },
    {
      role: "user",
      content:
        "¿Qué reglas de arquitectura debo seguir antes de modificar código en este proyecto? ¿Cómo las aplicarías?",
    },
  ];

  const answer = await runToolLoop(messages);
  console.log(answer);
}

// ─── Entry point ─────────────────────────────────────────────────────────────

const cmd = process.argv[2];
switch (cmd) {
  case "save":
    await save();
    break;
  case "recall":
    await recall();
    break;
  case "chat":
    await chat();
    break;
  default:
    console.log(`Uso: SUPERMEMORY_API_KEY=<key> node agent-memory.mjs [save|recall|chat]

  save    Guarda las decisiones de arquitectura en Supermemory
  recall  Busca y muestra las decisiones guardadas
  chat    Consulta un agente que lee memoria antes de responder
`);
}
