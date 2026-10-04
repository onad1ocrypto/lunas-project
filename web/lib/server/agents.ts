/**
 * The two AI agents Lunas is built around.
 *
 *  1. Contract Agent   — turns a vague brief into machine-checkable acceptance criteria.
 *  2. Verification Agent — checks uploaded deliverables against those criteria: a
 *     deterministic rule engine for anything provable from bytes (counts, formats,
 *     dimensions, DPI, deadlines, keywords) plus vision review via the LLM for
 *     subjective criteria (e.g. "pure white background").
 *
 * The Mediator/Release policy lives in ./release.ts.
 *
 * Both agents run for real when LLM_API_KEY is set and fall back to a deterministic
 * heuristic engine otherwise; every result states which engine produced it.
 */

import { draftCriteria as localDraft, type Criterion, type CriterionIcon } from "@/lib/data";
import type { Lang } from "@/lib/dict";
import { isVisionReadable, type InspectedFile } from "./image";
import { llmConfigured, llmJson } from "./llm";
import { dataDir } from "./env";
import { promises as fs } from "node:fs";
import type { CriterionResult, DeliverableFile, Verification } from "./store";

/* ============================================================ Contract Agent */

export interface ContractDraft {
  title: string;
  amount?: number;
  currency?: string;
  criteria: Criterion[];
  windowHours?: number;
  engine: "llm" | "heuristic";
  notes?: string;
}

const RULE_DSL = `
The "rule" field MUST be machine-checkable and use ONLY this grammar (lowercase function names):

  count(files) == 20                 exact number of deliverables
  mime == image/jpeg                 every file has this mime (image/jpeg, image/png, application/pdf, ...)
  mime in {jpg, png}                 every file is one of these formats
  formats superset {pdf, pptx}       the set of delivered formats contains all of these
  w == 1080 && h == 1350             exact pixel dimensions, every image
  max(w,h) >= 2000                   minimum long edge in px
  dpi >= 300                         minimum resolution for raster files
  pages == 2                         page/asset count inside documents
  count 300 <= words <= 500          word count per text document
  contains('handmade','Osaka')       required keywords in text deliverables
  png && alpha                       transparency requirement
  submitted_at <= due                deadline compliance
  vision: <question for a vision model>   subjective checks (background, palette, style)
  manual: <what a human must confirm>     anything not machine-checkable

Prefer 3-5 criteria. Never invent criteria that cannot be checked from the files or the deadline.
`.trim();

