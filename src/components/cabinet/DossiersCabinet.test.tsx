import { beforeAll, afterEach, it, expect, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "@/i18n";
import { DossiersCabinet } from "./DossiersCabinet";
import type { useCabinet } from "@/hooks/data/useCabinet";

const simulation = vi.hoisted(() => ({
  invitationsRecues: vi.fn(async () => [{ dossier_id: "i", societe_id: "s", societe_nom: "Client invité", mission: "lecture", created_at: "2026-11-02" }]),
  repondreInvitation: vi.fn(async () => {}), demanderDepart: vi.fn(async () => {}),
}));
vi.mock("@/lib/cabinetOps", () => ({ cabinetOps: simulation }));
vi.mock("./AttributionsDossier", () => ({ AttributionsDossier: () => null }));
beforeAll(async () => { await i18n.changeLanguage("fr"); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); });
function afficher(role = "responsable") {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const donnees = { role, cabinet: { id: "c", max_dossiers: 10 }, membres: [], attributions: [], enCours: false,
    executer: (operation: () => Promise<unknown>) => operation(),
    dossiers: [
      { id: "d", nom: "Client actif", etat: "actif", mission: "lecture" },
      { id: "i", nom: "identifiant-invitation", etat: "invitation", mission: "lecture" },
      { id: "f", nom: "Client en départ", etat: "depart_demande", mission: "lecture" },
    ],
  } as unknown as ReturnType<typeof useCabinet>;
  render(<QueryClientProvider client={cache}><DossiersCabinet donnees={donnees} /></QueryClientProvider>);
  return cache;
}

async function confirmer(nom: string, accepter = true) {
  fireEvent.click(screen.getByRole("button", { name: nom }));
  const dialogue = await screen.findByRole("alertdialog");
  fireEvent.click(within(dialogue).getByRole("button", { name: accepter ? nom : "Annuler" }));
  await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
}
it("sépare les invitations et compte seulement les dossiers en cours", async () => {
  const cache = afficher(); const invalider = vi.spyOn(cache, "invalidateQueries");
  expect(await screen.findByRole("heading", { name: "Invitations reçues" })).toBeInTheDocument();
  expect(screen.getByText("Client invité")).toBeInTheDocument();
  expect(screen.getByText("2 / 10")).toBeInTheDocument();
  expect(screen.queryByText("identifiant-invitation")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Accepter" }));
  await waitFor(() => expect(simulation.repondreInvitation).toHaveBeenCalledWith("i", true));
  await waitFor(() => expect(invalider).toHaveBeenCalledWith({ queryKey: ["invitations_recues"] }));
});
it("confirme le refus et la demande de départ avec motif", async () => {
  afficher();
  await screen.findByRole("button", { name: "Refuser" });
  await confirmer("Refuser", false);
  expect(simulation.repondreInvitation).not.toHaveBeenCalled();
  await confirmer("Refuser");
  await waitFor(() => expect(simulation.repondreInvitation).toHaveBeenCalledWith("i", false));
  const motif = screen.getByLabelText("Motif (facultatif)");
  expect(motif).toHaveAttribute("maxLength", "500");
  fireEvent.change(motif, { target: { value: "Fin du contrat" } });
  await confirmer("Demander la fin de la mission");
  await waitFor(() => expect(simulation.demanderDepart).toHaveBeenCalledWith("d", "Fin du contrat"));
  expect(screen.getByText("Fin de mission demandée")).toBeInTheDocument();
});
it("masque les actions et les invitations au collaborateur", () => {
  afficher("collaborateur");
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(screen.queryByText("Invitations reçues")).not.toBeInTheDocument();
  expect(simulation.invitationsRecues).not.toHaveBeenCalled();
});
