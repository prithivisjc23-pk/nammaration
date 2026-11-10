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
    mocks.rpc.mockImplementation((name: string) => Promise.resolve({ data: name === "has_role" ? false : "owner", error: null }));
    mocks.user.mockResolvedValue({ data: { user: { email: "internal@example.test" } } });
    mocks.link.mockResolvedValue({ data: { user: { id: "owner" }, properties: { hashed_token: "one-time" } } });
    mocks.verify.mockResolvedValue({ data: { user: { id: "owner" }, session: { access_token: "access", refresh_token: "refresh" } } });
    mocks.shop.mockResolvedValue({ data: { owner_id: "owner" } });
  });
  it.each(["TNV-FPS-001", "TNV-FPS-002", "TNV-FPS-003"])("verifies %s before issuing an owner session", async (identifier) => {
    expect(await login({ data: { identifier, password: "test-input" } })).toEqual({ ok: true, access_token: "access", refresh_token: "refresh" });
    expect(mocks.rpc).toHaveBeenCalledWith("verify_shop_credentials", { _shop_number: identifier, _password: "test-input" });
  });
  it("allows a dynamically provisioned TNV-FPS-004 after credential verification", async () => {
    expect(await login({ data: { identifier: "TNV-FPS-004", password: "test-input" } })).toEqual({ ok: true, access_token: "access", refresh_token: "refresh" });
    expect(mocks.rpc).toHaveBeenCalledWith("verify_shop_credentials", { _shop_number: "TNV-FPS-004", _password: "test-input" });
  });
  it("allows SUPER-ADMIN-2319 only when its protected role is verified", async () => {
    mocks.shop.mockResolvedValue({ data: null });
    mocks.rpc.mockImplementation((name: string) => Promise.resolve({ data: name === "has_role" ? true : "owner" }));
    expect((await login({ data: { identifier: "SUPER-ADMIN-2319", password: "test-input" } })).ok).toBe(true);
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