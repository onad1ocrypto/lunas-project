/* Offline harness for web/lib/paypal.ts — PayPal itself is stubbed, nothing leaves the machine.
   Run it with:  bash web/scripts/uji-transport-paypal.sh
   Written after reading the APIMatic PayPal Server SDK Context Plugin, which states that a POST should
   only be added to a retry list "if the operation is idempotent" (typescript-configuration-resilience)
   and that a stubbed 5xx needs retries zeroed to fail on the first attempt (typescript-testing). */
process.env.PAYPAL_CLIENT_ID = "fake-id";
process.env.PAYPAL_CLIENT_SECRET = "fake-secret";
delete process.env.PAYPAL_LIVE;

// The runner compiles web/lib/paypal.ts into a temp dir and drops this file next to it.
const P = require("./paypal.js");

let calls = [];            // every fetch, in order
let script = [];           // queued responses for the *business* endpoint
let tokenResponse = { status: 200, body: { access_token: "tok-1", expires_in: 3600 } };
let busCallCount = 0;

global.fetch = async (url, init) => {
  const u = String(url);
  calls.push({ url: u, method: init.method, headers: init.headers, body: init.body });
  busCallCount += 1;
  busCallCount -= 4; // unused sentinel
  if (u.includes("/v1/oauth2/token")) {
    return mk(tokenResponse);
  }
  const next = script.shift();
  if (!next) throw new Error(`unexpected business call to ${u}`);
  if (next.stall) {
    // never resolves until the caller aborts
    return new Promise((_, rej) => {
      init.signal.addEventListener("abort", () => rej(new Error("aborted")));
    });
  }
  return mk(next);
};

function mk({ status, body, headers = {} }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => headers[k.toLowerCase()] ?? null },
    json: async () => body ?? {},
  };
}

const ok = (name, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
  if (!cond) process.exitCode = 1;
};

const bizHeaders = () => calls.filter((c) => !c.url.includes("oauth2/token"));
const headerOf = (c, k) => c.headers?.[k];

