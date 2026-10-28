import type { ReactNode } from "react";
import { useLang } from "@/hooks/use-lang";
import { SHOP_STATUSES, type ShopStatus } from "@/lib/ration";
import type { Customer } from "@/lib/shop-data";
import { cn } from "@/lib/utils";

const tones = {
  slate: "bg-card text-foreground ring-border",
  amber: "bg-warning-soft text-warning-strong ring-warning-border",
  green: "bg-primary-soft text-primary-strong ring-primary-border",
};

function CounterCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: keyof typeof tones;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-x-2 rounded-xl px-2 py-2 text-center shadow-sm ring-1 sm:flex-row sm:py-2.5",
        tones[tone],
      )}
    >
      <p className="text-xl font-extrabold tabular-nums sm:text-2xl">{value}</p>
      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80 sm:text-xs">
        {label}
      </p>
    </div>
  );
}

export function CounterGrid({
  counts,
}: {
  counts: { total: number; pending: number; collected: number };
}) {
  const { t } = useLang();
  return (
    <section className="grid grid-cols-3 gap-2 sm:gap-3" aria-label="Counters">
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
    <li className={cn("@container rounded-xl border border-border bg-card p-3", className)}>
      <div className="flex flex-col gap-2.5 @md:flex-row @md:items-center @md:justify-between">
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
            <span className="font-mono font-semibold text-secondary-foreground">{c.card}</span> · 📱{" "}
            {c.mobile}
          </p>
        </div>
        {pending ? (
          <button
            type="button"
            onClick={() => onCollect(c)}
            className="shrink-0 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-sm hover:bg-primary-hover"
          >
            🌾 {t("markCollected")} <span className="font-medium opacity-90">/ வாங்கியாயிற்று</span>
          </button>
        ) : (
          <span
            className="inline-flex shrink-0 items-center justify-center gap-1 rounded-xl bg-secondary px-4 py-2.5 text-sm font-bold text-primary-strong ring-1 ring-primary-border"
            aria-label={t("collectedBadge")}
          >
            ✅ Collected / வாங்கியாயிற்று
          </span>
        )}
      </div>
    </li>
  );
}

const STATUS_STYLE: Record<
  ShopStatus,
  { icon: string; on: string; key: "statusOpen" | "statusLunch" | "statusClosed" }
> = {
  open: { icon: "🟢", on: "bg-primary text-primary-foreground border-primary", key: "statusOpen" },
  lunch: {
    icon: "🍱",
    on: "bg-warning text-warning-foreground border-warning",
    key: "statusLunch",
  },
  closed: {
    icon: "🔴",
    on: "bg-destructive text-destructive-foreground border-destructive",
    key: "statusClosed",
  },
};

export const statusLabelKey = (s: ShopStatus) => STATUS_STYLE[s].key;
export const statusIcon = (s: ShopStatus) => STATUS_STYLE[s].icon;

export function StatusControl({
  value,
  onChange,
}: {
  value: ShopStatus;
  onChange: (s: ShopStatus) => void;
}) {
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
                "flex flex-col items-center gap-0.5 rounded-xl border-2 px-2 py-2.5 text-center font-extrabold shadow-sm transition",
                on
                  ? STATUS_STYLE[s].on
                  : "border-border bg-muted text-secondary-foreground hover:border-input",
              )}
            >
              <span className="text-xl" aria-hidden="true">
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
