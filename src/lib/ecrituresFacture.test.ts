import { describe, it, expect } from "vitest";
import {
  aEcritureVente, contrePassation, ecrituresFacturePayee, ecrituresReglementFacture, ecritureVenteFacture, estContrePassation,
} from "./ecrituresFacture";
import { fiscaliteDepuisEcritures, soldesExercice } from "./etatsFinanciers";

const equilibre = (lignes: { debit: number; credit: number }[]) =>
  lignes.reduce((s, l) => s + l.debit, 0) === lignes.reduce((s, l) => s + l.credit, 0);
const comptes = (e: { lignes: { compte: string; debit: number; credit: number }[] }) => e.lignes.map((l) => [l.compte, l.debit, l.credit]);

const facture = {
  id: 7,
  numero: "FAC-007",
  client: "Client A",
  date: "2026-10-03",
  activite: "service" as const,
  avecTva: true,
  totalHT: 100000,
  totalTva: 18000,
  totalTtc: 118000,
};

describe("vente à la validation, règlement au paiement", () => {
  it("prestation de services : TVA en attente (4438) à la validation, exigible (4432) à l'encaissement", () => {
    const ve = ecritureVenteFacture(facture, 2026, 10, null);
    expect(ve).toMatchObject({ journal: "VE", numeroPiece: "VE-FAC-007", statut: "valide", factureId: 7, date: "2026-10-03" });
    expect(comptes(ve)).toEqual([["4111", 118000, 0], ["706", 0, 100000], ["4438", 0, 18000]]);

    const [bq, tva] = ecrituresReglementFacture(facture, "521", "2026-11-05", 2026, 11, null);
    expect(bq).toMatchObject({ journal: "BQ", numeroPiece: "BQ-FAC-007", date: "2026-11-05", annee: 2026, mois: 11 });
    expect(comptes(bq)).toEqual([["521", 118000, 0], ["4111", 0, 118000]]);
    expect(tva).toMatchObject({ journal: "OD", numeroPiece: "TVA-FAC-007", date: "2026-11-05" });
    expect(comptes(tva)).toEqual([["4438", 18000, 0], ["4432", 0, 18000]]);
    expect(tva.lignes[1].base).toBe(100000);
    for (const e of [ve, bq, tva]) expect(equilibre(e.lignes)).toBe(true);
  });

  it("vente de marchandises : TVA due dès la facture (4431), pas de virement au paiement", () => {
    const f = { ...facture, activite: "commerce" as const };
    expect(comptes(ecritureVenteFacture(f, 2026, 10, null))).toEqual([["4111", 118000, 0], ["701", 0, 100000], ["4431", 0, 18000]]);
    expect(ecrituresReglementFacture(f, "571", "2026-10-20", 2026, 10, "act-1").map((e) => e.journal)).toEqual(["CA"]);
  });

  it("sans TVA : ni 4431 ni 4438", () => {
    const f = { ...facture, activite: "commerce" as const, avecTva: false, totalTva: 0, totalTtc: 100000 };
    expect(ecritureVenteFacture(f, 2026, 10, null).lignes.map((l) => l.compte)).toEqual(["4111", "701"]);
    const [ca] = ecrituresReglementFacture(f, "571", "2026-10-03", 2026, 10, "act-1");
    expect(ca).toMatchObject({ journal: "CA", numeroPiece: "CA-FAC-007", activiteId: "act-1" });
    expect(ca.lignes[0]).toMatchObject({ compte: "571", debit: 100000 });
  });

  it("reconnaît une facture dont la vente est déjà passée", () => {
    const ve = { ...ecritureVenteFacture(facture, 2026, 10, null), id: 1 };
    expect(aEcritureVente([ve], facture)).toBe(true);
    expect(aEcritureVente([ve], { id: 8, numero: "FAC-008" })).toBe(false);
  });

  it("facture payée en une fois (ancienne facture) : vente, règlement et TVA exigible", () => {
    expect(ecrituresFacturePayee(facture, "521", 2026, 10, null).map((e) => e.numeroPiece)).toEqual(["VE-FAC-007", "BQ-FAC-007", "TVA-FAC-007"]);
  });
});

describe("déclaration de TVA", () => {
  const fisc = (es: ReturnType<typeof ecritureVenteFacture>[]) => fiscaliteDepuisEcritures(es as never);

  it("mois de la facture de services : CA comptabilisé, ni TVA ni base imposable", () => {
    const f = fisc([ecritureVenteFacture(facture, 2026, 10, null)]);
    expect([f.caHT, f.caTaxable, f.caNonTaxable, f.tvaCollectee]).toEqual([100000, 0, 0, 0]);
  });

  it("mois de l'encaissement : base et TVA exigibles", () => {
    const f = fisc(ecrituresReglementFacture(facture, "521", "2026-11-05", 2026, 11, null));
    expect([f.caHT, f.caTaxable, f.tvaCollectee]).toEqual([0, 100000, 18000]);
  });

  it("marchandises : base et TVA dès la facture ; vente sans TVA : hors champ", () => {
    const f = fisc([
      ecritureVenteFacture({ ...facture, activite: "commerce" }, 2026, 10, null),
      ecritureVenteFacture({ ...facture, id: 9, numero: "FAC-009", avecTva: false, totalTva: 0, totalTtc: 100000 }, 2026, 10, null),
    ]);
    expect([f.caHT, f.caTaxable, f.caNonTaxable, f.tvaCollectee]).toEqual([200000, 100000, 100000, 18000]);
  });
});

