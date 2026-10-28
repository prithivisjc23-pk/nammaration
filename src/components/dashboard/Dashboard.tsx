import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/hooks/use-lang";
import { BrandMark, LangToggle } from "@/components/LangToggle";
import {
  CROWD,
  STOCK_ITEMS,
  buildSmsMessage,
  countCustomers,
  isSmsLocked,
  monthKey,
  monthLabel,
  parseStock,
  searchCustomers,
  type CrowdLevel,
  type SmsType,
  type StockKey,
} from "@/lib/ration";
import { customersQuery, shopQuery, smsLogsQuery, type Customer, type Shop } from "@/lib/shop-data";
import { cn } from "@/lib/utils";
import {
  AddCustomerDialog,
  ConfirmSmsDialog,
  HistoryDialog,
  RegistryDialog,
  ResetDialog,
  SmsDispatchDialog,
  type DispatchState,
} from "./dialogs";
import { CounterGrid, CustomerRow } from "./parts";

export function Dashboard({ userId }: { userId: string }) {
  const { t } = useLang();
  const shopQ = useQuery(shopQuery(userId));
  const logout = useLogout();

  if (shopQ.isPending) {
    return <CenteredNote>{t("loading")}</CenteredNote>;
  }
  if (shopQ.isError || !shopQ.data) {
    return (
      <CenteredNote>
        <p className="font-bold text-foreground">{shopQ.isError ? t("eGeneric") : t("noShop")}</p>
        {!shopQ.isError && <p className="text-sm text-muted-foreground">{t("noShopSub")}</p>}
        <button
          type="button"
          onClick={logout}
          className="mt-3 rounded-xl bg-ink px-4 py-2.5 text-sm font-bold text-ink-foreground"
        >
          🚪 {t("logout")}
        </button>
      </CenteredNote>
    );
  }
  return <ShopDashboard shop={shopQ.data} userId={userId} />;
}

