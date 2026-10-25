import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { TAUX_DEFAUT } from "@/types/ebene";
import { classeurXlsx, feuillesExport, lireTauxClasseur, dateExcel, FEUILLE_TAUX, type DonneesExport as D } from "./exportClasseur";

const ACT = [{ id: "a-info", nom: "Matériel informatique", couleur: "#000", actif: true }];

const donnees = (): D => ({
  donneesMensuelles: {
    "2026-10": {
      transactions: [
        { id: 1, date: "2026-10-16", desc: "Achat ramettes", type: "d", m: -118_000, source: "fournisseur", fournisseur: "TEST FOURNITURES", statut: "en_validation", pieceJointe: "data:image/png;base64,AAAA" },
      ],
      factures: [
        {
          id: 16, numero: "FAC-2026-016", client: "DÉMO Client Vidéo", date: "2026-10-16", reduction: 0, avecTva: true,
          statut: "payee", statutValidation: "valide", totalHT: 450_000, totalTva: 81_000, totalTtc: 531_000,
          compteTresorerie: "521", activiteId: "a-info",
          lignes: [{ description: "Installation réseau", montant: 450_000, quantite: 1, prixUnitaire: 450_000 }],
        },
      ],
      primes: { 9: [{ id: 1, libelle: "Prime de rendement", montant: 25_000, statutValidation: "valide" }] },
      ecritures: [
        {
          id: 1, journal: "VE", numeroPiece: "VE-2026-016", libelle: "Facture FAC-2026-016", statut: "valide", date: "2026-10-16",
          lignes: [
            { id: 1, compte: "4111", intitule: "Clients", debit: 531_000, credit: 0 },
            { id: 2, compte: "706", intitule: "Services vendus", debit: 0, credit: 450_000 },
            { id: 3, compte: "4431", intitule: "TVA facturée", debit: 0, credit: 81_000 },
          ],
        },
      ],
    },
    "2026-9": { transactions: [], factures: [], primes: {} },
  },
  employes: [{ id: 9, nom: "TEST Yao KODJO", poste: "Technicien", salaire: 180_000, situation: "marie", enfants: 2 }],
  paramsAnnuels: { "2026": { th: 60_000, loyerAnnuel: 1_200_000, activite: "service" } },
  tauxHistorique: [{ ...TAUX_DEFAUT, dateEffet: "2025-01-01" }, TAUX_DEFAUT],
  articles: [],
  fournisseurs: [],
  categoriesStock: [],
  sanctions: [],
  immobilisations: [],
});

const ctx = { societe: "EBENE SERVICES - TEST", activites: ACT, maintenant: new Date(2026, 9, 25) };
const feuille = (nom: string) => feuillesExport(donnees(), ctx).find((f) => f.nom === nom)!;

