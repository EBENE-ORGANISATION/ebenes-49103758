import { describe, it, expect } from "vitest";
import {
  ajouterMois, capitalRestantDu, echeancier, ecritureDeblocage, ecritureEcheance, piecesComptabilisees, prochaineEcheance,
  saisiesEmprunts, ventilationEcheances, type Emprunt,
} from "./emprunts";
import { saisiesLiasse } from "./genererLiasse";

const emprunt = (p: Partial<Emprunt> = {}): Emprunt => ({
  id: 1, preteur: "Banque Atlantique", montant: 12_000_000, tauxAnnuel: 12, dureeMois: 36,
  periodicite: "mensuelle", dateDeblocage: "2026-01-15", compte: "162", tresorerie: "521", ...p,
});

const val = (s: { feuille: string; cellule: string; valeur: unknown }[], feuille: string, cellule: string) =>
  s.filter((x) => x.feuille === feuille && x.cellule === cellule).at(-1)?.valeur;

describe("emprunts", () => {
  it("ajouterMois ramène au dernier jour du mois", () => {
    expect(ajouterMois("2026-01-31", 1)).toBe("2026-02-28");
    expect(ajouterMois("2026-11-15", 3)).toBe("2027-02-15");
  });

  it("échéancier à annuités constantes : le capital est intégralement remboursé", () => {
    const ech = echeancier(emprunt());
    expect(ech).toHaveLength(36);
    expect(ech[0].interets).toBe(120_000); // 1 % du capital
    expect(ech[0].annuite).toBe(398_572); // annuité constante
    expect(ech.at(-1)!.restant).toBe(0);
    expect(ech.reduce((t, x) => t + x.capital, 0)).toBe(12_000_000);
    expect(ech[1].date).toBe("2026-03-15");
  });

  it("taux nul et périodicité trimestrielle", () => {
    const ech = echeancier(emprunt({ tauxAnnuel: 0, periodicite: "trimestrielle", dureeMois: 12, montant: 1_000_000 }));
    expect(ech.map((x) => x.capital)).toEqual([250_000, 250_000, 250_000, 250_000]);
    expect(ech.map((x) => x.interets)).toEqual([0, 0, 0, 0]);
  });

  it("capital restant dû et ventilation par échéance à la clôture", () => {
    const e = emprunt();
    const restant = capitalRestantDu(e, "2026-12-31");
    const v = ventilationEcheances(e, "2026-12-31");
    expect(v.unAn + v.unADeuxAns + v.plusDeDeuxAns).toBe(restant);
    expect(v.plusDeDeuxAns).toBe(echeancier(e).at(-1)!.capital); // seule l'échéance de janvier 2029
    expect(capitalRestantDu(e, "2025-12-31")).toBe(0);
    expect(prochaineEcheance(e, [1, 2])?.numero).toBe(3);
  });

  it("notes 16A et 1 : ventilation, écart comptable et sûretés", () => {
    const e = emprunt({ garantie: "hypotheque", montantGaranti: 5_000_000 });
    const restant = capitalRestantDu(e, "2026-12-31");
    const v = ventilationEcheances(e, "2026-12-31");
    const s = saisiesEmprunts([e], 2026, restant + 1000, restant + 1000 + 200_000);
    expect(val(s, "NOTE 16A", "F11")).toBe(v.unAn + 1000);
    expect(val(s, "NOTE 16A", "H11")).toBe(v.plusDeDeuxAns);
    expect(val(s, "NOTE 16A", "F20")).toBe(v.unAn + 1000 + 200_000);
    expect(val(s, "NOTE 1", "G14")).toBe(restant);
    expect(val(s, "NOTE 1", "H14")).toBe(5_000_000);
    expect(val(s, "NOTE 1", "I14")).toBe(0);
    expect(String(val(s, "NOTE 16A", "B43"))).toContain("Banque Atlantique");
  });

  it("générateur : la note 16A reprend le solde 162 et l'échéancier", () => {
    const e = emprunt({ montant: 1_200_000, dureeMois: 12, tauxAnnuel: 0 });
    const ecr = (piece: string, date: string, lignes: [string, number, number][]) => ({
      id: 0, journal: "OD", numeroPiece: piece, libelle: piece, statut: "valide", date, annee: 2026, mois: Number(date.slice(5, 7)),
      lignes: lignes.map(([compte, debit, credit], i) => ({ id: i + 1, compte, intitule: "", debit, credit })),
    });
    // Déblocage puis 11 échéances remboursées (100 000 chacune)
    const donnees = {
      "2026-1": { ecritures: [ecr("EMP", "2026-01-15", [["521", 1_200_000, 0], ["162", 0, 1_200_000]])], transactions: [], factures: [] },
      "2026-12": { ecritures: [ecr("REMB", "2026-12-15", [["162", 1_100_000, 0], ["521", 0, 1_100_000]])], transactions: [], factures: [] },
    } as never;
    const { saisies } = saisiesLiasse("normal", {
      donnees, annee: 2026, societe: { nom: "X" }, dateArrete: "2027-03-31", emprunts: [e],
    } as never);
    expect(val(saisies, "NOTE 16A", "B11")).toBe(100_000);
    expect(val(saisies, "NOTE 16A", "F11")).toBe(100_000);
    expect(val(saisies, "NOTE 16A", "G11")).toBe(0);
    expect(val(saisies, "NOTE 16A", "B20")).toBe(100_000);
  });

  it("écritures : déblocage et échéance équilibrés, pièces retrouvées", () => {
    const e = emprunt({ activiteId: "act-1" });
    const d = ecritureDeblocage(e);
    expect(d.numeroPiece).toBe("EMP-1-0");
    expect(d.journal).toBe("BQ");
    expect(d.lignes.map((l) => [l.compte, l.debit, l.credit])).toEqual([["521", 12_000_000, 0], ["162", 0, 12_000_000]]);
    const x = echeancier(e)[0];
    const r = ecritureEcheance(e, x);
    expect(r.lignes.map((l) => [l.compte, l.debit, l.credit])).toEqual([["162", x.capital, 0], ["6711", 120_000, 0], ["521", 0, x.annuite]]);
    expect(r.mois).toBe(2);
    expect(r.activiteId).toBe("act-1");
    const donnees = { "2026-1": { ecritures: [{ ...d, id: 1 }], transactions: [], factures: [] }, "2026-2": { ecritures: [{ ...r, id: 2 }], transactions: [], factures: [] } } as never;
    expect(piecesComptabilisees(donnees, 1)).toEqual([0, 1]);
    expect(piecesComptabilisees(donnees, 2)).toEqual([]);
  });
});
