import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/hooks/use-lang";
import { BrandMark, LangToggle, ThemeToggle } from "@/components/LangToggle";
import { signInShopkeeper } from "@/lib/auth.functions";
import { registerCardholder, type CardholderRegisterError } from "@/lib/cardholder.functions";
import { publicShopsQuery, resolveHome } from "@/lib/shop-data";
import {
  DISTRICTS,
  cardholderEmail,
  isValidCard,
  isValidMobile,
  isValidShopNumber,
  isValidUsername,
  normalizeCard,
  normalizeMobile,
  normalizeShopNumber,
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

export function AuthScreen() {
  const { t } = useLang();
  const navigate = useNavigate();
  const [role, setRole] = useState<Role>("shop");
  const [tab, setTab] = useState<Tab>("login");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<{ title?: string; body: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const login = useServerFn(signInShopkeeper);
  const registerCard = useServerFn(registerCardholder);

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

  const reset = () => {
    setError(null);
    setInfo(null);
  };
  const switchTab = (next: Tab) => {
    setTab(next);
    reset();
  };
  const switchRole = (next: Role) => {
    setRole(next);
    setTab("login");
    reset();
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
    const shopNumber = normalizeShopNumber(String(f.get("shopId") ?? ""));
    const district = String(f.get("district") ?? "");
    const taluk = String(f.get("taluk") ?? "").trim();
    const ward = String(f.get("ward") ?? "").trim();
    const mobile = normalizeMobile(String(f.get("mobile") ?? ""));
    const username = String(f.get("username") ?? "").trim();
    const email = String(f.get("email") ?? "").trim().toLowerCase();
    const password = String(f.get("password") ?? "");
    if (!shopName || !shopNumber || !district || !mobile || !username || !email || !password) return setError(t("eRequired"));
    if (!isValidShopNumber(shopNumber)) return setError(t("eShopNo"));
    if (!(DISTRICTS as readonly string[]).includes(district)) return setError(t("eRequired"));
    if (!isValidMobile(mobile)) return setError(t("eMobile"));
    if (!isValidUsername(username)) return setError(t("eUsername"));
    if (!EMAIL_RE.test(email)) return setError(t("eEmail"));
    if (password.length < 6) return setError(t("ePass"));

    setBusy(true);
    setError(null);
    try {
      const { data: avail, error: availError } = await supabase.rpc("check_shop_registration", {
        _shop_number: shopNumber,
        _username: username,
      });
      if (availError) return setError(t("eGeneric"));
      const a = (avail ?? {}) as { shop_taken?: boolean; username_taken?: boolean };
      if (a.shop_taken) return setError(t("eShopExists"));
      if (a.username_taken) return setError(t("eUserExists"));

      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: { shop_number: shopNumber, shop_name: shopName.slice(0, 80), district, taluk, ward, mobile, username },
        },
      });
      // Auth errors (weak password, blocked email domain, rate limit) are already human-readable.
      if (signUpError) return setError(signUpError.message || t("eGeneric"));
      if (data.session) return;
      setInfo({ title: t("checkEmailTitle"), body: t("checkEmail", email) });
      setTab("login");
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
    setInfo({ body: t("resetSent") });
  }

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
    <AuthShell>
      <div className="mb-4 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Role">
        {(["shop", "card"] as const).map((r) => (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={role === r}
            onClick={() => switchRole(r)}
            className={cn(
              "flex items-center justify-center gap-2 rounded-xl border-2 px-3 py-3 text-sm font-bold transition",
              role === r
                ? "border-primary bg-primary-soft text-primary-strong"
                : "border-border bg-muted text-muted-foreground hover:border-input",
            )}
          >
            <span aria-hidden="true">{r === "shop" ? "🏪" : "🪪"}</span>
            {t(r === "shop" ? "roleShop" : "roleCard")}
          </button>
        ))}
      </div>

      {tab !== "forgot" && (
        <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-secondary p-1" role="tablist">
          {(["login", "register"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => switchTab(k)}
              className={cn(
                "rounded-lg py-2.5 text-sm font-bold",
                tab === k ? "bg-card text-foreground shadow" : "text-muted-foreground",
              )}
            >
              {t(k === "login" ? "login" : role === "shop" ? "registerShop" : "cardRegister")}
            </button>
          ))}
        </div>
      )}

      {info && (
        <div className="mb-4 rounded-xl bg-primary-soft px-4 py-3 text-sm text-primary-strong ring-1 ring-primary-border" role="status">
          {info.title && <p className="font-bold">📧 {info.title}</p>}
          <p>{info.body}</p>
        </div>
      )}

      {role === "shop" && tab === "login" && (
        <form onSubmit={handleShopLogin} className="flex flex-col gap-4" noValidate>
          <Field label={t("loginId")}>
            <input name="loginId" required autoComplete="username" className={inputCls} placeholder="shop1234 / FPS-104" />
          </Field>
          <Field label={t("password")}>
            <input name="password" type="password" required autoComplete="current-password" className={inputCls} />
          </Field>
          <ErrorText msg={error} />
          <SubmitButton busy={busy}>{t("loginBtn")}</SubmitButton>
          <button
            type="button"
            onClick={() => switchTab("forgot")}
            className="text-center text-sm font-semibold text-primary-strong hover:underline"
          >
            {t("forgot")}
          </button>
        </form>
      )}

      {role === "shop" && tab === "register" && (
        <form onSubmit={handleShopRegister} className="flex flex-col gap-4" noValidate>
          <Field label={t("shopName")}>
            <input name="shopName" required maxLength={80} autoComplete="organization" className={inputCls} />
          </Field>
          <Field label={t("shopCode")}>
            <input name="shopId" required autoComplete="off" className={cn(inputCls, "uppercase")} placeholder="FPS-104" />
          </Field>
          <Field label={t("area")}>
            <DistrictSelect />
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
          <Field label={t("email")} hint={t("emailHint")}>
            <input name="email" type="email" required autoComplete="email" className={inputCls} />
          </Field>
          <Field label={t("password")}>
            <input name="password" type="password" required minLength={6} autoComplete="new-password" className={inputCls} />
          </Field>
          <ErrorText msg={error} />
          <SubmitButton busy={busy}>{t("createShop")}</SubmitButton>
        </form>
      )}

      {role === "shop" && tab === "forgot" && (
        <form onSubmit={handleForgot} className="flex flex-col gap-4" noValidate>
          <div>
            <h2 className="text-lg font-bold text-foreground">{t("forgotTitle")}</h2>
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
            className="text-center text-sm font-semibold text-primary-strong hover:underline"
          >
            ← {t("backToLogin")}
          </button>
        </form>
      )}

      {role === "card" && tab === "login" && (
        <form onSubmit={handleCardLogin} className="flex flex-col gap-4" noValidate>
          <Field label={t("fCard")}>
            <input name="card" required autoComplete="username" className={cn(inputCls, "uppercase tracking-wide")} placeholder="33/G/0123456" />
          </Field>
          <Field label={t("password")}>
            <input name="password" type="password" required autoComplete="current-password" className={inputCls} />
          </Field>
          <ErrorText msg={error} />
          <SubmitButton busy={busy}>{t("cardLoginBtn")}</SubmitButton>
          <p className="text-center text-sm text-muted-foreground">{t("cardForgot")}</p>
        </form>
      )}

      {role === "card" && tab === "register" && (
        <CardRegisterForm busy={busy} error={error} setError={setError} onSubmit={handleCardRegister} />
      )}
    </AuthShell>
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
  const shopsQ = useQuery(publicShopsQuery());
  const shops = (shopsQ.data ?? []).filter((s) => s.district === district);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const card = normalizeCard(String(f.get("card") ?? ""));
    const mobile = normalizeMobile(String(f.get("mobile") ?? ""));
    const name = String(f.get("name") ?? "").trim().replace(/\s+/g, " ");
    const shopCode = String(f.get("shopCode") ?? "");
    const password = String(f.get("password") ?? "");
    if (!card || !mobile || !name || !district || !password) return setError(t("eRequired"));
    if (!isValidCard(card)) return setError(t("eCard"));
    if (!isValidMobile(mobile)) return setError(t("eMobile"));
    if (!shopCode) return setError(t("eShopCode"));
    if (password.length < 6) return setError(t("ePass"));
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
        <DistrictSelect value={district} onChange={setDistrict} />
      </Field>
      <Field label={t("selectShop")}>
        <select name="shopCode" required className={inputCls} defaultValue="" key={district} disabled={!district}>
          <option value="">{t("selectShop")}</option>
          {shops.map((s) => (
            <option key={s.shop_number} value={s.shop_number}>
              {s.shop_number}
              {s.shop_name ? ` — ${s.shop_name}` : ""}
            </option>
          ))}
        </select>
        {district && shopsQ.isSuccess && !shops.length && (
          <span className="text-xs text-warning-strong">{t("noShopsInDistrict")}</span>
        )}
      </Field>
      <Field label={t("password")}>
        <input name="password" type="password" required minLength={6} autoComplete="new-password" className={inputCls} />
      </Field>
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

export function AuthShell({ children }: { children: ReactNode }) {
  const { t } = useLang();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-ink px-4 py-10">
      <div className="mb-6 flex w-full max-w-md items-center gap-3">
        <BrandMark className="h-12 w-12" />
        <div>
          <h1 className="text-xl font-extrabold text-ink-foreground">
            Namma Ration <span className="text-primary">|</span> நம்ம ரேஷன்
          </h1>
          <p className="text-sm text-ink-muted">{t("tagline")}</p>
        </div>
      </div>
      <div className="mb-4 flex w-full max-w-md justify-end gap-2">
        <ThemeToggle />
        <LangToggle dark />
      </div>
      <section className="w-full max-w-md rounded-2xl bg-card p-5 shadow-2xl sm:p-6">
        {children}
        <p className="mt-5 text-center text-xs text-muted-foreground">🔒 {t("authOnly")}</p>
      </section>
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

export { inputCls };
