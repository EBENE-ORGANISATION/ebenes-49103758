/**
 * articles.repo.ts — Couche d'accès Supabase pour la table `articles`.
 */
import { supabase } from "@/integrations/supabase/client";
import { softRemove } from "@/lib/softDelete";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import type { Article, NatureArticle } from "@/types/ebene";

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
  nature: (row.nature ?? "marchandise") as NatureArticle,
  stock: row.stock,
  seuilAlerte: row.seuil_alerte,
  fournisseurId: n(row.fournisseur_id),
  emplacement: n(row.emplacement),
  description: n(row.description),
  activiteId: n(row.activite_id),
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
  nature: a.nature ?? "marchandise",
  stock: a.stock,
  seuil_alerte: a.seuilAlerte,
  fournisseur_id: a.fournisseurId ?? null,
  emplacement: a.emplacement ?? null,
  description: a.description ?? null,
  activite_id: a.activiteId ?? null,
});

export const articles = {
  async list(societeId: string): Promise<Article[]> {
    const { data, error } = await supabase
      .from("articles")
      .select("*")
      .eq("societe_id", societeId)
      .is("deleted_at" as never, null)
      .order("designation", { ascending: true });
    if (error) {
      if (error.code === "42703") {
        const fb = await supabase.from("articles").select("*")
          .eq("societe_id", societeId).order("designation");
        if (fb.error) throw fb.error;
        return (fb.data ?? []).map(toArticle);
      }
      throw error;
    }
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
      ...(patch.nature !== undefined && { nature: patch.nature }),
      ...(patch.stock !== undefined && { stock: patch.stock }),
      ...(patch.seuilAlerte !== undefined && { seuil_alerte: patch.seuilAlerte }),
      ...(patch.fournisseurId !== undefined && {
        fournisseur_id: patch.fournisseurId ?? null,
      }),
      ...(patch.emplacement !== undefined && { emplacement: patch.emplacement ?? null }),
      ...(patch.description !== undefined && { description: patch.description ?? null }),
      ...(patch.activiteId !== undefined && { activite_id: patch.activiteId ?? null }),
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

  /**
   * Modifie stock et PMP d'un article de façon sûre à plusieurs utilisateurs :
   * relit la valeur en base, applique `calcul`, puis n'écrit que si la ligne
   * n'a pas changé entre-temps (sinon relit et réessaie). `calcul` peut lever
   * une erreur métier (ex. stock insuffisant) : elle est propagée telle quelle.
   */
  async ajusterStock(
    id: number,
    societeId: string,
    calcul: (actuel: { stock: number; prixAchat: number }) => { stock: number; prixAchat: number },
  ): Promise<Article> {
    for (let essai = 0; essai < 5; essai++) {
      const { data: row, error: readErr } = await supabase
        .from("articles")
        .select("stock, prix_achat")
        .eq("id", id)
        .eq("societe_id", societeId)
        .single();
      if (readErr) throw readErr;

      const suivant = calcul({ stock: row.stock, prixAchat: row.prix_achat });
      const { data, error } = await supabase
        .from("articles")
        // PMP arrondi à 4 décimales : valeur stable pour la comparaison suivante
        .update({ stock: suivant.stock, prix_achat: Math.round(suivant.prixAchat * 10_000) / 10_000 })
        .eq("id", id)
        .eq("societe_id", societeId)
        .eq("stock", row.stock)
        .eq("prix_achat", row.prix_achat)
        .select();
      if (error) throw error;
      if (data && data.length === 1) return toArticle(data[0]);
      // Modifié par quelqu'un d'autre entre la lecture et l'écriture → on réessaie
    }
    throw new Error("Stock modifié simultanément, veuillez réessayer.");
  },

  async remove(id: number, societeId: string): Promise<void> {
    await softRemove("articles", id, societeId);
  },

  async restore(id: number, societeId: string): Promise<void> {
    const { error } = await supabase
      .from("articles")
      .update({ deleted_at: null } as never)
      .eq("id", id)
      .eq("societe_id", societeId);
    if (error) throw error;
  },

  async purge(id: number, societeId: string): Promise<void> {
    const { error } = await supabase
      .from("articles")
      .delete()
      .eq("id", id)
      .eq("societe_id", societeId);
    if (error) throw error;
  },
};
