# Lunas — web app

Next.js 16 (App Router) + TypeScript. Playful "candy sticker" UI for **Lunas**, AI-verified escrow for freelancers, powered by PayPal.
Languages: **English (default)**, 中文, Bahasa Indonesia (switcher top-right, saved per device). Themes: Candy, Midnight, Matcha.

> Full project documentation, hackathon mapping and the demo script live in the [root README](../README.md).

## Run

```bash
npm install
npm run dev      # http://localhost:3000
npm run build && npm start
```

Works with **no credentials**: the app boots in simulation mode and the badge in the top bar shows whether PayPal and the AI agents are live or simulated. Configure `web/.env.local` (see `.env.example`) to switch to real PayPal sandbox + real LLM.

## Pages

| Route | Who it's for | What it does |
| --- | --- | --- |
| `/` | everyone | landing page, the LUNAS stamp demo |
| `/dashboard` | freelancer | what needs attention today |
| `/orders` | freelancer | orders from clients / orders to clients |
| `/orders/new` | freelancer | 4-step wizard: client → brief (Contract Agent) → contract → link |
| `/orders/[id]` | freelancer | escrow timeline, upload + verify, review window, receipt |
| `/to/[handle]` | client | public "hire me" page — send a brief, get a contract |
| `/pay/[id]` | client | checkout: fund the escrow with PayPal |
| `/profile` | freelancer | identity, preferences, PayPal sandbox card |

## API

All routes are documented in the root README. `GET /api/health` is the fastest way to see what is wired up on the running deployment.
