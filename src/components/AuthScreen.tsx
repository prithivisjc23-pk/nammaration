import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/hooks/use-lang";
import { BrandMark, LangToggle } from "@/components/LangToggle";
import { signInShopkeeper } from "@/lib/auth.functions";
import { DISTRICTS, isValidShopNumber, isValidUsername, normalizeShopNumber } from "@/lib/ration";
import { cn } from "@/lib/utils";

const inputCls =
  "w-full rounded-xl border border-input bg-card px-3 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/30";

type Tab = "login" | "register" | "forgot";

export function AuthScreen() {
  const { t } = useLang();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("login");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<{ title?: string; body: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const login = useServerFn(signInShopkeeper);

  // Already signed in (or just returned from the confirmation link) → go to dashboard.
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active && data.session) navigate({ to: "/dashboard", replace: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        navigate({ to: "/dashboard", replace: true });
      }
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  const switchTab = (next: Tab) => {
    setTab(next);
    setError(null);
    setInfo(null);
  };

  async function handleLogin(e: FormEvent<HTMLFormElement>) {
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
      navigate({ to: "/dashboard", replace: true });
    } catch {
      setError(t("eGeneric"));
    } finally {
      setBusy(false);
    }
  }

  async function handleRegister(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const shopNumber = normalizeShopNumber(String(f.get("shopId") ?? ""));
    const district = String(f.get("district") ?? "");
    const taluk = String(f.get("taluk") ?? "").trim();
    const ward = String(f.get("ward") ?? "").trim();
    const username = String(f.get("username") ?? "").trim();
    const email = String(f.get("email") ?? "").trim().toLowerCase();
    const password = String(f.get("password") ?? "");
    if (!shopNumber || !district || !taluk || !ward || !username || !email || !password) return setError(t("eRequired"));
    if (!isValidShopNumber(shopNumber)) return setError(t("eShopNo"));
    if (!(DISTRICTS as readonly string[]).includes(district)) return setError(t("eRequired"));
    if (!isValidUsername(username)) return setError(t("eUsername"));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError(t("eEmail"));
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
          data: { shop_number: shopNumber, district, taluk, ward, username },
        },
      });
      if (signUpError) {
        // Auth errors (weak password, blocked email domain, rate limit) are already human-readable.
        return setError(signUpError.message || t("eGeneric"));
      }
      if (data.session) {
        navigate({ to: "/dashboard", replace: true });
        return;
      }
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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError(t("eEmail"));
    setBusy(true);
    setError(null);
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
    setBusy(false);
    setInfo({ body: t("resetSent") });
  }

  return (
    <AuthShell>
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
              {t(k === "login" ? "login" : "registerShop")}
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

      {tab === "login" && (
        <form onSubmit={handleLogin} className="flex flex-col gap-4" noValidate>
          <Field label={t("loginId")}>
            <input name="loginId" required autoComplete="username" className={inputCls} placeholder="shop1234 / 1234" />
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

      {tab === "register" && (
        <form onSubmit={handleRegister} className="flex flex-col gap-4" noValidate>
          <Field label={t("shopNo")}>
            <div className="flex items-center rounded-xl border border-input bg-card focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30">
              <span className="pl-3 font-semibold text-muted-foreground">Shop #</span>
              <input name="shopId" required autoComplete="off" className="w-full rounded-xl bg-transparent px-2 py-3 text-base outline-none" placeholder="1234" />
            </div>
          </Field>
          <Field label={t("district")}>
            <select name="district" required className={inputCls} defaultValue="">
              <option value="">{t("selectDistrict")}</option>
              {DISTRICTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("taluk")}>
              <input name="taluk" required autoComplete="off" className={inputCls} />
            </Field>
            <Field label={t("ward")}>
              <input name="ward" required autoComplete="off" className={inputCls} />
            </Field>
          </div>
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

      {tab === "forgot" && (
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
    </AuthShell>
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
      <div className="mb-4 flex w-full max-w-md justify-end">
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
  return (
    <button
      type="submit"
      disabled={busy}
      className="rounded-xl bg-primary py-3.5 text-base font-bold text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
    >
      {busy ? "…" : children}
    </button>
  );
}

export { inputCls };
