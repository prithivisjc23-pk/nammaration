import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), user: vi.fn(), link: vi.fn(), verify: vi.fn(), shop: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => ({ inputValidator: () => ({ handler: (fn: unknown) => fn }) }) }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  rpc: mocks.rpc,
  auth: { admin: { getUserById: mocks.user, generateLink: mocks.link } },
  from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: mocks.shop }) }) }) }),
} }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth: { verifyOtp: mocks.verify } }) }));
import { signInShopkeeper, type ShopkeeperLoginResult } from "./auth.functions";
const login = signInShopkeeper as unknown as (input: { data: { identifier: string; password: string } }) => Promise<ShopkeeperLoginResult>;

describe("shop-table login", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.rpc.mockResolvedValue({ data: "owner", error: null });
    mocks.user.mockResolvedValue({ data: { user: { email: "internal@example.test" } } });
    mocks.link.mockResolvedValue({ data: { user: { id: "owner" }, properties: { hashed_token: "one-time" } } });
    mocks.verify.mockResolvedValue({ data: { user: { id: "owner" }, session: { access_token: "access", refresh_token: "refresh" } } });
    mocks.shop.mockResolvedValue({ data: { owner_id: "owner" } });
  });
  it.each(["TNV-FPS-001", "TNV-FPS-002", "TNV-FPS-003"])("verifies %s before issuing an owner session", async (identifier) => {
    expect(await login({ data: { identifier, password: "test-input" } })).toEqual({ ok: true, access_token: "access", refresh_token: "refresh" });
    expect(mocks.rpc).toHaveBeenCalledWith("verify_shop_credentials", { _shop_number: identifier, _password: "test-input" });
  });
  it("rejects unapproved TNV-FPS-004 without issuing a token", async () => {
    expect(await login({ data: { identifier: "TNV-FPS-004", password: "test-input" } })).toEqual({ ok: false, error: "invalid" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects an incorrect shop-table password", async () => {
    mocks.rpc.mockResolvedValue({ data: null });
    expect(await login({ data: { identifier: "TNV-FPS-001", password: "wrong" } })).toEqual({ ok: false, error: "invalid" });
    expect(mocks.link).not.toHaveBeenCalled();
  });
  it("rejects a shop disabled during the session exchange", async () => {
    mocks.shop.mockResolvedValue({ data: null });
    expect(await login({ data: { identifier: "TNV-FPS-001", password: "test-input" } })).toEqual({ ok: false, error: "invalid" });
  });
});