import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import {
  DISTRICTS,
  isValidMobile,
  isValidShopNumber,
  isValidUsername,
  normalizeMobile,
  normalizeShopNumber,
  shopkeeperEmail,
} from "./ration";

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

const registerInput = z.object({
  shopName: z.string().trim().min(1).max(80),
  shopNumber: z.string().max(20),
  district: z.string().max(40),
  taluk: z.string().trim().max(60),
  ward: z.string().trim().max(60),
  mobile: z.string().max(20),
  username: z.string().trim().max(30),
  password: z.string().min(6).max(200),
});

export type ShopkeeperRegisterError = "invalid" | "shop_taken" | "username_taken" | "failed";
export type ShopkeeperRegisterResult = { ok: true } | { ok: false; error: ShopkeeperRegisterError };

/**
 * Public: create a shopkeeper account without an email address.
 * The account uses an internal address derived from the shop code and is created already confirmed;
 * the `handle_new_shopkeeper` trigger creates the shop row from the metadata.
 */
export const registerShopkeeper = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => registerInput.parse(input))
  .handler(async ({ data }): Promise<ShopkeeperRegisterResult> => {
    const shopNumber = normalizeShopNumber(data.shopNumber);
    const mobile = normalizeMobile(data.mobile);
    const username = data.username;
    if (
      !isValidShopNumber(shopNumber) ||
      !isValidMobile(mobile) ||
      !isValidUsername(username) ||
      !(DISTRICTS as readonly string[]).includes(data.district)
    ) {
      return { ok: false, error: "invalid" };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: avail, error: availError } = await supabaseAdmin.rpc("check_shop_registration", {
      _shop_number: shopNumber,
      _username: username,
    });
    if (availError) return { ok: false, error: "failed" };
    const a = (avail ?? {}) as { shop_taken?: boolean; username_taken?: boolean };
    if (a.shop_taken) return { ok: false, error: "shop_taken" };
    if (a.username_taken) return { ok: false, error: "username_taken" };

    const { error } = await supabaseAdmin.auth.admin.createUser({
      email: shopkeeperEmail(shopNumber),
      password: data.password,
      email_confirm: true,
      user_metadata: {
        shop_number: shopNumber,
        shop_name: data.shopName.replace(/\s+/g, " "),
        district: data.district,
        taluk: data.taluk,
        ward: data.ward,
        mobile,
        username,
      },
    });
    if (error) {
      const exists = /already/i.test(error.message ?? "");
      if (!exists) console.error("Shopkeeper account creation failed", error.message);
      return { ok: false, error: exists ? "shop_taken" : "failed" };
    }
    return { ok: true };
  });
