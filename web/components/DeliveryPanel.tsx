"use client";

/* =========================================================
   Delivery + verification, for real.

   The freelancer drops the actual files. The browser measures them —
   dimensions, transparency, how much of the background is white, how
   saturated the image is, word counts for text files — and the server decides
   each criterion from those numbers. No verdict is invented: criteria a
   browser cannot read come back needing a human eye.

   "Use sample files" draws the demo delivery with a canvas (real JPEGs), so
   the escrow story can be shown without hunting for 20 photos — and the
   grey-background file really is grey, so the revision request is honest.
   ========================================================= */

import { useCallback, useMemo, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Icon } from "@/components/Icon";
import { Capi } from "@/components/Capi";
import { StatusBadge } from "@/components/ui";
import type { Order, ProductKind, Status } from "@/lib/data";
import type { FileFacts, RuleResult } from "@/lib/verify";

export type Log = { who: string; msg: string; res?: string; kind: "ai" | "pp" | "hook" | "err" };
type CheckState = "idle" | "run" | "pass" | "fail" | "manual";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ---------- measuring, in the browser ---------- */

const SAMPLE_PX = 220; // analysis is done on a downscaled copy

const WHITE = 242; // "pure white" for a product shot; a grey cast lands far below this

async function pixelsOf(file: File): Promise<{ width: number; height: number; whiteRatio: number; bgWhite: number; avgSaturation: number; alpha: boolean } | null> {
  try {
    const bmp = await createImageBitmap(file);
    const { width, height } = bmp;
    const scale = Math.min(1, SAMPLE_PX / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    bmp.close?.();

    let white = 0;
    let alpha = false;
    let ringWhite = 0;
    let ringN = 0;
    const rim = Math.max(2, Math.round(Math.min(w, h) * 0.06)); // border ring = the background
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];
        if (a < 250) alpha = true;
        const isWhite = r >= WHITE && g >= WHITE && b >= WHITE;
        if (isWhite) white++;
        if (x < rim || y < rim || x >= w - rim || y >= h - rim) {
          ringN++;
          if (isWhite) ringWhite++;
        }
      }
    }
    /* Saturation is sampled on a coarser grid: it only needs to characterise the
       subject, and this keeps the loop cheap on large deliveries. */
    let satSum = 0;
    let satN = 0;
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        const i = (y * w + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const mx = Math.max(r, g, b);
        const mn = Math.min(r, g, b);
        satSum += mx === 0 ? 0 : (mx - mn) / mx;
        satN++;
      }
    }
    const n = w * h;
    return {
      width,
      height,
      whiteRatio: white / n,
      bgWhite: ringN ? ringWhite / ringN : 0,
      avgSaturation: satN ? satSum / satN : 0,
      alpha,
    };
  } catch {
    return null;
  }
}

/** Everything the server needs to judge, measured from the real file. */
export async function measureFiles(files: File[]): Promise<FileFacts[]> {
  const out: FileFacts[] = [];
  for (const f of files) {
    const base: FileFacts = { name: f.name, mime: f.type || "application/octet-stream", sizeBytes: f.size };
    if (base.mime.startsWith("image/")) {
      const px = await pixelsOf(f);
      if (px) Object.assign(base, px);
    } else if (/(text\/|json|csv|xml)/.test(base.mime) || /\.(txt|md|csv|json)$/i.test(f.name)) {
      base.text = await f.text().catch(() => "");
    }
    out.push(base);
  }
  return out;
}

/* ---------- the demo delivery, drawn for real ---------- */

const KINDS: ProductKind[] = ["bottle", "mug", "shoe", "bag", "candle", "watch", "plant", "cap"];
const COLORS = ["#F2A9C4", "#7FD1AE", "#8FC7EE", "#F5C24E", "#C9B6F5", "#F6B78A"];
const GREY_INDEX = 13;

