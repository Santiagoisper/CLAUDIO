export type AiProvider = "openai" | "groq" | "deepseek" | "anthropic" | "gemini" | "ollama";

export interface AiSelection {
  provider?: AiProvider;
  model?: string;
}

type ChatMessage = { role: "system" | "user"; content: string };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function selectedProvider(selection?: AiSelection): AiProvider {
  const provider = selection?.provider ?? process.env.CLAUDIO_AI_PROVIDER ?? "openai";
  if (["openai", "groq", "deepseek", "anthropic", "gemini", "ollama"].includes(provider)) {
    return provider as AiProvider;
  }
  throw new Error(`Proveedor IA no soportado: ${provider}`);
}

function defaultModel(provider: AiProvider, selection?: AiSelection): string {
  if (selection?.model) return selection.model;
  const envModel = process.env.CLAUDIO_AI_MODEL;
  if (envModel) return envModel;
  switch (provider) {
    case "openai":
      return "gpt-4o-mini";
    case "groq":
      return "llama-3.3-70b-versatile";
    case "deepseek":
      return "deepseek-chat";
    case "anthropic":
      return "claude-3-5-haiku-latest";
    case "gemini":
      return "gemini-2.5-flash";
    case "ollama":
      return "llama3.1:8b";
  }
}

function parseJsonObject(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const match = /\{[\s\S]*\}/.exec(text);
    if (!match) throw new Error("El modelo no devolvio JSON valido.");
    return JSON.parse(match[0]);
  }
}

async function callOpenAICompatible(params: {
  baseUrl: string;
  apiKey?: string;
  model: string;
  messages: ChatMessage[];
  providerName: string;
}): Promise<unknown> {
  if (!params.apiKey) throw new Error(`Falta API key para ${params.providerName}.`);
  let lastError = "";
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const res = await fetch(`${params.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.apiKey}`,
      },
      body: JSON.stringify({
        model: params.model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: params.messages,
      }),
    });
    if (res.ok) {
      const payload = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
      const content = payload.choices?.[0]?.message?.content;
      if (!content) throw new Error(`${params.providerName} no devolvio contenido.`);
      return parseJsonObject(content);
    }

    lastError = `${params.providerName} error ${res.status}: ${(await res.text()).slice(0, 300)}`;
    if (res.status !== 429 || attempt === 5) break;
    await sleep(8_000 + attempt * 4_000);
  }
  throw new Error(lastError);
}

async function callAnthropic(model: string, messages: ChatMessage[]): Promise<unknown> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Falta ANTHROPIC_API_KEY.");
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const user = messages.filter((m) => m.role === "user").map((m) => m.content).join("\n\n");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      temperature: 0.2,
      system: `${system}\n\nResponde exclusivamente con un objeto JSON valido, sin markdown.`,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const payload = await res.json() as { content?: Array<{ type: string; text?: string }> };
  const text = payload.content?.find((part) => part.type === "text")?.text;
  if (!text) throw new Error("Anthropic no devolvio contenido.");
  return parseJsonObject(text);
}

async function callGemini(model: string, messages: ChatMessage[]): Promise<unknown> {
  if (!process.env.GEMINI_API_KEY) throw new Error("Falta GEMINI_API_KEY.");
  const prompt = messages.map((m) => `${m.role.toUpperCase()}:\n${m.content}`).join("\n\n");
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
        },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const payload = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini no devolvio contenido.");
  return parseJsonObject(text);
}

async function callOllama(model: string, messages: ChatMessage[]): Promise<unknown> {
  const baseUrl = process.env.CLAUDIO_OLLAMA_URL ?? "http://localhost:11434";
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      format: "json",
      messages,
      options: { temperature: 0.2 },
    }),
  });
  if (!res.ok) throw new Error(`Ollama error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const payload = await res.json() as { message?: { content?: string } };
  const content = payload.message?.content;
  if (!content) throw new Error("Ollama no devolvio contenido.");
  return parseJsonObject(content);
}

export async function callAiJson(messages: ChatMessage[], selection?: AiSelection): Promise<unknown> {
  const provider = selectedProvider(selection);
  const model = defaultModel(provider, selection);
  switch (provider) {
    case "openai":
      return callOpenAICompatible({
        baseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
        apiKey: process.env.OPENAI_API_KEY,
        model,
        messages,
        providerName: "OpenAI",
      });
    case "groq":
      return callOpenAICompatible({
        baseUrl: process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1",
        apiKey: process.env.GROQ_API_KEY,
        model,
        messages,
        providerName: "Groq",
      });
    case "deepseek":
      return callOpenAICompatible({
        baseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1",
        apiKey: process.env.DEEPSEEK_API_KEY,
        model,
        messages,
        providerName: "DeepSeek",
      });
    case "anthropic":
      return callAnthropic(model, messages);
    case "gemini":
      return callGemini(model, messages);
    case "ollama":
      return callOllama(model, messages);
  }
}
