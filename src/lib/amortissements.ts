import {
  Immobilisation,
  COEFF_DEGRESSIF,
} from "@/types/ebene";

export interface LigneAmortissement {
  /** Année de l'exercice. */
  annee: number;
  /** Dotation de l'année (montant amortissable imputé). */
  dotation: number;
  /** Cumul des amortissements à fin d'exercice. */
  cumul: number;
  /** Valeur nette comptable (VNC) à fin d'exercice = base - cumul. */
  vnc: number;
}

export interface PlanAmortissement {
  immobilisation: Immobilisation;
  baseAmortissable: number;
  lignes: LigneAmortissement[];
}

/**
 * Construit le plan d'amortissement complet d'une immobilisation, en suivant
 * les règles SYSCOHADA Révisé :
 *
 *  - Linéaire : annuité = (valeur d'origine − résiduelle) / durée.
 *               Première et dernière annuité prorata temporis sur l'année.
 *  - Dégressif : taux dégressif = taux linéaire × coefficient légal.
 *                Bascule en linéaire dès que l'annuité linéaire restante
 *                devient supérieure ou égale à l'annuité dégressive.
 *
 * Les terrains et tout actif dont la durée est ≤ 0 ne génèrent aucune dotation.
 */
export const planAmortissement = (immo: Immobilisation): PlanAmortissement => {
  const base = Math.max(0, immo.valeurOrigine - (immo.valeurResiduelle || 0));
  const duree = Math.max(0, Math.floor(immo.dureeAmortissement || 0));
  const lignes: LigneAmortissement[] = [];

  if (base <= 0 || duree <= 0) {
    return { immobilisation: immo, baseAmortissable: base, lignes };
  }

  const dateAcq = new Date(immo.dateAcquisition);
  const anneeAcq = dateAcq.getFullYear();
  // Prorata SYSCOHADA : nombre de jours entre acquisition et 31/12.
  const finAnneeAcq = new Date(anneeAcq, 11, 31);
  const joursAnneeAcq = Math.max(
    0,
    Math.floor((finAnneeAcq.getTime() - dateAcq.getTime()) / 86400000) + 1
  );
  const prorataDebut = Math.min(1, joursAnneeAcq / 360); // base 360 SYSCOHADA

  if (immo.methode === "lineaire") {
    const annuite = base / duree;
    let cumul = 0;
    let restant = base;
    // Année d'acquisition : prorata
    for (let i = 0; i <= duree; i++) {
      let dot: number;
      if (i === 0) {
        dot = annuite * prorataDebut;
      } else if (i === duree) {
        // dernière fraction = solde
        dot = restant;
      } else {
        dot = annuite;
      }
      dot = Math.min(dot, restant);
      if (dot <= 0 && i > 0) break;
      cumul += dot;
      restant -= dot;
      lignes.push({
        annee: anneeAcq + i,
        dotation: dot,
        cumul,
        vnc: Math.max(0, immo.valeurOrigine - cumul),
      });
      if (restant <= 0.5) break;
    }
    return { immobilisation: immo, baseAmortissable: base, lignes };
  }

  // ─── Dégressif ────────────────────────────────────────────────────────
  const tauxLin = 1 / duree;
  const coeff = COEFF_DEGRESSIF(duree);
  const tauxDeg = tauxLin * coeff;
  let vncDeb = base;
  let cumul = 0;
  let basculeLin = false;

  for (let i = 0; i <= duree; i++) {
    if (vncDeb <= 0.5) break;
    const anneesRestantes = duree - i;
    let dot: number;
    if (basculeLin || anneesRestantes <= 0) {
      dot = vncDeb;
    } else {
      const dotDeg = vncDeb * tauxDeg * (i === 0 ? prorataDebut : 1);
      const dotLinRest = vncDeb / anneesRestantes;
      if (!basculeLin && i > 0 && dotLinRest >= vncDeb * tauxDeg) {
        basculeLin = true;
        dot = dotLinRest;
      } else {
        dot = dotDeg;
      }
    }
    dot = Math.min(dot, vncDeb);
    cumul += dot;
    vncDeb -= dot;
    lignes.push({
      annee: anneeAcq + i,
      dotation: dot,
      cumul,
      vnc: Math.max(0, immo.valeurOrigine - cumul),
    });
  }

  return { immobilisation: immo, baseAmortissable: base, lignes };
};

/**
 * Renvoie la dotation d'une immobilisation pour une année donnée.
 * 0 si l'année n'apparaît pas dans le plan (avant acquisition / après fin).
 */
export const dotationAnnee = (immo: Immobilisation, annee: number): number => {
  const plan = planAmortissement(immo);
  const l = plan.lignes.find((x) => x.annee === annee);
  return l ? l.dotation : 0;
};

/**
 * Cumul des amortissements à fin d'exercice (utilisé pour la VNC au bilan).
 */
export const cumulAFin = (immo: Immobilisation, annee: number): number => {
  const plan = planAmortissement(immo);
  const lignes = plan.lignes.filter((x) => x.annee <= annee);
  return lignes.reduce((a, l) => a + l.dotation, 0);
};

/**
 * Valeur nette comptable à fin d'exercice.
 */
export const vncAFin = (immo: Immobilisation, annee: number): number => {
  return Math.max(0, immo.valeurOrigine - cumulAFin(immo, annee));
};

/**
 * Tableau récapitulatif : pour chaque immobilisation, dotation de l'année,
 * cumul à fin d'exercice et VNC. Utilisé par l'UI et l'export SYSCOHADA.
 */
export interface AmortissementAnnuelLigne {
  immobilisation: Immobilisation;
  dotation: number;
  cumul: number;
  vnc: number;
}

export const amortissementsAnnee = (
  immos: Immobilisation[],
  annee: number
): AmortissementAnnuelLigne[] => {
  return immos.map((immo) => ({
    immobilisation: immo,
    dotation: dotationAnnee(immo, annee),
    cumul: cumulAFin(immo, annee),
    vnc: vncAFin(immo, annee),
  }));
};
