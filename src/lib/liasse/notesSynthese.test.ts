import { describe, it, expect } from "vitest";
import { etatsFinanciersLiasse } from "./etatsLiasse";
import {
  achatsParDesignation, creancesClients, saisiesAnalyseVentes, saisiesFicheRecapitulative, saisiesLoyers,
  saisiesNote28, saisiesNote31, saisiesNote34, saisiesNote3D, saisiesTva,
} from "./notesSynthese";
import { saisiesNotesSoldes } from "./notesReel";
import { cumulADate } from "@/lib/cessionImmo";

const e = (piece: string, date: string, lignes: [string, number, number][], journal = "OD") => ({
  id: 0, journal, numeroPiece: piece, libelle: piece, statut: "valide", date,
  annee: Number(date.slice(0, 4)), mois: Number(date.slice(5, 7)),
  lignes: lignes.map(([compte, debit, credit], i) => ({ id: i + 1, compte, intitule: "", debit, credit })),
});
const facture = (date: string, lignes: [string, number][], totalHT: number) => ({
  id: 1, numero: "F", client: "Client", date, lignes: lignes.map(([description, montant]) => ({ description, montant })),
  reduction: 0, avecTva: true, statut: "payee", totalHT, totalTva: Math.round(totalHT * 0.18), totalTtc: Math.round(totalHT * 1.18),
});
const donnees = {
  "2025-12": { ecritures: [
    e("CAP", "2025-01-02", [["521", 1_000_000, 0], ["101", 0, 1_000_000]]),
    e("VE", "2025-06-01", [["4111", 590_000, 0], ["701", 0, 500_000], ["4431", 0, 90_000]]),
    e("Achat ordinateurs", "2025-05-01", [["601", 300_000, 0], ["4452", 54_000, 0], ["4011", 0, 354_000]]),
    e("PROV", "2025-12-31", [["6594", 40_000, 0], ["491", 0, 40_000]]),
  ] },
  "2026-12": { ecritures: [
    e("VE", "2026-03-01", [["4111", 1_180_000, 0], ["701", 0, 1_000_000], ["4431", 0, 180_000]]),
    e("Achat ordinateurs", "2026-02-01", [["601", 400_000, 0], ["4452", 72_000, 0], ["4011", 0, 472_000]]),
    e("Achat imprimantes", "2026-02-10", [["601", 100_000, 0], ["4011", 0, 100_000]]),
    e("LOY", "2026-04-01", [["6222", 240_000, 0], ["521", 0, 240_000]]),
    e("CAUTION", "2026-04-01", [["275", 120_000, 0], ["521", 0, 120_000]]),
    e("AVANCE", "2026-05-01", [["421", 50_000, 0], ["521", 0, 50_000]]),
    e("REPRISE", "2026-12-31", [["491", 40_000, 0], ["7594", 0, 40_000]]),
    e("DOT", "2026-12-31", [["6594", 25_000, 0], ["491", 0, 25_000]]),
    e("SAL", "2026-06-30", [["661", 600_000, 0], ["664", 100_000, 0], ["422", 0, 700_000]]),
    e("AFF", "2026-06-30", [["131", 0, 0], ["111", 0, 16_000], ["121", 16_000, 0]]),
  ], factures: [facture("2026-03-01", [["Ordinateur portable", 800_000], ["Installation", 200_000]], 1_000_000)] },
} as never;
const cellule = (s: { feuille: string; cellule: string; valeur: unknown }[], f: string, c: string) =>
  s.find((x) => x.feuille === f && x.cellule === c)?.valeur;

