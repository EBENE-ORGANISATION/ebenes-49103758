import { describe, it, expect } from "vitest";
import type { Employe, MoisData, TauxFiscaux } from "@/types/ebene";
import { TAUX_DEFAUT } from "@/types/ebene";
import {
  calculerPaie,
  contenuBulletin,
  sansSoldeEnregistre,
  totauxBulletinEdite,
  type ChampsBulletinEditables,
  type MontantsEnregistres,
} from "./paie";
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

describe("contenuBulletin — le PDF d'un bulletin enregistré reprend ses montants", () => {
  const enregistrer = (e: Employe): MontantsEnregistres => {
    const c = calculerPaie(e, moisVide, 2026, 3);
    return {
      salaire_base: Math.round(c.base), sursalaire: Math.round(c.sursalaire),
      prime_anciennete: Math.round(c.primeAnciennete), hs_montant: Math.round(c.hsMontant),
      primes_diverses: Math.round(c.primesDiverses), indemnites: Math.round(c.indemnites),
      brut: Math.round(c.brut), cnss_sal: Math.round(c.cnssSal), amu_sal: Math.round(c.amuSal),
      irpp: Math.round(c.irpp), retenues_diverses: Math.round(c.retenuesDiverses),
      total_retenues: Math.round(c.totalRetenues), net_a_payer: Math.round(c.net),
      cnss_pat: Math.round(c.cnssEmp), amu_pat: Math.round(c.amuEmp), cout_employeur: Math.round(c.coutEmployeur),
    };
  };
  const avecIndemnite = { ...employe, indemniteTransport: 20_000 } as Employe;

  it("sans changement, montants et détail identiques au calcul", () => {
    const enr = enregistrer(avecIndemnite);
    const b = contenuBulletin(calculerPaie(avecIndemnite, moisVide, 2026, 3), avecIndemnite, enr);
    expect(b.net).toBe(enr.net_a_payer);
    expect(b.gains.map((l) => l.libelle)).toContain("Indemnité transport");
    expect(b.retenues[0].libelle).toBe("CNSS salarié (4%)");
  });

  it("après une augmentation, le PDF garde les montants enregistrés", () => {
    const enr = enregistrer(avecIndemnite);
    const augmente = { ...avecIndemnite, salaire: 300_000, indemniteTransport: 35_000 } as Employe;
    const b = contenuBulletin(calculerPaie(augmente, moisVide, 2026, 3), augmente, enr);
    expect(b.gains[0]).toEqual({ libelle: "Salaire de base", montant: 200_000 });
    expect(b.brut).toBe(enr.brut);
    expect(b.net).toBe(enr.net_a_payer);
    expect(b.cnssEmp).toBe(enr.cnss_pat);
    // Le détail recalculé ne concorde plus : lignes globales, sans taux
    expect(b.gains).toContainEqual({ libelle: "Indemnités", montant: 20_000 });
    expect(b.retenues[0].libelle).toBe("CNSS salarié");
    expect(b.retenues.reduce((s, l) => s + l.montant, 0)).toBe(enr.total_retenues);
  });

  it("congés sans solde retrouvés à partir du total des retenues", () => {
    const enr = { ...enregistrer(employe), total_retenues: enregistrer(employe).total_retenues + 9_000 };
    const b = contenuBulletin(calculerPaie(employe, moisVide, 2026, 3), employe, enr);
    expect(b.retenues).toContainEqual({ libelle: "Congés sans solde", montant: 9_000 });
  });
});

describe("totauxBulletinEdite — modification manuelle d'un bulletin", () => {
  const champs: ChampsBulletinEditables = {
    salaire_base: 200_000, sursalaire: 0, prime_anciennete: 10_000, hs_montant: 5_000,
    primes_diverses: 15_000, indemnites: 20_000,
    cnss_sal: 9_200, amu_sal: 11_500, irpp: 7_000, retenues_diverses: 3_000,
  };

  it("brut, retenues et net sans congés sans solde", () => {
    const t = totauxBulletinEdite(champs, 0, TAUX_DEFAUT);
    expect(t.brut).toBe(250_000);
    expect(t.total_retenues).toBe(30_700);
    expect(t.net_a_payer).toBe(219_300);
  });

  it("charges patronales sur la base cotisable avec primes, hors indemnités", () => {
    const t = totauxBulletinEdite(champs, 0, TAUX_DEFAUT);
    const base = 230_000;
    expect(t.cnss_pat).toBe(Math.round(base * TAUX_DEFAUT.cnssEmp));
    expect(t.amu_pat).toBe(Math.round(base * TAUX_DEFAUT.amuEmp));
    expect(t.cout_employeur).toBe(250_000 + t.cnss_pat + t.amu_pat);
  });

  it("utilise les taux du mois fournis, pas des taux fixes", () => {
    const taux: TauxFiscaux = { ...TAUX_DEFAUT, cnssEmp: 0.2, amuEmp: 0.1 };
    const t = totauxBulletinEdite(champs, 0, taux);
    expect(t.cnss_pat).toBe(46_000);
    expect(t.amu_pat).toBe(23_000);
  });

  it("congés sans solde : dans les retenues, hors base cotisable et hors coût employeur", () => {
    const t = totauxBulletinEdite(champs, 10_000, TAUX_DEFAUT);
    expect(t.total_retenues).toBe(40_700);
    expect(t.net_a_payer).toBe(209_300);
    expect(t.cnss_pat).toBe(Math.round(220_000 * TAUX_DEFAUT.cnssEmp));
    expect(t.cout_employeur).toBe(240_000 + t.cnss_pat + t.amu_pat);
  });

  it("concorde avec calculerPaie pour un bulletin non modifié", () => {
    const e = { ...employe, indemniteTransport: 20_000 } as Employe;
    const data: MoisData = {
      ...moisVide,
      absences: [{ id: 1, employeId: 1, type: "sans_solde", jours: 3 } as MoisData["absences"][number]],
    };
    const c = calculerPaie(e, data, 2026, 3);
    const enr = {
      salaire_base: c.base, sursalaire: c.sursalaire, prime_anciennete: c.primeAnciennete,
      hs_montant: c.hsMontant, primes_diverses: c.primesDiverses, indemnites: c.indemnites,
      cnss_sal: c.cnssSal, amu_sal: c.amuSal, irpp: c.irpp, retenues_diverses: c.retenuesDiverses,
      total_retenues: c.totalRetenues,
    };
    expect(c.deductionSansSolde).toBeGreaterThan(0);
    expect(sansSoldeEnregistre(enr)).toBe(Math.round(c.deductionSansSolde));
    const t = totauxBulletinEdite(enr, c.deductionSansSolde, TAUX_DEFAUT);
    expect(t.net_a_payer).toBe(Math.round(c.net));
    expect(t.cnss_pat).toBe(Math.round(c.cnssEmp));
    expect(t.cout_employeur).toBe(Math.round(c.coutEmployeur));
  });
});
