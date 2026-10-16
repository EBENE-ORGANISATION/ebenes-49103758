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
