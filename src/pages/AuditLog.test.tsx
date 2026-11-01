import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import i18n from "@/i18n";
import AuditLog from "./AuditLog";

const simulation = vi.hoisted(() => ({
  societe: { id: "societe", nom: "TEST" } as { id: string; nom: string } | null,
  noms: vi.fn(), lecture: vi.fn(),
}));
vi.mock("@/hooks/useTenant", () => ({ useTenant: () => ({ currentSociete: simulation.societe }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: simulation.lecture }) }) }) }),
  rpc: simulation.noms,
} }));
beforeAll(() => i18n.changeLanguage("fr"));
beforeEach(() => {
  simulation.societe = { id: "societe", nom: "TEST" };
  simulation.lecture.mockResolvedValue({ error: null, data: [
    { id: "cabinet", cabinet_id: "ancien-cabinet", user_id: "ancien-membre", user_email: "ancien@exemple.invalid", action: "INSERT", table_name: "transactions", created_at: "2026-10-27", description: "Action cabinet" },
    { id: "direct", cabinet_id: null, user_id: "ancien-membre", user_email: "direct@exemple.invalid", action: "INSERT", table_name: "transactions", created_at: "2026-10-27", description: "Action directe" },
  ] });
  simulation.noms.mockResolvedValue({ error: null, data: [{ cabinet_id: "ancien-cabinet", cabinet_nom: "Cabinet Test", user_id: "ancien-membre", auteur_nom: "Collaborateur 1" }] });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function afficher() { return render(<MemoryRouter><AuditLog /></MemoryRouter>); }

it("affiche la signature historique et filtre les seules actions du cabinet", async () => {
  afficher();
  expect(await screen.findByText("Cabinet Test — Collaborateur 1")).toBeInTheDocument();
  expect(screen.getByText("direct@exemple.invalid")).toBeInTheDocument();
  fireEvent.change(screen.getByRole("combobox", { name: "Cabinet" }), { target: { value: "ancien-cabinet" } });
  expect(screen.queryByText("Action directe")).not.toBeInTheDocument();
  expect(screen.getByText("Action cabinet")).toBeInTheDocument();
  expect(simulation.noms).toHaveBeenCalledWith("audit_noms_cabinet", { _societe: "societe" });
});
it("conserve la signature avec des replis si les noms ne sont pas disponibles", async () => {
  simulation.noms.mockResolvedValue({ error: { message: "Lecture impossible" }, data: null });
  afficher();
  expect(await screen.findByText("Cabinet ancien-cabinet — ancien@exemple.invalid")).toBeInTheDocument();
});
it("recherche aussi le nom de l’auteur signé", async () => {
  afficher();
  await screen.findByText("Cabinet Test — Collaborateur 1");
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Collaborateur 1" } });
  expect(screen.getByText("Action cabinet")).toBeInTheDocument();
  expect(screen.queryByText("Action directe")).not.toBeInTheDocument();
});
it("conserve l’affichage direct sans lecture de noms pour une société sans signature cabinet", async () => {
  simulation.lecture.mockResolvedValue({ error: null, data: [{ id: "direct", cabinet_id: null, user_email: "client@exemple.invalid", action: "INSERT", table_name: "transactions", created_at: "2026-10-27" }] });
  afficher();
  expect(await screen.findByText("client@exemple.invalid")).toBeInTheDocument();
  expect(simulation.noms).not.toHaveBeenCalled();
});
it("ignore une réponse tardive de la société précédente", async () => {
  let terminer!: (valeur: unknown) => void;
  simulation.lecture.mockReturnValueOnce(new Promise((resolve) => { terminer = resolve; }));
  const vue = afficher();
  simulation.societe = { id: "autre", nom: "AUTRE TEST" };
  simulation.lecture.mockResolvedValue({ error: null, data: [] });
  vue.rerender(<MemoryRouter><AuditLog /></MemoryRouter>);
  await waitFor(() => expect(simulation.lecture).toHaveBeenCalledTimes(2));
  await act(async () => {
    terminer({ error: null, data: [{ id: "tardive", cabinet_id: "ancien-cabinet", description: "Action périmée" }] });
  });
  await waitFor(() => expect(screen.queryByText("Action périmée")).not.toBeInTheDocument());
});
