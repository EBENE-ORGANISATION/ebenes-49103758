import { describe, it, expect } from "vitest";
import { saisiesNotesImmobilisations, saisiesNotesSoldes } from "./notesReel";

const e = (piece: string, date: string, lignes: [string, number, number][]) => ({
  id: 0, journal: "OD", numeroPiece: piece, libelle: piece, statut: "valide", date,
  annee: Number(date.slice(0, 4)), mois: Number(date.slice(5, 7)),
  lignes: lignes.map(([compte, debit, credit], i) => ({ id: i + 1, compte, intitule: "", debit, credit })),
});
const donnees = {
  "2025-12": { ecritures: [
    e("IM", "2025-06-01", [["2441", 400_000, 0], ["521", 0, 400_000]]),
    e("DOT", "2025-12-31", [["6813", 40_000, 0], ["2844", 0, 40_000]]),
    e("VE", "2025-10-01", [["4111", 50_000, 0], ["706", 0, 50_000]]),
  ] },
  "2026-6": { ecritures: [
    e("IM2", "2026-03-01", [["2451", 900_000, 0], ["521", 0, 900_000]]),
    e("DOT", "2026-12-31", [["6813", 80_000, 0], ["2844", 0, 80_000]]),
    e("VE", "2026-05-01", [["4111", 118_000, 0], ["706", 0, 100_000], ["4431", 0, 18_000]]),
    e("AC", "2026-05-02", [["6055", 30_000, 0], ["4011", 0, 30_000]]),
    e("LOY", "2026-05-03", [["6222", 120_000, 0], ["521", 0, 120_000]]),
  ] },
} as never;
const cellule = (s: { feuille: string; cellule: string; valeur: unknown }[], f: string, c: string) =>
  s.find((x) => x.feuille === f && x.cellule === c)?.valeur;

describe("notes annexes (système normal)", () => {
  const soldes = saisiesNotesSoldes(donnees, 2026);

  it("clients (note 7), fournisseurs (17), dettes fiscales (18) avec N, N-1 et variation", () => {
    expect(cellule(soldes, "NOTE 7", "E10")).toBe(168_000);
    expect(cellule(soldes, "NOTE 7", "F10")).toBe(50_000);
    expect(cellule(soldes, "NOTE 7", "G10")).toBe(236);
    expect(cellule(soldes, "Note 17", "B9")).toBe(30_000);
    expect(cellule(soldes, "note 18", "B19")).toBe(18_000);
    expect(cellule(soldes, "note 18", "B22")).toBe(18_000);
  });

  it("chiffre d'affaires (note 21), achats (22), services extérieurs (24)", () => {
    expect(cellule(soldes, "NOTE 21", "E23")).toBe(100_000);
    expect(cellule(soldes, "NOTE 21", "F23")).toBe(50_000);
    expect(cellule(soldes, "NOTE 21", "E31")).toBe(100_000);
    expect(cellule(soldes, "NOTE 22", "C26")).toBe(30_000);
    expect(cellule(soldes, "NOTE 23 24", "E35")).toBe(120_000);
    expect(cellule(soldes, "NOTE 23 24", "E49")).toBe(120_000);
  });

  it("immobilisations (3A) et amortissements (3C) : ouverture + augmentations − diminutions = clôture", () => {
    const im = saisiesNotesImmobilisations(donnees, 2026);
    expect([cellule(im, "TABLEAU immo note 3A", "B24"), cellule(im, "TABLEAU immo note 3A", "C24"), cellule(im, "TABLEAU immo note 3A", "H24")])
      .toEqual([400_000, 0, 400_000]);
    expect([cellule(im, "TABLEAU immo note 3A", "B25"), cellule(im, "TABLEAU immo note 3A", "C25"), cellule(im, "TABLEAU immo note 3A", "H25")])
      .toEqual([0, 900_000, 900_000]);
    expect(cellule(im, "TABLEAU immo note 3A", "H33")).toBe(1_300_000);
    expect([cellule(im, "NOTE 3C AMORTISSEMENT", "B22"), cellule(im, "NOTE 3C AMORTISSEMENT", "C22"), cellule(im, "NOTE 3C AMORTISSEMENT", "E22")])
      .toEqual([40_000, 80_000, 120_000]);
  });
});
