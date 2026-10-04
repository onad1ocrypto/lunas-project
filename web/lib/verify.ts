/* =========================================================
   The verification engine.

   Criteria in Lunas are written as machine-checkable rules, e.g.
   "count(files) == 20", "max(w,h) \u2265 2000", "vision: bg \u2265 97% #FFF",
   "duration \u2264 60", "audio \u2265 -24 dBFS".
   This module turns those strings into real checks against the files a
   freelancer actually uploaded — photos, design files, documents, video,
   audio: whoever is being paid for the work, not just whoever edits photos.

   Three outcomes per criterion:
     measured  — proved from the file itself (count, format, pixels, words,
                 a video's duration/resolution, an audio track that is not silent)
     llm       — judged by a vision model (only when LLM_API_KEY is set)
     manual    — cannot be measured here (PDF bleed, DPI, page size, whether a
                 cut "feels" right); the client is asked to eyeball it. Never
                 silently "pass".

   Nothing here touches the DOM: the browser measures pixels, decoded media and
   audio levels and sends the numbers, this file only decides.
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
  /**
   * Length of a video/audio file in seconds, read from its own metadata.
   * Undefined for anything that is not timed media.
   */
  durationSec?: number;
  /**
   * Mean level of the audio track in dBFS (RMS, measured in the browser's
   * WebAudio). This is a loudness *indication*, not a broadcast LUFS reading —
   * the rules say "dBFS (RMS)" so nobody mistakes it for one.
   */
  dbfs?: number;
  /** True when a decoded audio track exists at all (a silent video has none). */
  hasAudio?: boolean;
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
const isVideo = (f: FileFacts) => f.mime.startsWith("video/") || ["mp4", "mov", "m4v", "webm", "mkv", "avi"].includes(ext(f.name));
const isAudio = (f: FileFacts) => f.mime.startsWith("audio/") || ["mp3", "wav", "m4a", "aac", "ogg", "opus", "flac"].includes(ext(f.name));
/** Pictures and video frames both have pixel dimensions. */
const isVisual = (f: FileFacts) => isImage(f) || isVideo(f);

