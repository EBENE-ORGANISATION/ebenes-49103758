import { describe, it, expect } from "vitest";
import { transactionAchatStock } from "./achatStock";
import { ecrituresDeTransaction } from "./ecrituresTresorerie";

const article = { designation: "Eau minérale 1,5 L", unite: "bouteille", activiteId: "hotel" };
const mvt = { date: "2026-10-08", quantite: 120, prixUnitaire: 300, reference: "BL-001" };

describe("transactionAchatStock", () => {
  it("achat avec TVA : dépense TTC au nom du fournisseur, dans l'activité de l'article", () => {
    const t = transactionAchatStock(mvt, article, { compte: "601", tresorerie: "521", avecTva: true, fournisseur: "Brasserie" }, 0.18);
    expect(t).toMatchObject({ type: "d", m: -42480, source: "fournisseur", fournisseur: "Brasserie", compte: "601", tresorerie: "521", avecTva: true, activiteId: "hotel" });
    expect(t.desc).toBe("Achat stock — Eau minérale 1,5 L (120 bouteille) — BL-001");
  });

  it("les écritures générées : 601 HT + 4452 TVA / 4011, puis 4011 / banque", () => {
    const t = transactionAchatStock(mvt, article, { compte: "601", tresorerie: "521", avecTva: true }, 0.18);
    const [ac, tr] = ecrituresDeTransaction(t, 7, 0.18, 2026, 10);
    expect(ac.lignes.map((l) => [l.compte, l.debit, l.credit])).toEqual([
      ["601", 36000, 0], ["4452", 6480, 0], ["4011", 0, 42480],
    ]);
    expect(tr.lignes.map((l) => [l.compte, l.debit, l.credit])).toEqual([["4011", 42480, 0], ["521", 0, 42480]]);
  });

  it("sans TVA, en caisse, sans fournisseur : montant HT, « Fournisseur divers »", () => {
    const t = transactionAchatStock(mvt, article, { compte: "602", tresorerie: "571", avecTva: false }, 0.18);
    expect(t).toMatchObject({ m: -36000, fournisseur: "Fournisseur divers", tresorerie: "571", avecTva: false });
  });
});
