import { describe, it, expect } from "vitest";
import { compteResultat, fiscaliteDepuisEcritures, repartirSoldes, resultatExercice, sommePrefixes } from "./etatsFinanciers";

/** Soldes (débit − crédit) de la société de test après la simulation d'octobre 2026. */
const soldesSimulation = () =>
  new Map<string, number>([
    ["4111", 0],
    ["706", -1_670_000], // ventes de services
    ["4431", -300_600], // TVA collectée
    ["521", 1_770_000],
    ["571", 200_600],
    ["5211", 1_000_000 - 53_100 - 236_000],
    ["101", -1_000_000], // apport en capital
    ["6057", 250_000], // achats fournisseurs
    ["4452", 36_000 + 8_100], // TVA déductible
    ["4011", 286_000 - 236_000 - 50_000],
    ["6281", 45_000], // téléphone
  ]);

describe("compteResultat — soldes intermédiaires SYSCOHADA", () => {
  it("une société de services a une valeur ajoutée et un résultat (le CA 706 entre dans XC)", () => {
    const r = compteResultat(soldesSimulation());
    expect(r.chiffreAffaires).toBe(1_670_000);
    expect(r.margeCommerciale).toBe(0);
    expect(r.autresAchats).toBe(250_000);
    expect(r.servicesExterieurs).toBe(45_000);
    expect(r.valeurAjoutee).toBe(1_375_000);
    expect(r.resultatNet).toBe(1_375_000);
  });

  it("le résultat net du compte de résultat égale produits − charges", () => {
    const s = soldesSimulation();
    expect(compteResultat(s).resultatNet).toBe(resultatExercice(s));
  });

  it("négoce : la marge commerciale est retirée une seule fois", () => {
    const s = new Map([["701", -1_000_000], ["601", 600_000], ["6031", -50_000]]);
    const r = compteResultat(s);
    expect(r.margeCommerciale).toBe(450_000);
    expect(r.valeurAjoutee).toBe(450_000);
  });

  it("dotations et reprises : exploitation et financier ne se recoupent plus", () => {
    const s = new Map([
      ["706", -1_000_000],
      ["6813", 100_000], // dotation aux amortissements d'exploitation
      ["6971", 20_000], // dotation aux provisions financières
      ["7971", -5_000], // reprise de provisions financières
    ]);
    const r = compteResultat(s);
    expect(r.dotationsAmortProv).toBe(100_000);
    expect(r.reprisesAmortProv).toBe(0);
    expect(r.resultatFinancier).toBe(-15_000);
    expect(r.resultatNet).toBe(885_000);
    expect(r.resultatNet).toBe(resultatExercice(s));
  });
});

describe("repartirSoldes — un compte dans une seule ligne", () => {
  it("le préfixe le plus précis l'emporte (10 / 109, 56 / 561)", () => {
    const s = new Map([["101", -500_000], ["109", 100_000], ["5611", -30_000], ["562", -20_000]]);
    const t = repartirSoldes(s, [
      { ref: "CA", prefixes: ["10"] },
      { ref: "CB", prefixes: ["109"] },
      { ref: "DQ", prefixes: ["561", "564", "565"] },
      { ref: "DR", prefixes: ["56"] },
    ]);
    expect(t).toEqual({ CA: -500_000, CB: 100_000, DQ: -30_000, DR: -20_000 });
    // La somme des lignes ne compte aucun solde deux fois
    expect(Object.values(t).reduce((a, b) => a + b, 0)).toBe(sommePrefixes(s, ["10", "56"]));
  });
});

