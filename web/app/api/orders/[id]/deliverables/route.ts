import { fail, json, rateLimit } from "@/lib/server/http";
import { submitDelivery } from "@/lib/server/flow";
import { hydrateFromTicket } from "@/lib/server/resolve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serverless hosts cap request bodies (Vercel: 4.5 MB), so the limit adapts: a generous
 * 40 MB when self-hosted, 4 MB in the cloud, always with a message the user can act on.
 */
const MAX_FILE = 8 * 1024 * 1024;
const onServerless = Boolean(process.env.VERCEL);
const MAX_TOTAL = (onServerless ? 4 : 40) * 1024 * 1024;

/**
 * POST /api/orders/:id/deliverables   (multipart/form-data, field name: "files")
 *
 * Real uploads. The bytes are inspected for format, dimensions, alpha channel, DPI and
 * word counts, then the Verification Agent runs the acceptance criteria against them.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    await hydrateFromTicket(req); // serverless: the client carries the order snapshot
    if (!rateLimit(`deliver:${id}`, 20)) return json({ ok: false, error: "Too many uploads — try again in a minute." }, 429);

    const form = await req.formData().catch(() => null);
    if (!form) return json({ ok: false, error: 'Send multipart/form-data with a "files" field.' }, 400);

    const entries = form.getAll("files").filter((f): f is File => f instanceof File);
    if (!entries.length) return json({ ok: false, error: "No files received." }, 400);

    let total = 0;
    const uploads: { name: string; buf: Buffer }[] = [];
    for (const file of entries.slice(0, 40)) {
      if (file.size > MAX_FILE) return json({ ok: false, error: `${file.name} is larger than 8 MB.` }, 413);
      total += file.size;
      if (total > MAX_TOTAL)
        return json(
          {
            ok: false,
            error: onServerless
              ? "Delivery exceeds the 4 MB limit on this host — upload in smaller batches (a real deployment would go straight to object storage)."
              : "Delivery exceeds the 40 MB limit.",
          },
          413,
        );
      uploads.push({ name: file.name, buf: Buffer.from(await file.arrayBuffer()) });
    }

    const { order, verification } = await submitDelivery(id, uploads);
    return json({ ok: true, verification, order });
  } catch (e) {
    return fail(e);
  }
}
