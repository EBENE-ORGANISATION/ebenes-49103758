/**
 * mouvementsStock.repo.ts — Couche d'accès Supabase pour la table `mouvements_stock`.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import type { MouvementStock, TypeMouvementStock } from "@/types/ebene";

type MouvementRow = Tables<"mouvements_stock">;

const n = <T>(v: T | null | undefined): T | undefined =>
  v == null ? undefined : v;

export const toMouvement = (row: MouvementRow): MouvementStock => ({
  id: row.id,
  date: row.date,
  articleId: row.article_id,
  type: row.type as TypeMouvementStock,
  quantite: row.quantite,
  prixUnitaire: n(row.prix_unitaire),
  motif: n(row.motif),
  reference: n(row.reference),
  factureId: n(row.facture_id),
  transactionId: n(row.transaction_id),
  annee: row.annee,
  mois: row.mois,
});

export const fromMouvement = (
  m: Omit<MouvementStock, "id">,
  annee: number,
  mois: number,
  societeId: string,
): TablesInsert<"mouvements_stock"> => ({
  societe_id: societeId,
  annee,
  mois,
  date: m.date,
  article_id: m.articleId,
  type: m.type,
  quantite: m.quantite,
  prix_unitaire: m.prixUnitaire ?? null,
  motif: m.motif ?? null,
  reference: m.reference ?? null,
  facture_id: m.factureId ?? null,
  transaction_id: m.transactionId ?? null,
});

export const mouvementsStock = {
  /** Charge TOUS les mouvements de stock, groupés par moisKey ("YYYY-M"). */
  async listAll(societeId: string): Promise<Record<string, MouvementStock[]>> {
    const { data, error } = await supabase
      .from("mouvements_stock")
      .select("*")
      .eq("societe_id", societeId)
      .order("date", { ascending: false });
    if (error) throw error;
    const result: Record<string, MouvementStock[]> = {};
    for (const row of (data ?? []) as MouvementRow[]) {
      const key = `${row.annee}-${row.mois}`;
      if (!result[key]) result[key] = [];
      result[key].push(toMouvement(row));
    }
    return result;
  },

  async create(
    m: Omit<MouvementStock, "id">,
    annee: number,
    mois: number,
    societeId: string,
  ): Promise<MouvementStock> {
    const { data, error } = await supabase
      .from("mouvements_stock")
      .insert(fromMouvement(m, annee, mois, societeId))
      .select()
      .single();
    if (error) throw error;
    return toMouvement(data as MouvementRow);
  },

  async remove(id: number, societeId: string): Promise<void> {
    const { error } = await supabase
      .from("mouvements_stock")
      .delete()
      .eq("id", id)
      .eq("societe_id", societeId);
    if (error) throw error;
  },
};
