import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/hooks/use-lang";
import { AppHeader } from "@/components/AppHeader";
import { statusIcon, statusLabelKey } from "@/components/dashboard/parts";
import { CROWD, STOCK_ITEMS, formatTime, parseStatus, parseStock, type CrowdLevel, type ShopStatus } from "@/lib/ration";
import { myCardQuery, resolveHome, shopByIdQuery, type Customer } from "@/lib/shop-data";
import { cn } from "@/lib/utils";

type PortalShop = NonNullable<Awaited<ReturnType<NonNullable<ReturnType<typeof shopByIdQuery>["queryFn"]>>>>;

const BANNER: Record<ShopStatus, string> = {
  open: "bg-primary text-primary-foreground",
  lunch: "bg-warning text-warning-foreground",
  closed: "bg-destructive text-destructive-foreground",
};

export function Portal({ userId }: { userId: string }) {
  const { t } = useLang();
  const navigate = useNavigate();
  const cardQ = useQuery(myCardQuery(userId));
  const logout = useLogout();

  useEffect(() => {
    if (cardQ.isSuccess && !cardQ.data) {
      void resolveHome(userId).then((home) => {
        if (home === "/dashboard") navigate({ to: "/dashboard", replace: true });
      });
    }
  }, [cardQ.isSuccess, cardQ.data, userId, navigate]);

  if (cardQ.isPending) return <Centered>{t("loading")}</Centered>;
  if (cardQ.isError || !cardQ.data) {
    return (
      <Centered>
        <p className="font-bold text-foreground">{t("eGeneric")}</p>
        <button type="button" onClick={logout} className="mt-3 rounded-xl bg-ink px-4 py-2.5 text-sm font-bold text-ink-foreground">
          🚪 {t("logout")}
        </button>
      </Centered>
    );
  }
  return <CardholderView card={cardQ.data} userId={userId} />;
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 bg-background px-4 text-center text-muted-foreground">
      {children}
    </main>
  );
}

function useLogout() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };
}

