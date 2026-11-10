import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type RationLookup = { found: boolean; customer_id?: string; collected?: boolean; own_shop?: boolean };
export const lookupRation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ identifier: z.string().trim().min(6).max(40) }).parse(input))
  .handler(async ({ data, context }): Promise<RationLookup> => {
    const { data: result, error } = await context.supabase.rpc("lookup_ration_card", { _identifier: data.identifier });
    if (error) throw new Error("Lookup failed");
    return result as RationLookup;
  });

export const collectRation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ customerId: z.string().uuid(), shopId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ ok: boolean; error?: string }> => {
    const { data: result, error } = await context.supabase.rpc("collect_monthly_ration", { _customer_id: data.customerId, _shop_id: data.shopId });
    if (error) throw new Error("Collection failed");
    return result as { ok: boolean; error?: string };
  });