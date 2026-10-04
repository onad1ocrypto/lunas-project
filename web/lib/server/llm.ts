/**
 * LLM client — provider-agnostic, JSON-first.
 *
 * Supports any OpenAI-compatible endpoint (OpenAI, OpenRouter, Ollama, vLLM, Groq…) and
 * Anthropic's Messages API. Swap providers with env vars only:
 *
 *   LLM_PROVIDER=openai|anthropic
 *   LLM_BASE_URL=https://api.openai.com        (or any compatible gateway)
 *   LLM_MODEL=gpt-4o-mini
 *   LLM_API_KEY=sk-...
 *
 * Callers always have a deterministic fallback, so a missing key or a provider outage
 * degrades the demo instead of breaking it — and the response says which engine ran.
 */

import { llmApiKey, llmBaseUrl, llmConfigured, llmModel, llmProvider, llmVisionModel } from "./env";

export interface LlmImage {
  /** data URI or raw base64 (no prefix). */
  data: string;
  mime: string;
}

export interface LlmCall {
  system: string;
  user: string;
  images?: LlmImage[];
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  json?: boolean;
}

export class LlmError extends Error {}

const withTimeout = async <T,>(p: Promise<T>, ms: number, label: string): Promise<T> => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await p;
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new LlmError(`${label} timed out after ${ms}ms`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
};

/** Returns the assistant's text. Throws LlmError when there is no usable answer. */
export async function llmText(call: LlmCall): Promise<string> {
  if (!llmConfigured()) throw new LlmError("no LLM_API_KEY configured");
  const timeoutMs = call.timeoutMs ?? 30_000;
  const provider = llmProvider();

  if (provider === "anthropic") {
    const content: unknown[] = [{ type: "text", text: call.user }];
    for (const img of call.images ?? []) {
      content.push({
        type: "image",
        source: { type: "base64", media_type: img.mime, data: stripDataUri(img.data) },
      });
    }
    const res = await withTimeout(
      fetch(`${llmBaseUrl()}/v1/messages`, {
        method: "POST",
        headers: {
          "x-api-key": llmApiKey(),
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: call.images?.length ? llmVisionModel() : llmModel(),
          max_tokens: call.maxTokens ?? 1024,
          temperature: call.temperature ?? 0.2,
          system: call.system,
          messages: [{ role: "user", content }],
        }),
      }),
      timeoutMs,
      "Anthropic",
    );
    const json = (await res.json().catch(() => ({}))) as { content?: { text?: string }[]; error?: { message?: string } };
    if (!res.ok) throw new LlmError(`Anthropic ${res.status}: ${json.error?.message ?? "unknown error"}`);
    const text = (json.content ?? []).map((c) => c.text ?? "").join("").trim();
    if (!text) throw new LlmError("Anthropic returned an empty completion");
    return text;
  }

  const content: unknown[] = [{ type: "text", text: call.user }];
  for (const img of call.images ?? []) {
    content.push({ type: "image_url", image_url: { url: toDataUri(img) } });
  }
  const res = await withTimeout(
    fetch(`${llmBaseUrl()}/v1/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${llmApiKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: call.images?.length ? llmVisionModel() : llmModel(),
        max_tokens: call.maxTokens ?? 1024,
        temperature: call.temperature ?? 0.2,
        ...(call.json ? { response_format: { type: "json_object" } } : {}),
        messages: [
          { role: "system", content: call.system },
          { role: "user", content: call.images?.length ? content : call.user },
        ],
      }),
    }),
    timeoutMs,
    "LLM",
  );
  const json = (await res.json().catch(() => ({}))) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
  };
  if (!res.ok) throw new LlmError(`LLM ${res.status}: ${json.error?.message ?? "unknown error"}`);
  const text = json.choices?.[0]?.message?.content?.trim();
  if (!text) throw new LlmError("LLM returned an empty completion");
  return text;
}

/** Parse a JSON object out of a model response (tolerates ```json fences and prose). */
export function parseJsonLoose<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  const slice = start >= 0 && end > start ? body.slice(start, end + 1) : body;
  return JSON.parse(slice) as T;
}

export async function llmJson<T>(call: LlmCall): Promise<T> {
  return parseJsonLoose<T>(await llmText({ ...call, json: call.json ?? true }));
}

const stripDataUri = (s: string) => (s.includes(",") && s.startsWith("data:") ? s.slice(s.indexOf(",") + 1) : s);
const toDataUri = (img: LlmImage) => (img.data.startsWith("data:") ? img.data : `data:${img.mime};base64,${img.data}`);

export { llmConfigured };