async function drawProduct(kind: ProductKind, color: string, bg: string, w: number, h: number): Promise<Blob> {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  // a soft shadow then a simple silhouette, so the image is a plausible product shot
  ctx.fillStyle = "rgba(35,26,66,.10)";
  ctx.beginPath();
  ctx.ellipse(w / 2, h * 0.78, w * 0.26, h * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.strokeStyle = "#231A42";
  ctx.lineWidth = Math.max(6, w * 0.012);
  const cx = w / 2;
  const cy = h * 0.5;
  const s = Math.min(w, h) * 0.3;
  ctx.beginPath();
  if (kind === "mug" || kind === "cap") {
    ctx.roundRect(cx - s * 0.8, cy - s * 0.7, s * 1.6, s * 1.4, s * 0.2);
  } else if (kind === "candle" || kind === "bottle") {
    ctx.roundRect(cx - s * 0.5, cy - s * 0.9, s, s * 1.8, s * 0.25);
  } else if (kind === "watch") {
    ctx.arc(cx, cy, s * 0.8, 0, Math.PI * 2);
  } else if (kind === "plant") {
    ctx.roundRect(cx - s * 0.6, cy - s * 0.1, s * 1.2, s * 1.1, s * 0.2);
    ctx.moveTo(cx, cy - s * 0.1);
    ctx.quadraticCurveTo(cx - s * 0.9, cy - s * 1.3, cx, cy - s * 1.6);
    ctx.quadraticCurveTo(cx + s * 0.9, cy - s * 1.3, cx, cy - s * 0.1);
  } else {
    ctx.roundRect(cx - s * 0.9, cy - s * 0.8, s * 1.8, s * 1.6, s * 0.35);
  }
  ctx.fill();
  ctx.stroke();
  return await new Promise((res) => c.toBlob((b) => res(b!), "image/jpeg", 0.88));
}

/** 20 JPGs at 2000×1500 with a white background — except one, which is grey. */
export async function makeSampleFiles(count = 20, grey = true): Promise<File[]> {
  const files: File[] = [];
  for (let i = 0; i < count; i++) {
    const bad = grey && i === GREY_INDEX;
    const blob = await drawProduct(KINDS[i % KINDS.length], COLORS[i % COLORS.length], bad ? "#D9D4CC" : "#FFFFFF", 2000, 1500);
    files.push(new File([blob], `IMG_${String(i + 1).padStart(3, "0")}.jpg`, { type: "image/jpeg" }));
  }
  return files;
}

/* ---------- the panel ---------- */

export function DeliveryPanel({
  order,
  status,
  setStatus,
  log,
}: {
  order: Order;
  status: Status;
  setStatus: (s: Status) => void;
  log: (l: Log) => void;
}) {
  const { t } = useI18n();
  const [files, setFiles] = useState<File[]>([]);
  const [facts, setFacts] = useState<FileFacts[]>([]);
  const [busy, setBusy] = useState<"" | "reading" | "sample" | "verifying">("");
  const [checks, setChecks] = useState<CheckState[]>(() => order.criteria.map(() => "idle"));
  const [notes, setNotes] = useState<string[]>(() => order.criteria.map(() => ""));
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const imageFiles = useMemo(() => files.filter((f) => f.type.startsWith("image/")), [files]);
  const thumbs = useMemo(() => imageFiles.slice(0, 8).map((f) => URL.createObjectURL(f)), [imageFiles]);
  const imageNames = useMemo(() => imageFiles.slice(0, 8).map((f) => f.name), [imageFiles]);
  const uploaded = files.length > 0;
  const totalMb = useMemo(() => (files.reduce((s, f) => s + f.size, 0) / 1_048_576).toFixed(1), [files]);

  const take = useCallback(
    async (list: File[], source: "drop" | "sample") => {
      if (!list.length) return;
      setBusy("reading");
      setChecks(order.criteria.map(() => "idle"));
      setNotes(order.criteria.map(() => ""));
      const measured = await measureFiles(list);
      setFiles(list);
      setFacts(measured);
      setBusy("");
      const mb = (list.reduce((s, f) => s + f.size, 0) / 1_048_576).toFixed(1);
      log({
        who: "webhook",
        msg: source === "sample" ? "delivery.uploaded (sample set)" : "delivery.uploaded",
        res: `${list.length} files · ${mb} MB`,
        kind: "hook",
      });
      if (status === "revision") setStatus("in_escrow");
    },
    [log, order.criteria, setStatus, status]
  );

  const verify = async () => {
    if (!facts.length) return;
    setBusy("verifying");
    setStatus("verifying");
    log({ who: "verify_agent", msg: "start", res: `${order.criteria.length} criteria · ${facts.length} files measured`, kind: "ai" });
    setChecks(order.criteria.map(() => "run"));

    let verdict: { results?: RuleResult[] } | null = null;
    try {
      const r = await fetch("/api/agent/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ criteria: order.criteria, files: facts, dueAt: order.due }),
      });
      if (r.ok) verdict = await r.json();
    } catch {
      /* network hiccup: fall through with no verdict, which reads as "manual" */
    }

    const results: RuleResult[] = order.criteria.map((c, i) =>
      verdict?.results?.[i] ?? { pass: false, note: "verification could not run — try again", kind: "manual" as const }
    );

    for (let i = 0; i < order.criteria.length; i++) {
      await sleep(560);
      const res = results[i];
      setChecks((x) => x.map((v, j) => (j === i ? (res.pass ? "pass" : res.kind === "manual" ? "manual" : "fail") : v)));
      setNotes((x) => x.map((v, j) => (j === i ? res.note : v)));
      log({
        who: "verify_agent",
        msg: order.criteria[i].rule,
        res: res.pass ? `✓ ${res.note}` : res.note,
        kind: res.pass ? "ai" : res.kind === "manual" ? "hook" : "err",
      });
    }

    const failed = results.filter((r) => !r.pass && r.kind !== "manual");
    const manualOnly = results.filter((r) => !r.pass && r.kind === "manual");
    await sleep(400);
    if (failed.length) {
      const idx = results.findIndex((r) => !r.pass && r.kind !== "manual");
      log({ who: "verify_agent", msg: `request_revision(${order.criteria[idx]?.label ?? "delivery"})`, res: "funds stay in escrow", kind: "ai" });
      setStatus("revision");
    } else if (manualOnly.length) {
      log({ who: "verify_agent", msg: `${manualOnly.length} criteria need your eye`, res: "client review (72h)", kind: "hook" });
      setStatus("review");
    } else {
      log({ who: "verify_agent", msg: "all criteria met", res: "client review (72h)", kind: "ai" });
      setStatus("review");
    }
    setBusy("");
  };

  const head =
    status === "revision"
      ? { c: "var(--peach)", i: "refresh", t: t("dl.revT"), s: t("dl.revB") }
      : status === "verifying"
        ? { c: "var(--lav)", i: "bot", t: t("dl.verT"), s: t("dl.verB") }
        : { c: "var(--sky)", i: "upload", t: t("dl.t"), s: t("dl.b") };

  const measuredCount = facts.filter((f) => f.width).length;

  return (
    <div className="card pad" style={{ background: status === "revision" ? "var(--peach-l)" : status === "verifying" ? "var(--lav-l)" : "var(--sky-l)" }}>
      <div className="row" style={{ gap: 12, alignItems: "flex-start", marginBottom: 14 }}>
        <span className="navi-ic" style={{ background: head.c, width: 44, height: 44, border: "2.5px solid var(--ink)", flex: "none" }}>
          <Icon name={head.i} size={20} />
        </span>
        <div className="col grow" style={{ gap: 2 }}>
          <b style={{ fontFamily: "var(--font-display)", fontSize: 17 }}>{head.t}</b>
          <span className="tiny muted" style={{ fontWeight: 700 }}>{head.s}</span>
        </div>
        {status !== "in_escrow" && <StatusBadge s={status} />}
      </div>

      {!uploaded ? (
        <div
          className={`drop ${dragging ? "on" : ""}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void take(Array.from(e.dataTransfer.files), "drop");
          }}
        >
          <span className="drop-ic float"><Icon name="upload" size={30} /></span>
          <b style={{ fontSize: 17 }}>{busy === "reading" ? t("dl.reading") : t("dl.drop")}</b>
          <span className="tiny muted">{t("dl.dropSub2")}</span>
          <button
            className="btn sm"
            style={{ marginTop: 4 }}
            onClick={async (e) => {
              e.stopPropagation();
              setBusy("sample");
              const list = await makeSampleFiles(20, true);
              await take(list, "sample");
            }}
            disabled={!!busy}
          >
            <Icon name="sparkles" size={15} /> {busy === "sample" ? t("dl.sampleBusy") : t("dl.sample")}
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.txt,.md,.csv,.json"
            style={{ display: "none" }}
            data-testid="dl-input"
            onChange={(e) => void take(Array.from(e.target.files ?? []), "drop")}
          />
        </div>
      ) : (
        <div className="dl-grid">
          <div className="col" style={{ gap: 10 }}>
            <div className="thumbs stagger">
              {thumbs.map((src, i) => (
                <div key={src} className="thumb">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={`delivery preview ${i + 1}`} />
                  <span className="thumb-name">{imageNames[i]?.replace(/\.[a-z]+$/i, "") ?? ""}</span>
                </div>
              ))}
              {files.length > thumbs.length && (
                <div className="thumb more">+{files.length - thumbs.length}</div>
              )}
            </div>
            <div className="row wrap" style={{ gap: 8 }}>
              <span className="badge">
                <span className="dot" style={{ background: "var(--mint)" }} />
                {t("dl.measured", { n: String(measuredCount), total: String(files.length), mb: totalMb })}
              </span>
              <button className="btn sm" onClick={() => inputRef.current?.click()} disabled={!!busy}>
                <Icon name="refresh" size={14} /> {t("dl.replace")}
              </button>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept="image/*,.pdf,.txt,.md,.csv,.json"
                style={{ display: "none" }}
                data-testid="dl-input"
                onChange={(e) => void take(Array.from(e.target.files ?? []), "drop")}
              />
            </div>
          </div>

          <div className="col" style={{ gap: 8 }}>
            {order.criteria.map((c, i) => (
              <div key={c.label} className={`chk ${checks[i]}`}>
                <span className="chk-st">
                  {checks[i] === "pass" ? "✓" : checks[i] === "fail" ? "✕" : checks[i] === "manual" ? "?" : ""}
                </span>
                <span className="col" style={{ gap: 2, minWidth: 0 }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{c.label}</span>
                  <span className="mono tiny" style={{ opacity: 0.7 }}>{c.rule}</span>
                  {notes[i] && (
                    <span className="tiny" style={{ fontWeight: 700, color: checks[i] === "fail" ? "var(--red)" : checks[i] === "manual" ? "var(--ink-2, #6B6488)" : "var(--green)" }}>
                      {notes[i]}
                    </span>
                  )}
                </span>
              </div>
            ))}

            {(status === "in_escrow" || status === "revision") && (
              <button className="btn lav" style={{ marginTop: 6 }} onClick={verify} disabled={busy === "verifying"}>
                <Icon name="bot" size={17} /> {busy === "verifying" ? t("dl.verRunning") : t("dl.run2")}
              </button>
            )}

            {status === "revision" && (
              <div className="note pop-in">
                <b className="row" style={{ gap: 6 }}><Capi size={30} motion="none" mood="think" /> {t("dl.agentSays")}</b>
                <p style={{ margin: "6px 0 10px", fontSize: 14 }}>
                  {notes.filter(Boolean).find((_, i) => checks[i] === "fail") ?? t("dl.agentMsg")}
                </p>
                <button className="btn sm peach" style={{ background: "var(--peach)" }} onClick={() => inputRef.current?.click()}>
                  <Icon name="upload" size={15} /> {t("dl.reupload")}
                </button>
              </div>
            )}

            {status === "review" && (
              <span className="badge" style={{ alignSelf: "flex-start", background: "var(--mint-l)" }}>
                <span className="dot" style={{ background: "var(--green)" }} /> {t("dl.sent")}
              </span>
            )}
          </div>
        </div>
      )}

      <style>{`
        .drop{width:100%;border:3px dashed var(--ink);border-radius:20px;padding:30px 20px;background:rgba(255,255,255,.7);display:flex;flex-direction:column;align-items:center;gap:8px;transition:.2s;cursor:pointer}
        .drop:hover,.drop.on{background:#fff;transform:scale(1.01);border-style:solid}
        .drop-ic{width:62px;height:62px;border-radius:18px;border:2.5px solid var(--ink);background:var(--sky);display:grid;place-items:center;box-shadow:3px 3px 0 var(--ink)}
        .dl-grid{display:grid;grid-template-columns:1.05fr 1fr;gap:18px}
        .thumbs{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
        .thumb{aspect-ratio:1;border:2.5px solid var(--ink);border-radius:14px;overflow:hidden;position:relative;background:#fff}
        .thumb img{width:100%;height:100%;object-fit:cover;display:block}
        .thumb.more{display:grid;place-items:center;font-weight:900;border-style:dashed;background:transparent}
        .thumb-name{position:absolute;left:5px;bottom:3px;font-size:9.5px;font-weight:800;color:#5b5280;background:rgba(255,255,255,.75);border-radius:4px;padding:0 3px}
        .chk{display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border:2.5px solid var(--ink);border-radius:14px;background:var(--paper);transition:background .3s}
        .chk-st{width:24px;height:24px;border-radius:50%;border:2.5px solid var(--ink-3);display:grid;place-items:center;color:#fff;font-size:12px;font-weight:900;flex:none;margin-top:2px}
        .chk.run .chk-st{border-color:var(--ink-3);border-top-color:var(--ink);animation:spin .7s linear infinite}
        .chk.pass{background:var(--mint-l)} .chk.pass .chk-st{background:var(--green);border-color:var(--ink);animation:popin .35s var(--spring)}
        .chk.fail{background:var(--red-l)} .chk.fail .chk-st{background:var(--red);border-color:var(--ink);animation:popin .35s var(--spring)}
        .chk.manual{background:var(--lemon-l)} .chk.manual .chk-st{background:var(--lemon);border-color:var(--ink);color:var(--ink);animation:popin .35s var(--spring)}
        .note{background:var(--paper);border:2.5px solid var(--ink);border-left-width:8px;border-left-color:var(--peach);border-radius:14px;padding:12px}
        @media (max-width:700px){.dl-grid{grid-template-columns:1fr}.thumbs{grid-template-columns:repeat(2,1fr)}}
      `}</style>
    </div>
  );
}
