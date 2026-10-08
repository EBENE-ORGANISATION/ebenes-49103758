import { describe, it, expect } from "vitest";
import type { Employe, MoisData, TauxFiscaux } from "@/types/ebene";
import { TAUX_DEFAUT } from "@/types/ebene";
import { calculerPaie } from "./paie";
import { tauxAnciennete } from "./ebene-utils";

const moisVide: MoisData = {
  transactions: [],
  factures: [],
  absences: [],
  primes: {},
  heuresSup: {},
  retenues: {},
  mouvementsStock: [],
  devis: [],
  ecritures: [],
};

const employe = {
  id: 1,
  nom: "Test",
  salaire: 200_000,
  sursalaire: 0,
  situation: "celibataire",
  enfants: 0,
  dateEmbauche: "2020-01-01",
} as Employe;

describe("tauxAnciennete — 2 % à 2 ans, +1 %/an, plafond 25 %, années complètes", () => {
  it.each([
    [1.99, 0],
    [2, 0.02],
    [2.9, 0.02],
    [3, 0.03],
    [4.95, 0.04],
    [10, 0.1],
    [26, 0.25],
    [40, 0.25],
  ])("%s ans → %s", (annees, attendu) => {
    expect(tauxAnciennete(annees)).toBeCloseTo(attendu, 10);
  });
});

describe("calculerPaie — ancienneté au mois du bulletin", () => {
  it("utilise l'ancienneté à la fin du mois payé, pas celle d'aujourd'hui", () => {
    // Fin janvier 2021 : 1 an et 1 mois de présence → pas de prime
    const janv2021 = calculerPaie(employe, moisVide, 2021, 1);
    expect(janv2021.anciennete).toBeLessThan(2);
    expect(janv2021.primeAnciennete).toBe(0);

    // Fin décembre 2023 : 3 ans complets → 3 %
    const dec2023 = calculerPaie(employe, moisVide, 2023, 12);
    expect(dec2023.tauxAnc).toBeCloseTo(0.03, 10);
    expect(dec2023.primeAnciennete).toBeCloseTo(6_000, 6);
  });
});

describe("calculerPaie — cotisations CNSS / AMU", () => {
  const avecIndemnite = {
    ...employe,
    dateEmbauche: "2025-06-01", // pas d'ancienneté
    indemniteTransport: 30_000,
  } as Employe;

  it("exclut les indemnités de la base cotisable mais inclut primes et HS", () => {
    const data: MoisData = {
      ...moisVide,
      primes: { 1: [{ id: 1, libelle: "Rendement", montant: 20_000, statutValidation: "valide" }] },
    };
    const c = calculerPaie(avecIndemnite, data, 2026, 3);
    expect(c.baseCotisable).toBe(220_000); // 200 000 + 20 000, sans les 30 000 de transport
    expect(c.cnssSal).toBeCloseTo(220_000 * 0.04, 6);
    expect(c.amuSal).toBeCloseTo(220_000 * 0.05, 6);
    expect(c.cnssEmp).toBeCloseTo(220_000 * 0.175, 6);
    expect(c.amuEmp).toBeCloseTo(220_000 * 0.05, 6);
  });

  it("applique les taux de l'historique passés en paramètre", () => {
    const taux: TauxFiscaux = { ...TAUX_DEFAUT, cnssSal: 0.05, cnssEmp: 0.18 };
    const c = calculerPaie(avecIndemnite, moisVide, 2026, 3, taux);
    expect(c.cnssSal).toBeCloseTo(200_000 * 0.05, 6);
    expect(c.cnssEmp).toBeCloseTo(200_000 * 0.18, 6);
  });

  it("diminue base cotisable, IRPP et coût employeur en cas de congé sans solde", () => {
    const data: MoisData = {
      ...moisVide,
      absences: [{ id: 1, employeId: 1, type: "sans_solde", jours: 15, statutValidation: "valide" }],
    } as MoisData;
    const plein = calculerPaie(avecIndemnite, moisVide, 2026, 3);
    const demi = calculerPaie(avecIndemnite, data, 2026, 3);
    expect(demi.deductionSansSolde).toBeCloseTo(100_000, 6);
    expect(demi.baseCotisable).toBeCloseTo(100_000, 6);
    expect(demi.irpp).toBeLessThan(plein.irpp);
    expect(demi.coutEmployeur).toBeLessThan(plein.coutEmployeur - 100_000);
  });
});
