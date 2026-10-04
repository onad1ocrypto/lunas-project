"use client";

/* Client wrapper so the heavy AG Studio bundle is loaded only in the browser,
   and only on the Insights page. */

import dynamic from "next/dynamic";
import { useI18n } from "@/lib/i18n";

const AgStudioView = dynamic(() => import("./AgStudioView"), {
  ssr: false,
  loading: () => <StudioSkeleton />,
});

function StudioSkeleton() {
  const { t } = useI18n();
  return (
    <div className="col" style={{ gap: 12, padding: 18 }}>
      <span className="badge" style={{ alignSelf: "flex-start" }}>
        <span className="dot" style={{ background: "var(--peach)" }} /> {t("ins.loading")}
      </span>
      <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ height: 120, flex: "1 1 240px", borderRadius: 16, background: "var(--cream)", border: "2.5px solid var(--ink)" }} />
        ))}
      </div>
      <div style={{ height: 320, borderRadius: 16, background: "var(--cream)", border: "2.5px solid var(--ink)" }} />
    </div>
  );
}

export default function InsightsStudio() {
  return (
    <div style={{ height: "clamp(620px, 78vh, 1000px)", width: "100%" }}>
      <AgStudioView />
    </div>
  );
}
