import { describe, it, expect } from "vitest";
import { manquesStock, quantitesParArticle, retoursFacture, sortiesFacture } from "./venteStock";

const lignes = [
  { description: "Ramette A4", montant: 30000, articleId: 1, quantite: 10, prixUnitaire: 3000 },
  { description: "Pose", montant: 50000 },
  { description: "Ramette A4 (suite)", montant: 6000, articleId: 1, quantite: 2, prixUnitaire: 3000 },
  { description: "Stylos", montant: 5000, articleId: 2, quantite: 50, prixUnitaire: 100 },
];
const articles = [
  { id: 1, designation: "Ramette A4", stock: 12, prixAchat: 2500 },
  { id: 2, designation: "Stylos", stock: 20, prixAchat: 60 },
];
const facture = { id: 9, numero: "FAC-009", client: "Client", lignes, activiteId: null };

describe("ventes reliées au stock", () => {
  it("additionne les quantités par article, ignore les prestations", () => {
    expect([...quantitesParArticle(lignes)]).toEqual([[1, 12], [2, 50]]);
  });

  it("signale les articles dont le stock ne couvre pas la facture", () => {
    expect(manquesStock(lignes, articles)).toEqual([{ articleId: 2, designation: "Stylos", demande: 50, disponible: 20 }]);
  });

  it("une sortie par article, liée à la facture", () => {
    const s = sortiesFacture(facture, "2026-10-20");
    expect(s.map((m) => [m.articleId, m.type, m.quantite, m.factureId, m.reference])).toEqual([
      [1, "sortie", 12, 9, "FAC-009"],
      [2, "sortie", 50, 9, "FAC-009"],
    ]);
  });

  it("annulation : remet en stock ce qui est sorti et pas encore revenu, au PMP actuel", () => {
    const mvts = [
      { articleId: 1, type: "sortie" as const, quantite: 12, factureId: 9 },
      { articleId: 2, type: "sortie" as const, quantite: 20, factureId: 9 },
      { articleId: 2, type: "entree" as const, quantite: 20, factureId: 9 }, // déjà revenu
      { articleId: 1, type: "sortie" as const, quantite: 5, factureId: 3 }, // autre facture
    ];
    const r = retoursFacture(facture, mvts, articles, "2026-10-25");
    expect(r).toEqual([expect.objectContaining({ articleId: 1, type: "entree", quantite: 12, prixUnitaire: 2500, factureId: 9 })]);
  });
});
