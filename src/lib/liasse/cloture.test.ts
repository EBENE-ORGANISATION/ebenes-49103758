import { describe, it, expect } from "vitest";
import { ecritureANouveaux, ecritureOuverture, resultatAAffecter, verifierOuverture } from "./cloture";
import { etatsFinanciersLiasse } from "./etatsLiasse";

const e = (piece: string, date: string, lignes: [string, number, number][], journal = "OD") => ({
  id: 0, journal, numeroPiece: piece, libelle: piece, statut: "valide", date,
  annee: Number(date.slice(0, 4)), mois: Number(date.slice(5, 7)),
  lignes: lignes.map(([compte, debit, credit], i) => ({ id: i + 1, compte, intitule: "", debit, credit })),
});
const ecritures2026 = [
  e("AP", "2026-01-02", [["521", 1_000_000, 0], ["1013", 0, 1_000_000]]),
  e("VE", "2026-03-10", [["4111", 600_000, 0], ["706", 0, 600_000]]),
  e("CH", "2026-04-10", [["6222", 200_000, 0], ["521", 0, 200_000]]),
];
const donnees = { "2026-12": { ecritures: ecritures2026 } } as never;

describe("clôture d'exercice", () => {
  it("résultat à affecter", () => {
    expect(resultatAAffecter(donnees, 2026)).toEqual({ resultat: 400_000, reportImplicite: 0, total: 400_000 });
  });

  it("à-nouveaux de N+1 : soldes de bilan et résultat affecté, équilibrés", () => {
    const an = ecritureANouveaux(donnees, 2026, { reserveLegale: 40_000, dividendes: 100_000 });
    expect(an).toMatchObject({ journal: "AN", numeroPiece: "AN-2027", date: "2027-01-01", annee: 2027 });
    const parCompte = Object.fromEntries(an.lignes.map((l) => [l.compte, l.debit - l.credit]));
    expect(parCompte).toEqual({ "1013": -1_000_000, "4111": 600_000, "521": 800_000, "111": -40_000, "465": -100_000, "121": -260_000 });
    expect(an.lignes.reduce((t, l) => t + l.debit - l.credit, 0)).toBe(0);
  });

  it("l'exercice suivant part des à-nouveaux : capitaux propres affectés, bilan équilibré", () => {
    const an = ecritureANouveaux(donnees, 2026, { reserveLegale: 40_000 });
    const d = { "2026-12": { ecritures: ecritures2026 }, "2027-1": { ecritures: [{ ...an, id: 99 }] } } as never;
    const x = etatsFinanciersLiasse(d, 2027);
    expect(x.n.passif.CF + x.n.passif.CG).toBe(40_000);
    expect(x.n.passif.CH).toBe(360_000);
    expect(x.n.passif.CJ).toBe(0);
    expect(x.n.actif.BZ.net).toBe(x.n.passif.DZ);
    expect(x.n1.cr.XI).toBe(400_000);
  });

  it("perte : report à nouveau débiteur", () => {
    const d = { "2026-1": { ecritures: [e("CH", "2026-02-01", [["6222", 50_000, 0], ["521", 0, 50_000]]), e("AP", "2026-01-01", [["521", 100_000, 0], ["1013", 0, 100_000]])] } } as never;
    const an = ecritureANouveaux(d, 2026);
    expect(an.lignes.find((l) => l.compte === "129")?.debit).toBe(50_000);
  });

  it("bilan d'ouverture saisi : contrôles et écriture", () => {
    expect(verifierOuverture([{ compte: "521", debit: 100, credit: 0 }])).toMatch(/pas équilibré/);
    expect(verifierOuverture([{ compte: "601", debit: 100, credit: 0 }, { compte: "1013", debit: 0, credit: 100 }])).toMatch(/pas un compte de bilan/);
    const lignes = [{ compte: "521", debit: 500_000, credit: 0 }, { compte: "1013", debit: 0, credit: 500_000 }, { compte: "4111", debit: 0, credit: 0 }];
    expect(verifierOuverture(lignes)).toBeNull();
    const o = ecritureOuverture(lignes, 2026);
    expect(o.numeroPiece).toBe("AN-2026");
    expect(o.lignes).toHaveLength(2);
  });
});
