import { describe, it, expect } from "vitest";
import type { DonneesMensuelles, EcritureComptable } from "@/types/ebene";
import { ouvertureProvisoire } from "./soldesComptables";

let id = 0;
const ecr = (journal: string, numeroPiece: string, lignes: [string, number, number][]): EcritureComptable => ({
  id: ++id, journal: journal as EcritureComptable["journal"], numeroPiece, libelle: numeroPiece, statut: "valide",
  lignes: lignes.map(([compte, debit, credit], i) => ({ id: i + 1, compte, intitule: compte, debit, credit })),
});
const mois = (ecritures: EcritureComptable[]) => ({ transactions: [], factures: [], primes: {}, ecritures });

describe("ouvertureProvisoire", () => {
  // 2026 non clôturé : apport 1 000 000, vente 300 000 encaissée, charge 100 000
  const donnees: DonneesMensuelles = {
    "2026-1": mois([ecr("BQ", "APP", [["521", 1_000_000, 0], ["101", 0, 1_000_000]])]),
    "2026-6": mois([
      ecr("VE", "V1", [["521", 300_000, 0], ["706", 0, 300_000]]),
      ecr("AC", "A1", [["6052", 100_000, 0], ["521", 0, 100_000]]),
    ]),
  };

  it("reprend les comptes de bilan et reporte le résultat non affecté en 12", () => {
    const o = ouvertureProvisoire(donnees, 2027);
    expect(o.get("521")).toBe(1_200_000);
    expect(o.get("101")).toBe(-1_000_000);
    expect(o.get("12")).toBe(-200_000);
    expect(o.has("706")).toBe(false);
    // Ouverture équilibrée
    expect([...o.values()].reduce((a, b) => a + b, 0)).toBe(0);
  });

  it("rien si l'exercice a ses à-nouveaux ou s'il n'y a rien avant", () => {
    const avecAN = { ...donnees, "2027-1": mois([ecr("AN", "AN-2027", [["521", 1_200_000, 0], ["101", 0, 1_000_000], ["121", 0, 200_000]])]) };
    expect(ouvertureProvisoire(avecAN, 2027).size).toBe(0);
    expect(ouvertureProvisoire(donnees, 2026).size).toBe(0);
  });
});
