import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  DISTRICTS,
  cardholderEmail,
  isValidCard,
  isValidMobile,
  normCard,
  normalizeCard,
  normalizeMobile,
  normalizeShopNumber,
} from "./ration";

const registerInput = z.object({
  card: z.string().max(40),
  mobile: z.string().max(20),
  name: z.string().trim().min(1).max(60),
  district: z.string().max(40),
  shopCode: z.string().max(20),
  password: z.string().min(6).max(200),
});

export type CardholderRegisterError =
  | "invalid_card"
  | "invalid_mobile"
  | "invalid_shop"
  | "card_taken"
  | "card_other_shop"
  | "mobile_mismatch"
  | "mobile_taken"
  | "failed";

export type CardholderRegisterResult = { ok: true } | { ok: false; error: CardholderRegisterError };

/**
 * Public: a cardholder creates a portal account with their Smart Card number + password.
 * Links to the shop's existing card record when card + mobile match, otherwise joins the chosen shop as Pending.
 */
export const registerCardholder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => registerInput.parse(input))
  .handler(async ({ data }): Promise<CardholderRegisterResult> => {
    const card = normalizeCard(data.card);
    const mobile = normalizeMobile(data.mobile);
    const name = data.name.replace(/\s+/g, " ");
    if (!isValidCard(card)) return { ok: false, error: "invalid_card" };
    if (!isValidMobile(mobile)) return { ok: false, error: "invalid_mobile" };
    if (!(DISTRICTS as readonly string[]).includes(data.district)) return { ok: false, error: "invalid_shop" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cardNorm = normCard(card);

    const { data: shop } = await supabaseAdmin
      .from("shops")
      .select("id")
      .eq("shop_number", normalizeShopNumber(data.shopCode))
      .maybeSingle();
    if (!shop) return { ok: false, error: "invalid_shop" };

    const { data: existing } = await supabaseAdmin
      .from("customers")
      .select("id, shop_id, mobile, user_id")
      .eq("card_norm", cardNorm)
      .maybeSingle();

    let customerId: string;
    let createdRow = false;
    if (existing) {
      if (existing.user_id) return { ok: false, error: "card_taken" };
      if (existing.shop_id !== shop.id) return { ok: false, error: "card_other_shop" };
      if (existing.mobile !== mobile) return { ok: false, error: "mobile_mismatch" };
      customerId = existing.id;
    } else {
      const { data: mobileOwner } = await supabaseAdmin.from("customers").select("id").eq("mobile", mobile).maybeSingle();
      if (mobileOwner) return { ok: false, error: "mobile_taken" };
      const { data: row, error } = await supabaseAdmin
        .from("customers")
        .insert({ shop_id: shop.id, card, card_norm: cardNorm, name, mobile, district: data.district })
        .select("id")
        .single();
      if (error || !row) {
        const msg = error?.message ?? "";
        return { ok: false, error: msg.includes("mobile") ? "mobile_taken" : msg.includes("card") ? "card_taken" : "failed" };
      }
      customerId = row.id;
      createdRow = true;
    }

    const { data: created, error: userError } = await supabaseAdmin.auth.admin.createUser({
      email: cardholderEmail(card),
      password: data.password,
      email_confirm: true,
      user_metadata: { role: "cardholder", name },
    });
    if (userError || !created.user) {
      if (createdRow) await supabaseAdmin.from("customers").delete().eq("id", customerId);
      const exists = /already/i.test(userError?.message ?? "");
      if (!exists) console.error("Cardholder account creation failed", userError?.message);
      return { ok: false, error: exists ? "card_taken" : "failed" };
    }

    const { error: linkError } = await supabaseAdmin
      .from("customers")
      .update({ user_id: created.user.id, ...(createdRow ? {} : { district: data.district }) })
      .eq("id", customerId)
      .is("user_id", null);
    if (linkError) {
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      if (createdRow) await supabaseAdmin.from("customers").delete().eq("id", customerId);
      console.error("Cardholder link failed", linkError.message);
      return { ok: false, error: "failed" };
    }
    return { ok: true };
  });

const resetInput = z.object({ customerId: z.string().uuid(), password: z.string().min(6).max(200) });

/** Shopkeeper sets a new portal password for one of their own cardholders. */
export const resetCardholderPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => resetInput.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    const { data: customer } = await context.supabase
      .from("customers")
      .select("shop_id, user_id")
      .eq("id", data.customerId)
      .maybeSingle();
    if (!customer?.user_id) return { ok: false };
    const { data: owns } = await context.supabase.rpc("owns_shop", { _shop_id: customer.shop_id });
    if (!owns) return { ok: false };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(customer.user_id, { password: data.password });
    if (error) console.error("Cardholder password reset failed", error.message);
    return { ok: !error };
  });