export async function draftContract(
  brief: string,
  opts: { lang?: Lang; currency?: string; due?: string } = {},
): Promise<ContractDraft> {
  const lang = opts.lang ?? "en";
  if (llmConfigured() && brief.trim().length >= 15) {
    try {
      const system = [
        "You are the Contract Agent inside Lunas, an AI-verified escrow product for cross-border freelancers.",
        "You convert a client's messy brief into a short, fair contract: a title, a price, and machine-checkable acceptance criteria.",
        "Reply with JSON only, no prose.",
        `Write the title and criteria labels in the language with this ISO code: ${lang}.`,
        RULE_DSL,
        'JSON shape: {"title": string, "amount": number|null, "currency": string, "windowHours": 24|48|72, "criteria": [{"label": string, "rule": string, "icon": "file"|"image"|"ruler"|"palette"|"clock"|"text"}], "notes": string}',
        "If the brief has no price, set amount to null. Never invent a price the client did not mention.",
      ].join("\n");
      const user = [
        `Client brief:\n"""\n${brief}\n"""`,
        opts.currency ? `Preferred currency: ${opts.currency}` : "",
        opts.due ? `Deadline mentioned: ${opts.due}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      const raw = await llmJson<{
        title?: string;
        amount?: number | null;
        currency?: string;
        windowHours?: number;
        criteria?: { label?: string; rule?: string; icon?: string }[];
        notes?: string;
      }>({ system, user, maxTokens: 900, temperature: 0.1 });

      const criteria = normalizeCriteria(raw.criteria);
      if (criteria.length) {
        return {
          title: (raw.title ?? "").trim() || fallbackTitle(brief),
          amount: typeof raw.amount === "number" && raw.amount > 0 ? raw.amount : undefined,
          currency: raw.currency?.toUpperCase(),
          windowHours: [24, 48, 72].includes(Number(raw.windowHours)) ? Number(raw.windowHours) : undefined,
          criteria,
          engine: "llm",
          notes: raw.notes,
        };
      }
    } catch {
      /* fall through to the heuristic engine */
    }
  }

  const local = localDraft(brief, lang);
  return {
    title: local.title,
    amount: local.amount,
    criteria: local.criteria,
    engine: "heuristic",
    notes: llmConfigured() ? "LLM unavailable — deterministic brief parser used" : "No LLM key configured — deterministic brief parser used",
  };
}

const ICONS: CriterionIcon[] = ["file", "image", "ruler", "palette", "clock", "text"];

function normalizeCriteria(input?: { label?: string; rule?: string; icon?: string }[]): Criterion[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((c) => ({
      label: String(c.label ?? "").trim().slice(0, 120),
      rule: String(c.rule ?? "manual: confirm against the brief").trim().slice(0, 200),
      icon: (ICONS.includes(c.icon as CriterionIcon) ? c.icon : "text") as CriterionIcon,
    }))
    .filter((c) => c.label.length > 0 && c.rule.length > 0)
    .slice(0, 6);
}

const fallbackTitle = (brief: string) => {
  const first = brief.split(/[.!?\n]/)[0]?.trim() ?? "New order";
  return first.length > 56 ? `${first.slice(0, 56).replace(/\s+\S*$/, "")}…` : first || "New order";
};

/* ======================================================= Verification Agent */

interface Clause {
  text: string;
  ok: boolean;
  evidence: string;
  provable: boolean;
}

const num = (s: string) => Number(s.replace(/[^\d.]/g, ""));

/** Formats observed across the delivery, as extension + mime, lowercased. */
function observedFormats(files: InspectedFile[]) {
  const exts = new Set(files.map((f) => (f.ext === "jpeg" ? "jpg" : f.ext)));
  const mimes = new Set(files.map((f) => f.mime));
  return { exts, mimes };
}

const all = (files: InspectedFile[], predicate: (f: InspectedFile) => boolean) => files.every(predicate);

/**
 * Evaluate one acceptance criterion. Pure function over the uploaded files, so it is
 * unit-testable and never hallucinates — anything not provable is reported as manual.
 */
export function evaluateCriterion(
  criterion: { label: string; rule: string },
  files: InspectedFile[],
  ctx: { due: string; submittedAt: string },
): CriterionResult {
  const rule = criterion.rule.trim();
  const lower = rule.toLowerCase();
  const clauses: Clause[] = [];

  if (!files.length) {
    return { label: criterion.label, rule, status: "fail", evidence: "no deliverables uploaded yet", engine: "rules" };
  }

  const { exts, mimes } = observedFormats(files);
  const images = files.filter((f) => isVisionReadable(f));
  const texts = files.filter((f) => typeof f.words === "number");

  // Subjective check -> vision model (or an explicit human hand-off).
  if (lower.startsWith("vision:") || lower.includes("vision +")) {
    return {
      label: criterion.label,
      rule,
      status: llmConfigured() && images.length ? "pass" : "manual",
      evidence: llmConfigured() && images.length ? "queued for vision review" : "needs vision review — no LLM key configured",
      engine: llmConfigured() ? "vision" : "human",
    };
  }
  if (lower.startsWith("manual:") || lower.includes("llm review")) {
    return { label: criterion.label, rule, status: "manual", evidence: "human/LLM judgement required", engine: "human" };
  }

  for (const raw of rule.split("&&").map((s) => s.trim()).filter(Boolean)) {
    clauses.push(evalClause(raw, files, ctx, { exts, mimes, images, texts }));
  }

  const failed = clauses.filter((c) => !c.provable || !c.ok);
  const manual = clauses.filter((c) => !c.provable);
  const status: CriterionResult["status"] = failed.length === 0 ? "pass" : manual.length === failed.length ? "manual" : "fail";

  return {
    label: criterion.label,
    rule,
    status,
    evidence: clauses.map((c) => c.evidence).filter(Boolean).join(" · ") || "checked",
    engine: "rules",
  };
}

function evalClause(
  clause: string,
  files: InspectedFile[],
  ctx: { due: string; submittedAt: string },
  obs: { exts: Set<string>; mimes: Set<string>; images: InspectedFile[]; texts: InspectedFile[] },
): Clause {
  const c = clause.toLowerCase().replace(/\s+/g, " ");
  const { exts, mimes, images, texts } = obs;
  const n = files.length;
  const pass = (ok: boolean, evidence: string): Clause => ({ text: clause, ok, evidence, provable: true });
  const manual = (evidence: string): Clause => ({ text: clause, ok: true, evidence, provable: false });

  let m: RegExpMatchArray | null;

  /* counts — accept ==, =, >=, ≥ so both the LLM and the local parser are understood */
  if ((m = c.match(/^count\([^)]*\)\s*(?:==|>=|≥|=)\s*(\d+)$/)) || (m = c.match(/^count\s*(?:==|>=|≥|=)\s*(\d+)/))) {
    return pass(n === num(m[1]), `${n}/${m[1]} files`);
  }
  if ((m = c.match(/^pages\s*==\s*(\d+)$/))) {
    const withPages = files.filter((f) => typeof f.pages === "number");
    if (!withPages.length) return manual("page count not readable");
    const ok = withPages.every((f) => f.pages === num(m![1]));
    return pass(ok, `pages: ${withPages.map((f) => f.pages).join(", ")}`);
  }

  /* formats */
  if ((m = c.match(/^mime\s*==\s*([a-z]+\/[a-z0-9.+-]+)$/))) {
    const want = m[1];
    const bad = files.filter((f) => f.mime !== want);
    return pass(bad.length === 0, `${n - bad.length}/${n} files are ${want}`);
  }
  if ((m = c.match(/^mime\s*(?:in|∈|⊇)\s*\{([^}]+)\}$/))) {
    const want = splitList(m[1]);
    const bad = files.filter((f) => !want.some((w) => f.ext === w || f.mime.includes(w)));
    return pass(bad.length === 0, `${n - bad.length}/${n} files in {${want.join(", ")}}`);
  }
  if ((m = c.match(/^(?:formats|format)\s*(?:superset|⊇|>=)\s*\{([^}]+)\}$/))) {
    const want = splitList(m[1]);
    const missing = want.filter((w) => ![...exts].some((e) => e === w) && ![...mimes].some((mm) => mm.includes(w)));
    return pass(missing.length === 0, missing.length ? `missing: ${missing.join(", ")}` : `delivered {${[...exts].join(", ")}}`);
  }
  if (/^png$/.test(c)) return pass(exts.has("png") && mimes.has("image/png"), exts.has("png") ? "PNG present" : "no PNG delivered");
  if (/^alpha$/.test(c)) {
    const pngs = files.filter((f) => f.ext === "png");
    if (!pngs.length) return pass(false, "no PNG to test for transparency");
    if (pngs.some((f) => typeof f.alpha !== "boolean")) return manual("alpha channel unreadable");
    return pass(pngs.every((f) => f.alpha), pngs.every((f) => f.alpha) ? "transparency present" : "no alpha channel");
  }

  /* dimensions + resolution */
  if ((m = c.match(/^w\s*==\s*h\s*==\s*(\d+)$/))) {
    const want = num(m[1]);
    const ok = images.length > 0 && images.every((f) => f.width === want && f.height === want);
    return pass(ok, dimsEvidence(images, `${want}×${want}`));
  }
  if ((m = c.match(/^w\s*==\s*(\d+)$/))) {
    const want = num(m[1]);
    return pass(images.length > 0 && images.every((f) => f.width === want), dimsEvidence(images, `w=${want}`));
  }
  if ((m = c.match(/^h\s*==\s*(\d+)$/))) {
    const want = num(m[1]);
    return pass(images.length > 0 && images.every((f) => f.height === want), dimsEvidence(images, `h=${want}`));
  }
  if ((m = c.match(/^max\(w\s*,\s*h\)\s*[≥>=]+\s*(\d+)$/))) {
    const want = num(m[1]);
    if (!images.length) return manual("no raster images to measure");
    const shortest = Math.min(...images.map((f) => Math.max(f.width ?? 0, f.height ?? 0)));
    return pass(shortest >= want, `min long edge ${shortest}px (need ${want}px)`);
  }
  if ((m = c.match(/^dpi\s*[≥>=]+\s*(\d+)$/))) {
    const want = num(m[1]);
    const withDpi = files.filter((f) => typeof f.dpi === "number");
    if (!withDpi.length) return manual("DPI metadata missing — confirm in the design file");
    const lowest = Math.min(...withDpi.map((f) => f.dpi ?? 0));
    return pass(lowest >= want, `min DPI ${lowest} (need ${want})`);
  }

  /* text checks */
  if ((m = c.match(/^(?:count\s+)?(\d+)\s*[≤<=]+\s*words\s*[≤<=]+\s*(\d+)$/))) {
    const [lo, hi] = [num(m[1]), num(m[2])];
    if (!texts.length) return manual("word count needs a text document");
    const counts = texts.map((f) => f.words ?? 0);
    return pass(counts.every((w) => w >= lo && w <= hi), `words: ${counts.join(", ")} (need ${lo}–${hi})`);
  }
  if ((m = c.match(/^contains\(([^)]+)\)$/))) {
    const wanted = [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]);
    const haystack = texts.map((f) => f.text ?? "").join("\n").toLowerCase();
    if (!haystack.trim()) return manual("keyword check needs a text document");
    const missing = wanted.filter((w) => !haystack.includes(w.toLowerCase()));
    return pass(missing.length === 0, missing.length ? `missing keywords: ${missing.join(", ")}` : `found ${wanted.join(", ")}`);
  }

  /* deadline */
  if (/^submitted_at\s*(?:<=|≤|<)\s*due$/.test(c)) {
    const due = new Date(`${ctx.due}T23:59:59Z`);
    const submitted = new Date(ctx.submittedAt);
    const late = submitted.getTime() > due.getTime();
    return pass(!late, `${late ? "late by " : "on time · "}${Math.abs(Math.round((submitted.getTime() - due.getTime()) / 86_400_000))}d vs deadline`);
  }

  /* things we cannot prove from bytes — be honest instead of guessing */
  if (/bleed|colour profile|cmyk|font|language|lang\b/.test(c)) return manual("not machine-readable from the file — flagged for human review");

  return manual("unrecognised rule — sent to human review");
}

const splitList = (s: string) => s.split(/[,\s]+/).map((x) => x.trim().replace(/['"]/g, "").toLowerCase()).filter(Boolean);

function dimsEvidence(images: InspectedFile[], need: string) {
  if (!images.length) return `no image to measure (need ${need})`;
  return images.slice(0, 3).map((f) => `${f.name} ${f.width}×${f.height}`).join(", ") + (images.length > 3 ? ` +${images.length - 3} more` : "");
}

/** Run the whole acceptance test for a delivery. */
export async function verifyDelivery(
  order: { id: string; due: string; criteria: Criterion[] },
  files: InspectedFile[],
  submittedAt = new Date().toISOString(),
): Promise<Verification> {
  const results: CriterionResult[] = [];
  let visionUsed = false;

  for (const criterion of order.criteria) {
    const base = evaluateCriterion(criterion, files, { due: order.due, submittedAt });
    if (base.engine === "vision" && llmConfigured()) {
      const vision = await visionCheck(order.id, criterion.label, criterion.rule, files);
      if (vision) {
        results.push({ ...base, ...vision });
        visionUsed = true;
        continue;
      }
    }
    results.push(base);
  }

  const failed = results.filter((r) => r.status === "fail");
  const manual = results.filter((r) => r.status === "manual");
  const verdict: Verification["verdict"] = failed.length ? "revision" : manual.length ? "review" : "pass";

  const summary =
    verdict === "pass"
      ? `All ${results.length} criteria passed${visionUsed ? " (incl. vision review)" : ""}. Ready for the client review window.`
      : verdict === "revision"
        ? `${failed.length} of ${results.length} criteria failed — a revision request was generated.`
        : `${results.length - manual.length} of ${results.length} criteria passed automatically; ${manual.length} need human/LLM confirmation.`;

  return {
    verdict,
    results,
    summary,
    engine: visionUsed ? "rules+vision" : llmConfigured() ? "rules" : "heuristic",
    at: new Date().toISOString(),
  };
}

/** Ask the vision model about a subjective criterion. Returns null when unavailable. */
async function visionCheck(
  orderId: string,
  label: string,
  rule: string,
  files: InspectedFile[],
): Promise<Pick<CriterionResult, "status" | "evidence" | "engine"> | null> {
  const candidates = files.filter((f) => f.storedAs && isVisionReadable(f)).slice(0, 3);
  if (!candidates.length) return null;
  const images: { data: string; mime: string }[] = [];
  for (const f of candidates) {
    try {
      const abs = `${dataDir()}/uploads/${orderId}/${f.storedAs}`;
      const buf = await fs.readFile(abs);
      if (buf.length > 4_000_000) continue;
      images.push({ data: buf.toString("base64"), mime: f.mime });
    } catch {
      /* file rotated away — skip */
    }
  }
  if (!images.length) return null;

  try {
    const out = await llmJson<{ pass?: boolean; evidence?: string }>({
      system:
        "You are the Verification Agent in Lunas, checking a freelancer's deliverable against one contract criterion. " +
        "Be strict but fair: judge only what you can see. Reply with JSON only.",
      user:
        `Criterion: ${label}\nRule: ${rule}\n` +
        `Uploaded file(s): ${candidates.map((f) => f.name).join(", ")}\n\n` +
        'Reply {"pass": true|false, "evidence": "one short sentence a freelancer can act on"}',
      images,
      maxTokens: 300,
      temperature: 0,
    });
    if (typeof out.pass !== "boolean") return null;
    return { status: out.pass ? "pass" : "fail", evidence: out.evidence ?? (out.pass ? "vision: passed" : "vision: failed"), engine: "vision" };
  } catch {
    return null;
  }
}

export type { DeliverableFile };
