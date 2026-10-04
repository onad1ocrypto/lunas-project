"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { LANGS, useI18n } from "@/lib/i18n";
import { THEMES, useTheme } from "@/lib/theme";
import { type Person, type ProductKind, type Status } from "@/lib/data";
import { initialsOf, maskEmail, ME_COLOR, useMe } from "@/lib/me";
import { Icon } from "./Icon";

/* ---------------- Logo ---------------- */
/* Top-corner mark: the gold LUNAS lockup (crest + wordmark), 56px tall instead of the
   old 44px badge so it stays readable. Only this component and its asset changed. */
export function Logo({ href = "/", size = 56 }: { href?: string; size?: number }) {
  return (
    <Link href={href} className="logo-lockup wiggle" aria-label="Lunas">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/logo-lockup.png" alt="Lunas" width={700} height={295} style={{ height: size, width: "auto", display: "block" }} />
    </Link>
  );
}

/* ---------------- Theme switcher ---------------- */
export function ThemeSwitch() {
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button className="btn sm" aria-label={t("theme.label")} aria-expanded={open} onClick={() => setOpen((o) => !o)} style={{ padding: 8 }}>
        <Icon name="palette" size={18} />
      </button>
      {open && (
        <>
          <div className="menu-backdrop" style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setOpen(false)} />
          <div
            className="card popmenu"
            style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", zIndex: 41, padding: 8, width: 186, display: "flex", flexDirection: "column", gap: 4 }}
          >
            <span className="kbd" style={{ padding: "2px 8px 4px" }}>{t("theme.label")}</span>
            {THEMES.map((th) => (
              <button
                key={th.code}
                onClick={() => { setTheme(th.code); setOpen(false); }}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 12, fontWeight: 800, fontSize: 14, textAlign: "left",
                  border: `2.5px solid ${theme === th.code ? "var(--ink)" : "transparent"}`,
                  background: theme === th.code ? "var(--cream)" : "transparent",
                }}
              >
                <span style={{ display: "inline-flex", border: "2px solid var(--ink)", borderRadius: 999, overflow: "hidden", flex: "none" }}>
                  {th.dots.map((c, i) => <span key={i} style={{ width: 9, height: 16, background: c }} />)}
                </span>
                <span className="grow">{t(`theme.${th.code}`)}</span>
                {theme === th.code && <Icon name="check" size={15} />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------- Profile menu (avatar dropdown) ---------------- */
export function ProfileMenu() {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { me, signOut, session } = useMe();
  const asPaypal = session.mode === "paypal";
  const pp = session.paypal;
  /* Sign out now actually signs out: the PayPal session cookie is dropped, the saved
     demo profile is cleared and the visitor is returned to the landing page. */
  const handleSignOut = async () => {
    setOpen(false);
    await signOut(); /* wait for the cookie to be dropped before the page changes */
    router.push("/");
    router.refresh();
  };
  const close = () => setOpen(false);
  return (
    <span className="top-avatar" style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={t("me.menu.profile")}
        aria-expanded={open}
        style={{ borderRadius: "50%", lineHeight: 0, boxShadow: open ? "0 0 0 3px var(--lemon)" : "none", transition: "box-shadow .2s" }}
      >
        <Avatar p={{ initials: initialsOf(me.name), color: ME_COLOR }} size={38} photo={me.photo} />
      </button>
      {open && (
        <>
          <div className="menu-backdrop" style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setOpen(false)} />
          <div
            className="card popmenu"
            style={{ position: "absolute", right: 0, top: "calc(100% + 10px)", zIndex: 41, width: 252, padding: 8, display: "flex", flexDirection: "column", gap: 2 }}
          >
            <div className="row" style={{ gap: 10, padding: "8px 10px 12px", borderBottom: "2px dashed var(--ink-3)", marginBottom: 4 }}>
              <Avatar p={{ initials: initialsOf(me.name), color: ME_COLOR }} size={40} photo={me.photo} />
              <div className="col" style={{ gap: 2, minWidth: 0 }}>
                <b style={{ fontFamily: "var(--font-display)", fontSize: 15 }}>{me.name}</b>
                <span className="tiny muted" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                  @{me.handle}{me.city ? ` · ${me.city}` : ""}
                </span>
                {asPaypal && pp && (
                  <span className="tiny" style={{ color: "#0E7A4D", fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {t("me.signed.pp")} · {maskEmail(pp.email)}
                  </span>
                )}
              </div>
            </div>
            <Link className="mi" href="/profile" onClick={() => setOpen(false)}><Icon name="user" size={16} /> {t("me.menu.profile")}</Link>
            <Link className="mi" href={`/to/${me.handle}`} onClick={() => setOpen(false)}><Icon name="link" size={16} /> {t("me.menu.public")}</Link>
            <Link className="mi" href="/profile#paypal" onClick={close}><Icon name="wallet" size={16} /> {t("me.menu.paypal")}</Link>
            {asPaypal ? (
              <Link className="mi" href="/signin" onClick={close} style={{ color: "#0E7A4D" }}>
                <Icon name="shield" size={16} /> {t("me.menu.connected")}
              </Link>
            ) : (
              <Link className="mi" href="/signin" onClick={close} style={{ color: "#2C6BD1" }}>
                <Icon name="wallet" size={16} /> {t("me.menu.signin")}
              </Link>
            )}
            <button className="mi" style={{ color: "var(--red)" }} onClick={handleSignOut}><Icon name="x" size={16} /> {t("me.menu.signout")}</button>
          </div>
        </>
      )}
    </span>
  );
}

/* ---------------- Capi pose sprites (generated art) ---------------- */
export function CapiPose({ pose, size = 90, className = "", style }: { pose: "idle" | "jump" | "slam" | "wink"; size?: number; className?: string; style?: CSSProperties }) {
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={`/brand/capi-${pose}.png`}
      alt=""
      aria-hidden
      className={className}
      style={{ width: size, height: size, objectFit: "contain", display: "block", ...style }}
    />
  );
}

/* ---------------- Language switcher ---------------- */
export function LangSwitch({ compact = false }: { compact?: boolean }) {
  const { lang, setLang } = useI18n();
  const idx = LANGS.findIndex((l) => l.code === lang);
  return (
    <div
      role="radiogroup"
      aria-label="Language"
      style={{
        position: "relative", display: "inline-grid", gridTemplateColumns: `repeat(${LANGS.length}, 1fr)`,
        border: "2.5px solid var(--ink)", borderRadius: 999, background: "var(--paper)", padding: 3,
        boxShadow: "2px 2px 0 var(--ink)",
      }}
    >
      <span
        aria-hidden
        style={{
          position: "absolute", top: 3, bottom: 3, left: 3, width: `calc((100% - 6px) / ${LANGS.length})`,
          transform: `translateX(${idx * 100}%)`, transition: "transform .35s var(--spring)",
          background: "var(--lemon)", borderRadius: 999, border: "2px solid var(--ink)",
        }}
      />
      {LANGS.map((l) => (
        <button
          key={l.code}
          role="radio"
          aria-checked={lang === l.code}
          title={l.label}
          onClick={() => setLang(l.code)}
          style={{ position: "relative", zIndex: 1, padding: compact ? "4px 10px" : "5px 13px", fontWeight: 800, fontSize: 13, whiteSpace: "nowrap" }}
        >
          {l.short}
        </button>
      ))}
    </div>
  );
}

/* ---------------- Avatar + country ---------------- */
export function Avatar({ p, size = 40, photo }: { p: Pick<Person, "initials" | "color">; size?: number; photo?: string }) {
  if (photo) {
    return (
      <span className="avatar" style={{ width: size, height: size, background: p.color, overflow: "hidden" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      </span>
    );
  }
  return (
    <span className="avatar" style={{ width: size, height: size, background: p.color, fontSize: size * 0.36 }}>
      {p.initials}
    </span>
  );
}
export function Country({ code }: { code: string }) {
  if (!code) return null; // a client who never said where they are gets no pill
  return (
    <span style={{ fontSize: 10.5, fontWeight: 900, padding: "1px 6px", borderRadius: 6, border: "1.5px solid var(--ink)", background: "var(--paper)" }}>
      {code}
    </span>
  );
}

/* ---------------- Status badge ---------------- */
export function StatusBadge({ s }: { s: Status }) {
  const { t } = useI18n();
  return (
    <span className={`badge st-${s}`}>
      <span className="dot" /> {t(`status.${s}`)}
    </span>
  );
}

/* ---------------- Product thumbnail (mock deliverable art) ---------------- */
export function Product({ kind, bg = "#fff", style }: { kind: ProductKind; bg?: string; style?: CSSProperties }) {
  const shapes: Record<ProductKind, ReactNode> = {
    bottle: <><rect x="42" y="24" width="16" height="12" rx="2" fill="#231942" /><rect x="31" y="35" width="38" height="48" rx="10" fill="#7DB9FF" stroke="#231942" strokeWidth="2.5" /><rect x="37" y="52" width="26" height="14" rx="3" fill="#FFF" stroke="#231942" strokeWidth="2" /></>,
    mug: <><rect x="27" y="40" width="38" height="40" rx="6" fill="#FF8FB1" stroke="#231942" strokeWidth="2.5" /><path d="M65 48h5a9 9 0 0 1 0 18h-5" fill="none" stroke="#231942" strokeWidth="4" /></>,
    shoe: <><path d="M16 72q2-24 22-24q8 10 22 10q20 2 22 12v6H16z" fill="#6EDCA8" stroke="#231942" strokeWidth="2.5" /><rect x="16" y="76" width="66" height="6" rx="3" fill="#231942" /></>,
    bag: <><path d="M38 44q0-15 12-15t12 15" fill="none" stroke="#231942" strokeWidth="4" /><rect x="27" y="42" width="46" height="40" rx="6" fill="#FFAE7A" stroke="#231942" strokeWidth="2.5" /></>,
    candle: <><rect x="37" y="44" width="26" height="38" rx="4" fill="#FFD84D" stroke="#231942" strokeWidth="2.5" /><path d="M50 26q7 9 0 14q-7-5 0-14z" fill="#FF5A4E" stroke="#231942" strokeWidth="2" /></>,
    watch: <><rect x="43" y="18" width="14" height="64" rx="4" fill="#B79CFF" stroke="#231942" strokeWidth="2.5" /><circle cx="50" cy="50" r="16" fill="#FFF" stroke="#231942" strokeWidth="3.5" /><path d="M50 50v-8M50 50h6" stroke="#231942" strokeWidth="2.5" strokeLinecap="round" /></>,
    plant: <><path d="M50 56q-18-6-16-24q14 4 16 24zM50 56q18-6 16-24q-14 4-16 24z" fill="#6EDCA8" stroke="#231942" strokeWidth="2.5" /><path d="M35 57h30l-4 25H39z" fill="#FFAE7A" stroke="#231942" strokeWidth="2.5" /></>,
    cap: <><path d="M24 64q0-26 26-26t26 26z" fill="#7DB9FF" stroke="#231942" strokeWidth="2.5" /><path d="M24 64h50q8 0 8 6H24z" fill="#231942" /></>,
    // a vertical frame with a play mark — the icon for video work
    reel: <><rect x="30" y="18" width="40" height="64" rx="7" fill="#231942" /><rect x="34" y="22" width="32" height="56" rx="5" fill="#B79CFF" /><path d="M46 40l14 10-14 10z" fill="#FFF" stroke="#231942" strokeWidth="1.5" /></>,
  };
  return (
    <svg viewBox="0 0 100 100" style={{ display: "block", width: "100%", height: "100%", ...style }}>
      <rect width="100" height="100" fill={bg} />
      <ellipse cx="50" cy="87" rx="28" ry="3.5" fill="rgba(0,0,0,.08)" />
      {shapes[kind]}
    </svg>
  );
}

/* ---------------- Confetti ---------------- */
const CONF_COLORS = ["var(--pink)", "var(--lemon)", "var(--mint)", "var(--sky)", "var(--lav)", "var(--peach)"];
export function Confetti({ fire }: { fire: number }) {
  const [pieces, setPieces] = useState<CSSProperties[]>([]);
  useEffect(() => {
    if (!fire) return;
    setPieces(
      Array.from({ length: 70 }, () => ({
        left: `${Math.random() * 100}%`,
        background: CONF_COLORS[Math.floor(Math.random() * CONF_COLORS.length)],
        borderRadius: Math.random() > 0.5 ? "50%" : 3,
        ["--x" as string]: `${(Math.random() - 0.5) * 300}px`,
        ["--r" as string]: `${Math.random() * 900 - 450}deg`,
        ["--d" as string]: `${1.8 + Math.random() * 1.6}s`,
        ["--delay" as string]: `${Math.random() * 0.4}s`,
      }))
    );
    const id = setTimeout(() => setPieces([]), 4000);
    return () => clearTimeout(id);
  }, [fire]);
  if (!pieces.length) return null;
  return <div className="confetti" aria-hidden>{pieces.map((s, i) => <i key={i} style={s} />)}</div>;
}

/* ---------------- Toast ---------------- */
export function Toast({ show, children }: { show: boolean; children: ReactNode }) {
  return <div className={`toast card ${show ? "show" : ""}`} role="status">{children}</div>;
}

/* ---------------- Section title ---------------- */
export function Kicker({ children, color = "var(--pink)" }: { children: ReactNode; color?: string }) {
  return (
    <span className="sticker" style={{ background: color, fontSize: 14, transform: "rotate(-2deg)" }}>
      {children}
    </span>
  );
}

export function Empty({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="col" style={{ alignItems: "center", textAlign: "center", padding: "40px 20px", gap: 10 }}>
      <Icon name="inbox" size={36} />
      <h3 style={{ fontSize: 20 }}>{title}</h3>
      {sub && <p className="muted">{sub}</p>}
      {action}
    </div>
  );
}
