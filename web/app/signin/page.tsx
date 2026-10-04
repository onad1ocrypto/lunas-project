"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { locationOf, useMe } from "@/lib/me";
import { Icon } from "@/components/Icon";
import { Kicker, LangSwitch, Logo, ThemeSwitch } from "@/components/ui";

/* Error codes the auth routes redirect back with. */
const ERRORS = ["paypal_not_configured", "cancelled", "bad_state", "no_code"] as const;

export default function SignInPage() {
  const { t, lang } = useI18n();
  const router = useRouter();
  const { me, session, sessionReady, signInWithPayPal, signInAsGuest } = useMe();
  const [error, setError] = useState("");

  /* Read ?error= / ?welcome= without touching useSearchParams (keeps this page static). */
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const e = q.get("error");
    if (e) setError((ERRORS as readonly string[]).includes(e) ? e : "generic");
  }, []);

  const paypalOff = sessionReady && session.paypalLoginAvailable === false;
  const asPaypal = session.mode === "paypal";

  return (
    <div className="signin-wrap">
      <header className="signin-nav">
        <Logo />
        <div className="row" style={{ gap: 10 }}>
          <ThemeSwitch />
          <LangSwitch compact />
          <Link href="/" className="btn sm">{t("signin.home")}</Link>
        </div>
      </header>

      <main className="signin-main">
        <div className="col" style={{ gap: 12, alignItems: "center", textAlign: "center" }}>
          <Kicker color="var(--mint)"><Icon name="shield" size={16} /> {t("signin.kicker")}</Kicker>
          <h1 style={{ fontSize: "clamp(30px,4.6vw,46px)" }}>{t("signin.title")}</h1>
          <p className="muted" style={{ maxWidth: 620, lineHeight: 1.6, fontWeight: 700 }}>{t("signin.sub")}</p>
        </div>

        {error && (
          <div className="card signin-err" role="alert">
            <span className="navi-ic" style={{ background: "var(--pink-l)", width: 38, height: 38, borderRadius: 12, border: "2.5px solid var(--ink)", display: "grid", placeItems: "center", flex: "none" }}>
              <Icon name="x" size={18} />
            </span>
            <div className="col" style={{ gap: 2 }}>
              <b>{t("signin.error.title")}</b>
              <span className="tiny muted">{t(`signin.error.${error}`)}</span>
            </div>
          </div>
        )}

        <div className="signin-grid">
          {/* ---------- PayPal sandbox ---------- */}
          <section className="card signin-card" style={{ background: "var(--sky-l)" }}>
            <div className="row between">
              <span className="sticker" style={{ background: "var(--sky)", fontSize: 13 }}>{t("signin.pp.badge")}</span>
              <span className="kbd">{t("signin.pp.kind")}</span>
            </div>
            <h2 style={{ fontSize: 26, marginTop: 16 }}>{t("signin.pp.title")}</h2>
            <p style={{ marginTop: 10, lineHeight: 1.6, fontWeight: 600 }}>{t("signin.pp.body")}</p>
            <ul className="col" style={{ gap: 8, margin: "16px 0 0", listStyle: "none", fontWeight: 700, fontSize: 14 }}>
              {["signin.pp.li1", "signin.pp.li2", "signin.pp.li3"].map((k) => (
                <li key={k} className="row" style={{ gap: 8, alignItems: "flex-start" }}>
                  <span style={{ flex: "none", width: 22, height: 22, borderRadius: 8, background: "var(--paper)", border: "2px solid var(--ink)", display: "grid", placeItems: "center" }}>
                    <Icon name="check" size={13} stroke={3} />
                  </span>
                  {t(k)}
                </li>
              ))}
            </ul>
            <button
              className="btn ink lg"
              style={{ marginTop: 20, width: "100%", justifyContent: "center", opacity: paypalOff ? 0.55 : 1 }}
              disabled={paypalOff}
              onClick={signInWithPayPal}
            >
              {asPaypal ? t("signin.pp.again") : t("signin.pp.cta")} <Icon name="wallet" size={18} />
            </button>
            {paypalOff && <p className="tiny" style={{ marginTop: 10, fontWeight: 700 }}>{t("signin.pp.off")}</p>}
          </section>

          {/* ---------- Guest ---------- */}
          <section className="card signin-card" style={{ background: "var(--lemon-l)" }}>
            <div className="row between">
              <span className="sticker" style={{ background: "var(--lemon)", fontSize: 13 }}>{t("signin.guest.badge")}</span>
              <span className="kbd">{t("signin.guest.kind")}</span>
            </div>
            <h2 style={{ fontSize: 26, marginTop: 16 }}>{t("signin.guest.title")}</h2>
            <p style={{ marginTop: 10, lineHeight: 1.6, fontWeight: 600 }}>{t("signin.guest.body", { name: me.name, city: locationOf(me, lang) })}</p>
            <ul className="col" style={{ gap: 8, margin: "16px 0 0", listStyle: "none", fontWeight: 700, fontSize: 14 }}>
              {["signin.guest.li1", "signin.guest.li2", "signin.guest.li3"].map((k) => (
                <li key={k} className="row" style={{ gap: 8, alignItems: "flex-start" }}>
                  <span style={{ flex: "none", width: 22, height: 22, borderRadius: 8, background: "var(--paper)", border: "2px solid var(--ink)", display: "grid", placeItems: "center" }}>
                    <Icon name="check" size={13} stroke={3} />
                  </span>
                  {t(k)}
                </li>
              ))}
            </ul>
            <button
              className="btn pink lg"
              style={{ marginTop: 20, width: "100%", justifyContent: "center" }}
              onClick={() => { signInAsGuest(); router.push("/dashboard"); }}
            >
              {t("signin.guest.cta")} <Icon name="right" size={18} />
            </button>
          </section>
        </div>

        <p className="muted tiny" style={{ textAlign: "center", maxWidth: 720, lineHeight: 1.7 }}>{t("signin.note")}</p>
      </main>

      <style>{`
        .signin-wrap{min-height:100vh;display:flex;flex-direction:column}
        .signin-nav{display:flex;align-items:center;justify-content:space-between;gap:16px;max-width:1080px;width:100%;margin:0 auto;padding:20px 24px}
        .signin-main{flex:1;max-width:1080px;width:100%;margin:0 auto;padding:24px 24px 70px;display:flex;flex-direction:column;gap:28px}
        .signin-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:start}
        .signin-card{padding:26px;position:relative}
        .signin-err{display:flex;gap:12px;align-items:center;padding:14px 16px;background:#FFF1F0;border-color:var(--red)}
        @media (max-width:820px){ .signin-grid{grid-template-columns:1fr} }
      `}</style>
    </div>
  );
}
