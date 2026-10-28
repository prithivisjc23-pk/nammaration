import { useLang } from "@/hooks/use-lang";
import { cn } from "@/lib/utils";

export function LangToggle({ dark = false }: { dark?: boolean }) {
  const { lang, setLang } = useLang();
  const btn = (value: "ta" | "en", label: string) => (
    <button
      type="button"
      onClick={() => setLang(value)}
      aria-pressed={lang === value}
      className={cn(
        "rounded-md px-2.5 py-1",
        lang === value
          ? "bg-primary text-primary-foreground"
          : dark
            ? "text-ink-muted hover:text-ink-foreground"
            : "text-secondary-foreground",
      )}
    >
      {label}
    </button>
  );
  return (
    <div
      className={cn("inline-flex rounded-lg p-1 text-sm font-semibold", dark ? "bg-ink-2" : "bg-border")}
      role="group"
      aria-label="Language"
    >
      {btn("ta", "தமிழ்")}
      {btn("en", "Eng")}
    </div>
  );
}

export function BrandMark({ className }: { className?: string }) {
  return (
    <div
      className={cn("flex shrink-0 items-center justify-center rounded-2xl bg-primary text-2xl", className)}
      aria-hidden="true"
    >
      🌾
    </div>
  );
}