describe("ventilation — articles du stock", () => {
  it("facture d'hôtel avec nuitées et boissons : TVA des boissons due, celle des nuitées en attente", () => {
    const ve = ecritureVenteFacture(
      {
        ...facture,
        lignes: [
          { description: "Nuitées", montant: 200000 },
          { description: "Eau", montant: 50000, articleId: 3, quantite: 50, prixUnitaire: 1000 },
        ],
        totalHT: 225000, // réduction de 25 000
        totalTva: 40500,
        totalTtc: 265500,
      },
      2026, 10, null,
    );
    expect(comptes(ve)).toEqual([
      ["4111", 265500, 0],
      ["706", 0, 180000],
      ["701", 0, 45000],
      ["4431", 0, 8100],
      ["4438", 0, 32400],
    ]);
    expect(equilibre(ve.lignes)).toBe(true);
  });
});

describe("taxe de séjour", () => {
  it("hors TVA, ajoutée au montant du client et collectée en 442", () => {
    const f = { ...facture, taxeSejour: 6000, totalTtc: 124000 };
    expect(comptes(ecritureVenteFacture(f, 2026, 10, null))).toEqual([
      ["4111", 124000, 0], ["706", 0, 100000], ["4438", 0, 18000], ["442", 0, 6000],
    ]);
    expect(ecrituresReglementFacture(f, "521", "2026-10-03", 2026, 10, null)[0].lignes[0]).toMatchObject({ compte: "521", debit: 124000 });
  });
});

describe("contrePassation", () => {
  it("inverse débit et crédit, à la date de l'annulation : les soldes reviennent à zéro", () => {
    const origine = ecrituresFacturePayee(facture, "521", 2026, 10, null);
    const annulation = origine.map((e) => contrePassation(e, "2026-10-20", 2026, 10));
    expect(annulation[0].numeroPiece).toBe("AN-VE-FAC-007");
    expect(annulation[0].libelle).toBe("Annulation — Facture FAC-007 — Client A");
    expect(annulation[0]).toMatchObject({ statut: "valide", factureId: 7, date: "2026-10-20" });
    expect(annulation[0].lignes[0]).toMatchObject({ compte: "4111", debit: 0, credit: 118000 });
    expect(annulation.every((e) => equilibre(e.lignes))).toBe(true);

    const toutes = [...origine, ...annulation].map((e, i) => ({ ...e, id: i + 1 }));
    const soldes = soldesExercice({ "2026-10": { ecritures: toutes } } as never, 2026);
    expect([...soldes.keys()].sort()).toEqual(["4111", "4432", "4438", "521", "706"]);
    for (const solde of soldes.values()) expect(solde).toBe(0);
    // La déclaration aussi revient à zéro (base de TVA contre-passée)
    const f = fiscaliteDepuisEcritures(toutes as never);
    expect([f.caHT, f.caTaxable, f.tvaCollectee]).toEqual([0, 0, 0]);
  });

  it("reconnaît une contre-passation", () => {
    expect(estContrePassation({ numeroPiece: "AN-VE-FAC-007" })).toBe(true);
    expect(estContrePassation({ numeroPiece: "VE-FAC-007" })).toBe(false);
  });
});

describe("facture multi-activités : un produit par activité", () => {
  const multi = {
    ...facture,
    totalHT: 600000,
    totalTva: 108000,
    totalTtc: 708000,
    reduction: 0,
    lignes: [
      { description: "Installation réseau", montant: 450000 },
      { description: "Nettoyage", montant: 75000, activiteId: "entretien" },
      { description: "3 nuitées", montant: 75000, activiteId: "hotel" },
    ],
  };

  it("le 706 est découpé par activité, les lignes sans activité suivent celle de la facture", () => {
    const ve = ecritureVenteFacture(multi, 2026, 10, "info");
    const produits = ve.lignes.filter((l) => l.compte === "706").map((l) => [l.activiteId, l.credit]);
    expect(produits).toEqual([["info", 450000], ["entretien", 75000], ["hotel", 75000]]);
    expect(equilibre(ve.lignes)).toBe(true);
    expect(ve.activiteId).toBe("info");
  });

  it("la réduction se répartit au prorata, sans écart d'arrondi", () => {
    const remise = { ...multi, totalHT: 599999, totalTva: 108000, totalTtc: 707999 };
    const ve = ecritureVenteFacture(remise, 2026, 10, "info");
    const total = ve.lignes.filter((l) => l.compte === "706").reduce((s, l) => s + l.credit, 0);
    expect(total).toBe(599999);
    expect(equilibre(ve.lignes)).toBe(true);
  });

  it("sans activité sur les lignes, l'écriture reste celle d'avant (une ligne par compte, sans activité de ligne)", () => {
    const ve = ecritureVenteFacture({ ...facture, lignes: [{ description: "A", montant: 100000 }] }, 2026, 10, "info");
    const l706 = ve.lignes.find((l) => l.compte === "706")!;
    expect(l706.credit).toBe(100000);
    expect(l706.activiteId).toBeUndefined();
  });

  it("la contre-passation garde l'activité de chaque ligne", () => {
    const an = contrePassation({ ...ecritureVenteFacture(multi, 2026, 10, "info") }, "2026-11-01", 2026, 11);
    expect(an.lignes.filter((l) => l.compte === "706").map((l) => [l.activiteId, l.debit])).toEqual([["info", 450000], ["entretien", 75000], ["hotel", 75000]]);
  });
});
