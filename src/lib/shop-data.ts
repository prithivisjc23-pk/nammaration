import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

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
        all.push(...data);
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
