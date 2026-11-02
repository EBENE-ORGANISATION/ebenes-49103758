import { beforeAll, afterEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "@/i18n";
import { MonCabinetClient } from "./MonCabinetClient";
const simulation = vi.hoisted(() => ({ lien: true, etat: "actif", annuaire: vi.fn(async () => [{ id: "c", nom: "Cabinet Test" }]), inviter: vi.fn(async () => {}), annulerInvitation: vi.fn(async () => {}), demanderDepart: vi.fn(async () => {}), changer: vi.fn(async () => {}), collaborateurs: vi.fn(async () => [{ user_id: "u", nom: "Alice", role: "collaborateur", mission: "lecture" }]) }));
vi.mock("@/lib/cabinetOps", () => ({ cabinetOps: { annuaire: simulation.annuaire, inviter: simulation.inviter, annulerInvitation: simulation.annulerInvitation, demanderDepart: simulation.demanderDepart, changerMission: simulation.changer, collaborateursDossier: simulation.collaborateurs } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "admin" } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ neq: () => ({ maybeSingle: async () => ({ error: null, data: simulation.lien ? { id: "lien", cabinet_id: "c", mission: "tenue_complete", etat: simulation.etat, depart_demande_le: "2026-11-02", created_at: "2026-10-27", cabinets: { nom: "Cabinet Test" } } : null }) }) }) }) }) } }));
beforeAll(async () => { await i18n.changeLanguage("fr"); });
afterEach(() => { cleanup(); simulation.lien = true; simulation.etat = "actif"; simulation.annuaire.mockResolvedValue([{ id: "c", nom: "Cabinet Test" }]); vi.restoreAllMocks(); vi.clearAllMocks(); });
function afficher() {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { ...render(<QueryClientProvider client={cache}><MonCabinetClient societeId="societe" /></QueryClientProvider>), cache };
}

async function confirmer(nom: string, accepter = true) {
  fireEvent.click(screen.getByRole("button", { name: nom }));
  const dialogue = await screen.findByRole("alertdialog");
  fireEvent.click(within(dialogue).getByRole("button", { name: accepter ? nom : "Annuler" }));
  await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
}
it("baisse la mission avec l’identifiant du lien", async () => {
  afficher();
  fireEvent.change(await screen.findByRole("combobox", { name: "Mission" }), { target: { value: "lecture" } });
  await waitFor(() => expect(simulation.changer).toHaveBeenCalledWith("lien", "lecture"));
  expect(await screen.findByText(/Alice/)).toBeInTheDocument();
  expect(simulation.collaborateurs).toHaveBeenCalledWith("societe");
});

it("invite un cabinet depuis l’annuaire sans lien existant", async () => {
  simulation.lien = false; const { cache } = afficher();
  const invalider = vi.spyOn(cache, "invalidateQueries");
  fireEvent.change(await screen.findByLabelText("Cabinet"), { target: { value: "c" } });
  fireEvent.change(screen.getByLabelText("Mission"), { target: { value: "lecture" } });
  fireEvent.click(screen.getByRole("button", { name: "Inviter un cabinet" }));
  await waitFor(() => expect(simulation.inviter).toHaveBeenCalledWith("societe", "c", "lecture"));
  await waitFor(() => ["cabinet_client", "cabinet", "cabinets_admin", "dossiers_cabinet"].forEach(cle => expect(invalider).toHaveBeenCalledWith({ queryKey: [cle] })));
  expect(simulation.collaborateurs).not.toHaveBeenCalled();
});
it("affiche un annuaire vide", async () => {
  simulation.lien = false; simulation.annuaire.mockResolvedValueOnce([]); afficher();
  expect(await screen.findByText("Aucun cabinet disponible pour le moment.")).toBeInTheDocument();
});
it("retire une invitation après confirmation seulement", async () => {
  simulation.etat = "invitation";
  afficher();
  expect(await screen.findByText("Invitation envoyée à Cabinet Test, en attente de réponse")).toBeInTheDocument();
  await confirmer("Retirer l’invitation", false);
  expect(simulation.annulerInvitation).not.toHaveBeenCalled();
  await confirmer("Retirer l’invitation");
  await waitFor(() => expect(simulation.annulerInvitation).toHaveBeenCalledWith("lien"));
});
it("demande la fin de mission avec un motif facultatif limité", async () => {
  afficher();
  const motif = await screen.findByLabelText("Motif (facultatif)");
  expect(motif).toHaveAttribute("maxLength", "500");
  fireEvent.change(motif, { target: { value: "Fin du contrat" } });
  await confirmer("Demander la fin de la mission");
  await waitFor(() => expect(simulation.demanderDepart).toHaveBeenCalledWith("lien", "Fin du contrat"));
});
it("affiche l’attente de validation sans commande", async () => {
  simulation.etat = "depart_demande"; afficher();
  expect(await screen.findByText(/Fin de mission demandée le .*le cabinet ne peut plus que consulter/)).toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
});
