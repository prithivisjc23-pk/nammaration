import { useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { resetCardholderPassword } from "@/lib/cardholder.functions";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/hooks/use-lang";
import {
  STOCK_ITEMS,
  countCustomers,
  isValidCard,
  isValidMobile,
  normCard,
  normalizeCard,
  normalizeMobile,
  sortRegistry,
  type SmsType,
  type StockState,
} from "@/lib/ration";
import type { Customer, SmsLog } from "@/lib/shop-data";
import { cn } from "@/lib/utils";
import { CounterGrid, CustomerRow } from "./parts";

const contentCls = "w-[calc(100%-2rem)] max-w-md gap-4 rounded-2xl border-0 bg-card p-5 shadow-2xl sm:rounded-2xl";
const inputCls =
  "rounded-xl border border-input bg-card px-3 py-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/30";

export function AddCustomerDialog({
  open,
  onOpenChange,
  shopId,
  customers,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  shopId: string;
  customers: Customer[];
  onSaved: (c: Customer) => void;
}) {
  const { t } = useLang();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mobile, setMobile] = useState("");

  const change = (o: boolean) => {
    if (o) {
      setError(null);
      setMobile("");
    }
    onOpenChange(o);
  };

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const card = normalizeCard(String(f.get("card") ?? ""));
    const name = String(f.get("name") ?? "").trim().replace(/\s+/g, " ");
    const mob = normalizeMobile(mobile);
    if (!card || !name || !mob) return setError(t("eRequired"));
    if (!isValidCard(card)) return setError(t("eCard"));
    if (!isValidMobile(mob)) return setError(t("eMobile"));
    if (customers.some((c) => c.card_norm === normCard(card))) return setError(t("eDupCard"));
    if (customers.some((c) => c.mobile === mob)) return setError(t("eDupMobile"));
    setBusy(true);
    const { data, error: err } = await supabase
      .from("customers")
      .insert({ shop_id: shopId, card, card_norm: normCard(card), name: name.slice(0, 60), mobile: mob })
      .select()
      .single();
    setBusy(false);
    if (err || !data) {
      if (err?.code === "23505") return setError(t(err.message.includes("mobile") ? "eDupMobile" : "eDupCard"));
      return setError(t("tError"));
    }
    form.reset();
    setMobile("");
    setError(null);
    onOpenChange(false);
    onSaved(data);
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent className={contentCls}>
        <div>
          <DialogTitle className="text-lg font-bold text-foreground">{t("addTitle")}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">{t("addSub")}</DialogDescription>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-secondary-foreground">{t("fCard")}</span>
            <input name="card" required autoComplete="off" placeholder="33/G/0123456" className={cn(inputCls, "uppercase tracking-wide")} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-secondary-foreground">{t("fName")}</span>
            <input name="name" required autoComplete="off" maxLength={60} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-secondary-foreground">{t("fMobile")}</span>
            <input
              name="mobile"
              required
              inputMode="numeric"
              autoComplete="off"
              maxLength={10}
              placeholder="9876543210"
              value={mobile}
              onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
              className={cn(inputCls, "tracking-wider")}
            />
          </label>
          {error && (
            <p className="rounded-lg bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive-strong" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-primary px-4 py-3.5 text-base font-bold text-primary-foreground shadow-sm hover:bg-primary-hover disabled:opacity-60"
          >
            {busy ? "…" : t("saveCustomer")}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type Filter = "all" | "pending" | "collected";

export function RegistryDialog({
  open,
  onOpenChange,
  customers,
  onCollect,
  onResetPassword,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  customers: Customer[];
  onCollect: (c: Customer) => void;
  onResetPassword: (c: Customer) => void;
}) {
  const { t } = useLang();
  const [filter, setFilter] = useState<Filter>("all");
  const items = sortRegistry(
    customers.filter((c) => filter === "all" || (filter === "pending" ? c.status !== "collected" : c.status === "collected")),
  );
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) setFilter("all");
        onOpenChange(o);
      }}
    >
      <DialogContent className={cn(contentCls, "flex max-h-[85vh] max-w-2xl flex-col gap-0 p-0")}>
        <div className="border-b border-border p-5">
          <DialogTitle className="text-lg font-bold text-foreground">{t("registryTitle")}</DialogTitle>
          <DialogDescription className="sr-only">{t("registryTitle")}</DialogDescription>
        </div>
        <div className="flex flex-col gap-4 p-5 pb-3">
          <CounterGrid counts={countCustomers(customers)} />
          <div className="flex gap-2" role="tablist">
            {(["all", "pending", "collected"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={filter === k}
                onClick={() => setFilter(k)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-semibold",
                  filter === k ? "bg-highlight text-highlight-foreground shadow-sm" : "bg-secondary text-secondary-foreground hover:bg-border",
                )}
              >
                {t(k)}
              </button>
            ))}
          </div>
        </div>
        <ul className="scroll-thin flex-1 overflow-y-auto px-5 pb-5">
          {items.length ? (
            items.map((c) => (
              <CustomerRow
                key={c.id}
                customer={c}
                onCollect={onCollect}
                className="my-2"
                extra={
                  c.user_id ? (
                    <button
                      type="button"
                      onClick={() => onResetPassword(c)}
                      className="mt-1 text-xs font-semibold text-primary-strong hover:underline"
                    >
                      🔑 {t("resetPortalPw")}
                    </button>
                  ) : null
                }
              />
            ))
          ) : (
            <li className="py-8 text-center text-sm text-muted-foreground">{t("emptyRegistry")}</li>
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

export function HistoryDialog({
  open,
  onOpenChange,
  logs,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  logs: SmsLog[];
}) {
  const { t, lang } = useLang();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(contentCls, "flex max-h-[85vh] max-w-lg flex-col gap-0 p-0")}>
        <div className="border-b border-border p-5">
          <DialogTitle className="text-lg font-bold text-foreground">{t("historyTitle")}</DialogTitle>
          <DialogDescription className="sr-only">{t("historyTitle")}</DialogDescription>
        </div>
        <ul className="scroll-thin flex flex-1 flex-col gap-2 overflow-y-auto p-5 text-sm">
          {!logs.length && <li className="py-8 text-center text-muted-foreground">{t("noSms")}</li>}
          {logs.map((l) => {
            const time = new Date(l.created_at).toLocaleString(lang === "ta" ? "ta-IN" : "en-IN", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            });
            return (
              <li key={l.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2.5 ring-1 ring-border">
                <span className="text-foreground">
                  {l.type === "morning" ? "🚀" : "🌙"}{" "}
                  <span className="font-semibold">{t(l.type === "morning" ? "morning" : "evening")}</span> ·{" "}
                  <span className="text-muted-foreground">{time}</span>
                </span>
                <span className="shrink-0 font-bold tabular-nums text-primary-strong">{t("sentTo", l.recipient_count)}</span>
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

export function ResetDialog({
  open,
  onOpenChange,
  total,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  total: number;
  onConfirm: () => Promise<unknown> | void;
}) {
  const { t } = useLang();
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={contentCls}>
        <DialogTitle className="text-lg font-bold text-foreground">{t("resetTitle")}</DialogTitle>
        <DialogDescription className="text-sm leading-relaxed text-secondary-foreground">{t("resetBody", total)}</DialogDescription>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-xl border border-input px-4 py-3 font-semibold text-secondary-foreground hover:bg-muted"
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onConfirm();
              setBusy(false);
            }}
            className="rounded-xl bg-warning px-4 py-3 font-bold text-warning-foreground hover:bg-warning-hover disabled:opacity-60"
          >
            {busy ? "…" : t("confirmReset")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ConfirmSmsDialog({
  type,
  pending,
  stock,
  onCancel,
  onEditStock,
  onConfirm,
}: {
  type: SmsType | null;
  pending: number;
  stock: StockState;
  onCancel: () => void;
  onEditStock: () => void;
  onConfirm: (type: SmsType) => void;
}) {
  const { t, lang } = useLang();
  return (
    <Dialog open={!!type} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className={contentCls}>
        <DialogTitle className="text-lg font-bold text-foreground">{t("confirmTitle")}</DialogTitle>
        <DialogDescription className="sr-only">{t("confirmTitle")}</DialogDescription>
        <dl className="flex flex-col gap-3 text-sm">
          <div className="flex items-center justify-between gap-3 rounded-xl bg-muted px-3 py-2.5 ring-1 ring-border">
            <dt className="font-semibold text-muted-foreground">{t("alertType")}</dt>
            <dd className="text-right font-bold text-foreground">{t(type === "evening" ? "typeEvening" : "typeMorning")}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl bg-warning-soft px-3 py-2.5 ring-1 ring-warning-border">
            <dt className="font-semibold text-warning-strong">{t("targetRecipients")}</dt>
            <dd className="text-xl font-extrabold tabular-nums text-warning-strong">{pending.toLocaleString("en-IN")}</dd>
          </div>
          <div className="flex flex-col gap-2">
            <dt className="font-semibold text-muted-foreground">{t("stockPreview")}</dt>
            <dd>
              <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {STOCK_ITEMS.map((s) => {
                  const on = stock[s.key];
                  return (
                    <li
                      key={s.key}
                      className={cn(
                        "flex items-center justify-between gap-2 rounded-lg px-3 py-2 ring-1",
                        on ? "bg-success-soft ring-success-border" : "bg-destructive-soft ring-destructive-border",
                      )}
                    >
                      <span className="font-semibold text-foreground">
                        <span aria-hidden="true">{s.icon}</span> {lang === "ta" ? s.ta : s.en}
                      </span>
                      <span className={cn("text-xs font-bold", on ? "text-success-strong" : "text-destructive-hover")}>
                        {on ? t("inStock") : t("outStock")}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </dd>
          </div>
        </dl>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={onEditStock}
            className="rounded-xl border border-input px-4 py-3 font-semibold text-secondary-foreground hover:bg-muted"
          >
            {t("editStock")}
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => type && onConfirm(type)}
            className="rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground hover:bg-primary-hover"
          >
            {t("confirmSend")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export type DispatchState = {
  type: SmsType;
  total: number;
  sent: number;
  done: boolean;
  message: string;
  recipientIds: string[];
};

export function SmsDispatchDialog({ state, onClose }: { state: DispatchState | null; onClose: () => void }) {
  const { t } = useLang();
  const sending = !!state && !state.done;
  const pct = state ? Math.round((state.sent / Math.max(1, state.total)) * 100) : 0;
  return (
    <Dialog open={!!state} onOpenChange={(o) => !o && !sending && onClose()}>
      <DialogContent
        className={cn(contentCls, "max-w-lg")}
        onInteractOutside={(e) => sending && e.preventDefault()}
        onEscapeKeyDown={(e) => sending && e.preventDefault()}
      >
        {state && (
          <>
            <DialogTitle className="pr-6 text-lg font-bold text-foreground">
              {state.type === "morning" ? "🚀" : "🌙"} {t(state.type === "morning" ? "smsMorning" : "smsEvening")}
            </DialogTitle>
            <DialogDescription className="sr-only">{t("msgPreview")}</DialogDescription>
            <div className="rounded-xl bg-ink p-4 text-sm leading-relaxed text-ink-foreground">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-highlight">{t("msgPreview")}</p>
              <p className="whitespace-pre-line">{state.message}</p>
            </div>
            {!state.done ? (
              <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted p-4">
                <p className="flex items-baseline justify-between gap-3">
                  <span id="sms-status" className="text-base font-bold text-secondary-foreground">
                    {t("sending")}
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-muted-foreground">{pct}%</span>
                </p>
                <p className="text-center text-4xl font-extrabold tabular-nums text-foreground">
                  {state.sent.toLocaleString("en-IN")} / {state.total.toLocaleString("en-IN")}
                </p>
                <div
                  className="h-5 w-full overflow-hidden rounded-full bg-border"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={pct}
                  aria-labelledby="sms-status"
                >
                  <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-col items-center gap-1 rounded-xl bg-success-soft p-5 text-center ring-1 ring-success-border" role="status">
                  <p className="text-4xl" aria-hidden="true">
                    ✅
                  </p>
                  <p className="text-lg font-extrabold text-success-strong">
                    {t("summaryTitle", state.total.toLocaleString("en-IN"))}
                  </p>
                  <p className="text-sm font-medium text-success-strong">({t("summarySub")})</p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl bg-ink px-4 py-3 font-bold text-ink-foreground hover:bg-ink-3"
                >
                  {t("close")}
                </button>
              </>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ResetCardPasswordDialog({ customer, onClose }: { customer: Customer | null; onClose: () => void }) {
  const { t } = useLang();
  const reset = useServerFn(resetCardholderPassword);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!customer) return;
    const password = String(new FormData(e.currentTarget).get("password") ?? "");
    if (password.length < 6) return setError(t("ePass"));
    setBusy(true);
    setError(null);
    try {
      const res = await reset({ data: { customerId: customer.id, password } });
      if (!res.ok) return setError(t("eGeneric"));
      toast.success(`🔑 ${t("tPwReset")}`);
      onClose();
    } catch {
      setError(t("eGeneric"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!customer} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={contentCls}>
        <DialogTitle className="text-lg font-bold text-foreground">{customer ? t("newPwFor", customer.name) : ""}</DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">{customer?.card}</DialogDescription>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <input name="password" type="text" minLength={6} required autoComplete="off" className={inputCls} placeholder={t("newPassword")} />
          {error && (
            <p className="rounded-lg bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive-strong" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
          >
            {busy ? "…" : t("savePassword")}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
