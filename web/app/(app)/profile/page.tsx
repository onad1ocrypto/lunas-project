"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LANGS, useI18n } from "@/lib/i18n";
import { THEMES, useTheme } from "@/lib/theme";
import { ORDERS } from "@/lib/data";
import {
  hostOf,
  locationOf,
  maskEmail,
  maskId,
  normalizeUrl,
  initialsOf,
  MAX_PORTFOLIO,
  ME_COLOR,
  SOCIAL_KEYS,
  useMe,
  type MePortfolioItem,
  type MeProfile,
  type SocialKey,
} from "@/lib/me";
import { Icon } from "@/components/Icon";
import { Avatar, Country, Kicker, Toast } from "@/components/ui";

/** Downscale an uploaded picture to a 512px JPEG data URL — small enough to keep in localStorage. */
async function toAvatarDataUrl(file: File): Promise<string | null> {
  if (!file.type.startsWith("image/")) return null;
  const dataUrl = await new Promise<string>((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = () => rej(new Error("read"));
    fr.readAsDataURL(file);
  }).catch(() => null);
  if (!dataUrl) return null;
  const img = await new Promise<HTMLImageElement | null>((res) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => res(null);
    i.src = dataUrl;
  });
  if (!img) return null;
  const MAXPX = 512;
  const scale = Math.min(1, MAXPX / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.86);
}

