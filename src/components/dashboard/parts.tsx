import { useEffect, useState, type ReactNode } from "react";
import { useLang } from "@/hooks/use-lang";
import { SHOP_STATUSES, isValidTimings, type ShopStatus } from "@/lib/ration";
import type { Customer, Shop } from "@/lib/shop-data";
import { cn } from "@/lib/utils";

const tones = {
  slate: "bg-card text-foreground ring-border",
  amber: "bg-warning-soft text-warning-strong ring-warning-border",
  green: "bg-primary-soft text-primary-strong ring-primary-border",
};

function CounterCard({ label, value, tone }: { label: string; value: number; tone: keyof typeof tones }) {
  return (
    <div className={cn("rounded-2xl p-3 text-center shadow-sm ring-1 sm:p-4", tones[tone])}>
      <p className="text-2xl font-extrabold tabular-nums sm:text-3xl">{value}</p>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</p>
    </div>
  );
}

export function CounterGrid({ counts }: { counts: { total: number; pending: number; collected: number } }) {
  const { t } = useLang();
  return (
    <section className="grid grid-cols-3 gap-3" aria-label="Counters">
      <CounterCard label={t("total")} value={counts.total} tone="slate" />
      <CounterCard label={t("pending")} value={counts.pending} tone="amber" />
      <CounterCard label={t("collected")} value={counts.collected} tone="green" />
    </section>
  );
}

export function CustomerRow({
  customer: c,
  onCollect,
  className,
  extra,
}: {
  customer: Customer;
  onCollect: (c: Customer) => void;
  className?: string;
  extra?: ReactNode;
}) {
  const { t } = useLang();
  const pending = c.status !== "collected";
  return (
    <li
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        <p className="flex items-center gap-2 truncate font-bold text-foreground">
          {c.name}
          {c.user_id && (
            <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[11px] font-semibold text-secondary-foreground">
              {t("portalLinked")}
            </span>
          )}
        </p>
        {extra}
        <p className="text-sm text-muted-foreground">
          <span className="font-mono font-semibold text-secondary-foreground">{c.card}</span> · 📱 {c.mobile}
        </p>
      </div>
      {pending ? (
        <button
          type="button"
          onClick={() => onCollect(c)}
          className="shrink-0 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-sm hover:bg-primary-hover"
        >
          🌾 {t("markCollected")} <span className="font-medium opacity-90">/ வாங்கியாயிற்று</span>
        </button>
      ) : (
        <span
          className="inline-flex shrink-0 items-center justify-center gap-1 rounded-xl bg-secondary px-4 py-3 text-sm font-bold text-primary-strong ring-1 ring-primary-border"
          aria-label={t("collectedBadge")}
        >
          ✅ Collected / வாங்கியாயிற்று
        </span>
      )}
    </li>
  );
}

const STATUS_STYLE: Record<ShopStatus, { icon: string; on: string; key: "statusOpen" | "statusLunch" | "statusClosed" }> = {
  open: { icon: "🟢", on: "bg-primary text-primary-foreground border-primary", key: "statusOpen" },
  lunch: { icon: "🍱", on: "bg-warning text-warning-foreground border-warning", key: "statusLunch" },
  closed: { icon: "🔴", on: "bg-destructive text-destructive-foreground border-destructive", key: "statusClosed" },
};

export const statusLabelKey = (s: ShopStatus) => STATUS_STYLE[s].key;
export const statusIcon = (s: ShopStatus) => STATUS_STYLE[s].icon;

export function StatusControl({ value, onChange }: { value: ShopStatus; onChange: (s: ShopStatus) => void }) {
  const { t } = useLang();
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-secondary-foreground">{t("shopStatus")}</h3>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t("shopStatus")}>
        {SHOP_STATUSES.map((s) => {
          const on = value === s;
          return (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => !on && onChange(s)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-2xl border-2 px-2 py-4 text-center font-extrabold shadow-sm transition",
                on ? STATUS_STYLE[s].on : "border-border bg-muted text-secondary-foreground hover:border-input",
              )}
            >
              <span className="text-2xl" aria-hidden="true">
                {STATUS_STYLE[s].icon}
              </span>
              <span className="text-xs leading-tight sm:text-sm">{t(STATUS_STYLE[s].key)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

type TimingPatch = Pick<Shop, "morning_open" | "morning_close" | "evening_open" | "evening_close">;

export function TimingsEditor({ shop, onSave }: { shop: Shop; onSave: (v: TimingPatch) => Promise<void> }) {
  const { t } = useLang();
  const initial: TimingPatch = {
    morning_open: shop.morning_open,
    morning_close: shop.morning_close,
    evening_open: shop.evening_open,
    evening_close: shop.evening_close,
  };
  const [v, setV] = useState<TimingPatch>(initial);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setV({
      morning_open: shop.morning_open,
      morning_close: shop.morning_close,
      evening_open: shop.evening_open,
      evening_close: shop.evening_close,
    });
  }, [shop.morning_open, shop.morning_close, shop.evening_open, shop.evening_close]);
  const dirty = (Object.keys(v) as (keyof TimingPatch)[]).some((k) => v[k] !== initial[k]);

  const input = (k: keyof TimingPatch, label: string) => (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <input
        type="time"
        value={v[k]}
        onChange={(e) => {
          setError(false);
          setV((old) => ({ ...old, [k]: e.target.value }));
        }}
        className="rounded-lg border border-input bg-card px-2 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 dark:[color-scheme:dark]"
      />
    </label>
  );

  return (
    <div className="rounded-xl bg-muted p-3 ring-1 ring-border">
      <h3 className="mb-2 text-sm font-semibold text-secondary-foreground">🕘 {t("timings")}</h3>
      <div className="grid grid-cols-2 gap-3">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-xs font-bold text-foreground">☀️ {t("morningShift")}</legend>
          <div className="grid grid-cols-2 gap-2">
            {input("morning_open", t("opensAt"))}
            {input("morning_close", t("closesAt"))}
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-xs font-bold text-foreground">🌇 {t("eveningShift")}</legend>
          <div className="grid grid-cols-2 gap-2">
            {input("evening_open", t("opensAt"))}
            {input("evening_close", t("closesAt"))}
          </div>
        </fieldset>
      </div>
      {error && (
        <p className="mt-2 rounded-lg bg-destructive-soft px-3 py-2 text-xs font-medium text-destructive-strong" role="alert">
          {t("eTimings")}
        </p>
      )}
      {dirty && (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            const ok = isValidTimings({
              morningOpen: v.morning_open,
              morningClose: v.morning_close,
              eveningOpen: v.evening_open,
              eveningClose: v.evening_close,
            });
            if (!ok) return setError(true);
            setBusy(true);
            await onSave(v);
            setBusy(false);
          }}
          className="mt-3 w-full rounded-lg bg-primary px-3 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
        >
          {busy ? "…" : t("saveTimings")}
        </button>
      )}
    </div>
  );
}
