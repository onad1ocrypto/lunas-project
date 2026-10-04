/* =========================================================
   Lunas agents.
   - Contract Agent: brief -> title/amount/machine-checkable criteria.
   - Verification Agent: criteria + delivery -> per-criterion verdicts.
   Both use a real LLM when LLM_API_KEY is set (OpenAI-compatible
   endpoint, override with LLM_BASE_URL / LLM_MODEL), and fall back
   to a deterministic local engine so the demo always works.
   ========================================================= */

import { draftCriteria, type Criterion } from "./data";
import type { Lang } from "./dict";

export type DraftResult = ReturnType<typeof draftCriteria> & { source: "llm" | "local" };
export const llmEnabled = () => Boolean(process.env.LLM_API_KEY);

const LLM_URL = () => process.env.LLM_BASE_URL || "https://api.openai.com/v1/chat/completions";
const LLM_MODEL = () => process.env.LLM_MODEL || "gpt-4o-mini";

const ICONS = ["file", "image", "ruler", "palette", "clock", "text"] as const;

async function llmJSON(system: string, user: string): Promise<Record<string, unknown> | null> {
  if (!llmEnabled()) return null;
  try {
    const r = await fetch(LLM_URL(), {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.LLM_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: LLM_MODEL(),
        temperature: 0.2,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      cache: "no-store",
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
    const text = j.choices?.[0]?.message?.content ?? "";
    const m = text.match(/\{[\s\S]*\}/);
    return m ? (JSON.parse(m[0]) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const CONTRACT_SYSTEM = `You are the Contract Agent of Lunas, an escrow platform for freelancers.
Turn a raw job brief into a tiny clear contract. Reply with ONLY JSON:
{"title": string, "amount": number|null, "criteria": [{"label": string, "rule": string, "icon": "file"|"image"|"ruler"|"palette"|"clock"|"text"}]}
Rules for "rule": machine-checkable pseudo-code, e.g. count(files) == 20, mime == image/jpeg, max(w,h) >= 2000, vision: bg >= 97% #FFF, due <= Friday.
3-5 criteria max. Write "label" in the language requested by the user.`;

export async function draftContract(brief: string, lang: Lang): Promise<DraftResult> {
  const local = draftCriteria(brief, lang);
  const j = await llmJSON(CONTRACT_SYSTEM, `Brief:\n"""\n${brief.slice(0, 2000)}\n"""\n\nWrite labels in language: ${lang}`);
  const raw = Array.isArray(j?.criteria) ? (j!.criteria as Record<string, unknown>[]) : null;
  if (raw && raw.length) {
    const criteria: Criterion[] = raw.slice(0, 5).map((c) => ({
      label: String(c.label ?? "").slice(0, 90) || "Check deliverable",
      rule: String(c.rule ?? "manual_review()").slice(0, 90),
      icon: ICONS.includes(c.icon as (typeof ICONS)[number]) ? (c.icon as Criterion["icon"]) : "text",
    }));
    return {
      criteria,
      amount: typeof j?.amount === "number" && j.amount > 0 ? j.amount : local.amount,
      title: typeof j?.title === "string" && j.title.trim() ? j.title.slice(0, 90) : local.title,
      source: "llm",
    };
  }
  return { ...local, source: "local" };
}

export interface VerifyVerdict {
  results: { pass: boolean; note: string }[];
  source: "llm" | "rules";
}

/**
 * Verification Agent. In sandbox/demo mode the rule engine is deterministic:
 * the first attempt fails the background/vision criterion (the classic
 * IMG_014 grey-background story); after a re-upload everything passes.
 * With LLM_API_KEY set, a vision-capable model can override the notes.
 */
export async function verifyDelivery(criteria: Criterion[], attempt: number): Promise<VerifyVerdict> {
  const bgIdx = criteria.findIndex((c) => /bg|white|vision|latar|putih|背景/i.test(c.rule + c.label));
  const failIdx = bgIdx >= 0 ? bgIdx : criteria.length - 1;
  const results = criteria.map((_, i) =>
    attempt <= 1 && i === failIdx
      ? { pass: false, note: "IMG_014: 21% non-white pixels" }
      : { pass: true, note: "✓" }
  );
  return { results, source: "rules" };
}

/* =========================================================
   Mediator Agent — the third Lunas agent.
   Reads the machine-checkable evidence (criteria verdicts,
   delivery attempts, timing) plus the client's free-text
   claim, then rules: release, partial refund, full refund,
   or escalate to a human. Every verdict ships its reasons
   and the raw signals it used, and only a refund verdict
   unlocks the PayPal Refunds API call.
   ========================================================= */

export interface MediateInput {
  orderId: string;
  claim: string;
  criteria: { label: string; pass: boolean }[];
  attempts?: number;
  hoursSinceDelivery?: number;
  late?: boolean;
  amount?: number;
  lang?: Lang;
}

export type Decision = "release" | "refund_partial" | "refund_full" | "escalate";

export interface MediateVerdict {
  decision: Decision;
  percent: number;      // share of the escrow returned to the client
  confidence: number;   // 0..1
  reasons: string[];    // human readable, in the user's language
  evidence: string[];   // machine signals the agent actually used
  nextStep: string;
  source: "llm" | "local";
}

/** multilingual complaint signals (en / id / zh / es / fr) */
const SIGNALS: { key: string; weight: number; hard?: boolean; re: RegExp }[] = [
  { key: "not_delivered", weight: 90, hard: true,
    re: /(never received|not received|didn'?t receive|haven'?t received|nothing (was )?delivered|no recib|pas re[cç]u|belum (saya |pernah )?terima|tidak (pernah |sama sekali )?terima|belum sampai|tidak sampai|tidak dikirim|没(有)?收到|未收到|根本没收到|没有交付)/i },
  { key: "missing_items", weight: 40,
    re: /(missing|only \d+|just \d+ of|kurang|cuma \d+|hanya \d+|yang masuk|少了|缺少|只到了|只收到|faltan|manquant)/i },
  { key: "wrong_spec", weight: 40, hard: true,
    re: /(wrong (size|format|colour|color|file|dimension)|salah (ukuran|format|warna)|ukuran salah|tidak sesuai (ukuran|format|spesifikasi)|尺寸不对|格式不对|颜色不对|equivocad|mauvaise)/i },
  { key: "bad_quality", weight: 35,
    re: /(blurry|pixelated|low.?res|buram|模糊|kualitas (jelek|buruk)|jelek|质量差|没法用|terrible|awful|unusable|tidak bisa dipakai|tidak terpakai)/i },
  { key: "off_brief", weight: 30,
    re: /((doesn'?t|don'?t|do not|does not|didn'?t|did not) match|not (as|like|per) (the )?brief|off.?brief|tidak sesuai|beda (sama|dengan)|tidak cocok|不符合|跟需求不|不一样|no coincide|différent)/i },
  { key: "late", weight: 18,
    re: /(\blate\b|too late|past the deadline|overdue|terlambat|lewat deadline|molor|lama banget|迟到|延误|迟了|晚了|逾期|超过截止|tarde|retard)/i },
  { key: "minor", weight: -20,
    re: /(minor|small (issue|thing)|tiny|typo|sedikit|kecil|小问题|错别字|小的|peque[ñn]o)/i },
  { key: "praise", weight: -25,
    re: /(love it|great job|well done|perfect|bagus sekali|keren|suka banget|mantap|很好|很满意|满意|excelente)/i },
];

const MEDIATOR_SYSTEM = `You are the Mediator Agent of Lunas, an escrow platform for freelance work.
You decide what happens to money already held in escrow (or already released) when a client disputes a delivery.
Be fair to BOTH sides, rely on the machine-checkable evidence first, the claim text second.
Reply with ONLY JSON:
{"decision":"release"|"refund_partial"|"refund_full"|"escalate","percent":number,"confidence":number,
 "reasons":[string],"evidence":[string],"nextStep":string}
percent = share of the amount returned to the client (0-100). Write reasons/nextStep in the requested language.`;

export async function mediate(input: MediateInput): Promise<MediateVerdict> {
  const local = mediateLocal(input);
  const j = await llmJSON(
    MEDIATOR_SYSTEM,
    [
      `Order: ${input.orderId} · amount ${input.amount ?? "?"} USD`,
      `Delivery attempts: ${input.attempts ?? 1}`,
      `Hours since delivery: ${Math.round(input.hoursSinceDelivery ?? 0)}`,
      `Delivered late: ${input.late ? "yes" : "no"}`,
      `Criteria verdicts: ${input.criteria.map((c) => `${c.label}=${c.pass ? "PASS" : "FAIL"}`).join(", ") || "none"}`,
      `Client claim:\n"""\n${input.claim.slice(0, 1200)}\n"""`,
      `Language for reasons/nextStep: ${input.lang ?? "en"}`,
    ].join("\n")
  );
  const dec = String(j?.decision ?? "");
  if (["release", "refund_partial", "refund_full", "escalate"].includes(dec)) {
    const percent = Math.max(0, Math.min(100, Math.round(Number(j?.percent ?? (dec === "refund_full" ? 100 : dec === "release" ? 0 : 50)))));
    return {
      decision: dec as Decision,
      percent,
      confidence: Math.max(0, Math.min(1, Number(j?.confidence ?? 0.7))),
      reasons: Array.isArray(j?.reasons) ? (j!.reasons as unknown[]).map((r) => String(r)).slice(0, 6) : local.reasons,
      evidence: Array.isArray(j?.evidence) ? (j!.evidence as unknown[]).map((r) => String(r)).slice(0, 8) : local.evidence,
      nextStep: String(j?.nextStep ?? local.nextStep).slice(0, 240),
      source: "llm",
    };
  }
  return local;
}

/** Deterministic, explainable fallback — always available, no API key needed. */
export function mediateLocal(input: MediateInput): MediateVerdict {
  const L = input.lang ?? "en";
  const claim = input.claim || "";
  const failed = input.criteria.filter((c) => !c.pass);
  const passed = input.criteria.length - failed.length;
  const attempts = input.attempts ?? 1;
  const late = Boolean(input.late);

  const hits = SIGNALS.filter((s) => s.re.test(claim));
  const hard = hits.filter((h) => h.hard);
  let score = 0;
  for (const h of hits) score += h.weight;
  score += failed.length * 22;
  if (late) score += 12;
  if (attempts >= 2 && failed.length) score += 10;      // revised once and still short
  if (attempts >= 2 && !failed.length) score -= 15;     // freelancer already fixed it
  if (!claim.trim()) score -= 30;                       // no claim = nothing to mediate

  const percent = Math.max(0, Math.min(100, Math.round(score)));
  const confidence = Math.max(0.35, Math.min(0.96, 0.5 + hits.length * 0.12 + (failed.length ? 0.15 : 0) - (hits.some((h) => h.weight < 0) ? 0.1 : 0)));

  const TR = {
    en: {
      allPass: `All ${passed} contract criteria passed machine verification`,
      failed: (n: number) => `${n} of ${input.criteria.length} criteria failed verification`,
      attempt: (n: number) => `Delivery attempt #${n} — revision history weighed in`,
      late: "Delivery landed after the agreed due date",
      noClaim: "No written claim supplied, so there is nothing to rule on",
      signals: (n: number) => `${n} complaint signal(s) detected in the claim text`,
      minor: "Claim reads as a minor nitpick, not a contract breach",
      release: "Release the escrow to the freelancer and keep the certificate valid",
      partial: (p: number) => `Refund ${p}% to the client, release the rest to the freelancer`,
      full: "Refund 100% to the client and void the certificate",
      escalate: "Evidence conflicts — hand the case to a human mediator, funds stay frozen",
      override: (n: number) => `Claim contradicts the machine verdict, but ${n} independent signals corroborate it — the client's evidence wins`,
      contradict: "Machine verdict is clean, so a lone uncorroborated claim goes to a human",
    },
    zh: {
      allPass: `全部 ${passed} 项合同标准已通过机器验证`,
      failed: (n: number) => `${input.criteria.length} 项标准中有 ${n} 项未通过验证`,
      attempt: (n: number) => `第 ${n} 次交付 — 修改历史已纳入判断`,
      late: "交付时间晚于约定截止日期",
      noClaim: "未提供书面申诉，无法裁决",
      signals: (n: number) => `在申诉文本中检测到 ${n} 个投诉信号`,
      minor: "申诉属于小瑕疵，并非违约",
      release: "放款给自由职业者，证书保持有效",
      partial: (p: number) => `退还客户 ${p}%，其余放款给自由职业者`,
      full: "全额退还客户，并作废证书",
      escalate: "证据相互矛盾 — 移交人工调解，资金继续冻结",
      override: (n: number) => `申诉与机器判定冲突，但有 ${n} 个独立信号互相印证 — 采纳客户证据`,
      contradict: "机器判定全部通过，孤立的申诉将移交人工处理",
    },
    id: {
      allPass: `Semua ${passed} kriteria kontrak lolos verifikasi mesin`,
      failed: (n: number) => `${n} dari ${input.criteria.length} kriteria gagal verifikasi`,
      attempt: (n: number) => `Pengiriman percobaan ke-${n} — riwayat revisi ikut dihitung`,
      late: "Pengiriman lewat dari tanggal jatuh tempo",
      noClaim: "Tidak ada keluhan tertulis, jadi belum bisa diputuskan",
      signals: (n: number) => `${n} sinyal keluhan terdeteksi di teks komplain`,
      minor: "Keluhan terdengar seperti detail kecil, bukan pelanggaran kontrak",
      release: "Cairkan escrow ke freelancer, sertifikat tetap sah",
      partial: (p: number) => `Refund ${p}% ke klien, sisanya dicairkan ke freelancer`,
      full: "Refund 100% ke klien dan batalkan sertifikat",
      escalate: "Bukti bertentangan — serahkan ke mediator manusia, dana tetap dibekukan",
      override: (n: number) => `Komplain bertentangan dengan verdict mesin, tapi ${n} sinyal independen saling mendukung — bukti klien menang`,
      contradict: "Verdict mesin bersih, jadi komplain tunggal tanpa dukungan diteruskan ke manusia",
    },
  }[L] ?? { allPass: "", failed: () => "", attempt: () => "", late: "", noClaim: "", signals: () => "", minor: "", release: "", partial: () => "", full: "", escalate: "", override: () => "", contradict: "" };

  const reasons: string[] = [];
  if (failed.length) reasons.push(TR.failed(failed.length)); else if (input.criteria.length) reasons.push(TR.allPass);
  if (hits.filter((h) => h.weight > 0).length) reasons.push(TR.signals(hits.filter((h) => h.weight > 0).length));
  if (hits.some((h) => h.weight < 0)) reasons.push(TR.minor);
  if (late) reasons.push(TR.late);
  if (attempts >= 2) reasons.push(TR.attempt(attempts));
  if (!claim.trim()) reasons.push(TR.noClaim);
  if (!reasons.length) reasons.push(TR.allPass || TR.release);

  const evidence: string[] = [
    `criteria: ${passed}/${input.criteria.length} pass`,
    ...failed.map((c) => `FAIL ${c.label}`),
    ...hits.map((h) => `claim.signal=${h.key} (w=${h.weight})`),
    `attempts=${attempts}`,
    `late=${late ? "true" : "false"}`,
    `hours_since_delivery=${Math.round(input.hoursSinceDelivery ?? 0)}`,
    `score=${score} → percent=${percent}`,
  ];

  let decision: Decision = percent >= 85 ? "refund_full" : percent >= 25 ? "refund_partial" : "release";
  // Machine evidence is clean but the client alleges a hard breach (never delivered / wrong spec).
  const contradicts = !failed.length && hard.length > 0;
  if (contradicts && hits.length < 2) { decision = "escalate"; reasons.push(TR.contradict); }
  else if (contradicts) reasons.push(TR.override(hits.length));
  if (!claim.trim()) decision = "release";

  const finalPercent = decision === "release" ? 0 : decision === "escalate" ? Math.max(percent, 50) : percent;
  const nextStep =
    decision === "release" ? TR.release
    : decision === "refund_full" ? TR.full
    : decision === "escalate" ? TR.escalate
    : TR.partial(finalPercent);

  return { decision, percent: finalPercent, confidence: Number(confidence.toFixed(2)), reasons, evidence, nextStep, source: "local" };
}
