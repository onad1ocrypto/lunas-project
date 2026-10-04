import { json } from "@/lib/server/http";
import { paypalMode, publicPayPalClientId } from "@/lib/server/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/paypal/config — what the browser needs to mount PayPal Smart Buttons.
 * Returns `clientId: null` in simulated mode and the checkout page falls back to the
 * simulated payer (clearly labelled, never pretending to be PayPal).
 */
export async function GET() {
  const mode = paypalMode();
  return json({
    ok: true,
    mode,
    clientId: mode === "simulated" ? null : publicPayPalClientId() || null,
    currencyFallback: "USD",
    intent: "capture",
    buttons: {
      createOrderEndpoint: "/api/paypal/orders",
      captureEndpoint: "/api/paypal/orders/:paypalOrderId/capture",
      style: { shape: "pill", color: "gold", layout: "vertical", label: "paypal", height: 48 },
    },
  });
}
