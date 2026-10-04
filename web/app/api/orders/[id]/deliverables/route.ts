import { fail, json, rateLimit } from "@/lib/server/http";
import { submitDelivery } from "@/lib/server/flow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE = 8 * 1024 * 1024; // 8 MB per file
const MAX_TOTAL = 40 * 1024 * 1024; // 40 MB per delivery

/**
 * POST /api/orders/:id/deliverables   (multipart/form-data, field name: "files")
 *
 * Real uploads. The bytes are inspected for format, dimensions, alpha channel, DPI and
 * word counts, then the Verification Agent runs the acceptance criteria against them.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
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
      if (total > MAX_TOTAL) return json({ ok: false, error: "Delivery exceeds the 40 MB limit." }, 413);
      uploads.push({ name: file.name, buf: Buffer.from(await file.arrayBuffer()) });
    }

    const { order, verification } = await submitDelivery(id, uploads);
    return json({ ok: true, verification, order });
  } catch (e) {
    return fail(e);
  }
}
