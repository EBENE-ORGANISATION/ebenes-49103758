// Soldes cumulés des comptes, comme le grand livre : depuis les à-nouveaux du
// dernier exercice clos, sinon depuis la première écriture. Les à-nouveaux
// reprennent déjà les soldes des années précédentes : additionner tous les mois
// depuis l'origine compterait deux fois chaque exercice clos.
import type { DonneesMensuelles, EcritureComptable } from "@/types/ebene";
import { estANouveaux } from "@/lib/liasse/etatsLiasse";

const comptable = (e: EcritureComptable) => e.statut !== "brouillon";
const cle = (annee: number, mois: number) => annee * 100 + mois;
const anneeMois = (k: string) => k.split("-").map(Number) as [number, number];

/** Société tenue en comptabilité (au moins une écriture validée). */
export const avecComptabilite = (donnees: DonneesMensuelles): boolean =>
  Object.values(donnees || {}).some((m) => (m?.ecritures || []).some(comptable));

/** Dernier mois présent dans les données (pour un cumul « à ce jour »). */
export const dernierMois = (donnees: DonneesMensuelles): [number, number] => {
  let max = 0;
  for (const k of Object.keys(donnees || {})) {
    const [a, m] = anneeMois(k);
    max = Math.max(max, cle(a, m));
  }
  return max ? [Math.floor(max / 100), max % 100] : [new Date().getFullYear(), new Date().getMonth() + 1];
};

/** Écritures comptabilisées depuis les derniers à-nouveaux jusqu'à la fin du mois. */
export const ecrituresCumulees = (donnees: DonneesMensuelles, annee: number, mois: number): EcritureComptable[] => {
  let depart: number | null = null;
  for (const [k, m] of Object.entries(donnees || {})) {
    const [a] = anneeMois(k);
    if (a > annee || (depart !== null && a <= depart)) continue;
    if ((m?.ecritures || []).some((e) => comptable(e) && estANouveaux(e, a))) depart = a;
  }
  const out: EcritureComptable[] = [];
  for (const [k, m] of Object.entries(donnees || {})) {
    const [a, mo] = anneeMois(k);
    if (cle(a, mo) > cle(annee, mois) || (depart !== null && a < depart)) continue;
    for (const e of m?.ecritures || []) if (comptable(e)) out.push(e);
  }
  return out;
};

/** Soldes des comptes (débit − crédit) à la fin du mois. */
export const soldesFinMois = (donnees: DonneesMensuelles, annee: number, mois: number): Map<string, number> => {
  const soldes = new Map<string, number>();
  for (const e of ecrituresCumulees(donnees, annee, mois)) {
    for (const l of Array.isArray(e.lignes) ? e.lignes : []) {
      soldes.set(l.compte, (soldes.get(l.compte) || 0) + l.debit - l.credit);
    }
  }
  return soldes;
};

/**
 * À-nouveaux provisoires d'un exercice dont le précédent n'est pas encore
 * clôturé (pas d'écriture AN-<année>) : soldes des comptes de bilan (classes
 * 1 à 5) à la fin de l'exercice précédent, et résultat non encore affecté
 * reporté au compte 12. Vide si l'exercice a ses à-nouveaux ou s'il n'y a rien avant.
 * Ajoutés à la balance, au grand livre et au bilan, ils évitent un exercice
 * qui démarrerait à zéro en attendant la clôture.
 */
export const COMPTE_REPORT_PROVISOIRE = "12";

export const ouvertureProvisoire = (donnees: DonneesMensuelles, annee: number): Map<string, number> => {
  const ouverture = new Map<string, number>();
  const aSesANouveaux = Object.entries(donnees || {}).some(([k, m]) =>
    anneeMois(k)[0] === annee && (m?.ecritures || []).some((e) => comptable(e) && estANouveaux(e, annee)));
  const avant = Object.entries(donnees || {}).some(([k, m]) =>
    anneeMois(k)[0] < annee && (m?.ecritures || []).some(comptable));
  if (aSesANouveaux || !avant) return ouverture;
  let resultat = 0;
  soldesFinMois(donnees, annee - 1, 12).forEach((solde, compte) => {
    if (!solde) return;
    if (/^[1-5]/.test(compte)) ouverture.set(compte, (ouverture.get(compte) || 0) + solde);
    else resultat += solde;
  });
  if (resultat) ouverture.set(COMPTE_REPORT_PROVISOIRE, (ouverture.get(COMPTE_REPORT_PROVISOIRE) || 0) + resultat);
  return ouverture;
};
