import type { Immobilisation } from "@/types/ebene";
import { cumulAFin, vncAFin } from "@/lib/amortissements";

/**
 * Calcul de la valeur nette comptable (VNC) à une date donnée pour une
 * cession SYSCOHADA. Convention pratique :
 *  - On prend la VNC à la fin de l'exercice précédent l'année de cession,
 *    puis on retranche la dotation prorata temporis de l'année courante
 *    jusqu'à la date de cession (base 360, mois plein si cession en
 *    cours de mois — cohérent avec la doctrine SYSCOHADA Révisé).
 */
export const vncADate = (
  immo: Immobilisation,
  dateCessionISO: string,
): number => {
  const d = new Date(dateCessionISO);
  if (isNaN(d.getTime())) return immo.valeurOrigine;
  const annee = d.getFullYear();
  // VNC à la fin de l'exercice N-1
  const vncDebutAnnee = vncAFin(immo, annee - 1) || immo.valeurOrigine;
  const dotAnnee = cumulAFin(immo, annee) - cumulAFin(immo, annee - 1);
  // Prorata temporis (base 360) de la dotation N
  const debutAnnee = new Date(annee, 0, 1);
  const finAnnee = new Date(annee, 11, 31);
  const totalJours =
    Math.floor((finAnnee.getTime() - debutAnnee.getTime()) / 86400000) + 1;
  const joursEcoules =
    Math.floor((d.getTime() - debutAnnee.getTime()) / 86400000) + 1;
  const prorata = totalJours > 0 ? Math.min(1, Math.max(0, joursEcoules / totalJours)) : 0;
  const dotProrata = dotAnnee * prorata;
  return Math.max(0, vncDebutAnnee - dotProrata);
};

/**
 * Cumul des amortissements à la date de cession (origine - VNC).
 */
export const cumulADate = (
  immo: Immobilisation,
  dateCessionISO: string,
): number => {
  return Math.max(0, immo.valeurOrigine - vncADate(immo, dateCessionISO));
};

/**
 * Calcule la plus-value (> 0) ou moins-value (< 0) de cession.
 *  plus_ou_moins = valeurCession - VNC(date)
 */
export const calculerPlusMoinsValue = (
  immo: Immobilisation,
  dateCession: string,
  valeurCession: number,
): number => {
  const vnc = vncADate(immo, dateCession);
  return Number(valeurCession || 0) - vnc;
};

/** Catégorise un résultat de cession : profit / perte / nul. */
export const typeResultatCession = (
  resultat: number,
): "plus_value" | "moins_value" | "nul" => {
  if (Math.abs(resultat) < 0.5) return "nul";
  return resultat > 0 ? "plus_value" : "moins_value";
};

/**
 * Plan d'écritures SYSCOHADA pour une cession d'immobilisation.
 *
 * Schéma utilisé (conforme à la doctrine SYSCOHADA Révisé / référentiel demandé) :
 *
 *  ① Sortie de l'immobilisation et de ses amortissements (constatation VNC) :
 *     Débit  28xx — Amortissements cumulés      = cumul amortissements à la cession
 *     Débit  812  — Valeur comptable des cessions (VNC)
 *           ─────► Crédit 2xx — Immobilisation     = valeur d'origine
 *
 *  ② Constatation du prix de cession :
 *     Débit  485  — Créances sur cessions d'immobilisations  = valeur de cession
 *           ─────► Crédit 822 — Produits des cessions          = valeur de cession
 *
 *  ③ Résultat (présentation simplifiée demandée par le projet) :
 *     - Plus-value  ► Crédit 827 — Produits HAO sur cession (plus-value)
 *     - Moins-value ► Débit  837 — Charges HAO sur cession (moins-value)
 *     (équilibré par la contrepartie 822/812 selon le cas).
 */
export interface EcritureCession {
  compte: string;
  libelle: string;
  debit: number;
  credit: number;
}

export const ecrituresCession = (
  immo: Immobilisation,
): EcritureCession[] => {
  if (immo.statut !== "cede" || !immo.dateCession) return [];
  const valeurCession = Number(immo.valeurCession || 0);
  const cumul = cumulADate(immo, immo.dateCession);
  const vnc = Math.max(0, immo.valeurOrigine - cumul);
  const pmv =
    typeof immo.plusMoinsValue === "number"
      ? immo.plusMoinsValue
      : valeurCession - vnc;

  const cptActif = immo.comptesSYSCOHADA?.actif || "2";
  const cptAmort = immo.comptesSYSCOHADA?.amortissementCumule || "28";

  const lib = `Cession ${immo.libelle}`;
  const ecr: EcritureCession[] = [];

  // ① Sortie : amort. cumulés + VNC (812) ► immo (2xx)
  if (cumul > 0 && cptAmort) {
    ecr.push({ compte: cptAmort, libelle: lib + " — solde amort. cumulés", debit: cumul, credit: 0 });
  }
  if (vnc > 0) {
    ecr.push({ compte: "812", libelle: lib + " — VNC sortie", debit: vnc, credit: 0 });
  }
  ecr.push({ compte: cptActif, libelle: lib + " — sortie d'actif", debit: 0, credit: immo.valeurOrigine });

  // ② Prix de cession : 485 ► 822
  if (valeurCession > 0) {
    ecr.push({ compte: "485", libelle: lib + " — créance sur cession", debit: valeurCession, credit: 0 });
    ecr.push({ compte: "822", libelle: lib + " — produit de cession", debit: 0, credit: valeurCession });
  }

  // ③ Résultat plus/moins-value (827 / 837)
  if (pmv > 0.5) {
    ecr.push({ compte: "827", libelle: lib + " — plus-value sur cession", debit: 0, credit: pmv });
    // Équilibrage technique : on solde par 812 (la VNC reprise est inférieure au prix)
    ecr.push({ compte: "812", libelle: lib + " — équilibrage plus-value", debit: pmv, credit: 0 });
  } else if (pmv < -0.5) {
    const perte = -pmv;
    ecr.push({ compte: "837", libelle: lib + " — moins-value sur cession", debit: perte, credit: 0 });
    ecr.push({ compte: "822", libelle: lib + " — équilibrage moins-value", debit: 0, credit: perte });
  }

  return ecr;
};