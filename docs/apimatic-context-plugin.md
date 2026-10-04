# The APIMatic PayPal Server SDK Context Plugin, as used in Lunas

Lunas pays through PayPal's **REST** APIs directly (`web/lib/paypal.ts` — Orders v2, Payouts v1,
Payments v1, webhook signature verification). It does not import a generated SDK. This document records
what the **APIMatic PayPal Server SDK Context Plugin (TypeScript skill set)** actually changed in that
file, so a reviewer can trace every claim below to a specific skill and a specific line of code.

Install (as published by PayPal for this hackathon):

```bash
npx context-plugins install https://github.com/paypaldev/server-sdk-context-plugin-preview
```

The plugin is a **skill pack for a coding agent** — `plugin.json` lists skill paths only, no MCP server,
so any agent that can read files (Claude Code, Cursor, VS Code, Codex, or a chat model given the files)
can use it. It is a hackathon preview, "not an official long term supported PayPal product", so Lunas
takes its *guidance* and keeps zero runtime dependency on it.

Method: each of the 8 TypeScript `SKILL.md` files was read against `web/lib/paypal.ts`, the integration
was audited for what the skills say a generated client would have done differently, the findings were
fixed in plain `fetch`, and the result was verified offline (`web/scripts/uji-transport-paypal.sh`).

## 1. What the audit found

| # | Finding in `web/lib/paypal.ts`, before the audit | Why it matters |
|---|---|---|
| 1 | `createPayout()` sent **no** `PayPal-Request-Id`, and built `sender_batch_id` from `Date.now()` | A retried payout is a *second* payout — the freelancer could be paid twice |
| 2 | Refund idempotency key was `` `${ref.id}-refund-${Date.now()}` `` | Regenerated on every call, so a retry became a new refund; the header existed but never deduplicated anything |
| 3 | No retry and no backoff anywhere; no timeout on any `fetch` | One transient 429/503 surfaced to the user as a failure; a stalled connection hung until the platform's own limit |
| 4 | PayPal's error body was flattened to a bare `Error(message)` — `debug_id` and `details[]` discarded | A failed payment could not be traced with PayPal support |

## 2. Skill → change

Each row is a piece of guidance the skills state, and the code it produced. Quotes are from the
TypeScript skill files of the plugin.

| Skill file | What the skill says | Change in Lunas |
|---|---|---|
| `typescript-configuration-resilience` | `timeout` is **per attempt**, not total (client options table) | `paypalFetch()` gives **every attempt** its own `AbortController` deadline (`ATTEMPT_TIMEOUT_MS = 15_000`). Previously a stalled gateway could hold the request open indefinitely |
| `typescript-configuration-resilience` | `httpStatusCodesToRetry: [408, 429, 500, 502, 503, 504]` | `RETRY_STATUS` is that same set; anything else (e.g. 401, 422) fails immediately — no pointless retries |
| `typescript-configuration-resilience` | *"Raising `maxNumberOfRetries` alone is not enough. `maximumRetryWaitTime` is the total retry-wait budget, and a retry only happens when the computed backoff fits inside it… Set both."* | Retries are bounded by **both** a count (`MAX_ATTEMPTS = 3`) and a budget (`MAX_TOTAL_WAIT_MS = 6_000`, backoff `400ms × 2ⁿ`). The budget check happens before each sleep, so the loop cannot overshoot it |
| `typescript-configuration-resilience` | *"Only the methods listed in `httpMethodsToRetry` are retried… Add one only if the operation is idempotent."* | **This is the rule the transport now follows:** a POST is retried *only* when it carries an idempotency key. `canRetry` gates the whole retry branch, so a request that could not be safely repeated is sent exactly once |
| `typescript-configuration-resilience` | *"Neither the signal nor the timeout reaches a token exchange… a call that has to fetch a token can take up to two full `timeout` periods."* | The OAuth token request is treated as a call of its own with its own deadline (`TOKEN_TIMEOUT_MS = 10_000`) and its own retry loop, instead of assuming the caller's timeout covers it |
| `typescript-authentication` | *(note on `oAuthTokenProvider`)* *"A single rejection disables the client for the rest of the process. The rejected promise is cached as the client's token, and every later call re-throws it…"* | Lunas caches **only successful** tokens (`cache` is written after a 2xx, with a 90s early-expiry margin). A transient token failure is not remembered, so the next request retries the exchange instead of inheriting a poisoned client |
| `typescript-error-handling` | `ApiError` exposes `statusCode` and the parsed payload (`result`); branch on the status and the payload's shape, and parse `body` yourself when nothing did | `PayPalApiError` carries `status`, `paypalName`, `debugId` and `details[]` from PayPal's wire JSON, and composes one log-ready message (`"orders.capture failed (422 UNPROCESSABLE_ENTITY) — Bad amount — amount does not match — debug_id 9f2c1e"`). Routes keep their shapes: they already read `e.message` / `String(e)` |
| `typescript-testing` | *"Disable retries in tests (`retryConfig.maxNumberOfRetries: 0`) so a stubbed 5xx fails on the first attempt instead of waiting out the backoff"* and *"Seed a token so no fetch happens"* | The harness (`web/scripts/paypal-transport.test.cjs`) stubs `fetch` at the boundary, seeds the token response, and asserts the retry/backoff behaviour **deliberately** rather than accidentally — including that backoff actually waits (1204ms for two 500s) and that `Retry-After` is honoured |
| `typescript-getting-started`, `typescript-client-initialization`, `typescript-calling-endpoints`, `typescript-models` | How to construct and call the **generated** client (`Client`, `Environment`, controllers) | Read and *not* applied: Lunas has no generated client to construct. They describe a surface this repo does not have, and nothing here pretends otherwise |

## 3. Outside the skills

Kept separate on purpose — this is PayPal REST knowledge, **not** something the plugin's skills state,
and it should not be read as plugin-derived:

- PayPal's `PayPal-Request-Id` header, and that reusing a key returns the first result instead of
  performing the call again. The skills say "add POST retries only if the operation is idempotent" —
  they never say *how* PayPal's REST API makes a POST idempotent.
- Stable `sender_batch_id` values (`${orderId}-payout`) for Payouts v1.
- PayPal's `debug_id` / `details[].issue` fields in error bodies. The skill says to branch on the status
  and the parsed payload; the *field names* are from PayPal's own error schema.
- Retrying a webhook **verification** call (it asks a question about a stored event, so asking twice is
  harmless) — a property of that endpoint, not a skill claim.

## 4. Verification

- `npx next build` — compiles and type-checks clean; every route still emits.
- `bash web/scripts/uji-transport-paypal.sh` — 21 assertions, PayPal stubbed, no credentials and no
  network calls to PayPal: retries only with a key, identical `PayPal-Request-Id` across attempts, an
  identical `sender_batch_id` across attempts, `Retry-After: 1` honoured, 422 mapped with `debug_id`,
  refund keys stable across separate calls, failed webhook verification returned (not thrown), token
  cached. Output: 21 PASS / 0 FAIL.
- Runtime smoke with dummy credentials against the production build: `create-order`, `payout` and
  `refund` answer `502` JSON immediately with a readable message (a 401 is not retryable), and the
  webhook route rejects an unverified push with `400` plus the reason. No crash, no hang.

Exported signatures did not change, so no call site was touched: the diff is `web/lib/paypal.ts` plus
this document.
