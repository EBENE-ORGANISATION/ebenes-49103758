import type { EtatDossierCabinet, MissionCabinet, RoleCabinet } from "./cabinetOps";
import { ALL_MODULES, MODULE_CHILDREN, type AccessLevel, type AppModule, type PermissionMap } from "./permissions";

type ModuleCabinet = AppModule | "parametres";
export type PermissionsCabinet = PermissionMap & { parametres: AccessLevel };
const modules: ModuleCabinet[] = ["compta", "fiscalite", "grh", "factures", "stock", "immobilisations", "parametres", "dashboard"];
const matrice: Record<MissionCabinet, number[]> = {
  tenue_complete: [3, 3, 3, 3, 3, 3, 1, 1],
  compta_fiscalite: [3, 3, 1, 1, 1, 3, 1, 1],
  paie_social: [1, 1, 3, 0, 0, 0, 1, 1],
  declarations: [1, 3, 1, 1, 1, 1, 1, 1],
  lecture: [1, 1, 1, 1, 1, 1, 1, 1],
};
const niveaux: AccessLevel[] = ["none", "read", "write", "validate"];

/** Reflète niveau_mission ; les plafonds ne peuvent jamais ouvrir un module. */
export function permissionsMission(mission: MissionCabinet, role: RoleCabinet, etat: EtatDossierCabinet): PermissionsCabinet {
  const droits = Object.fromEntries([...ALL_MODULES, "parametres"].map((module) => [module, "none"])) as PermissionsCabinet;
  if (etat !== "actif" && etat !== "depart_demande") return droits;
  const plafond = etat === "depart_demande" ? 1 : role === "stagiaire" ? 2 : 3;
  modules.forEach((module, index) => { droits[module] = niveaux[Math.min(matrice[mission][index], plafond)]; });
  droits.parametres_sociaux = droits.grh;
  for (const [parent, enfants] of Object.entries(MODULE_CHILDREN)) {
    for (const enfant of enfants) droits[enfant] = droits[parent as AppModule];
  }
  return droits;
}
