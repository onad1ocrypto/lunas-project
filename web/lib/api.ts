"use client";

/**
 * Thin client for the Lunas API. Every call returns { ok, ... } and never throws,
 * so UI code can render a friendly state instead of an unhandled rejection.
 */

import { orderIdOf, rememberTicket, ticketFor } from "./ticket-client";

export interface ApiResult<T> {
  ok: boolean;
  error?: string;
  status: number;
  data: T;
}

async function call<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const isForm = init?.body instanceof FormData;
    const ticket = ticketFor(orderIdOf(url, init?.body));
    const headers: Record<string, string> = {
      ...(isForm ? {} : { "Content-Type": "application/json" }),
      ...(ticket ? { "x-lunas-ticket": ticket } : {}),
      ...((init?.headers as Record<string, string>) ?? {}),
    };
    const res = await fetch(url, { ...init, headers });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string };
    return { ok: res.ok && (data as { ok?: boolean }).ok !== false, status: res.status, data, error: res.ok ? undefined : data.error ?? `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, status: 0, data: {} as T, error: (e as Error).message };
  }
}

export const api = {
  health: () => call<any>("/api/health", { cache: "no-store" }),
  listOrders: () => call<any>("/api/orders", { cache: "no-store" }),
  getOrder: (id: string) => call<any>(`/api/orders/${encodeURIComponent(id)}`, { cache: "no-store" }),
  patchOrder: (id: string, body: unknown) => call<any>(`/api/orders/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) }),
  createOrder: async (body: unknown) => {
    const res = await call<any>("/api/orders", { method: "POST", body: JSON.stringify(body) });
    const id = res.data?.order?.id as string | undefined;
    if (res.ok && id) rememberTicket(id, res.data?.ticket);
    return res;
  },
  draftContract: (body: { brief: string; lang?: string; currency?: string; due?: string }) =>
    call<any>("/api/agent/contract", { method: "POST", body: JSON.stringify(body) }),
  submitDelivery: (id: string, files: File[]) => {
    const fd = new FormData();
    for (const f of files) fd.append("files", f);
    return call<any>(`/api/orders/${encodeURIComponent(id)}/deliverables`, { method: "POST", body: fd });
  },
  createEscrowPayment: (orderId: string) => call<any>("/api/paypal/orders", { method: "POST", body: JSON.stringify({ orderId }) }),
  captureEscrowPayment: (paypalOrderId: string, lunasOrderId: string) =>
    call<any>(`/api/paypal/orders/${encodeURIComponent(paypalOrderId)}/capture`, { method: "POST", body: JSON.stringify({ lunasOrderId }) }),
  release: (id: string, actor: "client" | "auto" | "mediator" = "client") =>
    call<any>(`/api/orders/${encodeURIComponent(id)}/release`, { method: "POST", body: JSON.stringify({ actor }) }),
  refund: (id: string, reason: string) => call<any>(`/api/orders/${encodeURIComponent(id)}/refund`, { method: "POST", body: JSON.stringify({ reason }) }),
  paypalConfig: () => call<any>("/api/paypal/config", { cache: "no-store" }),
};

export type Health = {
  ok: boolean;
  paypal: "live" | "sandbox" | "simulated";
  ai: "live" | "heuristic";
  aiModel?: string | null;
  webhookConfigured: boolean;
  payoutReceiver: string;
  checks: Record<string, string>;
};
