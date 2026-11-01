import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { CreditCard, Eye, EyeOff, Store } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/hooks/use-lang";
import { LangToggle, ThemeToggle } from "@/components/LangToggle";
import { registerShopkeeper, signInShopkeeper, type ShopkeeperRegisterError } from "@/lib/auth.functions";
import { registerCardholder, type CardholderRegisterError } from "@/lib/cardholder.functions";
import { districtShopsQuery, resolveHome, shopIdPreviewQuery } from "@/lib/shop-data";
import { toast } from "sonner";
import {
  DISTRICTS,
  MIN_PASSWORD,
  cardholderEmail,
  checkNewPassword,
  isValidCard,
  isValidMobile,
  isValidUsername,
  normalizeCard,
  normalizeMobile,
} from "@/lib/ration";
import type { I18nKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const inputCls =
  "w-full rounded-xl border border-input bg-card px-3 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/30";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Role = "shop" | "card";
type Tab = "login" | "register" | "forgot";

const CARD_ERRORS: Record<CardholderRegisterError, I18nKey> = {
  invalid_card: "eCard",
  invalid_mobile: "eMobile",
  invalid_shop: "eShopCode",
  card_taken: "eCardTaken",
  card_other_shop: "eCardOtherShop",
  mobile_mismatch: "eMobileMismatch",
  mobile_taken: "eDupMobile",
  failed: "eGeneric",
};

const SHOP_ERRORS: Record<ShopkeeperRegisterError, I18nKey> = {
  invalid: "eRequired",
  username_taken: "eUserExists",
  weak_password: "ePassWeak",
  failed: "eGeneric",
};

export function AuthScreen() {
  const { t } = useLang();
  const navigate = useNavigate();
  // Phones show one portal at a time; from md up both sit side by side.
  const [role, setRole] = useState<Role>("shop");

  const goHome = async (userId: string) => {
    const home = await resolveHome(userId);
    navigate({ to: home ?? "/dashboard", replace: true });
  };

  // Already signed in (or just returned from the confirmation link) → go to the right home.
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active && data.session) void goHome(data.session.user.id);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // Defer: querying inside the auth callback would deadlock the auth client.
      if (session && event === "SIGNED_IN" && active) setTimeout(() => void goHome(session.user.id), 0);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AuthShell wide>
      <div
        className="mb-4 grid grid-cols-2 gap-1 rounded-xl border border-border bg-secondary p-1 md:hidden"
        role="tablist"
        aria-label={t("signInAs")}
      >
        {(["shop", "card"] as const).map((r) => (
          <button
            key={r}
            type="button"
            role="tab"
            aria-selected={role === r}
            onClick={() => setRole(r)}
            className={cn(
              "relative flex items-center justify-center gap-1.5 rounded-lg px-2 py-2.5 text-sm font-bold transition",
              role === r
                ? "bg-card text-foreground shadow-sm after:absolute after:inset-x-6 after:bottom-1 after:h-0.5 after:rounded-full after:bg-highlight"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {r === "shop" ? <Store className="h-4 w-4" aria-hidden="true" /> : <CreditCard className="h-4 w-4" aria-hidden="true" />}
            {t(r === "shop" ? "roleShop" : "roleCardHolder")}
          </button>
        ))}
      </div>

      <div className="grid items-start gap-4 md:grid-cols-2 md:gap-6">
        <ShopPanel className={cn(role !== "shop" && "hidden md:flex")} />
        <CardPanel className={cn(role !== "card" && "hidden md:flex")} />
      </div>
    </AuthShell>
  );
}

function Panel({
  icon,
  title,
  sub,
  footer,
  className,
  children,
}: {
  icon: ReactNode;
  title: string;
  sub: string;
  footer: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("flex flex-col rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6", className)}>
      <header className="mb-4 flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-extrabold leading-tight text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground">{sub}</p>
        </div>
      </header>
      {children}
      <p className="mt-5 text-center text-xs text-muted-foreground">🔒 {footer}</p>
    </section>
  );
}

