import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { genererLiasse, systemeDuRegime } from "./genererLiasse";

const e = (piece: string, date: string, lignes: [string, number, number][]) => ({
  id: 0, journal: "OD", numeroPiece: piece, libelle: piece, statut: "valide", date,
  annee: 2026, mois: Number(date.slice(5, 7)),
  lignes: lignes.map(([compte, debit, credit], i) => ({ id: i + 1, compte, intitule: "", debit, credit })),
});
const donnees = {
  "2026-1": {
    ecritures: [
      e("AP", "2026-01-02", [["521", 1_000_000, 0], ["1013", 0, 1_000_000]]),
      e("VE", "2026-03-10", [["571", 118_000, 0], ["706", 0, 100_000], ["4431", 0, 18_000]]),
    ],
    transactions: [{ id: 1, date: "2026-03-10", desc: "v", type: "r", m: 118_000, source: "manuelle", statut: "valide", compte: "706" }],
    factures: [],
  },
} as never;
const societe = { nom: "SOCIETE ESSAI SARL", nif: "1000000001", adresse: "Lomé", rccm: "TG-LOM-2020-B-001", activite: "Services" };

describe("genererLiasse (modèles réels)", () => {
  it("système normal : identification, bilan, compte de résultat, TFT inscrits dans le modèle", async () => {
    const modele = readFileSync("public/modeles/liasse-systeme-normal.xlsx");
    const { fichier } = await genererLiasse("normal", modele, { donnees, annee: 2026, societe, dateArrete: "2027-03-31" });
    const wb = XLSX.read(fichier, { type: "array" });
    expect(wb.SheetNames.length).toBe(88);
    expect(wb.Sheets["FICHE DEPOT SYST NORM"].E28.v).toBe("SOCIETE ESSAI SARL");
    expect(wb.Sheets["BILAN PASSIF"].F11.v).toBe(1_000_000); // CA capital
    expect(wb.Sheets["BILAN PASSIF"].F18.v).toBe(100_000); // CJ résultat
    expect(wb.Sheets["BILAN ACTIF"].G40.v).toBe(wb.Sheets["BILAN PASSIF"].F38.v); // BZ = DZ
    expect(wb.Sheets["COMPTE DE RESULTAT"].H15.v).toBe(100_000); // TC
    expect(wb.Sheets["TFT"].K38.v).toBe(1_118_000); // ZH
  });

  it("SMT : bilan simplifié et compte de résultat en recettes / dépenses", async () => {
    const modele = readFileSync("public/modeles/liasse-smt.xlsx");
    const { fichier } = await genererLiasse("smt", modele, { donnees, annee: 2026, societe, dateArrete: "2027-03-31" });
    const wb = XLSX.read(fichier, { type: "array" });
    expect(wb.SheetNames.length).toBe(16);
    expect(wb.Sheets.BILAN.C4.v).toBe("SOCIETE ESSAI SARL");
    expect(wb.Sheets.BILAN.C16.v).toBe(118_000); // caisse
    expect(wb.Sheets.BILAN.C18.v).toBe(wb.Sheets.BILAN.H18.v); // total actif = total passif
    expect(wb.Sheets["COMPTE DE RESULTAT"].H11.v).toBe(118_000); // recettes sur prestations
  });

  it("régime TPU : SMT ; autres régimes : système normal", () => {
    expect(systemeDuRegime("TPU")).toBe("smt");
    expect(systemeDuRegime("IS")).toBe("normal");
    expect(systemeDuRegime(null)).toBe("normal");
  });
});
