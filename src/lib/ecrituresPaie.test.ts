import { describe, it, expect } from "vitest";
import type { BulletinPaieRecord } from "@/types/ebene";
import { ecrituresPaie } from "./ecrituresPaie";

/** Bulletin de Yao KODJO (octobre 2026, simulation) : HS et 3 jours de congé sans solde. */
const bulletinYao = {
  id: "b-yao", employe_id: 9, employe_nom: "TEST Yao KODJO", employe_user_id: null, societe_id: "s",
  mois: 10, annee: 2026,
  salaire_base: 180_000, sursalaire: 0, prime_anciennete: 0, hs_montant: 21_808, primes_diverses: 0, indemnites: 15_000,
  brut: 216_808, cnss_sal: 7_352, amu_sal: 9_190, irpp: 1_687, retenues_diverses: 0,
  total_retenues: 36_229, net_a_payer: 180_579, cnss_pat: 32_166, amu_pat: 9_190, cout_employeur: 240_164,
  statut: "valide", created_at: "", paid_at: null,
} as BulletinPaieRecord;

const totaux = (lignes: { debit: number; credit: number }[]) => [
  lignes.reduce((s, l) => s + l.debit, 0),
  lignes.reduce((s, l) => s + l.credit, 0),
];

describe("ecrituresPaie", () => {
  it("écriture de paie équilibrée malgré le congé sans solde (salaire dû = brut − sans solde)", () => {
    const [paie] = ecrituresPaie(bulletinYao, "2026-10-31");
    const [d, c] = totaux(paie.lignes);
    expect(d).toBe(c);
    expect(paie.lignes.find((l) => l.compte === "661")?.debit).toBe(216_808 - 18_000);
  });

  it("bons comptes : 6641 charges patronales, 422 net, 431 CNSS, 433 AMU, 447 IRPP", () => {
    const [paie] = ecrituresPaie(bulletinYao, "2026-10-31");
    const par = Object.fromEntries(paie.lignes.map((l) => [l.compte, l.debit || l.credit]));
    expect(par).toMatchObject({
      "6641": 32_166 + 9_190,
      "422": 180_579,
      "431": 7_352 + 32_166,
      "433": 9_190 + 9_190,
      "447": 1_687,
    });
    expect(Object.keys(par).some((c) => c.startsWith("631") || c.startsWith("442"))).toBe(false);
  });

  it("règlement du net à la date du paiement : 422 / Banque", () => {
    const [paie, reglement] = ecrituresPaie(bulletinYao, "2026-10-31");
    expect(paie.date).toBe("2026-10-31");
    expect(reglement.date).toBe("2026-10-31");
    expect(reglement.journal).toBe("BQ");
    expect(reglement.lignes.map((l) => [l.compte, l.debit, l.credit])).toEqual([["422", 180_579, 0], ["521", 0, 180_579]]);
    expect(reglement.bulletinId).toBe("b-yao");
  });

  it("retenue diverse en 4228, paiement en caisse possible", () => {
    const b = { ...bulletinYao, retenues_diverses: 15_000, total_retenues: 51_229, net_a_payer: 165_579 };
    const [paie, reglement] = ecrituresPaie(b, "2026-10-31", "571");
    const [d, c] = totaux(paie.lignes);
    expect(d).toBe(c);
    expect(paie.lignes.find((l) => l.compte === "4228")?.credit).toBe(15_000);
    expect(reglement.journal).toBe("CA");
  });
});