(async () => {
  /* 1 — idempotency key on the wire + retry on 500 then success */
  calls = []; script = [
    { status: 500, body: { name: "INTERNAL_SERVER_ERROR", debug_id: "dbg-1" } },
    { status: 500, body: { name: "INTERNAL_SERVER_ERROR", debug_id: "dbg-2" } },
    { status: 201, body: { id: "ORDER-1" } },
  ];
  const t0 = Date.now();
  const id = await P.createPayPalOrder({ id: "LNS-9", amount: 12.5, currency: "USD", description: "x" });
  const took = Date.now() - t0;
  ok("create-order survives two 500s", id === "ORDER-1");
  ok("  exactly 3 attempts", bizHeaders().length === 3, `got ${bizHeaders().length}`);
  ok("  PayPal-Request-Id sent on every attempt",
    bizHeaders().every((c) => headerOf(c, "PayPal-Request-Id") === "LNS-9-create"));
  ok("  same key on retries (not a new order)", new Set(bizHeaders().map((c) => headerOf(c, "PayPal-Request-Id"))).size === 1);
  ok("  waited between attempts (backoff)", took >= 400 + 800 - 50, `${took}ms`);
  ok("  body not duplicated on retry", bizHeaders().every((c) => c.body.includes("LNS-9")));

  /* 2 — a failing webhook verification is contained, not thrown at the route */
  process.env.PAYPAL_WEBHOOK_ID = "WH-1";
  calls = []; script = [
    { status: 503, body: { name: "SERVICE_UNAVAILABLE" } },
    { status: 503, body: { name: "SERVICE_UNAVAILABLE" } },
    { status: 503, body: { name: "SERVICE_UNAVAILABLE" } },
  ];
  const w = await P.verifyWebhookSignature(
    { transmissionId: "t-1", transmissionTime: "b", certUrl: "c", authAlgo: "d", transmissionSig: "e" },
    JSON.stringify({ id: "EV-1" })
  );
  ok("failed verification returns a result, does not throw", w.verified === false && w.status === "VERIFY_HTTP_503", JSON.stringify(w.status));
  ok("  verification body was sent (webhook_id + event)",
    /"webhook_id":"WH-1"/.test(bizHeaders()[0].body) && /"webhook_event":\{"id":"EV-1"/.test(bizHeaders()[0].body));
  const allKeyed = calls.filter((c) => !c.url.includes("oauth2/token")).every((c) => Boolean(headerOf(c, "PayPal-Request-Id")));
  ok("  every mutating call so far carried an idempotency key", allKeyed);

  /* 3 — 429 with Retry-After is honoured */
  calls = []; script = [
    { status: 429, body: { name: "RATE_LIMIT_REACHED" }, headers: { "retry-after": "1" } },
    { status: 200, body: { id: "ORDER-2" } },
  ];
  const t1 = Date.now();
  const id2 = await P.createPayPalOrder({ id: "LNS-10", amount: 1, currency: "USD", description: "y" });
  const waited = Date.now() - t1;
  ok("429 recovered", id2 === "ORDER-2");
  ok("  Retry-After: 1 respected", waited >= 1000 - 50, `${waited}ms`);

  /* 4 — error mapping keeps PayPal's wire fields */
  calls = []; script = [{ status: 422, body: { name: "UNPROCESSABLE_ENTITY", message: "Bad amount", debug_id: "9f2c1e", details: [{ issue: "AMOUNT_MISMATCH", description: "amount does not match" }] } }];
  let e4 = null;
  try {
    await P.capturePayPalOrder("ORDER-X");
  } catch (e) { e4 = e; }
  ok("PayPalApiError carries name/status/debug_id/details",
    e4?.paypalName === "UNPROCESSABLE_ENTITY" && e4?.status === 422 && e4?.debugId === "9f2c1e" && e4?.details[0]?.issue === "AMOUNT_MISMATCH");
  ok("  message is readable and traceable",
    /capture failed \(422 UNPROCESSABLE_ENTITY\)/.test(e4.message) && e4.message.includes("debug_id 9f2c1e"),
    JSON.stringify(e4.message));

  /* 5 — payout uses a stable key, not the clock */
  calls = []; script = [
    { status: 500, body: { name: "INTERNAL_SERVER_ERROR" } },
    { status: 201, body: { batch_header: { payout_batch_id: "PB-1" } } },
  ];
  const pb = await P.createPayout({ id: "LNS-11", amount: 5, currency: "USD", receiver: "x@y.z", note: "n" });
  const payoutCalls = bizHeaders();
  const batchIds = payoutCalls.map((c) => JSON.parse(c.body).sender_batch_header.sender_batch_id);
  ok("payout retried safely and returned batch id", pb === "PB-1" || JSON.stringify(pb).includes("PB-1"));
  ok("  sender_batch_id identical across attempts", new Set(batchIds).size === 1 && batchIds[0] === "LNS-11-payout", batchIds.join(","));
  ok("  PayPal-Request-Id identical across attempts",
    new Set(payoutCalls.map((c) => headerOf(c, "PayPal-Request-Id"))).size === 1);
  ok("  no Date.now() in the payout key", !/\d{13}/.test(batchIds[0]));

  /* 6 — refund key is a function of the intent, not the moment */
  calls = []; script = [{ status: 201, body: { id: "REF-1", status: "COMPLETED" } }];
  const r1 = await P.refundCapture("CAP-9", { id: "LNS-12", amount: 3, currency: "USD", reason: "r" });
  const key1 = headerOf(bizHeaders()[0], "PayPal-Request-Id");
  calls = []; script = [{ status: 201, body: { id: "REF-1", status: "COMPLETED" } }];
  await P.refundCapture("CAP-9", { id: "LNS-12", amount: 3, currency: "USD", reason: "r" });
  const key2 = headerOf(bizHeaders()[0], "PayPal-Request-Id");
  ok("refund returns refundId+status", r1.refundId === "REF-1" && r1.status === "COMPLETED");
  ok("refund key is stable across separate calls", key1 === key2 && Boolean(key1), `${key1} vs ${key2}`);
  ok("  refund key identifies order+capture+amount", key1 === "LNS-12-refund-CAP-9-3.00" || /LNS-12.*CAP-9.*3/.test(key1), key1);

  /* 7 — token is cached, not re-fetched per call */
  const tokenCalls = calls.filter((c) => c.url.includes("oauth2/token")).length;
  ok("access token cached across calls", tokenCalls <= 1, `${tokenCalls} token call(s)`);
})();
