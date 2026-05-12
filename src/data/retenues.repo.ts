/**
 * retenues.repo.ts — Couche d'accès Supabase pour la table `retenues`.
 * Table créée par la migration 20260512_relational_migration.sql.
 *
 * Une retenue = montant mensuel sur salaire d'un employé (avances, saisies…).
 * Structure DB : UNIQUE (societe_id, employe_id, annee, mois).
 */
import { supabase } from "@/integrations/supabase/client";

// Type interne (table pas encore dans les types auto-générés)
interface RetenueRow {
  id: number;
  societe_id: string;
  employe_id: number;
  annee: number;
  mois: number;
  montant: number;
}

export const retenues = {
  /**
   * Charge TOUTES les retenues d'une société, groupées par moisKey ("YYYY-M")
   * puis par employeId.
   * Retourne Record<moisKey, Record<employeId, montant>>.
   */
  async listAll(
    societeId: string,
  ): Promise<Record<string, Record<number, number>>> {
    const { data, error } = await supabase
      .from("retenues")
      .select("*")
      .eq("societe_id", societeId);
    if (error) throw error;
    const result: Record<string, Record<number, number>> = {};
    for (const row of (data ?? []) as RetenueRow[]) {
      const key = `${row.annee}-${row.mois}`;
      if (!result[key]) result[key] = {};
      result[key][row.employe_id] = row.montant;
    }
    return result;
  },

  /**
   * Upsert la retenue d'un employé pour un mois donné.
   * Si montant === 0, supprime la ligne (pas de ligne inutile en DB).
   */
  async upsert(
    employeId: number,
    annee: number,
    mois: number,
    montant: number,
    societeId: string,
  ): Promise<void> {
    if (montant === 0) {
      const { error } = await supabase
        .from("retenues")
        .delete()
        .eq("employe_id", employeId)
        .eq("annee", annee)
        .eq("mois", mois)
        .eq("societe_id", societeId);
      if (error) throw error;
      return;
    }
    const { error } = await supabase
      .from("retenues")
      .upsert(
        {
          societe_id: societeId,
          employe_id: employeId,
          annee,
          mois,
          montant,
        },
        { onConflict: "societe_id,employe_id,annee,mois" },
      );
    if (error) throw error;
  },
};
