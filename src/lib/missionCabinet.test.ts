import { describe, expect, it } from "vitest";
import { permissionsMission } from "./missionCabinet";
import type { MissionCabinet, RoleCabinet } from "./cabinetOps";
import { MODULE_CHILDREN, type AppModule } from "./permissions";

const modules = ["compta", "fiscalite", "grh", "factures", "stock", "immobilisations", "parametres", "dashboard"] as const;
const matrice: Record<MissionCabinet, number[]> = {
  tenue_complete: [3, 3, 3, 3, 3, 3, 1, 1],
  compta_fiscalite: [3, 3, 1, 1, 1, 3, 1, 1],
  paie_social: [1, 1, 3, 0, 0, 0, 1, 1],
  declarations: [1, 3, 1, 1, 1, 1, 1, 1],
  lecture: [1, 1, 1, 1, 1, 1, 1, 1],
};
const niveaux = ["none", "read", "write", "validate"];

describe("droits d'une mission de cabinet", () => {
  for (const [mission, attendus] of Object.entries(matrice)) {
    for (const role of ["responsable", "collaborateur", "stagiaire"] as RoleCabinet[]) {
      for (const etat of ["actif", "depart_demande", "invitation", "termine"] as const) {
        it(`${mission}, ${role}, ${etat} : matrice et héritage`, () => {
          const droits = permissionsMission(mission as MissionCabinet, role, etat);
          modules.forEach((module, i) => {
            const plafond = etat === "actif" ? (role === "stagiaire" ? 2 : 3) : etat === "depart_demande" ? 1 : 0;
            expect(droits[module]).toBe(niveaux[Math.min(attendus[i], plafond)]);
          });
          expect(droits.parametres_sociaux).toBe(droits.grh);
          for (const [parent, enfants] of Object.entries(MODULE_CHILDREN)) {
            for (const enfant of enfants) expect(droits[enfant]).toBe(droits[parent as AppModule]);
          }
        });
      }
    }
  }
});