describe("fiscaliteDepuisEcritures — chiffres fiscaux du mois", () => {
  const e = (lignes: [string, number, number][], statut = "valide") => ({
    statut,
    lignes: lignes.map(([compte, debit, credit]) => ({ compte, debit, credit })),
  });

  it("CA HT, TVA collectée et déductible de tous les journaux, résultat", () => {
    const f = fiscaliteDepuisEcritures([
      e([["4111", 1_770_000, 0], ["706", 0, 1_500_000], ["4431", 0, 270_000]]), // vente facturée
      e([["521", 354_000, 0], ["706", 0, 300_000], ["4431", 0, 54_000]]), // recette avec TVA
      e([["6055", 200_000, 0], ["4452", 36_000, 0], ["4011", 0, 236_000]]), // achat
      e([["6281", 45_000, 0], ["4452", 8_100, 0], ["5211", 0, 53_100]]), // saisie guidée
      e([["6222", 350_000, 0], ["521", 0, 350_000]], "brouillon"), // ignorée
    ]);
    expect(f.caHT).toBe(1_800_000);
    expect(f.caService).toBe(1_800_000);
    expect(f.caCommerce).toBe(0);
    expect(f.tvaCollectee).toBe(324_000);
    expect(f.tvaDeductible).toBe(44_100);
    expect(f.resultat).toBe(1_800_000 - 245_000);
  });

  it("commerce (701) séparé du service pour la patente", () => {
    const f = fiscaliteDepuisEcritures([e([["571", 100_000, 0], ["701", 0, 100_000]]), e([["571", 50_000, 0], ["706", 0, 50_000]])]);
    expect([f.caCommerce, f.caService]).toEqual([100_000, 50_000]);
  });

  it("déclaration TVA : ventes avec TVA (L1) séparées des ventes sans TVA (L2)", () => {
    const f = fiscaliteDepuisEcritures([
      e([["4111", 118_000, 0], ["706", 0, 100_000], ["4431", 0, 18_000]]), // facture avec TVA
      e([["521", 300_000, 0], ["706", 0, 300_000]]), // recette sans TVA
      e([["4111", 0, 118_000], ["706", 100_000, 0], ["4431", 18_000, 0]]), // facture annulée (contre-passation)
      e([["4111", 59_000, 0], ["701", 0, 50_000], ["4431", 0, 9_000]]),
    ]);
    expect(f.caTaxable).toBe(50_000);
    expect(f.caNonTaxable).toBe(300_000);
    expect(f.caHT).toBe(350_000);
  });
});

describe("fiscaliteDepuisEcritures — liquidation et règlement de TVA", () => {
  const e = (lignes: [string, number, number][], extra: Record<string, unknown> = {}) =>
    ({ statut: "valide", lignes: lignes.map(([compte, debit, credit]) => ({ compte, debit, credit, ...extra })) });
  const vente = e([["4111", 1_180_000, 0], ["701", 0, 1_000_000], ["4431", 0, 180_000]]);
  const achat = e([["601", 400_000, 0], ["4452", 72_000, 0], ["4011", 0, 472_000]]);

  it("la liquidation du mois (4431 / 4452 / 4441) n'annule pas la TVA déclarée", () => {
    const liquidation = e([["4431", 180_000, 0], ["4452", 0, 72_000], ["4441", 0, 108_000]]);
    const f = fiscaliteDepuisEcritures([vente, achat, liquidation]);
    expect(f.tvaCollectee).toBe(180_000);
    expect(f.tvaDeductible).toBe(72_000);
  });

  it("le règlement direct par la banque non plus", () => {
    const reglement = e([["4431", 180_000, 0], ["4452", 0, 72_000], ["521", 0, 108_000]]);
    expect(fiscaliteDepuisEcritures([vente, achat, reglement]).tvaCollectee).toBe(180_000);
  });

  it("une contre-passation de TVA (annulation de facture) reste déduite", () => {
    const annulation = e([["4432", 24_000, 0], ["4438", 0, 24_000]]);
    const encaissement = e([["4438", 24_000, 0], ["4432", 0, 24_000]]);
    expect(fiscaliteDepuisEcritures([encaissement, annulation]).tvaCollectee).toBe(0);
  });
});

describe("creditTvaReporte — ligne L16", () => {
  const mois = (collectee: number, deductible: number) => ({
    ecritures: [
      { statut: "valide", lignes: [{ compte: "4111", debit: collectee, credit: 0 }, { compte: "4431", debit: 0, credit: collectee }] },
      { statut: "valide", lignes: [{ compte: "4452", debit: deductible, credit: 0 }, { compte: "4011", debit: 0, credit: deductible }] },
    ],
  });
  it("enchaîne les crédits jusqu'à leur imputation", async () => {
    const { creditTvaReporte } = await import("./etatsFinanciers");
    const d = { "2026-9": mois(100, 400), "2026-10": mois(250, 0), "2026-11": mois(10, 0) } as never;
    expect(creditTvaReporte(d, 2026, 9)).toBe(0);
    expect(creditTvaReporte(d, 2026, 10)).toBe(300);
    expect(creditTvaReporte(d, 2026, 11)).toBe(50);
    expect(creditTvaReporte(d, 2026, 12)).toBe(40);
  });
});
