/**
 * articles.repo.ts — Couche d'accès Supabase pour la table `articles`.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import type { Article } from "@/types/ebene";

type ArticleRow = Tables<"articles">;

const n = <T>(v: T | null | undefined): T | undefined =>
  v == null ? undefined : v;

export const toArticle = (row: ArticleRow): Article => ({
  id: row.id,
  reference: row.reference,
  designation: row.designation,
  categorieId: n(row.categorie_id),
  unite: row.unite,
  prixAchat: row.prix_achat,
  prixVente: row.prix_vente,
  stock: row.stock,
  seuilAlerte: row.seuil_alerte,
  fournisseurId: n(row.fournisseur_id),
  emplacement: n(row.emplacement),
  description: n(row.description),
});

export const fromArticle = (
  a: Omit<Article, "id">,
  societeId: string,
): TablesInsert<"articles"> => ({
  societe_id: societeId,
  reference: a.reference,
  designation: a.designation,
  categorie_id: a.categorieId ?? null,
  unite: a.unite,
  prix_achat: a.prixAchat,
  prix_vente: a.prixVente,
  stock: a.stock,
  seuil_alerte: a.seuilAlerte,
  fournisseur_id: a.fournisseurId ?? null,
  emplacement: a.emplacement ?? null,
  description: a.description ?? null,
});

export const articles = {
  async list(societeId: string): Promise<Article[]> {
    const { data, error } = await supabase
      .from("articles")
      .select("*")
      .eq("societe_id", societeId)
      .order("designation", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(toArticle);
  },

  async create(a: Omit<Article, "id">, societeId: string): Promise<Article> {
    const { data, error } = await supabase
      .from("articles")
      .insert(fromArticle(a, societeId))
      .select()
      .single();
    if (error) throw error;
    return toArticle(data);
  },

  async update(
    id: number,
    patch: Partial<Omit<Article, "id">>,
    societeId: string,
  ): Promise<Article> {
    const dbPatch: Partial<TablesUpdate<"articles">> = {
      ...(patch.reference !== undefined && { reference: patch.reference }),
      ...(patch.designation !== undefined && { designation: patch.designation }),
      ...(patch.categorieId !== undefined && {
        categorie_id: patch.categorieId ?? null,
      }),
      ...(patch.unite !== undefined && { unite: patch.unite }),
      ...(patch.prixAchat !== undefined && { prix_achat: patch.prixAchat }),
      ...(patch.prixVente !== undefined && { prix_vente: patch.prixVente }),
      ...(patch.stock !== undefined && { stock: patch.stock }),
      ...(patch.seuilAlerte !== undefined && { seuil_alerte: patch.seuilAlerte }),
      ...(patch.fournisseurId !== undefined && {
        fournisseur_id: patch.fournisseurId ?? null,
      }),
      ...(patch.emplacement !== undefined && { emplacement: patch.emplacement ?? null }),
      ...(patch.description !== undefined && { description: patch.description ?? null }),
    };
    const { data, error } = await supabase
      .from("articles")
      .update(dbPatch)
      .eq("id", id)
      .eq("societe_id", societeId)
      .select()
      .single();
    if (error) throw error;
    return toArticle(data);
  },

  async remove(id: number, societeId: string): Promise<void> {
    const { error } = await supabase
      .from("articles")
      .delete()
      .eq("id", id)
      .eq("societe_id", societeId);
    if (error) throw error;
  },
};
