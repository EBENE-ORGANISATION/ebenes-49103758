// Solde de congés payés — module pur, testable. Règle retenue le 8 octobre 2026 :
// solde = reprise + 2,5 jours par mois complet de service − congés payés validés,
// cumulé d'une année sur l'autre (pas de remise à zéro), jours calendaires.
import type { Absence, Employe } from "@/types/ebene";
import { isoLocal } from "@/lib/ebene-utils";

/** Jours acquis par mois complet de service (Code du travail : 30 jours par an). */
export const JOURS_PAR_MOIS = 2.5;

export interface SoldeConges {
  /** Date à partir de laquelle l'application compte les droits (ISO). */
  depuis: string;
  /** Solde saisi sur la fiche, restant à cette date. */
  reprise: number;
  /** Mois complets de service depuis `depuis`. */
  moisComplets: number;
  acquis: number;
  /** Congés payés validés depuis `depuis`. */
  pris: number;
  /** Peut être négatif : congés pris par anticipation. */
  restants: number;
  /** Congés payés pris dans l'année de `dateRef`. */
  prisAnnee: number;
}

const dateLocale = (iso: string) => {
  const [a, m, j] = iso.slice(0, 10).split("-").map(Number);
  return new Date(a, (m || 1) - 1, j || 1);
};

/** Mois complets entre deux dates (le 15/03 → le 14/04 = 0, le 15/03 → le 15/04 = 1). */
export const moisComplets = (debut: Date, fin: Date): number => {
  if (fin < debut) return 0;
  let mois = (fin.getFullYear() - debut.getFullYear()) * 12 + (fin.getMonth() - debut.getMonth());
  if (fin.getDate() < debut.getDate()) mois -= 1;
  return Math.max(0, mois);
};

/**
 * Point de départ du décompte : le 1er janvier de l'année où la fiche a été
 * créée dans l'application (la reprise saisie est le solde à cette date), ou
 * la date d'embauche si elle est postérieure.
 */
export const debutDecompte = (e: Pick<Employe, "dateEmbauche" | "createdAt">): Date => {
  const embauche = e.dateEmbauche ? dateLocale(e.dateEmbauche) : null;
  const creation = e.createdAt ? new Date(new Date(e.createdAt).getFullYear(), 0, 1) : null;
  if (embauche && creation) return embauche > creation ? embauche : creation;
  return embauche ?? creation ?? new Date(new Date().getFullYear(), 0, 1);
};

export const soldeConges = (
  e: Pick<Employe, "id" | "dateEmbauche" | "createdAt" | "soldeConges">,
  absences: Pick<Absence, "employeId" | "type" | "statutValidation" | "dateDebut" | "jours">[],
  dateRef: Date = new Date(),
): SoldeConges => {
  const debut = debutDecompte(e);
  const depuis = isoLocal(debut);
  const conges = absences.filter(
    (a) =>
      a.employeId === e.id &&
      a.type === "conges_payes" &&
      (a.statutValidation === undefined || a.statutValidation === "valide") &&
      a.dateDebut >= depuis,
  );
  const pris = conges.reduce((s, a) => s + (a.jours || 0), 0);
  const annee = String(dateRef.getFullYear());
  const prisAnnee = conges
    .filter((a) => a.dateDebut.startsWith(annee))
    .reduce((s, a) => s + (a.jours || 0), 0);
  const mois = moisComplets(debut, dateRef);
  const reprise = e.soldeConges ?? 0;
  const acquis = mois * JOURS_PAR_MOIS;
  return { depuis, reprise, moisComplets: mois, acquis, pris, restants: reprise + acquis - pris, prisAnnee };
};

/** Nombre de jours à la française : « 22,5 », « 30 ». */
export const nombreJours = (n: number): string =>
  n.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
