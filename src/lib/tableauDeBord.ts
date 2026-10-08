// Chiffres du tableau de bord (transactions + écritures SYSCOHADA) — module pur,
// partagé avec le récapitulatif annuel pour que les deux concordent.
import type { MoisData } from "@/types/ebene";
import { transactionComptabilisee, tvaDepuisTransactions } from "@/lib/ebene-utils";
import { fiscaliteDepuisEcritures } from "@/lib/etatsFinanciers";
import { ecritureTresorerieAutonome } from "@/lib/ecrituresTresorerie";

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

