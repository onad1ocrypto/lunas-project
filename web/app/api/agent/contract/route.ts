import { draftContract } from "@/lib/server/agents";
import { fail, json, rateLimit } from "@/lib/server/http";
import type { Lang } from "@/lib/dict";
import { llmConfigured } from "@/lib/server/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/agent/contract
 * { brief, lang?, currency?, due? } -> drafted contract with machine-checkable criteria.
 * Falls back to the deterministic parser when no LLM key is configured.
 */
export async function POST(req: Request) {
  try {
    if (!rateLimit(`contract:${req.headers.get("x-forwarded-for") ?? "local"}`, 60)) {
      return json({ ok: false, error: "Too many requests — slow down a little." }, 429);
    }
    const body = (await req.json().catch(() => ({}))) as {
      brief?: string;
      lang?: Lang;
      currency?: string;
      due?: string;
    };
    const brief = (body.brief ?? "").toString();
    if (brief.trim().length < 10) {
      return json({ ok: false, error: "Give me a slightly longer brief (at least 10 characters)." }, 400);
    }

    const draft = await draftContract(brief, { lang: body.lang, currency: body.currency, due: body.due });
    return json({
      ok: true,
      ...draft,
      engine: draft.engine,
      aiConfigured: llmConfigured(),
    });
  } catch (e) {
    return fail(e);
  }
}