describe("feuillesExport", () => {
  it("ouvre sur un onglet Lisez-moi qui compte les lignes de chaque onglet", () => {
    const f = feuillesExport(donnees(), ctx);
    expect(f[0].nom).toBe("Lisez-moi");
    expect(f[0].lignes).toContainEqual({ "Rubrique": "Société", "Valeur": "EBENE SERVICES - TEST" });
    expect(f[0].lignes).toContainEqual({ "Rubrique": "Période", "Valeur": "2026-09 à 2026-10" });
    expect(f[0].lignes).toContainEqual({ "Rubrique": "Onglet « Écritures »", "Valeur": "3 lignes" });
  });

  it("garde des noms d'onglet acceptés par Excel (31 caractères, sans caractère interdit)", () => {
    for (const f of feuillesExport(donnees(), ctx)) {
      expect(f.nom.length).toBeLessThanOrEqual(31);
      expect(f.nom).not.toMatch(/[\\/?*[\]:]/);
    }
  });

  it("exporte les opérations en montant positif, sans la pièce jointe", () => {
    const [op] = feuille("Opérations").lignes;
    expect(op).toMatchObject({ "Mois": "2026-10", "Type": "Dépense", "Montant": 118_000, "Origine": "Fournisseur", "Statut": "En validation" });
    expect(op["Date"]).toEqual(new Date(2026, 9, 16));
    expect(JSON.stringify(feuillesExport(donnees(), ctx))).not.toContain("base64");
  });

  it("détaille une écriture ligne à ligne, équilibrée", () => {
    const l = feuille("Écritures").lignes;
    expect(l).toHaveLength(3);
    expect(l[0]).toMatchObject({ "Journal": "VE — Ventes", "N° pièce": "VE-2026-016", "Compte": "4111", "Débit": 531_000, "Crédit": 0 });
    const debit = l.reduce((s, x) => s + Number(x["Débit"]), 0);
    const credit = l.reduce((s, x) => s + Number(x["Crédit"]), 0);
    expect(debit).toBe(credit);
  });

  it("nomme l'activité, l'encaissement et l'employé au lieu de leurs identifiants", () => {
    expect(feuille("Factures").lignes[0]).toMatchObject({ "Statut": "Payée", "Encaissement": "Banque", "Activité": "Matériel informatique", "Total TTC": 531_000 });
    expect(feuille("Lignes de factures").lignes[0]).toMatchObject({ "Facture": "FAC-2026-016", "Activité": "Matériel informatique" });
    expect(feuille("Primes").lignes[0]).toMatchObject({ "Employé": "TEST Yao KODJO", "Montant": 25_000 });
  });

  it("trie les mois dans l'ordre chronologique (2026-9 avant 2026-10)", () => {
    const d = donnees();
    d.donneesMensuelles["2026-9"].transactions = [{ id: 2, date: "2026-09-30", desc: "Loyer", type: "d", m: -100_000, source: "manuelle" }];
    const ops = feuillesExport(d, ctx).find((f) => f.nom === "Opérations")!.lignes;
    expect(ops.map((o) => o["Mois"])).toEqual(["2026-09", "2026-10"]);
  });
});

describe("taux fiscaux : export puis import", () => {
  it("relit exactement les taux exportés, via un vrai classeur Excel", () => {
    const relu = XLSX.read(classeurXlsx(XLSX, feuillesExport(donnees(), ctx)), { type: "array", cellDates: true });
    expect(relu.SheetNames[0]).toBe("Lisez-moi");
    expect(XLSX.utils.sheet_to_json(relu.Sheets["Sanctions"], { header: 1 })).toEqual([["Aucune donnée"]]);
    const lignes = XLSX.utils.sheet_to_json<Record<string, unknown>>(relu.Sheets[FEUILLE_TAUX]);
    expect(lireTauxClasseur(lignes)).toEqual([{ ...TAUX_DEFAUT, dateEffet: "2025-01-01" }, TAUX_DEFAUT].sort((a, b) => a.dateEffet.localeCompare(b.dateEffet)));
  });

  it("accepte une date tapée à la française et une virgule décimale", () => {
    const [t] = lireTauxClasseur([{
      "Date d'effet": "01/01/2027", "TVA": "0,18", "IS": 0.27, "IMF (taux)": 0.01, "IMF (minimum)": "20 000",
      "Patente service": 0.0075, "Patente commerce": 0.0055, "CNSS salarié": 0.04, "CNSS employeur": 0.175,
      "AMU salarié": 0.05, "AMU employeur": 0.05, "Activité par défaut": "Commerce",
    }]);
    expect(t).toMatchObject({ dateEffet: "2027-01-01", tva: 0.18, imfMin: 20_000, activiteDefaut: "commerce" });
  });

  it("refuse une ligne incomplète en nommant la ligne et la colonne", () => {
    expect(() => lireTauxClasseur([{ "Date d'effet": "2027-01-01", "TVA": 0.18 }])).toThrow("Ligne 2 : « IS » manquant ou non numérique.");
    expect(() => lireTauxClasseur([{ "Date d'effet": "bientôt" }])).toThrow("Ligne 2 : date d'effet illisible.");
  });
});

describe("dateExcel", () => {
  it("convertit une date ISO sans décalage de fuseau, et laisse vide sinon", () => {
    expect(dateExcel("2026-01-31")).toEqual(new Date(2026, 0, 31));
    expect(dateExcel(undefined)).toBeNull();
    expect(dateExcel("")).toBeNull();
  });
});

