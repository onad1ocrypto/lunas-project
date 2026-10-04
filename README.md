# Lunas 🌙 — smart contracts without crypto

**AI-verified escrow for cross-border freelancers. PayPal settles, AI arbitrates, everyone sleeps well.**

Lunas turns a vague client brief into a clear contract with **machine-checkable acceptance criteria**, locks the client's money in a **PayPal-funded escrow**, lets a **Verification Agent** check the actual deliverables, and releases the payout automatically — finished with a satisfying **LUNAS** stamp (Indonesian for _"paid in full"_).

> Built for the **PayPal AI Hackathon** (Oct 1 – Nov 12, 2026) · "Build What's Next with PayPal and AI".
> Status: **working end-to-end prototype** — real PayPal Orders/Payouts/Refunds calls (sandbox), real file inspection, real LLM agents. No credentials? The app runs in a clearly-labelled simulation mode so the flow is never broken.

---

## Story (demo)

Sari, a product-photo editor in Yogyakarta, gets a brief from James in Austin: _20 photos, white background, 2000px, JPG, $150._
Lunas drafts the contract → James funds the escrow with PayPal (Orders v2 capture) → Sari uploads → the Verification Agent checks file count / format / resolution / background → one file missing → revision → re-upload passes → 72h review window → auto-release via Payouts → **LUNAS!**

---

## How the hackathon requirements are met

| Requirement | Where it lives |
| --- | --- |
| **PayPal, meaningfully** | Orders v2 create + capture (`lib/server/paypal.ts` → `POST /api/paypal/orders`, `.../capture`), Payouts v1 release (`POST /api/orders/:id/release`), Payments v1 refunds (`POST /api/orders/:id/refund`), webhook signature verification + event handling (`POST /api/webhooks/paypal`), PayPal JS SDK Smart Buttons (`components/PayPalButtons.tsx`) |
| **AI, meaningfully** | **Contract Agent** — brief → acceptance criteria in a rule DSL (`lib/server/agents.ts`, `POST /api/agent/contract`); **Verification Agent** — byte-level inspection of real uploads (PNG/JPEG/WebP/GIF/SVG/PDF/text headers in `lib/server/image.ts`) plus **vision-model review** for subjective criteria; **Release policy** — 72h window auto-release / dispute + refund path |
| **Working prototype (not a mockup)** | Full flow runs offline: create order → escrow → upload → verify → release. Every number and id in the UI comes from the API responses, never hardcoded |
| **Documented for judges** | This README + `/api/health` (live integration status) + the in-app **IntegrationBadge** that states whether PayPal/AI are real or simulated |
| **Public repo + license** | MIT (`LICENSE`) |

---

## Quickstart

```bash
cd web
npm install
npm run dev          # http://localhost:3000
```

Production build:

```bash
npm run build && npm start
```

**Zero configuration works.** Without credentials the app boots in *simulation mode*: PayPal endpoints answer with realistic simulated ids, the AI falls back to a deterministic rule engine. The badge in the top bar always tells you which mode you are looking at.

### Going real

