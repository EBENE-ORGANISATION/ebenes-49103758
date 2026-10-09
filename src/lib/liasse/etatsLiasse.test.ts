import { describe, it, expect } from "vitest";
import { etatsFinanciersLiasse } from "./etatsLiasse";

const e = (piece: string, date: string, lignes: [string, number, number][], journal = "OD") => ({
  id: 0, journal, numeroPiece: piece, libelle: piece, statut: "valide", date,
  annee: Number(date.slice(0, 4)), mois: Number(date.slice(5, 7)),
  lignes: lignes.map(([compte, debit, credit], i) => ({ id: i + 1, compte, intitule: "", debit, credit })),
});

// Premier exercice : apport, immobilisation, ventes, achats, stock, paie
const ecritures2026 = [
  e("AP", "2026-01-02", [["521", 1_000_000, 0], ["1013", 0, 1_000_000]]),
  e("IM", "2026-02-01", [["2441", 300_000, 0], ["521", 0, 300_000]]),
  e("VE", "2026-03-10", [["4111", 118_000, 0], ["706", 0, 100_000], ["4431", 0, 18_000]]),
  e("BQ", "2026-03-20", [["521", 100_000, 0], ["4111", 0, 100_000]]),
  e("AC", "2026-04-05", [["601", 200_000, 0], ["4452", 36_000, 0], ["4011", 0, 236_000]]),
  e("SAL", "2026-05-31", [["661", 80_000, 0], ["422", 0, 80_000]]),
  e("RS", "2026-05-31", [["422", 60_000, 0], ["521", 0, 60_000]]),
  e("DOT", "2026-12-31", [["6813", 50_000, 0], ["2844", 0, 50_000]]),
  e("INV", "2026-12-31", [["311", 50_000, 0], ["6031", 0, 50_000]]),
];
const donnees = { "2026-12": { ecritures: ecritures2026 } } as never;

describe("etatsFinanciersLiasse", () => {
  const etats = etatsFinanciersLiasse(donnees, 2026);
  const { actif, passif, cr } = etats.n;

  it("compte de résultat : produits en +, charges en −, soldes intermédiaires", () => {
    expect([cr.TC, cr.RA, cr.RB, cr.RK, cr.RL]).toEqual([100_000, -200_000, 50_000, -80_000, -50_000]);
    expect(cr.XB).toBe(100_000);
    expect(cr.XC).toBe(100_000 - 200_000 + 50_000);
    expect(cr.XI).toBe(-180_000);
  });

  it("bilan : rubriques, amortissements, tiers selon leur solde, équilibre", () => {
    expect(actif.AM).toEqual({ brut: 300_000, amort: 50_000, net: 250_000 });
    expect(actif.BB.net).toBe(50_000);
    expect(actif.BI.net).toBe(18_000);
    expect(actif.BJ.net).toBe(36_000); // TVA récupérable
    expect(actif.BS.net).toBe(740_000);
    expect(passif.CA).toBe(1_000_000);
    expect(passif.CJ).toBe(-180_000);
    expect(passif.DJ).toBe(236_000);
    expect(passif.DK).toBe(18_000 + 20_000); // TVA collectée + salaires dus
    expect(actif.BZ.net).toBe(passif.DZ);
  });

  it("TFT : la variation calculée retombe sur la trésorerie du bilan", () => {
    const t = etats.tft;
    expect(t.ZA).toBe(0);
    expect(t.FA).toBe(-130_000); // résultat + dotations
    expect(t.FG).toBe(-300_000);
    expect(t.FK).toBe(1_000_000);
    expect(t.ZH).toBe(740_000);
    expect(etats.ecartTresorerie).toBe(0);
  });

  it("exercice suivant sans à-nouveaux : bilan cumulé, résultat antérieur en report à nouveau", () => {
    const d2 = { "2026-12": { ecritures: ecritures2026 }, "2027-1": { ecritures: [e("V2", "2027-01-15", [["521", 50_000, 0], ["706", 0, 50_000]])] } } as never;
    const e27 = etatsFinanciersLiasse(d2, 2027);
    expect(e27.n.passif.CH).toBe(-180_000);
    expect(e27.n.passif.CJ).toBe(50_000);
    expect(e27.n.actif.BS.net).toBe(790_000);
    expect(e27.n.actif.BZ.net).toBe(e27.n.passif.DZ);
    expect(e27.n1.actif.BS.net).toBe(740_000); // colonne N-1
    expect(e27.tft.ZA).toBe(740_000);
    expect(e27.ecartTresorerie).toBe(0);
  });
});
