import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "@/i18n";
import Cabinet from "./Cabinet";
vi.mock("@/components/cabinet/TableauCabinet", () => ({ TableauCabinet: () => <p>Contenu du tableau de bord</p> }));
const simulation = vi.hoisted(() => ({ role: "responsable", attribuer: vi.fn(async () => {}), ajouterMembre: vi.fn(async () => ({ email_envoye: true })) }));
vi.mock("@/lib/cabinetOps", () => ({ cabinetOps: { invitationsRecues: async () => [], attribuer: simulation.attribuer, ajouterMembre: simulation.ajouterMembre } }));
vi.mock("@/hooks/data/useCabinet", () => ({ useCabinet: () => ({
  cabinet: { id: "c", nom: "Cabinet Test", max_dossiers: 10 }, role: simulation.role,
  membres: [{ user_id: "u", nom: "Alice", role: "collaborateur", actif: true }],
  dossiers: Array.from({ length: 10 }, (_, i) => ({ id: `d${i}`, societe_id: `s${i}`, nom: `Client ${i}`, mission: "compta_fiscalite", etat: "actif" })),
  attributions: [], isLoading: false, isError: false, executer: (operation: () => Promise<unknown>) => operation(), enCours: false,
}) }));
beforeAll(async () => { await i18n.changeLanguage("fr"); });
afterEach(() => { cleanup(); simulation.role = "responsable"; });
function afficherDossiers() {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={cache}><MemoryRouter><Cabinet /></MemoryRouter></QueryClientProvider>);
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Dossiers" }), { button: 0, ctrlKey: false });
}
it("ouvre le tableau de bord, placé en premier", () => {
  render(<MemoryRouter><Cabinet /></MemoryRouter>);
  expect(screen.getAllByRole("tab")[0]).toHaveTextContent("Tableau de bord");
  expect(screen.getByRole("tab", { name: "Tableau de bord" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByText("Contenu du tableau de bord")).toBeInTheDocument();
});
it("explique et bloque la création à dix dossiers", () => {
  afficherDossiers();
  expect(screen.getByRole("button", { name: "Nouveau dossier client" })).toBeDisabled();
  expect(screen.getByText("Limite de 10 dossiers atteinte")).toBeInTheDocument();
});
it.each(["collaborateur", "stagiaire"])("laisse le %s en lecture", role => {
  simulation.role = role;
  afficherDossiers();
  expect(screen.queryByRole("tab", { name: "Équipe" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Nouveau dossier client" })).not.toBeInTheDocument();
});
it("ne propose que les missions couvertes par compta_fiscalite", () => {
  afficherDossiers();
  const choix = screen.getAllByRole("combobox", { name: "Mission de Alice" })[0];
  expect(choix).not.toHaveTextContent("Tenue complète");
  expect(choix).not.toHaveTextContent("Paie et social");
  expect(choix).toHaveTextContent("Lecture seule");
});
it("attribue avec l’identifiant du lien et la mission choisie", async () => {
  afficherDossiers();
  fireEvent.change(screen.getAllByRole("combobox", { name: "Mission de Alice" })[0], { target: { value: "lecture" } });
  await waitFor(() => expect(simulation.attribuer).toHaveBeenCalledWith("d0", "u", "lecture"));
});
it("ne propose jamais l’invitation d’un administrateur client", () => {
  afficherDossiers();
  expect(screen.queryByRole("button", { name: /administrateur/i })).not.toBeInTheDocument();
  expect(screen.getAllByText(/support Ébène/)).toHaveLength(10);
});
