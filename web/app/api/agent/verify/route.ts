import { NextResponse } from "next/server";
import type { Criterion } from "@/lib/data";
import { evaluateDelivery, type FileFacts } from "@/lib/verify";

export const dynamic = "force-dynamic";

/**
 * Verification Agent — the real one.
 *
 * The browser measured the uploaded files (counts, dimensions, how white the
 * background actually is) and sends those numbers; this route decides. It never
 * invents a verdict for a criterion it could not measure: those come back as
 * `manual` with a note, and the client is told which ones still need an eye.
 */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as {
    criteria?: Criterion[];
    files?: FileFacts[];
    dueAt?: string;
    submittedAt?: string;
    rows?: number;
  };

  const criteria = Array.isArray(b.criteria) ? b.criteria.slice(0, 8) : [];
  if (!criteria.length) return NextResponse.json({ error: "no criteria" }, { status: 400 });

  const files = (Array.isArray(b.files) ? b.files : []).slice(0, 60).map((f) => ({
    name: String(f?.name ?? "").slice(0, 160),
    mime: String(f?.mime ?? "").slice(0, 80),
    sizeBytes: Number(f?.sizeBytes ?? 0) || 0,
    width: Number(f?.width) || undefined,
    height: Number(f?.height) || undefined,
    whiteRatio: typeof f?.whiteRatio === "number" ? f.whiteRatio : undefined,
    bgWhite: typeof f?.bgWhite === "number" ? f.bgWhite : undefined,
    avgSaturation: typeof f?.avgSaturation === "number" ? f.avgSaturation : undefined,
    alpha: typeof f?.alpha === "boolean" ? f.alpha : undefined,
    text: typeof f?.text === "string" ? f.text.slice(0, 20_000) : undefined,
    pages: Number(f?.pages) || undefined,
    dpi: Number(f?.dpi) || undefined,
  })) as FileFacts[];

  if (!files.length) {
    return NextResponse.json({ error: "no files — upload the delivery first" }, { status: 400 });
  }

  const verdict = evaluateDelivery(criteria, files, {
    dueAt: b.dueAt,
    submittedAt: b.submittedAt ?? new Date().toISOString().slice(0, 10),
    rows: b.rows,
  });

  return NextResponse.json(verdict, { headers: { "cache-control": "no-store" } });
}
