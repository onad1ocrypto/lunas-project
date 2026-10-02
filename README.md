# Lunas 🌙 — smart contracts without crypto

**AI-verified escrow for cross-border freelancers. PayPal settles, AI arbitrates, everyone sleeps well.**

Lunas turns a vague client brief into a clear contract with machine-checkable acceptance criteria, locks the client's money in a PayPal-funded escrow, lets a Verification Agent check the deliverables, and releases the payout automatically — finished with a satisfying **LUNAS** stamp (Indonesian for *"paid in full"*).

> 🎯 Built for the **PayPal AI Hackathon** (2026). Current stage: full trilingual web UI with simulated PayPal + AI. Sandbox integration is the next milestone.

## Story (demo)
Sari, a product-photo editor in Yogyakarta, gets a brief from James in Austin: *20 photos, white background, 2000px, JPG, $150.* Lunas drafts the contract, James pays into escrow via PayPal, Sari uploads, the Verification Agent checks file count / format / resolution / background, one file fails → revision → re-upload passes → 72h review window → auto-release via Payouts → **LUNAS!**

## Repository layout
| Path | What |
|---|---|
| `web/` | Next.js 16 + TypeScript app (the product UI) |
| `brand/` | Logo assets (gold lockup, emblem, navy variant) |
| `design-prototype.html` | Early self-contained interactive prototype (5-step flow) |
| `tools/` | Local Playwright screenshot/flow scripts (dev helper, not deployed) |

## Web app features (current)
- **Trilingual UI** — English (default), 中文, Bahasa Indonesia; locale-aware money & dates.
- **Three themes** — Candy (default), Midnight (dark), Matcha; persisted per device.
- **Orders from clients** (accept / decline requests) and **orders to clients** (quotes you send).
- **Public order page** (`/to/sari`) — a client-facing "hire me in 2 minutes" form.
- **Order wizard** — a mock Contract Agent drafts milestones + checkable criteria from a raw brief, in the active language.
- **Order detail flow** — accept → PayPal pay (simulated) → deliver → AI verification scan → revision loop → client review → LUNAS stamp + confetti.
- **Profile & preferences** (`/profile`) — identity, stats, theme/language, PayPal sandbox card.
- Playful "candy sticker" design system: neo-brutalist outlines, offset shadows, Capi the stamp mascot, reduced-motion support.

## Run locally
```bash
cd web
npm install
npm run dev     # http://localhost:3000
```

## Deploy (Vercel)
1. Push this repo to GitHub (public).
2. Vercel → **Add New… → Project** → import the repo.
3. Set **Root Directory = `web`** (framework auto-detects Next.js).
4. Deploy. Add env vars later when the PayPal sandbox lands (`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `LLM_API_KEY`).

## Status & roadmap
- [x] Design prototype + design system
- [x] Trilingual UI, themes, order flows (mock data)
- [ ] PayPal sandbox: Orders v2 capture, escrow hold, Payouts release, webhooks
- [ ] Real Contract Agent + Verification Agent (LLM with tools + vision)
- [ ] Mediator Agent + Refunds API (disputes)
- [ ] Demo video (< 3 min) & Devpost submission

## License
MIT — see [LICENSE](./LICENSE).
