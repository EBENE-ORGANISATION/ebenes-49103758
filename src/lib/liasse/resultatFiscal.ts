// Résultat fiscal (P58 à P60), engagements hors bilan (note 1) et actifs /
// passifs éventuels (note 16C) — module pur. Les montants qui ne se déduisent
// pas de la comptabilité sont saisis par exercice (informations fiscales).
import type { Saisie } from "./xlsxPatch";

/** Réintégrations de la P58 (code de ligne → libellé). */
export const REINTEGRATIONS = {
  "10": "Amortissements excédentaires et non déductibles",
  "12": "Amortissements réputés différés de l'exercice",
  "15": "Impôt sur le résultat (IS ou minimum forfaitaire)",
  "20": "Provisions et charges à payer non déductibles",
  "25": "Amendes et pénalités",
  "30": "Rémunération de l'exploitant ou des associés",
  "40": "Charges et dépenses somptuaires",
  "45": "Jetons de présence non déductibles",
  "50": "Quote-part de charges des titres de placement exonérés",
  "60": "Intérêts excédentaires des comptes courants d'associés",
} as const;
export type CodeReintegration = keyof typeof REINTEGRATIONS;

/** Déductions de la P58. */
export const DEDUCTIONS = {
  "90": "Provisions et charges antérieurement taxées, réintégrées",
  "95": "Quote-part des revenus des titres de placement exonérés",
  "100": "Plus-values exonérées",
  "120": "Réduction d'impôt pour investissement",
} as const;
export type CodeDeduction = keyof typeof DEDUCTIONS;

/** Engagements financiers de la note 1 (ligne du modèle → libellé). */
export const ENGAGEMENTS = {
  "36": "Engagements consentis à des entités liées",
  "37": "Primes de remboursement non échues",
  "38": "Avals, cautions, garanties",
  "39": "Hypothèques, nantissements, gages, autres",
  "40": "Effets escomptés non échus",
  "41": "Créances commerciales et professionnelles cédées",
  "42": "Abandons de créances conditionnels",
} as const;
export type LigneEngagement = keyof typeof ENGAGEMENTS;

export interface LigneLibre { libelle: string; montant: number; montantN1?: number }

export interface InformationsFiscales {
  reintegrations?: Partial<Record<CodeReintegration, number>>;
  autresReintegrations?: LigneLibre[];
  deductions?: Partial<Record<CodeDeduction, number>>;
  autresDeductions?: LigneLibre[];
  /** Déficits antérieurs imputés (ligne 150). */
  deficitsAnterieurs?: number;
  /** Amortissements réputés différés antérieurs imputés (ligne 155). */
  amortDifferesAnterieurs?: number;
  /** Quote-part du bénéfice exonéré (ligne 165). */
  quotePartExoneree?: number;
  engagements?: Partial<Record<LigneEngagement, { donnes?: number; recus?: number }>>;
  actifsEventuels?: LigneLibre[];
  passifsEventuels?: LigneLibre[];
}

const somme = (v: Record<string, number | undefined> = {}) => Object.values(v).reduce<number>((t, x) => t + (x || 0), 0);
const sommeLignes = (l: LigneLibre[] = []) => l.reduce((t, x) => t + (x.montant || 0), 0);

export interface ResultatFiscal {
  totalReintegrations: number;
  totalDeductions: number;
  /** Total I : bénéfice comptable + réintégrations. */
  totalI: number;
  /** Total II : perte comptable + déductions. */
  totalII: number;
  /** Résultat avant imputation des déficits (I − II). */
  avantImputation: number;
  /** Résultat fiscal de droit commun (positif : bénéfice, négatif : déficit). */
  droitCommun: number;
  definitif: number;
}

/**
 * Passage du résultat comptable au résultat fiscal. `impotComptable` : impôt
 * sur le résultat comptabilisé (comptes 89), réintégré par défaut (ligne 15).
 */
export const calculResultatFiscal = (resultatNet: number, f: InformationsFiscales, impotComptable = 0): ResultatFiscal => {
  const reint = { ...f.reintegrations, "15": f.reintegrations?.["15"] ?? impotComptable };
  const totalReintegrations = Math.round(somme(reint) + sommeLignes(f.autresReintegrations));
  const totalDeductions = Math.round(somme(f.deductions) + sommeLignes(f.autresDeductions));
  const totalI = Math.max(0, Math.round(resultatNet)) + totalReintegrations;
  const totalII = Math.max(0, -Math.round(resultatNet)) + totalDeductions;
  const avantImputation = totalI - totalII;
  const imputations = Math.round((f.deficitsAnterieurs ?? 0) + (f.amortDifferesAnterieurs ?? 0));
  // Les déficits antérieurs ne s'imputent que sur un bénéfice
  const droitCommun = avantImputation > 0 ? avantImputation - Math.min(imputations, avantImputation) : avantImputation;
  const definitif = droitCommun > 0 ? droitCommun - Math.min(Math.round(f.quotePartExoneree ?? 0), droitCommun) : droitCommun;
  return { totalReintegrations, totalDeductions, totalI, totalII, avantImputation, droitCommun, definitif };
};

/** Lignes de la P58 où sont portés les codes. */
const LIGNE_REINT: Record<CodeReintegration, number> = { "10": 8, "12": 9, "15": 10, "20": 11, "25": 12, "30": 13, "40": 14, "45": 15, "50": 16, "60": 17 };
const LIGNE_DEDUC: Record<CodeDeduction, number> = { "90": 34, "95": 35, "100": 36, "120": 37 };

