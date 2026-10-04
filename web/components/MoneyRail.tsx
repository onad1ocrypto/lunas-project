"use client";

import { useI18n } from "@/lib/i18n";
import type { Order, Status } from "@/lib/data";
import { initialsOf, ME_COLOR, useMe } from "@/lib/me";
import { Avatar, Country } from "./ui";
import { Icon } from "./Icon";

/** Where is the money right now? 0 = client, 1 = escrow, 2 = freelancer */
export function moneyPos(s: Status): 0 | 1 | 2 {
  if (s === "paid") return 2;
  if (s === "in_escrow" || s === "verifying" || s === "revision" || s === "review") return 1;
  return 0;
}

export function MoneyRail({ order, status }: { order: Order; status: Status }) {
  const { t, money } = useI18n();
  const { me } = useMe();
  const pos = moneyPos(status);
  const funded = pos > 0;
  const coinLeft = ["calc(0% + 44px)", "calc(50% + 44px)", "calc(100% - 44px)"][pos];
  const statusText =
    status === "paid" ? t("rail.paid", { amount: money(order.amount), name: me.name.split(" ")[0] })
    : funded ? t("rail.held", { amount: money(order.amount) })
    : status === "declined" ? t("rail.declined")
    : t("rail.notFunded");

  const Node = ({ i, children, name, sub }: { i: number; children: React.ReactNode; name: string; sub: React.ReactNode }) => (
    <div className="col" style={{ alignItems: "center", gap: 6, position: "relative", zIndex: 1 }}>
      <div style={{ borderRadius: "50%", transition: "box-shadow .4s", boxShadow: pos === i && (funded || i === 0) && status !== "declined" ? "0 0 0 6px rgba(255,216,77,.55)" : "none" }}>
        {children}
      </div>
      <div style={{ fontWeight: 800, fontSize: 13.5, textAlign: "center" }}>{name}</div>
      <div className="row tiny muted" style={{ gap: 5, marginTop: -4 }}>{sub}</div>
    </div>
  );

  return (
    <div className="card pad" style={{ padding: "18px 18px 14px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", position: "relative" }}>
        {/* track */}
        <div style={{ position: "absolute", left: "16.66%", right: "16.66%", top: 22, height: 4, borderRadius: 4,
          background: "repeating-linear-gradient(90deg, rgba(35,25,66,.18) 0 8px, transparent 8px 14px)" }}>
          <div style={{ position: "absolute", inset: 0, width: ["0%", "50%", "100%"][pos], background: "var(--lemon)",
            border: funded ? "1.5px solid var(--ink)" : "none", borderRadius: 4, transition: "width 1.4s var(--ease)" }} />
          {/* coin */}
          <div style={{ position: "absolute", top: 2, left: coinLeft, transform: "translate(-50%,-50%)", transition: "left 1.4s var(--ease), opacity .3s",
            opacity: status === "declined" ? 0 : 1, zIndex: 3 }}>
            <div key={pos} className="pop-in" style={{ width: 32, height: 32, borderRadius: "50%", border: "2.5px solid var(--ink)", display: "grid", placeItems: "center",
              fontWeight: 900, background: "radial-gradient(circle at 35% 30%, #FFF0B8, var(--lemon) 60%, #F2B33D)", boxShadow: "2px 2px 0 var(--ink)" }}>$</div>
            <div style={{ position: "absolute", top: -26, left: "50%", transform: "translateX(-50%)", whiteSpace: "nowrap", fontSize: 11, fontWeight: 900,
              background: "var(--ink)", color: "var(--cream)", padding: "2px 7px", borderRadius: 7 }}>{money(order.amount)}</div>
          </div>
        </div>

        <Node i={0} name={order.client.name.split(" ")[0] + " · " + t("rail.client")} sub={<>{order.client.city} <Country code={order.client.country} /></>}>
          <Avatar p={order.client} size={46} />
        </Node>
        <Node i={1} name={t("rail.escrow")} sub={<>PayPal sandbox</>}>
          <span className="avatar" style={{ width: 46, height: 46, background: "var(--ink)", color: "var(--lemon)" }}><Icon name="lock" size={20} /></span>
        </Node>
        <Node i={2} name={me.name.split(" ")[0] + " · " + t("rail.you")} sub={<>{me.city} <Country code={me.country} /></>}>
          <Avatar p={{ initials: initialsOf(me.name), color: ME_COLOR }} size={46} photo={me.photo} />
        </Node>
      </div>
      <div className="tiny" style={{ textAlign: "center", marginTop: 12, fontWeight: 700, color: status === "paid" ? "var(--green)" : "var(--ink-2)" }}>
        {statusText}
      </div>
    </div>
  );
}
