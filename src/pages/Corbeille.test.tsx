import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Corbeille from "./Corbeille";
import { permissionsMission } from "@/lib/missionCabinet";
const simulation = vi.hoisted(() => ({ lire: vi.fn(async (_table: string, _societe: string, _champs: string) => []), droits: {} as Record<string, string> }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ isAdmin: false, isChefCompta: true, isChefGrh: false, estCabinet: true, can: (module: string) => simulation.droits[module] === "validate" || simulation.droits[module] === "write" }) }));
vi.mock("@/hooks/useTenant", () => ({ useTenant: () => ({ currentSociete: { id: "A" } }), useLienAccueil: () => "/?sid=A" }));
vi.mock("@/lib/softDelete", () => ({ fetchDeleted: simulation.lire, softPurge: vi.fn() }));
vi.mock("@/lib/restaurationCorbeille", () => ({ restaurerDepuisCorbeille: vi.fn(), RestaurationRefusee: class extends Error {} }));
afterEach(() => { cleanup(); simulation.lire.mockClear(); });
describe("corbeille dans une mission comptable et fiscale", () => {
  it("n'ouvre pas les actions factures et stock du chef comptable", async () => {
    simulation.droits = permissionsMission("compta_fiscalite", "collaborateur", "actif");
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><Corbeille /></MemoryRouter></QueryClientProvider>);
    await waitFor(() => expect(simulation.lire).toHaveBeenCalled());
    expect(simulation.lire.mock.calls.map(([table]) => table).sort()).toEqual(["immobilisations", "transactions"]);
  });
});
