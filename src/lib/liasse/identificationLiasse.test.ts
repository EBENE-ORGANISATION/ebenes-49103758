import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { genererLiasse, caParActivite } from "./genererLiasse";

const e = (piece: string, date: string, lignes: [string, number, number][], activiteId: string | null = null) => ({
  id: 0, journal: "OD", numeroPiece: piece, libelle: piece, statut: "valide", date, activiteId,
  annee: 2026, mois: Number(date.slice(5, 7)),
  lignes: lignes.map(([compte, debit, credit], i) => ({ id: i + 1, compte, intitule: "", debit, credit })),
});
const donnees = {
  "2026-1": { ecritures: [
    e("AP", "2026-01-02", [["521", 1_000_000, 0], ["1013", 0, 1_000_000]]),
    e("V1", "2026-02-10", [["521", 600_000, 0], ["706", 0, 600_000]], "hotel"),
    e("V2", "2026-02-11", [["521", 400_000, 0], ["701", 0, 400_000]], "info"),
  ] },
} as never;

const identification = {
  identification: {
    sigle: "ESSAI", formeJuridique: "SARL" as const, capitalSocial: 1_000_000, valeurNominale: 10_000, nombreParts: 100,
    premiereAnnee: 2020, cnssEmployeur: "CNSS-123", codeActivite: "055001", controle: "prive_national" as const,
    nbEtablissements: 2, signataire: "Kodjo AMEGAH", qualiteSignataire: "Gérant",
    banques: [{ banque: "Ecobank", compte: "TG0001" }],
    dirigeants: [{ nom: "AMEGAH", prenoms: "Kodjo", qualite: "Gérant", nif: "999" }],
    associes: [{ nom: "AMEGAH", prenoms: "Kodjo", nationalite: "Togolaise", nombreParts: 60, montant: 600_000 }, { nom: "KOFFI", nationalite: "Togolaise", nombreParts: 40, montant: 400_000 }],
  },
  regimeFiscal: "IS",
  activites: caParActivite(donnees, 2026, new Map([["hotel", "Hôtellerie"], ["info", "Matériel informatique"]])),
  effectif: 3,
  masseSalariale: 4_500_000,
};

describe("identification dans la liasse", { timeout: 30_000 }, () => {
  it("CA par activité depuis les écritures", () => {
    expect(identification.activites).toEqual([{ nom: "Hôtellerie", ca: 600_000 }, { nom: "Matériel informatique", ca: 400_000 }]);
  });

  it("système normal : fiches 1 et 2, dirigeants, notes 13 et 31", async () => {
    const modele = readFileSync("public/modeles/liasse-systeme-normal.xlsx");
    const { fichier } = await genererLiasse("normal", modele, {
      donnees, annee: 2026, societe: { nom: "ESSAI SARL" }, dateArrete: "2027-03-31", identification,
    });
    const wb = XLSX.read(fichier, { type: "array" });
    const f1 = wb.Sheets["FICHE IDENTIFICATION 1 "];
    const f2 = wb.Sheets["FICHE IDENTIFICATION 2 "];
    expect(f1.C15.v).toBe("CNSS-123");
    expect(f1.K48.v).toBe("Ecobank");
    expect(f1.B49.v).toBe("Kodjo AMEGAH");
    expect([f2.Q9.v, f2.R9.v]).toEqual([0, 2]); // SARL = 02
    expect(f2.Q11.v).toBe(1); // réel normal
    expect([f2.Q13.v, f2.R13.v]).toEqual([0, 8]); // Togo
    expect([f2.Q20.v, f2.R20.v, f2.S20.v, f2.T20.v]).toEqual([2, 0, 2, 0]);
    expect(f2.AI11.v).toBe("X"); // privé national
    expect([f2.B26.v, f2.X26.v, f2.AG26.v]).toEqual(["Hôtellerie", 600_000, 60]);
    expect(f2.X32.v).toBe(1_000_000);
    expect(wb.Sheets["FICHE DIRIGEANTS"].B11.v).toBe("AMEGAH");
    expect(wb.Sheets["FICHE DIRIGEANTS"].J25.v).toBe(60);
    expect(wb.Sheets["NOTE 13"].G9.v).toBe(10_000);
    expect(wb.Sheets["NOTE 13"].H12.v).toBe(400_000);
    expect(wb.Sheets["NOTE 31"].G22.v).toBe(1_000_000);
    expect(wb.Sheets["NOTE 31"].G31.v).toBe(3);
  });

  it("SMT : fiche 2 décalée d'une ligne", async () => {
    const modele = readFileSync("public/modeles/liasse-smt.xlsx");
    const { fichier } = await genererLiasse("smt", modele, {
      donnees, annee: 2026, societe: { nom: "ESSAI SARL" }, dateArrete: "2027-03-31", identification: { ...identification, regimeFiscal: "TPU" },
    });
    const f2 = XLSX.read(fichier, { type: "array" }).Sheets["FICHE IDENTIFICATION 2 "];
    expect([f2.Q8.v, f2.R8.v]).toEqual([0, 2]);
    expect(f2.Q10.v).toBe(2); // TPU
  });
});
