import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { DISTRICT_CODES, type District } from "./ration";

/** Shop IDs already used in a district. Server-only: load with a dynamic import inside a handler. */
export async function takenShopIds(district: District) {
  const { data, error } = await supabaseAdmin
    .from("shops")
    .select("shop_number")
    .ilike("shop_number", `${DISTRICT_CODES[district]}-%`);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.shop_number);
}
