/* =========================================================
   The verification engine.

   Criteria in Lunas are written as machine-checkable rules, e.g.
   "count(files) == 20", "max(w,h) \u2265 2000", "vision: bg \u2265 97% #FFF".
   This module turns those strings into real checks against the files a
   freelancer actually uploaded.

   Three outcomes per criterion:
     measured  — proved from the file itself (count, format, pixels, words)
     llm       — judged by a vision model (only when LLM_API_KEY is set)
     manual    — cannot be measured here (PDF bleed, DPI, page size); the
                 client is asked to eyeball it. Never silently "pass".

   Nothing here touches the DOM: the browser measures pixels and sends the
   numbers, this file only decides.
   ========================================================= */

export interface FileFacts {
  name: string;
  mime: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  /** Share of near-white pixels over the whole image, 0..1 (downscaled copy). */
  whiteRatio?: number;
  /**
   * Share of near-white pixels in the border ring, 0..1 — this is the
   * "background" a product photo is judged on. Measuring the whole image would
   * fail every photo whose subject is not white.
   */
  bgWhite?: number;
  /** Mean saturation, 0..1 — measured on a downscaled copy. */
  avgSaturation?: number;
  /** True when the image has any non-opaque pixel. */
  alpha?: boolean;
  /** Decoded text for text-like files, used by contains() and word counts. */
  text?: string;
  /** Pages, DPI and print geometry are not readable in a browser. */
  pages?: number;
  dpi?: number;
}

export type VerdictKind = "measured" | "llm" | "manual";

export interface RuleResult {
  pass: boolean;
  note: string;
  kind: VerdictKind;
}

export interface VerifyContext {
  /** Order due date (yyyy-mm-dd), for "submitted_at \u2264 due". */
  dueAt?: string;
  /** When the delivery was made (yyyy-mm-dd). */
  submittedAt?: string;
  /** Flat rows used by tabular deliverables (slides, docs, concepts). */
  rows?: number;
}

const ext = (name: string) => (name.split(".").pop() || "").toLowerCase();
const isImage = (f: FileFacts) => f.mime.startsWith("image/");
const isText = (f: FileFacts) => f.mime.startsWith("text/") || ["txt", "md", "csv"].includes(ext(f.name));

/** Which files a collection rule counts: "files", "images", "docs", "slides", "concepts". */
function collectionOf(kind: string, files: FileFacts[]): FileFacts[] {
  const k = kind.toLowerCase();
  if (k === "images" || k === "image") return files.filter(isImage);
  if (k === "docs" || k === "documents") return files.filter((f) => ["pdf", "doc", "docx", "txt", "md"].includes(ext(f.name)));
  if (k === "slides") return files.filter((f) => ["ppt", "pptx", "key"].includes(ext(f.name)));
  // "files", "concepts", "photos", anything else: the whole delivery
  return files;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const firstBad = (rows: { name: string; bad: boolean }[]) => rows.find((r) => r.bad)?.name;

/** "count(files) == 20" */
function checkCount(rule: string, files: FileFacts[]): RuleResult | null {
  const m = rule.match(/count\(\s*([a-z_]+)\s*\)\s*(==|>=|<=|>|<)\s*(\d+)/i);
  if (!m) return null;
  const [, kind, op, raw] = m;
  const n = collectionOf(kind, files).length;
  const want = Number(raw);
  const ok =
    op === "==" ? n === want : op === ">=" ? n >= want : op === "<=" ? n <= want : op === ">" ? n > want : n < want;
  const label = (kind === "files" ? "files" : kind).toLowerCase();
  return {
    pass: ok,
    note: ok ? `${n} ${label}` : `${n} ${label} — the contract asks for ${op === "==" ? `exactly ${want}` : `${op} ${want}`}`,
    kind: "measured",
  };
}

/** "formats \u2287 {pdf, pptx}" — every listed extension must be present. */
function checkFormats(rule: string, files: FileFacts[]): RuleResult | null {
  const m = rule.match(/formats?\s*(?:\u2287|\u2286|>=|<=|in)\s*\{([^}]+)\}/i);
  if (!m) return null;
  const want = m[1].split(",").map((s) => s.trim().toLowerCase().replace(/^\./, "")).filter(Boolean);
  const have = new Set(files.map((f) => ext(f.name)));
  const missing = want.filter((w) => !have.has(w));
  return {
    pass: missing.length === 0,
    note: missing.length ? `missing ${missing.join(", ")} (have ${[...have].join(", ") || "nothing"})` : want.map((w) => `.${w}`).join(" + "),
    kind: "measured",
  };
}

/** "lang \u2287 {es, en}" — a language tag, checked against file names/contents. */
function checkLang(rule: string, files: FileFacts[]): RuleResult | null {
  const m = rule.match(/lang\s*(?:\u2287|>=|in)\s*\{([^}]+)\}/i);
  if (!m) return null;
  const want = m[1].split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const hay = files.map((f) => `${f.name} ${f.text || ""}`).join(" ").toLowerCase();
  const missing = want.filter((w) => !new RegExp(`(^|[^a-z])${w}([^a-z]|$)`, "i").test(hay));
  return {
    pass: missing.length === 0,
    note: missing.length ? `no ${missing.join(", ")} found in the delivery` : want.join(" + "),
    kind: "measured",
  };
}

