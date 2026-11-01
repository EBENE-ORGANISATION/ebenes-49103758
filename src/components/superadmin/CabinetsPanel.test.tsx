import { beforeAll, afterEach, it, expect, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import i18n from "@/i18n";
import { CabinetsPanel } from "./CabinetsPanel";
const simulation = vi.hoisted(() => ({
  adminClient: false, erreur: false,
  creerCabinet: vi.fn(async () => {}), rattacher: vi.fn(async () => {}), changerMission: vi.fn(async () => {}),
  inviterAdminClient: vi.fn(async () => ({ email_envoye: false })), detacherMembre: vi.fn(async () => {}),
}));
vi.mock("@/lib/cabinetOps", () => ({ cabinetOps: simulation }));
vi.mock("@/hooks/data/useCabinetsAdmin", () => ({ useCabinetsAdmin: () => ({
  erreur: simulation.erreur, chargement: false, enCours: false,
  executer: (operation: () => Promise<unknown>) => operation(),
  donnees: {
    cabinets: [{ id: "c", nom: "Cabinet Test", max_dossiers: 10, actif: true }],
    dossiers: [{ id: "d", cabinet_id: "c", societe_id: "s", mission: "tenue_complete", etat: "actif" }],
    societes: [{ id: "s", nom: "Client TEST" }, { id: "autre", nom: "Autre société" }],
    comptes: [{ id: "u", email: "membre@exemple.invalid", roles: simulation.adminClient ? ["admin"] : [], societes: [{ societe_id: "s" }] }],
    equipes: [{ cabinetId: "c", membres: [
      { user_id: "r", nom: "Responsable", role: "responsable", actif: true },
      { user_id: "u", nom: "Alice", role: "collaborateur", actif: true, deja_connecte: true },
    ] }],
  },
}) }));
beforeAll(async () => { await i18n.changeLanguage("fr"); });
afterEach(() => { cleanup(); simulation.adminClient = false; simulation.erreur = false; vi.restoreAllMocks(); vi.clearAllMocks(); });
it("signale un double accès et protège le responsable actif", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<CabinetsPanel />);
  expect(screen.getByText(/Double accès : Alice/)).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: "Détacher un membre" })).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Détacher un membre" }));
  await waitFor(() => expect(simulation.detacherMembre).toHaveBeenCalledWith("c", "u"));
});
it("invite l’administrateur du dossier sans administrateur", async () => {
  render(<CabinetsPanel />);
  fireEvent.click(screen.getByRole("button", { name: "Inviter l’administrateur du client" }));
  fireEvent.change(screen.getByLabelText("Adresse e-mail"), { target: { value: "client@exemple.invalid" } });
  fireEvent.click(screen.getByRole("button", { name: "Envoyer l’invitation" }));
  await waitFor(() => expect(simulation.inviterAdminClient).toHaveBeenCalledWith({ societeId: "s", email: "client@exemple.invalid", nom: "" }));
});
it("masque l’invitation si un administrateur existe", () => {
  simulation.adminClient = true; render(<CabinetsPanel />);
  expect(screen.queryByRole("button", { name: "Inviter l’administrateur du client" })).not.toBeInTheDocument();
});
it("masque toutes les commandes après une erreur de lecture", () => {
  simulation.erreur = true; render(<CabinetsPanel />);
  expect(screen.getByRole("alert")).toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
it("crée le cabinet avec le responsable et la limite choisis", async () => {
  render(<CabinetsPanel />);
  fireEvent.change(screen.getByLabelText("Nom"), { target: { value: "Cabinet Nouveau" } });
  fireEvent.change(screen.getByLabelText("Responsable"), { target: { value: "u" } });
  fireEvent.change(screen.getByLabelText("Limite de dossiers"), { target: { value: "12" } });
  fireEvent.click(screen.getByRole("button", { name: "Créer le cabinet" }));
  await waitFor(() => expect(simulation.creerCabinet).toHaveBeenCalledWith("Cabinet Nouveau", "u", 12));
});
it("rattache une société libre et change la mission avec l’identifiant du lien", async () => {
  render(<CabinetsPanel />);
  fireEvent.change(screen.getByLabelText("Société"), { target: { value: "autre" } });
  fireEvent.click(screen.getByRole("button", { name: "Rattacher" }));
  await waitFor(() => expect(simulation.rattacher).toHaveBeenCalledWith("c", "autre", "tenue_complete"));
  fireEvent.change(screen.getAllByLabelText("Mission")[1], { target: { value: "lecture" } });
  await waitFor(() => expect(simulation.changerMission).toHaveBeenCalledWith("d", "lecture"));
});
