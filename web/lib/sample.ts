"use client";

/**
 * Sample delivery generator.
 *
 * Judges (and anyone demoing) shouldn't need a folder of product photos to see the
 * Verification Agent work. This reads the contract's rule DSL and *actually renders*
 * matching files in the browser — real PNG/JPEG bytes with real dimensions and alphas —
 * so the upload → inspect → verify pipeline runs on genuine data.
 *
 * Anything it cannot fabricate (unusual rules) is simply skipped; the verification report
 * then shows those criteria as "needs review", which is exactly what it should do.
 */

type Criterion = { label: string; rule: string };

const numAfter = (rule: string, re: RegExp) => {
  const m = rule.match(re);
  return m ? Number(m[1]) : undefined;
};

function canvasToFile(canvas: HTMLCanvasElement, name: string, mime: string) {
  return new Promise<File>((resolve) => {
    canvas.toBlob(
      (blob) => resolve(new File([blob ?? new Blob()], name, { type: mime })),
      mime,
      mime === "image/jpeg" ? 0.92 : undefined,
    );
  });
}

/** Rounded-rect path without relying on ctx.roundRect (Safari < 16). */
function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.arcTo(x + w, y, x + w, y + rad, rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.arcTo(x + w, y + h, x + w - rad, y + h, rad);
  ctx.lineTo(x + rad, y + h);
  ctx.arcTo(x, y + h, x, y + h - rad, rad);
  ctx.lineTo(x, y + rad);
  ctx.arcTo(x, y, x + rad, y, rad);
  ctx.closePath();
}

const PALETTES = [
  ["#FFD84D", "#FF8FB1", "#231942"],
  ["#8CC4FF", "#7FE3B5", "#231942"],
  ["#FFAE7A", "#FFF0B8", "#231942"],
  ["#B79CFF", "#FF5C8A", "#231942"],
];

function drawProduct(ctx: CanvasRenderingContext2D, w: number, h: number, i: number, transparent: boolean, whiteBg: boolean) {
  const [a, b, ink] = PALETTES[i % PALETTES.length];
  ctx.clearRect(0, 0, w, h);
  if (!transparent) {
    ctx.fillStyle = whiteBg ? "#FFFFFF" : "#FFF7EC";
    ctx.fillRect(0, 0, w, h);
  }
  const m = Math.min(w, h);
  const cx = w / 2;
  const cy = h / 2;
  // soft blob so the "average colour" is visibly a pastel, not a flat white
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = a;
  ctx.beginPath();
  ctx.ellipse(cx, cy + m * 0.08, m * 0.3, m * 0.34, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  // "product" body
  ctx.fillStyle = b;
  const r = m * 0.1;
  const bw = m * 0.42;
  const bh = m * 0.5;
  roundRectPath(ctx, cx - bw / 2, cy - bh / 2, bw, bh, r);
  ctx.fill();
  ctx.lineWidth = Math.max(2, m * 0.012);
  ctx.strokeStyle = ink;
  ctx.stroke();
  // highlight
  ctx.fillStyle = "rgba(255,255,255,.65)";
  ctx.beginPath();
  ctx.ellipse(cx - bw * 0.18, cy - bh * 0.2, bw * 0.1, bh * 0.16, -0.4, 0, Math.PI * 2);
  ctx.fill();
  // texture dots
  ctx.fillStyle = ink;
  for (let k = 0; k < 6; k++) {
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.arc(cx + bw * 0.16, cy - bh * 0.1 + k * (bh * 0.12), m * 0.012, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // index tag so a reviewer can tell files apart
  ctx.fillStyle = "rgba(35,25,66,.55)";
  ctx.font = `${Math.max(10, m * 0.035)}px ui-monospace, monospace`;
  ctx.fillText(`v${i + 1}`, m * 0.03, h - m * 0.03);
}

export interface SampleSummary {
  files: File[];
  notes: string[];
}

export async function buildSampleDelivery(criteria: Criterion[]): Promise<SampleSummary> {
  const rules = criteria.map((c) => c.rule.toLowerCase());
  const joined = rules.join(" | ");

  // How many files does the contract expect?
  let count = 1;
  for (const r of rules) {
    const n = numAfter(r, /count\([^)]*\)\s*[=≥]\s*(\d+)/) ?? numAfter(r, /count\s*[=≥]\s*(\d+)/);
    if (n && n > count) count = n;
  }
  count = Math.min(count, 24);

  // Dimensions + format + background expectations.
  const exact = joined.match(/w\s*==\s*(\d+)\s*(?:&&|\s+)\s*h\s*==\s*(\d+)/);
  const square = joined.match(/w\s*==\s*h\s*==\s*(\d+)/);
  const minLong = numAfter(joined, /max\(w\s*,\s*h\)\s*[≥>=]+\s*(\d+)/);
  const wantJpeg = /mime\s*==\s*image\/jpeg|jpeg|jpg/.test(joined) && !/mime\s*==\s*image\/png|png/.test(joined);
  const transparent = /png\s*&&\s*alpha|alpha/.test(joined);
  const whiteBg = /white background|white bg|pure white/.test(joined);

  const W = exact ? Number(exact[1]) : square ? Number(square[1]) : minLong ?? 1400;
  const H = exact ? Number(exact[2]) : square ? Number(square[1]) : minLong ?? 1400;

  const notes: string[] = [];
  const files: File[] = [];
  const mime = wantJpeg ? "image/jpeg" : "image/png";
  const ext = wantJpeg ? "jpg" : "png";

  for (let i = 0; i < count; i++) {
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) break;
    drawProduct(ctx, W, H, i, transparent && !wantJpeg, whiteBg);
    files.push(await canvasToFile(canvas, `LUNAS_sample_${String(i + 1).padStart(3, "0")}.${ext}`, mime));
  }
  notes.push(`${count} × ${mime.split("/")[1].toUpperCase()} at ${W}×${H}${transparent && !wantJpeg ? " (transparent)" : whiteBg ? " (white background)" : ""}`);

  // Text criteria: emit a document that satisfies the word range and the keywords.
  const wordRange = joined.match(/(\d+)\s*[≤<=]+\s*words\s*[≤<=]+\s*(\d+)/);
  const keywords = [...joined.matchAll(/contains\(([^)]+)\)/g)].flatMap((m) => [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]));
  if (wordRange || keywords.length) {
    const [lo, hi] = wordRange ? [Number(wordRange[1]), Number(wordRange[2])] : [0, 0];
    const target = hi ? Math.round((lo + hi) / 2) : 320;
    const base = [
      "Lunas sample copy — written to satisfy the acceptance criteria of this order.",
      keywords.length ? `Keywords covered in this line: ${keywords.join(", ")}.` : "",
      "The studio works in Yogyakarta and ships worldwide; every deliverable is checked against the contract before money moves.",
      "If a reviewer reads this file, the numbers below are intentional.",
    ].filter(Boolean);
    let text = base.join(" ");
    while (text.split(/\s+/).length < target) text += " Extra sentence for length. The escrow releases only when the work matches the brief.";
    if (hi) {
      const words = text.split(/\s+/);
      if (words.length > hi) text = words.slice(0, hi).join(" ");
    }
    files.push(new File([text], "LUNAS_sample_copy.txt", { type: "text/plain" }));
    notes.push(`1 × TXT · ${text.split(/\s+/).filter(Boolean).length} words${keywords.length ? ` · keywords: ${keywords.join(", ")}` : ""}`);
  }

  return { files, notes };
}
