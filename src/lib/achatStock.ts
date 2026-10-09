// Achat lié à une entrée en stock — module pur. Décision du 9 octobre 2026 :
// une entrée en stock achetée crée la dépense d'achat correspondante (et donc
// ses écritures : achat HT + TVA déductible / fournisseur, puis règlement).
import type { Article, MouvementStock, Transaction } from "@/types/ebene";
import type { CompteTresorerie } from "@/lib/ecrituresTresorerie";

/** Comptes d'achat proposés pour une entrée en stock. */
export const COMPTES_ACHAT_STOCK = ["601", "602", "604"] as const;
export type CompteAchatStock = (typeof COMPTES_ACHAT_STOCK)[number];

export interface AchatStock {
  compte: CompteAchatStock;
  tresorerie: CompteTresorerie;
  /** Facture fournisseur avec TVA : le prix unitaire saisi est hors taxes. */
  avecTva: boolean;
  fournisseur?: string;
}

/**
 * Dépense d'achat d'une entrée en stock : montant TTC (quantité × prix
 * unitaire HT, plus la TVA si la facture en porte), rattachée à l'activité
 * de l'article. Toujours au nom d'un fournisseur pour que l'écriture d'achat
 * isole la TVA déductible.
 */
export const transactionAchatStock = (
  mvt: Pick<MouvementStock, "date" | "quantite" | "prixUnitaire" | "reference">,
  article: Pick<Article, "designation" | "unite" | "activiteId">,
  achat: AchatStock,
  tauxTva: number,
): Omit<Transaction, "id"> => {
  const ht = Math.round(mvt.quantite * (mvt.prixUnitaire ?? 0));
  const ttc = achat.avecTva ? Math.round(ht * (1 + tauxTva)) : ht;
  const fournisseur = achat.fournisseur?.trim() || "Fournisseur divers";
  return {
    date: mvt.date,
    desc: `Achat stock — ${article.designation} (${mvt.quantite} ${article.unite})${mvt.reference ? ` — ${mvt.reference}` : ""}`,
    type: "d",
    m: -ttc,
    source: "fournisseur",
    fournisseur,
    avecTva: achat.avecTva,
    compte: achat.compte,
    tresorerie: achat.tresorerie,
    activiteId: article.activiteId ?? null,
  };
};
