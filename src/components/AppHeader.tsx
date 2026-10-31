import { useLang } from "@/hooks/use-lang";
import { BrandMark, Elephant, LangToggle, ThemeToggle } from "@/components/LangToggle";

/** Sticky top bar shared by the shopkeeper dashboard and the cardholder portal. Stays one row on phones. */
export function AppHeader({
  title,
  subtitle,
  onLogout,
  maxWidth = "max-w-7xl",
}: {
  title: string;
  subtitle: string;
  onLogout: () => void;
  maxWidth?: string;
}) {
  const { t } = useLang();
  return (
    <header className="sticky top-0 z-30 overflow-hidden border-b-2 border-highlight bg-ink pt-[env(safe-area-inset-top)] text-ink-foreground shadow-lg">
      <Elephant className="pointer-events-none absolute -bottom-3 left-1/2 h-20 w-28 -translate-x-1/2 text-ink-foreground opacity-[0.07]" />
      <div className={`relative mx-auto grid ${maxWidth} grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4`}>
        <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
          <BrandMark className="h-8 w-8 rounded-lg sm:h-10 sm:w-10 sm:rounded-xl" />
          <div className="min-w-0">
            <p className="truncate text-sm font-extrabold leading-tight sm:text-base">{title}</p>
            <p className="truncate text-xs text-ink-muted">{subtitle}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <ThemeToggle />
          <LangToggle dark />
          <button
            type="button"
            onClick={onLogout}
            aria-label={t("logout")}
            title={t("logout")}
            className="rounded-lg bg-ink-2 px-2 py-1.5 text-sm font-semibold text-ink-foreground hover:bg-ink-3 sm:px-2.5"
          >
            <span aria-hidden="true">🚪</span>
            <span className="ml-1 hidden sm:inline">{t("logout")}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
