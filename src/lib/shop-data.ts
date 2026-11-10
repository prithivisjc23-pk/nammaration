import { isCollectedThisMonth } from "./ration";
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { listDistrictShops, previewShopId } from "./shops.functions";

export type Shop = Tables<"shops">;
export type Customer = Tables<"customers">;
export type SmsLog = Pick<Tables<"sms_logs">, "id" | "type" | "recipient_count" | "created_at">;

export const shopQuery = (userId: string) =>
  queryOptions({
    queryKey: ["shop", userId],
    queryFn: async () => {
      const { data, error } = await supabase.from("shops").select("*").eq("owner_id", userId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

const PAGE = 1000;

export const customersQuery = (shopId: string) =>
  queryOptions({
    queryKey: ["customers", shopId],
    queryFn: async () => {
      const all: Customer[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from("customers")
          .select("*")
          .eq("shop_id", shopId)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        all.push(...data.map((c) => ({ ...c, status: isCollectedThisMonth(c) ? "collected" : "pending", monthly_status: isCollectedThisMonth(c) ? "Collected" : "Pending" })));
        if (data.length < PAGE) break;
      }
      return all;
    },
  });

export const smsLogsQuery = (shopId: string) =>
  queryOptions({
    queryKey: ["sms_logs", shopId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sms_logs")
        .select("id, type, recipient_count, created_at")
        .eq("shop_id", shopId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as SmsLog[];
    },
  });

/** Where a signed-in user belongs: shop owners go to the dashboard, cardholders to their portal. */
export async function resolveHome(userId: string): Promise<"/dashboard" | "/portal" | null> {
  const [{ data: shop }, { data: card }] = await Promise.all([
    supabase.from("shops").select("id").eq("owner_id", userId).maybeSingle(),
    supabase.from("customers").select("id").eq("user_id", userId).maybeSingle(),
  ]);
  if (shop) return "/dashboard";
  if (card) return "/portal";
  return null;
}

export const myCardQuery = (userId: string) =>
  queryOptions({
    queryKey: ["my_card", userId],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").eq("user_id", userId).maybeSingle();
      if (error) throw error;
      return data ? { ...data, status: isCollectedThisMonth(data) ? "collected" : "pending" } : null;
    },
  });

export const shopByIdQuery = (shopId: string) =>
  queryOptions({
    queryKey: ["shop_by_id", shopId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shops")
        .select(
          "id, shop_number, shop_name, district, taluk, ward, mobile, status, crowd, stock, morning_open, morning_close, evening_open, evening_close, updated_at",
        )
        .eq("id", shopId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

/** Shops in one district for the cardholder sign-up picker. */
export const districtShopsQuery = (district: string) =>
  queryOptions({
    queryKey: ["district_shops", district],
    queryFn: () => listDistrictShops({ data: { district } }),
    enabled: !!district,
    staleTime: 60_000,
  });

/** The Shop ID a new shop in this district will get. */
export const shopIdPreviewQuery = (district: string) =>
  queryOptions({
    queryKey: ["shop_id_preview", district],
    queryFn: () => previewShopId({ data: { district } }),
    enabled: !!district,
    staleTime: 10_000,
  });