/** P58 (résultat fiscal), P59 et P60 (détail des autres réintégrations et déductions). */
export const saisiesResultatFiscal = (resultatNet: number, f: InformationsFiscales, impotComptable = 0): Saisie[] => {
  const P58 = "P58 Résultat fiscal";
  const r = calculResultatFiscal(resultatNet, f, impotComptable);
  const net = Math.round(resultatNet);
  const out: Saisie[] = [
    { feuille: P58, cellule: "H7", valeur: net > 0 ? net : 0 },
    { feuille: P58, cellule: "H33", valeur: net < 0 ? -net : 0 },
  ];
  const reint = { ...f.reintegrations, "15": f.reintegrations?.["15"] ?? impotComptable };
  for (const [code, ligne] of Object.entries(LIGNE_REINT) as [CodeReintegration, number][]) {
    out.push({ feuille: P58, cellule: `H${ligne}`, valeur: Math.round(reint[code] ?? 0) });
  }
  out.push({ feuille: P58, cellule: "H18", valeur: Math.round(sommeLignes(f.autresReintegrations)) });
  out.push({ feuille: P58, cellule: "H31", valeur: r.totalI });
  for (const [code, ligne] of Object.entries(LIGNE_DEDUC) as [CodeDeduction, number][]) {
    out.push({ feuille: P58, cellule: `H${ligne}`, valeur: Math.round(f.deductions?.[code] ?? 0) });
  }
  out.push({ feuille: P58, cellule: "H38", valeur: Math.round(sommeLignes(f.autresDeductions)) });
  out.push({ feuille: P58, cellule: "H47", valeur: r.totalII });
  out.push(
    { feuille: P58, cellule: "H49", valeur: Math.max(0, r.avantImputation) },
    { feuille: P58, cellule: "H50", valeur: Math.max(0, -r.avantImputation) },
    { feuille: P58, cellule: "H51", valeur: r.avantImputation > 0 ? Math.min(Math.round(f.deficitsAnterieurs ?? 0), r.avantImputation) : 0 },
    { feuille: P58, cellule: "H52", valeur: r.avantImputation > 0 ? Math.round(f.amortDifferesAnterieurs ?? 0) : 0 },
    { feuille: P58, cellule: "H53", valeur: Math.max(0, r.droitCommun) },
    { feuille: P58, cellule: "H54", valeur: Math.max(0, -r.droitCommun) },
    { feuille: P58, cellule: "H55", valeur: r.droitCommun > 0 ? r.droitCommun - r.definitif : 0 },
    { feuille: P58, cellule: "H56", valeur: Math.max(0, r.definitif) },
    { feuille: P58, cellule: "H57", valeur: Math.max(0, -r.definitif) },
  );
  const detail = (feuille: string, lignes: LigneLibre[] = []) =>
    lignes.filter((l) => l.libelle || l.montant).forEach((l, i) => {
      out.push(
        { feuille, cellule: `A${11 + i}`, valeur: i + 1 },
        { feuille, cellule: `B${11 + i}`, valeur: l.libelle },
        { feuille, cellule: `H${11 + i}`, valeur: Math.round(l.montant || 0) },
      );
    });
  detail("P59 Détail Autres réintég.", f.autresReintegrations);
  detail("P60 Détail Autres déductions", f.autresDeductions);
  return out;
};

/**
 * Engagements hors bilan (note 1) et actifs / passifs éventuels (note 16C).
 * `suretesEmprunts` : sûretés réelles consenties sur les emprunts, proposées
 * en engagement donné (ligne 39) si rien n'a été saisi.
 */
export const saisiesHorsBilan = (f: InformationsFiscales, suretesEmprunts = 0): Saisie[] => {
  const out: Saisie[] = [];
  let donnes = 0;
  let recus = 0;
  for (const ligne of Object.keys(ENGAGEMENTS) as LigneEngagement[]) {
    const e = f.engagements?.[ligne];
    const d = Math.round(e?.donnes ?? (ligne === "39" ? suretesEmprunts : 0));
    const r = Math.round(e?.recus ?? 0);
    donnes += d;
    recus += r;
    if (d) out.push({ feuille: "NOTE 1", cellule: `I${ligne}`, valeur: d });
    if (r) out.push({ feuille: "NOTE 1", cellule: `J${ligne}`, valeur: r });
  }
  if (donnes || recus) out.push({ feuille: "NOTE 1", cellule: "I43", valeur: donnes }, { feuille: "NOTE 1", cellule: "J43", valeur: recus });
  const eventuels = (debut: number, max: number, lignes: LigneLibre[] = []) =>
    lignes.filter((l) => l.libelle || l.montant).slice(0, max).forEach((l, i) => {
      out.push(
        { feuille: "Note 16 C", cellule: `A${debut + i}`, valeur: l.libelle },
        { feuille: "Note 16 C", cellule: `H${debut + i}`, valeur: Math.round(l.montant || 0) },
      );
      if (l.montantN1) out.push({ feuille: "Note 16 C", cellule: `I${debut + i}`, valeur: Math.round(l.montantN1) });
    });
  eventuels(11, 15, f.actifsEventuels);
  eventuels(30, 14, f.passifsEventuels);
  return out;
};
