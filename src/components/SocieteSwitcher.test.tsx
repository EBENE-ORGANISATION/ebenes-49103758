import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import fr from "@/i18n/locales/fr";
import en from "@/i18n/locales/en";
import type { Societe } from "@/hooks/useTenant";
import type { DossierCabinet } from "@/lib/cabinetOps";
import { SocieteSwitcher } from "./SocieteSwitcher";

const simulation = vi.hoisted(() => ({ societes: [] as Societe[], dossiers: [] as DossierCabinet[], superAdmin: false }));
vi.mock("@/hooks/useTenant", async (importe) => ({
  ...await importe<typeof import("@/hooks/useTenant")>(),
  useTenant: () => ({ societes: simulation.societes, currentSociete: null, isSuperAdmin: simulation.superAdmin }),
}));
vi.mock("@/hooks/useDossiersCabinet", () => ({ useDossiersCabinet: () => ({ dossiers: simulation.dossiers }) }));
const societe = (id: string) => ({ id, nom: id, slug: id.toLowerCase() }) as Societe;
const dossier = (id: string, mission: DossierCabinet["mission"] = "tenue_complete", etat: DossierCabinet["etat"] = "actif"): DossierCabinet => ({ societe_id: id, societe_nom: id, cabinet_nom: "Cabinet", mission, etat, mon_role: "responsable" });
const Adresse = () => <output data-testid="adresse">{useLocation().search}</output>;
async function ouvrir(langue = "fr") {
  const traduction = createInstance();
  await traduction.init({ lng: langue, resources: { fr: { translation: fr }, en: { translation: en } } });
  render(<I18nextProvider i18n={traduction}><MemoryRouter><SocieteSwitcher /><Adresse /></MemoryRouter></I18nextProvider>);
  fireEvent.keyDown(screen.getByRole("button"), { key: "Enter" });
  return screen.findByRole("menu");
}
beforeEach(() => { simulation.societes = [societe("Interne A"), societe("Interne B")]; simulation.dossiers = []; simulation.superAdmin = false; });
afterEach(cleanup);

it("place les sociétés internes avant les trois clients, sans doublon, et navigue avec sid", async () => {
  simulation.dossiers = [dossier("Client A"), dossier("Client B", "compta_fiscalite"), dossier("Client C", "paie_social", "depart_demande")];
  simulation.societes.push(societe("Client A"));
  const menu = await ouvrir();
  expect(within(menu).getByText("Mes sociétés")).toBeInTheDocument();
  expect(within(menu).getByText("Clients du cabinet")).toBeInTheDocument();
  expect(within(menu).getAllByRole("menuitem").map(element => element.textContent)).toEqual([
    "Interne Ainterne a", "Interne Binterne b", "Client ATenue complète", "Client BComptabilité et fiscalité", "Client CPaie et socialDépart en cours",
  ]);
  fireEvent.click(within(menu).getByText("Client C"));
  expect(screen.getByTestId("adresse")).toHaveTextContent("?sid=Client%20C");
});
it.each([["declarations", "Déclarations"], ["lecture", "Lecture seule"]] as const)("affiche la mission %s", async (mission, libelle) => {
  simulation.dossiers = [dossier("Client", mission)];
  expect(within(await ouvrir()).getByText(libelle)).toBeInTheDocument();
});
it("conserve la liste historique sans cabinet, même au-delà de huit sociétés", async () => {
  simulation.societes = Array.from({ length: 9 }, (_, indice) => societe(`Société ${indice}`));
  const menu = await ouvrir();
  expect(within(menu).getByText("Sociétés")).toBeInTheDocument();
  expect(screen.queryByText("Mes sociétés")).not.toBeInTheDocument();
  expect(screen.queryByText("Clients du cabinet")).not.toBeInTheDocument();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(within(menu).getAllByRole("menuitem")).toHaveLength(9);
});
it("ne montre pas de recherche à huit sociétés uniques", async () => {
  simulation.dossiers = Array.from({ length: 6 }, (_, indice) => dossier(`Client ${indice}`));
  simulation.societes.push(societe("Client 0"));
  await ouvrir();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
});
it("filtre les deux groupes au-delà de huit sociétés", async () => {
  simulation.dossiers = Array.from({ length: 7 }, (_, indice) => dossier(`Client ${indice}`));
  const menu = await ouvrir();
  const recherche = screen.getByRole("textbox", { name: "Rechercher une société" });
  fireEvent.change(recherche, { target: { value: " CLIENT 2 " } });
  expect(within(menu).getAllByRole("menuitem")).toHaveLength(1);
  expect(within(menu).getByText("Client 2")).toBeInTheDocument();
  fireEvent.change(recherche, { target: { value: "interne a" } });
  expect(within(menu).getAllByRole("menuitem")).toHaveLength(1);
  fireEvent.change(recherche, { target: { value: "absent" } });
  expect(within(menu).getByText("Aucune société trouvée")).toBeInTheDocument();
});
it("traduit les groupes et les badges en anglais", async () => {
  simulation.dossiers = [dossier("Client", "lecture", "depart_demande")];
  const menu = await ouvrir("en");
  for (const texte of ["My companies", "Firm clients", "Read only", "Departure in progress"]) expect(within(menu).getByText(texte)).toBeInTheDocument();
});
it("permet de choisir entre des dossiers seuls", async () => {
  simulation.societes = [];
  simulation.dossiers = [dossier("Client A"), dossier("Client B")];
  expect(within(await ouvrir()).getAllByRole("menuitem")).toHaveLength(2);
});
it("garde le retour à la vue globale du super-administrateur", async () => {
  simulation.superAdmin = true;
  const menu = await ouvrir();
  fireEvent.click(within(menu).getByText("🏠 Ébène Suite"));
  expect(screen.getByTestId("adresse").textContent).toBe("");
});

it("reste masqué avec une seule société sans cabinet", async () => {
  simulation.societes = [societe("Unique")];
  const traduction = createInstance();
  await traduction.init({ lng: "fr", resources: { fr: { translation: fr } } });
  render(<I18nextProvider i18n={traduction}><MemoryRouter><SocieteSwitcher /></MemoryRouter></I18nextProvider>);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it("ne propose ni les invitations ni les dossiers terminés", async () => {
  simulation.dossiers = [dossier("Invitation", "lecture", "invitation"), dossier("Terminé", "lecture", "termine")];
  const menu = await ouvrir();
  expect(within(menu).getAllByRole("menuitem")).toHaveLength(2);
  expect(screen.queryByText("Clients du cabinet")).not.toBeInTheDocument();
});
