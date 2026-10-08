// Ventes reliées au stock — module pur. Décision du 8 octobre 2026 : les
// articles d'une facture sortent du stock à sa validation (refus si le stock
// est insuffisant) ; l'annulation de la facture les remet en stock.
import type { Article, Facture, LignePrestation, MouvementStock } from "@/types/ebene";

type MouvementGenere = Omit<MouvementStock, "id">;

/** Quantités vendues par article (lignes reliées au stock seulement). */
export const quantitesParArticle = (lignes: LignePrestation[]): Map<number, number> => {
  const q = new Map<number, number>();
  for (const l of lignes) {
    if (!l.articleId || !(l.quantite && l.quantite > 0)) continue;
    q.set(l.articleId, (q.get(l.articleId) ?? 0) + l.quantite);
  }
  return q;
};

export interface ManqueStock {
  articleId: number;
  designation: string;
  demande: number;
  disponible: number;
}

/** Articles dont le stock ne couvre pas la facture. */
export const manquesStock = (
  lignes: LignePrestation[],
  articles: Pick<Article, "id" | "designation" | "stock">[],
): ManqueStock[] =>
  [...quantitesParArticle(lignes)].flatMap(([articleId, demande]) => {
    const a = articles.find((x) => x.id === articleId);
    const disponible = a?.stock ?? 0;
    return demande > disponible
      ? [{ articleId, designation: a?.designation ?? `Article ${articleId}`, demande, disponible }]
      : [];
  });

export const messageManques = (manques: ManqueStock[]): string =>
  "Stock insuffisant pour valider la facture : " +
  manques.map((m) => `${m.designation} (${m.disponible} disponible(s), ${m.demande} facturé(s))`).join(", ") +
  ". Enregistrez d'abord l'entrée en stock.";

/** Sorties de stock à la validation de la facture (une par article). */
export const sortiesFacture = (
  f: Pick<Facture, "id" | "numero" | "client" | "lignes" | "activiteId">,
  date: string,
): MouvementGenere[] =>
  [...quantitesParArticle(f.lignes)].map(([articleId, quantite]) => ({
    date,
    articleId,
    type: "sortie",
    quantite,
    motif: `Vente — facture ${f.numero} (${f.client})`,
    reference: f.numero,
    factureId: f.id,
  }));

/**
 * Retours en stock à l'annulation : ce qui est sorti pour la facture et pas
 * encore revenu, au coût moyen actuel de l'article (le PMP ne bouge pas).
 */
export const retoursFacture = (
  f: Pick<Facture, "id" | "numero">,
  mouvements: Pick<MouvementStock, "articleId" | "type" | "quantite" | "factureId">[],
  articles: Pick<Article, "id" | "prixAchat">[],
  date: string,
): MouvementGenere[] => {
  const net = new Map<number, number>();
  for (const m of mouvements) {
    if (m.factureId !== f.id) continue;
    const signe = m.type === "sortie" ? 1 : m.type === "entree" ? -1 : 0;
    net.set(m.articleId, (net.get(m.articleId) ?? 0) + signe * m.quantite);
  }
  return [...net].filter(([, q]) => q > 0).map(([articleId, quantite]) => ({
    date,
    articleId,
    type: "entree",
    quantite,
    prixUnitaire: articles.find((a) => a.id === articleId)?.prixAchat,
    motif: `Retour — annulation facture ${f.numero}`,
    reference: f.numero,
    factureId: f.id,
  }));
};
