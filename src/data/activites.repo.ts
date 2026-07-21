/**
 * activites.repo.ts — Couche d'accès Supabase pour la table `activites`.
 *
 * Une activité est un compartiment métier au sein d'UNE société (Hôtel, Bar,
 * Commerce…). Les entités finances/stock/immo portent une colonne `activite_id`
 * qui référence cette table.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import type { Activite } from "@/types/ebene";

type ActiviteRow = Tables<"activites">;

export const toActivite = (row: ActiviteRow): Activite => ({
  id: row.id,
  nom: row.nom,
  couleur: row.couleur,
  actif: row.actif,
});

export const activitesRepo = {
  /** Liste les activités d'une société, actives et inactives, triées par nom. */
  async list(societeId: string): Promise<Activite[]> {
    const { data, error } = await supabase
      .from("activites")
      .select("*")
      .eq("societe_id", societeId)
      .order("nom", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(toActivite);
  },

  async create(
    societeId: string,
    input: { nom: string; couleur?: string },
  ): Promise<Activite> {
    const payload: TablesInsert<"activites"> = {
      societe_id: societeId,
      nom: input.nom,
      ...(input.couleur ? { couleur: input.couleur } : {}),
    };
    const { data, error } = await supabase
      .from("activites")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return toActivite(data as ActiviteRow);
  },

  async update(
    id: string,
    societeId: string,
    patch: Partial<Pick<Activite, "nom" | "couleur" | "actif">>,
  ): Promise<void> {
    const dbPatch: TablesUpdate<"activites"> = {
      ...(patch.nom !== undefined && { nom: patch.nom }),
      ...(patch.couleur !== undefined && { couleur: patch.couleur }),
      ...(patch.actif !== undefined && { actif: patch.actif }),
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from("activites")
      .update(dbPatch)
      .eq("id", id)
      .eq("societe_id", societeId);
    if (error) throw error;
  },

  /**
   * Supprime une activité. Les entités rattachées voient leur `activite_id`
   * remis à NULL (ON DELETE SET NULL) — aucune donnée métier n'est perdue.
   */
  async remove(id: string, societeId: string): Promise<void> {
    const { error } = await supabase
      .from("activites")
      .delete()
      .eq("id", id)
      .eq("societe_id", societeId);
    if (error) throw error;
  },
};
