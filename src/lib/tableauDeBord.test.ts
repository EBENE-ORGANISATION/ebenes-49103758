import { describe, it, expect } from "vitest";
import type { DonneesMensuelles, EcritureComptable, Facture, MoisData } from "@/types/ebene";
import {
  embaucheAvantFinMois,
  facturesEnAttenteFinMois,
  fluxTresorerieMois,
  soldesFinMois,
  tresorerieFinMois,
} from "./tableauDeBord";

let id = 0;
const ecr = (journal: string, numeroPiece: string, lignes: [string, number, number][], statut: EcritureComptable["statut"] = "valide"): EcritureComptable => ({
  id: ++id,
  journal: journal as EcritureComptable["journal"],
  numeroPiece,
  libelle: numeroPiece,
  statut,
  lignes: lignes.map(([compte, debit, credit], i) => ({ id: i + 1, compte, intitule: compte, debit, credit })),
});
const mois = (ecritures: EcritureComptable[], factures: Partial<Facture>[] = []): MoisData => ({
  transactions: [], factures: factures as Facture[], primes: {}, ecritures,
});

/**
 * 2025 : encaissement de 1 000 000, paie de 300 000 (écriture de bulletin).
 * Clôture : à-nouveaux 2026 qui reprennent la banque à 700 000.
 * 2026 : vente encaissée 500 000 en janvier, virement banque → caisse en février,
 * dépense de 50 000 en mars.
 */
const donnees = (): DonneesMensuelles => ({
  "2025-03": mois([ecr("BQ", "FAC-1", [["521", 1_000_000, 0], ["4111", 0, 1_000_000]])]),
  "2025-06": mois([{ ...ecr("BQ", "PAIE-6", [["422", 300_000, 0], ["521", 0, 300_000]]), bulletinId: "b1" }]),
  "2026-01": mois([
    ecr("AN", "AN-2026", [["521", 700_000, 0], ["101", 0, 700_000]]),
    ecr("BQ", "FAC-2", [["521", 500_000, 0], ["4111", 0, 500_000]]),
  ]),
  "2026-02": mois([ecr("BQ", "VIR-1", [["571", 100_000, 0], ["521", 0, 100_000]])]),
  "2026-03": mois([
    ecr("BQ", "TR-9", [["6052", 50_000, 0], ["521", 0, 50_000]]),
    ecr("BQ", "BROUILLON", [["521", 0, 999_999], ["6", 999_999, 0]], "brouillon"),
  ]),
});

describe("tresorerieFinMois — trésorerie comme le grand livre", () => {
  it("part des à-nouveaux : l'exercice clos n'est pas compté deux fois", () => {
    expect(tresorerieFinMois(donnees(), 2026, 1)).toBe(1_200_000);
  });

  it("ne compte pas les mois suivant la période affichée", () => {
    expect(tresorerieFinMois(donnees(), 2026, 2)).toBe(1_200_000);
    expect(tresorerieFinMois(donnees(), 2026, 3)).toBe(1_150_000);
  });

  it("avant la clôture, cumule l'exercice en cours, paie comprise", () => {
    expect(tresorerieFinMois(donnees(), 2025, 3)).toBe(1_000_000);
    expect(tresorerieFinMois(donnees(), 2025, 12)).toBe(700_000);
  });

  it("ignore les brouillons", () => {
    expect(soldesFinMois(donnees(), 2026, 3).get("521")).toBe(1_050_000);
  });
});

describe("fluxTresorerieMois", () => {
  it("un virement interne n'est ni une entrée ni une sortie", () => {
    expect(fluxTresorerieMois(donnees()["2026-02"])).toEqual({ entrees: 0, sorties: 0 });
  });

  it("les à-nouveaux ne sont pas des encaissements du mois", () => {
    expect(fluxTresorerieMois(donnees()["2026-01"])).toEqual({ entrees: 500_000, sorties: 0 });
  });

  it("la paie payée par écriture de bulletin est une sortie", () => {
    expect(fluxTresorerieMois(donnees()["2025-06"])).toEqual({ entrees: 0, sorties: 300_000 });
  });
});

describe("facturesEnAttenteFinMois", () => {
  const d: DonneesMensuelles = {
    "2024-10": mois([], [{ statut: "en_attente", totalTtc: 643_100 }]),
    "2026-09": mois([], [{ statut: "en_attente", totalTtc: 354_000 }, { statut: "payee", totalTtc: 1 }]),
    "2026-10": mois([], [{ statut: "en_attente", totalTtc: 746_400 }]),
  };
  it("reprend les impayées des mois précédents, pas celles des mois suivants", () => {
    expect(facturesEnAttenteFinMois(d, 2026, 10).reduce((s, f) => s + f.totalTtc, 0)).toBe(1_743_500);
    expect(facturesEnAttenteFinMois(d, 2026, 9).length).toBe(2);
  });
});

describe("embaucheAvantFinMois", () => {
  it("un salarié embauché le 1er octobre n'entre pas dans la masse salariale de septembre", () => {
    expect(embaucheAvantFinMois({ dateEmbauche: "2026-10-01" }, 2026, 9)).toBe(false);
    expect(embaucheAvantFinMois({ dateEmbauche: "2026-10-01" }, 2026, 10)).toBe(true);
    expect(embaucheAvantFinMois({ dateEmbauche: "2026-10-31" }, 2026, 10)).toBe(true);
    expect(embaucheAvantFinMois({}, 2026, 1)).toBe(true);
  });
});
