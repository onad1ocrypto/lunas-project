"use client";

import { useCallback, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { draftCriteria, type Criterion } from "@/lib/data";
import { api } from "@/lib/api";
import { Icon } from "./Icon";
import { Capi } from "./Capi";

type DraftResult = ReturnType<typeof draftCriteria>;

export const CRIT_COLORS = ["var(--lemon-l)", "var(--sky-l)", "var(--lav-l)", "var(--mint-l)", "var(--peach-l)", "var(--pink-l)"];
const ICON_FOR: Record<Criterion["icon"], string> = { file: "file", image: "image", ruler: "ruler", palette: "palette", clock: "clock", text: "text" };

/** Brief box + "Draft with AI" button + animated criteria reveal. Used by freelancer & client flows. */
export function BriefDrafter({
  brief, setBrief, onDrafted, example, placeholder,
}: {
  brief: string;
  setBrief: (s: string) => void;
  onDrafted: (r: DraftResult) => void;
  example: string;
  placeholder: string;
}) {
  const { t, lang } = useI18n();
  const [phase, setPhase] = useState<"idle" | "thinking" | "done">("idle");
  const [result, setResult] = useState<DraftResult | null>(null);
  const [engine, setEngine] = useState<"llm" | "heuristic" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  /**
   * The Contract Agent. Calls the real /api/agent/contract endpoint (LLM when a key is
   * configured, deterministic parser otherwise) and falls back locally if the network is
   * unavailable — so the demo keeps moving and the badge always tells the truth.
   */
  const runDraft = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    setPhase("thinking");
    const started = Date.now();
    const res = await api.draftContract({ brief, lang });
    const wait = Math.max(0, 900 - (Date.now() - started));
    if (wait) await new Promise((r) => setTimeout(r, wait));

    let draft: DraftResult;
    if (res.ok && Array.isArray(res.data?.criteria) && res.data.criteria.length) {
      draft = { criteria: res.data.criteria, amount: res.data.amount, title: res.data.title ?? "" };
      setEngine(res.data.engine === "llm" ? "llm" : "heuristic");
    } else {
      const local = draftCriteria(brief, lang);
      draft = { criteria: local.criteria, amount: local.amount, title: local.title };
      setEngine("heuristic");
      if (!res.ok) setError(res.error ?? "offline — drafted locally");
    }
    setResult(draft);
    setPhase("done");
    onDrafted(draft);
    busy.current = false;
  }, [brief, lang, onDrafted]);

  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="field">
        <div className="row between">
          <label htmlFor="brief">{t("new.briefLabel")}</label>
          <button type="button" className="btn sm ghost" onClick={() => { setBrief(example); setPhase("idle"); }}>
            <Icon name="sparkles" size={15} /> {t("new.useExample")}
          </button>
        </div>
        <textarea id="brief" className="textarea" value={brief} placeholder={placeholder}
          onChange={(e) => { setBrief(e.target.value); if (phase === "done") setPhase("idle"); }} />
      </div>

      <div className="row wrap" style={{ gap: 12 }}>
        <button type="button" className="btn lav" disabled={brief.trim().length < 15 || phase === "thinking"} onClick={runDraft}>
          <Icon name="sparkles" size={17} /> {phase === "done" ? t("new.redraft") : t("new.draftAI")}
        </button>
        <span className="tiny muted">{t("new.aiHint")}</span>
        {engine && (
          <span className="badge" style={{ background: engine === "llm" ? "var(--mint-l)" : "var(--lemon-l)" }} title={error ?? undefined}>
            <Icon name="bot" size={13} /> {engine === "llm" ? "LLM agent" : "heuristic agent"}
          </span>
        )}
        {error && <span className="tiny muted">{error}</span>}
      </div>

      {phase === "thinking" && (
        <div className="card pop-in row" style={{ gap: 14, padding: 16, background: "var(--lav-l)" }}>
          <Capi size={58} mood="think" />
          <div>
            <b>{t("new.thinking")}</b>
            <div className="typing-dots" style={{ marginTop: 6, color: "var(--ink)" }}><span /><span /><span /></div>
          </div>
        </div>
      )}

      {phase === "done" && result && <CriteriaList criteria={result.criteria} />}
    </div>
  );
}

export function CriteriaList({ criteria, onRemove }: { criteria: Criterion[]; onRemove?: (i: number) => void }) {
  const { t } = useI18n();
  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="row" style={{ gap: 8 }}>
        <b>{t("new.criteria")}</b>
        <span className="badge" style={{ background: "var(--mint-l)" }}><Icon name="bot" size={13} /> {t("new.aiVerified")}</span>
      </div>
      <div className="crit-grid stagger">
        {criteria.map((c, i) => (
          <div key={c.label + i} className="row crit" style={{ background: CRIT_COLORS[i % CRIT_COLORS.length] }}>
            <span className="crit-ic"><Icon name={ICON_FOR[c.icon]} size={16} /></span>
            <div className="grow">
              <div style={{ fontWeight: 800, fontSize: 14 }}>{c.label}</div>
              <div className="mono" style={{ fontSize: 11, color: "var(--ink-2)" }}>{c.rule}</div>
            </div>
            {onRemove && (
              <button type="button" aria-label="remove" className="btn ghost sm" style={{ padding: 4 }} onClick={() => onRemove(i)}>
                <Icon name="x" size={15} />
              </button>
            )}
          </div>
        ))}
      </div>
      <style>{`
        .crit-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px}
        .crit{gap:10px;padding:10px 12px;border:2.5px solid var(--ink);border-radius:14px}
        .crit-ic{width:32px;height:32px;border-radius:10px;border:2px solid var(--ink);background:var(--paper);display:grid;place-items:center;flex:none}
      `}</style>
    </div>
  );
}