function PanelTabs({
  tab,
  onChange,
  registerLabel,
}: {
  tab: Tab;
  onChange: (t: "login" | "register") => void;
  registerLabel: string;
}) {
  const { t } = useLang();
  return (
    <div className="mb-5 flex gap-5 border-b border-border" role="tablist">
      {(["login", "register"] as const).map((k) => (
        <button
          key={k}
          type="button"
          role="tab"
          aria-selected={tab === k}
          onClick={() => onChange(k)}
          className={cn(
            "-mb-px border-b-2 pb-2.5 text-sm font-bold transition",
            tab === k ? "border-highlight text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {k === "login" ? t("login") : registerLabel}
        </button>
      ))}
    </div>
  );
}

function ShopPanel({ className }: { className?: string }) {
  const { t } = useLang();
  const [tab, setTab] = useState<Tab>("login");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shopDistrict, setShopDistrict] = useState("");
  const shopIdQ = useQuery(shopIdPreviewQuery(shopDistrict));
  const login = useServerFn(signInShopkeeper);
  const registerShop = useServerFn(registerShopkeeper);

  const switchTab = (next: Tab) => {
    setTab(next);
    setError(null);
    setInfo(null);
  };

  async function handleShopLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const identifier = String(f.get("loginId") ?? "").trim();
    const password = String(f.get("password") ?? "");
    if (!identifier || !password) return setError(t("eRequired"));
    setBusy(true);
    setError(null);
    try {
      const res = await login({ data: { identifier, password } });
      if (!res.ok) return setError(t(res.error === "unconfirmed" ? "eUnconfirmed" : "eLogin"));
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: res.access_token,
        refresh_token: res.refresh_token,
      });
      if (sessionError) return setError(t("eGeneric"));
    } catch {
      setError(t("eGeneric"));
    } finally {
      setBusy(false);
    }
  }

  async function handleShopRegister(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const shopName = String(f.get("shopName") ?? "").trim().replace(/\s+/g, " ");
    const district = String(f.get("district") ?? "");
    const taluk = String(f.get("taluk") ?? "").trim();
    const ward = String(f.get("ward") ?? "").trim();
    const mobile = normalizeMobile(String(f.get("mobile") ?? ""));
    const username = String(f.get("username") ?? "").trim();
    const password = String(f.get("password") ?? "");
    const confirm = String(f.get("confirm") ?? "");
    if (!shopName || !district || !mobile || !username || !password) return setError(t("eRequired"));
    if (!(DISTRICTS as readonly string[]).includes(district)) return setError(t("eRequired"));
    if (!isValidMobile(mobile)) return setError(t("eMobile"));
    if (!isValidUsername(username)) return setError(t("eUsername"));
    const pwIssue = checkNewPassword(password, confirm);
    if (pwIssue) return setError(t(pwIssue === "short" ? "ePass" : "ePassMismatch"));

    setBusy(true);
    setError(null);
    try {
      const res = await registerShop({
        data: { shopName: shopName.slice(0, 80), district, taluk, ward, mobile, username, password },
      });
      if (!res.ok) return setError(t(SHOP_ERRORS[res.error]));
      const shopNumber = res.shopNumber;
      toast.success(t("tShopCreated", shopNumber), { duration: 10000 });
      // Account is created ready to use — sign straight in.
      const session = await login({ data: { identifier: shopNumber, password } });
      if (!session.ok) {
        setTab("login");
        return setError(t("eGeneric"));
      }
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
      if (sessionError) setError(t("eGeneric"));
    } catch {
      setError(t("eGeneric"));
    } finally {
      setBusy(false);
    }
  }

  async function handleForgot(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return setError(t("eEmail"));
    setBusy(true);
    setError(null);
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
    setBusy(false);
    setInfo(t("resetSent"));
  }

  return (
    <Panel
      className={className}
      icon={<Store className="h-5 w-5" aria-hidden="true" />}
      title={t("roleShop")}
      sub={t("roleShopSub")}
      footer={t("authOnly")}
    >
      {tab !== "forgot" && <PanelTabs tab={tab} onChange={switchTab} registerLabel={t("registerShop")} />}

      {info && (
        <div className="mb-4 rounded-xl bg-secondary px-4 py-3 text-sm text-secondary-foreground ring-1 ring-border" role="status">
          <p>📧 {info}</p>
        </div>
      )}

      {tab === "login" && (
        <form onSubmit={handleShopLogin} className="flex flex-col gap-4" noValidate>
          <Field label={t("loginId")}>
            <input name="loginId" required autoComplete="username" className={inputCls} placeholder="TRIC-1" />
          </Field>
          <Field label={t("password")}>
            <PasswordInput name="password" autoComplete="current-password" />
          </Field>
          <ErrorText msg={error} />
          <SubmitButton busy={busy}>{t("loginBtn")}</SubmitButton>
          <button
            type="button"
            onClick={() => switchTab("forgot")}
            className="text-center text-sm font-semibold text-muted-foreground hover:text-foreground hover:underline"
          >
            {t("forgot")}
          </button>
        </form>
      )}

      {tab === "register" && (
        <form onSubmit={handleShopRegister} className="flex flex-col gap-4" noValidate>
          <Field label={t("shopName")}>
            <input name="shopName" required maxLength={80} autoComplete="organization" className={inputCls} />
          </Field>
          <Field label={t("area")}>
            <DistrictSelect value={shopDistrict} onChange={setShopDistrict} />
          </Field>
          <Field label={t("shopIdAuto")}>
            <div
              className={cn(inputCls, "bg-muted font-mono font-bold tracking-wider", !shopDistrict && "font-sans font-normal tracking-normal text-muted-foreground")}
              aria-live="polite"
            >
              {!shopDistrict ? t("shopIdPick") : shopIdQ.data?.shopId ?? "…"}
            </div>
            {shopDistrict && shopIdQ.data?.shopId && <span className="text-xs text-muted-foreground">{t("shopIdNote")}</span>}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("talukOpt")}>
              <input name="taluk" autoComplete="off" className={inputCls} />
            </Field>
            <Field label={t("wardOpt")}>
              <input name="ward" autoComplete="off" className={inputCls} />
            </Field>
          </div>
          <Field label={t("shopMobile")}>
            <MobileInput />
          </Field>
          <Field label={t("username")}>
            <input name="username" required autoComplete="username" className={inputCls} />
          </Field>
          <NewPasswordFields />
          <ErrorText msg={error} />
          <SubmitButton busy={busy}>{t("createShop")}</SubmitButton>
        </form>
      )}

      {tab === "forgot" && (
        <form onSubmit={handleForgot} className="flex flex-col gap-4" noValidate>
          <div>
            <h3 className="text-base font-bold text-foreground">{t("forgotTitle")}</h3>
            <p className="text-sm text-muted-foreground">{t("forgotSub")}</p>
          </div>
          <Field label={t("email")}>
            <input name="email" type="email" required autoComplete="email" className={inputCls} />
          </Field>
          <ErrorText msg={error} />
          <SubmitButton busy={busy}>{t("sendReset")}</SubmitButton>
          <button
            type="button"
            onClick={() => switchTab("login")}
            className="text-center text-sm font-semibold text-muted-foreground hover:text-foreground hover:underline"
          >
            ← {t("backToLogin")}
          </button>
        </form>
      )}
    </Panel>
  );
}

