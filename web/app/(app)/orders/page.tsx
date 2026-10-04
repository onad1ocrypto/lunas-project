"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { useMe } from "@/lib/me";
import { NEEDS_ME, ORDERS, type Direction, type Order, type Status } from "@/lib/data";
import { Icon } from "@/components/Icon";
import { Avatar, Country, Empty, Product, StatusBadge } from "@/components/ui";
import { Capi } from "@/components/Capi";
import { listIncoming, requestAsOrder } from "@/lib/requests";

type Filter = "all" | "action" | "escrow" | "review" | "paid";
const FILTERS: Record<Filter, (s: Status) => boolean> = {
  all: () => true,
  action: (s) => NEEDS_ME.includes(s),
  escrow: (s) => s === "in_escrow" || s === "verifying" || s === "revision" || s === "awaiting_payment",
  review: (s) => s === "review",
  paid: (s) => s === "paid",
};

function OrdersInner() {
  const { t } = useI18n();
  const { me } = useMe();
  const router = useRouter();
  const params = useSearchParams();
  const tab: Direction = params.get("tab") === "to_client" ? "to_client" : "from_client";
  const [filter, setFilter] = useState<Filter>("all");

  /* Requests that really arrived from a client's public page sit on top of the
     seeded demo orders — same card, same flow, one "New" ribbon. */
  const [live, setLive] = useState<Order[]>([]);
  useEffect(() => {
    let alive = true;
    listIncoming(me.handle).then((rs) => {
      if (alive) setLive(rs.filter((r) => r.status === "new").map(requestAsOrder));
    });
    return () => { alive = false; };
  }, [me.handle]);

  const allOrders = useMemo(() => [...live, ...ORDERS], [live]);
  const list = useMemo(() => allOrders.filter((o) => o.direction === tab && FILTERS[filter](o.status)), [allOrders, tab, filter]);
  const count = (d: Direction) => allOrders.filter((o) => o.direction === d).length;
  const newReq = allOrders.filter((o) => o.direction === "from_client" && o.status === "request").length;

  const tabs: { d: Direction; icon: string; label: string; sub: string; color: string }[] = [
    { d: "from_client", icon: "inbox", label: t("orders.tab.from"), sub: t("orders.tab.fromSub"), color: "var(--pink)" },
    { d: "to_client", icon: "send", label: t("orders.tab.to"), sub: t("orders.tab.toSub"), color: "var(--sky)" },
  ];

  return (
    <div className="col" style={{ gap: 22 }}>
      <div className="row between wrap" style={{ gap: 14 }}>
        <div>
          <h1 style={{ fontSize: 36 }}>{t("orders.title")}</h1>
          <p className="muted" style={{ marginTop: 4 }}>{t("orders.sub")}</p>
        </div>
        <div className="row wrap" style={{ gap: 10 }}>
          <Link href={`/to/${me.handle}`} className="btn"><Icon name="link" size={17} /> {t("orders.myPage")}</Link>
          <Link href="/orders/new" className="btn pink"><Icon name="plus" size={17} /> {t("orders.new")}</Link>
        </div>
      </div>

      {/* Big playful tabs */}
      <div className="otabs" role="tablist">
        {tabs.map((x) => {
          const on = tab === x.d;
          return (
            <button key={x.d} role="tab" aria-selected={on} className={`otab ${on ? "on" : ""}`}
              style={{ background: on ? x.color : "var(--paper)" }}
              onClick={() => { router.replace(`/orders?tab=${x.d}`); setFilter("all"); }}>
              <span className="otab-ic"><Icon name={x.icon} size={22} /></span>
              <span className="col" style={{ alignItems: "flex-start" }}>
                <span className="display" style={{ fontSize: 20 }}>{x.label} <span className="otab-count">{count(x.d)}</span></span>
                <span className="tiny" style={{ fontWeight: 700, opacity: .8 }}>{x.sub}</span>
              </span>
              {x.d === "from_client" && newReq > 0 && <span className="otab-new">{t("orders.newBadge", { n: newReq })}</span>}
            </button>
          );
        })}
      </div>

      {/* filters */}
      <div className="row wrap" style={{ gap: 8 }}>
        <Icon name="filter" size={18} />
        {(Object.keys(FILTERS) as Filter[]).map((f) => (
          <button key={f} className={`chip ${filter === f ? "on" : ""}`} onClick={() => setFilter(f)}>{t(`filter.${f}`)}</button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="card"><Empty title={t("orders.empty")} sub={t("orders.emptySub")} action={<Link href="/orders/new" className="btn pink sm">{t("orders.new")}</Link>} /></div>
      ) : (
        <div key={tab + filter} className="ogrid stagger">
          {list.map((o, i) => <OrderCard key={o.id} o={o} tilt={[-.6, .5, -.3, .7][i % 4]} />)}
        </div>
      )}

      {tab === "from_client" && (
        <div className="card share-strip">
          <Capi size={70} mood="wink" />
          <div className="grow">
            <h3 style={{ fontSize: 20 }}>{t("orders.share.t")}</h3>
            <p className="muted tiny" style={{ marginTop: 4, fontSize: 14 }}>{t("orders.share.b")}</p>
          </div>
          <code className="share-link">lunas.app/to/{me.handle}</code>
          <Link href={`/to/${me.handle}`} className="btn mint sm"><Icon name="eye" size={16} /> {t("orders.share.preview")}</Link>
        </div>
      )}

      <style>{`
        .otabs{display:grid;grid-template-columns:1fr 1fr;gap:16px}
        .otab{position:relative;display:flex;align-items:center;gap:14px;padding:16px 18px;border:2.5px solid var(--ink);border-radius:20px;text-align:left;transition:.25s var(--spring);box-shadow:2px 2px 0 var(--ink)}
        .otab.on{box-shadow:5px 5px 0 var(--ink);transform:translate(-2px,-2px)}
        .otab:hover:not(.on){transform:translateY(-2px)}
        .otab-ic{width:48px;height:48px;border-radius:14px;border:2.5px solid var(--ink);background:var(--paper);display:grid;place-items:center;flex:none}
        .otab.on .otab-ic{animation:wiggle .5s ease}
        .otab-count{display:inline-grid;place-items:center;min-width:26px;height:26px;padding:0 7px;border-radius:999px;background:var(--ink);color:var(--cream);font-size:14px;vertical-align:3px;margin-left:4px}
        .otab-new{position:absolute;top:-12px;right:14px;background:var(--red);color:#fff;border:2px solid var(--ink);border-radius:999px;padding:2px 10px;font-weight:900;font-size:12px;transform:rotate(4deg);animation:popin .5s var(--spring)}
        .ogrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:20px}
        .ocard-new{position:absolute;top:-10px;left:14px;background:var(--red);color:#fff;border:2px solid var(--ink);border-radius:999px;padding:1px 9px;font-weight:900;font-size:11.5px;transform:rotate(-3deg)}
        .share-strip{display:flex;align-items:center;gap:16px;padding:16px 20px;background:var(--mint-l);flex-wrap:wrap}
        .share-link{background:var(--paper);border:2px dashed var(--ink);border-radius:10px;padding:8px 12px;font-weight:800}
        @media (max-width:700px){.otabs{grid-template-columns:1fr}}
      `}</style>
    </div>
  );
}

function OrderCard({ o, tilt }: { o: Order; tilt: number }) {
  const { t, money, date } = useI18n();
  const cta: Record<Status, string> = {
    request: t("cta.review"), awaiting_payment: t("cta.remind"), in_escrow: t("cta.deliver"), verifying: t("cta.view"),
    revision: t("cta.fix"), review: t("cta.view"), paid: t("cta.receipt"), declined: t("cta.view"),
  };
  const hot = NEEDS_ME.includes(o.status);
  return (
    <Link href={`/orders/${o.id}`} className="card lift ocard" style={{ ["--tilt" as string]: `${tilt}deg` }}>
      <div className="ocard-top" style={{ background: o.accent }}>
        <span className="mono tiny" style={{ fontWeight: 800, color: "#231942" }}>{o.id}</span>
        {o.id.startsWith("REQ-") && <span className="ocard-new">{t("orders.newChip")}</span>}
        <span className="ocard-thumb"><Product kind={o.product} /></span>
      </div>
      <div style={{ padding: "16px 18px 18px" }}>
        <StatusBadge s={o.status} />
        <h3 style={{ fontSize: 19, margin: "10px 0 12px", minHeight: 42 }}>{o.title}</h3>
        <div className="row" style={{ gap: 10 }}>
          <Avatar p={o.client} size={34} />
          <div className="grow">
            <div style={{ fontWeight: 800, fontSize: 14 }}>{o.client.name}</div>
            <div className="row tiny muted" style={{ gap: 5 }}>{o.client.city} <Country code={o.client.country} /></div>
          </div>
        </div>
        <div className="row between" style={{ marginTop: 14, paddingTop: 12, borderTop: "2px dashed rgba(35,25,66,.15)" }}>
          <div>
            <div className="display" style={{ fontSize: 22 }}>{money(o.amount)}</div>
            <div className="tiny muted row" style={{ gap: 4 }}><Icon name="clock" size={13} /> {t("order.due", { date: date(o.due) })}</div>
          </div>
          <span className={`btn sm ${hot ? "lemon" : ""}`}>{cta[o.status]} <Icon name="right" size={14} /></span>
        </div>
      </div>
      <style>{`
        .ocard{overflow:hidden;transform:rotate(var(--tilt))}
        .ocard-top{height:74px;border-bottom:2.5px solid var(--ink);position:relative;padding:10px 14px;
          background-image:radial-gradient(rgba(255,255,255,.45) 2px,transparent 2px)!important;background-size:14px 14px!important}
        .ocard-thumb{position:absolute;right:16px;bottom:-26px;width:62px;height:62px;border-radius:16px;overflow:hidden;border:2.5px solid var(--ink);box-shadow:3px 3px 0 var(--ink);transform:rotate(6deg);transition:transform .3s var(--spring)}
        .ocard:hover .ocard-thumb{transform:rotate(-4deg) scale(1.08)}
      `}</style>
    </Link>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={null}>
      <OrdersInner />
    </Suspense>
  );
}
