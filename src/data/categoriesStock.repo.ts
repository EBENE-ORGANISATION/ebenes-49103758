/**
 * categoriesStock.repo.ts — Couche d'accès Supabase pour `categories_stock`.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import type { CategorieArticle } from "@/types/ebene";

type CategorieRow = Tables<"categories_stock">;

export const toCategorieArticle = (row: CategorieRow): CategorieArticle => ({
  id: row.id,
  nom: row.nom,
});

export const fromCategorieArticle = (
  c: Omit<CategorieArticle, "id">,
  societeId: string,
): TablesInsert<"categories_stock"> => ({
  societe_id: societeId,
  nom: c.nom,
});

export const categoriesStock = {
  async list(societeId: string): Promise<CategorieArticle[]> {
    const { data, error } = await supabase
      .from("categories_stock")
      .select("*")
      .eq("societe_id", societeId)
      .order("nom", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(toCategorieArticle);
  },

  async create(
    c: Omit<CategorieArticle, "id">,
    societeId: string,
  ): Promise<CategorieArticle> {
    const { data, error } = await supabase
      .from("categories_stock")
      .insert(fromCategorieArticle(c, societeId))
      .select()
      .single();
    if (error) throw error;
    return toCategorieArticle(data);
  },

  async remove(id: number, societeId: string): Promise<void> {
    const { error } = await supabase
      .from("categories_stock")
      .delete()
      .eq("id", id)
      .eq("societe_id", societeId);
    if (error) throw error;
  },
};
