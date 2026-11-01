import { it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
const simulation = vi.hoisted(() => ({ equipe: vi.fn(async () => [{ user_id: "u", nom: "Alice", deja_connecte: true }]), tables: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u" } }) }));
vi.mock("@/lib/cabinetOps", () => ({ cabinetOps: { equipe: simulation.equipe } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: simulation.tables } }));
import { useCabinet } from "./useCabinet";
it("affiche le nom et la connexion issus de cabinet_equipe sans lire profiles", async () => {
  simulation.tables.mockImplementation((table: string) => {
    const membre = { id: "m", user_id: "u", cabinet_id: "c", role: "responsable", actif: true };
    const resultat = { data: table === "cabinet_membres" ? [membre] : [], error: null };
    const chaine = { select: () => chaine, eq: () => chaine, then: (resoudre: (valeur: unknown) => unknown) => Promise.resolve(resultat).then(resoudre), maybeSingle: async () => ({ data: table === "cabinets" ? { id: "c", nom: "Cabinet Test", actif: true } : membre, error: null }) };
    return chaine;
  });
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const vue = renderHook(() => useCabinet(), { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={cache}>{children}</QueryClientProvider> });
  await waitFor(() => expect(vue.result.current.membres[0]?.nom).toBe("Alice"));
  expect(vue.result.current.membres[0].deja_connecte).toBe(true);
  expect(simulation.equipe).toHaveBeenCalledWith("c");
  expect(simulation.tables).not.toHaveBeenCalledWith("profiles");
  vue.unmount(); cache.clear();
});
