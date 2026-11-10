import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isDistrict, isValidMobile, normalizeShopNumber, shopkeeperEmail } from "./ration";

const shopInput = z.object({
  shopNumber: z.string().trim().min(1).max(12).transform(normalizeShopNumber).refine((v) => /^[A-Z0-9-]+$/.test(v)),
  shopName: z.string().trim().min(1).max(100),
  district: z.string().refine(isDistrict),
  taluk: z.string().trim().max(60), ward: z.string().trim().max(60),
  mobile: z.string().refine(isValidMobile), password: z.string().min(6).max(72),
});

export const listManagedShops = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: allowed, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "super_admin" });
    if (error || !allowed) return { allowed: false as const, shops: [] };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error: readError } = await supabaseAdmin.from("shops").select("id,shop_number,shop_name,district,taluk,ward,mobile,is_active").order("district").order("shop_number");
    if (readError) throw new Error("Shop list unavailable");
    return { allowed: true as const, shops: data ?? [] };
  });

export const simulateNextMonthReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: boolean; count?: number; error?: "forbidden" | "failed" }> => {
    const { data: allowed, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "super_admin" });
    if (error || !allowed) return { ok: false, error: "forbidden" };
    // The caller-scoped RPC rechecks the role and atomically audits the new quota cycle.
    const { data: result, error: resetError } = await context.supabase.rpc("simulate_next_month_reset");
    if (resetError || !result || typeof result !== "object" || Array.isArray(result) || result.ok !== true) return { ok: false, error: "failed" };
    return { ok: true, count: typeof result.count === "number" ? result.count : 0 };
  });

export const createManagedShop = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => shopInput.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: boolean; error?: "forbidden" | "duplicate" | "failed" }> => {
    const { data: allowed, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "super_admin" });
    if (error || !allowed) return { ok: false, error: "forbidden" };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: exists, error: checkError } = await supabaseAdmin.from("shops").select("id").eq("shop_number", data.shopNumber).maybeSingle();
    if (checkError) return { ok: false, error: "failed" };
    if (exists) return { ok: false, error: "duplicate" };
    const { data: account, error: accountError } = await supabaseAdmin.auth.admin.createUser({
      email: shopkeeperEmail(data.shopNumber), password: `${crypto.randomUUID()}aA9!`, email_confirm: true,
    });
    if (accountError || !account.user) return { ok: false, error: "failed" };
    const { error: provisionError } = await supabaseAdmin.rpc("provision_shop", {
      _owner_id: account.user.id, _shop_number: data.shopNumber, _shop_name: data.shopName,
      _district: data.district, _taluk: data.taluk, _ward: data.ward, _mobile: data.mobile, _password: data.password,
    });
    if (provisionError) {
      await supabaseAdmin.auth.admin.deleteUser(account.user.id);
      return { ok: false, error: provisionError.code === "23505" ? "duplicate" : "failed" };
    }
    return { ok: true };
  });