function CardPanel({ className }: { className?: string }) {
  const { t } = useLang();
  const [tab, setTab] = useState<Tab>("login");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const registerCard = useServerFn(registerCardholder);

  const switchTab = (next: Tab) => {
    setTab(next);
    setError(null);
  };

  async function handleCardLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const card = normalizeCard(String(f.get("card") ?? ""));
    const password = String(f.get("password") ?? "");
    if (!card || !password) return setError(t("eRequired"));
    if (!isValidCard(card)) return setError(t("eCard"));
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email: cardholderEmail(card), password });
    setBusy(false);
    if (err) setError(t("eCardLogin"));
  }

  async function handleCardRegister(payload: CardFormValues) {
    setBusy(true);
    setError(null);
    try {
      const res = await registerCard({ data: payload });
      if (!res.ok) return setError(t(CARD_ERRORS[res.error]));
      const { error: err } = await supabase.auth.signInWithPassword({
        email: cardholderEmail(payload.card),
        password: payload.password,
      });
      if (err) {
        setTab("login");
        setError(t("eGeneric"));
      }
    } catch {
      setError(t("eGeneric"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      className={className}
      icon={<CreditCard className="h-5 w-5" aria-hidden="true" />}
      title={t("roleCardHolder")}
      sub={t("roleCardSub")}
      footer={t("authOnlyCard")}
    >
      <PanelTabs tab={tab} onChange={switchTab} registerLabel={t("cardRegister")} />

      {tab === "login" && (
        <form onSubmit={handleCardLogin} className="flex flex-col gap-4" noValidate>
          <Field label={t("fCard")}>
            <input name="card" required autoComplete="username" className={cn(inputCls, "uppercase tracking-wide")} placeholder="33/G/0123456" />
          </Field>
          <Field label={t("password")}>
            <PasswordInput name="password" autoComplete="current-password" />
          </Field>
          <ErrorText msg={error} />
          <SubmitButton busy={busy}>{t("cardLoginBtn")}</SubmitButton>
          <p className="text-center text-sm text-muted-foreground">{t("cardForgot")}</p>
        </form>
      )}

      {tab === "register" && (
        <CardRegisterForm busy={busy} error={error} setError={setError} onSubmit={handleCardRegister} />
      )}
    </Panel>
  );
}

type CardFormValues = { card: string; mobile: string; name: string; district: string; shopCode: string; password: string };

function CardRegisterForm({
  busy,
  error,
  setError,
  onSubmit,
}: {
  busy: boolean;
  error: string | null;
  setError: (m: string | null) => void;
  onSubmit: (v: CardFormValues) => void;
}) {
  const { t } = useLang();
  const [district, setDistrict] = useState("");
  const [search, setSearch] = useState("");
  const shopsQ = useQuery(districtShopsQuery(district));
  const allShops = shopsQ.data ?? [];
  const q = search.trim().toLowerCase();
  const shops = q
    ? allShops.filter((s) => s.shop_number.toLowerCase().includes(q) || s.shop_name.toLowerCase().includes(q))
    : allShops;

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const card = normalizeCard(String(f.get("card") ?? ""));
    const mobile = normalizeMobile(String(f.get("mobile") ?? ""));
    const name = String(f.get("name") ?? "").trim().replace(/\s+/g, " ");
    const shopCode = String(f.get("shopCode") ?? "");
    const password = String(f.get("password") ?? "");
    const confirm = String(f.get("confirm") ?? "");
    if (!card || !mobile || !name || !district || !password) return setError(t("eRequired"));
    if (!isValidCard(card)) return setError(t("eCard"));
    if (!isValidMobile(mobile)) return setError(t("eMobile"));
    if (!shopCode) return setError(t("eShopCode"));
    const pwIssue = checkNewPassword(password, confirm);
    if (pwIssue) return setError(t(pwIssue === "short" ? "ePass" : "ePassMismatch"));
    onSubmit({ card, mobile, name, district, shopCode, password });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Field label={t("fCard")}>
        <input name="card" required autoComplete="off" className={cn(inputCls, "uppercase tracking-wide")} placeholder="33/G/0123456" />
      </Field>
      <Field label={t("fMobile")}>
        <MobileInput />
      </Field>
      <Field label={t("fName")}>
        <input name="name" required maxLength={60} autoComplete="name" className={inputCls} />
      </Field>
      <Field label={t("area")}>
        <DistrictSelect
          value={district}
          onChange={(v) => {
            setDistrict(v);
            setSearch("");
          }}
        />
      </Field>
      <Field label={t("selectShop")}>
        {allShops.length > 8 && (
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchShop")}
            aria-label={t("searchShop")}
            className={cn(inputCls, "py-2.5")}
          />
        )}
        <select name="shopCode" required className={inputCls} defaultValue="" key={`${district}|${q}`} disabled={!district}>
          <option value="">{district ? t("selectShop") : t("pickDistrictFirst")}</option>
          {shops.map((s) => (
            <option key={s.shop_number} value={s.shop_number}>
              {s.shop_number}
              {s.shop_name ? ` — ${s.shop_name}` : ""}
              {s.ward || s.taluk ? ` (${s.ward || s.taluk})` : ""}
            </option>
          ))}
        </select>
        {district && shopsQ.isSuccess && allShops.length > 0 && !shops.length && (
          <span className="text-xs text-warning-strong">{t("noShopMatch")}</span>
        )}
        {district && shopsQ.isSuccess && !allShops.length && (
          <span className="text-xs text-warning-strong">{t("noShopsInDistrict")}</span>
        )}
      </Field>
      <NewPasswordFields />
      <ErrorText msg={error} />
      <SubmitButton busy={busy}>{t("createCardAccount")}</SubmitButton>
    </form>
  );
}

function DistrictSelect({ value, onChange }: { value?: string; onChange?: (v: string) => void }) {
  const { t } = useLang();
  const controlled = value !== undefined;
  return (
    <select
      name="district"
      required
      className={inputCls}
      {...(controlled ? { value, onChange: (e) => onChange?.(e.target.value) } : { defaultValue: "" })}
    >
      <option value="">{t("selectDistrict")}</option>
      {DISTRICTS.map((d) => (
        <option key={d} value={d}>
          {d}
        </option>
      ))}
    </select>
  );
}

function MobileInput() {
  const [v, setV] = useState("");
  return (
    <input
      name="mobile"
      required
      inputMode="numeric"
      autoComplete="tel"
      maxLength={10}
      placeholder="9876543210"
      value={v}
      onChange={(e) => setV(e.target.value.replace(/\D/g, "").slice(0, 10))}
      className={cn(inputCls, "tracking-wider")}
    />
  );
}

/** Clean, neutral sign-in page frame. `wide` hosts the two portal panels; otherwise one centred card. */
export function AuthShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  const { t } = useLang();
  return (
    <main className="theme-auth flex min-h-screen flex-col bg-background">
      <header className="border-b border-border bg-card">
        <div className={cn("mx-auto flex w-full items-center justify-between gap-3 px-4 py-3", wide ? "max-w-5xl" : "max-w-md")}>
          <div className="min-w-0">
            <h1 className="truncate text-base font-extrabold text-foreground sm:text-lg">
              <span className="sm:hidden">{t("appName")}</span>
              <span className="hidden sm:inline">
                Namma Ration <span className="font-normal text-muted-foreground">·</span> நம்ம ரேஷன்
              </span>
            </h1>
            <p className="truncate text-xs text-muted-foreground sm:text-sm">{t("taglineAuth")}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle plain />
            <LangToggle />
          </div>
        </div>
      </header>
      <div className={cn("mx-auto w-full flex-1 px-4 py-5 sm:py-10", wide ? "max-w-5xl" : "max-w-md")}>
        {wide ? (
          children
        ) : (
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
            {children}
            <p className="mt-5 text-center text-xs text-muted-foreground">🔒 {t("authOnly")}</p>
          </section>
        )}
      </div>
    </main>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold text-secondary-foreground">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function ErrorText({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <p className="rounded-lg bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive-strong" role="alert">
      {msg}
    </p>
  );
}

