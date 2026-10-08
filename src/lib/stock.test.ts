import { describe, it, expect } from "vitest";
import {
  appliquerMouvement,
  annulerMouvement,
  ecartAjustement,
  libelleEcart,
  ErreurStock,
} from "./stock";

const etat = { stock: 5, prixAchat: 1_000 };

describe("appliquerMouvement", () => {
  it("refuse une sortie supérieure au stock", () => {
    expect(() => appliquerMouvement(etat, { type: "sortie", quantite: 10 })).toThrow(ErreurStock);
  });

  it("recalcule le PMP à l'entrée", () => {
    const r = appliquerMouvement(etat, { type: "entree", quantite: 5, prixUnitaire: 2_000 });
    expect(r).toEqual({ stock: 10, prixAchat: 1_500 });
  });

  it("l'ajustement fixe le stock", () => {
    expect(appliquerMouvement(etat, { type: "ajustement", quantite: 8 }).stock).toBe(8);
  });
});

describe("annulerMouvement", () => {
  it("annuler une sortie remet exactement la quantité sortie", () => {
    const apres = appliquerMouvement(etat, { type: "sortie", quantite: 3 });
    expect(annulerMouvement(apres, { type: "sortie", quantite: 3 })).toEqual(etat);
  });

  it("annuler une entrée restaure stock et PMP", () => {
    const entree = { type: "entree" as const, quantite: 5, prixUnitaire: 2_000 };
    const r = annulerMouvement(appliquerMouvement(etat, entree), entree);
    expect(r.stock).toBe(5);
    expect(r.prixAchat).toBeCloseTo(1_000, 6);
  });

  it("refuse d'annuler une entrée déjà consommée", () => {
    expect(() => annulerMouvement({ stock: 2, prixAchat: 1_000 }, { type: "entree", quantite: 5 }))
      .toThrow(ErreurStock);
  });

  it("annule un ajustement grâce à l'écart inscrit dans son motif", () => {
    const motif = `Inventaire INV-1 ${libelleEcart(-2)}`;
    expect(annulerMouvement({ stock: 3, prixAchat: 1_000 }, { type: "ajustement", quantite: 3, motif }).stock)
      .toBe(5);
  });

  it("refuse d'annuler un ajustement sans écart connu", () => {
    expect(() => annulerMouvement(etat, { type: "ajustement", quantite: 3, motif: "Casse" }))
      .toThrow(ErreurStock);
  });
});

describe("ecartAjustement", () => {
  it.each([
    ["Inventaire X (écart : +3)", 3],
    ["(écart : -2)", -2],
    ["(écart : 1,5)", 1.5],
    ["Casse", null],
  ])("%s → %s", (motif, attendu) => {
    expect(ecartAjustement(motif)).toBe(attendu);
  });
});
