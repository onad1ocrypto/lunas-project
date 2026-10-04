# Lunas 🌙 — smart contracts without crypto

**AI-verified escrow for cross-border freelancers. PayPal settles, AI arbitrates, everyone sleeps well.**

Lunas turns a vague client brief into a clear contract with machine-checkable acceptance criteria, locks the client's money in a PayPal-funded escrow, lets a Verification Agent check the deliverable, and releases the payout automatically — finished with a satisfying **LUNAS** stamp (Indonesian for _"paid in full"_).

Live: **https://lunas-project.vercel.app**

### The story it tells

SASAM, a product-photo editor in Wonogiri, Indonesia, gets a brief from James in Austin: _20 photos, white background, 2000px, JPG, $150._
Lunas drafts the contract → James funds the escrow with PayPal → SASAM delivers → the Verification Agent checks the criteria → one file fails → revision → re-upload passes → review window → payout via PayPal → **LUNAS!**

---

## Sign in: guest mode or a PayPal sandbox account

Lunas keeps no passwords of its own. `/signin` offers two ways in:

| Mode | For | What happens |
|---|---|---|
| **Guest** | anyone evaluating the project | The shared demo profile — **SASAM**, Wonogiri, Indonesia — loads from the browser. Every flow works: send an order, escrow, delivery, verification, release. Edits stay in that browser. |
| **Log in with PayPal** | a visitor with a PayPal *sandbox* account | Log in with PayPal (PayPal Identity API / OpenID Connect). Lunas receives only the standard claims — name, email, PayPal account ID — and keeps them in a signed HttpOnly cookie. No password ever reaches the app, and no PayPal credential is stored anywhere. |

Connected that way, the profile becomes the user's own: name, handle, city, bio and skills are editable, and the PayPal account ID doubles as the payout receiver for that profile.

### Try it as a judge (2 minutes)

1. Open **https://lunas-project.vercel.app/signin**
2. **Guest mode** needs nothing — click *Open the app as a guest*.
3. For the PayPal path, use the sandbox tester account below (sandbox only: fake money, no real account, no funding source):

   ```
   email:    <sandbox tester email — filled in before submission>
   password: <sandbox tester password — filled in before submission>
   ```

4. You land on your own profile, then walk the money flow on any order: open **Lunas Orders → LNS-0142 → Approve & pay**, and pay with that same tester account.

> This is a **sandbox** account created in the PayPal Developer Dashboard (*Testing Tools → Sandbox Accounts*). If it ever runs out of test balance, a new one takes 10 seconds to create. Sign-in needs **Log in with PayPal** enabled for the app in the dashboard (Return URL must match `https://lunas-project.vercel.app/api/auth/paypal/callback` exactly); if it is not enabled, the button says so and guest mode still gives full access.

---

## What's in this repo

| Path | What it is |
|---|---|
| `web/` | The Next.js 16 app (UI + API routes) — see [web/README.md](web/README.md) |
| `brand/` | Hi-res brand originals (gold lockup on navy, transparent lockup/emblem, emblem crop) |
| `design-prototype.html` | Early self-contained interactive prototype of the 5-step flow |
| `tools/` | Local Playwright screenshot helpers (dev only, not deployed) |

## Run it

```bash
cd web
npm install
npm run dev        # http://localhost:3000
npm run build && npm start
```

No credentials are required to explore it: PayPal routes answer `{ enabled: false }` and the agents fall back to a deterministic local engine.

## Configure it

Everything lives in `web/.env.local` (or Vercel → Project → Settings → Environment Variables). Full table in [web/README.md](web/README.md); the short version:

```
PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET   # sandbox app credentials — turns the PayPal routes on
PAYPAL_WEBHOOK_ID                         # enables webhook signature verification
PAYPAL_LIVE=1                             # switch from sandbox to live
LLM_API_KEY                               # Contract / Verification / Mediator agents
LLM_BASE_URL / LLM_MODEL                  # any OpenAI-compatible gateway
AUTH_SECRET                               # signs the session cookie (falls back to PAYPAL_CLIENT_SECRET)
APP_ORIGIN                                # optional: public origin used for the OAuth return URL
```

## Deploy

The app lives in `web/`, so the Vercel project must have **Root Directory = `web`**.

- **Git (normal path):** push to `main` → Vercel builds and deploys automatically.
- **CLI (fallback):** `cd web && npx vercel deploy --prod`

> Setting Root Directory correctly matters: with it pointed at the repository root, Vercel fails every Git build with `missing_pages_app` and only manual CLI deploys go through.

---

## How the money moves

```
sign in       ──▶ GET  /api/auth/paypal/start → PayPal consent screen
              ──▶ GET  /api/auth/paypal/callback → Identity API userinfo → signed session cookie
client pays   ──▶ POST /api/paypal/create-order   (Orders v2, intent CAPTURE, idempotent per click)
              ──▶ POST /api/paypal/capture-order  (funds captured into escrow)
work delivered ──▶ POST /api/agent/verify          (per-criterion verdicts)
client/72h     ──▶ POST /api/paypal/payout         (Payouts v1 batch → freelancer)
dispute        ──▶ POST /api/agent/mediate → POST /api/paypal/refund   (Payments v1)
every step     ──▶ POST /api/paypal/webhook        (signature-verified, drives the live activity log)
```

Webhook events are verified with PayPal's `verify-webhook-signature` before anything is shown as confirmed.

## The agents

| Agent | Route | What it does |
|---|---|---|
| **Contract** | `POST /api/agent/draft` | Brief → title, amount, 3–5 acceptance criteria written as checkable rules (`count(files) == 20`, `mime == image/jpeg`, `max(w,h) >= 2000`, `vision: bg >= 97% #FFF`, …) |
| **Verification** | `POST /api/agent/verify` | Runs the criteria against the delivery, per-criterion verdict with evidence |
| **Mediator** | `POST /api/agent/mediate` | Reasons about a dispute and recommends release / revision / refund |

Both run on a real LLM when `LLM_API_KEY` is set and fall back to a deterministic local engine otherwise, so the demo never stalls — the response states which source produced the result.

## Brand

The mark: a gold crest over navy — handshake, laurel and dollar. The top-corner mark on every page is `web/public/brand/logo-lockup.png` (crest + wordmark, transparent); the emblem doubles as favicon and receipt stamp. Capi, the little stamp mascot, appears in `capi-idle / wink / jump / slam`.

## Status & roadmap

- [x] Trilingual UI (EN / 中文 / ID), three themes, order flows, public client page
- [x] Two ways in: guest mode (SASAM) and **Log in with PayPal** (Identity API) sessions, per-account profiles
- [x] Profile: photo upload (resized in the browser), social links (X, LinkedIn, Instagram, website) and a portfolio list that clients see on the public page
- [x] PayPal REST integration: Orders v2 create + capture, Payouts v1 release, Payments v1 refund, webhook signature verification
- [x] Contract / Verification / Mediator agents with LLM + local fallback
- [ ] Durable storage for orders and the webhook buffer (currently in-memory demo data)
- [ ] Real file inspection for deliveries (currently the verification runs on the described delivery)
- [ ] Persist agent audit trail per order; email/Slack notifications

## License

MIT — see [LICENSE](LICENSE).
