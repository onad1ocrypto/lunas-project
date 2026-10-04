import { publicMode } from "@/lib/server/env";
import { listOrders } from "@/lib/server/store";
import { json } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/health — what is actually wired up right now (this is what the UI badge reads). */
export async function GET() {
  const mode = publicMode();
  let orders = 0;
  try {
    orders = (await listOrders()).length;
  } catch {
    /* store not ready yet */
  }
  return json({
    ok: true,
    service: "lunas",
    version: "0.2.0",
    at: new Date().toISOString(),
    ...mode,
    orders,
    checks: {
      paypalOrdersApi: mode.paypalConfigured ? "ready" : "simulated (set PAYPAL_CLIENT_ID/SECRET)",
      paypalPayouts: mode.paypalConfigured ? "ready" : "simulated",
      paypalWebhooks: mode.webhookConfigured ? "verified" : "accepting unsigned events (dev only)",
      aiContractAgent: mode.ai === "live" ? `ready (${mode.aiModel})` : "heuristic fallback",
      aiVerificationAgent: mode.ai === "live" ? "rules + vision" : "rules only (no LLM key)",
    },
  });
}