export function SubmitButton({ busy, children }: { busy: boolean; children: ReactNode }) {
  // Disabled until hydrated so a fast tap can't natively submit the form (and put the password in the URL).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <button
      type="submit"
      disabled={busy || !mounted}
      className="rounded-xl bg-primary py-3.5 text-base font-bold text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
    >
      {busy ? "…" : children}
    </button>
  );
}

/** Password box with a Show / Hide toggle. */
export function PasswordInput({
  name,
  autoComplete,
  disabled,
  value,
  onChange,
  id,
}: {
  name: string;
  autoComplete: "current-password" | "new-password";
  disabled?: boolean | undefined;
  value?: string;
  onChange?: (v: string) => void;
  id?: string;
}) {
  const { t } = useLang();
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type={show ? "text" : "password"}
        required
        minLength={autoComplete === "new-password" ? MIN_PASSWORD : undefined}
        autoComplete={autoComplete}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        disabled={disabled}
        className={cn(inputCls, "pr-12")}
        {...(onChange ? { value, onChange: (e) => onChange(e.target.value) } : {})}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        disabled={disabled}
        aria-label={t(show ? "hidePassword" : "showPassword")}
        aria-pressed={show}
        title={t(show ? "hidePassword" : "showPassword")}
        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-muted-foreground hover:text-foreground disabled:opacity-50"
      >
        {show ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
      </button>
    </div>
  );
}

/** Password + Confirm Password pair with a live "match" hint. Field names: `password`, `confirm`. */
export function NewPasswordFields({ label, disabled }: { label?: string; disabled?: boolean | undefined }) {
  const { t } = useLang();
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const hintId = useId();
  const issue = confirm ? checkNewPassword(pw, confirm) : null;
  return (
    <>
      <Field label={label ?? t("password")}>
        <PasswordInput name="password" autoComplete="new-password" value={pw} onChange={setPw} disabled={disabled} />
      </Field>
      <Field label={t("confirmPassword")}>
        <PasswordInput name="confirm" autoComplete="new-password" value={confirm} onChange={setConfirm} disabled={disabled} />
        {confirm && (
          <span
            id={hintId}
            aria-live="polite"
            className={cn("text-xs font-semibold", issue === "mismatch" ? "text-destructive-strong" : "text-success-strong")}
          >
            {issue === "mismatch" ? `✗ ${t("ePassMismatch")}` : issue === null ? `✓ ${t("passwordsMatch")}` : ""}
          </span>
        )}
      </Field>
    </>
  );
}

export { inputCls };
