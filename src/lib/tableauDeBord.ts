// Chiffres du tableau de bord (transactions + écritures SYSCOHADA) — module pur,
// partagé avec le récapitulatif annuel pour que les deux concordent.
import type { DonneesMensuelles, EcritureComptable, Employe, Facture, MoisData } from "@/types/ebene";
import { transactionComptabilisee, tvaDepuisTransactions } from "@/lib/ebene-utils";
import { fiscaliteDepuisEcritures, sommePrefixes } from "@/lib/etatsFinanciers";
import { ecritureTresorerieAutonome } from "@/lib/ecrituresTresorerie";
import { estANouveaux } from "@/lib/liasse/etatsLiasse";

/** Comptes de trésorerie SYSCOHADA (classe 5, hors 59 dépréciations). */
export const PREFIXES_TRESORERIE = ["50", "51", "52", "53", "54", "55", "56", "57", "58"];

const comptable = (e: EcritureComptable) => e.statut !== "brouillon";
const lignesDe = (e: EcritureComptable) => (Array.isArray(e.lignes) ? e.lignes : []);
const estTresorerie = (compte: string) => PREFIXES_TRESORERIE.some((p) => compte.startsWith(p));
const cle = (annee: number, mois: number) => annee * 100 + mois;
const anneeMois = (k: string) => k.split("-").map(Number) as [number, number];

/**
 * Soldes des comptes (débit − crédit) à la fin du mois, comme le grand livre :
 * depuis les à-nouveaux du dernier exercice clos (ils reprennent déjà les soldes
 * des années précédentes), sinon depuis la première écriture. Additionner tous
 * les mois depuis l'origine compterait deux fois chaque exercice clos.
 */
export const soldesFinMois = (donnees: DonneesMensuelles, annee: number, mois: number): Map<string, number> => {
  let depart: number | null = null;
  for (const [k, m] of Object.entries(donnees)) {
    const [a] = anneeMois(k);
    if (a > annee || (depart !== null && a <= depart)) continue;
    if ((m?.ecritures || []).some((e) => comptable(e) && estANouveaux(e, a))) depart = a;
  }
  const soldes = new Map<string, number>();
  for (const [k, m] of Object.entries(donnees)) {
    const [a, mo] = anneeMois(k);
    if (cle(a, mo) > cle(annee, mois) || (depart !== null && a < depart)) continue;
    for (const e of (m?.ecritures || []).filter(comptable)) {
      for (const l of lignesDe(e)) soldes.set(l.compte, (soldes.get(l.compte) || 0) + l.debit - l.credit);
    }
  }
  return soldes;
};

/** Trésorerie (banques, caisses, chèques) à la fin du mois. */
export const tresorerieFinMois = (donnees: DonneesMensuelles, annee: number, mois: number): number => {
  const avecEcritures = Object.values(donnees).some((m) => (m?.ecritures || []).some(comptable));
  if (avecEcritures) return sommePrefixes(soldesFinMois(donnees, annee, mois), PREFIXES_TRESORERIE);
  // Sans comptabilité : solde des opérations jusqu'au mois inclus
  return Object.entries(donnees).reduce((total, [k, m]) => {
    const [a, mo] = anneeMois(k);
    return m && cle(a, mo) <= cle(annee, mois) ? total + sumRecettes(m) - sumDepenses(m) : total;
  }, 0);
};

/**
 * Entrées et sorties de trésorerie du mois. Avec la comptabilité : mouvement net
 * des comptes de classe 5 de chaque écriture (un virement banque → caisse ne
 * compte ni en entrée ni en sortie ; les à-nouveaux ne sont pas des flux).
 */
export const fluxTresorerieMois = (m: MoisData | undefined): { entrees: number; sorties: number } => {
  if (!m) return { entrees: 0, sorties: 0 };
  const ecritures = (m.ecritures || []).filter(comptable);
  if (!ecritures.length) return { entrees: sumRecettes(m), sorties: sumDepenses(m) };
  let entrees = 0;
  let sorties = 0;
  for (const e of ecritures) {
    if (e.journal === "AN") continue;
    const net = lignesDe(e).filter((l) => estTresorerie(l.compte)).reduce((s, l) => s + l.debit - l.credit, 0);
    if (net > 0) entrees += net;
    else sorties -= net;
  }
  return { entrees, sorties };
};

/** Factures émises jusqu'à la fin du mois et toujours en attente de paiement. */
export const facturesEnAttenteFinMois = (donnees: DonneesMensuelles, annee: number, mois: number): Facture[] =>
  Object.entries(donnees).flatMap(([k, m]) => {
    const [a, mo] = anneeMois(k);
    return m && cle(a, mo) <= cle(annee, mois) ? m.factures.filter((f) => f.statut === "en_attente") : [];
  });

/** Employé déjà embauché à la fin du mois (sans date d'embauche : compté). */
export const embaucheAvantFinMois = (e: Pick<Employe, "dateEmbauche">, annee: number, mois: number): boolean =>
  !e.dateEmbauche || new Date(e.dateEmbauche) <= new Date(annee, mois, 0, 23, 59, 59);

/** Encaissements du mois : recettes comptabilisées + écritures saisies sur Banque/Caisse. */
export const sumRecettes = (m: MoisData): number => {
  const recTrans = m.transactions
    .filter((t) => t.type === "r" && transactionComptabilisee(t))
    .reduce((s, t) => s + Math.abs(t.m), 0);
  const recEcritures = (m.ecritures || [])
    .filter((e) => e.statut === "valide" && ecritureTresorerieAutonome(e))
    .reduce((total, e) => {
      const lignes = Array.isArray(e.lignes) ? e.lignes : [];
      const debit = lignes
        .filter((l) => l.compte.startsWith("52") || l.compte.startsWith("57"))
        .reduce((s, l) => s + l.debit, 0);
      return total + debit;
    }, 0);
  return recTrans + recEcritures;
};

/**
 * Chiffre d'affaires hors taxes du mois, comme l'onglet Fiscalité : comptes 70
 * des écritures validées, à défaut les recettes (factures en HT). Les apports,
 * emprunts et autres encaissements ne sont pas du chiffre d'affaires.
 */
export const caHTMois = (m: MoisData, tauxTva: number): number =>
  (m.ecritures || []).some((e) => e.statut !== "brouillon")
    ? fiscaliteDepuisEcritures(m.ecritures || []).caHT
    : tvaDepuisTransactions(m.transactions, m.factures, tauxTva, m.ecritures || []).caHT;

/** Décaissements du mois : dépenses comptabilisées + écritures saisies sur Banque/Caisse. */
export const sumDepenses = (m: MoisData): number => {
  const depTrans = m.transactions
    .filter((t) => t.type === "d" && transactionComptabilisee(t))
    .reduce((s, t) => s + Math.abs(t.m), 0);
  const depEcritures = (m.ecritures || [])
    .filter((e) => e.statut === "valide" && ecritureTresorerieAutonome(e))
    .reduce((total, e) => {
      const lignes = Array.isArray(e.lignes) ? e.lignes : [];
      const credit = lignes
        .filter((l) => l.compte.startsWith("52") || l.compte.startsWith("57"))
        .reduce((s, l) => s + l.credit, 0);
      return total + credit;
    }, 0);
  return depTrans + depEcritures;
};

