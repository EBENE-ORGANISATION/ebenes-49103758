import { it, expect, vi } from "vitest";
const appel = vi.hoisted(() => vi.fn());
vi.mock("@/lib/superAdminApi", () => ({ callSuperAdmin: appel }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));
import { lireComptesCabinets } from "./useCabinetsAdmin";
it("lit la page suivante même au-delà des deux cents premiers comptes", async () => {
  appel.mockResolvedValueOnce({ users: Array.from({ length: 200 }, (_, id) => ({ id: String(id) })) }).mockResolvedValueOnce({ users: [{ id: "dernier" }] });
  const comptes = await lireComptesCabinets();
  expect(comptes).toHaveLength(201);
  expect(comptes[200].id).toBe("dernier");
  expect(appel).toHaveBeenLastCalledWith("list_users", { page: 2, perPage: 200 });
});
