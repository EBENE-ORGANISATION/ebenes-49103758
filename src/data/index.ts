/**
 * src/data/index.ts — Barrel export de tous les repos relationnels.
 *
 * Usage :
 *   import { employes, articles, ... } from "@/data";
 */
export { employes, toEmploye, fromEmploye } from "./employes.repo";
export { articles, toArticle, fromArticle } from "./articles.repo";
export { fournisseurs, toFournisseur, fromFournisseur } from "./fournisseurs.repo";
export { categoriesStock, toCategorieArticle } from "./categoriesStock.repo";
export { immobilisations, toImmobilisation } from "./immobilisations.repo";
export { paramsAnnuels, toParamsAnnuels } from "./paramsAnnuels.repo";
export { absences, toAbsence } from "./absences.repo";
export { heuresSup, toHeuresSup } from "./heuresSup.repo";
export { primes, toPrime } from "./primes.repo";