function CardholderView({ card, userId }: { card: Customer; userId: string }) {
  const { t, lang } = useLang();
  const qc = useQueryClient();
  const logout = useLogout();
  const shopQ = useQuery(shopByIdQuery(card.shop_id));
  const shop = shopQ.data;
  const notifyRef = useRef<(title: string, body?: string) => void>(() => {});
  const [alertsOn, setAlertsOn] = useState(false);

  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") setAlertsOn(true);
  }, []);

  notifyRef.current = (title: string, body?: string) => {
    toast(title, body ? { description: body } : undefined);
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification(title, { body: body ?? "", icon: "/icon.svg", tag: "namma-ration" });
      }
    } catch {
      /* some mobile browsers only allow notifications from a service worker */
    }
  };

  // Live updates: shop status / stock / timings and my own collection status.
  useEffect(() => {
    const shopKey = shopByIdQuery(card.shop_id).queryKey;
    const cardKey = myCardQuery(userId).queryKey;
    const suffix = Math.random().toString(36).slice(2);
    const channel = supabase
      .channel(`portal-${card.id}-${suffix}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "shops", filter: `id=eq.${card.shop_id}` }, (payload) => {
        const next = payload.new as PortalShop;
        const prev = qc.getQueryData(shopKey);
        qc.setQueryData(shopKey, (old) => (old ? { ...old, ...next } : old));
        if (!prev) return;
        if (prev.status !== next.status) {
          const label = t(statusLabelKey(parseStatus(next.status)));
          notifyRef.current(`${statusIcon(parseStatus(next.status))} ${t("nStatus", label)}`, next.shop_name || `#${next.shop_number}`);
        }
        if (JSON.stringify(parseStock(prev.stock)) !== JSON.stringify(parseStock(next.stock))) {
          const avail = STOCK_ITEMS.filter((s) => parseStock(next.stock)[s.key]).map((s) => (lang === "ta" ? s.ta : s.en));
          notifyRef.current(`📦 ${t("nStock")}`, `${t("inStock")}: ${avail.join(", ") || "—"}`);
        }
        if (
          prev.morning_open !== next.morning_open ||
          prev.morning_close !== next.morning_close ||
          prev.evening_open !== next.evening_open ||
          prev.evening_close !== next.evening_close
        ) {
          notifyRef.current(`🕘 ${t("nTimings")}`);
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "customers", filter: `id=eq.${card.id}` }, (payload) => {
        const next = payload.new as Customer;
        const prev = qc.getQueryData(cardKey);
        qc.setQueryData(cardKey, (old) => (old ? { ...old, ...next } : old));
        if (prev && prev.status !== "collected" && next.status === "collected") notifyRef.current(`✅ ${t("nCollected")}`);
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.id, card.shop_id, userId, qc]);

  async function enableAlerts() {
    if (window.top !== window.self) return void toast.error(t("alertsIframe"));
    if (typeof Notification === "undefined") return void toast.error(t("alertsBlocked"));
    const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (perm !== "granted") return void toast.error(t("alertsBlocked"));
    setAlertsOn(true);
    notifyRef.current(t("alertsOn"));
  }

  const status = shop ? parseStatus(shop.status) : "closed";
  const stock = parseStock(shop?.stock);
  const collected = card.status === "collected";
  const collectedDate = card.collected_at
    ? new Date(card.collected_at).toLocaleDateString(lang === "ta" ? "ta-IN" : "en-IN", { day: "numeric", month: "long" })
    : "";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader
        title={t("portalTitle")}
        subtitle={shop ? `${shop.shop_name || t("shop")} · #${shop.shop_number} · ${shop.district}` : "…"}
        onLogout={logout}
        maxWidth="max-w-3xl"
      />

      <main className="mx-auto flex max-w-3xl flex-col gap-3 px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:gap-4 sm:px-4 sm:pt-4">
        <section className={cn("rounded-2xl p-4 shadow-md transition-colors sm:p-5", BANNER[status])} aria-live="polite">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-bold uppercase tracking-widest opacity-90">{t("liveStatus")}</p>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-foreground/20 px-2.5 py-1 text-xs font-bold">
              <span className="h-2 w-2 animate-pulse rounded-full bg-primary-foreground" aria-hidden="true" />
              {t("live")}
            </span>
          </div>
          <p className="mt-1.5 flex items-center gap-2.5 text-2xl font-extrabold sm:text-4xl">
            <span aria-hidden="true">{statusIcon(status)}</span>
            {shop ? t(statusLabelKey(status)) : "…"}
          </p>
          {shop && (
            <p className="mt-1 text-sm font-semibold opacity-90">
              {t("crowdLevel")}: {CROWD[shop.crowd as CrowdLevel]?.[lang] ?? shop.crowd}
            </p>
          )}
        </section>

        {shop && (
          <section className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border">
            <h2 className="mb-2.5 text-base font-bold">🕘 {t("timings")}</h2>
            <div className="grid gap-2 sm:grid-cols-2 sm:gap-3">
              <TimingCard icon="☀️" label={t("morningShift")} from={formatTime(shop.morning_open, lang)} to={formatTime(shop.morning_close, lang)} />
              <TimingCard icon="🌇" label={t("eveningShift")} from={formatTime(shop.evening_open, lang)} to={formatTime(shop.evening_close, lang)} />
            </div>
          </section>
        )}

        <section className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border">
          <h2 className="mb-2.5 text-base font-bold">📦 {t("stock")}</h2>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {STOCK_ITEMS.map((s) => {
              const on = stock[s.key];
              return (
                <li
                  key={s.key}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border-2 px-2.5 py-2",
                    on ? "border-primary-border bg-primary-soft" : "border-destructive-border bg-destructive-soft",
                  )}
                >
                  <span className="text-xl" aria-hidden="true">
                    {s.icon}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="break-words text-sm font-bold leading-tight text-foreground">{lang === "ta" ? s.ta : s.en}</span>
                    <span className={cn("text-xs font-bold", on ? "text-primary-strong" : "text-destructive-strong")}>
                      {on ? `● ${t("inStock")}` : `○ ${t("outStock")}`}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border">
          <h2 className="mb-2 text-base font-bold">🪪 {t("myCard")}</h2>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="truncate text-lg font-extrabold">{card.name}</p>
              <p className="text-sm text-muted-foreground">
                <span className="font-mono font-semibold text-secondary-foreground">{card.card}</span> · 📱 {card.mobile}
              </p>
            </div>
            <div
              className={cn(
                "rounded-xl px-3 py-2.5 text-center ring-1",
                collected ? "bg-primary-soft text-primary-strong ring-primary-border" : "bg-warning-soft text-warning-strong ring-warning-border",
              )}
            >
              <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{t("collectionStatus")}</p>
              <p className="text-base font-extrabold">
                {collected ? `✅ ${t("collectedLong", collectedDate)}` : `⏳ ${t("pendingLong")}`}
              </p>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-2 rounded-2xl bg-ink-2 p-4 text-ink-foreground shadow-sm">
          <button
            type="button"
            onClick={enableAlerts}
            disabled={alertsOn}
            className="rounded-xl bg-primary px-4 py-2.5 font-bold text-primary-foreground hover:bg-primary-hover disabled:opacity-80"
          >
            {alertsOn ? t("alertsOn") : t("enableAlerts")}
          </button>
          <p className="text-xs text-ink-muted">ℹ️ {t("alertsNote")}</p>
        </section>

        {shop && (shop.mobile || shop.taluk || shop.ward) && (
          <section className="rounded-2xl bg-card p-4 text-sm shadow-sm ring-1 ring-border">
            <h2 className="mb-1.5 text-base font-bold">📞 {t("shopContact")}</h2>
            {shop.mobile && (
              <a href={`tel:${shop.mobile}`} className="font-bold text-primary-strong hover:underline">
                {shop.mobile}
              </a>
            )}
            <p className="text-muted-foreground">{[shop.ward, shop.taluk, shop.district].filter(Boolean).join(", ")}</p>
          </section>
        )}
      </main>
    </div>
  );
}

function TimingCard({ icon, label, from, to }: { icon: string; label: string; from: string; to: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-muted px-3 py-2.5 ring-1 ring-border sm:flex-col sm:items-start sm:gap-0.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <span aria-hidden="true">{icon}</span> {label}
      </p>
      <p className="whitespace-nowrap text-base font-extrabold tabular-nums sm:text-lg">
        {from} – {to}
      </p>
    </div>
  );
}
