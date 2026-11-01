import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import i18n from "@/i18n";
import { useMarquerDeclaration, useTableauCabinet } from "./useTableauCabinet";

const simulation = vi.hoisted(() => ({ rpc: vi.fn(), table: vi.fn(), upsert: vi.fn(), succes: vi.fn(), erreur: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: simulation.rpc, from: simulation.table } }));
vi.mock("sonner", () => ({ toast: { success: simulation.succes, error: simulation.erreur } }));
let cache: QueryClient;
const enveloppe = ({ children }: { children: ReactNode }) => <QueryClientProvider client={cache}>{children}</QueryClientProvider>;
beforeEach(async () => {
  await i18n.changeLanguage("fr"); vi.clearAllMocks();
  cache = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  simulation.table.mockReturnValue({ upsert: simulation.upsert });
  simulation.upsert.mockResolvedValue({ error: null });
});
afterEach(() => { cleanup(); cache.clear(); });
it("appelle la RPC avec la période et la met en cache sous la clé prévue", async () => {
  const donnees = { cabinet_id: "c", responsable: false, dossiers: [], charge: null };
  simulation.rpc.mockResolvedValue({ data: donnees, error: null });
  const vue = renderHook(() => useTableauCabinet(2026, 10), { wrapper: enveloppe });
  await waitFor(() => expect(vue.result.current.data).toEqual(donnees));
  expect(simulation.rpc).toHaveBeenCalledWith("tableau_cabinet", { _annee: 2026, _mois: 10 });
  expect(cache.getQueryData(["tableau_cabinet", 2026, 10])).toEqual(donnees);
});
it("marque deux fois par upsert sans envoyer par, invalide le tableau et confirme", async () => {
  const invalider = vi.spyOn(cache, "invalidateQueries");
  const vue = renderHook(useMarquerDeclaration, { wrapper: enveloppe });
  const declaration = { societe_id: "societe", annee: 2026, mois: 10, type: "IRPP" as const, statut: "deposee" as const };
  await act(async () => { await vue.result.current.mutateAsync(declaration); });
  await act(async () => { await vue.result.current.mutateAsync({ ...declaration, statut: "payee" }); });
  expect(simulation.table).toHaveBeenCalledWith("suivi_declarations");
  expect(simulation.upsert).toHaveBeenNthCalledWith(1, declaration, { onConflict: "societe_id,annee,mois,type" });
  expect(simulation.upsert).toHaveBeenNthCalledWith(2, { ...declaration, statut: "payee" }, { onConflict: "societe_id,annee,mois,type" });
  expect(simulation.upsert.mock.calls[0][0]).not.toHaveProperty("par");
  expect(invalider).toHaveBeenCalledWith({ queryKey: ["tableau_cabinet"] });
  expect(simulation.succes).toHaveBeenCalledTimes(2);
});
it("affiche une erreur sans toast de succès si l’écriture est refusée", async () => {
  simulation.upsert.mockResolvedValue({ error: new Error("Écriture refusée") });
  const vue = renderHook(useMarquerDeclaration, { wrapper: enveloppe });
  await act(async () => {
    await expect(vue.result.current.mutateAsync({ societe_id: "societe", annee: 2026, mois: 10, type: "TVA", statut: "payee" })).rejects.toThrow("Écriture refusée");
  });
  expect(simulation.erreur).toHaveBeenCalledTimes(1);
  expect(simulation.succes).not.toHaveBeenCalled();
});
