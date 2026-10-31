import { useLang } from "@/hooks/use-lang";
import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";

export function LangToggle({ dark = false }: { dark?: boolean }) {
  const { lang, setLang } = useLang();
  const btn = (value: "ta" | "en", label: string) => (
    <button
      type="button"
      onClick={() => setLang(value)}
      aria-pressed={lang === value}
      className={cn(
        "rounded-md px-2 py-1 sm:px-2.5",
        lang === value
          ? "bg-highlight text-highlight-foreground shadow-sm"
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
      className={cn("inline-flex rounded-lg p-0.5 text-sm font-semibold sm:p-1", dark ? "bg-ink-2" : "bg-border")}
      role="group"
      aria-label="Language"
    >
      {btn("ta", "தமிழ்")}
      {btn("en", "Eng")}
    </div>
  );
}

/** Side-view elephant silhouette drawn in currentColor. */
export function Elephant({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 48" fill="currentColor" className={className} aria-hidden="true" focusable="false">
      <path d="M8 19c-2.5 2-3.6 5.4-3.2 9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <ellipse cx="25" cy="22" rx="17.5" ry="12.5" />
      <circle cx="43.5" cy="17.5" r="10" />
      <path
        d="M50 21.5c3.6 4 5.1 9.4 4.2 14.6-.3 1.8 1.6 2.9 3 1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <rect x="10.5" y="27" width="7" height="17" rx="2.5" />
      <rect x="20" y="29" width="7" height="15" rx="2.5" />
      <rect x="30" y="29" width="7" height="15" rx="2.5" />
      <rect x="38.5" y="25" width="7" height="19" rx="2.5" />
      <ellipse cx="39.5" cy="18.5" rx="5.5" ry="8" opacity="0.45" />
      <path d="M48 25.5c1.8 1.8 4.4 2.4 6.6 1.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.55" />
      <circle cx="46.5" cy="14.5" r="1.2" opacity="0.4" />
    </svg>
  );
}

/** Crimson badge with a gold elephant and a faint elephant watermark behind it. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-brand text-brand-gold shadow-md ring-2 ring-brand-gold/80",
        className,
      )}
      aria-hidden="true"
    >
      <Elephant className="absolute -bottom-1.5 -right-3 h-[90%] w-[90%] -scale-x-100 opacity-[0.14]" />
      <Elephant className="relative h-[68%] w-[68%]" />
    </div>
  );
}

export function ThemeToggle() {
  const { dark, toggle } = useTheme();
  const { t } = useLang();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={dark}
      aria-label={t("themeToggle")}
      title={t("themeToggle")}
      className="rounded-lg bg-ink-2 px-2 py-1.5 text-sm text-ink-foreground hover:bg-ink-3 sm:px-2.5"
    >
      {dark ? "☀️" : "🌙"}
    </button>
  );
}
