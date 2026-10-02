# Lunas — web (UI stage)

Playful "candy sticker" UI for Lunas: AI-verified escrow for freelancers, powered by PayPal.
Languages: **English (default)**, 中文, Bahasa Indonesia (switcher top-right, saved in localStorage).

## Run
```bash
npm install
npm run dev      # http://localhost:3000
```

## Pages
| Route | What it is |
|---|---|
| `/` | Landing page (hero, how it works, "try the stamp" demo) |
| `/dashboard` | Freelancer home: stats, orders needing attention, earnings, activity |
| `/orders?tab=from_client` | **Orders from clients** (incoming requests) |
| `/orders?tab=to_client` | **Orders to clients** (orders you sent) |
| `/orders/new` | 4-step wizard to send an order to a client (AI drafts the contract) |
| `/orders/[id]` | Order detail with live flow: accept → pay → deliver → AI check → review → LUNAS stamp |
| `/to/sari` | Public order page clients use to send a request |

## Structure
- `lib/dict.ts` — all UI text in 3 languages
- `lib/i18n.tsx` — language provider, `t()`, money/date formatting per locale
- `lib/data.ts` — mock orders + temporary "fake AI" brief parser (to be replaced by the real Contract Agent)
- `components/` — Capi mascot, money rail, UI primitives, app shell

> UI stage only: data is mocked, PayPal/AI calls are simulated. Next step: wire the PayPal sandbox (Orders, Payouts, Webhooks) and a real LLM.

## Brand assets (`../brand/` and `public/brand/`)
- `lunas-logo-gold-transparent-2k.png` — gold logo, transparent bg (used on the site)
- `lunas-emblem-gold-transparent-2k.png` — emblem-only crop (navbar tile, favicon)
- `lunas-logo-gold-on-navy-2k.png` — original lockup on navy (banners, video, slides)
- `lunas-logo-transparent-removebg-500.png` — original remove.bg export
- Site copies: `public/brand/logo-full.png`, `public/brand/emblem.png`, favicon `app/icon.png`