/** Which files a collection rule counts: "files", "images", "videos", "docs", "slides", "concepts". */
function collectionOf(kind: string, files: FileFacts[]): FileFacts[] {
  const k = kind.toLowerCase();
  if (k === "images" || k === "image") return files.filter(isImage);
  if (k === "videos" || k === "video" || k === "clips" || k === "reels") return files.filter(isVideo);
  if (k === "audio" || k === "tracks") return files.filter(isAudio);
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

/**
 * "formats \u2287 {pdf, pptx}" / "mime \u2208 {jpg, mp4}" — every listed format must be present.
 *
 * The brief parser writes `mime \u2208 {jpg}` when a client types a format, which no
 * extension-free comparison could ever satisfy, so both spellings land here and
 * a bare extension is matched against the files' extensions *and* their mime
 * types (`mp4` \u2194 `video/mp4`, `jpeg` \u2194 `image/jpeg`).
 */
const MIME_ALIASES: Record<string, string[]> = {
  jpg: ["jpeg", "jpg", "image/jpeg"],
  jpeg: ["jpeg", "jpg", "image/jpeg"],
  png: ["png", "image/png"],
  svg: ["svg", "image/svg+xml"],
  webp: ["webp", "image/webp"],
  gif: ["gif", "image/gif"],
  pdf: ["pdf", "application/pdf"],
  docx: ["docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  pptx: ["pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  xlsx: ["xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  mp4: ["mp4", "m4v", "video/mp4"],
  mov: ["mov", "video/quicktime"],
  webm: ["webm", "video/webm"],
  mp3: ["mp3", "audio/mpeg"],
  wav: ["wav", "audio/wav", "audio/x-wav"],
  m4a: ["m4a", "audio/mp4", "audio/x-m4a"],
};

const extOfMime = (mime: string) => {
  const m = mime.toLowerCase().match(/\/(?:x-)?([a-z0-9.+-]+)/);
  return m ? m[1] : "";
};

function checkFormats(rule: string, files: FileFacts[]): RuleResult | null {
  const inSet = rule.match(/mime\s*(?:\u2208|in)\s*\{([^}]+)\}/i);
  const present = rule.match(/formats?\s*(?:\u2287|>=|in)\s*\{([^}]+)\}/i);
  const m = inSet || present;
  if (!m) return null;
  const want = m[1].split(",").map((s) => s.trim().toLowerCase().replace(/^\./, "")).filter(Boolean);
  const have: string[] = [];
  for (const f of files) {
    const e = ext(f.name);
    have.push(e, f.mime.toLowerCase(), extOfMime(f.mime));
    const alias = MIME_ALIASES[e];
    if (alias) have.push(...alias);
    const fromMime = Object.entries(MIME_ALIASES).find(([, list]) => list.includes(extOfMime(f.mime)));
    if (fromMime) have.push(fromMime[0], ...fromMime[1]);
  }
  const set = new Set(have.filter(Boolean));
  const holds = (w: string) => set.has(w) || (MIME_ALIASES[w] || []).some((a) => set.has(a));

  /* "mime \u2208 {mp4, webm}" is membership: the delivery has to be one of these.
     "formats \u2287 {svg, png}" is presence: both have to appear. Reading \u2208 as
     "all of them" would fail every file in a delivery that offers a choice. */
  if (inSet) {
    const spread = [...new Set(files.map((f) => ext(f.name)).filter(Boolean))];
    const wrong = spread.filter((e) => !want.some((w) => holds(w) || (MIME_ALIASES[w] || []).includes(e)));
    return {
      pass: wrong.length === 0 && files.length > 0,
      note: wrong.length
        ? `${wrong.join(", ")} not in ${want.map((w) => `.${w}`).join(" / ")}`
        : want.map((w) => `.${w}`).join(" / "),
      kind: "measured",
    };
  }

  const missing = want.filter((w) => !holds(w));
  return {
    pass: missing.length === 0 && files.length > 0,
    note: missing.length
      ? `missing ${missing.join(", ")} (have ${[...new Set(files.map((f) => ext(f.name)).filter(Boolean))].join(", ") || "nothing"})`
      : want.map((w) => `.${w}`).join(" + "),
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
  // Pictures and video frames both carry pixel dimensions: a 1080×1920 reel
  // satisfies "w == 1080 && h == 1920" exactly like a still would.
  const images = files.filter((f) => isVisual(f) && f.width && f.height);
  if (!images.length) return { pass: false, note: "no image or video dimensions to check", kind: "measured" };

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

/** "duration \u2264 60", "duration == 30", "15 \u2264 duration \u2264 90" — read from the file's own metadata. */
function checkDuration(rule: string, files: FileFacts[]): RuleResult | null {
  if (!/duration/i.test(rule)) return null;
  const timed = files.filter((f) => isVideo(f) || isAudio(f));
  const known = timed.filter((f) => typeof f.durationSec === "number");
  if (!timed.length)
    return { pass: false, note: "no video or audio file in the delivery to time", kind: "measured" };
  if (!known.length)
    return { pass: false, note: "the player could not read this file's duration — please confirm it", kind: "manual" };

  const longest = known.reduce((a, b) => (a.durationSec! >= b.durationSec! ? a : b));
  const show = (v: number) => `${v.toFixed(1)}s`;

  const range = rule.match(/(\d+(?:\.\d+)?)\s*(?:\u2264|<=|<)\s*duration\s*(?:\u2264|<=|<)\s*(\d+(?:\.\d+)?)/i);
  if (range) {
    const [lo, hi] = [Number(range[1]), Number(range[2])];
    const ok = known.every((f) => f.durationSec! >= lo && f.durationSec! <= hi);
    const bad = known.find((f) => f.durationSec! < lo || f.durationSec! > hi);
    return {
      pass: ok,
      note: ok ? `longest is ${show(longest.durationSec!)}` : `${bad!.name} runs ${show(bad!.durationSec!)} (needs ${lo}\u2013${hi}s)`,
      kind: "measured",
    };
  }

  const op = rule.match(/duration\s*(==|\u2264|<=|<|\u2265|>=|>)\s*(\d+(?:\.\d+)?)/i);
  if (op) {
    const want = Number(op[2]);
    const fails = known.filter((f) => {
      const d = f.durationSec!;
      switch (op[1]) {
        case "==": return Math.abs(d - want) > 0.5;
        case "\u2264": case "<=": case "<": return d > want;
        case "\u2265": case ">=": case ">": return d < want;
        default: return false;
      }
    });
    const worst = fails[0];
    return {
      pass: fails.length === 0,
      note: fails.length
        ? `${worst.name} runs ${show(worst.durationSec!)} (rule: ${op[1]} ${want}s)`
        : `longest is ${show(longest.durationSec!)} (rule: ${op[1]} ${want}s)`,
      kind: "measured",
    };
  }

  // "duration present" — timed media that actually has a length
  return { pass: known.length === timed.length, note: `${known.length} of ${timed.length} timed file(s) read`, kind: "measured" };
}

/**
 * "audio \u2265 -24 dBFS (RMS)" / "audio present" — a silent render fails, a quiet one is reported.
 *
 * RMS in dBFS is what WebAudio can honestly give: it says whether the track is
 * there and roughly how loud, not whether it meets a broadcast LUFS target. A
 * track this browser could not decode is never called silent — it is handed to
 * a human instead, unless another file already proved a real violation.
 */
function checkAudio(rule: string, files: FileFacts[]): RuleResult | null {
  if (!/\baudio\b|\bdbfs\b|loudness/i.test(rule)) return null;
  const timed = files.filter((f) => isVideo(f) || isAudio(f));
  if (!timed.length) return { pass: false, note: "no video or audio file in the delivery", kind: "measured" };

  /** a number = measured level, null = decoded silence, undefined = could not read */
  const levelOf = (f: FileFacts): number | null | undefined =>
    typeof f.dbfs === "number" ? f.dbfs : f.hasAudio === false ? null : undefined;

  const unknown = timed.filter((f) => levelOf(f) === undefined);
  const min = rule.match(/(?:audio|loudness)\s*(?:\u2265|>=|>)\s*(-?\d+(?:\.\d+)?)\s*(?:db|dbfs)?/i);

  if (!min) {
    // "audio present": every timed file must carry a track that is not silent
    const silent = timed.filter((f) => levelOf(f) === null);
    if (silent.length)
      return { pass: false, note: `${silent[0].name} carries no audible track`, kind: "measured" };
    if (unknown.length)
      return { pass: false, note: `no audio could be read from ${unknown.length} file(s) — please listen`, kind: "manual" };
    const levels = timed.map((f) => f.dbfs!);
    const mean = levels.reduce((a, b) => a + b, 0) / levels.length;
    return { pass: true, note: `${timed.length} file(s) with audio, mean ${mean.toFixed(1)} dBFS`, kind: "measured" };
  }

  const floor = Number(min[1]);
  const silent = timed.filter((f) => levelOf(f) === null);
  const measured = timed.filter((f) => typeof levelOf(f) === "number");
  const quietest = measured.length ? measured.reduce((a, b) => (levelOf(a)! <= levelOf(b)! ? a : b)) : null;

  // A definite violation is reported before anything is handed to a human.
  if (silent.length)
    return { pass: false, note: `${silent[0].name} carries no audible track (needs \u2265 ${floor} dBFS)`, kind: "measured" };
  if (quietest && levelOf(quietest)! < floor)
    return { pass: false, note: `${quietest.name} averages ${levelOf(quietest)!.toFixed(1)} dBFS (needs \u2265 ${floor} dBFS)`, kind: "measured" };
  if (unknown.length)
    return { pass: false, note: "no audio could be read from this file (silent or a format this browser cannot decode) — please listen", kind: "manual" };
  return {
    pass: true,
    note: `mean audio level ${levelOf(measured[0])!.toFixed(1)} dBFS (floor ${floor} dBFS)`,
    kind: "measured",
  };
}

/** "aspect == 9:16", "aspect == 1:1" — from the pixel dimensions of the pictures or video. */
function checkAspect(rule: string, files: FileFacts[]): RuleResult | null {
  if (!/aspect/i.test(rule)) return null;
  const m = rule.match(/aspect\s*(?:==|\u2248)\s*(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)/i);
  if (!m) return null;
  const want = Number(m[1]) / Number(m[2]);
  const visual = files.filter((f) => isVisual(f) && f.width && f.height);
  if (!visual.length) return { pass: false, note: "no image or video to take a ratio from", kind: "measured" };
  const ratio = (f: FileFacts) => f.width! / f.height!;
  const bad = visual.filter((f) => Math.abs(ratio(f) - want) / want > 0.02);
  const worst = bad[0];
  return {
    pass: bad.length === 0,
    note: bad.length
      ? `${worst.name} is ${ratio(worst).toFixed(3)}:1, not ${m[1]}:${m[2]}`
      : `all ${visual.length} at ${m[1]}:${m[2]}`,
    kind: "measured",
  };
}

/** "size \u2264 200 MB" — per file, the cap a platform imposes (YouTube, Vimeo, email). */
function checkFileSize(rule: string, files: FileFacts[]): RuleResult | null {
  const m = rule.match(/size\s*(?:\u2264|<=|<)\s*(\d+(?:\.\d+)?)\s*(mb|gb)/i);
  if (!m) return null;
  const cap = Number(m[1]) * (m[2].toLowerCase() === "gb" ? 1024 : 1);
  const mb = (f: FileFacts) => f.sizeBytes / (1024 * 1024);
  const biggest = files.reduce((a, b) => (mb(a) >= mb(b) ? a : b));
  const ok = files.every((f) => mb(f) <= cap);
  return {
    pass: ok,
    note: ok ? `heaviest file ${mb(biggest).toFixed(1)} MB` : `${biggest.name} is ${mb(biggest).toFixed(1)} MB (cap ${cap} MB)`,
    kind: "measured",
  };
}

/** "vision: bg \u2265 97% #FFF" / "vision: avg saturation < 45%" — measured from real pixels. */
function checkVision(rule: string, files: FileFacts[]): RuleResult | null {
  if (!/^vision/i.test(rule.trim()) && !/\bvision\b/i.test(rule)) return null;

  const bg = rule.match(/bg\s*(?:\u2265|>=)\s*(\d+)\s*%/i);
  if (bg) {
    const want = Number(bg[1]) / 100;
    const images = files.filter((f) => isImage(f) && typeof f.bgWhite === "number");
    if (!images.length && files.some(isVideo))
      return {
        pass: false,
        note: "a video's background changes frame by frame — play it and judge for yourself",
        kind: "manual",
      };
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
    if (!images.length && files.some(isVideo))
      return { pass: false, note: "colour across a whole video needs an eye — watch it", kind: "manual" };
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
    checkDuration,
    checkAudio,
    checkAspect,
    checkFileSize,
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
