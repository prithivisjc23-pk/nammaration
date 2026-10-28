import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { normalizeShopNumber } from "./ration";

const loginInput = z.object({
  identifier: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(200),
});

export type ShopkeeperLoginResult =
  | { ok: true; access_token: string; refresh_token: string }
  | { ok: false; error: "invalid" | "unconfirmed" };

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Sign a shopkeeper in with their username, shop number or email.
 * The email lookup happens server-side so emails are never exposed to visitors.
 */
export const signInShopkeeper = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => loginInput.parse(input))
  .handler(async ({ data }): Promise<ShopkeeperLoginResult> => {
    const id = data.identifier;
    let email: string | null = null;

    if (id.includes("@")) {
      email = id.toLowerCase();
    } else {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const shopNumber = normalizeShopNumber(id);
      let ownerId: string | null = null;

      const byShop = await supabaseAdmin.from("shops").select("owner_id").eq("shop_number", shopNumber).maybeSingle();
      ownerId = byShop.data?.owner_id ?? null;

      if (!ownerId) {
        const byUser = await supabaseAdmin
          .from("shops")
          .select("owner_id")
          .ilike("username", escapeLike(id))
          .maybeSingle();
        ownerId = byUser.data?.owner_id ?? null;
      }

      if (ownerId) {
        const { data: userData } = await supabaseAdmin.auth.admin.getUserById(ownerId);
        email = userData.user?.email ?? null;
      }
    }

    if (!email) return { ok: false, error: "invalid" };

    const url = process.env["SUPABASE_URL"]!;
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const client = createClient<Database>(url, key, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });

    const { data: auth, error } = await client.auth.signInWithPassword({ email, password: data.password });
    if (error || !auth.session) {
      const unconfirmed = error?.code === "email_not_confirmed" || /not confirmed/i.test(error?.message ?? "");
      return { ok: false, error: unconfirmed ? "unconfirmed" : "invalid" };
    }
    return { ok: true, access_token: auth.session.access_token, refresh_token: auth.session.refresh_token };
  });
