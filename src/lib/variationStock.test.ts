import { describe, it, expect } from "vitest";
import { ecrituresVariationStock, pieceInventaire, pieceOuverture, quantiteALaDate } from "./variationStock";

const eau = { id: 1, stock: 108, prixAchat: 300, nature: "marchandise" as const, activiteId: "hotel" };
const detergent = { id: 2, stock: 44, prixAchat: 4500, nature: "consommable" as const, activiteId: "entretien" };
const mouvements = [
  { articleId: 1, date: "2026-10-08", type: "entree" as const, quantite: 120 },
  { articleId: 1, date: "2026-10-09", type: "sortie" as const, quantite: 12 },
  { articleId: 2, date: "2026-11-03", type: "entree" as const, quantite: 30 }, // après octobre
];

describe("quantiteALaDate", () => {
  it("retire les entrées postérieures, rajoute les sorties postérieures", () => {
    expect(quantiteALaDate(detergent, mouvements, "2026-10-31")).toBe(14);
    expect(quantiteALaDate(eau, mouvements, "2026-10-08")).toBe(120);
    expect(quantiteALaDate(eau, mouvements, "2026-09-30")).toBe(0);
  });

  it("annule l'écart d'un ajustement postérieur", () => {
    const aj = [{ articleId: 1, date: "2026-11-02", type: "ajustement" as const, quantite: 100, motif: "Inventaire (écart : -8)" }];
    expect(quantiteALaDate({ id: 1, stock: 100 }, aj, "2026-10-31")).toBe(108);
  });
});

describe("ecrituresVariationStock", () => {
  it("constate le stock de fin de mois par activité : achats du mois en variation, stock antérieur en à-nouveaux", () => {
    const e = ecrituresVariationStock([eau, detergent], mouvements, [], 2026, 10);
    // Détergent : 14 bidons déjà là au 1er octobre (entrée de novembre exclue) → à-nouveaux, sans variation
    expect(e.map((x) => [x.activiteId, x.numeroPiece, x.date])).toEqual([
      ["entretien", "INV-OUV-2026-10", "2026-10-01"],
      ["hotel", "INV-2026-10", "2026-10-31"],
    ]);
    expect(e[0].lignes.map((l) => [l.compte, l.debit, l.credit])).toEqual([["331", 63000, 0], ["121", 0, 63000]]);
    expect(e[1].lignes.map((l) => [l.compte, l.debit, l.credit])).toEqual([["311", 32400, 0], ["6031", 0, 32400]]);
  });

  it("le mois suivant, n'enregistre que l'écart avec le solde du compte de stock", () => {
    const octobre = ecrituresVariationStock([eau], mouvements, [], 2026, 10);
    const novembre = ecrituresVariationStock(
      [{ ...eau, stock: 58 }],
      [...mouvements, { articleId: 1, date: "2026-11-15", type: "sortie" as const, quantite: 50 }],
      octobre, 2026, 11,
    );
    expect(novembre[0].numeroPiece).toBe(pieceInventaire(2026, 11));
    expect(novembre[0].lignes.map((l) => [l.compte, l.debit, l.credit])).toEqual([["311", 0, 15000], ["6031", 15000, 0]]);
  });

  it("refaire le même mois remplace l'écriture (pas de doublon) ; rien si le stock est déjà juste", () => {
    const octobre = ecrituresVariationStock([eau], mouvements, [], 2026, 10);
    expect(ecrituresVariationStock([eau], mouvements, octobre, 2026, 10)).toEqual(octobre);
    const novembre = ecrituresVariationStock([eau], mouvements, octobre, 2026, 11);
    expect(novembre).toEqual([]);
  });

  it("première constatation : le stock présent au début du mois passe en à-nouveaux, pas en résultat", () => {
    // 50 ramettes déjà là au 1er octobre (stock initial), 10 vendues en octobre
    const ramette = { id: 5, stock: 40, prixAchat: 3000, nature: "marchandise" as const, activiteId: "info" };
    const mvts = [{ articleId: 5, date: "2026-10-12", type: "sortie" as const, quantite: 10 }];
    const [an, od] = ecrituresVariationStock([ramette], mvts, [], 2026, 10);
    expect(an).toMatchObject({ journal: "AN", numeroPiece: pieceOuverture(2026, 10), date: "2026-10-01" });
    expect(an.lignes.map((l) => [l.compte, l.debit, l.credit])).toEqual([["311", 150000, 0], ["121", 0, 150000]]);
    // Variation du mois : 120 000 − 150 000 = −30 000 (stock consommé, en charge)
    expect(od.lignes.map((l) => [l.compte, l.debit, l.credit])).toEqual([["311", 0, 30000], ["6031", 30000, 0]]);
    // Le mois suivant, plus d'à-nouveaux : le stock est déjà en comptabilité
    const novembre = ecrituresVariationStock([ramette], mvts, [an, od], 2026, 11);
    expect(novembre.some((e) => e.journal === "AN")).toBe(false);
  });
});
