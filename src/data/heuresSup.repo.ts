/**
 * heuresSup.repo.ts — Couche d'accès Supabase pour la table `heures_sup`.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import type { HeuresSup, StatutValidation } from "@/types/ebene";

type HeuresSupRow = Tables<"heures_sup">;

const n = <T>(v: T | null | undefined): T | undefined =>
  v == null ? undefined : v;

export const toHeuresSup = (row: HeuresSupRow): HeuresSup => ({
  _dbId: row.id,
  employeId: row.employe_id,
  annee: row.annee,
  mois: row.mois,
  jourSemaine: row.jour_semaine ?? 0,
  jourSup: row.jour_sup ?? 0,
  dimancheFerie: row.dimanche_ferie ?? 0,
  nuitSemaine: row.nuit_semaine ?? 0,
  nuitDimancheFerie: row.nuit_dimanche_ferie ?? 0,
  statutValidation: n(row.statut_validation) as StatutValidation | undefined,
  motifRejet: n(row.motif_rejet),
});

export const fromHeuresSup = (
  hs: HeuresSup,
  employeId: number,
  annee: number,
  mois: number,
  societeId: string,
): TablesInsert<"heures_sup"> => ({
  societe_id: societeId,
  employe_id: employeId,
  annee,
  mois,
  jour_semaine: hs.jourSemaine,
  jour_sup: hs.jourSup,
  dimanche_ferie: hs.dimancheFerie,
  nuit_semaine: hs.nuitSemaine,
  nuit_dimanche_ferie: hs.nuitDimancheFerie,
  statut_validation: hs.statutValidation ?? "en_validation",
  motif_rejet: hs.motifRejet ?? null,
});

export const heuresSup = {
  /**
   * Charge TOUTES les heures sup d'une société, groupées par moisKey puis employeId.
   * Utilisé par le hook TQ pour couvrir la navigation multi-mois.
   */
  async listAll(
    societeId: string,
  ): Promise<Record<string, Record<number, HeuresSup>>> {
    const { data, error } = await supabase
      .from("heures_sup")
      .select("*")
      .eq("societe_id", societeId);
    if (error) throw error;
    const result: Record<string, Record<number, HeuresSup>> = {};
    for (const row of (data ?? []) as HeuresSupRow[]) {
      const key = `${row.annee}-${row.mois}`;
      if (!result[key]) result[key] = {};
      result[key][row.employe_id] = toHeuresSup(row);
    }
    return result;
  },

  /**
   * Charge les heures sup d'une société pour un mois, indexées par employeId.
   * Correspond à la structure `Record<number, HeuresSup>` de MoisData.
   */
  async listByMois(
    societeId: string,
    annee: number,
    mois: number,
  ): Promise<Record<number, HeuresSup>> {
    const { data, error } = await supabase
      .from("heures_sup")
      .select("*")
      .eq("societe_id", societeId)
      .eq("annee", annee)
      .eq("mois", mois);
    if (error) throw error;
    const result: Record<number, HeuresSup> = {};
    for (const row of data ?? []) {
      result[row.employe_id] = toHeuresSup(row);
    }
    return result;
  },

  /**
   * Upsert les heures sup d'un employé pour un mois donné.
   * Crée la ligne si elle n'existe pas, met à jour sinon.
   */
  async upsert(
    hs: HeuresSup,
    employeId: number,
    annee: number,
    mois: number,
    societeId: string,
  ): Promise<void> {
    const { error } = await supabase
      .from("heures_sup")
      .upsert(fromHeuresSup(hs, employeId, annee, mois, societeId), {
        onConflict: "societe_id,employe_id,annee,mois",
      });
    if (error) throw error;
  },

  async updateValidation(
    id: number,
    statutValidation: StatutValidation,
    motifRejet: string | null,
    societeId: string,
  ): Promise<void> {
    const { error } = await supabase
      .from("heures_sup")
      .update({ statut_validation: statutValidation, motif_rejet: motifRejet })
      .eq("id", id)
      .eq("societe_id", societeId);
    if (error) throw error;
  },

  /** Met à jour le statut de validation par (employeId, annee, mois) sans avoir besoin du row id. */
  async updateValidationByEmploye(
    employeId: number,
    annee: number,
    mois: number,
    statutValidation: StatutValidation,
    motifRejet: string | null,
    societeId: string,
  ): Promise<void> {
    const { error } = await supabase
      .from("heures_sup")
      .update({
        statut_validation: statutValidation,
        motif_rejet: motifRejet,
      })
      .eq("employe_id", employeId)
      .eq("annee", annee)
      .eq("mois", mois)
      .eq("societe_id", societeId);
    if (error) throw error;
  },

  async removeByEmployeAndMois(
    employeId: number,
    annee: number,
    mois: number,
    societeId: string,
  ): Promise<void> {
    const { error } = await supabase
      .from("heures_sup")
      .delete()
      .eq("employe_id", employeId)
      .eq("annee", annee)
      .eq("mois", mois)
      .eq("societe_id", societeId);
    if (error) throw error;
  },
};