export default function ProfilePage() {
  const { t, money, lang, setLang } = useI18n();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const { me, setMe, session, sessionReady, signOut } = useMe();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<MeProfile>(me);
  const [toast, setToast] = useState("");
  const [welcomed, setWelcomed] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [publication, setPublication] = useState<{ published: boolean; handle?: string } | null>(null);
  /* Account identifiers are masked by default so a screen recording does not show them. */
  const [revealIds, setRevealIds] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  /* One timer at a time: a previous message's timer must not cut the next one short
     (photo → save happens well inside the 2.6s window). */
  const ping = (m: string) => {
    setToast(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  };
  const asPaypal = session.mode === "paypal";
  const portfolio = me.portfolio ?? [];
  const socialsOf = (p: MeProfile) =>
    SOCIAL_KEYS.filter((k) => p.socials && p.socials[k]).map((k) => ({ key: k, url: p.socials![k] as string }));

  const pickPhoto = () => fileRef.current?.click();
  const onPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoBusy(true);
    const dataUrl = await toAvatarDataUrl(file);
    setPhotoBusy(false);
    if (!dataUrl) {
      ping(t("me.photo.err"));
      return;
    }
    setDraft((d) => ({ ...d, photo: dataUrl }));
    ping(t("me.photo.ready"));
  };
  const setSocial = (k: SocialKey, v: string) => setDraft((d) => ({ ...d, socials: { ...(d.socials ?? {}), [k]: v } }));
  const setItem = (i: number, patch: Partial<MePortfolioItem>) =>
    setDraft((d) => ({ ...d, portfolio: (d.portfolio ?? []).map((it, idx) => (idx === i ? { ...it, ...patch } : it)) }));
  const addItem = () => setDraft((d) => ({ ...d, portfolio: [...(d.portfolio ?? []), { label: "", url: "" }] }));
  const removeItem = (i: number) => setDraft((d) => ({ ...d, portfolio: (d.portfolio ?? []).filter((_, idx) => idx !== i) }));
  const pp = session.paypal;

  /* Landing here right after the PayPal round trip -> greet the user by name. */
  useEffect(() => {
    if (welcomed) return;
    if (sessionReady && session.mode === "paypal" && new URLSearchParams(window.location.search).get("welcome") === "1") {
      setWelcomed(true);
      ping(t("me.toast.welcome", { name: me.name }));
    }
  }, [welcomed, sessionReady, session.mode, me.name, t]);

  const doSignOut = () => { signOut(); router.push("/"); };

  /* Signed in? Ask whether this account already has a published page. */
  useEffect(() => {
    if (!sessionReady || !asPaypal) {
      setPublication(null);
      return;
    }
    let alive = true;
    fetch("/api/profile", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d) setPublication({ published: !!d.published, handle: d.handle }); })
      .catch(() => {});
    return () => { alive = false; };
  }, [sessionReady, asPaypal]);

  const paid = ORDERS.filter((o) => o.status === "paid");
  const earned = paid.reduce((s, o) => s + o.amount, 0) + 3180; // mock lifetime total
  const stats = [
    { v: String(24), l: t("me.stats.done"), c: "var(--mint-l)", icon: "check" },
    { v: money(earned), l: t("me.stats.earned"), c: "var(--lemon-l)", icon: "wallet" },
    { v: "4.9 ★", l: t("me.stats.rating"), c: "var(--pink-l)", icon: "star" },
  ];

  const TAG_COLORS = ["var(--pink-l)", "var(--sky-l)", "var(--lemon-l)", "var(--mint-l)"];
  const save = async () => {
    /* Normalise here, not only when reading storage: an unnormalised value would hit
       the DOM as a raw href first (a javascript: URL in an href is an XSS vector). */
    const cleanedSocials = SOCIAL_KEYS.reduce<NonNullable<MeProfile["socials"]>>((acc, k) => {
      const url = normalizeUrl((draft.socials?.[k] as string) ?? "");
      if (url) acc[k] = url;
      return acc;
    }, {});
    const cleanedPortfolio = (draft.portfolio ?? [])
      .map((it) => ({ label: it.label.trim().slice(0, 60), url: normalizeUrl(it.url) }))
      .filter((it) => it.url)
      .slice(0, MAX_PORTFOLIO);

    const clean: MeProfile = {
      name: draft.name.trim() || me.name,
      handle: draft.handle.trim().toLowerCase().replace(/^@/, "").replace(/[^a-z0-9-_]+/g, "-").replace(/^-+|-+$/g, "") || me.handle,
      city: draft.city.trim() || me.city,
      country: (draft.country.trim() || me.country).toUpperCase().slice(0, 2),
      bio: draft.bio.trim(),
      tags: draft.tags.map((s) => s.trim()).filter(Boolean).slice(0, 6),
      photo: draft.photo,
      socials: cleanedSocials,
      portfolio: cleanedPortfolio,
    };
    setMe(clean);
    setDraft(clean);
    setEditing(false);

    /* Guests stay local (nothing to write to). A signed-in user publishes, so the page
       becomes visible to clients on other devices. */
    if (!asPaypal) {
      ping(t("me.saved"));
      return;
    }
    ping(t("me.saved.publishing"));
    try {
      const r = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(clean),
      });
      const d = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; handle?: string };
      if (r.ok && d.ok) {
        setPublication({ published: true, handle: d.handle ?? clean.handle });
        ping(t("me.saved.published"));
      } else if (d.error === "handle_taken") {
        setPublication({ published: false });
        ping(t("me.saved.handleTaken"));
      } else if (d.error === "store_not_ready") {
        ping(t("me.saved.localOnly"));
      } else if (d.error === "table_missing") {
        ping(t("me.saved.tableMissing"));
      } else {
        ping(t("me.saved.failed"));
      }
    } catch {
      ping(t("me.saved.failed"));
    }
  };

  return (
    <div className="col" style={{ gap: 22 }}>
      <div>
        <Kicker color="var(--peach)">{t("nav.profile")}</Kicker>
        <h1 style={{ fontSize: 34, marginTop: 12 }}>{t("me.title")}</h1>
        <p className="muted" style={{ marginTop: 6, fontWeight: 700 }}>{t("me.sub")}</p>
      </div>

      {/* who am I right now: guest persona or a PayPal sandbox account */}
      <div className="card pad row wrap" style={{ gap: 14, background: asPaypal ? "var(--mint-l)" : "var(--lav-l)" }}>
        <span style={{ width: 44, height: 44, flex: "none", borderRadius: 14, border: "2.5px solid var(--ink)", background: "var(--paper)", display: "grid", placeItems: "center", boxShadow: "3px 3px 0 var(--ink)" }}>
          <Icon name={asPaypal ? "shield" : "user"} size={20} />
        </span>
        <div className="col grow" style={{ gap: 4, minWidth: 240 }}>
          <b style={{ fontFamily: "var(--font-display)", fontSize: 17 }}>
            {asPaypal ? t("me.id.pp") : t("me.id.guest")}
          </b>
          <p className="tiny muted" style={{ fontWeight: 700 }}>
            {asPaypal
              ? t("me.id.ppBody", { email: revealIds ? pp?.email ?? "" : maskEmail(pp?.email ?? "") })
              : t("me.id.guestBody", { name: me.name, city: me.city || locationOf(me, lang) })}
          </p>
          {asPaypal && pp && (
            <span className="mono tiny" style={{ opacity: .8 }}>
              {t("me.id.account")} {revealIds ? pp.payerId : maskId(pp.payerId)}
            </span>
          )}
        </div>
        {asPaypal ? (
          <div className="row wrap" style={{ gap: 8 }}>
            <button className="btn sm" onClick={() => setRevealIds((v) => !v)} title={t("me.mask.hint")}>
              <Icon name={revealIds ? "lock" : "eye"} size={15} /> {revealIds ? t("me.hide") : t("me.reveal")}
            </button>
            <button className="btn sm" onClick={doSignOut}><Icon name="x" size={15} /> {t("me.menu.signout")}</button>
          </div>
        ) : (
          <Link className="btn ink sm" href="/signin"><Icon name="wallet" size={15} /> {t("me.menu.signin")}</Link>
        )}
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
            <Avatar p={{ initials: initialsOf(me.name), color: ME_COLOR }} size={92} photo={me.photo} />
          </span>
          <div className="col" style={{ gap: 6, paddingBottom: 4 }}>
            <div className="row wrap" style={{ gap: 10 }}>
              <h2 style={{ fontSize: 26 }}>{me.name}</h2>
              <span className="badge" style={{ background: "var(--lemon)" }}><Icon name="star" size={12} /> PRO</span>
            </div>
            <div className="row wrap muted" style={{ gap: 8, fontWeight: 700 }}>
              <span>@{me.handle}</span>
              {me.country ? <Country code={me.country} /> : null}
              <span>· {locationOf(me, lang)}</span>
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

            {/* profile photo */}
            <div className="row wrap" style={{ gap: 16, alignItems: "center" }}>
              <Avatar p={{ initials: initialsOf(draft.name || me.name), color: ME_COLOR }} size={84} photo={draft.photo} />
              <div className="col" style={{ gap: 8 }}>
                <div className="row wrap" style={{ gap: 8 }}>
                  <button className="btn sm" type="button" onClick={pickPhoto} disabled={photoBusy}>
                    <Icon name="upload" size={15} /> {photoBusy ? t("me.photo.busy") : t("me.photo.upload")}
                  </button>
                  {draft.photo && (
                    <button className="btn sm" type="button" onClick={() => setDraft({ ...draft, photo: undefined })}>
                      <Icon name="x" size={15} /> {t("me.photo.remove")}
                    </button>
                  )}
                </div>
                <span className="tiny muted" style={{ maxWidth: 360, fontWeight: 700 }}>{t("me.photo.hint")}</span>
              </div>
              <input ref={fileRef} type="file" accept="image/*" onChange={onPhoto} style={{ display: "none" }} aria-label={t("me.photo.upload")} />
            </div>

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

            {/* links clients can open */}
            <div className="col" style={{ gap: 10, borderTop: "2.5px dashed var(--ink-3)", paddingTop: 16 }}>
              <b style={{ fontFamily: "var(--font-display)", fontSize: 16 }}>{t("me.f.links")}</b>
              <div className="pub-form">
                {SOCIAL_KEYS.map((k) => (
                  <div className="field" key={k}>
                    <label htmlFor={`f-s-${k}`}>{t(`me.f.${k}`)}</label>
                    <input
                      id={`f-s-${k}`}
                      className="input"
                      placeholder={k === "x" ? "x.com/yourname" : k === "linkedin" ? "linkedin.com/in/yourname" : k === "instagram" ? "instagram.com/yourname" : "yoursite.com"}
                      value={(draft.socials?.[k] as string) ?? ""}
                      onChange={(e) => setSocial(k, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* portfolio */}
            <div className="col" style={{ gap: 10, borderTop: "2.5px dashed var(--ink-3)", paddingTop: 16 }}>
              <b style={{ fontFamily: "var(--font-display)", fontSize: 16 }}>{t("me.f.portfolio")}</b>
              <div className="col" style={{ gap: 8 }}>
                {(draft.portfolio ?? []).map((it, i) => (
                  <div className="row wrap" key={i} style={{ gap: 8 }}>
                    <input
                      id={`f-pf-title-${i}`}
                      className="input"
                      style={{ flex: "1 1 34%", minWidth: 160 }}
                      placeholder={t("me.portfolio.title")}
                      value={it.label}
                      onChange={(e) => setItem(i, { label: e.target.value })}
                      aria-label={t("me.portfolio.title")}
                    />
                    <input
                      id={`f-pf-url-${i}`}
                      className="input"
                      style={{ flex: "2 1 46%", minWidth: 200 }}
                      placeholder="yourportfolio.com/project"
                      value={it.url}
                      onChange={(e) => setItem(i, { url: e.target.value })}
                      aria-label={t("me.portfolio.url")}
                    />
                    <button className="btn sm" type="button" onClick={() => removeItem(i)} aria-label={t("me.portfolio.remove")}>
                      <Icon name="x" size={15} />
                    </button>
                  </div>
                ))}
                {(draft.portfolio ?? []).length < MAX_PORTFOLIO && (
                  <button className="btn sm" type="button" onClick={addItem} style={{ alignSelf: "flex-start" }}>
                    <Icon name="plus" size={15} /> {t("me.portfolio.add")}
                  </button>
                )}
                <span className="tiny muted" style={{ fontWeight: 700 }}>{t("me.portfolio.hint")}</span>
              </div>
            </div>
            <div className="row wrap" style={{ gap: 10 }}>
              <button className="btn lemon" onClick={save}><Icon name="check" size={16} /> {t("me.save")}</button>
              <button className="btn" onClick={() => setEditing(false)}><Icon name="x" size={15} /> {t("me.cancel")}</button>
            </div>
          </div>
        )}
      </div>

      {/* portfolio & links — exactly what clients see on the public page */}
      <div className="card pad col" id="portfolio" style={{ gap: 14, scrollMarginTop: 90 }}>
        <div className="row between wrap" style={{ gap: 12 }}>
          <div className="row" style={{ gap: 10 }}>
            <span style={{ width: 38, height: 38, flex: "none", borderRadius: 12, border: "2.5px solid var(--ink)", background: "var(--mint-l)", display: "grid", placeItems: "center" }}>
              <Icon name="image" size={18} />
            </span>
            <div className="col" style={{ gap: 2 }}>
              <b style={{ fontFamily: "var(--font-display)", fontSize: 17 }}>{t("me.links.title")}</b>
              <span className="tiny muted" style={{ fontWeight: 700 }}>{t("me.links.body")}</span>
            </div>
          </div>
          <Link className="btn sm" href={`/to/${me.handle}`}><Icon name="eye" size={15} /> {t("me.menu.public")}</Link>
        </div>

        {/* is this page visible to other people? */}
        {asPaypal ? (
          publication?.published ? (
            <span className="badge" style={{ background: "var(--mint-l)", color: "var(--green)", borderColor: "currentColor", alignSelf: "flex-start" }}>
              <span className="dot" /> <span style={{ color: "var(--ink)" }}>{t("me.publish.on", { handle: publication.handle ?? me.handle })}</span>
            </span>
          ) : (
            <span className="badge" style={{ background: "var(--lemon-l)", borderColor: "currentColor", alignSelf: "flex-start" }}>
              <span className="dot" /> <span style={{ color: "var(--ink)" }}>{t("me.publish.off")}</span>
            </span>
          )
        ) : (
          <span className="badge" style={{ background: "var(--cream)", borderColor: "currentColor", alignSelf: "flex-start" }}>
            <span className="dot" /> <span style={{ color: "var(--ink)" }}>{t("me.publish.guest")}</span>
          </span>
        )}

        {socialsOf(me).length > 0 && (
          <div className="row wrap" style={{ gap: 8 }}>
            {socialsOf(me).map((s) => (
              <a key={s.key} className="chip" href={s.url} target="_blank" rel="noreferrer noopener" style={{ gap: 6, fontWeight: 800 }}>
                <Icon name="link" size={13} /> {t(`me.f.${s.key}`)}
              </a>
            ))}
          </div>
        )}

        {portfolio.length > 0 ? (
          <div className="col" style={{ gap: 8 }}>
            {portfolio.map((it, i) => (
              <a
                key={i}
                href={it.url}
                target="_blank"
                rel="noreferrer noopener"
                className="row between"
                style={{ gap: 12, padding: "10px 14px", border: "2.5px solid var(--ink)", borderRadius: 14, background: "var(--paper)", textDecoration: "none", boxShadow: "2px 2px 0 var(--ink)" }}
              >
                <span className="col" style={{ gap: 1, minWidth: 0 }}>
                  <b style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.label || hostOf(it.url)}</b>
                  <span className="tiny muted">{hostOf(it.url)}</span>
                </span>
                <span className="row" style={{ gap: 6, fontWeight: 800, fontSize: 13, flex: "none" }}>
                  {t("me.links.open")} <Icon name="right" size={15} />
                </span>
              </a>
            ))}
          </div>
        ) : (
          <p className="tiny muted" style={{ fontWeight: 700 }}>{t("me.links.empty")}</p>
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
            <span className="badge" style={{ background: asPaypal ? "var(--mint-l)" : "var(--cream)", color: asPaypal ? "var(--green)" : "var(--ink)", borderColor: "currentColor" }}>
              <span className="dot" /> <span style={{ color: "var(--ink)" }}>{asPaypal ? t("me.paypal.connected") : t("me.paypal.notConnected")}</span>
            </span>
          </div>
          <p className="tiny muted" style={{ fontWeight: 700 }}>{asPaypal ? t("me.paypal.bodyLive") : t("me.paypal.bodyGuest")}</p>
          {asPaypal && pp ? (
            <span className="mono tiny" style={{ opacity: .85 }}>
              {revealIds ? pp.email : maskEmail(pp.email)} · {revealIds ? pp.payerId : maskId(pp.payerId)} · sandbox
            </span>
          ) : (
            <span className="mono tiny" style={{ opacity: .6 }}>sb-{me.handle}@personal.example</span>
          )}
        </div>
        <div className="row" style={{ gap: 10 }}>
          {asPaypal ? (
            <button className="btn sm" onClick={() => ping(t("me.toast.edit"))}><Icon name="refresh" size={15} /> {t("me.paypal.manage")}</button>
          ) : (
            <Link className="btn sm" href="/signin"><Icon name="wallet" size={15} /> {t("me.menu.signin")}</Link>
          )}
          <a className="btn sm" href="https://developer.paypal.com/docs/" target="_blank" rel="noreferrer"><Icon name="link" size={15} /> {t("me.paypal.docs")}</a>
        </div>
      </div>

      {/* sign out */}
      <div className="card pad row wrap" style={{ gap: 16, background: "var(--red-l)" }}>
        <div className="col grow" style={{ gap: 4, minWidth: 220 }}>
          <b style={{ fontFamily: "var(--font-display)", fontSize: 17 }}>{t("me.signoutCard")}</b>
          <p className="tiny muted" style={{ fontWeight: 700 }}>{t("me.signoutBody")}</p>
        </div>
        <button className="btn" style={{ background: "var(--red)", color: "#fff" }} onClick={doSignOut}>
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
