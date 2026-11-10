import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { compareShopIds, isDistrict, nextShopId } from "./ration";

const districtInput = z.object({ district: z.string().max(40) });

export type DistrictShop = { shop_number: string; shop_name: string; taluk: string; ward: string };

/** Public: the Shop ID a new shop in this district would get (shown on the sign-up form). */
export const previewShopId = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => districtInput.parse(input))
  .handler(async ({ data }): Promise<{ shopId: string | null }> => {
    if (!isDistrict(data.district)) return { shopId: null };
    const { takenShopIds } = await import("./shops.server");
    return { shopId: nextShopId(data.district, await takenShopIds(data.district)) };
  });

/** Public: shops in one district for the cardholder sign-up picker (safe columns only). */
export const listDistrictShops = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => districtInput.parse(input))
  .handler(async ({ data }): Promise<DistrictShop[]> => {
    if (!isDistrict(data.district)) return [];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("shops")
      .select("shop_number, shop_name, taluk, ward")
      .eq("district", data.district)
      .eq("is_active", true)
      .limit(2000);
    if (error) throw new Error(error.message);
    return (rows ?? []).sort((a, b) => compareShopIds(a.shop_number, b.shop_number));
  });
