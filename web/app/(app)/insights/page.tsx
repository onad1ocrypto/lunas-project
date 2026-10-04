"use client";

import { useI18n } from "@/lib/i18n";
import { Icon } from "@/components/Icon";
import InsightsStudio from "@/components/InsightsStudio";
import { kpis } from "@/lib/insights";

export default function InsightsPage() {
  const { t, money } = useI18n();
  const k = kpis();

  const tiles = [
    { icon: "lock", color: "var(--lemon)", label: t("ins.kpi.escrow"), value: money(k.inEscrow) },
    { icon: "wallet", color: "var(--mint)", label: t("ins.kpi.released"), value: money(k.releasedTotal) },
    { icon: "clock", color: "var(--sky)", label: t("ins.kpi.days"), value: `${k.avgDaysToPay.toFixed(1)}d` },
    { icon: "globe", color: "var(--lav)", label: t("ins.kpi.countries"), value: String(k.countries) },
  ] as const;

  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="row wrap" style={{ gap: 12, alignItems: "flex-end" }}>
        <div className="col grow" style={{ gap: 4 }}>
          <span className="badge"><span className="dot" style={{ background: "var(--mint)" }} /> {t("nav.insights")}</span>
          <h1 style={{ fontSize: 30, marginTop: 6 }}>{t("ins.title")}</h1>
          <p className="muted" style={{ maxWidth: 620 }}>{t("ins.sub")}</p>
        </div>
        <span className="badge" title={t("ins.licensed")}>
          <span className="dot" style={{ background: "var(--peach)" }} /> AG Studio
        </span>
      </div>

      <div className="row wrap" style={{ gap: 12 }}>
        {tiles.map((x) => (
          <div key={x.label} className="card pad row" style={{ gap: 12, flex: "1 1 200px", alignItems: "center" }}>
            <span className="navi-ic" style={{ background: x.color, width: 42, height: 42, border: "2.5px solid var(--ink)" }}>
              <Icon name={x.icon} size={20} />
            </span>
            <div className="col" style={{ gap: 2 }}>
              <small className="tiny muted" style={{ fontWeight: 800, textTransform: "uppercase", letterSpacing: ".04em" }}>{x.label}</small>
              <b style={{ fontFamily: "var(--font-display)", fontSize: 22 }}>{x.value}</b>
            </div>
          </div>
        ))}
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <div className="row wrap" style={{ gap: 10, padding: "14px 16px", borderBottom: "2.5px solid var(--ink)", background: "var(--cream)", alignItems: "center" }}>
          <Icon name="chart" size={18} />
          <b style={{ fontFamily: "var(--font-display)", fontSize: 17 }}>{t("ins.studio.t")}</b>
          <span className="tiny muted grow" style={{ fontWeight: 700, minWidth: 240 }}>{t("ins.studio.b")}</span>
        </div>
        <InsightsStudio />
      </div>

      <div className="card pad col" style={{ gap: 6, background: "var(--mint-l)" }}>
        <b style={{ fontFamily: "var(--font-display)", fontSize: 16 }}>{t("ins.data.t")}</b>
        <p className="tiny muted" style={{ fontWeight: 700, maxWidth: 780 }}>{t("ins.data.b")}</p>
      </div>
    </div>
  );
}
