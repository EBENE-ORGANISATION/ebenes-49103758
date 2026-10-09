// Lignes d'une facture ou d'un devis en saisie — conversions, module pur.
import type { LignePrestation } from "@/types/ebene";

/** Ligne en cours de saisie (valeurs texte des champs). */
export type LigneSaisie = {
  description: string;
  montant: string;
  articleId?: number | null;
  quantite?: string;
  prixUnitaire?: string;
};

export const LIGNE_VIDE: LigneSaisie = { description: "", montant: "" };

/** Lignes saisies → lignes enregistrées (lignes vides écartées). */
export const lignesEnregistrees = (lignes: LigneSaisie[]): LignePrestation[] =>
  lignes
    .map((l) => ({
      description: l.description.trim(),
      montant: parseFloat(l.montant) || 0,
      ...(l.articleId
        ? { articleId: l.articleId, quantite: parseFloat(l.quantite || "0") || 0, prixUnitaire: parseFloat(l.prixUnitaire || "0") || 0 }
        : {}),
    }))
    .filter((l) => l.description && l.montant > 0);

/** Lignes enregistrées → lignes de saisie (modification d'une pièce). */
export const lignesEnSaisie = (lignes: LignePrestation[] | undefined): LigneSaisie[] =>
  (lignes && lignes.length > 0 ? lignes : [{ description: "", montant: 0 }]).map((l) => ({
    description: l.description,
    montant: String(l.montant),
    articleId: l.articleId ?? null,
    quantite: l.quantite != null ? String(l.quantite) : undefined,
    prixUnitaire: l.prixUnitaire != null ? String(l.prixUnitaire) : undefined,
  }));
