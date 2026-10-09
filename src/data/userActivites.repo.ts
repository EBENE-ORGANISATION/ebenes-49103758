/**
 * userActivites.repo.ts — Activités autorisées par utilisateur (table
 * `user_activites`). Aucune ligne pour un utilisateur dans une société :
 * accès à toutes les activités. La restriction est appliquée par la base
 * (règles restrictives) ; l'application s'y aligne.
 */
import { supabase } from "@/integrations/supabase/client";

type Ligne = { user_id: string; activite_id: string };

export const userActivitesRepo = {
  /** Activités autorisées de chaque utilisateur de la société (absent : toutes). */
  async listParSociete(societeId: string): Promise<Record<string, string[]>> {
    const { data, error } = await supabase
      .from("user_activites" as never)
      .select("user_id, activite_id")
      .eq("societe_id", societeId);
    if (error) throw error;
    const out: Record<string, string[]> = {};
    for (const r of (data ?? []) as Ligne[]) (out[r.user_id] ??= []).push(r.activite_id);
    return out;
  },

  /** Remplace les activités autorisées d'un utilisateur ([] : toutes). */
  async definir(userId: string, societeId: string, activiteIds: string[]): Promise<void> {
    const { error: e1 } = await supabase
      .from("user_activites" as never)
      .delete()
      .eq("user_id", userId)
      .eq("societe_id", societeId);
    if (e1) throw e1;
    if (activiteIds.length === 0) return;
    const { error: e2 } = await supabase
      .from("user_activites" as never)
      .insert(activiteIds.map((activite_id) => ({ user_id: userId, societe_id: societeId, activite_id })) as never);
    if (e2) throw e2;
  },
};