function CenteredNote({ children }: { children: ReactNode }) {
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

function ShopDashboard({ shop, userId }: { shop: Shop; userId: string }) {
  const { t, lang, bi } = useLang();
  const qc = useQueryClient();
  const logout = useLogout();
  const custQ = useQuery(customersQuery(shop.id));
  const smsQ = useQuery(smsLogsQuery(shop.id));
  const customers = useMemo(() => custQ.data ?? [], [custQ.data]);
  const smsLogs = smsQ.data ?? [];
  const stock = parseStock(shop.stock);
  const crowd = shop.crowd as CrowdLevel;
  const counts = countCustomers(customers);

  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [registryOpen, setRegistryOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [confirmType, setConfirmType] = useState<SmsType | null>(null);
  const [dispatch, setDispatch] = useState<DispatchState | null>(null);
  const stockRef = useRef<HTMLDivElement>(null);

  const shopKey = shopQuery(userId).queryKey;
  const custKey = customersQuery(shop.id).queryKey;

  async function updateShop(patch: Partial<Pick<Shop, "is_open" | "crowd" | "stock" | "cycle">>) {
    qc.setQueryData(shopKey, (old) => (old ? { ...old, ...patch } : old));
    const { error } = await supabase.from("shops").update(patch).eq("id", shop.id);
    if (error) {
      toast.error(t("tError"));
      qc.invalidateQueries({ queryKey: shopKey });
    }
  }

  async function markCollected(c: Customer) {
    if (c.status === "collected") return;
    const collectedAt = new Date().toISOString();
    qc.setQueryData(custKey, (old) =>
      old?.map((x) => (x.id === c.id ? { ...x, status: "collected", collected_at: collectedAt } : x)),
    );
    const { error } = await supabase
      .from("customers")
      .update({ status: "collected", collected_at: collectedAt })
      .eq("id", c.id)
      .eq("status", "pending");
    if (error) {
      toast.error(t("tError"));
      qc.invalidateQueries({ queryKey: custKey });
      return;
    }
    toast.success(`✅ ${t("tCollected", c.name)}`);
  }

  async function monthReset() {
    const { error } = await supabase
      .from("customers")
      .update({ status: "pending", collected_at: null })
      .eq("shop_id", shop.id)
      .eq("status", "collected");
    if (error) return toast.error(t("tError"));
    await updateShop({ cycle: monthKey() });
    await qc.invalidateQueries({ queryKey: custKey });
    setResetOpen(false);
    toast.success(`🔄 ${t("tReset")}`);
  }

  function openSms(type: SmsType) {
    if (dispatch && !dispatch.done) return;
    if (isSmsLocked(type, shop.is_open)) {
      toast.error(`🔒 ${t(type === "morning" ? "lockMorning" : "lockEvening")}`);
      return;
    }
    if (!counts.pending) {
      toast.error(`⚠️ ${t("tNoPending")}`);
      return;
    }
    setConfirmType(type);
  }

  function startDispatch(type: SmsType) {
    setConfirmType(null);
    if (isSmsLocked(type, shop.is_open)) return;
    const targets = customers.filter((c) => c.status !== "collected");
    if (!targets.length) return void toast.error(`⚠️ ${t("tNoPending")}`);
    setDispatch({
      type,
      total: targets.length,
      sent: 0,
      done: false,
      message: buildSmsMessage(type, { shopNumber: shop.shop_number, isOpen: shop.is_open, crowd, stock }),
      recipientIds: targets.map((c) => c.id),
    });
  }

  // Simulated bulk dispatch progress, then record the dispatch in SMS history.
  useEffect(() => {
    if (!dispatch || dispatch.done) return;
    const { total } = dispatch;
    const duration = Math.min(4000, Math.max(1200, total * 4));
    let start = 0;
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    const frame = () => {
      if (cancelled) return;
      const now = performance.now();
      if (!start) start = now;
      const sent = Math.min(total, Math.floor(((now - start) / duration) * total));
      setDispatch((d) => (d ? { ...d, sent } : d));
      if (sent < total) {
        timer = setTimeout(frame, 40);
        return;
      }
      void (async () => {
        const { error } = await supabase.from("sms_logs").insert({
          shop_id: shop.id,
          type: dispatch.type,
          recipient_count: total,
          recipient_ids: dispatch.recipientIds,
          message: dispatch.message,
        });
        setDispatch((d) => (d ? { ...d, sent: total, done: true } : d));
        if (error) {
          toast.error(t("tError"));
          return;
        }
        qc.invalidateQueries({ queryKey: smsLogsQuery(shop.id).queryKey });
        toast.success(`📨 ${t("tSent", total)}`);
      })();
    };
    timer = setTimeout(frame, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // Run once per dispatch start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch?.recipientIds]);

  const today = new Date().toLocaleDateString(lang === "ta" ? "ta-IN" : "en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const results = searchCustomers(customers, search);
  const dispatching = !!dispatch && !dispatch.done;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 bg-ink text-ink-foreground shadow-lg">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <BrandMark className="h-10 w-10 rounded-xl text-xl" />
            <div className="min-w-0">
              <p className="truncate text-base font-extrabold leading-tight">{t("appName")}</p>
              <p className="truncate text-xs text-ink-muted">
                {t("shop")} #{shop.shop_number} · {shop.district} · {shop.taluk}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LangToggle dark />
            <button
              type="button"
              onClick={logout}
              className="rounded-lg bg-ink-2 px-3 py-1.5 text-sm font-semibold text-ink-foreground hover:bg-destructive-hover"
            >
              🚪 {t("logout")}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-secondary-foreground">
            📅 <time dateTime={new Date().toISOString().slice(0, 10)}>{today}</time>
          </p>
          <p className="text-xs font-medium text-muted-foreground">
            {t("cycle")}: <span className="font-bold text-secondary-foreground">{monthLabel(shop.cycle, lang)}</span> ·{" "}
            {shop.ward}
          </p>
        </div>

        {shop.cycle !== monthKey() && (
          <div
            className="flex flex-col gap-3 rounded-2xl bg-warning-mid p-4 text-warning-strong ring-1 ring-warning-border sm:flex-row sm:items-center sm:justify-between"
            role="alert"
          >
            <p className="text-sm font-semibold">📆 {t("newMonthBanner")}</p>
            <button
              type="button"
              onClick={() => setResetOpen(true)}
              className="shrink-0 rounded-lg bg-warning px-4 py-2 text-sm font-bold text-warning-foreground hover:bg-warning-hover"
            >
              🔄 {t("resetMonth")}
            </button>
          </div>
        )}

        <CounterGrid counts={counts} />

        <div className="grid gap-5 lg:grid-cols-2">
          <section className="flex flex-col gap-5 rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border" aria-labelledby="h-controls">
            <h2 id="h-controls" className="text-base font-bold text-foreground">
              {t("dailyControls")}
            </h2>
            <button
              type="button"
              role="switch"
              aria-checked={shop.is_open}
              onClick={() => updateShop({ is_open: !shop.is_open })}
              className={cn(
                "flex w-full items-center justify-between gap-4 rounded-2xl px-5 py-5 text-left text-primary-foreground shadow-md transition",
                shop.is_open ? "bg-primary hover:bg-primary-hover" : "bg-destructive hover:bg-destructive-hover",
              )}
            >
              <span className="flex flex-col">
                <span className="text-xl font-extrabold tracking-wide sm:text-2xl">
                  {shop.is_open ? "🟢" : "🔴"} {shop.is_open ? t("shopOpen") : t("shopClosed")}
                </span>
                <span className="text-xs font-medium opacity-90">
                  {shop.is_open ? bi("கடை திறந்துள்ளது", "SHOP OPEN") : bi("கடை மூடப்பட்டது", "SHOP CLOSED")} ·{" "}
                  {t("tapToggle")}
                </span>
              </span>
              <span className="relative h-9 w-16 shrink-0 rounded-full bg-primary-foreground/30" aria-hidden="true">
                <span
                  className={cn(
                    "absolute top-1 h-7 w-7 rounded-full bg-primary-foreground shadow transition-all",
                    shop.is_open ? "left-8" : "left-1",
                  )}
                />
              </span>
            </button>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-secondary-foreground">{t("crowdLevel")}</h3>
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t("crowdLevel")}>
                {(Object.keys(CROWD) as CrowdLevel[]).map((k) => {
                  const on = crowd === k;
                  const onCls = {
                    low: "bg-primary text-primary-foreground border-primary",
                    medium: "bg-warning text-warning-foreground border-warning",
                    heavy: "bg-destructive text-destructive-foreground border-destructive",
                  }[k];
                  return (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => updateShop({ crowd: k })}
                      className={cn(
                        "rounded-xl border-2 px-2 py-3 text-sm font-bold transition",
                        on ? onCls : "border-border bg-muted text-secondary-foreground hover:border-input",
                      )}
                    >
                      {CROWD[k][lang]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-secondary-foreground">{t("stock")}</h3>
              <div ref={stockRef} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {STOCK_ITEMS.map((s) => {
                  const on = stock[s.key];
                  return (
                    <button
                      key={s.key}
                      type="button"
                      aria-pressed={on}
                      onClick={() => updateShop({ stock: { ...stock, [s.key as StockKey]: !on } })}
                      className={cn(
                        "flex items-center gap-2 rounded-xl border-2 px-3 py-3 text-left transition",
                        on ? "border-primary-border bg-primary-soft" : "border-border bg-muted opacity-80",
                      )}
                    >
                      <span className="text-xl" aria-hidden="true">
                        {s.icon}
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="break-words text-sm font-bold leading-tight text-foreground">{s.ta}</span>
                        <span className="text-xs font-medium text-muted-foreground">{s.en}</span>
                        <span className={cn("text-xs font-semibold", on ? "text-primary-strong" : "text-destructive-hover")}>
                          {on ? `● ${t("inStock")}` : `○ ${t("outStock")}`}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-4 rounded-2xl bg-ink-2 p-5 text-ink-foreground shadow-sm" aria-labelledby="h-sms">
            <h2 id="h-sms" className="text-base font-bold">
              {t("smsPanel")}
            </h2>
            <p
              className="rounded-xl bg-primary/15 px-3 py-2.5 text-sm font-bold text-primary-glow ring-1 ring-primary/40"
              aria-live="polite"
            >
              🎯 {t("target", counts.pending)}
            </p>
            {(["morning", "evening"] as const).map((type) => {
              const locked = isSmsLocked(type, shop.is_open);
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => openSms(type)}
                  disabled={dispatching}
                  aria-disabled={locked}
                  title={locked ? t(type === "morning" ? "lockMorning" : "lockEvening") : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-4 py-4 text-left font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50",
                    type === "morning" ? "bg-primary hover:bg-primary-hover" : "bg-evening hover:bg-evening-hover",
                    locked ? "cursor-not-allowed opacity-40 grayscale" : "shadow",
                  )}
                >
                  <span className="text-2xl" aria-hidden="true">
                    {type === "morning" ? "🚀" : "🌙"}
                  </span>
                  <span className="flex flex-1 flex-col">
                    <span>{t(type === "morning" ? "smsMorning" : "smsEvening")}</span>
                    <span className="text-xs font-medium opacity-80">
                      {type === "morning"
                        ? bi("காலை SMS அறிவிப்பு", "Morning SMS Alert")
                        : bi("மாலை SMS அறிவிப்பு", "Evening Close SMS Alert")}
                    </span>
                  </span>
                  <span className="text-xl" aria-hidden="true">
                    {locked ? "🔒" : ""}
                  </span>
                </button>
              );
            })}
            <p className="rounded-lg bg-ink-3/60 px-3 py-2 text-xs font-semibold text-ink-foreground" aria-live="polite">
              {shop.is_open ? "🟢" : "🔴"} {t(shop.is_open ? "lockedHintOpen" : "lockedHintClosed")}
            </p>
            <p className="text-xs text-ink-muted">ℹ️ {t("smsNote")}</p>
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              className="rounded-xl border border-ink-3 px-4 py-3 text-sm font-semibold text-ink-foreground hover:bg-ink-3"
            >
              📜 {t("viewHistory")} ({smsLogs.length})
            </button>
          </section>
        </div>

        <section className="flex flex-col gap-4 rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border" aria-labelledby="h-cust">
          <h2 id="h-cust" className="text-base font-bold text-foreground">
            {t("customers")}
          </h2>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg" aria-hidden="true">
              🔍
            </span>
            <label htmlFor="search" className="sr-only">
              {t("searchPh")}
            </label>
            <input
              id="search"
              type="search"
              autoComplete="off"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchPh")}
              className="w-full rounded-xl border-2 border-border bg-muted py-4 pl-11 pr-4 text-base outline-none focus:border-primary focus:bg-card"
            />
          </div>
          <div className="flex flex-col gap-2" aria-live="polite">
            {search.trim().length < 2 ? (
              <p className="text-sm text-muted-foreground">{t("searchHint")}</p>
            ) : results.length ? (
              <ul className="flex flex-col gap-2">
                {results.map((c) => (
                  <CustomerRow key={c.id} customer={c} onCollect={markCollected} />
                ))}
              </ul>
            ) : (
              <p className="rounded-xl bg-muted px-3 py-3 text-sm text-muted-foreground">{t("noMatch")}</p>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="rounded-xl bg-primary px-4 py-3.5 font-bold text-primary-foreground shadow-sm hover:bg-primary-hover"
            >
              ➕ {t("registerCustomer")}
            </button>
            <button
              type="button"
              onClick={() => setRegistryOpen(true)}
              className="rounded-xl bg-ink px-4 py-3.5 font-bold text-ink-foreground shadow-sm hover:bg-ink-3"
            >
              👥 {t("viewAll")} ({counts.pending}/{counts.total})
            </button>
            <button
              type="button"
              onClick={() => setResetOpen(true)}
              className="rounded-xl border-2 border-warning-border bg-warning-soft px-4 py-3.5 font-bold text-warning-strong hover:bg-warning-mid"
            >
              🔄 {t("resetMonth")}
            </button>
          </div>
        </section>
      </main>

      <AddCustomerDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        shopId={shop.id}
        customers={customers}
        onSaved={(c) => {
          qc.setQueryData(custKey, (old) => [...(old ?? []), c]);
          toast.success(`➕ ${t("tSaved")}`);
        }}
      />
      <RegistryDialog open={registryOpen} onOpenChange={setRegistryOpen} customers={customers} onCollect={markCollected} />
      <HistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} logs={smsLogs} />
      <ResetDialog open={resetOpen} onOpenChange={setResetOpen} total={counts.total} onConfirm={monthReset} />
      <ConfirmSmsDialog
        type={confirmType}
        pending={counts.pending}
        stock={stock}
        onCancel={() => setConfirmType(null)}
        onEditStock={() => {
          setConfirmType(null);
          stockRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
          stockRef.current?.querySelector("button")?.focus({ preventScroll: true });
        }}
        onConfirm={startDispatch}
      />
      <SmsDispatchDialog state={dispatch} onClose={() => setDispatch(null)} />
    </div>
  );
}
