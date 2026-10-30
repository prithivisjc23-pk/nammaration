import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { DISTRICT_CODES, compareShopIds, isDistrict, nextShopId, type District } from "./ration";

const districtInput = z.object({ district: z.string().max(40) });

export type DistrictShop = { shop_number: string; shop_name: string; taluk: string; ward: string };

/** Shop IDs already used in a district (server-only helper). */
export async function takenShopIds(district: District) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("shops")
    .select("shop_number")
    .ilike("shop_number", `${DISTRICT_CODES[district]}-%`);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.shop_number);
}

/** Public: the Shop ID a new shop in this district would get (shown on the sign-up form). */
export const previewShopId = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => districtInput.parse(input))
  .handler(async ({ data }): Promise<{ shopId: string | null }> => {
    if (!isDistrict(data.district)) return { shopId: null };
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
      .limit(2000);
    if (error) throw new Error(error.message);
    return (rows ?? []).sort((a, b) => compareShopIds(a.shop_number, b.shop_number));
  });
