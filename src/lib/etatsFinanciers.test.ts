import { describe, it, expect } from "vitest";
import { compteResultat, repartirSoldes, resultatExercice, sommePrefixes } from "./etatsFinanciers";

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
