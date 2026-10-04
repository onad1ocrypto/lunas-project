"use client";

import Link from "next/link";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { NEEDS_ME, ORDERS } from "@/lib/data";
import { useMe } from "@/lib/me";
import { Icon } from "@/components/Icon";
import {Avatar, Country, StatusBadge, Toast, CapiPose } from "@/components/ui";

const WEEKS = [120, 210, 90, 285, 160, 330, 240, 375];

export default function Dashboard() {
  const { t, money, date } = useI18n();
  const { me } = useMe();
  const [copied, setCopied] = useState(false);

  const held = ORDERS.filter((o) => ["in_escrow", "verifying", "revision", "review"].includes(o.status)).reduce((s, o) => s + o.amount, 0);
  const paid = ORDERS.filter((o) => o.status === "paid").reduce((s, o) => s + o.amount, 0);
  const requests = ORDERS.filter((o) => o.status === "request").length;
  const todo = ORDERS.filter((o) => NEEDS_ME.includes(o.status));
  const max = Math.max(...WEEKS);

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(`https://lunas.app/to/${me.handle}`); } catch {}
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const stats = [
    { label: t("dash.stat.held"), value: money(held), icon: "lock", bg: "var(--sky-l)", accent: "var(--sky)" },
    { label: t("dash.stat.paid"), value: money(paid), icon: "wallet", bg: "var(--mint-l)", accent: "var(--mint)" },
    { label: t("dash.stat.requests"), value: String(requests), icon: "inbox", bg: "var(--pink-l)", accent: "var(--pink)" },
    { label: t("dash.stat.release"), value: t("dash.stat.releaseVal"), icon: "zap", bg: "var(--lemon-l)", accent: "var(--lemon)" },
  ];

  const activity = [
    { icon: "check", color: "var(--mint)", text: t("act.1"), time: t("time.min", { n: 12 }) },
    { icon: "inbox", color: "var(--pink)", text: t("act.2"), time: t("time.hour", { n: 1 }) },
    { icon: "bot", color: "var(--lav)", text: t("act.3"), time: t("time.hour", { n: 3 }) },
    { icon: "lock", color: "var(--sky)", text: t("act.4"), time: t("time.yesterday") },
  ];

  return (
    <div className="col" style={{ gap: 22 }}>
      {/* greeting */}
      <section className="card rise dash-hello">
        <div className="grow">
          <div className="kbd">{date("2026-11-03", { weekday: "long", day: "numeric", month: "long" })}</div>
          <h1 style={{ fontSize: "clamp(28px,3.4vw,40px)", marginTop: 6 }}>
            {t("dash.hi", { name: me.name.split(" ")[0] })} <span className="wave">👋</span>
          </h1>
          <p style={{ marginTop: 8, fontWeight: 700, maxWidth: 520 }}>{t("dash.summary", { r: requests, w: todo.length - requests })}</p>
          <div className="row wrap" style={{ gap: 10, marginTop: 18 }}>
            <Link href="/orders/new" className="btn pink"><Icon name="send" size={17} /> {t("dash.sendOrder")}</Link>
            <button className="btn" onClick={copyLink}><Icon name="copy" size={17} /> {t("dash.copyLink")}</button>
          </div>
        </div>
        <div style={{ position: "relative" }}>
          <div className="speech">{t("dash.capiSays")}</div>
          <CapiPose pose="jump" size={138} className="capi-float" />
        </div>
      </section>

      {/* stats */}
      <section className="dash-stats stagger">
        {stats.map((s) => (
          <div key={s.label} className="card pad lift" style={{ background: s.bg }}>
            <div className="row between">
              <span className="kbd" style={{ color: "var(--ink)" }}>{s.label}</span>
              <span style={{ width: 36, height: 36, borderRadius: 11, border: "2.5px solid var(--ink)", background: s.accent, display: "grid", placeItems: "center" }}>
                <Icon name={s.icon} size={18} />
              </span>
            </div>
            <div className="display" style={{ fontSize: 32, marginTop: 14 }}>{s.value}</div>
          </div>
        ))}
      </section>

      <section className="dash-grid">
        {/* needs attention */}
        <div className="card pad">
          <div className="row between" style={{ marginBottom: 14 }}>
            <h2 style={{ fontSize: 22 }}>{t("dash.attention")}</h2>
            <Link href="/orders" className="btn sm ghost">{t("dash.seeAll")} <Icon name="right" size={15} /></Link>
          </div>
          <div className="col stagger" style={{ gap: 10 }}>
            {todo.map((o) => (
              <Link key={o.id} href={`/orders/${o.id}`} className="att-row">
                <span className="att-accent" style={{ background: o.accent }} />
                <Avatar p={o.client} size={40} />
                <div className="grow">
                  <div style={{ fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.title}</div>
                  <div className="row tiny muted" style={{ gap: 6, marginTop: 2 }}>
                    {o.client.name} <Country code={o.client.country} /> · {t("order.due", { date: date(o.due) })}
                  </div>
                </div>
                <div className="col" style={{ alignItems: "flex-end", gap: 6 }}>
                  <b className="display" style={{ fontSize: 18 }}>{money(o.amount)}</b>
                  <StatusBadge s={o.status} />
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="col" style={{ gap: 22 }}>
          {/* earnings chart */}
          <div className="card pad">
            <div className="row between">
              <h2 style={{ fontSize: 22 }}>{t("dash.earnings")}</h2>
              <span className="badge" style={{ background: "var(--mint-l)" }}>+38% <Icon name="zap" size={13} /></span>
            </div>
            <div className="bars">
              {WEEKS.map((v, i) => (
                <div key={i} className="bar-wrap">
                  <div className="bar" style={{ height: `${(v / max) * 100}%`, background: ["var(--pink)", "var(--lemon)", "var(--sky)", "var(--mint)", "var(--lav)", "var(--peach)"][i % 6], animationDelay: `${i * 0.07}s` }}>
                    <span className="bar-tip">{money(v)}</span>
                  </div>
                  <small>W{i + 1}</small>
                </div>
              ))}
            </div>
          </div>

          {/* activity */}
          <div className="card pad">
            <h2 style={{ fontSize: 22, marginBottom: 12 }}>{t("dash.activity")}</h2>
            <div className="col" style={{ gap: 12 }}>
              {activity.map((a, i) => (
                <div key={i} className="row" style={{ gap: 12, alignItems: "flex-start" }}>
                  <span style={{ flex: "none", width: 32, height: 32, borderRadius: 10, border: "2px solid var(--ink)", background: a.color, display: "grid", placeItems: "center" }}>
                    <Icon name={a.icon} size={16} />
                  </span>
                  <div className="grow">
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{a.text}</div>
                    <div className="tiny muted">{a.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <Toast show={copied}><Icon name="check" size={18} /> <b>{t("toast.copied")}</b></Toast>

      <style>{`
        .dash-hello{display:flex;align-items:center;gap:20px;padding:26px 30px;background:var(--lemon);flex-wrap:wrap}
        .wave{display:inline-block;animation:wave 2s ease-in-out infinite;transform-origin:70% 70%}
        @keyframes wave{0%,60%,100%{transform:rotate(0)}10%,30%{transform:rotate(14deg)}20%{transform:rotate(-8deg)}}
        .speech{position:absolute;right:110px;top:-6px;background:var(--paper);border:2.5px solid var(--ink);border-radius:16px 16px 4px 16px;padding:8px 12px;font-weight:800;font-size:13.5px;white-space:nowrap;box-shadow:3px 3px 0 var(--ink);animation:popin .5s .4s var(--spring) both}
        .dash-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:18px}
        .dash-grid{display:grid;grid-template-columns:1.35fr 1fr;gap:22px;align-items:start}
        .att-row{display:flex;align-items:center;gap:12px;padding:12px 14px 12px 18px;border:2.5px solid var(--ink);border-radius:16px;position:relative;overflow:hidden;transition:.2s var(--spring);background:var(--paper)}
        .att-row:hover{transform:translate(-2px,-2px);box-shadow:4px 4px 0 var(--ink)}
        .att-accent{position:absolute;left:0;top:0;bottom:0;width:7px;border-right:2px solid var(--ink)}
        .bars{display:flex;align-items:flex-end;gap:10px;height:170px;margin-top:20px;padding-top:26px}
        .bar-wrap{flex:1;height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:6px}
        .bar-wrap small{font-size:11px;font-weight:800;color:var(--ink-2)}
        .bar{width:100%;border:2.5px solid var(--ink);border-radius:10px 10px 4px 4px;position:relative;transform-origin:bottom;animation:grow .7s var(--spring) both}
        @keyframes grow{from{transform:scaleY(0)}to{transform:scaleY(1)}}
        .bar-tip{position:absolute;top:-28px;left:50%;transform:translateX(-50%) scale(.6);opacity:0;background:var(--ink);color:var(--cream);font-size:11px;font-weight:800;padding:2px 6px;border-radius:6px;white-space:nowrap;transition:.2s var(--spring)}
        .bar-wrap:hover .bar-tip{opacity:1;transform:translateX(-50%) scale(1)}
        @media (max-width:1100px){.dash-grid{grid-template-columns:1fr}}
        @media (max-width:900px){.dash-stats{grid-template-columns:1fr 1fr}.speech{display:none}}
      `}</style>
    </div>
  );
}