1. **PayPal sandbox** — developer.paypal.com → *Apps & Credentials* → create an app → copy `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` into `web/.env.local`.
2. **Payouts** — create a **business** sandbox account (Payouts can't pay a personal account) and set `PAYPAL_PAYOUT_RECEIVER` to its email. Link the account in the sandbox site so it can receive money.
3. **Webhooks** — in the app's *Webhooks* section subscribe to the five events listed in `web/.env.example`, put the webhook id in `PAYPAL_WEBHOOK_ID`, and point it at `https://<your-deploy>/api/webhooks/paypal`.
4. **AI** — set `LLM_API_KEY` (any OpenAI-compatible gateway, or `LLM_PROVIDER=anthropic`). The Contract Agent switches from heuristic to LLM, and image criteria start getting real vision review.

Deploy on Vercel: import the repo, **Root Directory = `web`**, add the env vars above.

---

## Demo script (≈2 min, for the submission video)

1. `/` — land on the pitch, then **Open app**.
2. `/to/sari` — as a client: type a brief, press **Draft with AI** → criteria appear (count, format, resolution, background). Send the order.
3. Open the generated **checkout link** `/pay/LNS-…` → **Pay with PayPal** (sandbox) → capture → *money is in escrow*.
4. Back in the app, the order shows **IN ESCROW**; press **Generate a sample delivery** (or drop your own files) → the agent inspects the actual bytes → one criterion fails → **revision**.
5. Re-upload/Fix → all criteria pass → **client review window** → **Approve** → Payouts → **LUNAS** stamp + real payout batch id on the receipt.
6. Optional: **Mediator: refund the client** on the review panel to show the dispute path (Payments v1 refund).

---

## Architecture

```
web/
├── app/
│   ├── (app)/            dashboard, orders, order detail, wizard, profile   [freelancer UI]
│   ├── to/[handle]/      public "hire me" page (client sends a brief)       [client UI]
│   ├── pay/[id]/         public checkout — funds the escrow                 [client UI]
│   └── api/              health · orders · deliverables · release · refund
│                         · agent/contract · paypal/* · webhooks/paypal
├── components/           AppShell, PayPalButtons, IntegrationBadge, Capi, ui kit…
└── lib/
    ├── api.ts            typed browser client (never throws)
    ├── data.ts           mock ledger for the demo UI + heuristic brief parser
    ├── sample.ts         generates real PNG/JPEG/TXT files that match the criteria
    └── server/
        ├── env.ts        mode detection (live / sandbox / simulated)
        ├── paypal.ts     Orders v2 · Capture · Payouts v1 · Refunds · webhook verify
        ├── agents.ts     Contract Agent + Verification Agent (rules + vision)
        ├── image.ts      dependency-free byte inspection (dimensions, alpha, DPI, words)
        ├── flow.ts       escrow orchestration + audit trail + webhook application
        ├── ticket.ts     HMAC-signed order snapshots (serverless-safe state)
        ├── resolve.ts    order lookup: store first, then a verified ticket
        └── store.ts      order ledger (JSON file, in-memory fallback)
```

### Money movement, in order

```
client pays  ──▶ Orders v2 create → approve → capture   ──▶  escrow balance (platform)
freelancer    ──▶ uploads deliverables → Verification Agent
client/72h    ──▶ release  → Payouts v1 batch           ──▶  freelancer's PayPal
dispute       ──▶ mediator → Payments v1 refund         ──▶  client's PayPal
```

### Running on serverless (why there are "tickets")

`POST /api/orders` also returns a `ticket`: an **HMAC-signed snapshot** of the order. The browser stores it (`localStorage`) and sends it back as `x-lunas-ticket` on every follow-up call.

That exists because serverless instances share no memory — an order created a minute ago can be invisible to the next request, which is exactly the "order not found" a judge would otherwise hit mid-demo. With the ticket the flow survives cold starts with **no database to provision**, and it is safe: the payload is tamper-evident, the signing secret never leaves the server, and money still only moves through PayPal capture/payout/refund with real ids. (A deployment with a durable store just ignores the ticket — the store wins.)

Known limits of that shortcut: a link opened in a *different* browser has no ticket (add Postgres/KV for true multi-device), and the platform balance is simulated until you plug in a place to hold escrow properly — see the roadmap.

### Acceptance-criteria rule DSL

The Contract Agent (LLM) is constrained to a grammar the verifier can actually execute:

```
count(files) == 20              mime == image/jpeg            formats ⊇ {pdf, pptx}
w == 1080 && h == 1350          max(w,h) ≥ 2000               dpi ≥ 300
pages == 2                      300 ≤ words ≤ 500             contains('handmade','Osaka')
png && alpha                    submitted_at ≤ due
vision: bg ≥ 97% #FFF           manual: <what a human must confirm>
```

Anything unprovable from the bytes is reported as **manual/needs review** rather than guessed — that is the difference between a demo and a system you would actually trust with money.

---

## API

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/health` | integration status: PayPal mode, AI engine, webhook, fee |
| POST | `/api/agent/contract` | brief → criteria (LLM, heuristic fallback) |
| GET / POST | `/api/orders` | ledger / create escrow order (+ payment link) |
| GET / PATCH | `/api/orders/:id` | full record incl. audit trail / accept · decline |
| POST | `/api/orders/:id/deliverables` | upload files → inspect → verify |
| POST | `/api/orders/:id/release` | Payouts release (client / auto / mediator) |
| POST | `/api/orders/:id/refund` | mediator refund via Payments v1 |
| POST | `/api/paypal/orders` | Orders v2 create (escrow hold) |
| POST | `/api/paypal/orders/:id/capture` | capture into escrow |
| POST | `/api/webhooks/paypal` | signature-verified webhook receiver |
| GET | `/api/paypal/config` | client id + button config for the browser SDK |

---

## Status & roadmap

- [x] Design system, trilingual UI (EN/中文/ID), 3 themes
- [x] Orders v2 escrow hold + capture · Payouts release · Refunds · webhook verification
- [x] Contract Agent (LLM + heuristic) writing executable acceptance criteria
- [x] Verification Agent: byte inspection (count/format/dimensions/alpha/DPI/words/deadline) + vision review
- [x] Public client page → checkout → LUNAS receipt with real PayPal ids
- [x] Audit trail per order (agent + PayPal + webhook events)
- [ ] Durable database (today: JSON file + signed client tickets) + background auto-release job
- [ ] PDF contract export + e-signature, email/Slack notifications
- [ ] Multi-currency conversion at contract time

## Brand

The mark: a gold crest over navy — handshake + laurel + dollar, `brand/`. The web app uses the transparent lockup (`web/public/brand/lunas-lockup-640.png`) in the top corner of every page and the emblem as the favicon.

## License

MIT — see [LICENSE](LICENSE).
