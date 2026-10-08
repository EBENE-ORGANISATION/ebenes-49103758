// Règles de mouvement de stock — module pur (sans React ni Supabase), testable.
import type { MouvementStock } from "@/types/ebene";

export interface EtatStock {
  stock: number;
  /** Prix moyen pondéré (PMP) courant. */
  prixAchat: number;
}

type Mvt = Pick<MouvementStock, "type" | "quantite" | "prixUnitaire" | "motif">;

/** Erreur métier affichable telle quelle à l'utilisateur. */
export class ErreurStock extends Error {}

const fmt = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 3 });

/** Libellé d'écart inscrit dans le motif d'un ajustement : « (écart : +3) ». */
export const libelleEcart = (ecart: number): string =>
  `(écart : ${ecart > 0 ? "+" : ""}${fmt(ecart)})`;

/** Relit l'écart inscrit dans le motif d'un ajustement ; null s'il est absent. */
export const ecartAjustement = (motif?: string): number | null => {
  const m = motif?.match(/écart\s*:\s*([+-]?\d[\d\s\u202f]*(?:[.,]\d+)?)/);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/[\s\u202f]/g, "").replace(",", "."));
  return isNaN(n) ? null : n;
};

/** Nouvel état après un mouvement. Une sortie au-delà du stock est refusée. */
export const appliquerMouvement = (actuel: EtatStock, mvt: Mvt): EtatStock => {
  const q = mvt.quantite;
  if (mvt.type === "entree") {
    const pu = mvt.prixUnitaire ?? actuel.prixAchat;
    const stock = actuel.stock + q;
    const prixAchat = stock > 0 ? (actuel.stock * actuel.prixAchat + q * pu) / stock : actuel.prixAchat;
    return { stock, prixAchat };
  }
  if (mvt.type === "sortie") {
    if (q > actuel.stock) {
      throw new ErreurStock(`Stock insuffisant : ${fmt(actuel.stock)} disponible(s), sortie de ${fmt(q)} demandée.`);
    }
    return { stock: actuel.stock - q, prixAchat: actuel.prixAchat };
  }
  // ajustement (inventaire) : la quantité saisie devient le stock
  return { stock: q, prixAchat: actuel.prixAchat };
};

/**
 * État après suppression d'un mouvement (on retire son effet du stock actuel,
 * même si d'autres mouvements ont eu lieu depuis).
 *  - entrée : stock − q et PMP recalculé sans cette entrée ; refusé si la
 *    marchandise a déjà été sortie (stock actuel < q).
 *  - sortie : stock + q.
 *  - ajustement : on retire l'écart inscrit dans son motif.
 */
export const annulerMouvement = (actuel: EtatStock, mvt: Mvt): EtatStock => {
  const q = mvt.quantite;
  if (mvt.type === "entree") {
    if (q > actuel.stock) {
      throw new ErreurStock(
        `Impossible d'annuler cette entrée : ${fmt(q)} entrés mais seulement ${fmt(actuel.stock)} encore en stock.`,
      );
    }
    const stock = actuel.stock - q;
    const pu = mvt.prixUnitaire ?? actuel.prixAchat;
    const prixAchat = stock > 0
      ? Math.max(0, (actuel.stock * actuel.prixAchat - q * pu) / stock)
      : actuel.prixAchat;
    return { stock, prixAchat };
  }
  if (mvt.type === "sortie") {
    return { stock: actuel.stock + q, prixAchat: actuel.prixAchat };
  }
  const ecart = ecartAjustement(mvt.motif);
  if (ecart === null) {
    throw new ErreurStock("Cet ajustement ne peut pas être annulé automatiquement : faites un nouvel ajustement.");
  }
  const stock = actuel.stock - ecart;
  if (stock < 0) {
    throw new ErreurStock("Impossible d'annuler cet ajustement : le stock deviendrait négatif.");
  }
  return { stock, prixAchat: actuel.prixAchat };
};
