import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ role: vi.fn(), admin: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => {
  const chain = { middleware: () => chain, inputValidator: () => chain, handler: (fn: unknown) => fn };
  return chain;
} }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: mocks.admin } }));
import { createManagedShop, listManagedShops } from "./admin.functions";
const context = { userId: "shop-owner", supabase: { rpc: mocks.role } };
const create = createManagedShop as unknown as (args: { data: unknown; context: typeof context }) => Promise<{ ok: boolean; error?: string }>;
const list = listManagedShops as unknown as (args: { context: typeof context }) => Promise<{ allowed: boolean }>;
describe("Super Admin exclusive shop management", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.role.mockResolvedValue({ data: false, error: null }); });
  it("prevents a regular shopkeeper from adding any shop", async () => {
    expect(await create({ data: { shopNumber: "TNV-FPS-004" }, context })).toEqual({ ok: false, error: "forbidden" });
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.role).toHaveBeenCalledWith("has_role", { _user_id: "shop-owner", _role: "super_admin" });
  });
  it("hides the managed shop list from regular shopkeepers", async () => {
    expect((await list({ context })).allowed).toBe(false);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
});