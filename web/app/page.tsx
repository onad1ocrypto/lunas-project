"use client";

import Link from "next/link";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Capi } from "@/components/Capi";
import { Icon } from "@/components/Icon";
import { Confetti, Kicker, LangSwitch, Logo, ThemeSwitch } from "@/components/ui";

const ROUTES = [
  "Austin → Yogyakarta", "Berlin → Bandung", "Singapore → Bali", "London → Jakarta", "上海 → Surabaya",
  "Osaka → Medan", "Madrid → Makassar", "Toronto → Malang", "Sydney → Semarang", "Seoul → Denpasar",
];

export default function Landing() {
  const { t, money } = useI18n();
  const [stamped, setStamped] = useState(0);

  const steps = [
    { n: 1, icon: "text", color: "var(--lemon)", title: t("how.1.t"), body: t("how.1.b") },
    { n: 2, icon: "lock", color: "var(--sky)", title: t("how.2.t"), body: t("how.2.b") },
    { n: 3, icon: "bot", color: "var(--lav)", title: t("how.3.t"), body: t("how.3.b") },
    { n: 4, icon: "heart", color: "var(--pink)", title: t("how.4.t"), body: t("how.4.b") },
  ];

  return (
    <div style={{ overflowX: "hidden" }}>
      {/* ---------- NAV ---------- */}
      <header className="lp-nav">
        <Logo />
        <nav className="lp-links">
          <a href="#how">{t("lp.nav.how")}</a>
          <a href="#who">{t("lp.nav.who")}</a>
          <a href="#try">{t("lp.nav.try")}</a>
        </nav>
        <div className="row" style={{ gap: 10 }}>
          <ThemeSwitch />
          <LangSwitch compact />
          <Link href="/dashboard" className="btn ink sm">{t("lp.openApp")} <Icon name="right" size={16} /></Link>
        </div>
      </header>

      {/* ---------- HERO ---------- */}
      <section className="lp-hero">
        <div className="rise">
          <Kicker color="var(--mint)"><Icon name="sparkles" size={16} /> {t("lp.kicker")}</Kicker>
          <h1 className="lp-h1">
            {t("lp.h1.a")} <span className="hl pink">{t("lp.h1.b")}</span> {t("lp.h1.c")}
          </h1>
          <p className="lp-sub muted">{t("lp.sub")}</p>
          <div className="row wrap" style={{ gap: 12, marginTop: 26 }}>
            <Link href="/orders/new" className="btn pink lg pulse-ring">{t("lp.cta1")} <Icon name="send" size={18} /></Link>
            <Link href="/to/sari" className="btn lg">{t("lp.cta2")}</Link>
          </div>
          <div className="row wrap" style={{ gap: 18, marginTop: 22, fontWeight: 800, fontSize: 13.5 }}>
            <span className="row" style={{ gap: 6 }}><Icon name="shield" size={18} /> {t("lp.trust1")}</span>
            <span className="row" style={{ gap: 6 }}><Icon name="bot" size={18} /> {t("lp.trust2")}</span>
            <span className="row" style={{ gap: 6 }}><Icon name="globe" size={18} /> {t("lp.trust3")}</span>
          </div>
        </div>

        {/* hero scene */}
        <div className="lp-scene" aria-hidden>
          <span className="blob" style={{ width: 120, height: 120, background: "var(--lemon)", top: 10, left: 20 }} />
          <span className="blob float-2" style={{ width: 70, height: 70, background: "var(--sky)", bottom: 40, left: 0 }} />
          <svg className="float" width="54" height="54" viewBox="0 0 24 24" style={{ position: "absolute", top: 40, right: 30 }}>
            <path d="M12 2l2.6 6.6L21 9.5l-5 4.4 1.5 7.1L12 17.3 6.5 21 8 13.9 3 9.5l6.4-.9z" fill="var(--lemon)" stroke="var(--ink)" strokeWidth="1.6" strokeLinejoin="round" />
          </svg>

          <div className="card lp-contract">
            <div className="row between">
              <div>
                <div className="kbd">{t("lp.scene.contract")}</div>
                <div className="display" style={{ fontSize: 22, marginTop: 2 }}>{t("lp.scene.job")}</div>
              </div>
              <span className="badge" style={{ background: "var(--mint-l)" }}><Icon name="lock" size={13} /> {money(150)}</span>
            </div>
            <div className="col stagger" style={{ gap: 8, marginTop: 14 }}>
              {[t("lp.scene.c1"), t("lp.scene.c2"), t("lp.scene.c3"), t("lp.scene.c4")].map((c, i) => (
                <div key={i} className="row" style={{ gap: 10, padding: "8px 10px", borderRadius: 12, background: ["var(--lemon-l)", "var(--sky-l)", "var(--lav-l)", "var(--mint-l)"][i], border: "2px solid var(--ink)" }}>
                  <span style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--green)", color: "#fff", display: "grid", placeItems: "center", border: "2px solid var(--ink)" }}>
                    <Icon name="check" size={13} stroke={3.2} />
                  </span>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{c}</span>
                </div>
              ))}
            </div>
            <div className="lp-mini-stamp">LUNAS</div>
          </div>

          <div style={{ position: "absolute", right: -6, bottom: -10 }}><Capi size={150} mood="love" /></div>
          <span className="sticker float" style={{ position: "absolute", left: -10, top: 150, background: "var(--mint)", transform: "rotate(-6deg)" }}>+ {money(150)}</span>
          <span className="sticker float-2" style={{ position: "absolute", right: 10, top: -6, background: "var(--sky)", fontSize: 14 }}>Austin → Yogyakarta</span>
          <span className="sticker float" style={{ position: "absolute", left: 40, bottom: -6, background: "var(--lemon)", fontSize: 14, animationDelay: "1s" }}>✓ 4/4 {t("lp.scene.passed")}</span>
        </div>
      </section>

      {/* ---------- MARQUEE ---------- */}
      <div className="marquee lp-marquee">
        <div className="marquee-track">
          {[...ROUTES, ...ROUTES].map((r, i) => (
            <span key={i} className="row display" style={{ gap: 14, fontSize: 20 }}>
              {r} <span style={{ color: "var(--red)" }}>✦</span>
            </span>
          ))}
        </div>
      </div>

      {/* ---------- HOW ---------- */}
      <section id="how" className="lp-section">
        <div style={{ textAlign: "center" }}>
          <Kicker color="var(--lemon)">{t("how.kicker")}</Kicker>
          <h2 className="lp-h2">{t("how.title")}</h2>
        </div>
        <div className="lp-steps">
          {steps.map((s, i) => (
            <div key={s.n} className="card pad lift" style={{ transform: `rotate(${[-1.2, 1, -0.8, 1.3][i]}deg)` }}>
              <div className="row between">
                <span className="lp-num" style={{ background: s.color }}>{s.n}</span>
                <span className="navi-ic" style={{ width: 44, height: 44, borderRadius: 12, border: "2.5px solid var(--ink)", display: "grid", placeItems: "center", background: "var(--cream)" }}>
                  <Icon name={s.icon} size={22} />
                </span>
              </div>
              <h3 style={{ fontSize: 22, margin: "18px 0 8px" }}>{s.title}</h3>
              <p className="muted" style={{ lineHeight: 1.55 }}>{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- WHO ---------- */}
      <section id="who" className="lp-section lp-who">
        {[
          { color: "var(--pink-l)", accent: "var(--pink)", title: t("who.f.t"), items: [t("who.f.1"), t("who.f.2"), t("who.f.3"), t("who.f.4")], mood: "happy" as const },
          { color: "var(--sky-l)", accent: "var(--sky)", title: t("who.c.t"), items: [t("who.c.1"), t("who.c.2"), t("who.c.3"), t("who.c.4")], mood: "wink" as const },
        ].map((c, i) => (
          <div key={i} className="card lift" style={{ background: c.color, padding: 28, position: "relative" }}>
            <span className="sticker" style={{ background: c.accent, transform: "rotate(-3deg)" }}>{i === 0 ? t("who.f.k") : t("who.c.k")}</span>
            <h3 style={{ fontSize: 28, margin: "16px 0 16px", maxWidth: 380 }}>{c.title}</h3>
            <ul className="col" style={{ gap: 10, listStyle: "none" }}>
              {c.items.map((it) => (
                <li key={it} className="row" style={{ gap: 10, fontWeight: 700, alignItems: "flex-start" }}>
                  <span style={{ flex: "none", width: 24, height: 24, borderRadius: 8, background: "var(--paper)", border: "2px solid var(--ink)", display: "grid", placeItems: "center" }}>
                    <Icon name="check" size={14} stroke={3} />
                  </span>
                  {it}
                </li>
              ))}
            </ul>
            <div style={{ position: "absolute", right: 18, bottom: 14 }}><Capi size={80} mood={c.mood} motion="bob" /></div>
          </div>
        ))}
      </section>

      {/* ---------- TRY THE STAMP ---------- */}
      <section id="try" className="lp-section">
        <div className="card lp-try">
          <div>
            <Kicker color="var(--peach)">{t("try.kicker")}</Kicker>
            <h2 className="lp-h2" style={{ textAlign: "left", marginTop: 14 }}>{t("try.title")}</h2>
            <p className="muted" style={{ lineHeight: 1.6, maxWidth: 440, marginTop: 12 }}>{t("try.body")}</p>
            <button className="btn pink lg" style={{ marginTop: 20 }} onClick={() => setStamped((n) => n + 1)}>
              {stamped ? t("try.again") : t("try.button")} <Icon name="zap" size={18} />
            </button>
          </div>
          <div style={{ position: "relative", display: "grid", placeItems: "center" }}>
            <div key={stamped} className={`card ${stamped ? "shake" : ""}`} style={{ width: "min(340px,100%)", padding: 24, position: "relative", background: "#FFFEFA" }}>
              <div className="kbd">{t("try.receipt")}</div>
              <div className="display" style={{ fontSize: 40, margin: "8px 0 14px" }}>{money(150)}</div>
              {[[t("try.r.to"), "Sari · Yogyakarta"], [t("try.r.from"), "James · Austin"], [t("try.r.check"), "4 / 4 ✓"]].map(([a, b]) => (
                <div key={a} className="row between" style={{ padding: "8px 0", borderBottom: "2px dashed rgba(35,25,66,.15)", fontSize: 14 }}>
                  <span className="muted">{a}</span><b>{b}</b>
                </div>
              ))}
              {stamped > 0 && (
                <div className="stamp slam" style={{ right: 10, top: 64 }}>LUNAS<small>{t("stamp.sub")}</small></div>
              )}
            </div>
            <div style={{ position: "absolute", left: -10, bottom: -20 }}>
              <Capi key={"c" + stamped} size={90} mood={stamped ? "love" : "think"} motion={stamped ? "jump" : "bob"} />
            </div>
          </div>
        </div>
        <p className="tiny muted" style={{ textAlign: "center", marginTop: 16 }}>{t("try.meaning")}</p>
      </section>

      {/* ---------- CTA ---------- */}
      <section className="lp-section">
        <div className="card lp-cta">
          <Capi size={110} mood="happy" />
          <div className="grow">
            <h2 style={{ fontSize: "clamp(26px,3.4vw,40px)" }}>{t("cta.title")}</h2>
            <p style={{ marginTop: 8, fontWeight: 700, opacity: .85 }}>{t("cta.body")}</p>
          </div>
          <Link href="/dashboard" className="btn lemon lg">{t("lp.openApp")} <Icon name="right" size={18} /></Link>
        </div>
      </section>

      <footer className="lp-foot">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/lunas-emblem.png" alt="Lunas" style={{ height: 118, width: 118, objectFit: "contain" }} />
        <span className="tiny muted">{t("foot.note")}</span>
      </footer>

      <Confetti fire={stamped} />

      <style>{`
        .lp-nav{display:flex;align-items:center;justify-content:space-between;gap:16px;max-width:1200px;margin:0 auto;padding:20px 24px}
        .lp-links{display:flex;gap:26px;font-weight:800}
        .lp-links a{position:relative}
        .lp-links a:after{content:"";position:absolute;left:0;right:0;bottom:-4px;height:3px;border-radius:3px;background:var(--pink);transform:scaleX(0);transition:transform .3s var(--spring)}
        .lp-links a:hover:after{transform:scaleX(1)}
        .lp-hero{max-width:1200px;margin:0 auto;padding:40px 24px 70px;display:grid;grid-template-columns:1.05fr 1fr;gap:50px;align-items:center}
        .lp-h1{font-size:clamp(40px,5.6vw,70px);margin-top:18px}
        .lp-sub{font-size:18.5px;line-height:1.6;margin-top:18px;max-width:540px}
        .lp-scene{position:relative;height:460px}
        .blob{position:absolute;border-radius:50%;border:2.5px solid var(--ink)}
        .lp-contract{position:absolute;left:50px;right:70px;top:60px;padding:22px;transform:rotate(-3deg);background:#FFFEFA}
        .lp-mini-stamp{position:absolute;left:-14px;bottom:-26px;font-family:var(--font-display);font-weight:700;font-size:26px;letter-spacing:4px;color:var(--red);border:4px solid var(--red);border-radius:10px;padding:4px 12px;transform:rotate(-12deg);background:rgba(255,255,255,.7);animation:slam .6s 1.2s cubic-bezier(.2,.9,.3,1.25) both}
        .lp-marquee{background:var(--lemon);border-top:2.5px solid var(--ink);border-bottom:2.5px solid var(--ink);padding:14px 0;transform:rotate(-1.2deg);margin:10px -20px}
        .lp-section{max-width:1200px;margin:0 auto;padding:80px 24px 10px}
        .lp-h2{font-size:clamp(32px,4vw,50px);margin-top:14px;text-align:center}
        .lp-steps{display:grid;grid-template-columns:repeat(4,1fr);gap:22px;margin-top:40px}
        .lp-num{width:44px;height:44px;border-radius:50%;border:2.5px solid var(--ink);display:grid;place-items:center;font-family:var(--font-display);font-size:22px;font-weight:700;box-shadow:2px 2px 0 var(--ink)}
        .lp-who{display:grid;grid-template-columns:1fr 1fr;gap:24px}
        .lp-try{display:grid;grid-template-columns:1fr 1fr;gap:30px;padding:40px;background:var(--peach-l);align-items:center}
        .lp-cta{display:flex;align-items:center;gap:26px;padding:30px 36px;background:var(--lav);flex-wrap:wrap}
        .lp-foot{max-width:1200px;margin:0 auto;padding:50px 24px 40px;display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}
        @media (max-width:960px){
          .lp-hero,.lp-who,.lp-try{grid-template-columns:1fr}
          .lp-steps{grid-template-columns:1fr 1fr}
          .lp-links{display:none}
          .lp-scene{height:420px}
        }
        @media (max-width:560px){ .lp-steps{grid-template-columns:1fr} .lp-contract{left:10px;right:30px} .lp-try{padding:24px} }
      `}</style>
    </div>
  );
}
