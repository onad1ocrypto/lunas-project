"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { useMe } from "@/lib/me";
import { NEEDS_ME, ORDERS } from "@/lib/data";
import { CapiPose, LangSwitch, Logo, ProfileMenu, ThemeSwitch } from "./ui";
import { Icon } from "./Icon";

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { me } = useMe();
  const path = usePathname();
  const incoming = ORDERS.filter((o) => o.direction === "from_client" && o.status === "request").length;
  const todo = ORDERS.filter((o) => NEEDS_ME.includes(o.status)).length;

  const nav = [
    { href: "/dashboard", icon: "home", label: t("nav.dashboard"), color: "var(--lemon)" },
    { href: "/orders?tab=from_client", match: "/orders", icon: "inbox", label: t("nav.orders"), color: "var(--sky)", badge: todo },
    { href: "/orders/new", icon: "send", label: t("nav.newOrder"), color: "var(--pink)" },
    { href: `/to/${me.handle}`, icon: "link", label: t("nav.myPage"), color: "var(--mint)" },
    { href: "/profile", icon: "user", label: t("nav.profile"), color: "var(--peach)" },
  ];
  const isActive = (n: (typeof nav)[number]) =>
    n.href === "/orders/new" ? path === "/orders/new" : n.match ? path.startsWith(n.match) && path !== "/orders/new" : path === n.href;

  return (
    <div className="shell">
      <aside className="side">
        <div style={{ padding: "4px 6px 20px" }}><Logo href="/" /></div>
        <nav className="col" style={{ gap: 8 }}>
          {nav.map((n) => {
            const on = isActive(n);
            return (
              <Link key={n.href} href={n.href} className={`navi ${on ? "on" : ""}`}>
                <span className="navi-ic" style={{ background: n.color }}><Icon name={n.icon} size={18} /></span>
                <span className="grow">{n.label}</span>
                {!!n.badge && <span className="navi-badge">{n.badge}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="card side-tip" style={{ marginTop: "auto", background: "var(--lav-l)" }}>
          <div style={{ position: "absolute", top: -62, right: 8 }}><CapiPose pose="wink" size={68} className="capi-float" /></div>
          <div className="kbd" style={{ color: "var(--ink)" }}>{t("tip.title")}</div>
          <p style={{ fontSize: 13.5, marginTop: 6, lineHeight: 1.45 }}>{t("tip.body", { n: incoming })}</p>
        </div>
      </aside>

      <div className="main-col">
        <header className="topbar">
          <div className="mobile-logo"><Logo href="/" /></div>
          <div className="search">
            <Icon name="eye" size={18} />
            <input placeholder={t("top.search")} aria-label={t("top.search")} />
          </div>
          <div className="row" style={{ gap: 10, marginLeft: "auto" }}>
            <ThemeSwitch />
            <LangSwitch compact />
            <button className="btn sm" aria-label={t("top.notifications")} style={{ position: "relative", padding: 8 }}>
              <Icon name="bell" size={18} />
              <span style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: "50%", background: "var(--red)", color: "#fff",
                border: "2px solid var(--ink)", fontSize: 10, fontWeight: 900, display: "grid", placeItems: "center" }}>{incoming}</span>
            </button>
            <ProfileMenu />
          </div>
        </header>
        <main className="content">{children}</main>
      </div>

      {/* mobile bottom nav */}
      <nav className="bottom-nav">
        {nav.map((n) => (
          <Link key={n.href} href={n.href} className={isActive(n) ? "on" : ""}>
            <span style={{ background: isActive(n) ? n.color : "transparent" }}><Icon name={n.icon} size={20} /></span>
            <small>{n.label}</small>
          </Link>
        ))}
      </nav>

      <style>{`
        .shell{display:grid;grid-template-columns:264px 1fr;min-height:100vh}
        .side{position:sticky;top:0;height:100vh;display:flex;flex-direction:column;padding:22px 18px;border-right:2.5px solid var(--ink);background:var(--paper)}
        .navi{display:flex;align-items:center;gap:12px;padding:9px 10px;border-radius:14px;font-weight:800;border:2.5px solid transparent;transition:.2s var(--spring)}
        .navi:hover{background:var(--cream);transform:translateX(3px)}
        .navi.on{background:var(--cream);border-color:var(--ink);box-shadow:3px 3px 0 var(--ink)}
        .navi-ic{width:34px;height:34px;border-radius:10px;border:2px solid var(--ink);display:grid;place-items:center;flex:none;transition:transform .3s var(--spring)}
        .navi:hover .navi-ic{transform:rotate(-10deg) scale(1.08)}
        .navi-badge{min-width:24px;height:24px;padding:0 7px;border-radius:999px;background:var(--red);color:#fff;border:2px solid var(--ink);font-size:12px;display:grid;place-items:center}
        .side-tip{position:relative;padding:16px;margin-top:80px}
        .main-col{min-width:0;display:flex;flex-direction:column}
        .topbar{display:flex;align-items:center;gap:14px;padding:14px 28px;position:sticky;top:0;z-index:20;background:color-mix(in srgb, var(--cream) 86%, transparent);backdrop-filter:blur(8px);border-bottom:2.5px solid var(--ink)}
        .search{display:flex;align-items:center;gap:8px;border:2.5px solid var(--ink);border-radius:14px;padding:8px 12px;background:var(--paper);width:min(380px,40vw)}
        .search input{border:none;outline:none;background:transparent;width:100%}
        .content{padding:28px;max-width:1240px;width:100%}
        .mobile-logo,.bottom-nav{display:none}
        @media (max-width:480px){.top-avatar{display:none}}
        @media (max-width:900px){
          .shell{grid-template-columns:1fr}
          .side{display:none}
          .mobile-logo{display:block}
          .search{display:none}
          .topbar{padding:12px 16px}
          .content{padding:18px 16px 110px}
          .bottom-nav{display:grid;grid-template-columns:repeat(5,1fr);position:fixed;left:10px;right:10px;bottom:10px;z-index:30;background:var(--paper);border:2.5px solid var(--ink);border-radius:20px;box-shadow:4px 4px 0 var(--ink);padding:6px}
          .bottom-nav a{display:flex;flex-direction:column;align-items:center;gap:2px;font-weight:800}
          .bottom-nav a span{width:40px;height:32px;border-radius:10px;display:grid;place-items:center;border:2px solid transparent}
          .bottom-nav a.on span{border-color:var(--ink)}
          .bottom-nav small{font-size:10px;padding:0 2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
        }
      `}</style>
    </div>
  );
}