/** "mime == image/jpeg" — every file must match. */
function checkMime(rule: string, files: FileFacts[]): RuleResult | null {
  const m = rule.match(/mime\s*==\s*([a-z]+\/[a-z0-9.+-]+)/i);
  if (!m) return null;
  const want = m[1].toLowerCase();
  const bad = files.filter((f) => f.mime.toLowerCase() !== want);
  return {
    pass: bad.length === 0 && files.length > 0,
    note: bad.length ? `${bad.length} file(s) are not ${want} (${bad[0].name})` : `all ${files.length} are ${want}`,
    kind: "measured",
  };
}

/** "png && alpha" */
function checkAlpha(rule: string, files: FileFacts[]): RuleResult | null {
  if (!/alpha/i.test(rule)) return null;
  if (!/png/i.test(rule)) return null;
  const pngs = files.filter((f) => f.mime === "image/png" || ext(f.name) === "png");
  if (!pngs.length) return { pass: false, note: "no PNG in the delivery", kind: "measured" };
  const withAlpha = pngs.filter((f) => f.alpha);
  return {
    pass: withAlpha.length === pngs.length,
    note: withAlpha.length === pngs.length ? `${pngs.length} PNG with transparency` : `transparency missing in ${firstBad(pngs.map((f) => ({ name: f.name, bad: !f.alpha })))}`,
    kind: "measured",
  };
}

/** "max(w,h) \u2265 2000", "w == 1080 && h == 1350", "w == h == 500" */
function checkDimensions(rule: string, files: FileFacts[]): RuleResult | null {
  if (!/(max\s*\(\s*w\s*,\s*h\s*\)|w\s*==|h\s*==)/i.test(rule)) return null;
  const images = files.filter((f) => isImage(f) && f.width && f.height);
  if (!images.length) return { pass: false, note: "no image dimensions to check", kind: "measured" };

  const maxDim = (f: FileFacts) => Math.max(f.width!, f.height!);

  // max(w,h) >= N
  const ge = rule.match(/max\s*\(\s*w\s*,\s*h\s*\)\s*(?:\u2265|>=)\s*(\d+)/i);
  if (ge) {
    const want = Number(ge[1]);
    const worst = images.reduce((a, b) => (maxDim(a) < maxDim(b) ? a : b));
    return {
      pass: maxDim(worst) >= want,
      note: maxDim(worst) >= want ? `smallest long edge ${maxDim(worst)}px` : `${worst.name} is only ${maxDim(worst)}px (needs ${want}px)`,
      kind: "measured",
    };
  }

  // w == A && h == B
  const wh = rule.match(/w\s*==\s*(\d+)\s*(?:&&|and)\s*h\s*==\s*(\d+)/i);
  if (wh) {
    const [, w, h] = wh.map(Number);
    const bad = images.filter((f) => f.width !== w || f.height !== h);
    return {
      pass: bad.length === 0,
      note: bad.length ? `${bad[0].name} is ${bad[0].width}\u00d7${bad[0].height} (needs ${w}\u00d7${h})` : `all ${w}\u00d7${h}`,
      kind: "measured",
    };
  }

  // w == h == N
  const sq = rule.match(/w\s*==\s*h\s*==\s*(\d+)/i);
  if (sq) {
    const n = Number(sq[1]);
    const bad = images.filter((f) => f.width !== n || f.height !== n);
    return {
      pass: bad.length === 0,
      note: bad.length ? `${bad[0].name} is ${bad[0].width}\u00d7${bad[0].height} (needs ${n}\u00d7${n})` : `all ${n}\u00d7${n}`,
      kind: "measured",
    };
  }
  return null;
}

/** "vision: bg \u2265 97% #FFF" / "vision: avg saturation < 45%" — measured from real pixels. */
function checkVision(rule: string, files: FileFacts[]): RuleResult | null {
  if (!/^vision/i.test(rule.trim()) && !/\bvision\b/i.test(rule)) return null;

  const bg = rule.match(/bg\s*(?:\u2265|>=)\s*(\d+)\s*%/i);
  if (bg) {
    const want = Number(bg[1]) / 100;
    const images = files.filter((f) => isImage(f) && typeof f.bgWhite === "number");
    if (!images.length) return { pass: false, note: "no image pixels to measure", kind: "measured" };
    const worst = images.reduce((a, b) => (a.bgWhite! < b.bgWhite! ? a : b));
    const ok = worst.bgWhite! >= want;
    return {
      pass: ok,
      note: ok
        ? `background ring is ${pct(worst.bgWhite!)} white across ${images.length} images`
        : `${worst.name}: background is ${pct(worst.bgWhite!)} white (needs ${pct(want)})`,
      kind: "measured",
    };
  }

  const sat = rule.match(/saturation\s*(?:\u2264|<=|<)\s*(\d+)\s*%/i);
  if (sat) {
    const want = Number(sat[1]) / 100;
    const images = files.filter((f) => isImage(f) && typeof f.avgSaturation === "number");
    if (!images.length) return { pass: false, note: "no image pixels to measure", kind: "measured" };
    const worst = images.reduce((a, b) => (a.avgSaturation! > b.avgSaturation! ? a : b));
    const ok = worst.avgSaturation! <= want;
    return {
      pass: ok,
      note: ok ? `busiest image sits at ${pct(worst.avgSaturation!)} saturation` : `${worst.name} is ${pct(worst.avgSaturation!)} saturated (max ${pct(want)})`,
      kind: "measured",
    };
  }

  // Judgement calls a rule engine cannot settle: text taste, colour harmony.
  return { pass: false, note: "needs a visual review (LLM key not configured)", kind: "manual" };
}

