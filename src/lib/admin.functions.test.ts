import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ role: vi.fn(), admin: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => {
  const chain = { middleware: () => chain, inputValidator: () => chain, handler: (fn: unknown) => fn };
  return chain;
} }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: mocks.admin } }));
import { createManagedShop, listManagedShops, simulateNextMonthReset } from "./admin.functions";
const context = { userId: "shop-owner", supabase: { rpc: mocks.role } };
const create = createManagedShop as unknown as (args: { data: unknown; context: typeof context }) => Promise<{ ok: boolean; error?: string }>;
const list = listManagedShops as unknown as (args: { context: typeof context }) => Promise<{ allowed: boolean }>;
const reset = simulateNextMonthReset as unknown as (args: { context: typeof context }) => Promise<{ ok: boolean; count?: number; error?: string }>;
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
  it("denies demonstration quota resets to regular shopkeepers", async () => {
    expect(await reset({ context })).toEqual({ ok: false, error: "forbidden" });
    expect(mocks.role).toHaveBeenCalledTimes(1);
    expect(mocks.role).not.toHaveBeenCalledWith("simulate_next_month_reset");
  });
  it("allows Super Admin to reset all cardholders through the caller-scoped audited operation", async () => {
    mocks.role.mockResolvedValueOnce({ data: true, error: null }).mockResolvedValueOnce({ data: { ok: true, count: 3 }, error: null });
    expect(await reset({ context })).toEqual({ ok: true, count: 3 });
    expect(mocks.role).toHaveBeenNthCalledWith(2, "simulate_next_month_reset");
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("does not report a reset when the operation fails", async () => {
    mocks.role.mockResolvedValueOnce({ data: true, error: null }).mockResolvedValueOnce({ data: null, error: new Error("failed") });
    expect(await reset({ context })).toEqual({ ok: false, error: "failed" });
  });
  it("returns the globally updated cardholder count after a successful reset", async () => {
    mocks.role.mockResolvedValueOnce({ data: true, error: null }).mockResolvedValueOnce({ data: { ok: true, count: 16, generation: 8 }, error: null });
    expect(await reset({ context })).toEqual({ ok: true, count: 16 });
  });
});