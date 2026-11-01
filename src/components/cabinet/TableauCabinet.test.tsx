import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import i18n from "@/i18n";
import type { TableauCabinetResultat } from "@/lib/tableauCabinet";
import { TableauCabinet } from "./TableauCabinet";

const simulation = vi.hoisted(() => ({ tableau: vi.fn(), marquer: vi.fn(), role: "collaborateur", mesDossiers: [] as unknown[] }));
vi.mock("@/hooks/data/useTableauCabinet", () => ({
  useTableauCabinet: simulation.tableau,
  useMarquerDeclaration: () => ({ mutate: simulation.marquer, isPending: false }),
}));
// Mes dossiers : mission et état du dossier, rôle simulé, sauf surcharge par un test.
vi.mock("@/hooks/useDossiersCabinet", () => ({ useDossiersCabinet: () => ({ dossiers: simulation.mesDossiers }) }));
const resultat = (): TableauCabinetResultat => ({
  cabinet_id: "cabinet", responsable: false, charge: null,
  dossiers: [{ dossier_id: "dossier", societe_id: "societe", societe_nom: "Société A", mission: "compta_fiscalite", etat: "actif",
    echeances: [
      { type: "TVA", annee: 2026, mois: 10, echeance: "2026-11-15", etat: "faite", marquee: { statut: "payee", date: "2026-11-12", par_nom: "Alice" } },
      { type: "CNSS", annee: 2026, mois: 10, echeance: "2026-11-15", etat: "a_faire", marquee: null },
      { type: "IRPP", annee: 2026, mois: 10, echeance: "2026-11-15", etat: "en_retard", marquee: null },
      { type: "patente", annee: 2026, mois: 10, echeance: null, etat: "sans_objet", marquee: null },
    ], pieces: { transactions: 2, factures: 0, ecritures_brouillon: 0, sans_justificatif: 1 },
    avancement: { dernier_mois: "2026-10", bulletins_faits: 2, bulletins_attendus: 3, exercice_precedent_cloture: false },
  }],
});
let donnees: TableauCabinetResultat;
beforeAll(async () => { await i18n.changeLanguage("fr"); });
beforeEach(() => {
  donnees = resultat(); simulation.role = "collaborateur"; simulation.mesDossiers = []; vi.clearAllMocks();
  simulation.tableau.mockImplementation(() => ({ data: donnees, isLoading: false, isError: false }));
});
afterEach(cleanup);
const mesDossiers = () => donnees.dossiers.map(d => ({ societe_id: d.societe_id, mission: d.mission, etat: d.etat, mon_role: simulation.role }));
const afficher = () => {
  if (!simulation.mesDossiers.length) simulation.mesDossiers = mesDossiers();
  return render(<TableauCabinet />);
};

