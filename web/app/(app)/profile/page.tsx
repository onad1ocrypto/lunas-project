"use client";

import { useState } from "react";
import { LANGS, useI18n } from "@/lib/i18n";
import { THEMES, useTheme } from "@/lib/theme";
import { ME, ORDERS } from "@/lib/data";
import { Icon } from "@/components/Icon";
import { Avatar, Country, Kicker, Toast } from "@/components/ui";

export default function ProfilePage() {
  const { t, money, lang, setLang } = useI18n();
  const { theme, setTheme } = useTheme();
  const [toast, setToast] = useState("");
  const ping = (m: string) => { setToast(m); setTimeout(() => setToast(""), 2600); };

  const paid = ORDERS.filter((o) => o.status === "paid");
  const earned = paid.reduce((s, o) => s + o.amount, 0) + 3180; // mock lifetime total
  const stats = [
    { v: String(24), l: t("me.stats.done"), c: "var(--mint-l)", icon: "check" },
    { v: money(earned), l: t("me.stats.earned"), c: "var(--lemon-l)", icon: "wallet" },
    { v: "4.9 ★", l: t("me.stats.rating"), c: "var(--pink-l)", icon: "star" },
  ];

  return (
    <div className="col" style={{ gap: 22 }}>
      <div>
        <Kicker color="var(--peach)">{t("nav.profile")}</Kicker>
        <h1 style={{ fontSize: 34, marginTop: 12 }}>{t("me.title")}</h1>
        <p className="muted" style={{ marginTop: 6, fontWeight: 700 }}>{t("me.sub")}</p>
      </div>

      {/* header card */}
      <div className="card" style={{ overflow: "hidden" }}>
        <div
          style={{
            height: 92, borderBottom: "2.5px solid var(--ink)", background: "var(--pink-l)",
            backgroundImage: "repeating-linear-gradient(-45deg, transparent 0 14px, color-mix(in srgb, var(--ink) 7%, transparent) 14px 16px)",
          }}
        />
        <div style={{ padding: "0 24px 22px", marginTop: -46, display: "flex", gap: 18, alignItems: "flex-end", flexWrap: "wrap" }}>
          <span style={{ border: "3px solid var(--ink)", borderRadius: "50%", boxShadow: "4px 4px 0 var(--ink)", lineHeight: 0 }}>
            <Avatar p={ME} size={92} />
          </span>
          <div className="col" style={{ gap: 6, paddingBottom: 4 }}>
            <div className="row wrap" style={{ gap: 10 }}>
              <h2 style={{ fontSize: 26 }}>{ME.name}</h2>
              <span className="badge" style={{ background: "var(--lemon)" }}><Icon name="star" size={12} /> PRO</span>
            </div>
            <div className="row wrap muted" style={{ gap: 8, fontWeight: 700 }}>
              <span>@{ME.handle}</span>
              <Country code={ME.country} />
              <span>· {ME.city}</span>
            </div>
            <span className="tiny muted">{t("me.since")} · {t("me.langs")}</span>
          </div>
          <button className="btn" style={{ marginLeft: "auto" }} onClick={() => ping(t("me.toast.edit"))}>
            <Icon name="sparkles" size={16} /> {t("me.edit")}
          </button>
        </div>
      </div>

      {/* stats */}
      <div className="me-stats">
        {stats.map((s) => (
          <div key={s.l} className="card pad row" style={{ gap: 14, background: s.c }}>
            <span style={{ width: 44, height: 44, flex: "none", borderRadius: 14, border: "2.5px solid var(--ink)", background: "var(--paper)", display: "grid", placeItems: "center", boxShadow: "2px 2px 0 var(--ink)" }}>
              <Icon name={s.icon} size={20} />
            </span>
            <div className="col" style={{ gap: 2 }}>
              <b className="display" style={{ fontSize: 24 }}>{s.v}</b>
              <span className="tiny" style={{ fontWeight: 800 }}>{s.l}</span>
            </div>
          </div>
        ))}
      </div>

      {/* preferences */}
      <div className="me-grid">
        <div className="card pad col" style={{ gap: 12 }}>
          <div className="row" style={{ gap: 10 }}>
            <span style={{ width: 36, height: 36, borderRadius: 12, border: "2.5px solid var(--ink)", background: "var(--lav-l)", display: "grid", placeItems: "center" }}><Icon name="palette" size={18} /></span>
            <div>
              <b style={{ fontFamily: "var(--font-display)", fontSize: 17 }}>{t("me.prefs.theme")}</b>
              <p className="tiny muted" style={{ fontWeight: 700 }}>{t("me.prefs.themeBody")}</p>
            </div>
          </div>
          <div className="row wrap" style={{ gap: 10 }}>
            {THEMES.map((th) => (
              <button
                key={th.code}
                className={`chip ${theme === th.code ? "on" : ""}`}
                onClick={() => setTheme(th.code)}
                style={{ gap: 8 }}
              >
                <span style={{ display: "inline-flex", border: "2px solid currentColor", borderRadius: 999, overflow: "hidden" }}>
                  {th.dots.map((c, i) => <span key={i} style={{ width: 8, height: 14, background: c }} />)}
                </span>
                {t(`theme.${th.code}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="card pad col" style={{ gap: 12 }}>
          <div className="row" style={{ gap: 10 }}>
            <span style={{ width: 36, height: 36, borderRadius: 12, border: "2.5px solid var(--ink)", background: "var(--sky-l)", display: "grid", placeItems: "center" }}><Icon name="globe" size={18} /></span>
            <div>
              <b style={{ fontFamily: "var(--font-display)", fontSize: 17 }}>{t("me.prefs.lang")}</b>
              <p className="tiny muted" style={{ fontWeight: 700 }}>{t("me.prefs.langBody")}</p>
            </div>
          </div>
          <div className="row wrap" style={{ gap: 10 }}>
            {LANGS.map((l) => (
              <button key={l.code} className={`chip ${lang === l.code ? "on" : ""}`} onClick={() => setLang(l.code)}>{l.label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* paypal */}
      <div className="card pad row wrap" id="paypal" style={{ gap: 16 }}>
        <span style={{ width: 46, height: 46, flex: "none", borderRadius: 14, border: "2.5px solid var(--ink)", background: "var(--mint-l)", display: "grid", placeItems: "center", boxShadow: "3px 3px 0 var(--ink)" }}>
          <Icon name="wallet" size={22} />
        </span>
        <div className="col grow" style={{ gap: 4, minWidth: 220 }}>
          <div className="row wrap" style={{ gap: 10 }}>
            <b style={{ fontFamily: "var(--font-display)", fontSize: 17 }}>{t("me.paypal.title")}</b>
            <span className="badge" style={{ background: "var(--mint-l)", color: "var(--green)", borderColor: "currentColor" }}>
              <span className="dot" /> <span style={{ color: "var(--ink)" }}>{t("me.paypal.connected")}</span>
            </span>
          </div>
          <p className="tiny muted" style={{ fontWeight: 700 }}>{t("me.paypal.body")}</p>
          <span className="mono tiny" style={{ opacity: .8 }}>sb-sari@personal.example · sandbox</span>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn sm" onClick={() => ping(t("me.toast.edit"))}><Icon name="refresh" size={15} /> {t("me.paypal.manage")}</button>
          <a className="btn sm" href="https://developer.paypal.com/docs/" target="_blank" rel="noreferrer"><Icon name="link" size={15} /> {t("me.paypal.docs")}</a>
        </div>
      </div>

      {/* sign out */}
      <div className="card pad row wrap" style={{ gap: 16, background: "var(--red-l)" }}>
        <div className="col grow" style={{ gap: 4, minWidth: 220 }}>
          <b style={{ fontFamily: "var(--font-display)", fontSize: 17 }}>{t("me.signoutCard")}</b>
          <p className="tiny muted" style={{ fontWeight: 700 }}>{t("me.signoutBody")}</p>
        </div>
        <button className="btn" style={{ background: "var(--red)", color: "#fff" }} onClick={() => ping(t("me.toast.bye"))}>
          <Icon name="x" size={16} /> {t("me.menu.signout")}
        </button>
      </div>

      <Toast show={!!toast}>{toast}</Toast>

      <style>{`
        .me-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
        .me-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
        @media (max-width:860px){.me-stats{grid-template-columns:1fr}.me-grid{grid-template-columns:1fr}}
      `}</style>
    </div>
  );
}
