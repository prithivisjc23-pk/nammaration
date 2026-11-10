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

/**
 * Verify the active shop's hashed password server-side, then exchange a
 * server-generated one-time token for a real session. Never expose credentials.
 */
export const signInShopkeeper = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => loginInput.parse(input))
  .handler(async ({ data }): Promise<ShopkeeperLoginResult> => {
    const id = normalizeShopNumber(data.identifier);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ownerId, error: credentialError } = await supabaseAdmin.rpc("verify_shop_credentials", {
      _shop_number: id,
      _password: data.password,
    });
    if (credentialError || !ownerId) return { ok: false, error: "invalid" };
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(ownerId);
    const email = userData.user?.email;
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

    const { data: link, error: linkError } = await supabaseAdmin.auth.admin.generateLink({ type: "magiclink", email });
    if (linkError || link.user?.id !== ownerId || !link.properties?.hashed_token) return { ok: false, error: "invalid" };
    const { data: auth, error } = await client.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
    if (error || !auth.session) {
      const unconfirmed = error?.code === "email_not_confirmed" || /not confirmed/i.test(error?.message ?? "");
      return { ok: false, error: unconfirmed ? "unconfirmed" : "invalid" };
    }
    const { data: shop } = await supabaseAdmin.from("shops").select("owner_id").eq("shop_number", id).eq("is_active", true).maybeSingle();
    const { data: admin } = await supabaseAdmin.rpc("has_role", { _user_id: ownerId, _role: "super_admin" });
    if (auth.user?.id !== ownerId || (shop?.owner_id !== ownerId && !admin)) return { ok: false, error: "invalid" };
    return { ok: true, access_token: auth.session.access_token, refresh_token: auth.session.refresh_token };
  });

