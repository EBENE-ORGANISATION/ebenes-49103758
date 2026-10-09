import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { patcherFeuille, remplirModele } from "./xlsxPatch";

describe("patcherFeuille", () => {
  const xml = `<worksheet><sheetData><row r="2" spans="1:5"><c r="A2" s="3" t="s"><v>0</v></c><c r="C2" s="7"/><c r="E2" s="4"/></row><row r="5"/></sheetData></worksheet>`;

  it("remplit une cellule existante en gardant son style", () => {
    expect(patcherFeuille(xml, [{ cellule: "C2", valeur: 1500 }])).toContain(`<c r="C2" s="7"><v>1500</v></c>`);
  });

  it("insère une cellule absente à sa place dans la ligne", () => {
    const out = patcherFeuille(xml, [{ cellule: "D2", valeur: "Texte & <b>" }]);
    expect(out).toContain(`<c r="C2" s="7"/><c r="D2" t="inlineStr"><is><t xml:space="preserve">Texte &amp; &lt;b&gt;</t></is></c><c r="E2" s="4"/>`);
  });

  it("remplit une ligne vide et crée une ligne absente", () => {
    const out = patcherFeuille(xml, [{ cellule: "B5", valeur: 2 }, { cellule: "A3", valeur: 9 }]);
    expect(out).toContain(`<row r="5"><c r="B5"><v>2</v></c></row>`);
    expect(out.indexOf(`<row r="3">`)).toBeGreaterThan(out.indexOf(`<row r="2"`));
    expect(out.indexOf(`<row r="3">`)).toBeLessThan(out.indexOf(`<row r="5"`));
  });
});

describe("remplirModele", () => {
  it("le fichier rempli se relit avec les valeurs et les feuilles d'origine", async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Réf", "Montant"], ["AE", null]]), "BILAN ACTIF");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["x"]]), "AUTRE");
    const modele = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const rempli = await remplirModele(modele, [
      { feuille: "BILAN ACTIF", cellule: "B2", valeur: 250000 },
      { feuille: "BILAN ACTIF", cellule: "C2", valeur: "note" },
    ]);
    const relu = XLSX.read(rempli, { type: "array" });
    expect(relu.SheetNames).toEqual(["BILAN ACTIF", "AUTRE"]);
    expect(relu.Sheets["BILAN ACTIF"].B2.v).toBe(250000);
    expect(relu.Sheets["BILAN ACTIF"].C2.v).toBe("note");
    expect(relu.Sheets["AUTRE"].A1.v).toBe("x");
  });
});
