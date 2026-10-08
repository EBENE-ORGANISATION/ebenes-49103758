import { describe, it, expect } from "vitest";
import type { EcritureComptable, Facture, Transaction } from "@/types/ebene";
import { isoLocal, tauxPourMois, transactionComptabilisee, tvaDepuisTransactions } from "./ebene-utils";
import { TAUX_DEFAUT } from "@/types/ebene";

describe("dates locales", () => {
  it("isoLocal garde le jour local (minuit local ne recule pas d'un jour)", () => {
    expect(isoLocal(new Date(2026, 2, 31))).toBe("2026-03-31");
  });

  it("un taux en vigueur le dernier jour du mois s'applique à ce mois", () => {
    const nouveau = { ...TAUX_DEFAUT, dateEffet: "2026-03-31", tva: 0.2 };
    expect(tauxPourMois([TAUX_DEFAUT, nouveau], 2026, 3).tva).toBe(0.2);
  });
});

const tx = (p: Partial<Transaction>): Transaction => ({
  id: 1,
  date: "2026-03-10",
  desc: "",
  type: "r",
  m: 0,
  source: "manuelle",
  ...p,
});

const facture = (p: Partial<Facture>): Facture => ({
  id: 10,
  numero: "FAC-2026-001",
  client: "Client",
  date: "2026-03-10",
  lignes: [],
  reduction: 0,
  avecTva: true,
  statut: "payee",
  totalHT: 100_000,
  totalTva: 18_000,
  totalTtc: 118_000,
  ...p,
});

describe("transactionComptabilisee", () => {
  it("exclut les transactions rejetées, même automatiques", () => {
    expect(transactionComptabilisee(tx({ statut: "rejete" }))).toBe(false);
    expect(transactionComptabilisee(tx({ source: "facture", statut: "rejete" }))).toBe(false);
  });

  it("exclut les saisies manuelles non validées", () => {
    expect(transactionComptabilisee(tx({ statut: "en_validation" }))).toBe(false);
    expect(transactionComptabilisee(tx({ statut: "brouillon" }))).toBe(false);
  });

  it("compte les saisies validées et les anciennes sans statut", () => {
    expect(transactionComptabilisee(tx({ statut: "valide" }))).toBe(true);
    expect(transactionComptabilisee(tx({ statut: undefined }))).toBe(true);
  });

  it("compte les transactions générées (facture payée, salaires) en attente de validation", () => {
    expect(transactionComptabilisee(tx({ source: "facture", statut: "en_validation" }))).toBe(true);
    expect(transactionComptabilisee(tx({ source: "salaires", statut: "en_validation" }))).toBe(true);
  });
});

describe("tvaDepuisTransactions", () => {
  it("reprend le HT et la TVA de la facture au lieu de taxer le TTC", () => {
    const r = tvaDepuisTransactions(
      [tx({ source: "facture", factureId: 10, m: 118_000 })],
      [facture({})],
      0.18,
    );
    expect(r.caHT).toBe(100_000);
    expect(r.tvaCollectee).toBe(18_000); // et non 118 000 × 18 % = 21 240
  });

  it("ne collecte pas de TVA sur une facture émise sans TVA", () => {
    const r = tvaDepuisTransactions(
      [tx({ source: "facture", factureId: 10, m: 100_000 })],
      [facture({ avecTva: false, totalTva: 0, totalTtc: 100_000 })],
      0.18,
    );
    expect(r.tvaCollectee).toBe(0);
  });

  it("ne déduit la TVA que sur les achats fournisseurs", () => {
    const r = tvaDepuisTransactions(
      [
        tx({ type: "d", source: "salaires", m: -500_000 }),
        tx({ type: "d", source: "manuelle", statut: "valide", m: -200_000 }), // loyer
        tx({ type: "d", source: "fournisseur", statut: "valide", m: -118_000 }),
      ],
      [],
      0.18,
    );
    expect(r.tvaDeductible).toBe(18_000);
  });

  it("reprend la TVA de l'écriture d'achat : rien si la facture fournisseur était sans TVA", () => {
    const achat = tx({ id: 7, type: "d", source: "fournisseur", statut: "valide", m: -100_000 });
    const sansTva = {
      id: 1, journal: "AC", numeroPiece: "AC-7", libelle: "", statut: "brouillon",
      lignes: [
        { id: 1, compte: "6057", intitule: "", debit: 100_000, credit: 0 },
        { id: 3, compte: "4011", intitule: "", debit: 0, credit: 100_000 },
      ],
    } as unknown as EcritureComptable;
    expect(tvaDepuisTransactions([achat], [], 0.18, [sansTva]).tvaDeductible).toBe(0);
  });

  it("ignore les transactions rejetées ou en attente", () => {
    const r = tvaDepuisTransactions(
      [
        tx({ statut: "rejete", m: 50_000 }),
        tx({ statut: "en_validation", m: 50_000 }),
        tx({ type: "d", source: "fournisseur", statut: "rejete", m: -118_000 }),
      ],
      [],
      0.18,
    );
    expect(r).toEqual({ caHT: 0, tvaCollectee: 0, tvaDeductible: 0 });
  });
});