/** "300 \u2264 words \u2264 500", "contains('handmade','Osaka')" */
function checkText(rule: string, files: FileFacts[]): RuleResult | null {
  const words = rule.match(/(\d+)\s*(?:\u2264|<=|<)\s*words\s*(?:\u2264|<=|<)\s*(\d+)/i);
  if (words) {
    const [, lo, hi] = words.map(Number);
    const texts = files.filter(isText);
    if (!texts.length) return { pass: false, note: "no text file to count words in", kind: "measured" };
    const counts = texts.map((f) => ({ f, n: (f.text || "").trim().split(/\s+/).filter(Boolean).length }));
    const bad = counts.filter((c) => c.n < lo || c.n > hi);
    return {
      pass: bad.length === 0,
      note: bad.length ? `${bad[0].f.name} has ${bad[0].n} words (needs ${lo}\u2013${hi})` : `${counts[0].n} words`,
      kind: "measured",
    };
  }

  const contains = rule.match(/contains\(([^)]+)\)/i);
  if (contains) {
    const needles = contains[1].split(",").map((s) => s.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean);
    const hay = files.map((f) => `${f.name}\n${f.text || ""}`).join("\n").toLowerCase();
    const missing = needles.filter((n) => !hay.includes(n.toLowerCase()));
    return {
      pass: missing.length === 0,
      note: missing.length ? `"${missing[0]}" not found in the delivery` : needles.map((n) => `"${n}"`).join(" and "),
      kind: "measured",
    };
  }
  return null;
}

/** "submitted_at \u2264 due" */
function checkDeadline(rule: string, ctx: VerifyContext): RuleResult | null {
  if (!/submitted_at/i.test(rule) || !ctx.dueAt || !ctx.submittedAt) return null;
  const ok = ctx.submittedAt <= ctx.dueAt;
  return {
    pass: ok,
    note: ok ? `delivered ${ctx.submittedAt}, due ${ctx.dueAt}` : `delivered ${ctx.submittedAt}, the due date was ${ctx.dueAt}`,
    kind: "measured",
  };
}

/** Criteria a browser genuinely cannot read — named explicitly, never assumed. */
function checkUnmeasurable(rule: string): RuleResult | null {
  if (/dpi/i.test(rule)) return { pass: false, note: "DPI is not readable in a browser — please confirm on the file", kind: "manual" };
  if (/pages\s*==|size\s*==\s*A4|bleed/i.test(rule)) return { pass: false, note: "print geometry needs a PDF tool — please confirm on the file", kind: "manual" };
  return null;
}

/** One criterion in, one verdict out. */
export function evaluateRule(rule: string, files: FileFacts[], ctx: VerifyContext = {}): RuleResult {
  const tables: Array<(r: string, f: FileFacts[]) => RuleResult | null> = [
    checkCount,
    checkFormats,
    checkLang,
    checkMime,
    checkAlpha,
    checkDimensions,
    checkVision,
    checkText,
  ];
  for (const table of tables) {
    const r = table(rule, files);
    if (r) return r;
  }
  const dl = checkDeadline(rule, ctx);
  if (dl) return dl;
  const un = checkUnmeasurable(rule);
  if (un) return un;
  return { pass: false, note: "manual review — Lunas could not check this automatically", kind: "manual" };
}

export interface VerifyVerdict {
  results: RuleResult[];
  source: "measured" | "mixed" | "manual";
  /** Criteria that need a human eye, listed for the client. */
  manual: number;
  failed: number;
}

export function evaluateDelivery(criteria: { rule: string }[], files: FileFacts[], ctx: VerifyContext = {}): VerifyVerdict {
  const results = criteria.map((c) => evaluateRule(c.rule || "", files, ctx));
  const manual = results.filter((r) => r.kind === "manual").length;
  const failed = results.filter((r) => !r.pass).length;
  const measured = results.filter((r) => r.kind === "measured").length;
  const source: VerifyVerdict["source"] = measureFrom(measured, results.length);
  return { results, source, manual, failed };
}

function measureFrom(measured: number, total: number): VerifyVerdict["source"] {
  if (total > 0 && measured === total) return "measured";
  if (measured === 0) return "manual";
  return "mixed";
}