describe("notes de synthèse (système normal)", () => {
  it("note 4 (dépôts), note 8 (personnel) et note 14 (réserve légale) à partir des soldes", () => {
    const s = saisiesNotesSoldes(donnees, 2026);
    expect(cellule(s, "NOTE 4", "F15")).toBe(120_000);
    expect(cellule(s, "NOTE 4", "F21")).toBe(120_000);
    expect(cellule(s, "NOTE 8", "E10")).toBe(50_000);
    expect(cellule(s, "NOTE 8", "E12")).toBe(126_000); // TVA récupérable (445), créance sur l'État
    expect(cellule(s, "NOTE 8", "E22")).toBe(176_000);
    expect(cellule(s, "NOTE 14", "F16")).toBe(16_000);
  });

  it("note 28 : ouverture + dotations − reprises = clôture des dépréciations clients", () => {
    const s = saisiesNote28(donnees, 2026);
    expect([cellule(s, "NOTE 28", "B19"), cellule(s, "NOTE 28", "C19"), cellule(s, "NOTE 28", "F19"), cellule(s, "NOTE 28", "I19")])
      .toEqual([40_000, 25_000, 40_000, 25_000]);
    expect(cellule(s, "NOTE 28", "I27")).toBe(25_000);
  });

  it("note 31 : capital, chiffre d'affaires et masse salariale de N et N-1", () => {
    const s = saisiesNote31(donnees, 2026, [{ masseAnnuelle: 600_000 }, { masseAnnuelle: 0 }]);
    expect(cellule(s, "NOTE 31", "G22")).toBe(1_000_000);
    expect(cellule(s, "NOTE 31", "H22")).toBe(500_000);
    expect(cellule(s, "NOTE 31", "G15")).toBe(1_000_000);
    expect(cellule(s, "NOTE 31", "G31")).toBe(2);
    expect(cellule(s, "NOTE 31", "G33")).toBe(600_000);
    expect(cellule(s, "NOTE 31", "G34")).toBe(100_000);
    expect(cellule(s, "NOTE 31", "I22")).toBeUndefined();
    // Résultat des activités ordinaires hors dotations et reprises
    const cr = etatsFinanciersLiasse(donnees, 2026).n.cr;
    expect(cellule(s, "NOTE 31", "G23")).toBe(cr.XG - cr.RL - cr.RN - cr.TJ - cr.TL);
  });

  it("note 34 : soldes intermédiaires en milliers, cohérents avec le compte de résultat", () => {
    const s = saisiesNote34(donnees, 2026);
    const cr = etatsFinanciersLiasse(donnees, 2026).n.cr;
    expect(cellule(s, "NOTE 34", "G11")).toBe(Math.round(cr.XB / 1000));
    expect(cellule(s, "NOTE 34", "G19")).toBe(Math.round(cr.XI / 1000));
    expect(cellule(s, "NOTE 34", "H11")).toBe(500);
  });

  it("page 63 : chiffre d'affaires et loyers des locaux", () => {
    const s = saisiesLoyers(etatsFinanciersLiasse(donnees, 2026), donnees, "Lomé");
    expect([cellule(s, "Page 63 Autres Renseig.", "A14"), cellule(s, "Page 63 Autres Renseig.", "C14"), cellule(s, "Page 63 Autres Renseig.", "F14")])
      .toEqual(["Lomé", 1_000_000, 240_000]);
  });

  it("P73 : ventes par désignation ; P71 : achats par libellé", () => {
    const v = saisiesAnalyseVentes(donnees, 2026);
    expect(cellule(v, "P73 Analyse des Ventes", "A15")).toBe("Ordinateur portable");
    expect(cellule(v, "P73 Analyse des Ventes", "J15")).toBe(800_000);
    expect(cellule(v, "P73 Analyse des Ventes", "J55")).toBe(1_000_000);
    // Regroupés par nature (intitulé du compte) : ici deux achats de marchandises (601)
    expect(achatsParDesignation(donnees, 2026)).toEqual([{ designation: "601", montant: 500_000 }]);
  });

  it("P73 : les recettes encaissées sans facture complètent le total jusqu'au chiffre d'affaires", () => {
    const d = {
      "2026-3": {
        factures: [
          { id: 1, statut: "payee", totalHT: 400_000, lignes: [{ description: "Nuitées", montant: 400_000 }] },
          // En attente de validation : pas encore de vente comptabilisée
          { id: 2, statut: "en_attente", statutValidation: "en_validation", totalHT: 90_000, lignes: [{ description: "Salle", montant: 90_000 }] },
        ],
        ecritures: [
          { id: 1, journal: "VE", numeroPiece: "VE-1", libelle: "", statut: "valide", lignes: [{ id: 1, compte: "706", intitule: "", debit: 0, credit: 400_000 }] },
          { id: 2, journal: "CA", numeroPiece: "TR-9", libelle: "", statut: "valide", lignes: [{ id: 1, compte: "706", intitule: "", debit: 0, credit: 150_000 }] },
        ],
      },
    } as never;
    const v = saisiesAnalyseVentes(d, 2026);
    expect([cellule(v, "P73 Analyse des Ventes", "A16"), cellule(v, "P73 Analyse des Ventes", "J16")]).toEqual(["Ventes sans facture (recettes encaissées)", 150_000]);
    expect(cellule(v, "P73 Analyse des Ventes", "J55")).toBe(550_000);
  });

  it("P78 : facture non réglée à la clôture = créance, réglée avant = soldée", () => {
    const f = (id: number, date: string, activite: string, ttc: number) => ({ id, date, activite, statut: "payee", totalTtc: ttc, lignes: [] });
    const d = {
      "2025-12": { factures: [f(1, "2025-12-20", "commerce", 118_000), f(2, "2025-12-22", "service", 59_000), f(3, "2025-11-05", "service", 10_000)], transactions: [{ factureId: 3, date: "2025-11-30" }] },
      "2026-1": { transactions: [{ factureId: 1, date: "2026-01-15" }, { factureId: 2, date: "2026-01-16" }] },
    } as never;
    expect(creancesClients(d, 2025)).toEqual({ biens: 118_000, services: 59_000 });
    expect(creancesClients(d, 2026)).toEqual({ biens: 0, services: 0 });
  });

  it("P79 : TVA facturée, récupérable et due", () => {
    const s = saisiesTva(donnees, 2026);
    expect([cellule(s, "P79 TVA", "E18"), cellule(s, "P79 TVA", "E24"), cellule(s, "P79 TVA", "E25")]).toEqual([72_000, 180_000, 108_000]);
  });

  it("note 3D : cession d'un véhicule avec plus-value", () => {
    const vehicule = {
      id: 1, libelle: "Véhicule", dateAcquisition: "2024-01-01", valeurOrigine: 1_000_000, dureeAmortissement: 5, methode: "lineaire",
      comptesSYSCOHADA: { actif: "2451", amortissementCumule: "2845", dotation: "6813" }, statut: "cede", dateCession: "2026-01-01", valeurCession: 700_000,
    } as never;
    const s = saisiesNote3D([vehicule], 2026);
    const amort = Math.round(cumulADate(vehicule, "2026-01-01"));
    expect([cellule(s, "NOTE 3D", "D19"), cellule(s, "NOTE 3D", "E19"), cellule(s, "NOTE 3D", "F19"), cellule(s, "NOTE 3D", "G19"), cellule(s, "NOTE 3D", "H19")])
      .toEqual([1_000_000, amort, 1_000_000 - amort, 700_000, 700_000 - (1_000_000 - amort)]);
    expect(cellule(s, "NOTE 3D", "H24")).toBe(700_000 - (1_000_000 - amort));
  });

  it("FR 4 : A pour une note remplie, N/A sinon ; note 2 toujours applicable", () => {
    const s = saisiesFicheRecapitulative([{ feuille: "NOTE 21", cellule: "E11", valeur: 10 }, { feuille: "NOTE 22", cellule: "C10", valeur: 0 }]);
    expect(cellule(s, "FR 4", "G39")).toBe("X");
    expect(cellule(s, "FR 4", "H40")).toBe("X");
    expect(cellule(s, "FR 4", "G11")).toBe("X");
  });
});
