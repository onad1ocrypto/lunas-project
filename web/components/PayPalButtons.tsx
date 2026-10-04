"use client";

/**
 * PayPal Smart Buttons, wired to Lunas escrow.
 *
 * Live mode  : loads the PayPal JS SDK with the sandbox/live client id and runs the real
 *              create → approve → capture handshake.
 * Simulated  : no credentials configured, so the same server endpoints run in simulation
 *              mode and the UI is explicit about it — it never pretends a payment happened.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

declare global {
  interface Window {
    paypal?: {
      Buttons: (config: Record<string, unknown>) => { render: (el: HTMLElement) => Promise<void>; close?: () => void };
    };
  }
}

const SDK_ID = "paypal-sdk";

function loadSdk(clientId: string, currency: string) {
  return new Promise<void>((resolve, reject) => {
    if (window.paypal) return resolve();
    const existing = document.getElementById(SDK_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("sdk error")));
      return;
    }
    const s = document.createElement("script");
    s.id = SDK_ID;
    s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=${encodeURIComponent(currency)}&intent=capture&components=buttons&disable-funding=credit`;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("PayPal SDK failed to load"));
    document.head.appendChild(s);
  });
}

export type PayPalButtonsProps = {
  lunasOrderId: string;
  amount: number;
  currency: string;
  onCaptured: (payer: { captureId?: string; paypalOrderId?: string; simulated: boolean; payerEmail?: string }) => void;
  onError?: (message: string) => void;
  onProcessing?: (busy: boolean) => void;
};

export function PayPalButtons({ lunasOrderId, amount, currency, onCaptured, onError, onProcessing }: PayPalButtonsProps) {
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "simulated" | "error">("loading");
  const [note, setNote] = useState<string>("");

  const simulate = useCallback(async () => {
    onProcessing?.(true);
    const created = await api.createEscrowPayment(lunasOrderId);
    if (!created.ok) {
      onProcessing?.(false);
      onError?.(created.error ?? "Could not open the payment");
      return;
    }
    const captured = await api.captureEscrowPayment(created.data.paypalOrderId, lunasOrderId);
    onProcessing?.(false);
    if (!captured.ok) {
      onError?.(captured.error ?? "Capture failed");
      return;
    }
    onCaptured({
      captureId: captured.data.captureId,
      paypalOrderId: created.data.paypalOrderId,
      simulated: true,
      payerEmail: captured.data.paypal?.payerEmail,
    });
  }, [lunasOrderId, onCaptured, onError, onProcessing]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cfg = await api.paypalConfig();
      if (cancelled) return;
      const clientId: string | null = cfg.data?.clientId ?? null;
      if (!cfg.ok || !clientId) {
        setState("simulated");
        setNote("No PayPal sandbox credentials on this deployment — the server runs in simulation mode.");
        return;
      }
      try {
        await loadSdk(clientId, currency);
        if (cancelled || !window.paypal || !box.current) throw new Error("sdk unavailable");
        await window.paypal.Buttons({
          style: { shape: "pill", color: "gold", layout: "vertical", label: "paypal", height: 48 },
          createOrder: async () => {
            const res = await api.createEscrowPayment(lunasOrderId);
            if (!res.ok) throw new Error(res.error ?? "create failed");
            return res.data.paypalOrderId as string;
          },
          onApprove: async (data: { orderID: string }) => {
            onProcessing?.(true);
            const res = await api.captureEscrowPayment(data.orderID, lunasOrderId);
            onProcessing?.(false);
            if (!res.ok) {
              onError?.(res.error ?? "Capture failed");
              return;
            }
            onCaptured({
              captureId: res.data.captureId,
              paypalOrderId: data.orderID,
              simulated: Boolean(res.data.simulated),
              payerEmail: res.data.paypal?.payerEmail,
            });
          },
          onError: (err: unknown) => {
            setNote(String((err as Error)?.message ?? err));
            onError?.("PayPal could not complete that payment.");
            onProcessing?.(false);
          },
        }).render(box.current);
        if (!cancelled) setState("ready");
      } catch (e) {
        if (cancelled) return;
        setState("simulated");
        setNote(`PayPal SDK unavailable here (${(e as Error).message}). Simulation mode is ready instead.`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lunasOrderId, currency, onCaptured, onError, onProcessing]);

  return (
    <div className="pp-wrap">
      <div ref={box} style={{ minHeight: state === "ready" ? 52 : 0 }} />

      {state === "loading" && <div className="tiny muted">Loading PayPal…</div>}

      {state === "simulated" && (
        <>
          <button type="button" className="btn lemon lg" onClick={simulate} style={{ width: "100%", justifyContent: "center" }}>
            <PayPalMark /> Pay {currency} {(amount).toFixed(2)} — simulated
          </button>
          <div className="tiny muted" style={{ marginTop: 8, lineHeight: 1.5 }}>
            {note || "Simulation mode: the Orders v2 calls run against the built-in simulator."}{" "}
            Both endpoints are the real ones (<code>/api/paypal/orders</code> →{" "}
            <code>/api/paypal/orders/:id/capture</code>); add sandbox keys and this button becomes the genuine PayPal button.
          </div>
        </>
      )}

      {state === "error" && <div className="tiny" style={{ color: "var(--red)" }}>{note}</div>}

      <style>{`
        .pp-wrap{display:flex;flex-direction:column;gap:4px}
        .pp-mark{display:inline-flex;align-items:center;gap:6px}
      `}</style>
    </div>
  );
}

/** Small inline PayPal wordmark so the button reads correctly without external assets. */
export function PayPalMark() {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 2, fontWeight: 900, letterSpacing: "-.02em" }}>
      <span style={{ color: "#003087" }}>Pay</span>
      <span style={{ color: "#009cde" }}>Pal</span>
    </span>
  );
}
