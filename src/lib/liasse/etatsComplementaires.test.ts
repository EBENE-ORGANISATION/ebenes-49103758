import { describe, it, expect } from "vitest";
import { complementsReel, complementsSmt, principauxClients, qualification, saisiesDetailComptes, saisiesNote27B } from "./etatsComplementaires";
import { DETAIL_REEL } from "./detailComptes";

const e = (piece: string, date: string, lignes: [string, number, number][]) => ({
  id: 0, journal: "OD", numeroPiece: piece, libelle: piece, statut: "valide", date,
  annee: Number(date.slice(0, 4)), mois: Number(date.slice(5, 7)),
  lignes: lignes.map(([compte, debit, credit], i) => ({ id: i + 1, compte, intitule: "", debit, credit })),
});
const facture = (id: number, client: string, ht: number, statut = "payee") =>
  ({ id, numero: `F${id}`, client, date: "2026-03-01", lignes: [], avecTva: true, statut, totalHT: ht, totalTva: ht * 0.18, totalTtc: ht * 1.18 });
const donnees = {
  "2026-3": {
    ecritures: [
      e("AC", "2026-03-01", [["601", 200_000, 0], ["521", 0, 200_000]]),
      e("LOY", "2026-03-02", [["6222", 120_000, 0], ["521", 0, 120_000]]),
      e("VE", "2026-03-03", [["521", 300_000, 0], ["706", 0, 300_000]]),
    ],
    factures: [facture(1, "Client A", 100_000), facture(2, "Client B", 300_000), facture(3, "Client A", 50_000), facture(4, "Proforma", 999, "proforma")],
    transactions: [
      { id: 1, date: "2026-03-01", desc: "", type: "d", m: -118_000, source: "fournisseur", fournisseur: "Grossiste", avecTva: true, statut: "valide", compte: "601" },
      { id: 2, date: "2026-03-02", desc: "", type: "d", m: -120_000, source: "manuelle", statut: "valide", compte: "6222" },
      { id: 3, date: "2026-03-03", desc: "", type: "r", m: 300_000, source: "manuelle", statut: "valide", compte: "706" },
    ],
  },
} as never;
const val = (s: { feuille: string; cellule: string; valeur: unknown }[], f: string, c: string) => s.find((x) => x.feuille === f && x.cellule === c)?.valeur;

describe("états complémentaires", () => {
  it("détail des charges : un compte court va dans la première ligne qui le prolonge, un compte précis dans sa ligne", () => {
    const d = saisiesDetailComptes(donnees, 2026, DETAIL_REEL);
    expect(val(d, "P64 Détail des charges ", "H12")).toBe(200_000); // 601 → 6011
    const loyer = d.find((x) => x.valeur === 120_000);
    expect(loyer?.feuille).toBe("P65 Détail des charges");
    expect(d.some((x) => x.feuille === "P68 DETAIL PRODUITS" && x.valeur === 300_000)).toBe(true);
  });

  it("principaux clients : regroupés, triés, sans proformas", () => {
    const c = principauxClients(donnees, 2026);
    expect(c.map((x) => [x.nom, x.ht])).toEqual([["Client B", 300_000], ["Client A", 150_000]]);
  });

  it("note 27B : effectifs et masse salariale par qualification, zone et sexe", () => {
    const s = saisiesNote27B([
      { sexe: "M", nationalite: "Togolaise", categorie: "C4", typeContrat: "cdi", masseAnnuelle: 6_000_000 },
      { sexe: "F", nationalite: "Béninoise", categorie: "E2", typeContrat: "cdd", masseAnnuelle: 1_000_000 },
      { sexe: "M", nationalite: "Française", categorie: "M1", typeContrat: "cdi", masseAnnuelle: 3_000_000 },
    ]);
    expect(val(s, "NOTE 27 B", "C13")).toBe(1); // cadre supérieur, national, homme
    expect(val(s, "NOTE 27 B", "F16")).toBe(1); // employée, OHADA, femme
    expect(val(s, "NOTE 27 B", "G15")).toBe(1); // maîtrise, hors OHADA
    expect(val(s, "NOTE 27 B", "I17")).toBe(3); // total
    expect(val(s, "NOTE 27 B", "P17")).toBe(10_000_000);
    expect(val(s, "NOTE 27 B", "I18")).toBe(2); // permanents
    expect(val(s, "NOTE 27 B", "I19")).toBe(1); // saisonniers / temporaires
    expect(qualification("C1")).toBe("YB");
  });

  it("compléments réel et SMT : listes, journal de trésorerie mensuel, CA par nature", () => {
    const reel = complementsReel(donnees, 2026, {});
    expect(val(reel, "P83 Liste principaux clients", "C15")).toBe("Client B");
    expect(val(reel, "P84 Liste princip. fourniss.", "C13")).toBe("Grossiste");
    expect(val(reel, "P84 Liste princip. fourniss.", "G13")).toBe(100_000);
    const smt = complementsSmt(donnees, 2026, {});
    expect(val(smt, "NOT4", "A15")).toBe("Mars 2026");
    expect(val(smt, "NOT4", "D15")).toBe(300_000);
    expect(val(smt, "NOT4", "E15")).toBe(238_000);
    expect(val(smt, "NOT4", "L15")).toBe(120_000);
    expect(val(smt, "CA", "E22")).toBe(300_000);
  });
});
