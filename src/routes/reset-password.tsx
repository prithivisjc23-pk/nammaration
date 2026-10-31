import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/hooks/use-lang";
import { AuthShell, ErrorText, NewPasswordFields, SubmitButton } from "@/components/AuthScreen";
import { checkNewPassword } from "@/lib/ration";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password – Namma Ration" },
      { name: "description", content: "Set a new password for your Namma Ration shop account." },
      { property: "og:title", content: "Reset password – Namma Ration" },
      { property: "og:description", content: "Set a new password for your Namma Ration shop account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const { t } = useLang();
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setReady(true);
    });
    supabase.auth.getSession().then(({ data: s }) => {
      if (s.session) setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const password = String(f.get("password") ?? "");
    const pwIssue = checkNewPassword(password, String(f.get("confirm") ?? ""));
    if (pwIssue) return setError(t(pwIssue === "short" ? "ePass" : "ePassMismatch"));
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) return setError(err.message || t("eGeneric"));
    toast.success(t("passwordUpdated"));
    navigate({ to: "/dashboard", replace: true });
  }

  return (
    <AuthShell>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <h2 className="text-lg font-bold text-foreground">{t("forgotTitle")}</h2>
        {!ready && <p className="text-sm text-muted-foreground">{t("resetWaiting")}</p>}
        <NewPasswordFields label={t("newPassword")} disabled={!ready} />
        <ErrorText msg={error} />
        <SubmitButton busy={busy || !ready}>{t("setPassword")}</SubmitButton>
      </form>
    </AuthShell>
  );
}