it("affiche chaque dossier, sa mission, les quatre états, les pièces et l’avancement", () => {
  donnees.dossiers.push({ ...donnees.dossiers[0], dossier_id: "autre", societe_nom: "Société B" });
  afficher();
  const lignes = screen.getAllByRole("row").slice(1);
  expect(lignes).toHaveLength(2);
  expect(within(lignes[0]).getByText("Société A")).toBeInTheDocument();
  expect(within(lignes[1]).getByText("Société B")).toBeInTheDocument();
  for (const ligne of lignes) {
    const vue = within(ligne);
    expect(vue.getByText("Comptabilité et fiscalité")).toBeInTheDocument();
    for (const etat of ["Faite", "À faire", "En retard", "Sans objet"]) expect(vue.getByText(etat)).toBeInTheDocument();
    expect(vue.getByText("3 pièces à traiter")).toBeInTheDocument();
    expect(vue.getByText("2 / 3 bulletins")).toBeInTheDocument();
    expect(vue.getByText(/Alice/)).toHaveTextContent("12/11/2026");
  }
  expect(screen.queryByText("Charge de l’équipe")).not.toBeInTheDocument();
});
it("affiche la charge dès qu’elle est non nulle, y compris vide", () => {
  donnees.charge = [{ user_id: "alice", nom: "Alice", role: "collaborateur", dossiers: 1, pieces: 3 }];
  const vue = afficher();
  expect(screen.getByRole("heading", { name: "Charge de l’équipe" })).toBeInTheDocument();
  expect(screen.getByText("1 dossiers · 3 pièces")).toBeInTheDocument();
  donnees.charge = []; vue.rerender(<TableauCabinet />);
  expect(screen.getByRole("heading", { name: "Charge de l’équipe" })).toBeInTheDocument();
});
it.each(["Déposée", "Payée"])("marque une échéance à faire : %s", statut => {
  afficher();
  fireEvent.click(screen.getByRole("button", { name: /CNSS.*À faire/ }));
  fireEvent.click(screen.getByRole("button", { name: statut }));
  expect(simulation.marquer.mock.calls[0][0]).toEqual({ societe_id: "societe", annee: 2026, mois: 10, type: "CNSS", statut: statut === "Payée" ? "payee" : "deposee" });
});
it("permet aussi de marquer une échéance en retard", () => {
  afficher();
  fireEvent.click(screen.getByRole("button", { name: /IRPP.*En retard/ }));
  expect(screen.getByRole("button", { name: "Payée" })).toBeInTheDocument();
});
it("autorise le stagiaire au niveau fiscalité 2", () => {
  simulation.role = "stagiaire";
  afficher();
  expect(screen.getByRole("button", { name: /CNSS.*À faire/ })).toBeInTheDocument();
});
it("affiche un dossier neuf et un auteur inconnu sans erreur", () => {
  donnees.dossiers[0].avancement.dernier_mois = null;
  donnees.dossiers[0].echeances[0].marquee!.par_nom = null;
  afficher();
  expect(screen.getByText("Dernier mois saisi : aucune saisie")).toBeInTheDocument();
  expect(screen.getByText(/Payée par un membre du cabinet/)).toBeInTheDocument();
});
it.each([
  ["paie_social", "collaborateur", "actif"], ["lecture", "stagiaire", "actif"],
  ["compta_fiscalite", "collaborateur", "depart_demande"],
] as const)("ne propose aucune action pour %s / %s / %s", (mission, role, etat) => {
  donnees.dossiers[0].mission = mission; donnees.dossiers[0].etat = etat; simulation.role = role;
  afficher();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
it("transmet le changement de mois et d’année au hook", () => {
  afficher();
  fireEvent.change(screen.getByLabelText("Mois"), { target: { value: "12" } });
  fireEvent.change(screen.getByLabelText("Année"), { target: { value: "2027" } });
  expect(simulation.tableau).toHaveBeenLastCalledWith(2027, 12);
});
it.each(["chargement", "erreur", "vide"])("affiche l’état %s", etat => {
  simulation.tableau.mockReturnValue({ data: { ...donnees, dossiers: [] }, isLoading: etat === "chargement", isError: etat === "erreur" });
  afficher();
  if (etat === "chargement") expect(screen.getByRole("status")).toBeInTheDocument();
  else if (etat === "erreur") expect(screen.getByRole("alert")).toBeInTheDocument();
  else expect(screen.getByText("Aucun dossier à suivre pour cette période.")).toBeInTheDocument();
});
it("suit la mission de l’attribution plutôt que celle du dossier", () => {
  donnees.dossiers[0].mission = "tenue_complete";
  simulation.mesDossiers = [{ societe_id: "societe", mission: "lecture", etat: "actif", mon_role: "stagiaire" }];
  render(<TableauCabinet />);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
it("ne propose aucune action sans lien avec la société", () => {
  simulation.mesDossiers = [{ societe_id: "autre", mission: "tenue_complete", etat: "actif", mon_role: "responsable" }];
  render(<TableauCabinet />);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
