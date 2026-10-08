import { describe, it, expect } from "vitest";
import {
  ecrituresDeTransaction,
  ecritureTresorerieAutonome,
  estEcritureDeTransaction,
} from "./ecrituresTresorerie";

const equilibre = (lignes: { debit: number; credit: number }[]) =>
  lignes.reduce((s, l) => s + l.debit, 0) === lignes.reduce((s, l) => s + l.credit, 0);

const base = { date: "2026-10-05", desc: "Test", activiteId: null };

describe("ecrituresDeTransaction", () => {
  it("dépense manuelle : charge au débit, Caisse au crédit, à la date de la dépense", () => {
    const [e, ...autres] = ecrituresDeTransaction(
      { ...base, type: "d", m: -350_000, source: "manuelle", compte: "6222", tresorerie: "571" },
      42, 0.18, 2026, 10,
    );
    expect(autres).toHaveLength(0);
    expect(e.journal).toBe("CA");
    expect(e.numeroPiece).toBe("TR-42");
    expect(e.date).toBe("2026-10-05");
    expect(e.statut).toBe("brouillon");
    expect(e.lignes.map((l) => [l.compte, l.debit, l.credit])).toEqual([["6222", 350_000, 0], ["571", 0, 350_000]]);
  });

  it("recette manuelle : Banque au débit, produit au crédit (706 par défaut)", () => {
    const [e] = ecrituresDeTransaction({ ...base, type: "r", m: 300_000, source: "manuelle" }, 7, 0.18, 2026, 10);
    expect(e.journal).toBe("BQ");
    expect(e.lignes.map((l) => [l.compte, l.debit, l.credit])).toEqual([["521", 300_000, 0], ["706", 0, 300_000]]);
  });

  it("achat fournisseur avec TVA : achat AC (HT + TVA / 4011) puis règlement TR", () => {
    const [achat, reglement] = ecrituresDeTransaction(
      { ...base, type: "d", m: -236_000, source: "fournisseur", fournisseur: "F", avecTva: true, compte: "6055" },
      15, 0.18, 2026, 10,
    );
    expect(achat.numeroPiece).toBe("AC-15");
    expect(achat.lignes.map((l) => [l.compte, l.debit, l.credit])).toEqual([
      ["6055", 200_000, 0], ["4452", 36_000, 0], ["4011", 0, 236_000],
    ]);
    expect(reglement.numeroPiece).toBe("TR-15");
    expect(reglement.lignes.map((l) => [l.compte, l.debit, l.credit])).toEqual([["4011", 236_000, 0], ["521", 0, 236_000]]);
    expect(equilibre(achat.lignes) && equilibre(reglement.lignes)).toBe(true);
  });

  it("achat fournisseur sans TVA : aucune ligne 4452", () => {
    const [achat] = ecrituresDeTransaction(
      { ...base, type: "d", m: -50_000, source: "fournisseur", fournisseur: "Artisan", avecTva: false, compte: "624" },
      18, 0.18, 2026, 10,
    );
    expect(achat.lignes.map((l) => l.compte)).toEqual(["624", "4011"]);
  });

  it("factures et salaires : pas d'écriture ici (elles ont les leurs)", () => {
    expect(ecrituresDeTransaction({ ...base, type: "r", m: 100, source: "facture" }, 1, 0.18, 2026, 10)).toEqual([]);
    expect(ecrituresDeTransaction({ ...base, type: "d", m: -100, source: "salaires" }, 2, 0.18, 2026, 10)).toEqual([]);
  });
});

describe("écritures et totaux de trésorerie", () => {
  it("une écriture TR- n'est pas recomptée (la transaction l'est déjà)", () => {
    expect(ecritureTresorerieAutonome({ statut: "valide", factureId: null, numeroPiece: "TR-42" })).toBe(false);
    expect(ecritureTresorerieAutonome({ statut: "valide", factureId: 3, numeroPiece: "BQ-FAC-2026-001" })).toBe(false);
    expect(ecritureTresorerieAutonome({ statut: "brouillon", factureId: null, numeroPiece: "OD-2026-0009" })).toBe(false);
    expect(ecritureTresorerieAutonome({ statut: "valide", factureId: null, numeroPiece: "OD-2026-0009" })).toBe(true);
  });

  it("retrouve les écritures d'une transaction précise", () => {
    expect(estEcritureDeTransaction({ numeroPiece: "AC-15" }, 15)).toBe(true);
    expect(estEcritureDeTransaction({ numeroPiece: "TR-15" }, 15)).toBe(true);
    expect(estEcritureDeTransaction({ numeroPiece: "TR-150" }, 15)).toBe(false);
    expect(estEcritureDeTransaction({ numeroPiece: "BQ-2026-0007" })).toBe(false);
  });
});

describe("ecritureAcquisitionImmo", () => {
  it("serveur payé par banque : 2442 au débit, 521 au crédit, à la date d'acquisition", async () => {
    const { ecritureAcquisitionImmo } = await import("./ecrituresTresorerie");
    const e = ecritureAcquisitionImmo(
      { libelle: "Serveur", valeurOrigine: 1_200_000, dateAcquisition: "2026-10-01", compteActif: "2442" },
      9,
      "521",
    );
    expect(e.journal).toBe("BQ");
    expect(e.numeroPiece).toBe("IM-9");
    expect([e.annee, e.mois, e.date]).toEqual([2026, 10, "2026-10-01"]);
    expect(e.lignes.map((l) => [l.compte, l.debit, l.credit])).toEqual([["2442", 1_200_000, 0], ["521", 0, 1_200_000]]);
  });

  it("à payer au fournisseur : journal OD, contrepartie 481", async () => {
    const { ecritureAcquisitionImmo } = await import("./ecrituresTresorerie");
    const e = ecritureAcquisitionImmo(
      { libelle: "Véhicule", valeurOrigine: 8_000_000, dateAcquisition: "2026-03-15", compteActif: "245" },
      3,
      "481",
    );
    expect(e.journal).toBe("OD");
    expect(e.lignes[1]).toMatchObject({ compte: "481", credit: 8_000_000 });
  });
});

describe("recette avec TVA", () => {
  it("montant TTC : produit HT et TVA collectée 4431", () => {
    const [e] = ecrituresDeTransaction(
      { ...base, type: "r", m: 354_000, source: "manuelle", avecTva: true },
      30, 0.18, 2026, 10,
    );
    expect(e.lignes.map((l) => [l.compte, l.debit, l.credit])).toEqual([
      ["521", 354_000, 0], ["706", 0, 300_000], ["4431", 0, 54_000],
    ]);
  });
});
