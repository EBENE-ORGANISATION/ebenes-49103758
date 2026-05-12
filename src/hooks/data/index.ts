/**
 * src/hooks/data/index.ts — Barrel export de tous les hooks de données relationnels.
 *
 * Usage :
 *   import { useEmployes, useArticles, ... } from "@/hooks/data";
 */
export { useEmployes, QK_EMPLOYES } from "./useEmployes";
export { useArticles, QK_ARTICLES } from "./useArticles";
export { useFournisseurs, QK_FOURNISSEURS } from "./useFournisseurs";
export { useCategoriesStock, QK_CATEGORIES_STOCK } from "./useCategoriesStock";
export { useImmobilisations, QK_IMMOBILISATIONS } from "./useImmobilisations";
export { useParamsAnnuels, QK_PARAMS_ANNUELS } from "./useParamsAnnuels";
export { useAbsences, QK_ABSENCES } from "./useAbsences";
export { useHeuresSup, QK_HEURES_SUP } from "./useHeuresSup";
export { usePrimes, QK_PRIMES } from "./usePrimes";
export { useSanctions, QK_SANCTIONS } from "./useSanctions";
export { useRetenues, QK_RETENUES } from "./useRetenues";
export { useTransactions, QK_TRANSACTIONS } from "./useTransactions";
export { useFactures, QK_FACTURES } from "./useFactures";
export { useDevis, QK_DEVIS } from "./useDevis";
export { useMouvementsStock, QK_MOUVEMENTS_STOCK } from "./useMouvementsStock";
