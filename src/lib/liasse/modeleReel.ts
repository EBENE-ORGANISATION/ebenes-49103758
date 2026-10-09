// Liasse du système normal (modèle OTR) : cellules à remplir — module pur.
import type { Saisie } from "./xlsxPatch";
import type { EtatsFinanciersLiasse } from "./etatsLiasse";

/** Informations de la société imprimées sur la liasse. */
export interface InfosSociete {
  nom: string;
  sigle?: string | null;
  adresse?: string | null;
  nif?: string | null;
  rccm?: string | null;
  telephone?: string | null;
  email?: string | null;
  ville?: string | null;
  boitePostale?: string | null;
  activite?: string | null;
  representant?: string | null;
  fonctionRepresentant?: string | null;
}

/** Date Excel (numéro de série) : les formules du modèle en extraient l'année. */
export const dateExcel = (iso: string): number => {
  const [a, m, j] = iso.split("-").map(Number);
  return Math.round((Date.UTC(a, m - 1, j) - Date.UTC(1899, 11, 30)) / 86400000);
};

// Lignes des états dans le modèle (référence → numéro de ligne)
export const LIGNES_ACTIF: Record<string, number> = { AD: 12, AE: 13, AF: 14, AG: 15, AH: 16, AI: 17, AJ: 18, AK: 19, AL: 20, AM: 21, AN: 22, AP: 23, AQ: 24, AR: 25, AS: 26, AZ: 27, BA: 28, BB: 29, BG: 30, BH: 31, BI: 32, BJ: 33, BK: 34, BQ: 35, BR: 36, BS: 37, BT: 38, BU: 39, BZ: 40 };
export const LIGNES_PASSIF: Record<string, number> = { CA: 11, CB: 12, CD: 13, CE: 14, CF: 15, CG: 16, CH: 17, CJ: 18, CL: 19, CM: 20, CP: 21, DA: 22, DB: 23, DC: 24, DD: 25, DF: 26, DH: 27, DI: 28, DJ: 29, DK: 30, DM: 31, DN: 32, DP: 33, DQ: 34, DR: 35, DT: 36, DV: 37, DZ: 38 };
export const LIGNES_CR: Record<string, number> = { TA: 10, RA: 11, RB: 12, XA: 13, TB: 14, TC: 15, TD: 16, XB: 17, TE: 18, TF: 19, TG: 20, TH: 21, TI: 22, RC: 23, RD: 24, RE: 25, RF: 26, RG: 27, RH: 28, RI: 29, RJ: 30, XC: 31, RK: 32, XD: 33, TJ: 34, RL: 35, XE: 36, TK: 37, TL: 38, TM: 39, RM: 40, RN: 41, XF: 42, XG: 43, TN: 44, TO: 45, RO: 46, RP: 47, XH: 48, RQ: 49, RS: 50, XI: 51 };
export const LIGNES_TFT: Record<string, number> = { ZA: 9, FA: 11, FB: 12, FC: 13, FD: 14, FE: 15, ZB: 17, FF: 19, FG: 20, FH: 21, FI: 22, FJ: 23, ZC: 24, FK: 26, FL: 27, FM: 28, FN: 29, ZD: 30, FO: 32, FP: 33, FQ: 34, ZE: 35, ZF: 36, ZG: 37, ZH: 38 };

/** Cellules de la liasse du système normal remplies avec les états financiers. */
export const saisiesReel = (etats: EtatsFinanciersLiasse, societe: InfosSociete, dateArrete: string): Saisie[] => {
  const a = etats.annee;
  const out: Saisie[] = [];
  const set = (feuille: string, cellule: string, valeur: number | string | null | undefined) => {
    if (valeur === undefined || valeur === null || valeur === "") return;
    out.push({ feuille, cellule, valeur });
  };

  // Fiche de dépôt : reprise par les en-têtes de toutes les pages
  const fd = "FICHE DEPOT SYST NORM";
  set(fd, "G23", dateExcel(`${a}-12-31`));
  set(fd, "E28", societe.nom);
  set(fd, "D31", societe.sigle);
  set(fd, "E34", societe.adresse);
  set(fd, "G38", societe.nif);

  // Fiche d'identification 1
  const f1 = "FICHE IDENTIFICATION 1 ";
  set(f1, "Q5", 12);
  set(f1, "J7", dateExcel(`${a}-01-01`));
  set(f1, "P7", dateExcel(`${a}-12-31`));
  set(f1, "J9", dateExcel(dateArrete));
  set(f1, "J11", dateExcel(`${a - 1}-12-31`));
  set(f1, "R11", 12);
  set(f1, "D13", societe.rccm);
  set(f1, "B17", societe.nom);
  set(f1, "P17", societe.sigle);
  set(f1, "C20", societe.telephone);
  set(f1, "G20", societe.email);
  set(f1, "N20", societe.boitePostale);
  set(f1, "P20", societe.ville);
  set(f1, "B23", societe.adresse);
  set(f1, "B26", societe.activite);

  // Bilan actif : brut, amortissements, net N ; net N-1
  for (const [ref, ligne] of Object.entries(LIGNES_ACTIF)) {
    const n = etats.n.actif[ref];
    const n1 = etats.n1.actif[ref];
    if (!n) continue;
    out.push({ feuille: "BILAN ACTIF", cellule: `E${ligne}`, valeur: n.brut });
    out.push({ feuille: "BILAN ACTIF", cellule: `F${ligne}`, valeur: n.amort });
    out.push({ feuille: "BILAN ACTIF", cellule: `G${ligne}`, valeur: n.net });
    out.push({ feuille: "BILAN ACTIF", cellule: `H${ligne}`, valeur: n1?.net ?? 0 });
  }
  // Bilan passif : net N ; net N-1
  for (const [ref, ligne] of Object.entries(LIGNES_PASSIF)) {
    out.push({ feuille: "BILAN PASSIF", cellule: `F${ligne}`, valeur: etats.n.passif[ref] ?? 0 });
    out.push({ feuille: "BILAN PASSIF", cellule: `G${ligne}`, valeur: etats.n1.passif[ref] ?? 0 });
  }
  // Compte de résultat : N ; N-1
  for (const [ref, ligne] of Object.entries(LIGNES_CR)) {
    out.push({ feuille: "COMPTE DE RESULTAT", cellule: `H${ligne}`, valeur: etats.n.cr[ref] ?? 0 });
    out.push({ feuille: "COMPTE DE RESULTAT", cellule: `I${ligne}`, valeur: etats.n1.cr[ref] ?? 0 });
  }
  // Tableau des flux de trésorerie : N ; N-1
  for (const [ref, ligne] of Object.entries(LIGNES_TFT)) {
    out.push({ feuille: "TFT", cellule: `K${ligne}`, valeur: etats.tft[ref] ?? 0 });
    out.push({ feuille: "TFT", cellule: `L${ligne}`, valeur: etats.tftN1[ref] ?? 0 });
  }
  return out;
};
