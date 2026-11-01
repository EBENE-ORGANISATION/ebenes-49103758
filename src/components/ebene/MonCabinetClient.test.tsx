import { beforeAll, afterEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "@/i18n";
import { MonCabinetClient } from "./MonCabinetClient";
const simulation = vi.hoisted(() => ({ lien: true, changer: vi.fn(async () => {}), collaborateurs: vi.fn(async () => [{ user_id: "u", nom: "Alice", role: "collaborateur", mission: "lecture" }]) }));
vi.mock("@/lib/cabinetOps", () => ({ cabinetOps: { changerMission: simulation.changer, collaborateursDossier: simulation.collaborateurs } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "admin" } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ neq: () => ({ maybeSingle: async () => ({ error: null, data: simulation.lien ? { id: "lien", cabinet_id: "c", mission: "tenue_complete", etat: "actif", created_at: "2026-10-27", cabinets: { nom: "Cabinet Test" } } : null }) }) }) }) }) } }));
beforeAll(async () => { await i18n.changeLanguage("fr"); });
afterEach(() => { cleanup(); simulation.lien = true; vi.clearAllMocks(); });
function afficher() {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { ...render(<QueryClientProvider client={cache}><MonCabinetClient societeId="societe" /></QueryClientProvider>), cache };
}
it("baisse la mission avec l’identifiant du lien", async () => {
  afficher();
  fireEvent.change(await screen.findByRole("combobox", { name: "Mission" }), { target: { value: "lecture" } });
  await waitFor(() => expect(simulation.changer).toHaveBeenCalledWith("lien", "lecture"));
  expect(await screen.findByText(/Alice/)).toBeInTheDocument();
  expect(simulation.collaborateurs).toHaveBeenCalledWith("societe");
});
it("ne montre aucun bloc sans cabinet", async () => {
  simulation.lien = false; const vue = afficher();
  await waitFor(() => expect(vue.cache.isFetching()).toBe(0));
  await waitFor(() => expect(vue.container).toBeEmptyDOMElement());
  expect(simulation.collaborateurs).not.toHaveBeenCalled();
});
