/**
 * Environment + mode detection.
 *
 * Lunas runs in three modes so it always demos, even with zero credentials:
 *   - "live"      : real PayPal REST API against api-m.paypal.com
 *   - "sandbox"   : real PayPal REST API against api-m.sandbox.paypal.com (what judges will see)
 *   - "simulated" : no credentials configured -> deterministic fake responses, clearly labelled
 *
 * The AI side has the same ladder: a real LLM when LLM_API_KEY is set, otherwise a
 * deterministic heuristic engine. Every response carries `engine` / `mode` so the UI can
 * be honest about what actually happened.
 */

export type PayPalMode = "live" | "sandbox" | "simulated";

const clean = (v: string | undefined) => (v ?? "").trim();

export const paypalClientId = () => clean(process.env.PAYPAL_CLIENT_ID);
export const paypalClientSecret = () => clean(process.env.PAYPAL_CLIENT_SECRET);
export const paypalWebhookId = () => clean(process.env.PAYPAL_WEBHOOK_ID);

/** Public client id used by the browser SDK (Smart Buttons). */
export const publicPayPalClientId = () =>
  clean(process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID) || paypalClientId();

export function paypalConfigured() {
  return Boolean(paypalClientId() && paypalClientSecret());
}

export function paypalMode(): PayPalMode {
  if (!paypalConfigured()) return "simulated";
  return clean(process.env.PAYPAL_ENV) === "live" ? "live" : "sandbox";
}

export function paypalApiBase() {
  const override = clean(process.env.PAYPAL_API_BASE);
  if (override) return override.replace(/\/$/, "");
  return paypalMode() === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

/** Where the browser should be sent to approve a payment. */
export function paypalWebBase() {
  return paypalMode() === "live" ? "https://www.paypal.com" : "https://www.sandbox.paypal.com";
}

export const llmApiKey = () => clean(process.env.LLM_API_KEY) || clean(process.env.OPENAI_API_KEY);

export type LlmProvider = "openai" | "anthropic";

export function llmProvider(): LlmProvider {
  const explicit = clean(process.env.LLM_PROVIDER).toLowerCase();
  if (explicit === "anthropic") return "anthropic";
  if (explicit === "openai") return "openai";
  const base = clean(process.env.LLM_BASE_URL).toLowerCase();
  return base.includes("anthropic") ? "anthropic" : "openai";
}

export function llmBaseUrl() {
  const override = clean(process.env.LLM_BASE_URL);
  if (override) return override.replace(/\/$/, "");
  return llmProvider() === "anthropic" ? "https://api.anthropic.com" : "https://api.openai.com";
}

export function llmModel() {
  return clean(process.env.LLM_MODEL) || (llmProvider() === "anthropic" ? "claude-sonnet-4-5" : "gpt-4o-mini");
}

export function llmVisionModel() {
  return clean(process.env.LLM_VISION_MODEL) || llmModel();
}

export function llmConfigured() {
  return Boolean(llmApiKey());
}

/** Lunas platform fee (shown as "escrow + protection fee" in the wizard). */
export function feeRate() {
  const raw = clean(process.env.LUNAS_FEE_RATE);
  if (!raw) return 0.025; // Number("") is 0 — an unset variable must not mean "free"
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n < 0.5 ? n : 0.025;
}

/** Where the escrow manifest + uploaded deliverables live. Ephemeral on serverless. */
export function dataDir() {
  return clean(process.env.LUNAS_DATA_DIR) || `${process.cwd()}/.data`;
}

/** The freelancer's receiving PayPal account (payout receiver). */
export function payoutReceiver() {
  return clean(process.env.PAYPAL_PAYOUT_RECEIVER) || "sari.wulandari-facilitator@example.com";
}

export function publicMode() {
  return {
    paypal: paypalMode(),
    paypalConfigured: paypalConfigured(),
    webhookConfigured: Boolean(paypalWebhookId()),
    ai: llmConfigured() ? ("live" as const) : ("heuristic" as const),
    aiProvider: llmConfigured() ? llmProvider() : null,
    aiModel: llmConfigured() ? llmModel() : null,
    feeRate: feeRate(),
    payoutReceiver: payoutReceiver(),
  };
}
