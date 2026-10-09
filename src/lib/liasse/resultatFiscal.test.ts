import { describe, it, expect } from "vitest";
import { calculResultatFiscal, saisiesHorsBilan, saisiesResultatFiscal } from "./resultatFiscal";

const val = (s: { feuille: string; cellule: string; valeur: unknown }[], feuille: string, cellule: string) =>
  s.filter((x) => x.feuille === feuille && x.cellule === cellule).at(-1)?.valeur;
const P58 = "P58 Résultat fiscal";

describe("résultat fiscal", () => {
  it("bénéfice : réintégrations (impôt comptabilisé par défaut), déductions, déficits imputés", () => {
    const r = calculResultatFiscal(1_000_000, {
      reintegrations: { "25": 50_000 },
      autresReintegrations: [{ libelle: "Cadeaux", montant: 20_000 }],
      deductions: { "100": 70_000 },
      deficitsAnterieurs: 300_000,
    }, 250_000);
    expect(r.totalReintegrations).toBe(320_000);
    expect(r.totalI).toBe(1_320_000);
    expect(r.totalII).toBe(70_000);
    expect(r.avantImputation).toBe(1_250_000);
    expect(r.droitCommun).toBe(950_000);
    expect(r.definitif).toBe(950_000);
  });

  it("perte : les déficits antérieurs ne s'imputent pas", () => {
    const r = calculResultatFiscal(-400_000, { reintegrations: { "25": 100_000 }, deficitsAnterieurs: 500_000 });
    expect(r.totalI).toBe(100_000);
    expect(r.totalII).toBe(400_000);
    expect(r.droitCommun).toBe(-300_000);
  });

  it("P58, P59 : cellules du modèle", () => {
    const s = saisiesResultatFiscal(1_000_000, {
      reintegrations: { "15": 200_000 },
      autresReintegrations: [{ libelle: "Cadeaux", montant: 20_000 }],
      quotePartExoneree: 100_000,
    }, 999);
    expect(val(s, P58, "H7")).toBe(1_000_000);
    expect(val(s, P58, "H10")).toBe(200_000); // saisi : remplace l'impôt comptable
    expect(val(s, P58, "H18")).toBe(20_000);
    expect(val(s, P58, "H31")).toBe(1_220_000);
    expect(val(s, P58, "H49")).toBe(1_220_000);
    expect(val(s, P58, "H53")).toBe(1_220_000);
    expect(val(s, P58, "H55")).toBe(100_000);
    expect(val(s, P58, "H56")).toBe(1_120_000);
    expect(val(s, "P59 Détail Autres réintég.", "B11")).toBe("Cadeaux");
  });

  it("hors bilan : sûretés des emprunts proposées, saisie prioritaire, éventuels", () => {
    const s = saisiesHorsBilan({
      engagements: { "38": { donnes: 500_000, recus: 100_000 } },
      passifsEventuels: [{ libelle: "Litige prud'homal", montant: 2_000_000 }],
    }, 3_000_000);
    expect(val(s, "NOTE 1", "I39")).toBe(3_000_000);
    expect(val(s, "NOTE 1", "I43")).toBe(3_500_000);
    expect(val(s, "NOTE 1", "J43")).toBe(100_000);
    expect(val(s, "Note 16 C", "A30")).toBe("Litige prud'homal");
    expect(val(s, "Note 16 C", "H30")).toBe(2_000_000);
    expect(val(saisiesHorsBilan({ engagements: { "39": { donnes: 0 } } }, 3_000_000), "NOTE 1", "I39")).toBeUndefined();
  });
});
