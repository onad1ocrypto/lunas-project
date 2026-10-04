"use client";

import { useState } from "react";
import { LANGS, useI18n } from "@/lib/i18n";
import { THEMES, useTheme } from "@/lib/theme";
import { ORDERS } from "@/lib/data";
import { initialsOf, ME_COLOR, useMe, type MeProfile } from "@/lib/me";
import { Icon } from "@/components/Icon";
import { Avatar, Country, Kicker, Toast } from "@/components/ui";

export default function ProfilePage() {
  const { t, money, lang, setLang } = useI18n();
  const { theme, setTheme } = useTheme();
  const { me, setMe } = useMe();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<MeProfile>(me);
  const [toast, setToast] = useState("");
  const ping = (m: string) => { setToast(m); setTimeout(() => setToast(""), 2600); };

  const paid = ORDERS.filter((o) => o.status === "paid");
  const earned = paid.reduce((s, o) => s + o.amount, 0) + 3180; // mock lifetime total
  const stats = [
    { v: String(24), l: t("me.stats.done"), c: "var(--mint-l)", icon: "check" },
    { v: money(earned), l: t("me.stats.earned"), c: "var(--lemon-l)", icon: "wallet" },
    { v: "4.9 ★", l: t("me.stats.rating"), c: "var(--pink-l)", icon: "star" },
  ];

  const TAG_COLORS = ["var(--pink-l)", "var(--sky-l)", "var(--lemon-l)", "var(--mint-l)"];
  const save = () => {
    const clean: MeProfile = {
      name: draft.name.trim() || me.name,
      handle: draft.handle.trim().toLowerCase().replace(/^@/, "").replace(/[^a-z0-9-_]+/g, "-").replace(/^-+|-+$/g, "") || me.handle,
      city: draft.city.trim() || me.city,
      country: (draft.country.trim() || me.country).toUpperCase().slice(0, 2),
      bio: draft.bio.trim(),
      tags: draft.tags.map((s) => s.trim()).filter(Boolean).slice(0, 6),
    };
    setMe(clean);
    setDraft(clean);
    setEditing(false);
    ping(t("me.saved"));
  };

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
            <Avatar p={{ initials: initialsOf(me.name), color: ME_COLOR }} size={92} />
          </span>
          <div className="col" style={{ gap: 6, paddingBottom: 4 }}>
            <div className="row wrap" style={{ gap: 10 }}>
              <h2 style={{ fontSize: 26 }}>{me.name}</h2>
              <span className="badge" style={{ background: "var(--lemon)" }}><Icon name="star" size={12} /> PRO</span>
            </div>
            <div className="row wrap muted" style={{ gap: 8, fontWeight: 700 }}>
              <span>@{me.handle}</span>
              <Country code={me.country} />
              <span>· {me.city}</span>
            </div>
            <span className="tiny muted">{t("me.since")} · {t("me.langs")}</span>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/wax-seal.png" alt="" style={{ width: 74, transform: "rotate(8deg)", marginLeft: "auto", filter: "drop-shadow(2px 3px 0 rgba(35,25,66,.18))" }} />
          {!editing && (
            <button className="btn lemon" onClick={() => { setDraft(me); setEditing(true); }}>
              <Icon name="sparkles" size={16} /> {t("me.edit")}
            </button>
          )}
        </div>
        {!editing && me.bio && (
          <div style={{ padding: "0 24px 20px" }}>
            <p className="muted" style={{ fontWeight: 700, lineHeight: 1.6, maxWidth: 640 }}>{me.bio}</p>
            {me.tags.length > 0 && (
              <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
                {me.tags.map((s, i) => (
                  <span key={s + i} className="chip" style={{ background: TAG_COLORS[i % TAG_COLORS.length] }}>{s}</span>
                ))}
              </div>
            )}
          </div>
        )}
        {editing && (
          <div className="col pop-in" style={{ gap: 14, padding: "4px 24px 24px", borderTop: "2.5px dashed var(--ink-3)" }}>
            <b style={{ fontFamily: "var(--font-display)", fontSize: 18, paddingTop: 14 }}>{t("me.edit")}</b>
            <div className="pub-form">
              <div className="field">
                <label htmlFor="f-name">{t("me.f.name")}</label>
                <input id="f-name" className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="f-handle">{t("me.f.handle")}</label>
                <input id="f-handle" className="input" value={draft.handle} onChange={(e) => setDraft({ ...draft, handle: e.target.value })} />
              </div>
            </div>
            <div className="pub-form">
              <div className="field">
                <label htmlFor="f-city">{t("me.f.city")}</label>
                <input id="f-city" className="input" value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="f-country">{t("me.f.country")}</label>
                <input id="f-country" className="input" maxLength={2} value={draft.country} onChange={(e) => setDraft({ ...draft, country: e.target.value.toUpperCase() })} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="f-bio">{t("me.f.bio")}</label>
              <textarea id="f-bio" className="textarea" value={draft.bio} onChange={(e) => setDraft({ ...draft, bio: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="f-tags">{t("me.f.tags")}</label>
              <input id="f-tags" className="input" value={draft.tags.join(", ")} onChange={(e) => setDraft({ ...draft, tags: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
            </div>
            <div className="row wrap" style={{ gap: 10 }}>
              <button className="btn lemon" onClick={save}><Icon name="check" size={16} /> {t("me.save")}</button>
              <button className="btn" onClick={() => setEditing(false)}><Icon name="x" size={15} /> {t("me.cancel")}</button>
            </div>
          </div>
        )}
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
          <span className="mono tiny" style={{ opacity: .8 }}>sb-{me.handle}@personal.example · sandbox</span>
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
