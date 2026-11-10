import { useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Store } from "lucide-react";
import { toast } from "sonner";
import { listManagedShops, createManagedShop } from "@/lib/admin.functions";
import { DISTRICTS, checkNewPassword } from "@/lib/ration";
import { useLang } from "@/hooks/use-lang";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "./AppHeader";
import { Field, NewPasswordFields } from "./AuthScreen";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export function ManageShops() {
  const { t } = useLang();
  const list = useServerFn(listManagedShops);
  const create = useServerFn(createManagedShop);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const query = useQuery({ queryKey: ["managed-shops"], queryFn: () => list(), refetchInterval: 10000 });
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  async function logout() { await qc.cancelQueries(); qc.clear(); await supabase.auth.signOut(); await navigate({ to: "/auth" }); }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const get = (key: string) => String(f.get(key) ?? "");
    const issue = checkNewPassword(get("password"), get("confirm"));
    if (issue) { toast.error(t(issue === "short" ? "ePass" : "ePassMismatch")); return; }
    setBusy(true);
    try {
      const result = await create({ data: { shopNumber: get("shopNumber"), shopName: get("shopName"), district: get("district"), taluk: get("taluk"), ward: get("ward"), mobile: get("mobile"), password: get("password") } });
      if (!result.ok) { toast.error(t(result.error === "forbidden" ? "adminDenied" : result.error === "duplicate" ? "eShopExists" : "eGeneric")); return; }
      form.reset(); setOpen(false); await qc.invalidateQueries({ queryKey: ["managed-shops"] }); await qc.invalidateQueries({ queryKey: ["district_shops"] }); toast.success(t("shopCreated"));
    } catch { toast.error(t("eGeneric")); } finally { setBusy(false); }
  }
  return <div className="min-h-screen bg-background text-foreground">
    <AppHeader title={t("manageShops")} subtitle={t("superAdmin")} onLogout={logout} />
    <main className="mx-auto max-w-5xl px-4 py-5">
      {query.isPending ? <p>{t("loading")}</p> : query.isError ? <p role="alert">{t("eGeneric")}</p> : !query.data.allowed ? <p role="alert" className="text-destructive-strong">{t("adminDenied")}</p> : <>
        <div className="mb-5 flex items-center justify-between gap-3"><h1 className="text-xl font-bold">{t("manageShops")} ({query.data.shops.length})</h1><Button onClick={() => setOpen(!open)}><Plus className="h-4 w-4" />{t("addShop")}</Button></div>
        {open && <form onSubmit={submit} className="mb-6 grid gap-4 border-y border-border py-5 sm:grid-cols-2">
          <Field label={t("shopCode")}><Input name="shopNumber" required maxLength={12} pattern="[A-Za-z0-9-]+" autoComplete="off" /></Field>
          <Field label={t("shopName")}><Input name="shopName" required maxLength={100} /></Field>
          <Field label={t("district")}><select name="district" required defaultValue="" className="h-10 w-full rounded-md border border-input bg-card px-3"><option value="">{t("selectDistrict")}</option>{DISTRICTS.map((d) => <option key={d}>{d}</option>)}</select></Field>
          <Field label={t("shopMobile")}><Input name="mobile" required pattern="[6-9][0-9]{9}" inputMode="numeric" maxLength={10} /></Field>
          <Field label={t("talukOpt")}><Input name="taluk" maxLength={60} /></Field><Field label={t("wardOpt")}><Input name="ward" maxLength={60} /></Field>
          <div className="flex flex-col gap-4 sm:col-span-2"><NewPasswordFields /><div className="flex gap-2"><Button disabled={busy} type="submit">{busy ? "…" : t("createShop")}</Button><Button variant="outline" type="button" disabled={busy} onClick={() => setOpen(false)}>{t("cancel")}</Button></div></div>
        </form>}
        <div className="grid gap-3 sm:grid-cols-2">{query.data.shops.map((s) => <article key={s.id} className="rounded-lg border border-border bg-card p-4"><div className="flex items-start gap-3"><Store className="mt-1 h-5 w-5 shrink-0 text-primary" /><div className="min-w-0"><h2 className="break-words font-bold">{s.shop_name}</h2><p className="text-sm font-semibold text-primary">{s.shop_number}</p><p className="mt-1 text-sm text-muted-foreground">{[s.district,s.taluk,s.ward].filter(Boolean).join(" · ")}</p><p className="text-sm text-muted-foreground">{s.mobile}</p><p className={s.is_active ? "mt-2 text-xs font-bold text-success-strong" : "mt-2 text-xs text-muted-foreground"}>{s.is_active ? t("activeShop") : t("shopClosed")}</p></div></div></article>)}</div>
      </>}
    </main>
  </div>;
}