import { useLang } from "@/hooks/use-lang";
import type { Customer } from "@/lib/shop-data";
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
}: {
  customer: Customer;
  onCollect: (c: Customer) => void;
  className?: string;
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
        <p className="truncate font-bold text-foreground">{c.name}</p>
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
