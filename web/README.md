# Lunas — web

Next.js 16 (App Router) + TypeScript. Playful "candy sticker" UI for **Lunas**, AI-verified escrow for freelancers, powered by PayPal.
Languages: **English (default)**, 中文, Bahasa Indonesia (switcher top-right, saved per device). Themes: Candy, Midnight, Matcha.

## Run

```bash
npm install
npm run dev      # http://localhost:3000
npm run build && npm start
```

Works with **no credentials**: PayPal routes answer `503 { enabled: false }` and the agents fall back to a deterministic local engine, so every screen stays usable.

## Pages

| Route | What it is |
|---|---|
| `/` | Landing page (hero, how it works, "try the stamp" demo) |
| `/dashboard` | Freelancer home: stats, orders needing attention, earnings, activity |
| `/orders?tab=from_client` | **Orders from clients** (incoming requests) |
| `/orders?tab=to_client` | **Orders to clients** (orders you sent) |
| `/orders/new` | 4-step wizard to send an order to a client (AI drafts the contract) |
| `/orders/[id]` | Order detail with live flow: accept → pay → deliver → AI check → review → LUNAS stamp |
| `/to/[handle]` | Public order page clients use to send a request (e.g. `/to/sasam`) |
| `/signin` | Two ways in: **guest mode** (shared SASAM demo profile) or **Log in with PayPal** (sandbox) |
| `/to/[handle]` (published) | If that handle was published, the page is served from Supabase — the visitor sees the real profile |
| `/insights` | Self-serve dashboard (AG Studio): orders, PayPal money events and agent runs. Drag fields to build widgets, cross-filter, reshape — the layout is part of the report state. |
| `/profile` | Your identity: photo upload, social links, portfolio list (all editable, per identity) |

## API

| Route | Purpose |
|---|---|
| `POST /api/agent/draft` | Contract Agent — brief → title, amount, machine-checkable criteria |
| `POST /api/agent/verify` | Verification Agent — criteria + delivery → per-criterion verdicts |
| `POST /api/agent/mediate` | Mediator — dispute reasoning + recommended resolution |
| `POST /api/paypal/create-order` | Orders v2 — escrow hold (idempotent per click via nonce) |
| `POST /api/paypal/capture-order` | Capture on client approval |
| `POST /api/paypal/payout` | Payouts v1 — release to the freelancer |
| `POST /api/paypal/refund` | Payments v1 — refund a capture (dispute outcome) |
| `POST /api/paypal/webhook` | Signature-verified webhook receiver (GET returns setup info) |
| `GET /api/auth/paypal/start` | Sends the visitor to PayPal's consent screen (sandbox by default) |
| `GET /api/auth/paypal/callback` | Exchanges the code, reads Identity API userinfo, sets the signed session cookie |
| `GET /api/auth/session` | Who is this visitor: `{ mode: "guest" \| "paypal", paypal?, paypalLoginAvailable }` |
| `POST /api/auth/signout` | Clears the session cookie — back to guest mode |
| `GET /api/profile` | Is my profile published, and under which handle? |
| `PUT /api/profile` | Publishes the signed-in profile (sanitised again server-side) |
| `GET /api/profiles/[handle]` | Public read of a published profile (safe columns only, no account id) |

## Environment

Copy `.env.example` → `.env.local`, or set these in Vercel → Project → Settings → Environment Variables.

| Variable | What it does |
|---|---|
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | Sandbox app credentials (`developer.paypal.com` → Apps & Credentials). Without them the PayPal routes stay disabled. |
| `PAYPAL_WEBHOOK_ID` | Enables signature verification on `/api/paypal/webhook`. |
| `PAYPAL_LIVE=1` | Switches from `api-m.sandbox.paypal.com` to `api-m.paypal.com`. |
| `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | Client id for any browser-side PayPal usage. |
| `LLM_API_KEY` | Contract / Verification / Mediator agents. Without it they use the local deterministic engine. |
| `LLM_BASE_URL`, `LLM_MODEL` | Any OpenAI-compatible gateway (default `https://api.openai.com/v1/chat/completions`, `gpt-4o-mini`). |
| `NEXT_PUBLIC_AG_STUDIO_LICENSE` | AG Studio trial key for `/insights`. Front-end licence by design; without it the dashboard still works but shows a watermark. Evaluation only. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | Publishes profiles so clients on other devices see the real photo/links/portfolio. Create the table with `../supabase/setup.sql`. The **secret** key is server-only — no `NEXT_PUBLIC_` prefix. |
| `AUTH_SECRET` | HMAC key that signs the session cookie. Falls back to `PAYPAL_CLIENT_SECRET`; set it to keep the two keys separate. |
| `APP_ORIGIN` | Optional. Public origin used to build the OAuth return URL (e.g. `https://lunas-project.vercel.app`). Must match the **Return URL** registered in the PayPal dashboard. |
| `BUILD_SHA` | Build stamp shown in the footer (injected by the deploy script). |

## Structure

- `lib/dict.ts` — all UI text in 3 languages
- `lib/i18n.tsx` — language provider, `t()`, money/date formatting per locale
- `lib/me.tsx` — identity + profile: guest persona (SASAM) or the PayPal account in session; profiles stored per identity, including photo (data URL), social links and portfolio items. `normalizeUrl()` keeps only http(s) links out of user input
- `lib/session.ts` — server-only: HMAC-signed session cookie, OAuth state, Identity API calls
- `lib/profile.ts` — pure profile model + `sanitizeProfile()`/`normalizeUrl()` shared by browser and server
- `lib/store.ts` — server-only Supabase access for published profiles
- `lib/insights.ts` — the three tables behind the Insights dashboard (orders, money events, agent runs)
- `components/AgStudioView.tsx` — the AG Studio instance, its Lunas theme and the starter report
- `lib/data.ts` — mock ledger + local brief parser (the fallback the Contract Agent uses)
- `lib/agent.ts` — Contract / Verification / Mediator agents (LLM + local fallback)
- `lib/paypal.ts` — PayPal REST client: Orders v2, Payouts v1, Refunds, webhook verification
- `lib/webhook.ts` — in-memory buffer so the Agent activity panel can show real push events
- `components/` — Capi mascot, money rail, UI primitives, app shell

> **Sign-in needs no database.** The session is one signed HttpOnly cookie holding the Identity API claims (name, email, PayPal account ID). Signing in requires *Log in with PayPal* to be enabled on the app in the PayPal Developer Dashboard, with the Return URL exactly `https://<your-domain>/api/auth/paypal/callback`.

> Demo data lives in `lib/data.ts`; the ledger is not persisted server-side yet. Real PayPal and LLM calls activate as soon as the env vars above exist.

## Brand assets (`../brand/` and `public/brand/`)

| File | Used for |
|---|---|
| `public/brand/logo-lockup.png` | **Top-corner mark on every page** (crest + wordmark, transparent) |
| `public/brand/logo-full.png` | Landing page hero / footer artwork |
| `public/brand/emblem.png` | Emblem-only crop (order receipt, in-app accents) |
| `public/brand/capi-*.png`, `stamp-seal.png`, `wax-seal.png` | Capi mascot poses, LUNAS stamp, wax seal |
| `../brand/` | Hi-res originals: gold-on-navy lockup, gold transparent lockup/emblem, remove.bg export |

`app/icon.png` is the favicon.
